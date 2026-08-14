import React, { useState } from 'react'
import { LISTS } from './data/lists.js'
import { SELLER_PALETTE, sellerColor } from './sellerColors.js'
import { DOC_TYPES } from './data/docTypes.js'
import { financialYear } from './utils/financialYear.js'

// The running serial number is per-company, per-doc-type, per-financial-year
// — same scoping the editor uses to auto-number new documents (see
// Editor.jsx's nextRefFor). Scanning here mirrors that so the field shows
// what would actually be assigned next, before any override.
const scannedNext = (docs, sellerId, fy) => {
  const nums = docs
    .filter((d) => d.sellerId === sellerId && financialYear(d.date) === fy)
    .map((d) => parseInt(d.refNumber, 10))
    .filter((n) => !isNaN(n))
  return (nums.length ? Math.max(...nums) : 0) + 1
}

// One dialog for every master list. What differs between companies, buyers and
// suppliers is only the fields and a couple of extras (logo, colour), so those
// are configuration rather than three copies of this file.
export default function ManageList({
  listKey,
  rows = [],
  onSave,
  onClose,
  quotations = [],
  purchaseOrders = []
}) {
  const cfg = LISTS[listKey]
  const [draft, setDraft] = useState(() => rows.map((r) => ({ ...r })))
  const [selectedId, setSelectedId] = useState(rows[0]?.id || null)

  const selected = draft.find((r) => r.id === selectedId) || null
  const currentFy = financialYear()

  const setField = (field) => (value) =>
    setDraft((list) =>
      list.map((r) => (r.id === selectedId ? { ...r, [field]: value } : r))
    )

  // Overrides only ever nudge the number forward for THIS financial year —
  // clearing the field (or leaving it) just falls back to the scanned count.
  const setSerialOverride = (docTypeKey) => (rawValue) =>
    setDraft((list) =>
      list.map((r) => {
        if (r.id !== selectedId) return r
        const next = { ...(r.serialOverrides || {}) }
        const n = parseInt(rawValue, 10)
        if (rawValue === '' || isNaN(n) || n < 1) delete next[docTypeKey]
        else next[docTypeKey] = { fy: currentFy, next: n }
        return { ...r, serialOverrides: next }
      })
    )

  const serialValue = (docs, docTypeKey) => {
    if (!selected) return ''
    const override = selected.serialOverrides?.[docTypeKey]
    const scanned = scannedNext(docs, selected.id, currentFy)
    if (override?.fy === currentFy) return String(Math.max(scanned, override.next))
    return String(scanned)
  }

  const addRow = () => {
    const blank = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
      name: `New ${cfg.entity}`
    }
    for (const [field] of cfg.fields) if (!(field in blank)) blank[field] = ''
    if (cfg.hasLogo) blank.logo = null
    if (cfg.hasColor) blank.color = SELLER_PALETTE[draft.length % SELLER_PALETTE.length]

    setDraft((list) => [...list, blank])
    setSelectedId(blank.id)
  }

  const deleteRow = () => {
    if (!selected) return
    setDraft((list) => {
      const next = list.filter((r) => r.id !== selectedId)
      setSelectedId(next[0]?.id || null)
      return next
    })
  }

  const chooseLogo = async () => {
    const dataUrl = await window.api.pickImage()
    if (dataUrl) setField('logo')(dataUrl)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{cfg.title}</h2>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="mgr-list">
            {draft.map((r) => (
              <button
                key={r.id}
                className={`mgr-list-item ${r.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                {r.name || '(unnamed)'}
              </button>
            ))}
            <button className="mgr-add" onClick={addRow}>
              ＋ Add {cfg.entity}
            </button>
          </div>

          <div className="mgr-form">
            {!selected ? (
              <p className="mgr-empty">
                No {cfg.entity} selected. Add one to begin.
              </p>
            ) : (
              <>
                {cfg.hasLogo && (
                  <div className="mgr-logo-row">
                    <div className="mgr-logo-preview">
                      {selected.logo ? (
                        <img src={selected.logo} alt="logo" />
                      ) : (
                        <span className="mgr-logo-empty">No logo</span>
                      )}
                    </div>
                    <div className="mgr-logo-actions">
                      <button onClick={chooseLogo}>Choose image…</button>
                      {selected.logo && (
                        <button
                          className="link-danger"
                          onClick={() => setField('logo')(null)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {cfg.fields.map(([field, label, kind]) => (
                  <label key={field} className="mgr-field">
                    <span>{label}</span>
                    {kind === 'textarea' ? (
                      <textarea
                        rows={2}
                        value={selected[field] || ''}
                        onChange={(e) => setField(field)(e.target.value)}
                      />
                    ) : (
                      <input
                        value={selected[field] || ''}
                        onChange={(e) => setField(field)(e.target.value)}
                      />
                    )}
                  </label>
                ))}

                {/* Colour tints this company's tiles on the home screen */}
                {cfg.hasColor && (
                  <label className="mgr-field">
                    <span>Colour</span>
                    <div className="mgr-color-row">
                      {SELLER_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          className={`mgr-swatch ${
                            sellerColor(selected, draft.indexOf(selected)) === c
                              ? 'active'
                              : ''
                          }`}
                          style={{ background: c }}
                          onClick={() => setField('color')(c)}
                        />
                      ))}
                      <input
                        type="color"
                        className="mgr-color-custom"
                        title="Custom colour"
                        value={sellerColor(selected, draft.indexOf(selected))}
                        onChange={(e) => setField('color')(e.target.value)}
                      />
                    </div>
                  </label>
                )}

                {listKey === 'companies' && (
                  <div className="mgr-serials">
                    <span className="mgr-serials-title">Serial numbers</span>
                    <div className="mgr-serials-row">
                      {Object.entries(DOC_TYPES).map(([key, docCfg]) => (
                        <label key={key} className="mgr-field mgr-field-inline">
                          <span>Next {docCfg.Noun} #</span>
                          <input
                            type="number"
                            min="1"
                            value={serialValue(
                              key === 'quotations' ? quotations : purchaseOrders,
                              key
                            )}
                            onChange={(e) =>
                              setSerialOverride(key)(e.target.value)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <button className="mgr-delete" onClick={deleteRow}>
                  Delete this {cfg.entity}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost-dark" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  )
}
