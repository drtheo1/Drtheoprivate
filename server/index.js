// Small dependency free server: serves the built app from dist/ and proxies the
// public NHTSA APIs plus an optional paid vehicle history provider under /api.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHistory } from "./history.js";

const PORT = Number(process.env.PORT) || 8787;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles";
const NHTSA = "https://api.nhtsa.gov";
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map();

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

function vehicleParams(q) {
  const make = q.get("make")?.trim();
  const model = q.get("model")?.trim();
  const year = q.get("year")?.trim();
  if (!make || !model || !/^\d{4}$/.test(year ?? "")) {
    throw Object.assign(new Error("make, model and a four digit year are required"), { status: 400 });
  }
  return { make: encodeURIComponent(make), model: encodeURIComponent(model), year };
}

async function handleApi(url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", route, arg]
  const route = parts[1];
  const q = url.searchParams;

  if (route === "decode" || route === "history") {
    const vin = (parts[2] ?? "").toUpperCase();
    if (!VIN_RE.test(vin)) throw Object.assign(new Error("Invalid VIN"), { status: 400 });
    if (route === "history") return fetchHistory(vin);
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
  throw Object.assign(new Error("Not found"), { status: 404 });
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
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    try {
      send(res, 200, await handleApi(url));
    } catch (err) {
      send(res, err.status ?? 500, { error: err.message ?? "Server error" });
    }
  })
  .listen(PORT, () => console.log(`Ghana Vehicle Duty Checker on http://localhost:${PORT}`));
