import { useState } from "react";
import { api, type Prices, type Product, type Purchase } from "../lib/api";

const EMAIL_KEY = "gvdc.email";

const LABELS: Record<Product, string> = {
  duty: "Duty estimate",
  history: "Full history report",
  bundle: "Duty estimate + history report",
};

interface Props {
  vin: string | null;
  prices: Prices | null;
  offers: Product[];
  what: string;
  onPurchase: (p: Purchase) => void;
}

const cedis = (n: number) => `GH₵ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function Paywall({ vin, prices, offers, what, onPurchase }: Props) {
  const [product, setProduct] = useState<Product>(offers[0]);
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [reference, setReference] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!vin) {
    return (
      <div className="paywall">
        <p>Check a VIN above to buy the {what} for that vehicle.</p>
      </div>
    );
  }
  if (!prices?.enabled) {
    return (
      <div className="paywall">
        <p className="muted">Payments are not available right now. Please try again later.</p>
      </div>
    );
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem(EMAIL_KEY, email);
    } catch {
      /* storage unavailable */
    }
    try {
      const { authorizationUrl } = await api.checkout(vin!, product, email.trim());
      window.location.assign(authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function restore(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await api.verify(reference.trim());
      if (p.vin !== vin) setError(`That payment was for VIN ${p.vin}. It has been restored; check that VIN to use it.`);
      onPurchase(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paywall">
      <form onSubmit={pay}>
        <fieldset className="offers">
          <legend>Unlock the {what} for this VIN</legend>
          {offers.map((o) => (
            <label key={o} className={product === o ? "offer on" : "offer"}>
              <input type="radio" name={`offer-${what}`} checked={product === o} onChange={() => setProduct(o)} />
              <span>{LABELS[o]}</span>
              <strong>{cedis(prices[o])}</strong>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Email for your receipt</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Opening Paystack…" : `Pay ${cedis(prices[product])} with mobile money or card`}
        </button>
        {product !== "history" && (
          <p className="muted small">The duty estimate stays open for this VIN for {prices.dutyAccessDays} days, so you can try different prices and shipping costs.</p>
        )}
      </form>
      <button className="link" onClick={() => setShowRestore(!showRestore)}>
        Already paid on another device?
      </button>
      {showRestore && (
        <form className="restore" onSubmit={restore}>
          <label className="field">
            <span>Payment reference from your Paystack receipt (starts with gvdc_)</span>
            <input required value={reference} onChange={(e) => setReference(e.target.value)} spellCheck={false} />
          </label>
          <button type="submit" className="secondary" disabled={busy}>
            Restore purchase
          </button>
        </form>
      )}
      {error && <p className="notice warn">{error}</p>}
    </div>
  );
}
