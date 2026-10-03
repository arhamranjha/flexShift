import { DocType } from '@prisma/client';

/**
 * Markets are data, not code branches: an organization's `country` selects one of these, and everything that
 * differs between countries (currency, timezone, tax, credential rules and wording) is read from here.
 * The values for new markets are starting points to be confirmed with the local regulator and customers.
 */
export type MarketCode = 'NZ' | 'GB';

export interface Market {
  code: MarketCode;
  name: string;
  currency: string;
  timezone: string;
  /** Locale for number/date formatting. */
  locale: string;
  taxName: string;
  taxRatePercent: number;
  /** Default tax code on the accounting export (workers are often not tax-registered, so the safe default is "none"). */
  accountingTaxType: string;
  /** Professional registers workers belong to, shown as the hint for the registration number. */
  registrationBody: string;
  /** Credentials required in this market on top of the four every worker needs (identity, right to work, police check, indemnity). */
  extraMandatoryDocs: DocType[];
  docLabels: Partial<Record<DocType, string>>;
  professions: string[];
  /** Suggestions only: free text is always allowed. */
  systems: string[];
  accreditations: string[];
  phoneExample: string;
}

export const MARKETS: Record<MarketCode, Market> = {
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    currency: 'NZD',
    timezone: 'Pacific/Auckland',
    locale: 'en-NZ',
    taxName: 'GST',
    taxRatePercent: 15,
    accountingTaxType: 'No GST',
    registrationBody: 'Pharmacy Council of New Zealand',
    extraMandatoryDocs: [DocType.PRACTISING_CERTIFICATE],
    docLabels: {
      IDENTITY: 'Photo ID (passport or NZ driver licence)',
      RIGHT_TO_WORK: 'Right to work in New Zealand',
      DBS_POLICE_CHECK: 'Police vetting (NZ Police)',
      INDEMNITY_INSURANCE: 'Professional indemnity insurance',
      PRACTISING_CERTIFICATE: 'Annual practising certificate',
      SAFEGUARDING_L3: 'Child and vulnerable adult safeguarding training',
      PRACTICE_DECLARATION: 'Fitness to practise declaration',
      MANDATORY_TRAINING: 'Mandatory training',
      OTHER: 'Other document',
    },
    professions: ['Pharmacist', 'Pharmacy technician', 'Optometrist', 'Dispensing optician'],
    systems: ['Toniq', 'Corum'],
    accreditations: ['Pharmacist Prescriber', 'Vaccinator (immunisation)', 'First aid'],
    phoneExample: '+64 21 123 4567',
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    timezone: 'Europe/London',
    locale: 'en-GB',
    taxName: 'VAT',
    taxRatePercent: 20,
    accountingTaxType: 'No VAT',
    registrationBody: 'General Pharmaceutical Council (GPhC)',
    extraMandatoryDocs: [],
    docLabels: {
      IDENTITY: 'Photo ID (passport or driving licence)',
      RIGHT_TO_WORK: 'Right to work in the UK',
      DBS_POLICE_CHECK: 'DBS / police check',
      INDEMNITY_INSURANCE: 'Professional indemnity insurance',
      PRACTISING_CERTIFICATE: 'Practising certificate',
      SAFEGUARDING_L3: 'Safeguarding level 3',
      PRACTICE_DECLARATION: 'Fitness to practise declaration',
      MANDATORY_TRAINING: 'Mandatory training',
      OTHER: 'Other document',
    },
    professions: ['Pharmacist', 'Pharmacy dispenser', 'Optometrist', 'Dispensing optician'],
    systems: ['ProScript', 'Columbus', 'Nexphase'],
    accreditations: ['CPCS', 'Flu Vaccination', 'Safeguarding Level 3', 'NMS', 'Independent Prescriber'],
    phoneExample: '+44 7700 900123',
  },
};

export const DEFAULT_MARKET: MarketCode = 'NZ';
export const MARKET_CODES = Object.keys(MARKETS) as MarketCode[];

export const marketFor = (country?: string | null): Market =>
  MARKETS[(country ?? DEFAULT_MARKET).toUpperCase() as MarketCode] ?? MARKETS[DEFAULT_MARKET];

/** Currency formatting for server-generated text (notifications, emails, exports). */
export function formatMoney(amount: number | string | { toString(): string }, currency = MARKETS[DEFAULT_MARKET].currency): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(amount.toString()));
}
