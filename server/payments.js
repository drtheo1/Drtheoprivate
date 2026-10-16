// Paystack checkout for paid duty estimates and history reports, priced in cedis.
// Customers pay with mobile money or card on Paystack's page and come back with a
// reference; the server verifies it and hands the browser an access token for that VIN.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadPurchase, savePurchase } from "./store.js";

const API = () => process.env.PAYSTACK_API_BASE ?? "https://api.paystack.co";
const REFERENCE_RE = /^gvdc_[a-z0-9]{8,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GRANTS = { duty: ["duty"], history: ["history"], bundle: ["duty", "history"] };

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Tokens are signed with SESSION_SECRET. Without it a random key is used, which signs
// everyone out whenever the server restarts.
let fallbackSecret;
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString("hex");
    console.warn("SESSION_SECRET is not set; purchases will stop working after a restart.");
  }
  return fallbackSecret;
}

export const freeAccess = () => process.env.FREE_ACCESS === "1";
export const paymentsEnabled = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

export function prices() {
  const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
  return {
    enabled: paymentsEnabled(),
    free: freeAccess(),
    currency: "GHS",
    duty: num(process.env.PRICE_DUTY_GHS, 20),
    history: num(process.env.PRICE_HISTORY_GHS, 60),
    bundle: num(process.env.PRICE_BUNDLE_GHS, 70),
    dutyAccessDays: num(process.env.DUTY_ACCESS_DAYS, 30),
  };
}

const sign = (reference) => createHmac("sha256", sessionSecret()).update(reference).digest("hex").slice(0, 40);
export const tokenFor = (reference) => `${reference}.${sign(reference)}`;

function referenceFromToken(token) {
  const [reference, mac] = String(token).split(".");
  if (!REFERENCE_RE.test(reference ?? "") || !mac) return null;
  const expected = Buffer.from(sign(reference));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected) ? reference : null;
}

/** True when one of the tokens is a paid purchase covering this product for this VIN. */
export async function hasAccess(tokenHeader, vin, product) {
  if (freeAccess()) return true;
  const tokens = String(tokenHeader ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
  for (const token of tokens) {
    const reference = referenceFromToken(token);
    if (!reference) continue;
    const p = await loadPurchase(reference);
    if (!p || p.status !== "paid" || p.vin !== vin || !p.grants.includes(product)) continue;
    if (product === "duty") {
      const days = prices().dutyAccessDays;
      if (Date.now() - Date.parse(p.paidAt) > days * 864e5) continue;
    }
    return true;
  }
  return false;
}

async function paystack(path, init = {}) {
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json" },
  }).catch(() => {
    throw httpError(502, "Could not reach Paystack. Try again shortly.");
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw httpError(502, `Paystack: ${body.message ?? res.status}`);
  return body.data;
}

export async function startCheckout({ vin, product, email }, appUrl) {
  if (!paymentsEnabled()) throw httpError(503, "Payments are not set up yet.");
  if (!GRANTS[product]) throw httpError(400, "Unknown product");
  if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 200) throw httpError(400, "Enter a valid email for your receipt");

  const price = prices()[product];
  const reference = `gvdc_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  const purchase = {
    reference,
    vin,
    product,
    grants: GRANTS[product],
    amount: Math.round(price * 100), // pesewas
    currency: "GHS",
    email,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await savePurchase(purchase);
  const data = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: purchase.amount,
      currency: "GHS",
      reference,
      callback_url: `${appUrl}/?vin=${vin}`,
      metadata: { vin, product },
    }),
  });
  return { authorizationUrl: data.authorization_url, reference };
}

async function markPaid(purchase, tx) {
  if (purchase.status === "paid") return purchase;
  if (tx.status !== "success") return purchase;
  if (tx.currency !== purchase.currency || Number(tx.amount) < purchase.amount) {
    console.error(`Paystack amount mismatch for ${purchase.reference}`);
    return purchase;
  }
  const paid = { ...purchase, status: "paid", paidAt: new Date().toISOString(), paystackId: tx.id };
  await savePurchase(paid);
  return paid;
}

/** Called when the customer returns from Paystack, or to restore a purchase from the receipt reference. */
export async function verifyCheckout(reference) {
  if (!REFERENCE_RE.test(String(reference ?? ""))) throw httpError(400, "That is not a valid payment reference");
  let purchase = await loadPurchase(reference);
  if (!purchase) throw httpError(404, "Payment not found");
  if (purchase.status !== "paid") {
    if (!paymentsEnabled()) throw httpError(503, "Payments are not set up yet.");
    purchase = await markPaid(purchase, await paystack(`/transaction/verify/${encodeURIComponent(reference)}`));
  }
  if (purchase.status !== "paid") throw httpError(402, "Payment has not gone through yet. If you were charged, wait a minute and try again.");
  return { token: tokenFor(reference), vin: purchase.vin, grants: purchase.grants, paidAt: purchase.paidAt };
}

/** Paystack webhook: confirms payments even if the customer closes the page before returning. */
export async function handleWebhook(rawBody, signature) {
  if (!paymentsEnabled()) throw httpError(503, "Payments are not set up");
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const given = Buffer.from(String(signature ?? ""));
  if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected))) throw httpError(401, "Bad signature");
  const event = JSON.parse(rawBody.toString("utf8"));
  if (event.event === "charge.success" && REFERENCE_RE.test(event.data?.reference ?? "")) {
    const purchase = await loadPurchase(event.data.reference);
    if (purchase) await markPaid(purchase, event.data);
  }
  return { received: true };
}
