const SIZES = { sm: 'text-sm', md: 'text-2xl', lg: 'text-[2rem]' }

export default function StarRating({ value, onRate, readOnly = false, size = 'lg' }) {
  const filled = (n) => value != null && n <= value

  if (readOnly) {
    return (
      <span
        className={`inline-flex ${size === 'sm' ? 'gap-px' : 'gap-0.5'} ${SIZES[size]} leading-none`}
        aria-label={value != null ? `${value} out of 5` : 'not rated'}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={filled(n) ? 'text-amber-400' : 'text-slate-700'}
          >
            ★
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate?.(n)}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          className={[
            SIZES[size],
            'leading-none transition-transform active:scale-90',
            filled(n) ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400',
          ].join(' ')}
        >
          ★
        </button>
      ))}
    </div>
  )
}
