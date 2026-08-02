'use client';

/** Small shared primitives so the three panels stay visually consistent. */

export const inputClass =
  'w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder-neutral-600 ' +
  'focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition text-sm';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white/[0.03] border border-white/10 rounded-xl ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-400 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-600 mt-1">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500',
    ghost: 'bg-white/[0.04] border border-white/10 text-neutral-300 hover:text-white hover:border-white/25',
    danger: 'bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20',
  };
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-neutral-300 hover:text-white transition"
    >
      <span
        className={`w-9 h-5 rounded-full p-0.5 transition shrink-0 ${checked ? 'bg-white' : 'bg-white/15'}`}
      >
        <span
          className={`block w-4 h-4 rounded-full transition ${
            checked ? 'translate-x-4 bg-black' : 'bg-neutral-400'
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'warn' | 'ok' | 'info';
  children: React.ReactNode;
}) {
  const tones = {
    error: 'bg-red-500/10 border-red-500/30 text-red-200',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-100',
    ok: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    info: 'bg-white/[0.04] border-white/10 text-neutral-300',
  };
  return <div className={`p-3 rounded-lg border text-sm ${tones[tone]}`}>{children}</div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-14 border border-dashed border-white/10 rounded-xl">
      <p className="text-neutral-400 text-sm">{title}</p>
      {hint && <p className="text-neutral-600 text-xs mt-1">{hint}</p>}
    </div>
  );
}
