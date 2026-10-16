const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function computeCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value = /[0-9]/.test(ch) ? Number(ch) : TRANSLITERATION[ch];
    if (value === undefined) return "?";
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export interface VinCheck {
  vin: string;
  valid: boolean;
  checkDigitOk: boolean;
  errors: string[];
  region: string;
  /** Candidate model years from position 10, newest first. */
  modelYears: number[];
}

export function regionFromWmi(vin: string): string {
  const c = vin[0];
  if ("12345".includes(c)) return "North America (United States)";
  if (c === "2") return "North America (Canada)";
  if (c === "3") return "North America (Mexico)";
  if ("ABCDEFGH".includes(c)) return "Africa";
  if ("JKLMNPR".includes(c)) return "Asia";
  if ("STUVWXYZ".includes(c)) return "Europe";
  if ("67".includes(c)) return "Oceania";
  if ("89".includes(c)) return "South America";
  return "Unknown";
}

export function checkVin(raw: string, currentYear = new Date().getFullYear()): VinCheck {
  const vin = normalizeVin(raw);
  const errors: string[] = [];
  if (vin.length !== 17) errors.push(`A VIN has 17 characters; this one has ${vin.length}.`);
  if (/[IOQ]/.test(vin)) errors.push("VINs never contain the letters I, O or Q.");

  let checkDigitOk = false;
  let modelYears: number[] = [];
  if (errors.length === 0) {
    checkDigitOk = computeCheckDigit(vin) === vin[8];
    const idx = YEAR_CODES.indexOf(vin[9]);
    if (idx >= 0) {
      for (let y = 1980 + idx; y <= currentYear + 1; y += 30) modelYears.push(y);
      // For North American light vehicles a letter in position 7 means 2010 or later, a digit means 2009 or earlier.
      const pos7Letter = /[A-Z]/.test(vin[6]);
      const filtered = modelYears.filter((y) => (pos7Letter ? y >= 2010 : y < 2010));
      if (filtered.length) modelYears = filtered;
      modelYears.sort((a, b) => b - a);
    } else {
      errors.push("Position 10 is not a valid model year code.");
    }
  }

  return {
    vin,
    valid: errors.length === 0,
    checkDigitOk,
    errors,
    region: vin.length ? regionFromWmi(vin) : "Unknown",
    modelYears,
  };
}
