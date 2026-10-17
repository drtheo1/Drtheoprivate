// @ts-expect-error plain JS server module
import { mapVinAudit } from "../server/history.js";
import { flagsFromReport } from "../src/lib/eligibility";

describe("VinAudit mapping", () => {
  it("turns a report into brands, odometer readings and a timeline", () => {
    const r = mapVinAudit({
      success: true,
      titles: [
        { date: "2019-04-02", state: "TX", meter: "41200", meter_unit: "M" },
        { date: "2022-08-15", state: "FL", meter: "120000", meter_unit: "K" },
      ],
      jsi: [{ date: "2022-07-01", record_type: "Salvage", brander_name: "Insurer Co", vehicle_disposition: "Sold" }],
      salvage: [{ date: "2022-07-20", location: "Orlando, FL", primary_damage: "Flood" }],
      thefts: [],
      accidents: [{ date: "2022-06-30", description: "Front impact, airbag deployed" }],
      checks: [{ brand_title: "Flood Damage", result: "Yes" }, { brand_title: "Hail Damage", result: "No" }],
    });
    expect(r.titleBrands.map((t: { brand: string }) => t.brand)).toEqual(["Salvage", "Flood Damage"]);
    expect(r.odometer.map((o: { miles: number }) => o.miles)).toEqual([41200, 74565]);
    expect(r.theftRecord).toBe(false);
    expect(r.events[0].date).toBe("2019-04-02");
    expect(flagsFromReport(r)).toMatchObject({ salvage: true, flood: true, airbags: true, theft: false });
  });

  it("copes with missing sections", () => {
    const r = mapVinAudit({ success: true });
    expect(r.titleBrands).toEqual([]);
    expect(r.events).toEqual([]);
  });
});
