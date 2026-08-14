// Each seller gets a colour, used to tint its tiles and group header on Home.
// Sellers store a `color` (hex) that the user can change in Manage Sellers;
// these are only the defaults for sellers that don't have one yet.

// Warm oranges → deep reds, ordered so adjacent sellers stay distinguishable.
export const SELLER_PALETTE = [
  '#e8833a', // amber orange
  '#c0392b', // brick red
  '#d9663d', // burnt orange
  '#8e2f22', // deep maroon
  '#e0a83c', // gold
  '#a83e5c'  // wine
]

// Seeded sellers keep a fixed colour so they look the same on every machine.
const BY_ID = {
  tanish: '#e8833a',
  desai: '#c0392b'
}

/** The colour for a seller: explicit choice, then seed, then palette by position. */
export function sellerColor(seller, index = 0) {
  if (!seller) return '#8b94a3'
  return (
    seller.color || BY_ID[seller.id] || SELLER_PALETTE[index % SELLER_PALETTE.length]
  )
}

// #rrggbb → "r, g, b" so CSS can build rgba() tints at any opacity.
export function rgbChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return '139, 148, 163'
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/**
 * CSS custom properties for a seller's colour, spread onto a tile or header.
 * Consumers style themselves with var(--seller) / rgba(var(--seller-rgb), …).
 */
export function sellerColorVars(seller, index = 0) {
  const color = sellerColor(seller, index)
  return { '--seller': color, '--seller-rgb': rgbChannels(color) }
}
