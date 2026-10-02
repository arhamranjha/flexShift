import type { Money } from './types';

export const toNumber = (m: Money | null | undefined) => Number(m ?? 0);
export const gbp = (m: Money | null | undefined) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(toNumber(m));

export const shiftHours = (start: string, end: string) => (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtRange = (start: string, end: string) => `${fmtDate(start)} · ${fmtTime(start)}–${fmtTime(end)}`;

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
