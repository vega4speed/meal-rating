export function Button({ className = '', ...props }) {
  return (
    <button
      className={[
        'min-h-[48px] w-full rounded-xl bg-emerald-500 px-4 text-base font-semibold text-slate-950',
        'transition active:scale-[0.99] disabled:opacity-40',
        className,
      ].join(' ')}
      {...props}
    />
  )
}

export function TextButton({ className = '', ...props }) {
  return (
    <button
      className={['text-sm font-medium text-emerald-400', className].join(' ')}
      {...props}
    />
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={[
        'min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-base text-slate-100',
        'outline-none focus:border-emerald-500',
        className,
      ].join(' ')}
      {...props}
    />
  )
}
