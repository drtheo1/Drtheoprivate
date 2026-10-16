import { normalizeRates, type FuelType, type GhanaRates, type RatesDoc, type VehicleCategory } from "../config/ghanaRates";

export interface DecodedVehicle {
  make: string;
  model: string;
  year: number | null;
  trim: string;
  series: string;
  bodyClass: string;
  vehicleType: string;
  engineCc: number | null;
  cylinders: string;
  fuelPrimary: string;
  electrification: string;
  drive: string;
  transmission: string;
  plant: string;
  manufacturer: string;
  gvwr: string;
  seats: string;
  doors: string;
  errorText: string;
  category: VehicleCategory;
  fuel: FuelType;
}

export interface Recall {
  NHTSACampaignNumber: string;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  ReportReceivedDate: string;
}

export interface Complaint {
  odiNumber: number;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  dateOfIncident?: string;
  components: string;
  summary: string;
}

export interface SafetyRating {
  VehicleDescription: string;
  OverallRating: string;
  OverallFrontCrashRating?: string;
  OverallSideCrashRating?: string;
  RolloverRating?: string;
}

export interface HistoryReport {
  provider: string;
  titleBrands: { brand: string; state?: string; date?: string }[];
  accidents: { date?: string; severity?: string; description?: string }[];
  odometer: { date?: string; miles: number; source?: string }[];
  theftRecord?: boolean;
  owners?: number;
  events: { date?: string; location?: string; description: string }[];
  pulledAt?: string;
}

export interface HistoryStatus {
  configured: boolean;
  accessCodeRequired: boolean;
  report: HistoryReport | null;
}

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function mapCategory(vehicleType: string, bodyClass: string): VehicleCategory {
  const t = vehicleType.toUpperCase();
  const b = bodyClass.toUpperCase();
  if (t.includes("MOTORCYCLE")) return "motorcycle";
  if (t.includes("BUS")) return "bus";
  if (b.includes("PICKUP")) return "pickup";
  if (t.includes("TRUCK") && !t.includes("MULTIPURPOSE")) return "truck";
  return "passenger";
}

export function mapFuel(primary: string, electrification: string): FuelType {
  const p = primary.toUpperCase();
  const e = electrification.toUpperCase();
  if (e.includes("BEV") || (p.includes("ELECTRIC") && !e.includes("HEV"))) return "electric";
  if (e.includes("HEV")) return "hybrid";
  if (p.includes("DIESEL")) return "diesel";
  return "petrol";
}

export function mapDecode(r: Record<string, string>): DecodedVehicle {
  const s = (k: string) => (r[k] ?? "").trim();
  const cc = Number(s("DisplacementCC"));
  const litres = Number(s("DisplacementL"));
  const engineCc = cc > 0 ? Math.round(cc) : litres > 0 ? Math.round(litres * 1000) : null;
  const year = Number(s("ModelYear"));
  return {
    make: s("Make"),
    model: s("Model"),
    year: year > 0 ? year : null,
    trim: s("Trim"),
    series: s("Series"),
    bodyClass: s("BodyClass"),
    vehicleType: s("VehicleType"),
    engineCc,
    cylinders: s("EngineCylinders"),
    fuelPrimary: s("FuelTypePrimary"),
    electrification: s("ElectrificationLevel"),
    drive: s("DriveType"),
    transmission: s("TransmissionStyle"),
    plant: [s("PlantCity"), s("PlantState"), s("PlantCountry")].filter(Boolean).join(", "),
    manufacturer: s("Manufacturer"),
    gvwr: s("GVWR"),
    seats: s("Seats"),
    doors: s("Doors"),
    errorText: s("ErrorCode") === "0" ? "" : s("ErrorText"),
    category: mapCategory(s("VehicleType"), s("BodyClass")),
    fuel: mapFuel(s("FuelTypePrimary"), s("ElectrificationLevel")),
  };
}

const vehicleQuery = (v: DecodedVehicle) =>
  new URLSearchParams({ make: v.make, model: v.model, year: String(v.year ?? "") }).toString();

export const api = {
  decode: async (vin: string) => mapDecode(await get<Record<string, string>>(`/api/decode/${vin}`)),
  recalls: async (v: DecodedVehicle) =>
    (await get<{ results?: Recall[] }>(`/api/recalls?${vehicleQuery(v)}`)).results ?? [],
  complaints: async (v: DecodedVehicle) =>
    (await get<{ results?: Complaint[] }>(`/api/complaints?${vehicleQuery(v)}`)).results ?? [],
  ratings: async (v: DecodedVehicle) =>
    (await get<{ results?: SafetyRating[] }>(`/api/ratings?${vehicleQuery(v)}`)).results ?? [],
  history: (vin: string) => get<HistoryStatus>(`/api/history/${vin}`),
  pullHistory: (vin: string, accessCode: string) =>
    get<HistoryStatus>(`/api/history/${vin}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessCode }),
    }),
  rates: async (): Promise<RatesDoc | null> => {
    const doc = await get<Partial<RatesDoc>>("/api/rates");
    if (!doc.rates) return null;
    return { rates: normalizeRates(doc.rates), exchangeRate: doc.exchangeRate ?? 0, note: doc.note ?? "", updatedAt: doc.updatedAt ?? "" };
  },
  saveRates: (password: string, rates: GhanaRates, exchangeRate: number, note: string) =>
    get<RatesDoc>("/api/rates", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${password}` },
      // JSON.stringify turns Infinity into null, which normalizeRates restores.
      body: JSON.stringify({ rates, exchangeRate, note }),
    }),
};
