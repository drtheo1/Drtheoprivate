// Small dependency free server: serves the built app from dist/, proxies the public
// NHTSA APIs, stores the weekly duty rates and pulls paid vehicle history reports.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapReport, providerName, pullReport } from "./history.js";
import { handleWebhook, hasAccess, prices, startCheckout, verifyCheckout } from "./payments.js";
import { loadHistory, loadRates, pullsToday, recordPull, saveHistory, saveRates } from "./store.js";
import { calculateDuty } from "../src/lib/duty.ts";
import { DEFAULT_RATES, normalizeRates } from "../src/config/ghanaRates.ts";

const PORT = Number(process.env.PORT) || 8787;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles";
const NHTSA = "https://api.nhtsa.gov";
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map();
const HISTORY_DAILY_LIMIT = Number(process.env.HISTORY_DAILY_LIMIT) || 50;
const RATE_KEYS = new Set([
  "passengerDutyBands", "categoryDuty", "electricDuty", "ecowasLevy", "auLevy", "eximLevy",
  "specialImportLevy", "networkCharge", "vat", "nhil", "getfund", "depreciation", "overagePenalty",
  "maxImportAgeYears", "ageLimitEffective",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

async function getJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const res = await fetch(url, { headers: { accept: "application/json" } }).catch(() => {
    throw Object.assign(new Error("Could not reach NHTSA. Try again shortly."), { status: 502 });
  });
  if (!res.ok) throw Object.assign(new Error(`Upstream returned ${res.status}`), { status: 502 });
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

function secretMatches(given, expected) {
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readRaw(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw httpError(413, "Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  try {
    return JSON.parse((await readRaw(req)).toString("utf8") || "{}");
  } catch (err) {
    if (err.status) throw err;
    throw httpError(400, "Body must be JSON");
  }
}

const isAdmin = (req) => secretMatches(req.headers.authorization?.replace(/^Bearer /, ""), process.env.ADMIN_TOKEN);

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0] ?? "http";
  return `${proto}://${req.headers.host}`;
}

async function currentRates() {
  const doc = await loadRates();
  return { doc, rates: normalizeRates(doc?.rates ?? DEFAULT_RATES) };
}

/** Accepts only numbers (null for open ended band limits) and the effective date string. */
function validateRates(rates) {
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) throw httpError(400, "rates must be an object");
  const walk = (value, key) => {
    if (key === "ageLimitEffective") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, "ageLimitEffective must be yyyy-mm-dd");
    } else if (value === null) {
      if (key !== "maxCc" && key !== "maxYears") throw httpError(400, `${key} cannot be empty`);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) throw httpError(400, `${key} must be a positive number`);
      if (key !== "maxCc" && key !== "maxYears" && key !== "maxImportAgeYears" && value > 5)
        throw httpError(400, `${key} looks like a percentage; send rates as fractions (0.15 for 15%)`);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, Array.isArray(value) ? key : k);
    } else {
      throw httpError(400, `${key} has an invalid value`);
    }
  };
  for (const key of Object.keys(rates)) if (!RATE_KEYS.has(key)) throw httpError(400, `Unknown rate ${key}`);
  walk(rates, "rates");
}

async function handleRates(req) {
  if (req.method === "GET") {
    const { doc, rates } = await currentRates();
    // The full table is what customers pay to have applied, so only the admin sees it.
    if (req.headers.authorization) {
      if (!isAdmin(req)) throw httpError(401, "Wrong admin password");
      return doc ?? { rates: null };
    }
    return {
      exchangeRate: doc?.exchangeRate ?? 0,
      note: doc?.note ?? "",
      updatedAt: doc?.updatedAt ?? "",
      maxImportAgeYears: rates.maxImportAgeYears,
      ageLimitEffective: rates.ageLimitEffective,
    };
  }
  if (req.method !== "PUT") throw httpError(405, "Method not allowed");
  if (!process.env.ADMIN_TOKEN) throw httpError(503, "Set ADMIN_TOKEN on the server to enable rate updates");
  if (!isAdmin(req)) throw httpError(401, "Wrong admin password");
  const body = await readBody(req);
  validateRates(body.rates);
  if (!(Number(body.exchangeRate) > 0)) throw httpError(400, "exchangeRate must be above 0");
  const doc = {
    rates: body.rates,
    exchangeRate: Number(body.exchangeRate),
    note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
    updatedAt: new Date().toISOString(),
  };
  await saveRates(doc);
  return doc;
}

async function handleHistory(req, vin) {
  const provider = providerName();
  const cached = await loadHistory(vin);
  const paid = await hasAccess(req.headers["x-access-token"], vin, "history");
  const view = (entry) => ({
    configured: Boolean(provider),
    paid,
    report: entry && paid ? { ...mapReport(entry.provider, entry.raw), pulledAt: entry.pulledAt } : null,
  });
  if (req.method === "GET") return view(cached);
  if (req.method !== "POST") throw httpError(405, "Method not allowed");
  if (!provider) throw httpError(503, "No history provider is configured");
  if (!paid) throw httpError(402, "Buy the history report for this VIN first");
  // A report already pulled for this VIN is reused, so the provider is only charged once.
  if (cached) return view(cached);

  if ((await pullsToday()) >= HISTORY_DAILY_LIMIT) {
    throw httpError(429, "The report service is busy. Your purchase is saved; try again in a few hours.");
  }
  const raw = await pullReport(provider, vin);
  await recordPull();
  const entry = { provider, vin, pulledAt: new Date().toISOString(), raw };
  await saveHistory(vin, entry);
  return view(entry);
}

