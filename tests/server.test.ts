import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const VIN = "1HGCM82633A004352";
const OTHER_VIN = "2HGFC2F59JH000001";
const PAYSTACK_KEY = "sk_test_stub";
let server: ChildProcess;
let stub: http.Server;
let historyCalls = 0;
let dataDir: string;
/** reference -> { amount, status } as the fake Paystack knows it */
const transactions = new Map<string, { amount: number; status: string }>();
let lastInit: Record<string, unknown> = {};

beforeAll(async () => {
  stub = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    const url = new URL(req.url ?? "/", "http://stub");
    if (url.pathname === "/history") {
      historyCalls++;
      return res.end(JSON.stringify({ provider: "Stub", titleBrands: [{ brand: "Salvage" }], events: [] }));
    }
    if (req.headers.authorization !== `Bearer ${PAYSTACK_KEY}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ status: false, message: "Invalid key" }));
    }
    if (url.pathname === "/transaction/initialize") {
      let raw = "";
      for await (const c of req) raw += c;
      lastInit = JSON.parse(raw);
      transactions.set(lastInit.reference as string, { amount: lastInit.amount as number, status: "abandoned" });
      return res.end(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.stub/${lastInit.reference}`, reference: lastInit.reference } }));
    }
    const m = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
    if (m) {
      const tx = transactions.get(m[1]);
      return res.end(JSON.stringify({ status: true, data: { reference: m[1], status: tx?.status ?? "failed", amount: tx?.amount ?? 0, currency: "GHS", id: 1 } }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  const stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  dataDir = mkdtempSync(path.join(tmpdir(), "gvdc-"));
  server = spawn(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ADMIN_TOKEN: "secret",
      SESSION_SECRET: "test-session",
      PAYSTACK_SECRET_KEY: PAYSTACK_KEY,
      PAYSTACK_API_BASE: stubUrl,
      APP_URL: "https://app.example",
      PRICE_DUTY_GHS: "20",
      PRICE_HISTORY_GHS: "60",
      PRICE_BUNDLE_GHS: "70",
      HISTORY_PROVIDER: "generic",
      HISTORY_API_URL: `${stubUrl}/history?vin={vin}`,
      HISTORY_DAILY_LIMIT: "5",
      FREE_ACCESS: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/prices`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

afterAll(() => {
  server?.kill();
  stub?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${p}`, { method: "POST", headers, body: JSON.stringify(body) });
const put = (body: unknown, token = "secret") =>
  fetch(`${BASE}/api/rates`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

const dutyInput = {
  category: "passenger", fuel: "petrol", engineCc: 2000, manufactureYear: 2021, manufactureMonth: 6,
  arrivalDate: "2026-11-01", valuationMode: "invoice", fobUsd: 10000, hdvUsd: 0, freightUsd: 1500, insuranceUsd: 0, exchangeRate: 12,
};

async function buy(vin: string, product: string) {
  const res = await post("/api/checkout", { vin, product, email: "buyer@example.com" });
  expect(res.status).toBe(200);
  const { reference, authorizationUrl } = await res.json();
  expect(authorizationUrl).toContain(reference);
  return reference as string;
}

describe("rates API", () => {
  it("hides the full rate table from the public", async () => {
    const pub = await (await fetch(`${BASE}/api/rates`)).json();
    expect(pub).toEqual({ exchangeRate: 0, note: "", updatedAt: "", maxImportAgeYears: 10, ageLimitEffective: "2026-10-01" });
    expect((await fetch(`${BASE}/api/rates`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });
  it("rejects a wrong password and bad values", async () => {
    expect((await put({ rates: { vat: 0.15 }, exchangeRate: 11 }, "nope")).status).toBe(401);
    expect((await put({ rates: { vat: 15 }, exchangeRate: 11 })).status).toBe(400);
    expect((await put({ rates: { bogus: 0.1 }, exchangeRate: 11 })).status).toBe(400);
    expect((await put({ rates: { vat: 0.15 }, exchangeRate: 0 })).status).toBe(400);
  });
  it("saves the weekly rates and shows the admin the full table", async () => {
    expect((await put({ rates: { vat: 0.15, passengerDutyBands: [{ maxCc: 1000, rate: 0.05 }, { maxCc: null, rate: 0.1 }] }, exchangeRate: 11.25, note: "Week 42" })).status).toBe(200);
    const pub = await (await fetch(`${BASE}/api/rates`)).json();
    expect(pub).toMatchObject({ exchangeRate: 11.25, note: "Week 42" });
    expect(pub.rates).toBeUndefined();
    const full = await (await fetch(`${BASE}/api/rates`, { headers: { authorization: "Bearer secret" } })).json();
    expect(full.rates.vat).toBe(0.15);
  });
});

describe("payments", () => {
  it("lists prices", async () => {
    expect(await (await fetch(`${BASE}/api/prices`)).json()).toMatchObject({ enabled: true, currency: "GHS", duty: 20, history: 60, bundle: 70 });
  });

  it("refuses the duty estimate and history report until paid", async () => {
    expect((await post("/api/duty", { vin: VIN, input: dutyInput })).status).toBe(402);
    expect((await post(`/api/history/${VIN}`, {})).status).toBe(402);
    expect((await post("/api/checkout", { vin: VIN, product: "duty", email: "bad" })).status).toBe(400);
  });

  it("charges the price in pesewas and only unlocks after Paystack confirms", async () => {
    const ref = await buy(VIN, "duty");
    expect(lastInit).toMatchObject({ amount: 2000, currency: "GHS", callback_url: `https://app.example/?vin=${VIN}` });
    expect((await post("/api/checkout/verify", { reference: ref })).status).toBe(402);

    transactions.get(ref)!.status = "success";
    const { token, grants } = await (await post("/api/checkout/verify", { reference: ref })).json();
    expect(grants).toEqual(["duty"]);

    const duty = await post("/api/duty", { vin: VIN, input: dutyInput }, { "x-access-token": token });
    expect(duty.status).toBe(200);
    const { result } = await duty.json();
    expect(result.cifUsd).toBe(11615);
    // The duty purchase does not cover another VIN or the history report.
    expect((await post("/api/duty", { vin: OTHER_VIN, input: dutyInput }, { "x-access-token": token })).status).toBe(402);
    expect((await post(`/api/history/${VIN}`, {}, { "x-access-token": token })).status).toBe(402);
    // A forged token is refused.
    expect((await post("/api/duty", { vin: VIN, input: dutyInput }, { "x-access-token": `${ref}.forged` })).status).toBe(402);
  });

  it("rejects underpayment", async () => {
    const ref = await buy(OTHER_VIN, "history");
    transactions.set(ref, { amount: 100, status: "success" });
    expect((await post("/api/checkout/verify", { reference: ref })).status).toBe(402);
  });

  it("confirms payment from a signed webhook", async () => {
    const ref = await buy(VIN, "bundle");
    const body = JSON.stringify({ event: "charge.success", data: { reference: ref, status: "success", amount: 7000, currency: "GHS", id: 9 } });
    const bad = await fetch(`${BASE}/api/paystack/webhook`, { method: "POST", headers: { "x-paystack-signature": "0".repeat(128) }, body });
    expect(bad.status).toBe(401);
    const sig = createHmac("sha512", PAYSTACK_KEY).update(body).digest("hex");
    expect((await fetch(`${BASE}/api/paystack/webhook`, { method: "POST", headers: { "x-paystack-signature": sig }, body })).status).toBe(200);

    // Paystack itself still says abandoned, so this proves the webhook did the confirming.
    const { token, grants } = await (await post("/api/checkout/verify", { reference: ref })).json();
    expect(grants).toEqual(["duty", "history"]);

    const status = await (await fetch(`${BASE}/api/history/${VIN}`, { headers: { "x-access-token": token } })).json();
    expect(status).toEqual({ configured: true, paid: true, report: null });
    const first = await (await post(`/api/history/${VIN}`, {}, { "x-access-token": token })).json();
    expect(first.report.titleBrands[0].brand).toBe("Salvage");
    await post(`/api/history/${VIN}`, {}, { "x-access-token": token });
    expect(historyCalls).toBe(1);

    // Without a token the cached report stays hidden.
    expect((await (await fetch(`${BASE}/api/history/${VIN}`)).json()).report).toBeNull();
  });
});
