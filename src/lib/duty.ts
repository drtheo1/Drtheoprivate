import type { AgeBand, FuelType, GhanaRates, VehicleCategory } from "../config/ghanaRates";

export type ValuationMode = "invoice" | "hdv";

export interface DutyInput {
  category: VehicleCategory;
  fuel: FuelType;
  engineCc: number;
  manufactureYear: number;
  /** 1 to 12. When unknown, January is assumed, which gives the oldest possible age. */
  manufactureMonth?: number;
  /** Expected arrival date at Tema or Takoradi, ISO yyyy-mm-dd. */
  arrivalDate: string;
  valuationMode: ValuationMode;
  /** Invoice mode: FOB price in USD. */
  fobUsd: number;
  /** HDV mode: home delivery value (new price in the source market) in USD. */
  hdvUsd: number;
  freightUsd: number;
  /** Insurance in USD. When 0 or empty, 1% of (FOB + freight) is used, as customs commonly assumes. */
  insuranceUsd: number;
  /** Ghana cedis per US dollar (customs rate for the week). */
  exchangeRate: number;
}

export interface DutyLine {
  key: string;
  label: string;
  base: string;
  rate: number;
  usd: number;
}

export interface DutyResult {
  ageYears: number;
  depreciationRate: number;
  fobUsd: number;
  insuranceUsd: number;
  cifUsd: number;
  vatBaseUsd: number;
  lines: DutyLine[];
  totalUsd: number;
  totalGhs: number;
  /** Total duty and taxes plus CIF, the landed cost before clearing agent fees. */
  landedUsd: number;
  blockedByAge: boolean;
  warnings: string[];
}

export function bandRate(bands: AgeBand[], years: number): number {
  for (const band of bands) if (years <= band.maxYears) return band.rate;
  return bands[bands.length - 1]?.rate ?? 0;
}

export function vehicleAgeYears(year: number, month: number | undefined, onDate: string): number {
  const built = Date.UTC(year, (month ?? 1) - 1, 1);
  const on = Date.parse(onDate);
  if (!Number.isFinite(on)) return 0;
  const years = (on - built) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, Math.round(years * 100) / 100);
}

/** Over the age limit on arrival, once the limit is in force. */
export function isBlockedByAge(
  ageYears: number,
  arrivalDate: string,
  limits: Pick<GhanaRates, "maxImportAgeYears" | "ageLimitEffective">,
): boolean {
  return arrivalDate >= limits.ageLimitEffective && ageYears > limits.maxImportAgeYears;
}

export function importDutyRate(rates: GhanaRates, category: VehicleCategory, fuel: FuelType, engineCc: number): number {
  if (fuel === "electric" && category === "passenger") return rates.electricDuty;
  if (category !== "passenger") return rates.categoryDuty[category];
  for (const band of rates.passengerDutyBands) if (engineCc <= band.maxCc) return band.rate;
  return rates.passengerDutyBands[rates.passengerDutyBands.length - 1].rate;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateDuty(input: DutyInput, rates: GhanaRates): DutyResult {
  const warnings: string[] = [];
  const ageYears = vehicleAgeYears(input.manufactureYear, input.manufactureMonth, input.arrivalDate);
  const depreciationRate = bandRate(rates.depreciation, ageYears);

  const fobUsd =
    input.valuationMode === "hdv" ? input.hdvUsd * (1 - depreciationRate) : input.fobUsd;
  const freightUsd = input.freightUsd || 0;
  const insuranceUsd = input.insuranceUsd > 0 ? input.insuranceUsd : (fobUsd + freightUsd) * 0.01;
  const cifUsd = fobUsd + freightUsd + insuranceUsd;

  const blockedByAge = isBlockedByAge(ageYears, input.arrivalDate, rates);
  if (blockedByAge) {
    warnings.push(
      `This vehicle will be about ${ageYears.toFixed(1)} years old on arrival. From ${rates.ageLimitEffective} the GSA pre export verification programme rejects used vehicles over ${rates.maxImportAgeYears} years, so it may not be cleared at all. The figures below show what the older penalty regime would have charged.`,
    );
  }
  if (input.manufactureMonth === undefined) {
    warnings.push("Month of manufacture unknown, so January was assumed. Check the door jamb label for the exact month.");
  }

  const dutyRate = importDutyRate(rates, input.category, input.fuel, input.engineCc);
  const penaltyRate = bandRate(rates.overagePenalty, ageYears);

  const onCif = (key: string, label: string, rate: number): DutyLine => ({
    key,
    label,
    base: "CIF",
    rate,
    usd: cifUsd * rate,
  });

  const duty = onCif("duty", "Import duty", dutyRate);
  const penalty = onCif("penalty", "Overage penalty", penaltyRate);
  const vatBaseUsd = cifUsd + duty.usd + penalty.usd;
  const onVatBase = (key: string, label: string, rate: number): DutyLine => ({
    key,
    label,
    base: "CIF + duty + penalty",
    rate,
    usd: vatBaseUsd * rate,
  });

  const lines: DutyLine[] = [
    duty,
    penalty,
    onVatBase("vat", "VAT", rates.vat),
    onVatBase("nhil", "NHIL", rates.nhil),
    onVatBase("getfund", "GETFund levy", rates.getfund),
    onCif("ecowas", "ECOWAS levy", rates.ecowasLevy),
    onCif("au", "African Union levy", rates.auLevy),
    onCif("exim", "EXIM levy", rates.eximLevy),
    onCif("sil", "Special import levy", rates.specialImportLevy),
    { key: "network", label: "ICUMS network charge", base: "FOB", rate: rates.networkCharge, usd: fobUsd * rates.networkCharge },
  ]
    .filter((l) => l.rate > 0)
    .map((l) => ({ ...l, usd: round2(l.usd) }));

  const totalUsd = round2(lines.reduce((sum, l) => sum + l.usd, 0));
  if (!(input.exchangeRate > 0)) warnings.push("Enter the current customs exchange rate to see cedi amounts.");

  return {
    ageYears,
    depreciationRate,
    fobUsd: round2(fobUsd),
    insuranceUsd: round2(insuranceUsd),
    cifUsd: round2(cifUsd),
    vatBaseUsd: round2(vatBaseUsd),
    lines,
    totalUsd,
    totalGhs: round2(totalUsd * (input.exchangeRate || 0)),
    landedUsd: round2(totalUsd + cifUsd),
    blockedByAge,
    warnings,
  };
}
