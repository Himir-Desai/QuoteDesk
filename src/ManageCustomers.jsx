import React, { useState } from 'react'

const blankCustomer = () => ({
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
  name: 'New Customer',
  address: '',
  contact: ''
})

const FIELDS = [
  ['name', 'Company Name', 'input'],
  ['address', 'Address', 'textarea'],
  ['contact', 'Default Kind Attn (optional)', 'input']
]

export default function ManageCustomers({ customers, onSave, onClose }) {
  const [draft, setDraft] = useState(() => customers.map((c) => ({ ...c })))
  const [selectedId, setSelectedId] = useState(customers[0]?.id || null)

  const selected = draft.find((c) => c.id === selectedId) || null

  const setField = (field) => (value) =>
    setDraft((rows) =>
      rows.map((c) => (c.id === selectedId ? { ...c, [field]: value } : c))
    )

  const addCustomer = () => {
    const c = blankCustomer()
    setDraft((rows) => [...rows, c])
    setSelectedId(c.id)
  }

  const deleteCustomer = () => {
    if (!selected) return
    setDraft((rows) => {
      const next = rows.filter((c) => c.id !== selectedId)
      setSelectedId(next[0]?.id || null)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Customers</h2>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="mgr-list">
            {draft.map((c) => (
              <button
                key={c.id}
                className={`mgr-list-item ${c.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name || '(unnamed)'}
              </button>
            ))}
            <button className="mgr-add" onClick={addCustomer}>＋ Add customer</button>
          </div>

          <div className="mgr-form">
            {!selected ? (
              <p className="mgr-empty">No customer selected. Add one to begin.</p>
            ) : (
              <>
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

                <button className="mgr-delete" onClick={deleteCustomer}>
                  Delete this customer
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
