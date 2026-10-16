// File based storage for the weekly rates and for paid history reports.
// On a cloud host, point DATA_DIR at a persistent disk or the data is lost on redeploy.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data"),
);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

const ratesFile = () => path.join(DATA_DIR, "rates.json");
const historyFile = (vin) => path.join(DATA_DIR, "history", `${vin}.json`);
const usageFile = () => path.join(DATA_DIR, "history-usage.json");

export const loadRates = () => readJson(ratesFile());
export const saveRates = (doc) => writeJson(ratesFile(), doc);

/** Cached paid reports are stored raw so the field mapping can improve without paying again. */
export const loadHistory = (vin) => readJson(historyFile(vin));
export const saveHistory = (vin, entry) => writeJson(historyFile(vin), entry);

/** Counts paid pulls per UTC day so a daily limit can protect the bill. */
export async function recordPull() {
  const day = new Date().toISOString().slice(0, 10);
  const usage = (await readJson(usageFile())) ?? {};
  usage[day] = (usage[day] ?? 0) + 1;
  await writeJson(usageFile(), usage);
  return usage[day];
}

export async function pullsToday() {
  const usage = (await readJson(usageFile())) ?? {};
  return usage[new Date().toISOString().slice(0, 10)] ?? 0;
}

const purchaseFile = (reference) => path.join(DATA_DIR, "purchases", `${reference}.json`);
export const loadPurchase = (reference) => readJson(purchaseFile(reference));
export const savePurchase = (purchase) => writeJson(purchaseFile(purchase.reference), purchase);
