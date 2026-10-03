'use client';

import { DEFAULT_CURRENCY, currencySymbol, docLabel as marketDocLabel, findMarket, mandatoryDocs, type DocType, type Market, type MarketList } from '@flexshift/api-client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, useAuth } from '@/lib/auth';

/** Used until /markets answers (or if it fails), so the UI never crashes while loading. */
export const FALLBACK_MARKET: Market = {
  code: 'NZ', name: 'New Zealand', currency: DEFAULT_CURRENCY, timezone: 'Pacific/Auckland', locale: 'en-NZ',
  taxName: 'GST', taxRatePercent: 15, accountingTaxType: '', registrationBody: 'your professional registration',
  extraMandatoryDocs: ['PRACTISING_CERTIFICATE'], docLabels: {}, professions: ['Pharmacist'], systems: [], accreditations: [], phoneExample: '',
};

export interface MarketState {
  market: Market;
  markets: MarketList | null;
  currency: string;
  symbol: string;
  mandatory: DocType[];
  docLabel: (type: DocType) => string;
}

const MarketCtx = createContext<MarketState | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [markets, setMarkets] = useState<MarketList | null>(null);
  useEffect(() => { api.markets.list().then(setMarkets).catch(() => undefined); }, []);
  const country = user?.reliefProfile?.country;
  const market = findMarket(markets, country) ?? FALLBACK_MARKET;
  const value = useMemo<MarketState>(() => ({
    market, markets, currency: market.currency, symbol: currencySymbol(market.currency),
    mandatory: mandatoryDocs(market), docLabel: (t) => marketDocLabel(market, t),
  }), [market, markets]);
  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export const useMarket = () => {
  const ctx = useContext(MarketCtx);
  if (!ctx) throw new Error('useMarket must be used inside <MarketProvider>');
  return ctx;
};
