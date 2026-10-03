'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X, XCircle } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

/* ---------- Buttons ---------- */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
};

export function Button({
  variant = 'primary', size = 'md', loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        buttonStyles[variant],
        className,
      )}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Cards ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('bg-white rounded-xl border border-slate-200/80 shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badges ---------- */
export type Tone = 'slate' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  violet: 'bg-violet-100 text-violet-800',
  sky: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  OPEN: 'amber', DRAFT: 'slate', IN_NEGOTIATION: 'violet', BOOKED: 'emerald', IN_PROGRESS: 'sky', COMPLETED: 'emerald', CANCELLED: 'slate',
  PENDING: 'amber', COUNTERED: 'violet', ACCEPTED: 'emerald', REJECTED: 'rose', APPLIED: 'amber', UNDER_REVIEW: 'sky', WITHDRAWN: 'slate',
  VERIFIED: 'emerald', EXPIRED: 'rose', SUBMITTED: 'amber', APPROVED: 'emerald', DISPUTED: 'rose', SETTLED: 'emerald', PENDING_SUBMISSION: 'slate',
  ISSUED: 'amber', PAID: 'emerald', APPROVED_LEAVE: 'emerald',
};
export const statusTone = (status: string): Tone => STATUS_TONE[status] ?? 'slate';
export const label = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{label(status)}</Badge>;
}

/* ---------- Form controls ---------- */
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50';

export function Field({ label: text, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{text}</span>
      {children}
      {hint && !error && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
      {error && <span className="block text-[11px] text-rose-600 mt-1">{error}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(inputCls, 'min-h-[80px]', p.className)} />;

/* ---------- Modal ---------- */
/** Open modals, topmost last: Escape and focus trapping only apply to the one on top. */
const modalStack: symbol[] = [];

export function Modal({
  open, onClose, title, children, footer, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const me = Symbol('modal');
    modalStack.push(me);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    // Move focus into the dialog (first form control, falling back to the first focusable element).
    const first = panel.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== me) return; // a modal opened on top of this one owns the keyboard
      if (e.key === 'Escape') return onCloseRef.current();
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const [head, tail] = [els[0], els[els.length - 1]];
      const inside = panel.current?.contains(document.activeElement);
      if (!inside) { e.preventDefault(); head.focus(); } // focus had drifted outside the dialog
      else if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = modalStack.indexOf(me);
      if (at >= 0) modalStack.splice(at, 1);
      previouslyFocused?.focus?.(); // hand focus back to whatever opened the dialog
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div ref={panel} className={clsx('relative bg-white w-full rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- States ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-slate-400', className ?? 'w-5 h-5')} />;
}

export function LoadingBlock({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertTriangle className="w-8 h-8 text-rose-500" />
      <p className="text-sm text-slate-700 max-w-md">{message}</p>
      {retry && <Button variant="secondary" size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Inbox className="w-9 h-9 text-slate-300" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500 max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}

/* ---------- Toasts ---------- */
type ToastKind = 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void }>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  const value = useRef({ success: (t: string) => push('success', t), error: (t: string) => push('error', t) }).current;
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={clsx('flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg max-w-sm text-white', i.kind === 'success' ? 'bg-emerald-600' : 'bg-rose-600')}>
            {i.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Data hook ---------- */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const latest = useRef(0);
  const run = useCallback(() => {
    // Only the most recent request may update state, so a slow earlier response cannot overwrite a newer one.
    const mine = ++latest.current;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => !cancelled && mine === latest.current && setState({ data, loading: false }),
      (error) => !cancelled && mine === latest.current && setState({ error, loading: false }),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

/** Runs an action with a toast on success/failure and returns whether it worked. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const out = await fn();
        if (successMessage) toast.success(successMessage);
        return out;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

/* ---------- Table helpers ---------- */
export const th = 'px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50';
export const td = 'px-4 py-3 text-sm text-slate-700 border-t border-slate-100';
