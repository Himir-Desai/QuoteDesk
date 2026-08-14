// How a saved document is named and summarised on the home screen.
//
// A document can carry an explicit `title` the user typed. When it doesn't,
// we fall back to something meaningful rather than "Untitled": the counterparty
// name (customer on a quotation, supplier on a PO), then the ref no.

/** The row's headline. */
export function quoteLabel(q) {
  const title = String(q?.title || '').trim()
  if (title) return title
  const party = String(
    q?.customerName ||
      q?.supplierName ||
      q?.customer?.name ||
      q?.supplier?.name ||
      ''
  ).trim()
  if (party) return party
  return String(q?.refNo || '').trim() || 'Untitled document'
}

/** A filename-safe version of the label, for PDF export defaults. */
export const quoteFileName = (q) =>
  quoteLabel(q).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()

/** Total value of the line items. */
export function quoteTotal(q) {
  return (q?.items || []).reduce(
    (sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0),
    0
  )
}

export const itemCount = (q) =>
  (q?.items || []).filter(
    (it) =>
      String(it.itemCode || '').trim() ||
      String(it.description || '').trim() ||
      String(it.prNumber || '').trim()
  ).length

/** ISO date (YYYY-MM-DD) → DD-MM-YYYY, matching the printed document. */
export function formatDMY(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return y && m && d ? `${d}-${m}-${y}` : String(iso)
}

const MONEY = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
export const formatMoney = (n, currency = 'Rs') =>
  `${currency} ${Number(n || 0).toLocaleString('en-IN', MONEY)}`
