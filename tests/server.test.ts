import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const VIN = "1HGCM82633A004352";
let server: ChildProcess;
let stub: http.Server;
let upstreamCalls = 0;
let dataDir: string;

beforeAll(async () => {
  stub = http.createServer((_req, res) => {
    upstreamCalls++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ provider: "Stub", titleBrands: [{ brand: "Salvage" }], events: [] }));
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  const stubPort = (stub.address() as AddressInfo).port;
  dataDir = mkdtempSync(path.join(tmpdir(), "gvdc-"));
  server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ADMIN_TOKEN: "secret",
      HISTORY_PROVIDER: "generic",
      HISTORY_API_URL: `http://127.0.0.1:${stubPort}/r?vin={vin}`,
      HISTORY_ACCESS_CODE: "letmein",
      HISTORY_DAILY_LIMIT: "2",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/rates`);
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

const put = (body: unknown, token = "secret") =>
  fetch(`${BASE}/api/rates`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const pull = (vin: string, accessCode = "letmein") =>
  fetch(`${BASE}/api/history/${vin}`, { method: "POST", body: JSON.stringify({ accessCode }) });

describe("rates API", () => {
  it("starts empty", async () => {
    expect(await (await fetch(`${BASE}/api/rates`)).json()).toEqual({ rates: null });
  });
  it("rejects a wrong password and bad values", async () => {
    expect((await put({ rates: { vat: 0.15 }, exchangeRate: 11 }, "nope")).status).toBe(401);
    expect((await put({ rates: { vat: 15 }, exchangeRate: 11 })).status).toBe(400);
    expect((await put({ rates: { bogus: 0.1 }, exchangeRate: 11 })).status).toBe(400);
    expect((await put({ rates: { vat: 0.15 }, exchangeRate: 0 })).status).toBe(400);
  });
  it("saves and serves the weekly rates", async () => {
    const res = await put({ rates: { vat: 0.15, passengerDutyBands: [{ maxCc: 1000, rate: 0.05 }, { maxCc: null, rate: 0.1 }] }, exchangeRate: 11.25, note: "Week 42" });
    expect(res.status).toBe(200);
    const doc = await (await fetch(`${BASE}/api/rates`)).json();
    expect(doc).toMatchObject({ exchangeRate: 11.25, note: "Week 42", rates: { vat: 0.15 } });
    expect(doc.updatedAt).toBeTruthy();
  });
});

describe("history API", () => {
  it("reports the provider without charging", async () => {
    const h = await (await fetch(`${BASE}/api/history/${VIN}`)).json();
    expect(h).toEqual({ configured: true, accessCodeRequired: true, report: null });
    expect(upstreamCalls).toBe(0);
  });
  it("needs the access code", async () => {
    expect((await pull(VIN, "wrong")).status).toBe(401);
    expect(upstreamCalls).toBe(0);
  });
  it("pulls once and serves the cached report afterwards", async () => {
    const first = await (await pull(VIN)).json();
    expect(first.report.titleBrands[0].brand).toBe("Salvage");
    await pull(VIN);
    const viaGet = await (await fetch(`${BASE}/api/history/${VIN}`)).json();
    expect(viaGet.report.pulledAt).toBeTruthy();
    expect(upstreamCalls).toBe(1);
  });
  it("stops at the daily limit", async () => {
    expect((await pull("2HGFC2F59JH000001")).status).toBe(200);
    expect((await pull("3VW2B7AJ5HM000002")).status).toBe(429);
    expect(upstreamCalls).toBe(2);
  });
});
