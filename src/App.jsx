import React, { useState, useEffect, useRef } from 'react'
import Home from './Home.jsx'
import Editor from './Editor.jsx'
import ManageList from './ManageList.jsx'
import { financialYear } from './utils/financialYear.js'

// Top-level view switch: 'home' (start screen) or 'editor'.
export default function App() {
  const [view, setView] = useState('home')
  const [toast, setToast] = useState('')
  const [sellers, setSellers] = useState([])
  const [customers, setCustomers] = useState([])
  const [quotations, setQuotations] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])

  // Which document type the home screen is showing. Each type is its own
  // collection (and its own numbering series), so they never interleave.
  const [docType, setDocType] = useState('quotations')
  const docs = docType === 'quotations' ? quotations : purchaseOrders
  const setDocs = docType === 'quotations' ? setQuotations : setPurchaseOrders

  const [suppliers, setSuppliers] = useState([])

  // Which master list dialog is open: 'companies' | 'customers' | 'suppliers'.
  const [managing, setManaging] = useState(null)

  // Which quotation the editor is showing: { quote, key }. key forces a fresh
  // editor mount so its state re-initialises from the opened quote (or blank).
  const [editing, setEditing] = useState({ quote: null, key: 0 })

  // Home's filter + search state lives here, not in Home, so opening a document
  // (which unmounts Home) and coming back doesn't wipe the chosen year/company.
  const [homeFilters, setHomeFilters] = useState({
    year: financialYear(),
    sellerIds: [],
    parties: []
  })
  const [homeQuery, setHomeQuery] = useState('')

  // Read-only historical archive. The manifest (years + per-slice counts) is
  // tiny and loaded once; the actual documents are fetched one company/year
  // slice at a time and cached, so thousands of archived docs never load or
  // index at once.
  const [archiveManifest, setArchiveManifest] = useState({ years: [], sellers: {} })
  const [archiveSlice, setArchiveSlice] = useState([])
  const archiveCache = useRef(new Map())

  // The editor registers its autosave here so the app can flush on close.
  const autosaveRef = useRef(null)
  const registerAutosave = (fn) => {
    autosaveRef.current = fn
  }

  // Load persisted data on startup.
  useEffect(() => {
    // "companies" are YOUR firms — the letterhead on both documents. Shown as
    // "Seller" on a quotation and "Buyer" on a purchase order.
    window.api?.getCompanies?.().then((s) => setSellers(s || []))
    window.api?.getCustomers?.().then((c) => setCustomers(c || []))
    window.api?.getSuppliers?.().then((s) => setSuppliers(s || []))
    window.api?.getCollection?.('quotations').then((q) => setQuotations(q || []))
    window.api
      ?.getCollection?.('purchaseOrders')
      .then((p) => setPurchaseOrders(p || []))
    window.api
      ?.getArchiveManifest?.()
      .then((m) => setArchiveManifest(m || { years: [], sellers: {} }))
  }, [])

  // Load the archive slice for the current tab + year + selected companies.
  // Each (company, type, year) partition is fetched once and cached.
  useEffect(() => {
    const type = docType
    const fy = homeFilters.year
    const ids = homeFilters.sellerIds
    if (!ids.length) {
      setArchiveSlice([])
      return
    }
    let cancelled = false
    Promise.all(
      ids.map(async (sid) => {
        const ck = `${sid}|${type}|${fy}`
        if (archiveCache.current.has(ck)) return archiveCache.current.get(ck)
        const docs = (await window.api?.getArchivePartition?.(sid, type, fy)) || []
        archiveCache.current.set(ck, docs)
        return docs
      })
    ).then((parts) => {
      if (!cancelled) setArchiveSlice(parts.flat())
    })
    return () => {
      cancelled = true
    }
  }, [docType, homeFilters.year, homeFilters.sellerIds])

  const newQuote = () => {
    setEditing((e) => ({ quote: null, key: e.key + 1, type: docType }))
    setView('editor')
  }
  const openQuote = (quote) => {
    setEditing((e) => ({ quote, key: e.key + 1, type: docType }))
    setView('editor')
  }

  // Route menu actions from the native app menu.
  useEffect(() => {
    if (!window.api?.onMenuAction) return
    return window.api.onMenuAction((action) => {
      if (action === 'new' || action === 'new-quotation') {
        setDocType('quotations')
        setEditing((e) => ({ quote: null, key: e.key + 1, type: 'quotations' }))
        setView('editor')
      } else if (action === 'new-po') {
        setDocType('purchaseOrders')
        setEditing((e) => ({
          quote: null,
          key: e.key + 1,
          type: 'purchaseOrders'
        }))
        setView('editor')
      } else if (action === 'home') setView('home')
      else if (action === 'open') setView('home')
      else if (action === 'manage-sellers') setManaging('companies')
      else if (action === 'manage-customers') setManaging('customers')
      else if (action === 'manage-suppliers') setManaging('suppliers')
      /* 'save' and 'export' are handled inside the editor */
    })
  }, [])

  // Keep the document-only menu items (Save / Export) in step with the view.
  useEffect(() => {
    window.api?.setMenuContext?.(view)
  }, [view])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // The app is closing: flush the open quotation, then let the window close.
  useEffect(() => {
    if (!window.api?.onAppClosing) return
    return window.api.onAppClosing(async () => {
      try {
        await autosaveRef.current?.()
      } catch {
        /* never block the close on a save failure */
      }
      window.api.closingDone()
    })
  }, [])

  // One save path for all three master lists.
  const MASTERS = {
    companies: { rows: sellers, set: setSellers, label: 'Companies' },
    customers: { rows: customers, set: setCustomers, label: 'Buyers' },
    suppliers: { rows: suppliers, set: setSuppliers, label: 'Suppliers' }
  }

  const saveMaster = async (next) => {
    const m = MASTERS[managing]
    if (!m) return
    await window.api?.saveCollection?.(managing, next)
    m.set(next)
    setManaging(null)
    setToast(`${m.label} saved`)
  }

  // Re-read one collection from disk and push it into the matching state.
  const reload = async (type) => {
    const list = (await window.api?.getCollection?.(type)) || []
    if (type === 'quotations') setQuotations(list)
    else setPurchaseOrders(list)
    return list
  }

  // Persist a document; returns the saved record (with id) to the editor.
  // Writes to whichever collection the editor was opened against, so switching
  // tabs mid-edit can never file a document under the wrong type.
  const saveQuotation = async (quote, opts = {}) => {
    const type = editing.type || 'quotations'
    const saved = await window.api?.saveDoc?.(type, quote)
    await reload(type)
    setToast(
      `${opts.autosave ? 'Autosaved' : 'Saved'} ${saved?.refNo || 'document'}`
    )
    return saved
  }

  // Rename from the home screen: persist just the title, leaving the rest as-is.
  const renameQuotation = async (quote, title) => {
    await window.api?.saveDoc?.(docType, { ...quote, title })
    await reload(docType)
  }

  const deleteQuotation = async (id) => {
    await window.api?.deleteDoc?.(docType, id)
    await reload(docType)
  }

  // Total docs per type = live + everything in the archive manifest.
  const archiveTotal = (type) => {
    let n = 0
    for (const sid of Object.keys(archiveManifest.sellers || {})) {
      const byFy = archiveManifest.sellers[sid]?.[type] || {}
      for (const fy of Object.keys(byFy)) n += byFy[fy].count || 0
    }
    return n
  }

  return (
    <>
      {view === 'editor' ? (
        <Editor
          key={editing.key}
          docType={editing.type || 'quotations'}
          initialQuote={editing.quote}
          readOnly={Boolean(editing.quote?.readOnly)}
          onHome={() => setView('home')}
          companies={sellers}
          parties={editing.type === 'purchaseOrders' ? suppliers : customers}
          siblingDocs={
            editing.type === 'purchaseOrders' ? purchaseOrders : quotations
          }
          archiveManifest={archiveManifest}
          onSave={saveQuotation}
          registerAutosave={registerAutosave}
        />
      ) : (
        <Home
          onNew={newQuote}
          onOpen={openQuote}
          onDelete={deleteQuotation}
          onRename={renameQuotation}
          recent={docs}
          archive={archiveSlice}
          archiveManifest={archiveManifest}
          sellers={sellers}
          docType={docType}
          onDocTypeChange={setDocType}
          filters={homeFilters}
          onFilters={setHomeFilters}
          query={homeQuery}
          onQuery={setHomeQuery}
          counts={{
            quotations: quotations.length + archiveTotal('quotations'),
            purchaseOrders: purchaseOrders.length + archiveTotal('purchaseOrders')
          }}
        />
      )}

      {managing && (
        <ManageList
          listKey={managing}
          rows={MASTERS[managing].rows}
          onSave={saveMaster}
          onClose={() => setManaging(null)}
          quotations={quotations}
          purchaseOrders={purchaseOrders}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
