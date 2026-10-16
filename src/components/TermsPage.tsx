import { useEffect, useState } from "react";
import { BUSINESS, REFUND_WINDOW_DAYS, TERMS_VERSION } from "../config/business";
import { api, type Prices } from "../lib/api";

export function TermsPage() {
  const [prices, setPrices] = useState<Prices | null>(null);
  useEffect(() => {
    api.prices().then(setPrices).catch(() => setPrices(null));
  }, []);
  const days = prices?.dutyAccessDays ?? 30;
  const updated = new Date(`${TERMS_VERSION}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="terms">
      <p>
        <a href="#">Back to the checker</a>
      </p>
      <article className="card">
        <h1>Terms of Service</h1>
        <p className="muted">Last updated {updated}</p>

        <p>
          These terms apply to the Ghana Vehicle Duty Checker (the “Service”), run by {BUSINESS.name}, registration{" "}
          {BUSINESS.registration}, {BUSINESS.address} (“we”, “us”). By using the Service or making a payment you agree to them.
          If you do not agree, do not use the Service.
        </p>

        <h2>1. What the Service does</h2>
        <p>
          The Service decodes vehicle identification numbers (VINs), shows public safety information from the United States
          National Highway Traffic Safety Administration, and, for a fee, provides an estimate of Ghana import duty and a vehicle
          history report for vehicles from North America.
        </p>
        <p>Free: VIN decoding, vehicle details, recalls, owner complaints, crash ratings and the age check.</p>
        <p>
          Paid, for one VIN at a time: the duty estimate, the vehicle history report, or both. The price is shown in Ghana cedis
          before you pay.
        </p>

        <h2>2. Duty figures are estimates only</h2>
        <p>
          The duty estimate is our calculation based on rates and an exchange rate we review weekly, the details you enter, and
          published information about Ghana Revenue Authority (GRA) practice. It is <strong>not</strong> an official
          assessment. The amount you actually pay is set by Ghana Customs through ICUMS at the time of clearing, and is often
          higher than an estimate based on the price you paid because Customs uses its own valuation. Rates, levies, exchange
          rates and import rules can change at any time, including after you buy.
        </p>
        <p>
          The estimate does not include clearing agent fees, port handling, demurrage or storage, DVLA registration, roadworthy
          or insurance costs. You should confirm costs with the GRA and a licensed clearing agent before buying or shipping a
          vehicle.
        </p>

        <h2>3. History reports come from third parties</h2>
        <p>
          History reports are compiled from records supplied by third parties, including the National Motor Vehicle Title
          Information System (NMVTIS) through an approved data provider, insurers, salvage auctions and state agencies. We do
          not create or verify these records.
        </p>
        <ul>
          <li>Records can be incomplete, late or wrong. Not every accident, repair, flood or theft is ever reported.</li>
          <li>
            A report with few or no records does <strong>not</strong> mean the vehicle is free of damage or problems. It means
            no records were found.
          </li>
          <li>A history report is not a substitute for a physical inspection by a qualified mechanic.</li>
        </ul>

        <h2>4. The import verdict is guidance</h2>
        <p>
          Messages such as “Do not ship” or “No blocking issues found” are our reading of the information available and of
          Ghana import rules as we understand them, including the Customs (Amendment) Act 2020 (Act 1014) and the Ghana
          Standards Authority pre export verification programme. They are not legal advice and do not guarantee that a vehicle
          will be accepted or refused by Ghana Customs or the Ghana Standards Authority.
        </p>

        <h2>5. Payments</h2>
        <ul>
          <li>Payments are processed by Paystack. We never see or store your card details or mobile money PIN.</li>
          <li>Each purchase is for the VIN you entered. Please check the VIN carefully before paying.</li>
          <li>
            A duty estimate stays available for that VIN for {days} days from payment, so you can try different prices and
            shipping costs. A history report stays available for that VIN for as long as the Service operates.
          </li>
          <li>
            Your purchase is saved in the browser you used. To use it on another device, enter the payment reference from your
            Paystack receipt. Keep your receipt.
          </li>
        </ul>

        <h2 id="refunds">6. Refund policy</h2>
        <p>
          Because results are delivered instantly and cannot be returned, <strong>all sales are final</strong> once the duty
          estimate or history report has been shown to you.
        </p>
        <p>
          We will review a refund request, at our discretion, only in these cases, and only if you contact us within{" "}
          {REFUND_WINDOW_DAYS} days of payment with your payment reference:
        </p>
        <ul>
          <li>you were charged but the result you paid for was never delivered because of a fault on our side; or</li>
          <li>you were charged more than once for the same purchase.</li>
        </ul>
        <p>We do not give refunds when:</p>
        <ul>
          <li>a history report contains few or no records, or not the records you expected;</li>
          <li>the duty charged by Ghana Customs differs from our estimate;</li>
          <li>you entered the wrong VIN, or the vehicle was sold or not bought;</li>
          <li>you have changed your mind; or</li>
          <li>you disagree with a verdict or with the information in a third party record.</li>
        </ul>
        <p>
          Approved refunds are paid back through Paystack to the original payment method. When a purchase is refunded, access
          to the results it unlocked ends. Raising a chargeback or mobile money reversal for a result that was delivered may lead
          us to suspend your access and to provide evidence of delivery and of your acceptance of these terms to your bank or
          network.
        </p>

        <h2>7. Fair use</h2>
        <p>
          You may use the results for your own vehicle purchase decisions, or to advise your own customers. You may not resell
          or publish reports in bulk, share access with people who have not paid, use automated tools to query or copy the
          Service, or try to get around the payment system. We may suspend access, without refund, if these terms are broken.
        </p>

        <h2>8. Our liability</h2>
        <p>
          The Service is provided “as is”. To the extent the law allows, we are not liable for any loss arising from decisions
          you make based on the Service, including the purchase, shipping, clearing or refusal of a vehicle, or for errors in
          third party records. Our total liability to you for any claim is limited to the amount you paid us for the purchase the
          claim relates to. Nothing in these terms limits rights you have under Ghanaian law that cannot be excluded.
        </p>

        <h2>9. Your information</h2>
        <p>
          We collect the VINs you check, the email address you give for receipts, and payment references and amounts from
          Paystack. We use them to deliver your purchases, handle refund requests and disputes, and prevent fraud. We do not sell
          your information. We keep payment records for as long as needed for accounting and legal purposes. We handle personal
          data in line with the Data Protection Act, 2012 (Act 843). To ask what we hold about you or to have it corrected,
          contact us.
        </p>

        <h2>10. Changes and governing law</h2>
        <p>
          We may update these terms; the date at the top shows the latest version, and the version you accepted is recorded
          with each purchase. These terms are governed by the laws of the Republic of Ghana, and the courts of Ghana have
          jurisdiction over any dispute.
        </p>

        <h2>11. Contact</h2>
        <p>
          Email {BUSINESS.email} or call {BUSINESS.phone}. For refunds or payment problems, include your payment reference
          (it starts with gvdc_ and is on your Paystack receipt).
        </p>
      </article>
    </main>
  );
}
