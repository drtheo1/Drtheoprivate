import { DEFAULT_RATES } from "../src/config/ghanaRates";
import { calculateDuty, importDutyRate, vehicleAgeYears, type DutyInput } from "../src/lib/duty";

const base: DutyInput = {
  category: "passenger",
  fuel: "petrol",
  engineCc: 2000,
  manufactureYear: 2021,
  manufactureMonth: 6,
  arrivalDate: "2026-11-01",
  valuationMode: "invoice",
  fobUsd: 10000,
  hdvUsd: 0,
  freightUsd: 1500,
  insuranceUsd: 0,
  exchangeRate: 12,
};

const line = (r: ReturnType<typeof calculateDuty>, key: string) => r.lines.find((l) => l.key === key)?.usd ?? 0;

describe("Ghana duty", () => {
  it("picks the duty band by engine size and category", () => {
    expect(importDutyRate(DEFAULT_RATES, "passenger", "petrol", 1000)).toBe(0.05);
    expect(importDutyRate(DEFAULT_RATES, "passenger", "petrol", 2500)).toBe(0.1);
    expect(importDutyRate(DEFAULT_RATES, "passenger", "diesel", 3500)).toBe(0.2);
    expect(importDutyRate(DEFAULT_RATES, "passenger", "electric", 0)).toBe(DEFAULT_RATES.electricDuty);
    expect(importDutyRate(DEFAULT_RATES, "pickup", "diesel", 2800)).toBe(0.1);
  });

  it("computes age from the year of manufacture", () => {
    expect(vehicleAgeYears(2021, 6, "2026-06-01")).toBeCloseTo(5, 1);
  });

  it("builds CIF with the default 1% insurance and charges each levy on the right base", () => {
    const r = calculateDuty(base, DEFAULT_RATES);
    expect(r.insuranceUsd).toBe(115);
    expect(r.cifUsd).toBe(11615);
    expect(line(r, "duty")).toBe(1161.5);
    expect(line(r, "penalty")).toBe(0);
    // VAT base is CIF + duty.
    expect(r.vatBaseUsd).toBe(12776.5);
    expect(line(r, "vat")).toBeCloseTo(1916.48, 2);
    expect(line(r, "nhil")).toBeCloseTo(319.41, 2);
    expect(line(r, "network")).toBe(40);
    const sum = r.lines.reduce((s, l) => s + l.usd, 0);
    expect(r.totalUsd).toBeCloseTo(sum, 2);
    expect(r.totalGhs).toBeCloseTo(r.totalUsd * 12, 1);
    expect(r.blockedByAge).toBe(false);
  });

  it("applies the HDV depreciation schedule", () => {
    const r = calculateDuty({ ...base, valuationMode: "hdv", hdvUsd: 30000 }, DEFAULT_RATES);
    expect(r.depreciationRate).toBe(0.5);
    expect(r.fobUsd).toBe(15000);
  });

  it("blocks vehicles over the age limit after the PVoC start date but not before", () => {
    const old = { ...base, manufactureYear: 2012 };
    const after = calculateDuty(old, DEFAULT_RATES);
    expect(after.blockedByAge).toBe(true);
    expect(line(after, "penalty")).toBeGreaterThan(0);
    const before = calculateDuty({ ...old, arrivalDate: "2026-09-01" }, DEFAULT_RATES);
    expect(before.blockedByAge).toBe(false);
  });
});
