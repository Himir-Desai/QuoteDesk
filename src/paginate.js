// Split item rows across fixed-height A4 pages, mirroring what the printer
// would do — except we decide the breaks, so the editor and the PDF agree by
// construction instead of by luck.
//
// Page 1 also carries the letterhead/party/title block; every page repeats the
// table's column header and gets its own filler row so the grid always reaches
// the bottom of the sheet. The final page carries the totals row, then the
// terms + signature.
export function paginate({
  ids, // item ids in order
  rowH, // { id: height }
  pageH, // usable content height of one A4 page
  headH, // letterhead + party + title + preamble (page 1 only)
  theadH, // table column header (repeats on every page)
  totalsH, // totals row
  tailH // terms + signature
}) {
  const DEFAULT_ROW = 30
  const rowOf = (id) => rowH[id] || DEFAULT_ROW
  const sum = (list) => list.reduce((n, id) => n + rowOf(id), 0)

  const pages = []
  let cur = []
  let avail = pageH - headH - theadH

  for (const id of ids) {
    const h = rowOf(id)
    if (cur.length && h > avail) {
      pages.push(cur)
      cur = []
      avail = pageH - theadH
    }
    cur.push(id)
    avail -= h
  }
  pages.push(cur)

  // The last page must also fit the totals row and the terms/signature block.
  // If it can't, the footer gets a page of its own. Deliberately NOT moving a
  // row down to make space: that would pull a row off a full page and leave a
  // hole where the terms used to sit.
  const footerH = totalsH + tailH
  if (avail - footerH < 0) pages.push([])

  // Per-page filler: every grid runs to the bottom of its sheet. On the final
  // page the footer's space is reserved first. A footer-only page has no grid
  // to extend, so it gets none.
  const lastIndex = pages.length - 1
  const fillers = pages.map((pageIds, i) => {
    if (i === lastIndex && pageIds.length === 0) return 0
    const room = pageH - (i === 0 ? headH : 0) - theadH - sum(pageIds)
    const f = i === lastIndex ? room - footerH : room
    return Math.max(0, Math.round(f))
  })

  return { pages, fillers }
}
