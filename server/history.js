// Title, accident, odometer and theft history for North American vehicles.
//
// This data is not public. It comes from NMVTIS approved data providers and commercial
// services (Carfax, AutoCheck, VinAudit, ClearVin and others), each with its own API and
// contract. Plug one in by setting:
//
//   HISTORY_API_URL  e.g. https://provider.example/report?vin={vin}
//   HISTORY_API_KEY  sent as "Authorization: Bearer <key>"
//
// then adapt mapProviderResponse() below to your provider's response format.
// Without these variables the endpoint reports that no provider is configured and the
// app falls back to links and the manual history checklist.

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

/** @returns {HistoryReport} */
export function mapProviderResponse(raw) {
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

export async function fetchHistory(vin) {
  const template = process.env.HISTORY_API_URL;
  if (!template) return { configured: false };
  const headers = { accept: "application/json" };
  if (process.env.HISTORY_API_KEY) headers.authorization = `Bearer ${process.env.HISTORY_API_KEY}`;
  const res = await fetch(template.replace("{vin}", vin), { headers });
  if (!res.ok) throw Object.assign(new Error(`History provider returned ${res.status}`), { status: 502 });
  return { configured: true, report: mapProviderResponse(await res.json()) };
}