const CATEGORIES = new Set(["passenger", "pickup", "bus", "truck", "motorcycle"]);
const FUELS = new Set(["petrol", "diesel", "hybrid", "electric"]);

function validateDutyInput(i) {
  if (!i || typeof i !== "object") throw httpError(400, "input is required");
  const num = (k, max) => {
    const n = Number(i[k] ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > max) throw httpError(400, `${k} is out of range`);
    return n;
  };
  if (!CATEGORIES.has(i.category)) throw httpError(400, "Unknown vehicle category");
  if (!FUELS.has(i.fuel)) throw httpError(400, "Unknown fuel");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.arrivalDate ?? "")) throw httpError(400, "arrivalDate must be yyyy-mm-dd");
  const year = num("manufactureYear", 2100);
  if (year < 1950) throw httpError(400, "manufactureYear is out of range");
  const month = i.manufactureMonth == null ? undefined : num("manufactureMonth", 12) || undefined;
  return {
    category: i.category,
    fuel: i.fuel,
    engineCc: num("engineCc", 20000),
    manufactureYear: year,
    manufactureMonth: month,
    arrivalDate: i.arrivalDate,
    valuationMode: i.valuationMode === "hdv" ? "hdv" : "invoice",
    fobUsd: num("fobUsd", 1e7),
    hdvUsd: num("hdvUsd", 1e7),
    freightUsd: num("freightUsd", 1e6),
    insuranceUsd: num("insuranceUsd", 1e6),
    exchangeRate: num("exchangeRate", 1e4),
  };
}

function vehicleParams(q) {
  const make = q.get("make")?.trim();
  const model = q.get("model")?.trim();
  const year = q.get("year")?.trim();
  if (!make || !model || !/^\d{4}$/.test(year ?? "")) {
    throw httpError(400, "make, model and a four digit year are required");
  }
  return { make: encodeURIComponent(make), model: encodeURIComponent(model), year };
}

async function handleApi(req, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", route, arg]
  const route = parts[1];
  const q = url.searchParams;

  if (route === "rates") return handleRates(req);
  if (route === "prices") return prices();
  if (route === "paystack" && parts[2] === "webhook" && req.method === "POST") {
    return handleWebhook(await readRaw(req), req.headers["x-paystack-signature"]);
  }
  if (route === "checkout" && req.method === "POST") {
    const body = await readBody(req);
    if (parts[2] === "verify") return verifyCheckout(body.reference);
    const vin = String(body.vin ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) throw httpError(400, "Invalid VIN");
    return startCheckout({ vin, product: body.product, email: body.email }, appUrl(req));
  }
  if (route === "duty" && req.method === "POST") {
    const body = await readBody(req);
    const vin = String(body.vin ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) throw httpError(400, "Invalid VIN");
    if (!(await hasAccess(req.headers["x-access-token"], vin, "duty"))) throw httpError(402, "Buy the duty estimate for this VIN first");
    const { doc, rates } = await currentRates();
    return { result: calculateDuty(validateDutyInput(body.input), rates), ratesUpdatedAt: doc?.updatedAt ?? "" };
  }
  if (route === "decode" || route === "history") {
    const vin = (parts[2] ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) throw httpError(400, "Invalid VIN");
    if (route === "history") return handleHistory(req, vin);
    if (req.method !== "GET") throw httpError(405, "Method not allowed");
    const data = await getJson(`${VPIC}/DecodeVinValuesExtended/${vin}?format=json`);
    return data.Results?.[0] ?? {};
  }
  if (route === "recalls") {
    const { make, model, year } = vehicleParams(q);
    return getJson(`${NHTSA}/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`);
  }
  if (route === "complaints") {
    const { make, model, year } = vehicleParams(q);
    return getJson(`${NHTSA}/complaints/complaintsByVehicle?make=${make}&model=${model}&modelYear=${year}`);
  }
  if (route === "ratings") {
    const { make, model, year } = vehicleParams(q);
    const list = await getJson(`${NHTSA}/SafetyRatings/modelyear/${year}/make/${make}/model/${model}?format=json`);
    const variants = (list.Results ?? []).slice(0, 4);
    const details = await Promise.all(
      variants.map((v) => getJson(`${NHTSA}/SafetyRatings/VehicleId/${v.VehicleId}?format=json`).then((d) => d.Results?.[0]).catch(() => null)),
    );
    return { results: details.filter(Boolean) };
  }
  throw httpError(404, "Not found");
}

async function serveStatic(url, res) {
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) file = path.join(DIST, "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(DIST, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Build the app first with npm run build");
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return serveStatic(url, res);
    try {
      send(res, 200, await handleApi(req, url));
    } catch (err) {
      if (!err.status) console.error(err);
      send(res, err.status ?? 500, { error: err.status ? err.message : "Server error" });
    }
  })
  .listen(PORT, () => console.log(`Ghana Vehicle Duty Checker on http://localhost:${PORT}`));
