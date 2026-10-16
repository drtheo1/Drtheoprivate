import { useEffect, useMemo, useState } from "react";
import { DEFAULT_RATES, type RatesDoc } from "./config/ghanaRates";
import { api, type Complaint, type DecodedVehicle, type HistoryReport, type Recall, type SafetyRating } from "./lib/api";
import { calculateDuty, type DutyInput } from "./lib/duty";
import { assessEligibility, EMPTY_FLAGS, flagsFromReport, type HistoryFlags } from "./lib/eligibility";
import { checkVin, type VinCheck } from "./lib/vin";
import { VehicleCard } from "./components/VehicleCard";
import { HistoryPanel } from "./components/HistoryPanel";
import { DutyCalculator } from "./components/DutyCalculator";

const inSixWeeks = () => new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10);

const initialInput = (): DutyInput => ({
  category: "passenger",
  fuel: "petrol",
  engineCc: 2000,
  manufactureYear: new Date().getFullYear() - 5,
  arrivalDate: inSixWeeks(),
  valuationMode: "invoice",
  fobUsd: 10000,
  hdvUsd: 0,
  freightUsd: 1500,
  insuranceUsd: 0,
  exchangeRate: 0,
});

const VERDICT_TEXT = {
  blocked: "Do not ship: this vehicle is likely to be refused in Ghana",
  risk: "Proceed with caution",
  clear: "No blocking issues found",
};

export default function App() {
  const [vinText, setVinText] = useState("");
  const [check, setCheck] = useState<VinCheck | null>(null);
  const [vehicle, setVehicle] = useState<DecodedVehicle | null>(null);
  const [recalls, setRecalls] = useState<Recall[] | null>(null);
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [ratings, setRatings] = useState<SafetyRating[] | null>(null);
  const [report, setReport] = useState<HistoryReport | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [flags, setFlags] = useState<HistoryFlags>(EMPTY_FLAGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState<DutyInput>(initialInput);
  const [ratesDoc, setRatesDoc] = useState<RatesDoc | null>(null);
  const rates = ratesDoc?.rates ?? DEFAULT_RATES;

  useEffect(() => {
    api
      .rates()
      .then((doc) => {
        if (!doc) return;
        setRatesDoc(doc);
        // Start from this week's customs rate; the user can still type their own.
        setInput((prev) => (prev.exchangeRate > 0 ? prev : { ...prev, exchangeRate: doc.exchangeRate }));
      })
      .catch(() => {
        /* fall back to the built in defaults */
      });
  }, []);

  const result = useMemo(() => calculateDuty(input, rates), [input, rates]);
  const eligibility = useMemo(
    () => assessEligibility(flags, result.blockedByAge, recalls?.length ?? 0),
    [flags, result.blockedByAge, recalls],
  );

  async function pullReport(accessCode: string) {
    if (!check?.valid) return;
    setPulling(true);
    setErrors(({ history: _ignored, ...rest }) => rest);
    try {
      const h = await api.pullHistory(check.vin, accessCode);
      if (h.report) {
        setReport(h.report);
        setFlags(flagsFromReport(h.report));
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, history: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPulling(false);
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = checkVin(vinText);
    setCheck(c);
    setVehicle(null);
    setRecalls(null);
    setComplaints(null);
    setRatings(null);
    setReport(null);
    setProviderConfigured(null);
    setFlags(EMPTY_FLAGS);
    setErrors({});
    if (!c.valid) return;

    setLoading(true);
    const fail = (key: string) => (err: unknown) =>
      setErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : String(err) }));

    api
      .history(c.vin)
      .then((h) => {
        setProviderConfigured(h.configured);
        setAccessCodeRequired(h.accessCodeRequired);
        if (h.report) {
          setReport(h.report);
          setFlags(flagsFromReport(h.report));
        }
      })
      .catch(fail("history"));

    try {
      const v = await api.decode(c.vin);
      setVehicle(v);
      setInput((prev) => ({
        ...prev,
        category: v.category,
        fuel: v.fuel,
        engineCc: v.engineCc ?? prev.engineCc,
        manufactureYear: v.year ?? c.modelYears[0] ?? prev.manufactureYear,
        manufactureMonth: undefined,
      }));
      if (v.make && v.model && v.year) {
        await Promise.all([
          api.recalls(v).then(setRecalls).catch(fail("recalls")),
          api.complaints(v).then(setComplaints).catch(fail("complaints")),
          api.ratings(v).then(setRatings).catch(fail("ratings")),
        ]);
      }
    } catch (err) {
      fail("decode")(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="hero">
        <h1>Ghana Vehicle Duty Checker</h1>
        <p>Check the North American history of a car by VIN and estimate what it will cost to clear at Tema or Takoradi.</p>
        <form className="search" onSubmit={lookup}>
          <input
            aria-label="VIN"
            placeholder="Enter 17 character VIN"
            value={vinText}
            maxLength={20}
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setVinText(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Checking…" : "Check vehicle"}
          </button>
        </form>
        {check && !check.valid && (
          <ul className="notice warn">
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {errors.decode && <p className="notice warn">Could not decode the VIN: {errors.decode}</p>}
        <p className="muted small">No VIN yet? Skip straight to the duty estimate below and fill the details in by hand.</p>
      </header>

      <main>
        {check?.valid && (
          <section className={`verdict ${eligibility.verdict}`} aria-live="polite">
            <h2>{VERDICT_TEXT[eligibility.verdict]}</h2>
            <ul>
              {eligibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="columns">
          <div>
            {vehicle && check && <VehicleCard vehicle={vehicle} check={check} />}
            {check?.valid && (
              <HistoryPanel
                vin={check.vin}
                recalls={recalls}
                complaints={complaints}
                ratings={ratings}
                report={report}
                providerConfigured={providerConfigured}
                accessCodeRequired={accessCodeRequired}
                pulling={pulling}
                onPullReport={pullReport}
                flags={flags}
                onFlagsChange={setFlags}
                errors={errors}
              />
            )}
          </div>
          <DutyCalculator
            input={input}
            onInputChange={setInput}
            rates={rates}
            ratesUpdatedAt={ratesDoc?.updatedAt ?? ""}
            ratesNote={ratesDoc?.note ?? ""}
            result={result}
          />
        </div>
      </main>

      <footer className="muted small">
        Estimates only, not tax advice. Vehicle data from the US NHTSA. Confirm duty with the Ghana Revenue Authority and your
        clearing agent before you buy.
      </footer>
    </>
  );
}
