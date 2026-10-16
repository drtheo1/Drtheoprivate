import { useEffect, useState } from "react";
import { api, type AdminPurchase } from "../lib/api";

const cedis = (pesewas: number) => `GH₵ ${(pesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");

export function AdminPurchases({ password }: { password: string }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminPurchase[] | null>(null);
  const [error, setError] = useState("");

  async function search(q = query) {
    setError("");
    try {
      setRows((await api.adminPurchases(password, q.trim())).purchases);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(p: AdminPurchase) {
    const reason = window.prompt(
      `Revoke ${p.reference}?\n\nOnly do this after refunding ${cedis(p.amount)} in the Paystack dashboard. The customer will lose access to the results it unlocked.\n\nReason for the refund:`,
    );
    if (reason === null) return;
    try {
      const updated = await api.revokePurchase(password, p.reference, reason);
      setRows((list) => list?.map((r) => (r.reference === p.reference ? { ...r, ...updated } : r)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="card">
      <h1>Payments</h1>
      <p className="muted">
        Find a payment by its reference, the customer&apos;s email or the VIN. To refund: refund it in the Paystack dashboard
        first, then revoke it here so the customer loses access.
      </p>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input aria-label="Search payments" placeholder="gvdc_…, email or VIN" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        <button type="submit">Search</button>
      </form>
      {error && <p className="notice warn">{error}</p>}
      {rows && rows.length === 0 && <p className="muted">No payments found.</p>}
      {rows?.map((p) => (
        <div key={p.reference} className="purchase">
          <div className="row">
            <span className={`status ${p.status}`}>{p.status}</span>
            <strong>{cedis(p.amount)}</strong>
            <span>{p.product === "bundle" ? "Duty + history" : p.product === "duty" ? "Duty estimate" : "History report"}</span>
            <span className="mono">{p.vin}</span>
          </div>
          <div className="row muted small">
            <span className="mono">{p.reference}</span>
            <span>{p.email}</span>
            <span>Created {when(p.createdAt)}</span>
            {p.paidAt && <span>Paid {when(p.paidAt)}</span>}
            {p.termsVersion && <span>Accepted terms of {p.termsVersion}</span>}
          </div>
          {p.grants.includes("history") && (
            <div className="small">
              {p.reportPulledAt ? `History report delivered ${when(p.reportPulledAt)}.` : "History report not delivered yet."}
            </div>
          )}
          {p.status === "refunded" && (
            <div className="small">
              Refunded {when(p.refundedAt)}
              {p.refundReason ? `: ${p.refundReason}` : ""}
            </div>
          )}
          {p.status === "paid" && (
            <div>
              <button className="secondary" onClick={() => void revoke(p)}>
                Revoke after refund
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
