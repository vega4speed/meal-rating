export default function StarRating({ value, onRate, readOnly = false, size = 'lg' }) {
  const cls = size === 'lg' ? 'text-3xl' : 'text-base'
  return (
    <div className={`flex ${size === 'lg' ? 'gap-1' : 'gap-0.5'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onRate?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={[
            cls,
            'leading-none',
            readOnly ? 'cursor-default' : 'cursor-pointer',
            value != null && n <= value ? 'text-amber-400' : 'text-slate-600',
          ].join(' ')}
        >
          ★
        </button>
      ))}
    </div>
  )
}
