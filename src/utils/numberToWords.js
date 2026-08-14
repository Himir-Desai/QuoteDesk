// Convert a number to words using the Indian system (thousand / lac / crore).
// Wording matches the sample PDFs, e.g. 1844000 -> "EIGHTEEN LACS FORTY-FOUR THOUSAND ONLY".

const ONES = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'
]
const TENS = [
  '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'
]

// 0–99
function twoDigits(n) {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = n % 10
  return o ? `${t}-${ONES[o]}` : t
}

// 0–999
function threeDigits(n) {
  const h = Math.floor(n / 100)
  const rem = n % 100
  const parts = []
  if (h) parts.push(`${ONES[h]} HUNDRED`)
  if (rem) parts.push(twoDigits(rem))
  return parts.join(' ')
}

// Whole-rupee amount to words (Indian grouping), with "ONLY" suffix.
export function amountToWords(amount) {
  let n = Math.floor(Math.abs(amount))
  if (n === 0) return 'ZERO ONLY'

  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lac = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  const hundred = n // 0–999

  const parts = []
  if (crore) parts.push(`${threeDigits(crore)} CRORE${crore > 1 ? 'S' : ''}`)
  if (lac) parts.push(`${twoDigits(lac)} LAC${lac > 1 ? 'S' : ''}`)
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`)
  if (hundred) parts.push(threeDigits(hundred))

  return `${parts.join(' ')} ONLY`
}
