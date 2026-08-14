// Indian financial year (Apr–Mar) for a given ISO date string (YYYY-MM-DD).
export function financialYear(isoDate) {
  const d = isoDate ? new Date(isoDate) : new Date()
  const y = d.getFullYear()
  const m = d.getMonth() // 0 = Jan
  return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
