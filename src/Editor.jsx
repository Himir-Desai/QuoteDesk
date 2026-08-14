import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import LineItems, {
  newItem,
  amountOf,
  DEFAULT_WIDTHS,
  CURRENCIES
} from './LineItems.jsx'
import { amountToWords } from './utils/numberToWords.js'
import { paginate } from './paginate.js'
import { DOC_TYPES, termDefaults } from './data/docTypes.js'
import { financialYear } from './utils/financialYear.js'
import Select from './Select.jsx'

// Format an ISO date (YYYY-MM-DD) as DD-MM-YYYY, like the sample PDFs.
function formatDMY(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Usable content height of one A4 page (1122px sheet - 2 x 12mm margins),
// kept a good bit under the true 1032px content box (and print's 1030px
// clip) so small screen/print rendering differences can never tip a
// near-full page into clipping the last line instead of a fresh page.
const PAGE_H = 1000

export default function Editor({
  onHome,
  docType = 'quotations',
  companies = [],
  parties = [],
  siblingDocs = [],
  initialQuote = null,
  readOnly = false,
  archiveManifest = { sellers: {} },
  onSave,
  registerAutosave
}) {
  const cfg = DOC_TYPES[docType] || DOC_TYPES.quotations
  const q = initialQuote
  const [quoteId, setQuoteId] = useState(q?.id || null)

  // The issuing company (letterhead). Stored as sellerId for both doc types.
  const [sellerId, setSellerId] = useState(q?.sellerId || '')
  const company = companies.find((s) => s.id === sellerId) || null

  // The counterparty — a customer on a quotation, a supplier on a PO. Stored
  // under the key the doc type dictates so home tiles read it correctly.
  const [partyId, setPartyId] = useState(q?.[`${cfg.partyKey}Id`] || '')
  const [party, setParty] = useState(
    q?.[cfg.partyKey] || { name: '', address: '', kindAttn: '' }
  )
  const setPartyField = (field) => (e) =>
    setParty((p) => ({ ...p, [field]: e.target.value }))

  const onSelectParty = (id) => {
    setPartyId(id)
    const p = parties.find((x) => x.id === id)
    if (p) {
      setParty({
        name: p.name || '',
        address: p.address || '',
        kindAttn: p.contact || ''
      })
    }
  }

  // Optional user-given name; falls back to party/ref when blank.
  const [title, setTitle] = useState(q?.title || '')

  const [date, setDate] = useState(q?.date || todayISO())
  const [refNumber, setRefNumber] = useState(q?.refNumber || '1')
  const refNo = company
    ? `${company.refPrefix}/${refNumber}/${financialYear(date)}`
    : ''
  const dateInputRef = useRef(null)

  // Free-text meta lines (PO: Your Ref / Your Enquiry).
  const [meta, setMeta] = useState(q?.meta || {})
  const setMetaField = (key) => (e) =>
    setMeta((m) => ({ ...m, [key]: e.target.value }))

  // Delivery-at block (PO). Follows the issuing company until edited by hand.
  const [delivery, setDelivery] = useState(
    q?.delivery || { name: '', address: '' }
  )
  const deliveryEdited = useRef(Boolean(q?.delivery))
  const setDeliveryField = (field) => (e) => {
    deliveryEdited.current = true
    setDelivery((d) => ({ ...d, [field]: e.target.value }))
  }

  const applyCompanyDefaults = (c) => {
    if (cfg.hasDelivery && c && !deliveryEdited.current) {
      setDelivery({ name: c.name || '', address: c.worksAddress || '' })
    }
  }

  const nextRefFor = (sid, forDate) => {
    const fy = financialYear(forDate)
    const nums = siblingDocs
      .filter((x) => x.sellerId === sid && financialYear(x.date) === fy)
      .map((x) => parseInt(x.refNumber, 10))
      .filter((n) => !isNaN(n))
    const scanned = (nums.length ? Math.max(...nums) : 0) + 1

    // A manually-set "next number" from Manage My Companies only counts while
    // it's still ahead of what's actually been issued this financial year —
    // once a real document reaches or passes it, the scanned count takes over.
    const override = companies.find((c) => c.id === sid)?.serialOverrides?.[
      cfg.collection
    ]
    const overrideNext = override?.fy === fy ? Number(override.next) : 0

    // Imported archive docs count toward the running series too, so a new doc
    // never reuses a number already issued in a past (archived) year.
    const archiveMax =
      archiveManifest?.sellers?.[sid]?.[cfg.collection]?.[fy]?.maxRef || 0

    return String(Math.max(scanned, overrideNext || 0, archiveMax + 1))
  }

  const onSelectCompany = (id) => {
    setSellerId(id)
    const c = companies.find((x) => x.id === id)
    if (!quoteId && id) setRefNumber(nextRefFor(id, date))
    applyCompanyDefaults(c)
  }

  const [items, setItems] = useState(q?.items?.length ? q.items : [newItem()])
  const [currency, setCurrency] = useState(q?.currency || 'Rs')
  const [widths, setWidths] = useState(q?.columnWidths || { ...DEFAULT_WIDTHS })
  const [terms, setTerms] = useState(q?.terms || termDefaults(cfg))
  const setTerm = (field) => (e) =>
    setTerms((t) => ({ ...t, [field]: e.target.value }))
  const [notes, setNotes] = useState(q?.notes || '')

  const updateItem = (id, field) => (e) => {
    const value = e.target.value
    setItems((rows) =>
      rows.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    )
  }
  const addRow = () => setItems((rows) => [...rows, newItem()])
  const removeRow = (id) =>
    setItems((rows) => rows.filter((it) => it.id !== id))

  const totalValue = items.reduce((sum, it) => sum + amountOf(it), 0)
  const total = { value: totalValue, words: amountToWords(totalValue) }

  // ---- Pagination -------------------------------------------------------
  const pagesRef = useRef(null)
  const [pages, setPages] = useState([items.map((it) => it.id)])
  const [fillers, setFillers] = useState([0])

  useLayoutEffect(() => {
    const root = pagesRef.current
    if (!root) return
    const h = (sel) => {
      const el = root.querySelector(sel)
      return el ? el.getBoundingClientRect().height : 0
    }

    const rowH = {}
    root.querySelectorAll('tr[data-row]').forEach((tr) => {
      rowH[tr.dataset.row] = tr.getBoundingClientRect().height
    })

    // Measure gaps, not boxes: getBoundingClientRect() excludes margins, and
    // the blocks after the table carry margins between them.
    const headEl = root.querySelector('.doc-head')
    const tables = root.querySelectorAll('.items-table')
    const firstTable = tables[0]
    const lastTable = tables[tables.length - 1]
    const tailEl = root.querySelector('.doc-tail')
    const bottom = (el) => el.offsetTop + el.offsetHeight

    const headH =
      headEl && firstTable ? firstTable.offsetTop - headEl.offsetTop : 0
    const tailH = tailEl && lastTable ? bottom(tailEl) - bottom(lastTable) : 0

    const result = paginate({
      ids: items.map((it) => it.id),
      rowH,
      pageH: PAGE_H,
      headH,
      theadH: h('.items-table thead'),
      totalsH: h('.total-row'),
      tailH
    })

    // Centre the gutter buttons on their rows.
    const centre = (tr, btn) => {
      if (!btn) return
      const wrap = tr.closest('.page-wrap')
      if (!wrap) return
      const t = tr.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      btn.style.top = `${t.top - w.top + (t.height - btn.offsetHeight) / 2}px`
    }
    root
      .querySelectorAll('tr[data-row]')
      .forEach((tr) => centre(tr, tr.querySelector('.row-del')))
    root
      .querySelectorAll('.total-row')
      .forEach((tr) => centre(tr, tr.querySelector('.add-row-side')))

    const pagesSame = JSON.stringify(result.pages) === JSON.stringify(pages)
    const fillersSame =
      result.fillers.length === fillers.length &&
      result.fillers.every((f, i) => Math.abs(f - fillers[i]) <= 2)
    if (!pagesSame || !fillersSame) {
      setPages(result.pages)
      setFillers(result.fillers)
    }
  })

  const byId = new Map(items.map((it) => [it.id, it]))
  const pageSlices = pages.map((ids) =>
    ids.map((id) => byId.get(id)).filter(Boolean)
  )
  const lastPage = pageSlices.length - 1

  // ---- Export / save ----------------------------------------------------
  const [status, setStatus] = useState('')
  const exportPdf = async () => {
    const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '-').trim()
    const base =
      safe(title) ||
      safe(refNo).replace(/\//g, '-') ||
      safe(party.name) ||
      cfg.noun
    setStatus('Generating PDF…')
    try {
      const res = await window.api.exportPDF(`${base}.pdf`)
      if (res.success) setStatus(`Saved: ${res.filePath}`)
      else if (res.canceled) setStatus('')
      else setStatus('Export failed.')
    } catch (err) {
      setStatus(`Export failed: ${err.message}`)
    }
  }

  const buildData = () => ({
    id: quoteId,
    type: docType,
    title: title.trim(),
    refNo,
    sellerId,
    [`${cfg.partyKey}Id`]: partyId,
    [cfg.partyKey]: party,
    [`${cfg.partyKey}Name`]: party.name,
    date,
    refNumber,
    currency,
    items,
    terms,
    notes,
    meta,
    delivery: cfg.hasDelivery ? delivery : undefined,
    columnWidths: widths
  })

  const hasContent = () => {
    if (quoteId) return true
    if (
      title.trim() ||
      party.name?.trim() ||
      party.address?.trim() ||
      party.kindAttn?.trim()
    )
      return true
    return items.some(
      (it) =>
        String(it.prNumber || '').trim() ||
        String(it.itemCode || '').trim() ||
        String(it.description || '').trim() ||
        String(it.qty || '').trim() ||
        String(it.rate || '').trim()
    )
  }

  const saveDoc = async () => {
    if (!onSave || readOnly) return
    const saved = await onSave(buildData())
    if (saved?.id) setQuoteId(saved.id)
    setStatus(`Saved ${saved?.refNo || ''}`)
  }

  const autosaveRef = useRef(null)
  autosaveRef.current = async () => {
    if (!onSave || readOnly || !hasContent()) return
    await onSave(buildData(), { autosave: true })
  }

  const exportRef = useRef(exportPdf)
  exportRef.current = exportPdf
  const saveRef = useRef(saveDoc)
  saveRef.current = saveDoc
  useEffect(() => {
    if (!window.api?.onMenuAction) return
    return window.api.onMenuAction((action) => {
      if (action === 'export') exportRef.current()
      else if (action === 'save') saveRef.current()
    })
  }, [])

  useEffect(() => {
    registerAutosave?.(() => autosaveRef.current?.())
    return () => {
      autosaveRef.current?.()
      registerAutosave?.(null)
    }
  }, [])

  return (
    <div className={`editor-wrap${readOnly ? ' editor-readonly' : ''}`}>
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onHome}>← Home</button>
        <input
          className="editor-topbar-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={refNo || `Untitled ${cfg.Noun}`}
          title={`Name this ${cfg.noun}`}
          readOnly={readOnly}
        />
        <span className="editor-topbar-spacer" />
        {status && <span className="topbar-status">{status}</span>}
        {readOnly && (
          <span className="topbar-badge" title="Imported document — view and export only">
            🔒 Archived · read-only
          </span>
        )}
        <div className="topbar-field">
          <span>{cfg.ownLabel}</span>
          <Select
            className="sel-topbar"
            searchable
            disabled={readOnly}
            value={sellerId}
            onChange={onSelectCompany}
            placeholder={`— Select ${cfg.ownLabel.toLowerCase()} —`}
            options={companies.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="topbar-field">
          <span>{cfg.partyLabel}</span>
          <Select
            className="sel-topbar"
            searchable
            disabled={readOnly}
            value={partyId}
            onChange={onSelectParty}
            placeholder={`— Select ${cfg.partyLabel.toLowerCase()} —`}
            options={parties.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div className="topbar-field">
          <span>Currency</span>
          <Select
            className="sel-topbar sel-topbar-narrow"
            clearable={false}
            disabled={readOnly}
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        {!readOnly && (
          <button className="btn-ghost" onClick={saveDoc}>Save</button>
        )}
        <button className="btn-primary" onClick={exportPdf}>Export PDF</button>
      </div>

      <div className="pages" ref={pagesRef}>
        {pageSlices.map((slice, pageIndex) => {
          const startIndex = pages
            .slice(0, pageIndex)
            .reduce((n, ids) => n + ids.length, 0)
          return (
            <div className="page-wrap" key={pageIndex}>
              <div className="page">
                {pageIndex === 0 && (
                  <div className="doc-head">
                    {company ? (
                      <section className="letterhead">
                        {company.logo ? (
                          <img className="letterhead-img" src={company.logo} alt={company.name} />
                        ) : (
                          <div className="letterhead-logo">{company.name}</div>
                        )}
                        <div className="letterhead-address">{company.worksAddress}</div>
                        <div className="letterhead-contact">Phone No : {company.phone}</div>
                        <div className="letterhead-contact">E Mail : {company.email}</div>
                      </section>
                    ) : (
                      <section className="skeleton header">
                        <div className="skeleton-logo">LOGO</div>
                        <div className="skeleton-lines">
                          <div>Select a {cfg.ownLabel.toLowerCase()} to fill the letterhead →</div>
                        </div>
                      </section>
                    )}

                    <section className="party">
                      <div className="party-col">
                        <div className="party-to">
                          <span className="party-label">To,</span>
                          <input
                            className="inline-input inline-strong"
                            placeholder={cfg.partyPlaceholder}
                            value={party.name}
                            onChange={setPartyField('name')}
                          />
                        </div>
                        <textarea
                          className="inline-input inline-address"
                          placeholder="AT & PO: LIMDA, TA: WAGHODIA&#10;DIST: VADODARA"
                          rows={2}
                          value={party.address}
                          onChange={setPartyField('address')}
                        />
                        <div className="party-attn">
                          <span className="party-label">Kind Attn :</span>
                          <input
                            className="inline-input"
                            placeholder="Mr Jignesh Bhatt"
                            value={party.kindAttn}
                            onChange={setPartyField('kindAttn')}
                          />
                        </div>
                      </div>
                      <div className="party-col party-col-right">
                        <div className="meta-row">
                          <span className="party-label">GSTIN :</span>
                          <span>{company ? company.gstin : ''}</span>
                        </div>
                        <div className="meta-row">
                          <span className="party-label">PAN No. :</span>
                          <span>{company ? company.pan : ''}</span>
                        </div>
                        <div className="meta-row">
                          <span className="party-label">{cfg.refLabel} :</span>
                          <span className="meta-value">
                            {company ? (
                              <>
                                {company.refPrefix}/
                                <input
                                  className="inline-input inline-refno"
                                  value={refNumber}
                                  onChange={(e) => setRefNumber(e.target.value)}
                                />
                                /{financialYear(date)}
                              </>
                            ) : (
                              <span className="meta-hint">select {cfg.ownLabel.toLowerCase()}</span>
                            )}
                          </span>
                        </div>
                        <div className="meta-row">
                          <span className="party-label">DATE :</span>
                          <span className="meta-value">
                            {formatDMY(date)}
                            <button
                              className="date-btn"
                              title="Set date"
                              onClick={() => dateInputRef.current?.showPicker?.()}
                            >
                              📅
                            </button>
                            <input
                              ref={dateInputRef}
                              type="date"
                              className="date-hidden"
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                            />
                          </span>
                        </div>
                      </div>
                    </section>

                    <h2 className="title">{cfg.title}</h2>

                    {cfg.extraMeta.length > 0 && (
                      <div className="extra-meta">
                        {cfg.extraMeta.map((m) => (
                          <div className="extra-meta-row" key={m.key}>
                            <span className="extra-meta-label">{m.label} :</span>
                            <input
                              className="inline-input"
                              placeholder={m.placeholder || ''}
                              value={meta[m.key] || ''}
                              onChange={setMetaField(m.key)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="preamble">{cfg.preamble}</p>
                  </div>
                )}

                <LineItems
                  items={slice}
                  startIndex={startIndex}
                  updateItem={updateItem}
                  removeRow={removeRow}
                  addRow={addRow}
                  currency={currency}
                  widths={widths}
                  setWidths={setWidths}
                  showHeader={slice.length > 0}
                  showFooter={pageIndex === lastPage}
                  fillerHeight={fillers[pageIndex] || 0}
                  total={total}
                />

                {pageIndex === lastPage && (
                  <div className="doc-tail">
                    <section className="terms">
                      {cfg.terms.map((t) => (
                        <div className="term-row" key={t.key}>
                          <span className="term-label">{t.label} :</span>
                          <input
                            className="inline-input term-input"
                            value={terms[t.key] ?? ''}
                            onChange={setTerm(t.key)}
                          />
                        </div>
                      ))}
                    </section>

                    <section className="notes">
                      <span className="notes-label">Notes :</span>
                      <textarea
                        className="inline-input inline-address notes-input"
                        placeholder="Any additional notes…"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </section>

                    <div className="doc-foot">
                      {cfg.hasDelivery && (
                        <section className="delivery-at">
                          <span className="party-label">Delivery At :</span>
                          <div className="delivery-body">
                            <input
                              className="inline-input inline-strong"
                              placeholder="Company name"
                              value={delivery.name}
                              onChange={setDeliveryField('name')}
                            />
                            <textarea
                              className="inline-input inline-address"
                              rows={2}
                              placeholder="Works address"
                              value={delivery.address}
                              onChange={setDeliveryField('address')}
                            />
                          </div>
                        </section>
                      )}

                      <section className="signature">
                        For {company ? company.name : <span>&lt;{cfg.ownLabel}&gt;</span>}
                      </section>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
