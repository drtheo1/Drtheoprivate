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

Requires Node 20 or newer.

```bash
npm install
npm test          # unit tests for VIN checks, duty maths and eligibility
npm run build     # builds the frontend into dist/
npm start         # serves the app and the /api proxy on http://localhost:8787
```

For development run `npm start` and `npm run dev` in two terminals; Vite forwards `/api` to the Node server.

The server has no dependencies and can be deployed to any Node host (Render, Railway, Fly.io, a VPS). Set `PORT` if the host requires it.

## Server settings

Set these as environment variables on your host.

| Setting | What it does |
| --- | --- |
| `ADMIN_TOKEN` | Password for the weekly rate page. Required to save rates. |
| `DATA_DIR` | Folder for saved rates and paid reports. Must be on a persistent disk. Defaults to `./data`. |
| `HISTORY_PROVIDER` | `vinaudit` (recommended) or `generic`. |
| `VINAUDIT_API_KEY`, `VINAUDIT_USER`, `VINAUDIT_PASS` | From your VinAudit API account. |
| `VINAUDIT_MODE` | Set to `test` while checking the setup; VinAudit returns sample data and does not charge. Remove it to go live. |
| `HISTORY_ACCESS_CODE` | Optional. When set, users must enter this code before a paid report is pulled. |
| `HISTORY_DAILY_LIMIT` | Maximum new paid reports per day (default 50), to protect the bill. |
| `PORT` | Port to listen on (default 8787). |

## Weekly rate update

Open `/#admin` on the deployed site, enter this week's customs exchange rate from the ICUMS portal, change any duty or levy that GRA has announced, add a short note and save with the admin password. Everyone using the app sees the new figures at once, with the date they were saved. If the rates are more than seven days old, the calculator warns users to check ICUMS.

The values in `src/config/ghanaRates.ts` are only the fallback used before the first save.

## Vehicle history reports

Reports come from VinAudit, an NMVTIS approved provider. They cover title brands (salvage, flood, rebuilt, junk), insurance and junk yard records, salvage auction listings, accidents, theft, odometer readings and sale listings.

* A report is only pulled when someone clicks **Get full history report**, never on a plain VIN check.
* Every report is saved on the server. Opening the same VIN again is free, for any user.
* The raw response is stored, so the way it is displayed can be improved later without paying again.
* Anything the report shows is fed into the verdict automatically (for example a salvage brand gives "Do not ship").

Before going live, run a few VINs with `VINAUDIT_MODE=test` and compare the screen with the raw files in `DATA_DIR/history/`. VinAudit's response format could not be checked while this was built, so `mapVinAudit()` in `server/history.js` reads every field defensively and may need small adjustments. Delete the test files from `DATA_DIR/history/` before going live, because cached reports are reused.

To use a different provider, set `HISTORY_PROVIDER=generic`, `HISTORY_API_URL` (with `{vin}` where the VIN goes) and `HISTORY_API_KEY`, then adapt `mapGeneric()`.

## Duty rates

Ghana changes rates with each budget, and published figures from secondary sources disagree in places. Treat every result as an estimate. The ICUMS assessment at the port is final, and it often values used vehicles above the price paid.

Not included: clearing agent fees, port handling and storage, DVLA registration and roadworthy fees.
