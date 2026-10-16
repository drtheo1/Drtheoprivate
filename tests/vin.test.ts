import { checkVin, computeCheckDigit } from "../src/lib/vin";

describe("VIN checks", () => {
  it("accepts a valid North American VIN and computes its check digit", () => {
    const c = checkVin("1hgcm82633a004352", 2026);
    expect(c.valid).toBe(true);
    expect(c.checkDigitOk).toBe(true);
    expect(c.region).toContain("United States");
    expect(c.modelYears).toEqual([2003]);
  });

  it("flags a wrong check digit", () => {
    expect(checkVin("1HGCM82643A004352").checkDigitOk).toBe(false);
  });

  it("handles X as a check digit", () => {
    const vin = "1M8GDM9AXKP042788";
    expect(computeCheckDigit(vin)).toBe("X");
  });

  it("rejects bad length and forbidden letters", () => {
    expect(checkVin("ABC").valid).toBe(false);
    expect(checkVin("1HGCM8263OA004352").errors.join(" ")).toMatch(/I, O or Q/);
  });

  it("uses position 7 to pick the 2010+ model year cycle", () => {
    // Position 7 is a letter (S) and position 10 is L, so 2020 rather than 1990.
    expect(checkVin("5YJ3E1EA0LF000316", 2026).modelYears).toEqual([2020]);
  });
});
