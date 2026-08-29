const cx = (...xs) => xs.filter(Boolean).join(' ')

const VARIANTS = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-700',
  danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  ghost: 'text-emerald-400 hover:text-emerald-300',
}
const SIZES = {
  sm: 'min-h-[36px] px-3 text-sm gap-1.5',
  md: 'min-h-[44px] px-4 text-sm gap-2',
  lg: 'min-h-[52px] px-5 text-base gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  ...props
}) {
  const isGhost = variant === 'ghost'
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-semibold',
        'transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        !isGhost && SIZES[size],
        VARIANTS[variant],
        full && 'w-full',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ as: As = 'div', className = '', ...props }) {
  return (
    <As
      className={cx(
        'rounded-2xl border border-slate-800 bg-slate-900/60 p-4',
        className,
      )}
      {...props}
    />
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-slate-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SectionHeading({ children, action }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {children}
      </h2>
      {action}
    </div>
  )
}

const PILL_TONES = {
  slate: 'bg-slate-800 text-slate-300',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  rose: 'bg-rose-500/15 text-rose-300',
  sky: 'bg-sky-500/15 text-sky-300',
  violet: 'bg-violet-500/15 text-violet-300',
}

export function Pill({ tone = 'slate', className = '', children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <span
        className="h-6 w-6 rounded-full border-2 border-slate-700 border-t-emerald-400"
        style={{ animation: 'spin 0.7s linear infinite' }}
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 px-6 py-12 text-center">
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="font-medium text-slate-200">{title}</p>
      {children ? (
        <p className="max-w-xs text-sm text-slate-400">{children}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-slate-300">
          {label}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1.5 block text-sm text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

const CONTROL =
  'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100 ' +
  'outline-none transition-colors focus:border-emerald-500'

export function Input({ className = '', ...props }) {
  return (
    <input className={cx('min-h-[48px]', CONTROL, className)} {...props} />
  )
}

export function Textarea({ className = '', rows = 4, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cx('py-2.5 text-sm leading-relaxed', CONTROL, className)}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }) {
  return (
    <select
      className={cx('min-h-[44px] appearance-none pr-9 text-sm', CONTROL, className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.65rem center',
      }}
      {...props}
    />
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl bg-slate-800/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ErrorText({ children }) {
  return children ? (
    <p className="text-sm text-rose-400" role="alert">
      {children}
    </p>
  ) : null
}
