// Paid title, accident, odometer and theft history for North American vehicles.
//
// HISTORY_PROVIDER=vinaudit (recommended, NMVTIS approved)
//   VINAUDIT_API_KEY, VINAUDIT_USER, VINAUDIT_PASS from your VinAudit API account
//   VINAUDIT_MODE=test  returns sample data without charging, for checking the setup
//
// HISTORY_PROVIDER=generic (any other provider)
//   HISTORY_API_URL  e.g. https://provider.example/report?vin={vin}
//   HISTORY_API_KEY  sent as "Authorization: Bearer <key>"
//   then adapt mapGeneric() to the provider's response.

/**
 * @typedef {Object} HistoryReport
 * @property {string} provider
 * @property {{ brand: string, state?: string, date?: string }[]} titleBrands  e.g. Salvage, Flood, Rebuilt, Junk
 * @property {{ date?: string, severity?: string, description?: string }[]} accidents
 * @property {{ date?: string, miles: number, source?: string }[]} odometer
 * @property {boolean} [theftRecord]
 * @property {number} [owners]
 * @property {{ date?: string, location?: string, description: string }[]} events
 */

export function providerName() {
  const p = (process.env.HISTORY_PROVIDER ?? "").toLowerCase();
  if (p === "vinaudit" && process.env.VINAUDIT_API_KEY) return "vinaudit";
  if (p === "generic" && process.env.HISTORY_API_URL) return "generic";
  return null;
}

const list = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const str = (...vals) => vals.find((v) => typeof v === "string" && v.trim())?.trim();
const toMiles = (value, unit) => {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!(n > 0)) return null;
  return /^k/i.test(unit ?? "") ? Math.round(n * 0.621371) : Math.round(n);
};
const byDate = (a, b) => (Date.parse(a.date ?? "") || 0) - (Date.parse(b.date ?? "") || 0);

/**
 * VinAudit v2 pullreport JSON. Field names follow VinAudit's report sections (titles, jsi,
 * salvage, accidents, thefts, sales, checks). Everything is read defensively; confirm the
 * mapping against your first test mode report.
 * @returns {HistoryReport}
 */
export function mapVinAudit(raw) {
  const titleBrands = [];
  const events = [];
  const odometer = [];

  for (const t of list(raw.titles)) {
    const date = str(t.date);
    const state = str(t.state);
    const miles = toMiles(t.meter ?? t.odometer, t.meter_unit);
    if (miles) odometer.push({ date, miles, source: `Title record${state ? `, ${state}` : ""}` });
    events.push({ date, location: state, description: `Title issued${miles ? ` at ${miles.toLocaleString("en-US")} miles` : ""}` });
  }

  for (const j of list(raw.jsi)) {
    const kind = str(j.record_type, j.type) ?? "Junk, salvage or insurance record";
    const by = str(j.brander_name, j.reporting_entity);
    const disposition = str(j.vehicle_disposition, j.disposition);
    titleBrands.push({ brand: kind, date: str(j.date) });
    events.push({
      date: str(j.date),
      location: str(j.brander_city, j.location, j.state),
      description: [kind, by && `reported by ${by}`, disposition && `disposition: ${disposition}`].filter(Boolean).join(", "),
    });
  }

  for (const c of list(raw.checks)) {
    const name = str(c.brand_title, c.title, c.name, c.label, typeof c === "string" ? c : undefined);
    const found = c.result ?? c.value ?? c.status ?? c.present;
    const flagged = found === true || /^(y|yes|1|true|found|problem)/i.test(String(found ?? ""));
    if (name && flagged) titleBrands.push({ brand: name, state: str(c.state), date: str(c.date) });
  }

  for (const s of list(raw.salvage)) {
    const damage = str(s.primary_damage, s.damage, s.description);
    events.push({
      date: str(s.date),
      location: str(s.location, s.state),
      description: `Salvage auction listing${damage ? `, damage: ${damage}` : ""}`,
    });
    const miles = toMiles(s.odometer ?? s.mileage);
    if (miles) odometer.push({ date: str(s.date), miles, source: "Salvage auction" });
  }

  const accidents = list(raw.accidents).map((a) => ({
    date: str(a.date),
    severity: str(a.severity, a.damage_severity),
    description: str(a.description, a.damage, a.type) ?? "Accident reported",
  }));
  for (const a of accidents) events.push({ date: a.date, description: `Accident: ${a.description}` });

  const thefts = list(raw.thefts);
  for (const t of thefts) events.push({ date: str(t.date), location: str(t.location, t.state), description: "Theft record" });

  for (const s of list(raw.sales)) {
    const miles = toMiles(s.mileage ?? s.odometer);
    if (miles) odometer.push({ date: str(s.date), miles, source: "Sale listing" });
    events.push({
      date: str(s.date),
      location: str(s.location, s.city, s.state),
      description: `Listed for sale${s.price ? ` at $${Number(s.price).toLocaleString("en-US")}` : ""}${miles ? `, ${miles.toLocaleString("en-US")} miles` : ""}`,
    });
  }

  return {
    provider: "VinAudit (NMVTIS approved)",
    titleBrands,
    accidents,
    odometer: odometer.sort(byDate),
    theftRecord: thefts.length > 0,
    events: events.sort(byDate),
  };
}

/** @returns {HistoryReport} */
export function mapGeneric(raw) {
  return {
    provider: raw.provider ?? "Configured provider",
    titleBrands: raw.titleBrands ?? raw.title_brands ?? [],
    accidents: raw.accidents ?? [],
    odometer: raw.odometer ?? [],
    theftRecord: raw.theftRecord ?? raw.theft ?? undefined,
    owners: raw.owners ?? undefined,
    events: raw.events ?? raw.history ?? [],
  };
}

export function mapReport(provider, raw) {
  return provider === "vinaudit" ? mapVinAudit(raw) : mapGeneric(raw);
}

const upstreamError = (msg) => Object.assign(new Error(msg), { status: 502 });

/** Calls the paid provider. Returns the raw response, which the caller caches. */
export async function pullReport(provider, vin) {
  if (provider === "vinaudit") {
    const params = new URLSearchParams({
      id: String(Date.now()).padStart(14, "0"),
      key: process.env.VINAUDIT_API_KEY,
      vin,
      format: "json",
    });
    if (process.env.VINAUDIT_USER) params.set("user", process.env.VINAUDIT_USER);
    if (process.env.VINAUDIT_PASS) params.set("pass", process.env.VINAUDIT_PASS);
    if (process.env.VINAUDIT_MODE) params.set("mode", process.env.VINAUDIT_MODE);
    const res = await fetch(`https://api.vinaudit.com/v2/pullreport?${params}`).catch(() => {
      throw upstreamError("Could not reach VinAudit. Try again shortly.");
    });
    if (!res.ok) throw upstreamError(`VinAudit returned ${res.status}`);
    const raw = await res.json();
    if (raw.success === false) throw upstreamError(`VinAudit: ${raw.error || "report not available"}`);
    return raw;
  }

  const headers = { accept: "application/json" };
  if (process.env.HISTORY_API_KEY) headers.authorization = `Bearer ${process.env.HISTORY_API_KEY}`;
  const res = await fetch(process.env.HISTORY_API_URL.replace("{vin}", vin), { headers }).catch(() => {
    throw upstreamError("Could not reach the history provider.");
  });
  if (!res.ok) throw upstreamError(`History provider returned ${res.status}`);
  return res.json();
}
