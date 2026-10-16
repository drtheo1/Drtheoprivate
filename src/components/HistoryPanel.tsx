import { useState } from "react";
import type { Complaint, HistoryReport, Recall, SafetyRating } from "../lib/api";
import { FLAG_LABELS, type HistoryFlags } from "../lib/eligibility";

interface Props {
  vin: string;
  recalls: Recall[] | null;
  complaints: Complaint[] | null;
  ratings: SafetyRating[] | null;
  report: HistoryReport | null;
  providerConfigured: boolean | null;
  accessCodeRequired: boolean;
  pulling: boolean;
  onPullReport: (accessCode: string) => void;
  flags: HistoryFlags;
  onFlagsChange: (flags: HistoryFlags) => void;
  errors: Record<string, string>;
}

const reportLinks = (vin: string) => [
  { label: "NMVTIS approved providers (US government title database)", url: "https://vehiclehistory.bja.ojp.gov/" },
  { label: "NICB VINCheck (free theft and total loss check)", url: "https://www.nicb.org/vincheck" },
  { label: "NHTSA unrepaired recalls for this exact VIN", url: `https://www.nhtsa.gov/recalls?vin=${vin}` },
  { label: "CARFAX report", url: `https://www.carfax.com/vehicle/${vin}` },
  { label: "AutoCheck report", url: `https://www.autocheck.com/vehiclehistory/?vin=${vin}` },
  { label: "CARFAX Canada (vehicles registered in Canada)", url: "https://www.carfax.ca/" },
  { label: "Search the web for auction photos of this VIN", url: `https://www.google.com/search?q=%22${vin}%22` },
];

function formatDate(d?: string) {
  if (!d) return "";
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : d;
}

export function HistoryPanel(props: Props) {
  const { vin, recalls, complaints, ratings, report, providerConfigured, flags, onFlagsChange, errors } = props;
  const [showAllComplaints, setShowAllComplaints] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const serious = (complaints ?? []).filter((c) => c.crash || c.fire || c.numberOfInjuries > 0 || c.numberOfDeaths > 0);
  const shown = showAllComplaints ? complaints ?? [] : serious.slice(0, 5);

  return (
    <section className="card">
      <h2>Vehicle history</h2>

      <h3>Title, accident and odometer records</h3>
      {report ? (
        <div className="report">
          <p className="muted">
            Source: {report.provider}
            {report.pulledAt && ` · pulled ${formatDate(report.pulledAt)}`}
          </p>
          <ul className="facts">
            <li>Title brands: {report.titleBrands.length ? report.titleBrands.map((t) => `${t.brand}${t.state ? ` (${t.state})` : ""}`).join(", ") : "none reported"}</li>
            <li>Accidents: {report.accidents.length || "none reported"}</li>
            <li>Theft record: {report.theftRecord ? "yes" : "none reported"}</li>
            {report.owners !== undefined && <li>Owners: {report.owners}</li>}
            {report.odometer.length > 0 && (
              <li>Last odometer reading: {report.odometer[report.odometer.length - 1].miles.toLocaleString()} miles</li>
            )}
          </ul>
          {report.events.length > 0 && (
            <ol className="timeline">
              {report.events.map((e, i) => (
                <li key={i}>
                  <span className="muted">{formatDate(e.date)} {e.location}</span> {e.description}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : providerConfigured ? (
        <form
          className="pull"
          onSubmit={(e) => {
            e.preventDefault();
            props.onPullReport(accessCode);
          }}
        >
          <p className="muted">
            Title brands (salvage, flood, rebuilt), accidents, theft, odometer readings and auction records from every US state.
            Each new VIN is a paid report; a VIN pulled before opens for free.
          </p>
          {props.accessCodeRequired && (
            <label className="field">
              <span>Access code</span>
              <input type="password" required value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
            </label>
          )}
          <button type="submit" disabled={props.pulling}>
            {props.pulling ? "Pulling report…" : "Get full history report"}
          </button>
          {errors.history && <p className="notice warn">{errors.history}</p>}
        </form>
      ) : (
        <p className="muted">
          {providerConfigured === false
            ? "No paid history provider is connected yet. Pull a report from one of these sources, then tick anything it shows below."
            : errors.history ?? "Loading…"}
        </p>
      )}
      <ul className="links">
        {reportLinks(vin).map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>

      <fieldset className="flags">
        <legend>What the history report shows</legend>
        {(Object.keys(FLAG_LABELS) as (keyof HistoryFlags)[]).map((key) => (
          <label key={key}>
            <input type="checkbox" checked={flags[key]} onChange={(e) => onFlagsChange({ ...flags, [key]: e.target.checked })} />
            {FLAG_LABELS[key]}
          </label>
        ))}
      </fieldset>

      <h3>Recalls {recalls && <span className="pill">{recalls.length}</span>}</h3>
      {errors.recalls && <p className="notice">{errors.recalls}</p>}
      {recalls && recalls.length === 0 && <p className="muted">No recall campaigns for this model year.</p>}
      {recalls?.map((r) => (
        <details key={r.NHTSACampaignNumber} className="item">
          <summary>
            <strong>{r.Component}</strong> <span className="muted">#{r.NHTSACampaignNumber} · {formatDate(r.ReportReceivedDate)}</span>
          </summary>
          <p>{r.Summary}</p>
          {r.Consequence && <p><strong>Risk:</strong> {r.Consequence}</p>}
          {r.Remedy && <p><strong>Remedy:</strong> {r.Remedy}</p>}
        </details>
      ))}

      <h3>Owner complaints {complaints && <span className="pill">{complaints.length}</span>}</h3>
      {errors.complaints && <p className="notice">{errors.complaints}</p>}
      {complaints && (
        <p className="muted">
          {serious.length} involve a crash, fire, injury or death. These are for the model, not this specific car.
        </p>
      )}
      {shown.map((c) => (
        <details key={c.odiNumber} className="item">
          <summary>
            <strong>{c.components}</strong>{" "}
            <span className="muted">
              {formatDate(c.dateOfIncident)}
              {c.crash ? " · crash" : ""}
              {c.fire ? " · fire" : ""}
              {c.numberOfInjuries ? ` · ${c.numberOfInjuries} injured` : ""}
            </span>
          </summary>
          <p>{c.summary}</p>
        </details>
      ))}
      {complaints && complaints.length > shown.length && (
        <button className="link" onClick={() => setShowAllComplaints(true)}>
          Show all {complaints.length} complaints
        </button>
      )}

      <h3>NHTSA crash ratings</h3>
      {errors.ratings && <p className="notice">{errors.ratings}</p>}
      {ratings && ratings.length === 0 && <p className="muted">Not rated by NHTSA.</p>}
      {ratings?.map((r) => (
        <div key={r.VehicleDescription} className="rating">
          <span>{r.VehicleDescription}</span>
          <span className="stars" aria-label={`Overall ${r.OverallRating} stars`}>
            {r.OverallRating === "Not Rated" ? "Not rated" : `${"★".repeat(Number(r.OverallRating) || 0)} overall`}
          </span>
        </div>
      ))}
    </section>
  );
}
