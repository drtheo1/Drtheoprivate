import { useState } from "react";
import type { FuelType, GhanaRates, VehicleCategory } from "../config/ghanaRates";
import { DEFAULT_RATES, RATES_AS_OF, RATE_SOURCES } from "../config/ghanaRates";
import type { DutyInput, DutyResult } from "../lib/duty";

interface Props {
  input: DutyInput;
  onInputChange: (input: DutyInput) => void;
  rates: GhanaRates;
  onRatesChange: (rates: GhanaRates) => void;
  result: DutyResult;
}

const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
const ghs = (n: number) => `GH₵ ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

function NumberField(props: { label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={props.step ?? 1}
        value={Number.isFinite(props.value) && props.value !== 0 ? props.value : ""}
        onChange={(e) => props.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
      {props.hint && <small className="muted">{props.hint}</small>}
    </label>
  );
}

const SIMPLE_RATES: [keyof GhanaRates, string][] = [
  ["vat", "VAT"],
  ["nhil", "NHIL"],
  ["getfund", "GETFund levy"],
  ["ecowasLevy", "ECOWAS levy"],
  ["auLevy", "AU levy"],
  ["eximLevy", "EXIM levy"],
  ["specialImportLevy", "Special import levy"],
  ["networkCharge", "ICUMS network charge"],
  ["electricDuty", "Duty on electric cars"],
];

export function DutyCalculator({ input, onInputChange, rates, onRatesChange, result }: Props) {
  const [showRates, setShowRates] = useState(false);
  const set = <K extends keyof DutyInput>(key: K, value: DutyInput[K]) => onInputChange({ ...input, [key]: value });
  const setBand = (i: number, rate: number) =>
    onRatesChange({ ...rates, passengerDutyBands: rates.passengerDutyBands.map((b, j) => (j === i ? { ...b, rate } : b)) });

  return (
    <section className="card">
      <h2>Ghana port duty estimate</h2>

      <div className="grid">
        <label className="field">
          <span>Vehicle category</span>
          <select value={input.category} onChange={(e) => set("category", e.target.value as VehicleCategory)}>
            <option value="passenger">Car, SUV or minivan</option>
            <option value="pickup">Pickup</option>
            <option value="bus">Bus or van (10+ seats)</option>
            <option value="truck">Truck or goods vehicle</option>
            <option value="motorcycle">Motorcycle</option>
          </select>
        </label>
        <label className="field">
          <span>Fuel</span>
          <select value={input.fuel} onChange={(e) => set("fuel", e.target.value as FuelType)}>
            <option value="petrol">Petrol</option>
            <option value="diesel">Diesel</option>
            <option value="hybrid">Hybrid</option>
            <option value="electric">Electric</option>
          </select>
        </label>
        <NumberField label="Engine capacity (cc)" value={input.engineCc} onChange={(n) => set("engineCc", n)} step={100} />
        <NumberField label="Year of manufacture" value={input.manufactureYear} onChange={(n) => set("manufactureYear", n)} />
        <label className="field">
          <span>Month of manufacture</span>
          <select
            value={input.manufactureMonth ?? ""}
            onChange={(e) => set("manufactureMonth", e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Unknown</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
          <small className="muted">Printed on the driver door jamb label.</small>
        </label>
        <label className="field">
          <span>Expected arrival in Ghana</span>
          <input type="date" value={input.arrivalDate} onChange={(e) => set("arrivalDate", e.target.value)} />
        </label>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Valuation method">
        <button className={input.valuationMode === "invoice" ? "on" : ""} onClick={() => set("valuationMode", "invoice")}>
          Price I paid (FOB)
        </button>
        <button className={input.valuationMode === "hdv" ? "on" : ""} onClick={() => set("valuationMode", "hdv")}>
          Customs HDV method
        </button>
      </div>
      <p className="muted small">
        {input.valuationMode === "hdv"
          ? "Customs usually values used cars from the home delivery value (the new price, close to MSRP) less a depreciation allowance by age. This is closer to what ICUMS charges."
          : "Uses your purchase price. ICUMS often assesses a higher value than the auction or dealer price, so treat this as a lower bound."}
      </p>

      <div className="grid">
        {input.valuationMode === "hdv" ? (
          <NumberField label="Home delivery value / MSRP (USD)" value={input.hdvUsd} onChange={(n) => set("hdvUsd", n)} step={500} />
        ) : (
          <NumberField label="Purchase price, FOB (USD)" value={input.fobUsd} onChange={(n) => set("fobUsd", n)} step={100} />
        )}
        <NumberField label="Shipping to Tema (USD)" value={input.freightUsd} onChange={(n) => set("freightUsd", n)} step={50} />
        <NumberField label="Marine insurance (USD)" value={input.insuranceUsd} onChange={(n) => set("insuranceUsd", n)} step={10} hint="Leave empty to use 1% of FOB plus freight." />
        <NumberField label="Exchange rate (GH₵ per USD)" value={input.exchangeRate} onChange={(n) => set("exchangeRate", n)} step={0.01} hint="Use the customs rate on the ICUMS portal for the week." />
      </div>

      {result.warnings.map((w, i) => (
        <p key={w} className={result.blockedByAge && i === 0 ? "notice warn" : "notice"}>
          {w}
        </p>
      ))}

      <table className="breakdown">
        <tbody>
          <tr className="sub">
            <td>Vehicle age on arrival</td>
            <td colSpan={2}>{result.ageYears.toFixed(1)} years</td>
          </tr>
          {input.valuationMode === "hdv" && (
            <tr className="sub">
              <td>Depreciation allowed</td>
              <td colSpan={2}>{pct(result.depreciationRate)}</td>
            </tr>
          )}
          <tr className="sub">
            <td>FOB value</td>
            <td colSpan={2}>{usd(result.fobUsd)}</td>
          </tr>
          <tr className="sub">
            <td>CIF value (FOB + freight + insurance)</td>
            <td colSpan={2}>{usd(result.cifUsd)}</td>
          </tr>
        </tbody>
        <thead>
          <tr>
            <th>Charge</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.key}>
              <td>
                {l.label}
                <small className="muted"> on {l.base}</small>
              </td>
              <td>{pct(l.rate)}</td>
              <td>
                {usd(l.usd)}
                {input.exchangeRate > 0 && <small className="muted block">{ghs(l.usd * input.exchangeRate)}</small>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Estimated duty and taxes</td>
            <td />
            <td>
              <strong>{usd(result.totalUsd)}</strong>
              {input.exchangeRate > 0 && <strong className="block">{ghs(result.totalGhs)}</strong>}
            </td>
          </tr>
          <tr className="sub">
            <td>Landed cost (CIF + duty and taxes)</td>
            <td />
            <td>{usd(result.landedUsd)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="muted small">
        Excludes clearing agent fees, port handling and storage, DVLA registration and roadworthy fees. This is an estimate;
        the ICUMS assessment at the port is final.
      </p>

      <button className="link" onClick={() => setShowRates(!showRates)}>
        {showRates ? "Hide" : "Edit"} rates (last reviewed {RATES_AS_OF})
      </button>
      {showRates && (
        <div className="rates">
          <p className="muted small">
            Rates change with each budget. Adjust them here if GRA publishes new figures. Changes apply only in this browser.
          </p>
          <div className="grid">
            {rates.passengerDutyBands.map((b, i) => (
              <NumberField
                key={i}
                label={`Car duty % ${i === 0 ? "up to" : `${rates.passengerDutyBands[i - 1].maxCc + 1} to`} ${b.maxCc === Infinity ? "any" : b.maxCc} cc`}
                value={+(b.rate * 100).toFixed(3)}
                onChange={(n) => setBand(i, n / 100)}
                step={0.5}
              />
            ))}
            {(Object.keys(rates.categoryDuty) as (keyof GhanaRates["categoryDuty"])[]).map((k) => (
              <NumberField
                key={k}
                label={`Duty % ${k}`}
                value={+(rates.categoryDuty[k] * 100).toFixed(3)}
                onChange={(n) => onRatesChange({ ...rates, categoryDuty: { ...rates.categoryDuty, [k]: n / 100 } })}
                step={0.5}
              />
            ))}
            {SIMPLE_RATES.map(([k, label]) => (
              <NumberField
                key={k}
                label={`${label} %`}
                value={+((rates[k] as number) * 100).toFixed(3)}
                onChange={(n) => onRatesChange({ ...rates, [k]: n / 100 })}
                step={0.05}
              />
            ))}
          </div>
          <button className="secondary" onClick={() => onRatesChange(DEFAULT_RATES)}>
            Reset to defaults
          </button>
          <h4>Where these figures come from</h4>
          <ul className="links">
            {RATE_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
