import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
// Full default buyer/supplier lists (imported from the legacy databases),
// bundled so a FRESH install starts with them. These are only ever used when
// the corresponding userData file is missing — see getCollection — so updates
// never overwrite a list the user has since edited.
import SEED_CUSTOMERS from './seed/customers.json'
import SEED_SUPPLIERS from './seed/suppliers.json'

// JSON files live in the OS-specific userData folder (created by Electron).
const filePath = (name) => join(app.getPath('userData'), name)

/* ------------------------------------------------------------------ *
 * Read-only historical archive (imported legacy quotations / POs).
 *
 * Bundled with the app and partitioned by company + financial year, so a
 * single company/year slice (a few hundred docs) is all that's ever read —
 * the 12k-doc archive never loads at once. Packaged builds copy the `archive`
 * folder into resources (see package.json extraResources); in dev it sits at
 * the project root, two levels up from out/main.
 * ------------------------------------------------------------------ */
const archiveDir = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'archive')
    : join(app.getAppPath(), 'archive')

export async function getArchiveManifest() {
  try {
    return JSON.parse(await readFile(join(archiveDir(), 'manifest.json'), 'utf-8'))
  } catch {
    return { years: [], sellers: {} }
  }
}

export async function getArchivePartition(sellerId, type, fy) {
  // Guard the path pieces so nothing can escape the archive folder.
  const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '')
  try {
    const file = join(archiveDir(), safe(sellerId), `${safe(type)}-${safe(fy)}.json`)
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ *
 * Master lists
 *
 * Three of them, and which one you pick depends on the document:
 *   companies  – YOUR firms. The letterhead in both documents; shown as
 *                "Seller" on a quotation and "Buyer" on a purchase order.
 *   customers  – the counterparty on a quotation ("Buyer").
 *   suppliers  – the counterparty on a purchase order ("Supplier").
 * ------------------------------------------------------------------ */

const SEED_COMPANIES = [
  {
    id: 'tanish',
    name: 'TANISH ENGINEERS',
    worksAddress:
      'WORKS: 307/4 B GIDC, OPP. TELEPHONE EXCHANGE, MAKARPURA, BARODA-390010',
    phone: '91-265-2632799',
    email: 'desaiengg@yahoo.co.in',
    gstin: '24ABGPD2777C1Z2',
    pan: 'ABGPD2777C',
    refPrefix: 'TE',
    color: '#e8833a',
    logo: null
  },
  {
    id: 'desai',
    name: 'DESAI ENGINEERING INDUSTRIES',
    worksAddress: 'WORKS: PLOT NO. 176-B, GIDC, WAGHODIA, DIST- VADODARA-391760',
    phone: '02668-264164, 02668-262633',
    email: 'desaiengg@yahoo.co.in',
    gstin: '24AABFD2965N1Z9',
    pan: 'AABFD2965N',
    refPrefix: 'DEI',
    color: '#c0392b',
    logo: null
  },
  {
    id: 'ssd',
    name: 'S.S.D. ENGINEERS',
    worksAddress: 'WORKS: 175-B, GIDC ESTATE, WAGHODIA, VADODARA-390019',
    phone: '',
    email: '',
    gstin: '24ABGPD2778P1ZA',
    pan: 'ABGPD2778P',
    refPrefix: 'SSD',
    color: '#e0a83c',
    logo: null
  },
  {
    id: 'desaibros',
    name: 'DESAI BROTHERS & ENGINEERS',
    worksAddress:
      'WORKS: 308/3 GIDC, OPP. NEW TELEPHONE EXCHANGE, MAKARPURA, VADODARA-390010',
    phone: '9925015532',
    email: 'desaiengg@yahoo.co.in',
    gstin: '24AIVPD7691M1ZG',
    pan: 'AIVPD7691M',
    refPrefix: 'DBE',
    color: '#a83e5c',
    logo: null
  }
]

// SEED_CUSTOMERS / SEED_SUPPLIERS are imported above from bundled seed files.

// Every collection is one JSON file. Documents (quotations / purchase orders)
// deliberately live in SEPARATE files: no migration of existing data, and each
// gets its own numbering series for free.
const COLLECTIONS = {
  companies: { file: 'companies.json', seed: SEED_COMPANIES, legacy: 'sellers.json' },
  customers: { file: 'customers.json', seed: SEED_CUSTOMERS },
  suppliers: { file: 'suppliers.json', seed: SEED_SUPPLIERS },
  quotations: { file: 'quotations.json', seed: [] },
  purchaseOrders: { file: 'purchaseOrders.json', seed: [] }
}

async function readJson(name) {
  return JSON.parse(await readFile(filePath(name), 'utf-8'))
}

async function writeJson(name, data) {
  await writeFile(filePath(name), JSON.stringify(data, null, 2), 'utf-8')
  return true
}

export async function getCollection(key) {
  const spec = COLLECTIONS[key]
  if (!spec) throw new Error(`Unknown collection: ${key}`)
  try {
    return await readJson(spec.file)
  } catch {
    // "sellers" was renamed to "companies"; carry the old file over once so a
    // logo you uploaded isn't lost to a rename.
    if (spec.legacy) {
      try {
        const old = await readJson(spec.legacy)
        await writeJson(spec.file, old)
        return old
      } catch {
        /* no legacy file either — fall through to the seed */
      }
    }
    await writeJson(spec.file, spec.seed)
    return spec.seed
  }
}

export async function saveCollection(key, data) {
  const spec = COLLECTIONS[key]
  if (!spec) throw new Error(`Unknown collection: ${key}`)
  return writeJson(spec.file, data)
}

/* ------------------------------------------------------------------ *
 * Documents (quotations, purchase orders) — upsert / delete by id
 * ------------------------------------------------------------------ */

const genId = () =>
  (globalThis.crypto &&
    globalThis.crypto.randomUUID &&
    globalThis.crypto.randomUUID()) ||
  String(Date.now()) + Math.random().toString(16).slice(2)

export async function saveDoc(key, doc) {
  const list = await getCollection(key)
  const saved = {
    ...doc,
    id: doc.id || genId(),
    savedAt: new Date().toISOString()
  }
  const idx = list.findIndex((d) => d.id === saved.id)
  if (idx >= 0) list[idx] = saved
  else list.push(saved)
  await saveCollection(key, list)
  return saved
}

export async function deleteDoc(key, id) {
  const list = await getCollection(key)
  await saveCollection(key, list.filter((d) => d.id !== id))
  return true
}

/* ------------------------------------------------------------------ *
 * One-time migrations
 *
 * Seeds only fill a MISSING file, so an install that already has (say) just
 * the one sample buyer never receives the full bundled list. A migration
 * backfills those existing installs exactly once. Each migration records a
 * flag in migrations.json, so it runs a single time and never again — updates
 * won't re-run it, and anything the user has since added is preserved (the
 * merge is purely additive, keyed by id and normalised name).
 * ------------------------------------------------------------------ */

const normName = (s) =>
  String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()

// Add any seed entries not already present (by id or name) to an EXISTING
// file. Missing files are left for the normal fresh-install seed path.
async function backfillCollection(key, seed) {
  const spec = COLLECTIONS[key]
  let list
  try {
    list = await readJson(spec.file)
  } catch {
    return 0 // no file yet → fresh install seeds the full list on first read
  }
  const ids = new Set(list.map((x) => x.id))
  const names = new Set(list.map((x) => normName(x.name)))
  let added = 0
  for (const entry of seed) {
    if (ids.has(entry.id) || names.has(normName(entry.name))) continue
    list.push(entry)
    ids.add(entry.id)
    names.add(normName(entry.name))
    added++
  }
  if (added) await writeJson(spec.file, list)
  return added
}

export async function runOneTimeMigrations() {
  let flags = {}
  try {
    flags = await readJson('migrations.json')
  } catch {
    /* first run — no flags yet */
  }

  // v1: backfill the full buyer/supplier lists into installs that predate them.
  if (!flags.seedFullPartiesV1) {
    try {
      await backfillCollection('customers', SEED_CUSTOMERS)
      await backfillCollection('suppliers', SEED_SUPPLIERS)
    } catch {
      /* never block startup on a migration */
    }
    flags.seedFullPartiesV1 = new Date().toISOString()
    try {
      await writeJson('migrations.json', flags)
    } catch {
      /* if we can't record the flag, better to skip than loop forever */
    }
  }
}
