export default function TagChips({ options, selected, onToggle, single = false }) {
  const isOn = (t) => (single ? selected === t : selected.includes(t))
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onToggle(t)}
          className={[
            'rounded-full px-3 py-1.5 text-sm font-medium',
            isOn(t)
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-slate-800 text-slate-300',
          ].join(' ')}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
