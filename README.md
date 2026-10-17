# Ghana Vehicle Duty Checker

A web app for anyone buying a used vehicle in the United States or Canada to ship to Ghana. Enter a VIN and it will:

1. **Validate the VIN** (length, forbidden letters, the North American check digit) and work out the model year and country of origin.
2. **Decode the vehicle** through the free NHTSA vPIC service: make, model, trim, body, engine size in cc, fuel, drive, assembly plant.
3. **Show its North American history**
   * Recall campaigns, owner complaints (highlighting crashes, fires and injuries) and NHTSA crash ratings.
   * A full paid history report through VinAudit: title brands, accidents, theft, odometer and auction records. Links to NICB VINCheck, CARFAX, AutoCheck and CARFAX Canada, and a checklist, are there as well.
4. **Estimate Ghana port duty**, prefilled from the decoded vehicle: import duty by engine size and category, overage penalty, VAT, NHIL, GETFund, ECOWAS, AU, EXIM and special import levies, and the ICUMS network charge, in USD and cedis, using rates and an exchange rate you update weekly. It supports both your purchase price and the customs HDV method (new price less the GRA depreciation allowance by age).
5. **Give a verdict** on whether the vehicle is likely to be refused: over the age limit under the GSA pre export verification programme (from 1 October 2026), salvaged or non repairable (banned by Act 1014), structural damage or a theft record.

## Running it

Requires Node 22.6 or newer (the server reuses the TypeScript duty calculator directly).

```bash
npm install
npm test          # unit tests for VIN checks, duty maths and eligibility
npm run build     # builds the frontend into dist/
npm start         # serves the app and the /api proxy on http://localhost:8787
```

For development run `npm start` and `npm run dev` in two terminals; Vite forwards `/api` to the Node server.

The server has no dependencies and can be deployed to any Node host (Render, Railway, Fly.io, a VPS). Set `PORT` if the host requires it.

## Deploying to Render

The repository includes `render.yaml`, which sets up the whole service: a small server in Frankfurt (the Render region closest to Ghana), a 1 GB persistent disk for rates, payments and reports, and all the settings below.

1. Sign up at render.com with your GitHub account and allow Render to see the `Drtheoprivate` repository.
2. In the dashboard choose **New**, then **Blueprint**, pick the repository and the branch that holds the app (`main` once the pull request is merged).
3. Render asks for the values it cannot fill in itself. Fill in `PAYSTACK_SECRET_KEY` and the VinAudit details if you have them. Anything you leave empty can be added later under the service's **Environment** tab. Leave `APP_URL` empty for now.
4. Click **Apply**. The first build takes a few minutes. Your site will be at an address like `https://ghana-vehicle-duty-checker.onrender.com`.
5. Put that address (or your own domain, once connected) into `APP_URL` and save; Render restarts the service.
6. Find the admin password: open the service, go to **Environment**, and reveal `ADMIN_TOKEN`. Use it at `/#admin` to save this week's rates.
7. In the Paystack dashboard, set the webhook URL to `<your address>/api/paystack/webhook`.

Until a Paystack key is set, the site works but the paid sections say payments are not available. Until VinAudit details are set, the history report section shows only the free links and checklist.

To use your own domain, add it under the service's **Settings**, then **Custom Domains**, and follow Render's DNS instructions.

## Server settings

Set these as environment variables on your host.

| Setting | What it does |
| --- | --- |
| `ADMIN_TOKEN` | Password for the weekly rate page. Required to save rates. |
| `DATA_DIR` | Folder for saved rates and paid reports. Must be on a persistent disk. Defaults to `./data`. |
| `HISTORY_PROVIDER` | `vinaudit` (recommended) or `generic`. |
| `VINAUDIT_API_KEY`, `VINAUDIT_USER`, `VINAUDIT_PASS` | From your VinAudit API account. |
| `VINAUDIT_MODE` | Set to `test` while checking the setup; VinAudit returns sample data and does not charge. Remove it to go live. |
| `PAYSTACK_SECRET_KEY` | Secret key from the Paystack dashboard. Use the `sk_test_` key until you are ready to take real money. |
| `APP_URL` | Public address of the site, e.g. `https://yourdomain.com`. Customers return here after paying. |
| `SESSION_SECRET` | Long random text used to sign customers' access tokens. Keep it the same across restarts. |
| `PRICE_DUTY_GHS`, `PRICE_HISTORY_GHS`, `PRICE_BUNDLE_GHS` | Prices in cedis (defaults 20, 60 and 70). |
| `DUTY_ACCESS_DAYS` | How long a paid duty estimate stays open for that VIN (default 30). |
| `FREE_ACCESS` | Set to `1` on a local test machine only, to unlock everything without paying. |
| `HISTORY_DAILY_LIMIT` | Maximum new paid reports per day (default 50), to protect the bill. |
| `PORT` | Port to listen on (default 8787). |

