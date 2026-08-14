import { contextBridge, ipcRenderer } from 'electron'

// Safe bridge between the renderer (React) and the main process.
contextBridge.exposeInMainWorld('api', {
  exportPDF: (defaultName) => ipcRenderer.invoke('export-pdf', defaultName),

  pickImage: () => ipcRenderer.invoke('image:pick'),

  // Generic collection access. Keys: 'companies' | 'customers' | 'suppliers'
  // | 'quotations' | 'purchaseOrders' — each backed by its own JSON file.
  getCollection: (key) => ipcRenderer.invoke('collection:get', key),
  saveCollection: (key, data) => ipcRenderer.invoke('collection:save', key, data),

  // Documents: upsert / delete by id within a collection.
  saveDoc: (key, doc) => ipcRenderer.invoke('doc:save', key, doc),
  deleteDoc: (key, id) => ipcRenderer.invoke('doc:delete', key, id),

  // Read-only historical archive: the manifest (years + per-slice counts) and
  // a single company/year/type partition, loaded only when that slice is shown.
  getArchiveManifest: () => ipcRenderer.invoke('archive:manifest'),
  getArchivePartition: (sellerId, type, fy) =>
    ipcRenderer.invoke('archive:partition', sellerId, type, fy),

  // Master lists. `companies` are YOUR firms — the letterhead on both
  // documents, labelled "Seller" on a quotation and "Buyer" on a PO.
  getCompanies: () => ipcRenderer.invoke('collection:get', 'companies'),
  saveCompanies: (rows) => ipcRenderer.invoke('collection:save', 'companies', rows),
  getCustomers: () => ipcRenderer.invoke('collection:get', 'customers'),
  saveCustomers: (rows) => ipcRenderer.invoke('collection:save', 'customers', rows),
  getSuppliers: () => ipcRenderer.invoke('collection:get', 'suppliers'),
  saveSuppliers: (rows) => ipcRenderer.invoke('collection:save', 'suppliers', rows),

  // Quotations (purchase orders use the same shape via saveDoc/deleteDoc).
  getQuotations: () => ipcRenderer.invoke('collection:get', 'quotations'),
  saveQuotation: (quote) => ipcRenderer.invoke('doc:save', 'quotations', quote),
  deleteQuotation: (id) => ipcRenderer.invoke('doc:delete', 'quotations', id),

  // App is closing — flush autosave, then call closingDone().
  onAppClosing: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('app-closing', handler)
    return () => ipcRenderer.removeListener('app-closing', handler)
  },
  closingDone: () => ipcRenderer.send('closing:done'),

  // Tell the main process which view is active so it can enable/disable the
  // document-only menu items (Save, Export). Pass 'home' or 'editor'.
  setMenuContext: (view) => ipcRenderer.send('menu:context', view),

  // Subscribe to menu actions from the app menu. Returns an unsubscribe fn.
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  }
})
