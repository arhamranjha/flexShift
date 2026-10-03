# Questions for a New Zealand pharmacy customer

The NZ rules in `apps/backend-api/src/common/markets.ts` are starting points (DECISIONS 3.1, 3.3, 3.5). Ask a real pharmacy owner or
manager these questions, then update `markets.ts` (one entry, no other code branches on country) and tick the TODO item.
Each question says what FlexShift does today and what would change.

## 1. Who you hire and how they are registered
1. **Which roles do you book as relief?** Today the NZ list is Pharmacist, Pharmacy technician, Optometrist, Dispensing optician.
   Anything missing (for example intern pharmacists or pharmacy assistants), or anything you would never book?
2. **Registration numbers.** We ask every NZ worker for a number on the Pharmacy Council of New Zealand register. Is that right for each
   role above? (Optometrists and dispensing opticians are on a different board; pharmacy technicians may not be registered at all.)
   *If it differs:* `registrationBody` becomes per profession instead of one value per market.
3. **Annual practising certificate.** Today **every** NZ worker must hold a verified practising certificate before they can book any NZ
   shift. Should that apply to every role, or only to registered professionals? *If only some:* the rule moves from the market to the
   profession, otherwise technicians are refused at booking.

## 2. Checks before someone works a shift
4. **Police vetting.** We require an NZ Police vet for everyone ("Police vetting (NZ Police)"). Do you need it for every relief worker,
   how old may it be (do you re-vet every 3 years?), and do you also check the Children's Act safety-checking requirements for roles
   with children's contact?
5. **Right to work.** Is a passport or visa enough, or do you also check something else (for example a VisaView check)?
6. **Indemnity insurance.** Is a certificate of professional indemnity insurance something you ask contractors for? Is there a minimum
   cover amount you would want us to record?
7. **Other documents you always ask for** (for example a CV, references, vaccination status, a privacy or confidentiality agreement)?
   Organizations can already add extra required documents in Settings; tell us if one should be mandatory for every NZ organization.

## 3. Systems and accreditations
8. **Dispensing and pharmacy systems.** Our suggestions are only "Toniq" and "Corum". Which systems do you use, and which should a relief
   pharmacist be able to pick (dispensing, prescribing, eligibility/claiming, vaccination recording)? Free text is always allowed.
9. **Accreditations and services.** Suggestions today: Pharmacist Prescriber, Vaccinator (immunisation), First aid. Which services would
   you filter or require on a shift (for example emergency contraception, funded medicine services, specific vaccines)?

## 4. Money, tax and paying contractors
10. **GST.** Invoices carry no tax today and the accounting export defaults to "No GST" because most relief contractors are probably not
    GST-registered. Is that your experience? If a contractor is GST-registered, do you expect a tax invoice with their GST number?
11. **Rates.** Do you pay an hourly rate, a day rate, or both? Any weekend, public-holiday or overnight loading we should show?
12. **Paying people.** Today you get a payment CSV and an accounting CSV. Which bank and accounting software do you use (for example a
    bank's bulk-payment file format, Xero, MYOB)? A real bank file would mean storing contractors' bank account numbers.
13. **Withholding tax.** Do you deduct schedular payments withholding tax for any relief contractors?

## 5. Day to day
14. **Notice and cancellations.** How late do shifts usually get posted, and what cancellation rules do you use?
15. **Staff bank.** Do you keep a list of preferred relief people you always call first? Would three tiers (preferred, regular, reserve) fit?
16. **Time zone and dates.** We show day-first dates and 24-hour times, in New Zealand time. Fine?

## 6. Privacy (for the separate privacy review)
17. Are you comfortable with worker documents (ID, police vet, certificates) being stored by FlexShift, and where? (The test server is in
    Finland; production is planned for an NZ or Australian region.) Who in your organization should be able to see them?
