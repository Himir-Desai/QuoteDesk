// Search index over saved quotations.
//
// The whole quotation list is already in memory (App loads quotations.json on
// startup), so the "index" is just a derived view of it: buildIndex() is cheap
// and re-runs whenever the list changes, which keeps results always fresh
// without a separate index file to persist or invalidate.

const norm = (s) => String(s ?? '').toLowerCase().trim()

// Fields a quotation is searchable by, in descending priority. `get` returns
// either a string or a list of strings (one per line item).
const FIELDS = [
  { key: 'title', label: 'Name', weight: 100, get: (q) => q.title },
  { key: 'refNo', label: 'Ref', weight: 100, get: (q) => q.refNo },
  { key: 'customerName', label: 'Customer', weight: 90, get: (q) => q.customerName || q.customer?.name },
  { key: 'sellerName', label: 'Seller', weight: 80, get: (q, ctx) => ctx.sellerName },
  { key: 'prNumber', label: 'PR No', weight: 70, get: (q) => q.items?.map((it) => it.prNumber) },
  { key: 'itemCode', label: 'Item code', weight: 70, get: (q) => q.items?.map((it) => it.itemCode) },
  { key: 'description', label: 'Description', weight: 50, get: (q) => q.items?.map((it) => it.description) },
  { key: 'kindAttn', label: 'Attn', weight: 40, get: (q) => q.customer?.kindAttn },
  { key: 'address', label: 'Address', weight: 30, get: (q) => q.customer?.address },
  { key: 'date', label: 'Date', weight: 20, get: (q) => dateVariants(q.date) }
]

// Let a date match however the user types it: 2025-04-09, 09-04-2025, 09/04/2025.
function dateVariants(iso) {
  if (!iso) return []
  const [y, m, d] = String(iso).split('-')
  if (!y || !m || !d) return [String(iso)]
  return [iso, `${d}-${m}-${y}`, `${d}/${m}/${y}`]
}

// One index entry per quotation: the record, plus its searchable text split by
// field so a hit can say *where* it matched.
export function buildIndex(quotations = [], sellers = []) {
  const sellerById = new Map(sellers.map((s) => [s.id, s]))

  return quotations.map((q) => {
    const seller = sellerById.get(q.sellerId)
    const ctx = { sellerName: seller?.name || '' }

    const fields = FIELDS.map((f) => {
      const raw = f.get(q, ctx)
      const values = (Array.isArray(raw) ? raw : [raw])
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
      return { ...f, values, haystack: norm(values.join(' ␟ ')) }
    }).filter((f) => f.values.length)

    return {
      quote: q,
      sellerName: ctx.sellerName,
      fields,
      haystack: fields.map((f) => f.haystack).join(' ␟ ')
    }
  })
}

// Split the query on whitespace; every token must match somewhere (AND), which
// makes "apollo bearing" narrow rather than widen the result set.
const tokenize = (query) => norm(query).split(/\s+/).filter(Boolean)

function scoreToken(entry, token) {
  let best = 0
  let field = null
  for (const f of entry.fields) {
    const at = f.haystack.indexOf(token)
    if (at < 0) continue
    // Prefer whole-value and start-of-value matches over mid-word ones.
    const exact = f.values.some((v) => norm(v) === token)
    const startsValue = f.values.some((v) => norm(v).startsWith(token))
    const bonus = exact ? 60 : startsValue ? 30 : 0
    const score = f.weight + bonus
    if (score > best) {
      best = score
      field = f
    }
  }
  return { score: best, field }
}

/**
 * Search the index. Returns scored hits, best first, each with the fields that
 * matched so the UI can show why a row is in the list.
 */
export function searchIndex(index, query, { limit = 50 } = {}) {
  const tokens = tokenize(query)
  if (!tokens.length) return []

  const hits = []
  for (const entry of index) {
    let total = 0
    const matched = new Map()
    let all = true

    for (const token of tokens) {
      const { score, field } = scoreToken(entry, token)
      if (!score) {
        all = false
        break
      }
      total += score
      if (field && !matched.has(field.key)) matched.set(field.key, field)
    }
    if (!all) continue

    hits.push({
      quote: entry.quote,
      sellerName: entry.sellerName,
      score: total,
      matches: [...matched.values()].map((f) => ({
        key: f.key,
        label: f.label,
        // The first value containing a token — what the UI shows as context.
        value:
          f.values.find((v) => tokens.some((t) => norm(v).includes(t))) ||
          f.values[0]
      }))
    })
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      String(b.quote.savedAt || '').localeCompare(String(a.quote.savedAt || ''))
  )
  return hits.slice(0, limit)
}
