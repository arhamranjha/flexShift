'use client';

import {
  ALL_DOC_TYPES, DEFAULT_CURRENCY, currencySymbol, docLabel as marketDocLabel, findMarket, mandatoryDocs,
  type DocType, type Market, type MarketList, type Organization,
} from '@flexshift/api-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, useAuth, useScope } from '@/lib/auth';

/** Used until /markets answers (or if it fails): the platform default market. */
const FALLBACK_MARKET: Market = {
  code: 'NZ', name: 'New Zealand', currency: DEFAULT_CURRENCY, timezone: 'Pacific/Auckland', locale: 'en-NZ',
  taxName: 'GST', taxRatePercent: 15, accountingTaxType: '', registrationBody: 'your professional register',
  extraMandatoryDocs: ['PRACTISING_CERTIFICATE'], docLabels: {}, professions: [], systems: [], accreditations: [], phoneExample: '',
};

interface MarketState {
  market: Market;
  markets: MarketList | null;
  currency: string;
  symbol: string;
  /** Credentials required in this market, plus the organization's own extras when known. */
  mandatory: DocType[];
  docLabel: (type: DocType) => string;
  loading: boolean;
  reload: () => void;
}

const MarketCtx = createContext<MarketState | null>(null);
export const useMarket = () => {
  const ctx = useContext(MarketCtx);
  if (!ctx) throw new Error('useMarket must be used inside <MarketProvider>');
  return ctx;
};

export function MarketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { orgId } = useScope();
  const [markets, setMarkets] = useState<MarketList | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    setLoading(true);
    Promise.all([
      api.markets.list().catch(() => null),
      orgId ? api.organizations.get(orgId).catch(() => null) : Promise.resolve(null),
    ]).then(([m, o]) => {
      if (!live) return;
      if (m) setMarkets(m);
      setOrg(o);
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [user, orgId, tick]);

  const value = useMemo<MarketState>(() => {
    const market = findMarket(markets, org?.country) ?? FALLBACK_MARKET;
    const mandatory = Array.from(new Set([...mandatoryDocs(market), ...(org?.requiredDocTypes ?? [])]))
      .sort((a, b) => ALL_DOC_TYPES.indexOf(a) - ALL_DOC_TYPES.indexOf(b));
    return {
      market, markets, currency: market.currency, symbol: currencySymbol(market.currency), mandatory,
      docLabel: (t) => marketDocLabel(market, t), loading, reload,
    };
  }, [markets, org, loading, reload]);

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}
