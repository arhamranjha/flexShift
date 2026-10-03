import type { DocType, Market, MarketCode, MarketList } from './types';

/** The four credentials every worker needs in every market. */
export const BASE_MANDATORY_DOCS: DocType[] = ['IDENTITY', 'RIGHT_TO_WORK', 'DBS_POLICE_CHECK', 'INDEMNITY_INSURANCE'];

/** Every credential a worker can upload, mandatory ones first. */
export const ALL_DOC_TYPES: DocType[] = [
  ...BASE_MANDATORY_DOCS, 'PRACTISING_CERTIFICATE', 'SAFEGUARDING_L3', 'PRACTICE_DECLARATION', 'MANDATORY_TRAINING', 'OTHER',
];

/** Credentials required to be bookable in a market (base four plus the market's own). */
export const mandatoryDocs = (market?: Market | null): DocType[] => [...BASE_MANDATORY_DOCS, ...(market?.extraMandatoryDocs ?? [])];

/** Market-specific wording for a credential, falling back to a readable form of the type name. */
export const docLabel = (market: Market | null | undefined, type: DocType): string =>
  market?.docLabels[type] ?? type.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const findMarket = (list: MarketList | null | undefined, code?: string | null): Market | undefined =>
  list?.markets.find((m) => m.code === ((code ?? list.default) as MarketCode)) ?? list?.markets.find((m) => m.code === list.default);
