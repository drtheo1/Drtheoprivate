import { assessEligibility, EMPTY_FLAGS, flagsFromReport } from "../src/lib/eligibility";
import { mapCategory, mapFuel } from "../src/lib/api";

describe("eligibility", () => {
  it("blocks salvage titles", () => {
    expect(assessEligibility({ ...EMPTY_FLAGS, salvage: true }, false, 0).verdict).toBe("blocked");
  });
  it("marks open recalls as a risk", () => {
    expect(assessEligibility(EMPTY_FLAGS, false, 2).verdict).toBe("risk");
  });
  it("is clear with no issues", () => {
    expect(assessEligibility(EMPTY_FLAGS, false, 0).verdict).toBe("clear");
  });
  it("reads flags from a provider report", () => {
    const f = flagsFromReport({
      provider: "x",
      titleBrands: [{ brand: "Salvage", state: "TX" }],
      accidents: [{ description: "Airbag deployed, structural damage" }],
      odometer: [],
      events: [{ description: "Not actual mileage brand" }],
    });
    expect(f).toMatchObject({ salvage: true, airbags: true, structural: true, odometer: true, flood: false });
  });
});

describe("NHTSA mapping", () => {
  it("maps vehicle types to Ghana categories", () => {
    expect(mapCategory("MULTIPURPOSE PASSENGER VEHICLE (MPV)", "Sport Utility Vehicle (SUV)")).toBe("passenger");
    expect(mapCategory("TRUCK", "Pickup")).toBe("pickup");
    expect(mapCategory("BUS", "Bus")).toBe("bus");
    expect(mapCategory("MOTORCYCLE", "Motorcycle - Standard")).toBe("motorcycle");
  });
  it("maps fuel", () => {
    expect(mapFuel("Electric", "BEV (Battery Electric Vehicle)")).toBe("electric");
    expect(mapFuel("Gasoline", "Strong HEV (Hybrid Electric Vehicle)")).toBe("hybrid");
    expect(mapFuel("Diesel", "")).toBe("diesel");
    expect(mapFuel("Gasoline", "")).toBe("petrol");
  });
});
