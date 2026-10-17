import { DEFAULT_RATES, normalizeRates, ratesAgeDays } from "../src/config/ghanaRates";

describe("rates storage", () => {
  it("survives a JSON round trip with open ended bands", () => {
    const back = normalizeRates(JSON.parse(JSON.stringify(DEFAULT_RATES)));
    expect(back).toEqual(DEFAULT_RATES);
    expect(back.passengerDutyBands.at(-1)?.maxCc).toBe(Infinity);
  });
  it("fills missing fields from the defaults", () => {
    const r = normalizeRates({ vat: 0.2, categoryDuty: { pickup: 0.15 } });
    expect(r.vat).toBe(0.2);
    expect(r.categoryDuty).toEqual({ ...DEFAULT_RATES.categoryDuty, pickup: 0.15 });
    expect(r.depreciation).toEqual(DEFAULT_RATES.depreciation);
  });
  it("reports age in days", () => {
    expect(ratesAgeDays("2026-10-01T00:00:00Z", Date.parse("2026-10-09T12:00:00Z"))).toBe(8);
    expect(ratesAgeDays("")).toBeNull();
  });
});
