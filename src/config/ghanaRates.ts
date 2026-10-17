/**
 * Ghana import charges for used vehicles.
 *
 * These figures come from secondary sources (GRA statements reported in the press and
 * importer guides) and change with each national budget. Every value is editable in the
 * app, and the GRA ICUMS assessment is always the final word. Update RATES_AS_OF when
 * you change anything here.
 */

export const RATES_AS_OF = "2026-10-16";

export type VehicleCategory = "passenger" | "pickup" | "bus" | "truck" | "motorcycle";
export type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

export interface DutyBand {
  /** Upper bound of engine capacity in cc (inclusive). Infinity for the last band. */
  maxCc: number;
  rate: number;
}

export interface AgeBand {
  /** Upper bound of age in years (inclusive). Infinity for the last band. */
  maxYears: number;
  rate: number;
}

export interface GhanaRates {
  /** Import duty on CIF for passenger vehicles, by engine capacity. */
  passengerDutyBands: DutyBand[];
  /** Flat import duty on CIF for other categories. */
  categoryDuty: Record<Exclude<VehicleCategory, "passenger">, number>;
  /** Import duty on CIF for fully electric vehicles. */
  electricDuty: number;
  /** Levies charged on CIF. */
  ecowasLevy: number;
  auLevy: number;
  eximLevy: number;
  specialImportLevy: number;
  /** ICUMS network charge, charged on FOB. */
  networkCharge: number;
  /** Charged on the VAT base (CIF + import duty + overage penalty). */
  vat: number;
  nhil: number;
  getfund: number;
  /** HDV depreciation by vehicle age (fraction removed from the home delivery value). */
  depreciation: AgeBand[];
  /** Overage penalty on CIF by vehicle age. Only applies where older imports are still allowed. */
  overagePenalty: AgeBand[];
  /** Maximum age accepted under the GSA pre export verification (PVoC) regime. */
  maxImportAgeYears: number;
  /** Date the age limit and structural damage rejection start (PVoC programme). */
  ageLimitEffective: string;
}

export const DEFAULT_RATES: GhanaRates = {
  passengerDutyBands: [
    { maxCc: 1000, rate: 0.05 },
    { maxCc: 3000, rate: 0.1 },
    { maxCc: Infinity, rate: 0.2 },
  ],
  categoryDuty: {
    pickup: 0.1,
    bus: 0.1,
    truck: 0.1,
    motorcycle: 0.2,
  },
  electricDuty: 0.05,
  ecowasLevy: 0.005,
  auLevy: 0.002,
  eximLevy: 0.0075,
  specialImportLevy: 0.02,
  networkCharge: 0.004,
  vat: 0.15,
  nhil: 0.025,
  getfund: 0.025,
  depreciation: [
    { maxYears: 0.5, rate: 0 },
    { maxYears: 1.5, rate: 0.15 },
    { maxYears: 2.5, rate: 0.3 },
    { maxYears: 5, rate: 0.4 },
    { maxYears: Infinity, rate: 0.5 },
  ],
  overagePenalty: [
    { maxYears: 10, rate: 0 },
    { maxYears: 12, rate: 0.05 },
    { maxYears: 15, rate: 0.2 },
    { maxYears: Infinity, rate: 0.5 },
  ],
  maxImportAgeYears: 10,
  ageLimitEffective: "2026-10-01",
};

export const RATE_SOURCES = [
  {
    label: "Graphic Online: why similar vehicles attract different duty rates (depreciation schedule, HDV)",
    url: "https://www.graphic.com.gh/news/general-news/explained-what-you-need-to-know-before-importing-a-car-to-ghana.html",
  },
  {
    label: "trade.gov: Ghana customs valuation of used vehicles (ICUMS HDV)",
    url: "https://trade.gov/market-intelligence/ghana-customs-valuation-used-vehicles",
  },
  {
    label: "Modern Ghana: GSA PVoC inspection from 1 October 2026",
    url: "https://www.modernghana.com/news/1515695/ghana-moves-to-shut-out-over-aged-and-unsafe-used.html",
  },
  {
    label: "EY: Customs (Amendment) Act 2020, Act 1014 (salvaged vehicle ban)",
    url: "https://www.ey.com/en_gl/tax-alerts/ghana-amends-customs-act-to-provide-incentives-for-the-automobile-industry",
  },
  { label: "Ghana Revenue Authority (official)", url: "https://gra.gov.gh/" },
];

/** Rates as stored on the server, updated weekly from the admin page. */
export interface RatesDoc {
  rates: GhanaRates;
  exchangeRate: number;
  note: string;
  updatedAt: string;
}

/** JSON has no Infinity, so open ended bands travel as null. Restore them and fill gaps from the defaults. */
export function normalizeRates(raw: unknown): GhanaRates {
  if (!raw || typeof raw !== "object") return DEFAULT_RATES;
  const revive = <T extends { rate: number }>(bands: unknown, key: "maxCc" | "maxYears", fallback: T[]): T[] =>
    Array.isArray(bands) && bands.length
      ? bands.map((b) => ({ ...b, [key]: b[key] === null || b[key] === undefined ? Infinity : b[key] }))
      : fallback;
  const r = raw as Partial<GhanaRates>;
  return {
    ...DEFAULT_RATES,
    ...r,
    categoryDuty: { ...DEFAULT_RATES.categoryDuty, ...r.categoryDuty },
    passengerDutyBands: revive(r.passengerDutyBands, "maxCc", DEFAULT_RATES.passengerDutyBands),
    depreciation: revive(r.depreciation, "maxYears", DEFAULT_RATES.depreciation),
    overagePenalty: revive(r.overagePenalty, "maxYears", DEFAULT_RATES.overagePenalty),
  };
}

/** Days since the rates were last saved; rates older than a week should be refreshed. */
export function ratesAgeDays(updatedAt: string | undefined, now = Date.now()): number | null {
  const t = Date.parse(updatedAt ?? "");
  return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null;
}
