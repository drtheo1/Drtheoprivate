# Ghana Vehicle Duty Checker

A web app for anyone buying a used vehicle in the United States or Canada to ship to Ghana. Enter a VIN and it will:

1. **Validate the VIN** (length, forbidden letters, the North American check digit) and work out the model year and country of origin.
2. **Decode the vehicle** through the free NHTSA vPIC service: make, model, trim, body, engine size in cc, fuel, drive, assembly plant.
3. **Show its North American history**
   * Recall campaigns, owner complaints (highlighting crashes, fires and injuries) and NHTSA crash ratings.
   * Title, accident, odometer and theft records from a paid history provider once one is connected (see below). Until then the app links to NMVTIS, NICB VINCheck, CARFAX, AutoCheck and CARFAX Canada, and gives a checklist to record what the report shows.
4. **Estimate Ghana port duty**, prefilled from the decoded vehicle: import duty by engine size and category, overage penalty, VAT, NHIL, GETFund, ECOWAS, AU, EXIM and special import levies, and the ICUMS network charge, in USD and cedis. It supports both your purchase price and the customs HDV method (new price less the GRA depreciation allowance by age).
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

## Connecting a vehicle history provider

Title brands, accidents and odometer readings are not public data. Sign up with an NMVTIS approved data provider or a commercial service, then set:

```
HISTORY_API_URL=https://provider.example/report?vin={vin}
HISTORY_API_KEY=your_key
```

and adapt `mapProviderResponse()` in `server/history.js` to the provider's response format. The key stays on the server. Reports are scanned for salvage, flood, rebuilt, junk, structural damage, theft, odometer and airbag terms, which feed the verdict automatically.

## Duty rates

All rates live in `src/config/ghanaRates.ts`, with the sources they came from, and can also be edited inside the app (stored in the browser). Ghana changes rates with each budget, and published figures from secondary sources disagree in places, so:

* Review the file whenever GRA publishes changes and update `RATES_AS_OF`.
* Treat every result as an estimate. The ICUMS assessment at the port is final, and it often values used vehicles above the price paid.

Not included: clearing agent fees, port handling and storage, DVLA registration and roadworthy fees.
