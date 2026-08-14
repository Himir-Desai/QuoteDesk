import React, { useState } from 'react'
import { SELLER_PALETTE, sellerColor } from './sellerColors.js'

const blankSeller = () => ({
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
  name: 'New Seller',
  worksAddress: '',
  phone: '',
  email: '',
  gstin: '',
  pan: '',
  refPrefix: '',
  color: SELLER_PALETTE[0],
  logo: null
})

const FIELDS = [
  ['name', 'Company Name', 'input'],
  ['worksAddress', 'Works Address', 'textarea'],
  ['phone', 'Phone', 'input'],
  ['email', 'Email', 'input'],
  ['gstin', 'GSTIN', 'input'],
  ['pan', 'PAN No.', 'input'],
  ['refPrefix', 'Ref Prefix (e.g. TE)', 'input']
]

export default function ManageSellers({ sellers, onSave, onClose }) {
  const [draft, setDraft] = useState(() => sellers.map((s) => ({ ...s })))
  const [selectedId, setSelectedId] = useState(sellers[0]?.id || null)

  const selected = draft.find((s) => s.id === selectedId) || null

  const setField = (field) => (value) =>
    setDraft((rows) =>
      rows.map((s) => (s.id === selectedId ? { ...s, [field]: value } : s))
    )

  const addSeller = () => {
    const s = blankSeller()
    setDraft((rows) => [...rows, s])
    setSelectedId(s.id)
  }

  const deleteSeller = () => {
    if (!selected) return
    setDraft((rows) => {
      const next = rows.filter((s) => s.id !== selectedId)
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
          <h2>Manage Sellers</h2>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Left: list */}
          <div className="mgr-list">
            {draft.map((s) => (
              <button
                key={s.id}
                className={`mgr-list-item ${s.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                {s.name || '(unnamed)'}
              </button>
            ))}
            <button className="mgr-add" onClick={addSeller}>＋ Add seller</button>
          </div>

          {/* Right: form */}
          <div className="mgr-form">
            {!selected ? (
              <p className="mgr-empty">No seller selected. Add one to begin.</p>
            ) : (
              <>
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
                      <button className="link-danger" onClick={() => setField('logo')(null)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {FIELDS.map(([field, label, kind]) => (
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

                {/* Colour used to tint this seller's tiles on the home screen */}
                <label className="mgr-field">
                  <span>Colour</span>
                  <div className="mgr-color-row">
                    {SELLER_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        className={`mgr-swatch ${
                          sellerColor(selected, draft.indexOf(selected)) === c ? 'active' : ''
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

                <button className="mgr-delete" onClick={deleteSeller}>
                  Delete this seller
                </button>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost-dark" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
