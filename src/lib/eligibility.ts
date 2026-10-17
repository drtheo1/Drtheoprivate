import type { HistoryReport } from "./api";

export interface HistoryFlags {
  salvage: boolean;
  flood: boolean;
  rebuilt: boolean;
  junk: boolean;
  structural: boolean;
  theft: boolean;
  odometer: boolean;
  airbags: boolean;
}

export const FLAG_LABELS: Record<keyof HistoryFlags, string> = {
  salvage: "Salvage or total loss title",
  flood: "Flood or water damage brand",
  rebuilt: "Rebuilt or reconstructed title",
  junk: "Junk, scrap or non repairable brand",
  structural: "Structural or frame damage reported",
  theft: "Theft record (not recovered or recovered)",
  odometer: "Odometer rollback, not actual mileage or exceeds limits",
  airbags: "Airbags deployed in a reported accident",
};

export const EMPTY_FLAGS: HistoryFlags = {
  salvage: false,
  flood: false,
  rebuilt: false,
  junk: false,
  structural: false,
  theft: false,
  odometer: false,
  airbags: false,
};

/** Derive flags from a provider report by matching title brand and event text. */
export function flagsFromReport(report: HistoryReport): HistoryFlags {
  const text = [
    ...report.titleBrands.map((t) => t.brand),
    ...report.accidents.map((a) => `${a.severity ?? ""} ${a.description ?? ""}`),
    ...report.events.map((e) => e.description),
  ]
    .join(" | ")
    .toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  return {
    salvage: has("salvage", "total loss"),
    flood: has("flood", "water damage", "hail"),
    rebuilt: has("rebuilt", "reconstructed", "rebuildable"),
    junk: has("junk", "scrap", "non repairable", "nonrepairable", "destroyed", "certificate of destruction"),
    structural: has("structural", "frame damage"),
    theft: Boolean(report.theftRecord) || has("theft", "stolen"),
    odometer: has("not actual mileage", "odometer rollback", "exceeds mechanical limits", "tmu"),
    airbags: has("airbag"),
  };
}

export type Verdict = "blocked" | "risk" | "clear";

export interface Eligibility {
  verdict: Verdict;
  reasons: string[];
}

export function assessEligibility(flags: HistoryFlags, blockedByAge: boolean, openRecalls: number): Eligibility {
  const blocking: string[] = [];
  const risks: string[] = [];
  if (blockedByAge) blocking.push("Over the maximum import age under the GSA pre export verification programme.");
  if (flags.salvage || flags.junk)
    blocking.push("Salvaged and non repairable vehicles are banned from import under the Customs (Amendment) Act 2020, Act 1014.");
  if (flags.structural) blocking.push("Structurally damaged vehicles are rejected at pre export inspection.");
  if (flags.theft) blocking.push("A theft record must be cleared before shipping; the vehicle can be seized.");
  if (flags.flood) risks.push("Flood damage often counts as salvage and causes hidden electrical faults.");
  if (flags.rebuilt) risks.push("A rebuilt title means the car was once salvage; Ghana Customs may still treat it as salvaged.");
  if (flags.odometer) risks.push("Mileage cannot be trusted, which affects value and condition.");
  if (flags.airbags) risks.push("Airbag deployment points to a serious crash; inspect the structure and airbag modules.");
  if (openRecalls > 0)
    risks.push(`${openRecalls} recall campaign(s) exist for this model; ask the seller for proof the remedy was done.`);

  if (blocking.length) return { verdict: "blocked", reasons: [...blocking, ...risks] };
  if (risks.length) return { verdict: "risk", reasons: risks };
  return { verdict: "clear", reasons: ["No blocking issues found from the information available."] };
}
