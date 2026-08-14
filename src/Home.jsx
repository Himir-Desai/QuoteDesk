import React, { useState, useEffect, useMemo, useRef } from 'react'
import { buildIndex, searchIndex } from './search.js'
import Select from './Select.jsx'
import { sellerColor, sellerColorVars } from './sellerColors.js'
import { financialYear } from './utils/financialYear.js'
import { quoteLabel, formatDMY } from './quoteName.js'

// Wording per document type. Your own companies are the "seller" on a
// quotation and the "buyer" on a purchase order; the counterparty flips the
// other way. Everything else about the screen is identical.
const DOC = {
  quotations: {
    tab: 'Quotations',
    one: 'quotation',
    many: 'quotations',
    newLabel: 'New Quotation',
    ownLabel: 'company',
    ownPlural: 'companies',
    partyLabel: 'buyer',
    partyPlural: 'buyers',
    search: 'Search name, ref, buyer, PR no, item code…'
  },
  purchaseOrders: {
    tab: 'Purchase Orders',
    one: 'purchase order',
    many: 'purchase orders',
    newLabel: 'New Purchase Order',
    ownLabel: 'company',
    ownPlural: 'companies',
    partyLabel: 'supplier',
    partyPlural: 'suppliers',
    search: 'Search name, PO no, supplier, PR no, item code…'
  }
}

// The counterparty is a customer on a quotation and a supplier on a PO.
const partyName = (d) =>
  String(
    d.customerName ||
      d.supplierName ||
      d.customer?.name ||
      d.supplier?.name ||
      ''
  ).trim()

const emptyFilters = () => ({ year: financialYear(), sellerIds: [], parties: [] })

