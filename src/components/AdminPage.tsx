import { useEffect, useState } from "react";
import { DEFAULT_RATES, type AgeBand, type GhanaRates } from "../config/ghanaRates";
import { api } from "../lib/api";

const PASSWORD_KEY = "gvdc.admin";

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (fraction: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.05}
        value={+(value * 100).toFixed(4)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </label>
  );
}

const SIMPLE: [keyof GhanaRates, string][] = [
  ["vat", "VAT %"],
  ["nhil", "NHIL %"],
  ["getfund", "GETFund levy %"],
  ["ecowasLevy", "ECOWAS levy %"],
  ["auLevy", "AU levy %"],
  ["eximLevy", "EXIM levy %"],
  ["specialImportLevy", "Special import levy %"],
  ["networkCharge", "ICUMS network charge % (on FOB)"],
  ["electricDuty", "Import duty % electric cars"],
];

const CATEGORY_LABELS: Record<keyof GhanaRates["categoryDuty"], string> = {
  pickup: "Pickups",
  bus: "Buses and vans",
  truck: "Trucks",
  motorcycle: "Motorcycles",
};

const ageLabel = (bands: AgeBand[], i: number) => {
  const from = i === 0 ? 0 : bands[i - 1].maxYears;
  return bands[i].maxYears === Infinity ? `over ${from} years` : `${from} to ${bands[i].maxYears} years`;
};

export function AdminPage() {
  const [password, setPassword] = useState(() => {
    try {
      return sessionStorage.getItem(PASSWORD_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [rates, setRates] = useState<GhanaRates>(DEFAULT_RATES);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [note, setNote] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .rates()
      .then((doc) => {
        if (!doc) return;
        setRates(doc.rates);
        setExchangeRate(doc.exchangeRate);
        setNote(doc.note);
        setUpdatedAt(doc.updatedAt);
      })
      .catch((err) => setStatus({ ok: false, text: `Could not load current rates: ${err.message}` }));
  }, []);

  const setBand = (key: "passengerDutyBands" | "depreciation" | "overagePenalty", i: number, rate: number) =>
    setRates({ ...rates, [key]: (rates[key] as { rate: number }[]).map((b, j) => (j === i ? { ...b, rate } : b)) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const doc = await api.saveRates(password, rates, exchangeRate, note);
      setUpdatedAt(doc.updatedAt);
      try {
        sessionStorage.setItem(PASSWORD_KEY, password);
      } catch {
        /* storage unavailable */
      }
      setStatus({ ok: true, text: "Saved. Everyone using the app now sees these rates." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin">
      <p>
        <a href="#">Back to the checker</a>
      </p>
      <form className="card" onSubmit={save}>
        <h1>Weekly rate update</h1>
        <p className="muted">
          {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}.` : "No rates saved yet; the built in defaults are in use."} Check
          the ICUMS portal for the customs exchange rate and any GRA notices, then save.
        </p>

        <h3>This week</h3>
        <div className="grid">
          <label className="field">
            <span>Customs exchange rate (GH₵ per USD)</span>
            <input type="number" inputMode="decimal" min={0} step={0.0001} required value={exchangeRate || ""} onChange={(e) => setExchangeRate(Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Note shown to users (optional)</span>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rates confirmed with GRA notice of 12 October" />
        </label>

        <h3>Import duty</h3>
        <div className="grid">
          {rates.passengerDutyBands.map((b, i) => (
            <PercentField
              key={i}
              label={`Cars ${i === 0 ? "up to" : `${rates.passengerDutyBands[i - 1].maxCc + 1} to`} ${b.maxCc === Infinity ? "any size" : `${b.maxCc} cc`} %`}
              value={b.rate}
              onChange={(n) => setBand("passengerDutyBands", i, n)}
            />
          ))}
          {(Object.keys(rates.categoryDuty) as (keyof GhanaRates["categoryDuty"])[]).map((k) => (
            <PercentField key={k} label={`${CATEGORY_LABELS[k]} %`} value={rates.categoryDuty[k]} onChange={(n) => setRates({ ...rates, categoryDuty: { ...rates.categoryDuty, [k]: n } })} />
          ))}
        </div>

        <h3>Levies and taxes</h3>
        <div className="grid">
          {SIMPLE.map(([k, label]) => (
            <PercentField key={k} label={label} value={rates[k] as number} onChange={(n) => setRates({ ...rates, [k]: n })} />
          ))}
        </div>

        <h3>HDV depreciation by age</h3>
        <div className="grid">
          {rates.depreciation.map((_, i) => (
            <PercentField key={i} label={ageLabel(rates.depreciation, i)} value={rates.depreciation[i].rate} onChange={(n) => setBand("depreciation", i, n)} />
          ))}
        </div>

        <h3>Overage penalty by age</h3>
        <div className="grid">
          {rates.overagePenalty.map((_, i) => (
            <PercentField key={i} label={ageLabel(rates.overagePenalty, i)} value={rates.overagePenalty[i].rate} onChange={(n) => setBand("overagePenalty", i, n)} />
          ))}
        </div>

        <h3>Age limit</h3>
        <div className="grid">
          <label className="field">
            <span>Maximum age on arrival (years)</span>
            <input type="number" min={1} value={rates.maxImportAgeYears} onChange={(e) => setRates({ ...rates, maxImportAgeYears: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Age limit applies from</span>
            <input type="date" required value={rates.ageLimitEffective} onChange={(e) => setRates({ ...rates, ageLimitEffective: e.target.value })} />
          </label>
        </div>

        <div className="actions">
          <label className="field">
            <span>Admin password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save rates"}
          </button>
          <button type="button" className="secondary" onClick={() => setRates(DEFAULT_RATES)}>
            Load built in defaults
          </button>
        </div>
        {status && <p className={status.ok ? "notice ok" : "notice warn"}>{status.text}</p>}
      </form>
    </main>
  );
}
