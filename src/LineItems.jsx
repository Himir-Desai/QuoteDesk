import React, { useRef, useEffect } from 'react'
import Select from './Select.jsx'

export const UNITS = ['Nos', 'Kg', 'Meters', 'Set']
export const CURRENCIES = ['Rs', '$', '€']
const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }))

// Resizable columns (left → right). Widths are percentages of the table, summing to 100.
export const ORDER = ['sr', 'pr', 'code', 'desc', 'qty', 'rate', 'amt']
export const DEFAULT_WIDTHS = {
  sr: 5,
  pr: 12,
  code: 13,
  desc: 30,
  qty: 13,
  rate: 12,
  amt: 15
}

export function newItem() {
  return {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
    prNumber: '',
    itemCode: '',
    description: '',
    qty: '',
    unit: 'Nos',
    rate: ''
  }
}

export function amountOf(item) {
  const q = parseFloat(item.qty) || 0
  const r = parseFloat(item.rate) || 0
  return q * r
}

export const fmt2 = (n) =>
  n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

// A textarea that grows in height to fit its content (so rows auto-expand).
function AutoTextarea({ value, onChange, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      onChange={onChange}
    />
  )
}

// Renders ONE page's worth of the items table. The editor decides which rows
// land here and whether this page carries the totals footer.
export default function LineItems({
  items, // this page's slice
  startIndex, // global index of the first row, for Sr. No.
  updateItem,
  removeRow,
  addRow,
  currency,
  widths,
  setWidths,
  showHeader = true,
  showFooter = false,
  fillerHeight = 0,
  total = 0
}) {
  const tableRef = useRef(null)

  // Resizing a column's right border trades width (in %) with the next column,
  // so the table stays 100% wide and only the proportions change.
  const startResize = (id) => (e) => {
    e.preventDefault()
    const idx = ORDER.indexOf(id)
    const nextId = ORDER[idx + 1]
    if (!nextId) return
    const tableW = tableRef.current ? tableRef.current.offsetWidth : 700
    const startX = e.clientX
    const startW = widths[id]
    const startNext = widths[nextId]
    const MIN = 3 // percent
    const onMove = (ev) => {
      let delta = ((ev.clientX - startX) / tableW) * 100
      delta = Math.max(delta, MIN - startW)
      delta = Math.min(delta, startNext - MIN)
      setWidths((prev) => ({
        ...prev,
        [id]: startW + delta,
        [nextId]: startNext - delta
      }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const Resizer = ({ id }) =>
    ORDER.indexOf(id) < ORDER.length - 1 ? (
      <span className="col-resizer" onMouseDown={startResize(id)} />
    ) : null

  const rupeeLabel = currency === 'Rs' ? 'Rupees ' : ''

  return (
    <section className="items">
      <table className="items-table" ref={tableRef}>
        <colgroup>
          {ORDER.map((id) => (
            <col key={id} style={{ width: `${widths[id]}%` }} />
          ))}
        </colgroup>

        {/* A footer-only page carries no rows, so it needs no column header. */}
        {showHeader && (
          <thead>
            <tr>
              <th className="c-sr">Sr.<br />No.<Resizer id="sr" /></th>
              <th>PR Number<Resizer id="pr" /></th>
              <th>Item Code<Resizer id="code" /></th>
              <th>Items Description<Resizer id="desc" /></th>
              <th>QTY.<Resizer id="qty" /></th>
              <th>Rate ({currency})<br />Each<Resizer id="rate" /></th>
              <th>Amount<br />({currency})<Resizer id="amt" /></th>
            </tr>
          </thead>
        )}

        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} data-row={it.id}>
              <td className="c-sr num">{startIndex + i + 1}</td>
              <td>
                <input className="cell-input" value={it.prNumber} onChange={updateItem(it.id, 'prNumber')} />
              </td>
              <td>
                <input className="cell-input" value={it.itemCode} onChange={updateItem(it.id, 'itemCode')} />
              </td>
              <td>
                <AutoTextarea className="cell-input cell-desc" value={it.description} onChange={updateItem(it.id, 'description')} />
              </td>
              <td className="c-qty">
                <div className="qty-wrap">
                  <input className="cell-input num" inputMode="decimal" value={it.qty} onChange={updateItem(it.id, 'qty')} />
                  <Select
                    className="sel-unit"
                    clearable={false}
                    value={it.unit}
                    onChange={(v) => updateItem(it.id, 'unit')({ target: { value: v } })}
                    options={UNIT_OPTIONS}
                  />
                </div>
              </td>
              <td>
                <input className="cell-input num" inputMode="decimal" value={it.rate} onChange={updateItem(it.id, 'rate')} />
              </td>
              <td className="c-amt num">
                <div className="amt-cell">
                  {fmt2(amountOf(it))}
                  <button
                    className="row-del"
                    title="Delete this item"
                    onClick={() => removeRow(it.id)}
                  >
                    － Delete item
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {/* Whitespace that carries the grid to the bottom of this sheet — on
              the final page it sits between the last item and the totals row.
              The height is computed by the editor, so no other row is ever
              stretched. Nothing editor-only lives inside the page any more. */}
          {/* Skipped when there's no meaningful space: a sliver of a row would
              stack its top and bottom borders into one thick dark line. */}
          {fillerHeight >= 8 && (
            <tr className="filler-row" style={{ height: fillerHeight }}>
              {ORDER.map((id) => (
                <td key={id} className={`c-${id}`} />
              ))}
            </tr>
          )}
        </tbody>

        {showFooter && (
          <tfoot>
            <tr className="total-row">
              <td colSpan={ORDER.length - 1} className="total-words">
                Total {rupeeLabel}in Words : <strong>{total.words}</strong>
              </td>
              <td className="c-amt num total-figure">
                {fmt2(total.value)}
                {/* Sits in the gutter beside the totals row, outside the sheet */}
                <button className="add-row-side" onClick={addRow} title="Add an item">
                  ＋ Add item
                </button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  )
}
