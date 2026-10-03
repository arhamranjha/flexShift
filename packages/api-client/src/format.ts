import type { Money } from './types';

export const toNumber = (m: Money | null | undefined) => Number(m ?? 0);
/** Currency used when a record does not say (the platform's default market is New Zealand). */
export const DEFAULT_CURRENCY = 'NZD';

/** Amount in the given ISO currency, e.g. money(35, 'NZD') -> "$35.00", money(35, 'GBP') -> "£35.00". */
export const money = (m: Money | null | undefined, currency: string = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(toNumber(m));

/** Just the symbol, for field labels such as "Hourly rate ($)". */
export const currencySymbol = (currency: string = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;

export const shiftHours = (start: string, end: string) => (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtRange = (start: string, end: string) => `${fmtDate(start)} · ${fmtTime(start)}–${fmtTime(end)}`;

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
