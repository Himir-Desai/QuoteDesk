import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

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

const SEED_CUSTOMERS = [
  {
    id: 'apollo',
    name: 'APOLLO TYRES LTD',
    address: 'AT & PO: LIMDA, TA: WAGHODIA\nDIST: VADODARA',
    contact: ''
  }
]

const SEED_SUPPLIERS = [
  {
    id: 'sew',
    name: 'SEW EURODRIVE INDIA PVT LTD',
    address: 'PLOT NO 4, G I D C\nPOR RAMANGAMDI, VADODARA-381243',
    contact: '',
    gstin: '',
    pan: ''
  }
]

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
