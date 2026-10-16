import type { Purchase } from "./api";

// Access tokens for paid checks live in this browser. Customers on another device can
// restore a purchase with the reference on their Paystack receipt.
const KEY = "gvdc.purchases";

export function loadPurchases(): Purchase[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.token === "string") : [];
  } catch {
    return [];
  }
}

export function savePurchase(p: Purchase): Purchase[] {
  const list = [p, ...loadPurchases().filter((x) => x.token !== p.token)].slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable; the purchase still works for this visit */
  }
  return list;
}

/** Comma separated tokens for one VIN, sent to the server which decides what they unlock. */
export const tokensFor = (list: Purchase[], vin: string) =>
  list.filter((p) => p.vin === vin).map((p) => p.token).join(",");

export function covers(list: Purchase[], vin: string, product: "duty" | "history", dutyAccessDays: number, now = Date.now()) {
  return list.some(
    (p) =>
      p.vin === vin &&
      p.grants.includes(product) &&
      (product !== "duty" || now - Date.parse(p.paidAt) <= dutyAccessDays * 864e5),
  );
}
