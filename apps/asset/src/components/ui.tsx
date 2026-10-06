'use client';

import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------- Button */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 border border-brand-600 shadow-card',
    secondary: 'bg-white text-ink-2 hover:bg-canvas border border-line shadow-card',
    ghost: 'text-ink-2 hover:bg-canvas border border-transparent',
    danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
    success: 'bg-emerald-700 text-white border border-emerald-700 hover:bg-emerald-800',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Badge */
export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'teal';
const TONE: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-100',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
};
export function Badge({ tone = 'gray', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap', TONE[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Card */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-lg border border-line bg-white shadow-card', className)}>{children}</section>;
}
export function CardHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Page header */
export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && <div className="mb-1.5 text-[12.5px] text-ink-3">{crumbs}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-[13.5px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Form controls */
const ctl =
  'h-9 w-full rounded-md border border-line bg-white px-2.5 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-canvas disabled:text-ink-3';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(ctl, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(ctl, 'h-auto min-h-[72px] py-2', props.className)} />;
}
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(ctl, 'pr-7', props.className)}>
      {children}
    </select>
  );
}
export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-[12.5px] font-medium text-ink-2">
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </label>
  );
}
export function FormField({ label, required, children, hint }: { label: ReactNode; required?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- Definition list */
export function DL({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode; mono?: boolean }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3.5', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] text-ink-3">{it.label}</dt>
          <dd className={cx('mt-0.5 break-words text-[13.5px] text-ink', it.mono && 'font-mono text-[13px]')}>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Tabs */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
            value === it.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-3 hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cx('rounded px-1.5 text-[11.5px] tabular-nums', value === it.id ? 'bg-brand-50 text-brand-700' : 'bg-canvas text-ink-3')}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Overlay: Drawer & Modal */
function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, sub, children, footer, width = 'max-w-xl' }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <aside className={cx('absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-pop', width)}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
            {sub && <div className="mt-0.5 text-[12.5px] text-ink-3">{sub}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-canvas" aria-label="close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className={cx('relative flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-pop', width)}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-canvas" aria-label="close">
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Table */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, right, className, sticky }: { children?: ReactNode; right?: boolean; className?: string; sticky?: boolean }) {
  return (
    <th
      className={cx(
        'whitespace-nowrap border-b border-line bg-[#F9FAFB] px-3 py-2 text-left text-[12px] font-semibold text-ink-3',
        right && 'text-right',
        sticky && 'sticky left-0 z-10',
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({ children, right, className, mono, sticky }: { children?: ReactNode; right?: boolean; className?: string; mono?: boolean; sticky?: boolean }) {
  return (
    <td className={cx('border-b border-line-soft px-3 py-2 align-middle text-ink-2', right && 'text-right tabular-nums', mono && 'font-mono text-[12.5px]', sticky && 'sticky left-0 z-[5] bg-inherit', className)}>
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-[13.5px] text-ink-3">{children}</div>;
}

/* ---------------------------------------------------------------- Notice */
export function Notice({ tone = 'blue', icon, children, className }: { tone?: 'blue' | 'amber' | 'red' | 'gray' | 'green'; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = {
    blue: 'border-brand-100 bg-brand-50 text-brand-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    gray: 'border-line bg-canvas text-ink-2',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div className={cx('flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px]', t, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Toggle */
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-slate-300')}
    >
      <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}
