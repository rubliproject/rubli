/**
 * SortHeaderTh — canonical sortable table-header cell (DESIGN.md §8 Table, template v3 2026-10-28):
 * the th carries `aria-sort`, a `<button>` inside it sorts; SC 12 like every th; the glyph shows on
 * the active column only (a ↕ on every column is noise). Replaces the local SortHeader
 * implementations in explore/ResultsTable, InstitutionLeague and Contracts.
 */

interface SortHeaderThProps<F extends string = string> {
  field: F
  label: string
  /** Currently active sort field (matches `field` to mark active). */
  activeField: F
  /** 'asc' | 'desc'. */
  order: 'asc' | 'desc'
  onSort: (field: F) => void
  className?: string
}

export function SortHeaderTh<F extends string = string>({
  field,
  label,
  activeField,
  order,
  onSort,
  className = '',
}: SortHeaderThProps<F>) {
  const isActive = activeField === field
  return (
    <th
      scope="col"
      className={`select-none ${className}`}
      aria-sort={isActive ? (order === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      {/* min-h-11 on touch, 28 on desktop; the negative margin spends it inside the cell's padding */}
      <button
        type="button"
        onClick={() => onSort(field)}
        className="ct-sort min-h-11 -my-2.5 sm:min-h-7 sm:-my-1 focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2"
        style={{ fontFamily: 'var(--font-sc)', letterSpacing: 'var(--track-sc)', fontWeight: 600, fontSize: 'var(--text-label)' }}
      >
        {label}
        {isActive && <span className="ct-sort-glyph" aria-hidden="true">{order === 'desc' ? '↓' : '↑'}</span>}
      </button>
    </th>
  )
}