// Start screen: pick a year + company (required) to pull up past documents,
// or create a new one. The gate keeps thousands of archived docs from all
// loading at once.
export default function Home({
  onNew,
  onOpen,
  onDelete,
  onRename,
  recent = [],
  archive = [],
  archiveManifest = { years: [], sellers: {} },
  sellers = [],
  docType = 'quotations',
  onDocTypeChange,
  filters = emptyFilters(),
  onFilters,
  query = '',
  onQuery,
  counts = {}
}) {
  const L = DOC[docType] || DOC.quotations
  const searching = query.trim().length > 0

  // Filter + search state is owned by App (so it survives leaving Home); these
  // wrappers keep the local call-sites unchanged.
  const setFilters = (updater) =>
    onFilters?.(typeof updater === 'function' ? updater(filters) : updater)
  const setQuery = (v) => onQuery?.(v)
  const setYear = (year) => setFilters((f) => ({ ...f, year }))
  const gated = filters.sellerIds.length === 0

  // Anything diverging from the default (current FY, no company/party, no
  // search) means there's something worth resetting.
  const filtersActive =
    filters.sellerIds.length > 0 ||
    filters.parties.length > 0 ||
    filters.year !== financialYear() ||
    query.trim().length > 0

  const [openMenuId, setOpenMenuId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)

  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  // Year choices: every financial year present in the live data OR the archive
  // manifest, plus the current one, newest first.
  const yearOptions = useMemo(() => {
    const set = new Set([financialYear(), ...(archiveManifest.years || [])])
    for (const q of recent) if (q.date) set.add(financialYear(q.date))
    return [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((y) => ({ value: y, label: y }))
  }, [recent, archiveManifest])

  const sellerOptions = useMemo(
    () =>
      sellers.map((s, i) => ({
        value: s.id,
        label: s.name,
        color: sellerColor(s, i)
      })),
    [sellers]
  )

  const inScope = (q) =>
    financialYear(q.date) === filters.year &&
    filters.sellerIds.includes(q.sellerId)

  // The pool is only the selected year + companies (live docs + the loaded
  // archive slice). Everything downstream — search index, party options, the
  // list — works off this bounded set, so it stays fast no matter how many
  // thousands sit in the archive overall.
  const pool = useMemo(() => {
    if (gated) return []
    return [...recent.filter(inScope), ...archive.filter(inScope)]
  }, [recent, archive, filters.year, filters.sellerIds, gated])

  const index = useMemo(() => buildIndex(pool, sellers), [pool, sellers])

  // Counterparties present in the current pool, so the picker only offers
  // names you can really find here.
  const partyOptions = useMemo(() => {
    const names = new Set()
    for (const q of pool) {
      const n = partyName(q)
      if (n) names.add(n)
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }))
  }, [pool])

  // Switching tabs keeps year + company (both universal) but drops the
  // counterparty and search, which mean different things per tab. Guarded by a
  // ref so this fires only on a real tab change — NOT when Home remounts after
  // returning from a document (which would wipe the filters unexpectedly).
  const prevDoc = useRef(docType)
  useEffect(() => {
    if (prevDoc.current !== docType) {
      prevDoc.current = docType
      setQuery('')
      setFilters((f) => ({ ...f, parties: [] }))
    }
    setOpenMenuId(null)
    setRenamingId(null)
  }, [docType])

  const matchesParty = (q) =>
    !filters.parties.length || filters.parties.includes(partyName(q))

  // Highest ref number first, so a year reads newest-to-oldest in sequence.
  // Non-numeric refs sort last; ties fall back to date.
  const byRefDesc = (a, b) => {
    const na = parseInt(a.refNumber, 10)
    const nb = parseInt(b.refNumber, 10)
    if (isNaN(na) && isNaN(nb))
      return String(b.date || '').localeCompare(String(a.date || ''))
    if (isNaN(na)) return 1
    if (isNaN(nb)) return -1
    return nb - na
  }

  const rows = useMemo(() => {
    if (gated) return []
    const base = searching
      ? searchIndex(index, query).map((h) => ({ quote: h.quote, matches: h.matches }))
      : [...pool].sort(byRefDesc).map((q) => ({ quote: q, matches: null }))
    return base.filter((r) => matchesParty(r.quote))
  }, [index, query, searching, pool, filters.parties, gated])

  // Group into seller order, matching the tile screen's grouping.
  const groups = useMemo(() => {
    const byId = new Map()
    sellers.forEach((s, i) => byId.set(s.id, { seller: s, index: i, rows: [] }))
    const orphans = { seller: null, index: sellers.length, rows: [] }
    for (const r of rows) (byId.get(r.quote.sellerId) || orphans).rows.push(r)
    return [...byId.values(), orphans]
      .filter((g) => g.rows.length)
      .sort((a, b) => a.index - b.index)
  }, [rows, sellers])

  const total = rows.length

  const sellerSummary = (ids) => {
    if (ids.length === 0) return 'Select company'
    if (ids.length === 1) {
      const s = sellers.find((x) => x.id === ids[0])
      return s?.name || '1 company'
    }
    return `${ids.length} companies`
  }
  const partySummary = (names) => {
    if (names.length === 0) return `All ${L.partyPlural}`
    if (names.length === 1) return names[0]
    return `${names.length} ${L.partyPlural}`
  }

  const row = ({ quote: q, matches }, group) => {
    const renaming = renamingId === q.id
    const archived = Boolean(q.archived)
    // What the search hit on — skip the ref (already its own column).
    const hits = (matches || []).filter((m) => m.key !== 'refNo').slice(0, 2)
    return (
      <li
        key={q.id}
        className={`doc-row${archived ? ' is-archived' : ''}`}
        style={sellerColorVars(group.seller, group.index)}
        onClick={() => !renaming && onOpen(q)}
      >
        <span className="doc-row-stripe" />
        <span className="doc-row-ref">{q.refNo || '—'}</span>
        <span className="doc-row-name">
          {renaming ? (
            <RenameInput
              initial={q.title || ''}
              placeholder={quoteLabel(q)}
              onCancel={() => setRenamingId(null)}
              onCommit={(name) => {
                setRenamingId(null)
                onRename?.(q, name)
              }}
            />
          ) : (
            <>
              <span className="doc-row-title" title={quoteLabel(q)}>
                {quoteLabel(q)}
              </span>
              {hits.length > 0 && (
                <span className="doc-row-matches">
                  {hits.map((m) => (
                    <span key={m.key} className="doc-row-match">
                      <span className="doc-row-match-label">{m.label}:</span>{' '}
                      {m.value}
                    </span>
                  ))}
                </span>
              )}
            </>
          )}
        </span>
        <span className="doc-row-date">{formatDMY(q.date)}</span>
        <span className="doc-row-menu-wrap">
          {archived ? (
            <span className="doc-row-badge" title="Imported — read only">
              archive
            </span>
          ) : (
            <>
              <button
                className="doc-row-menu"
                title="More actions"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuId(openMenuId === q.id ? null : q.id)
                }}
              >
                ⋯
              </button>
              {openMenuId === q.id && (
                <span className="tile-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="tile-menu-item"
                    onClick={() => {
                      setOpenMenuId(null)
                      setRenamingId(q.id)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="tile-menu-item danger"
                    onClick={() => {
                      setOpenMenuId(null)
                      onDelete(q.id)
                    }}
                  >
                    Delete
                  </button>
                </span>
              )}
            </>
          )}
        </span>
      </li>
    )
  }

  return (
    <div className="home">
      {/* Top bar: identity, the document-type tabs, and the primary action. */}
      <header className="home-header">
        <div className="home-header-top">
          <div className="home-brand">
            <span className="home-brand-name">QuoteDesk</span>
          </div>

          <div className="home-tabs" role="tablist">
            {['quotations', 'purchaseOrders'].map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={docType === key}
                className={`home-tab${docType === key ? ' is-active' : ''}`}
                onClick={() => onDocTypeChange?.(key)}
              >
                {DOC[key].tab}
                {counts[key] > 0 && (
                  <span className="home-tab-count">{counts[key]}</span>
                )}
              </button>
            ))}
          </div>

          <button className="btn-new" onClick={onNew}>
            <span className="btn-new-plus">＋</span>
            {L.newLabel}
          </button>
        </div>
      </header>

      <div className="home-body">
        {/* Filters gate the archive; search refines within the gated set. */}
        <div className="home-toolbar">
          <div className="toolbar-field">
            <span className="toolbar-label">Year</span>
            <Select
              className="sel-year"
              clearable={false}
              value={filters.year}
              onChange={setYear}
              options={yearOptions}
            />
          </div>

          <div className="toolbar-field">
            <span className="toolbar-label">Company</span>
            <Select
              className={`sel-wide ${gated ? 'sel-required' : ''}`}
              multiple
              searchable
              value={filters.sellerIds}
              onChange={(ids) => setFilters((f) => ({ ...f, sellerIds: ids }))}
              options={sellerOptions}
              placeholder="Select company"
              formatSummary={sellerSummary}
            />
          </div>

          <div className="toolbar-field">
            <span className="toolbar-label">{L.partyLabel}</span>
            <Select
              className="sel-wide"
              multiple
              searchable
              disabled={gated}
              value={filters.parties}
              onChange={(p) => setFilters((f) => ({ ...f, parties: p }))}
              options={partyOptions}
              placeholder={`All ${L.partyPlural}`}
              formatSummary={partySummary}
            />
          </div>

          <div className="toolbar-search">
            <svg className="toolbar-search-icon" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="18" y2="18" />
            </svg>
            <input
              type="search"
              value={query}
              disabled={gated}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
                if (e.key === 'Enter' && rows.length) onOpen(rows[0].quote)
              }}
              placeholder={gated ? 'Select a company first…' : L.search}
            />
            {searching && (
              <button
                className="toolbar-search-clear"
                title="Clear search"
                onClick={() => setQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {filtersActive && (
            <button
              className="toolbar-reset"
              title="Reset all filters"
              onClick={() => {
                onFilters?.(emptyFilters())
                setQuery('')
              }}
            >
              Reset
            </button>
          )}
        </div>

        {gated ? (
          <div className="home-gate">
            <div className="home-gate-icon">🗂️</div>
            <div className="home-gate-title">Choose a company to begin</div>
            <div className="home-gate-sub">
              Pick a year and at least one company (above) to list past {L.many}.
            </div>
          </div>
        ) : (
          <section className="home-section">
            <h2 className="home-section-title">
              {total} {total === 1 ? L.one : L.many}
              <span className="home-section-scope"> · {filters.year}</span>
            </h2>

            {total === 0 ? (
              <div className="recent-empty">
                No {L.many} for the selected company and year.
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.seller?.id || '_none'} className="doc-group">
                  <div
                    className="doc-group-head"
                    style={sellerColorVars(g.seller, g.index)}
                  >
                    <span className="tile-group-swatch" />
                    <span className="tile-group-name">
                      {g.seller?.name || `No ${L.ownLabel}`}
                    </span>
                    <span className="tile-group-count">{g.rows.length}</span>
                  </div>
                  <ul className="doc-list">{g.rows.map((r) => row(r, g))}</ul>
                </div>
              ))
            )}
          </section>
        )}
      </div>
    </div>
  )
}

// Inline rename field: commits on Enter or blur, discards on Escape.
function RenameInput({ initial, placeholder, onCommit, onCancel }) {
  const [value, setValue] = useState(initial)
  const ref = useRef(null)
  const cancelled = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      className="tile-rename"
      value={value}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => !cancelled.current && onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(value.trim())
        } else if (e.key === 'Escape') {
          cancelled.current = true
          onCancel()
        }
      }}
    />
  )
}
