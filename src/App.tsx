import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RATES } from "./config/ghanaRates";
import {
  api,
  type Complaint,
  type DecodedVehicle,
  type HistoryReport,
  type Prices,
  type PublicRates,
  type Purchase,
  type Recall,
  type SafetyRating,
} from "./lib/api";
import { isBlockedByAge, vehicleAgeYears, type DutyInput, type DutyResult } from "./lib/duty";
import { assessEligibility, EMPTY_FLAGS, flagsFromReport, type HistoryFlags } from "./lib/eligibility";
import { covers, loadPurchases, savePurchase, tokensFor } from "./lib/purchases";
import { checkVin, type VinCheck } from "./lib/vin";
import { VehicleCard } from "./components/VehicleCard";
import { HistoryPanel } from "./components/HistoryPanel";
import { DutyCalculator } from "./components/DutyCalculator";
import { Paywall } from "./components/Paywall";

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

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const [vinText, setVinText] = useState("");
  const [check, setCheck] = useState<VinCheck | null>(null);
  const [vehicle, setVehicle] = useState<DecodedVehicle | null>(null);
  const [recalls, setRecalls] = useState<Recall[] | null>(null);
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [ratings, setRatings] = useState<SafetyRating[] | null>(null);
  const [report, setReport] = useState<HistoryReport | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [pulling, setPulling] = useState(false);
  const [flags, setFlags] = useState<HistoryFlags>(EMPTY_FLAGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState<DutyInput>(initialInput);
  const [publicRates, setPublicRates] = useState<PublicRates | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>(loadPurchases);
  const [paymentNotice, setPaymentNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dutyResult, setDutyResult] = useState<DutyResult | null>(null);
  const [dutyLoading, setDutyLoading] = useState(false);
  const lookupId = useRef(0);

  const vin = check?.valid ? check.vin : null;
  const free = prices?.free ?? false;
  const accessDays = prices?.dutyAccessDays ?? 30;
  const hasDuty = Boolean(vin) && (free || covers(purchases, vin!, "duty", accessDays));
  const hasHistory = Boolean(vin) && (free || covers(purchases, vin!, "history", accessDays));
  const tokens = vin ? tokensFor(purchases, vin) : "";

  const setError = (key: string, err: unknown) => setErrors((prev) => ({ ...prev, [key]: message(err) }));
  const clearError = (key: string) => setErrors(({ [key]: _gone, ...rest }) => rest);

  function addPurchase(p: Purchase) {
    setPurchases(savePurchase(p));
  }

  async function pullReport(forVin = vin, withTokens = tokens) {
    if (!forVin) return;
    setPulling(true);
    clearError("history");
    try {
      const h = await api.pullHistory(forVin, withTokens);
      if (h.report) {
        setReport(h.report);
        setFlags(flagsFromReport(h.report));
      }
    } catch (err) {
      setError("history", err);
    } finally {
      setPulling(false);
    }
  }

  async function runLookup(raw: string, list = purchases) {
    const c = checkVin(raw);
    const id = ++lookupId.current;
    setCheck(c);
    setVehicle(null);
    setRecalls(null);
    setComplaints(null);
    setRatings(null);
    setReport(null);
    setProviderConfigured(null);
    setFlags(EMPTY_FLAGS);
    setDutyResult(null);
    setErrors({});
    if (!c.valid) return;

    setLoading(true);
    const current = () => id === lookupId.current;
    const vinTokens = tokensFor(list, c.vin);

    api
      .history(c.vin, vinTokens)
      .then((h) => {
        if (!current()) return;
        setProviderConfigured(h.configured);
        if (h.report) {
          setReport(h.report);
          setFlags(flagsFromReport(h.report));
        } else if (h.configured && h.paid) {
          // Paid but not pulled yet, usually straight after checkout.
          void pullReport(c.vin, vinTokens);
        }
      })
      .catch((err) => current() && setError("history", err));

    try {
      const v = await api.decode(c.vin);
      if (!current()) return;
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
          api.recalls(v).then((r) => current() && setRecalls(r)).catch((err) => setError("recalls", err)),
          api.complaints(v).then((r) => current() && setComplaints(r)).catch((err) => setError("complaints", err)),
          api.ratings(v).then((r) => current() && setRatings(r)).catch((err) => setError("ratings", err)),
        ]);
      }
    } catch (err) {
      if (current()) setError("decode", err);
    } finally {
      if (current()) setLoading(false);
    }
  }

  // Load prices and this week's exchange rate, and finish a payment if we are back from Paystack.
  useEffect(() => {
    api.prices().then(setPrices).catch(() => setPrices(null));
    api
      .rates()
      .then((r) => {
        setPublicRates(r);
        setInput((prev) => (prev.exchangeRate > 0 || !r.exchangeRate ? prev : { ...prev, exchangeRate: r.exchangeRate }));
      })
      .catch(() => {
        /* the calculator still works with a typed exchange rate */
      });

    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    const returnVin = params.get("vin");
    if (!reference && !returnVin) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    if (returnVin) setVinText(returnVin);
    if (!reference) {
      if (returnVin) void runLookup(returnVin);
      return;
    }
    api
      .verify(reference)
      .then((p) => {
        const list = savePurchase(p);
        setPurchases(list);
        setPaymentNotice({ ok: true, text: "Payment received, thank you. Your results are unlocked below." });
        setVinText(p.vin);
        void runLookup(p.vin, list);
      })
      .catch((err) => {
        setPaymentNotice({
          ok: false,
          text: `${message(err)} Your payment reference is ${reference}; use it to restore the purchase or when contacting us.`,
        });
        if (returnVin) void runLookup(returnVin);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The duty estimate is calculated on the server, so it only appears once paid for.
  useEffect(() => {
    if (!vin || !hasDuty) {
      setDutyResult(null);
      return;
    }
    let cancelled = false;
    setDutyLoading(true);
    const timer = setTimeout(() => {
      api
        .duty(vin, input, tokens)
        .then(({ result }) => {
          if (cancelled) return;
          setDutyResult(result);
          clearError("duty");
        })
        .catch((err) => !cancelled && setError("duty", err))
        .finally(() => !cancelled && setDutyLoading(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vin, hasDuty, input, tokens]);

  const blockedByAge = useMemo(() => {
    const age = vehicleAgeYears(input.manufactureYear, input.manufactureMonth, input.arrivalDate);
    return isBlockedByAge(age, input.arrivalDate, publicRates ?? DEFAULT_RATES);
  }, [input.manufactureYear, input.manufactureMonth, input.arrivalDate, publicRates]);

  const eligibility = useMemo(
    () => assessEligibility(flags, blockedByAge, recalls?.length ?? 0),
    [flags, blockedByAge, recalls],
  );

  return (
    <>
      <header className="hero">
        <h1>Ghana Vehicle Duty Checker</h1>
        <p>Check the North American history of a car by VIN and estimate what it will cost to clear at Tema or Takoradi.</p>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPaymentNotice(null);
            void runLookup(vinText);
          }}
        >
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
        {paymentNotice && <p className={paymentNotice.ok ? "notice ok" : "notice warn"}>{paymentNotice.text}</p>}
        {check && !check.valid && (
          <ul className="notice warn">
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {errors.decode && <p className="notice warn">Could not decode the VIN: {errors.decode}</p>}
        <p className="muted small">
          Free: vehicle details, recalls, complaints, crash ratings and the age check. Paid: the full duty breakdown and the full
          history report.
        </p>
      </header>

      <main>
        {vin && (
          <section className={`verdict ${eligibility.verdict}`} aria-live="polite">
            <h2>{VERDICT_TEXT[eligibility.verdict]}</h2>
            <ul>
              {eligibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {!hasHistory && providerConfigured && (
              <p className="small">This verdict is only as good as the history it is based on; the full report checks for salvage and flood titles.</p>
            )}
          </section>
        )}

        <div className="columns">
          <div>
            {vehicle && check && <VehicleCard vehicle={vehicle} check={check} />}
            {vin && (
              <HistoryPanel
                vin={vin}
                recalls={recalls}
                complaints={complaints}
                ratings={ratings}
                report={report}
                providerConfigured={providerConfigured}
                paid={hasHistory}
                pulling={pulling}
                onPullReport={() => void pullReport()}
                paywall={<Paywall vin={vin} prices={prices} offers={["history", "bundle"]} what="history report" onPurchase={addPurchase} />}
                flags={flags}
                onFlagsChange={setFlags}
                errors={errors}
              />
            )}
          </div>
          <DutyCalculator
            input={input}
            onInputChange={setInput}
            ratesUpdatedAt={publicRates?.updatedAt ?? ""}
            ratesNote={publicRates?.note ?? ""}
            result={dutyResult}
            loading={hasDuty && dutyLoading && !dutyResult}
            locked={
              <>
                {errors.duty && <p className="notice warn">{errors.duty}</p>}
                <Paywall vin={vin} prices={prices} offers={["duty", "bundle"]} what="duty estimate" onPurchase={addPurchase} />
              </>
            }
          />
        </div>
      </main>

      <footer className="muted small">
        Estimates only, not tax advice. Vehicle data from the US NHTSA; history reports through VinAudit. Payments by Paystack.
        Confirm duty with the Ghana Revenue Authority and your clearing agent before you buy.{" "}
        <a href="#terms">Terms of Service and refund policy</a>
      </footer>
    </>
  );
}