## Payments

Customers pay through Paystack with mobile money (MTN, Telecel, AirtelTigo) or card, in cedis.

| Free | Paid, per VIN |
| --- | --- |
| VIN check, vehicle details, recalls, complaints, crash ratings, the age check | Duty estimate (open for 30 days, so customers can try different prices and shipping costs) |
| | Full history report |
| | Both together at a discount |

How it works:

1. The customer checks a VIN, picks what to buy, enters an email for the receipt and is sent to Paystack.
2. After paying they come back to the site, the payment is confirmed with Paystack, and the results unlock.
3. The purchase is remembered in that browser. On another device, the customer clicks **Already paid on another device?** and enters the reference from their Paystack receipt.

The duty breakdown is calculated on the server and only sent to customers who have paid, and the full rate table is visible only on the admin page, so the paywall cannot be bypassed from the browser.

Setting up Paystack:

1. Create a Paystack business account for Ghana and complete verification.
2. Put the secret key in `PAYSTACK_SECRET_KEY` and set `APP_URL` and `SESSION_SECRET`.
3. In the Paystack dashboard, set the webhook URL to `https://yourdomain.com/api/paystack/webhook`. This confirms payments even when a customer closes the page before returning.
4. Test with the `sk_test_` key and Paystack's test cards and test mobile money numbers, then switch to the live key.

Payment records are saved in `DATA_DIR/purchases/`, one file per payment, with the VIN, product, amount and email.

## Terms of Service and refunds

The Terms of Service are at `/#terms` and are linked from every checkout and from the footer. Customers must tick a box agreeing to them before they can pay, and each payment record stores the date of the terms they accepted. That record is your evidence if a customer disputes a charge with their bank or mobile money network.

Before going live:

1. Fill in your business name, registration number, address, support email and phone in `src/config/business.ts`.
2. Have a Ghanaian lawyer review the terms. They were written as a starting point, not as legal advice.
3. Register with the Data Protection Commission, since the site stores customer emails (Data Protection Act, 2012, Act 843).

The refund policy says all sales are final once results are shown. You review refunds yourself, and only for two cases: a charge where nothing was delivered because of a fault on your side, or a double charge. Requests must come within 7 days (change `REFUND_WINDOW_DAYS` in the same file).

To refund a customer:

1. Open `/#admin`, sign in, and choose **Payments and refunds**.
2. Search by the payment reference, the customer's email or the VIN. Each payment shows the amount, when it was paid, the terms version accepted, and whether the history report was actually delivered.
3. Refund the payment in the Paystack dashboard.
4. Click **Revoke after refund** and enter the reason. The customer loses access to the results on every device, and a late payment notice from Paystack cannot switch it back on.

When you change the terms, update `TERMS_VERSION` in `src/config/business.ts` so new payments record the new version.

## Weekly rate update

Open `/#admin` on the deployed site, enter this week's customs exchange rate from the ICUMS portal, change any duty or levy that GRA has announced, add a short note and save with the admin password. Everyone using the app sees the new figures at once, with the date they were saved. If the rates are more than seven days old, the calculator warns users to check ICUMS.

The values in `src/config/ghanaRates.ts` are only the fallback used before the first save.

## Vehicle history reports

Reports come from VinAudit, an NMVTIS approved provider. They cover title brands (salvage, flood, rebuilt, junk), insurance and junk yard records, salvage auction listings, accidents, theft, odometer readings and sale listings.

* A report is only pulled after a customer has paid for it, never on a plain VIN check.
* Every report is saved on the server, so VinAudit only charges you once per VIN even if many customers buy it. Each customer still pays you.
* If VinAudit is down or the daily limit is reached, the customer keeps their purchase and the report loads when they return.
* The raw response is stored, so the way it is displayed can be improved later without paying again.
* Anything the report shows is fed into the verdict automatically (for example a salvage brand gives "Do not ship").

Before going live, run a few VINs with `VINAUDIT_MODE=test` and compare the screen with the raw files in `DATA_DIR/history/`. VinAudit's response format could not be checked while this was built, so `mapVinAudit()` in `server/history.js` reads every field defensively and may need small adjustments. Delete the test files from `DATA_DIR/history/` before going live, because cached reports are reused.

To use a different provider, set `HISTORY_PROVIDER=generic`, `HISTORY_API_URL` (with `{vin}` where the VIN goes) and `HISTORY_API_KEY`, then adapt `mapGeneric()`.

## Duty rates

Ghana changes rates with each budget, and published figures from secondary sources disagree in places. Treat every result as an estimate. The ICUMS assessment at the port is final, and it often values used vehicles above the price paid.

Not included: clearing agent fees, port handling and storage, DVLA registration and roadworthy fees.
