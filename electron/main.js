import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { writeFile, readFile } from 'fs/promises'
import { join, extname } from 'path'
import electronUpdater from 'electron-updater'
import {
  getCollection,
  saveCollection,
  saveDoc,
  deleteDoc,
  getArchiveManifest,
  getArchivePartition,
  runOneTimeMigrations
} from './store.js'

const { autoUpdater } = electronUpdater

// --- Auto-update (GitHub Releases, triggered from File → Check for Updates) ---
// The where-to-look config is baked in at build time from package.json's
// build.publish, so nothing here needs the repo details.
let updaterWired = false
let userAskedForCheck = false

function wireUpdater(win) {
  if (updaterWired) return
  updaterWired = true
  autoUpdater.autoDownload = true // start pulling the installer as soon as we know there's one

  autoUpdater.on('update-not-available', () => {
    if (userAskedForCheck)
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'QuoteDesk',
        message: 'You’re on the latest version.'
      })
    userAskedForCheck = false
  })

  autoUpdater.on('update-available', (info) => {
    if (userAskedForCheck)
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update available',
        message: `Version ${info.version} is available.`,
        detail: 'It’s downloading in the background — you’ll be asked to restart when it’s ready.'
      })
    userAskedForCheck = false
  })

  autoUpdater.on('error', (err) => {
    if (userAskedForCheck)
      dialog.showMessageBox(win, {
        type: 'error',
        title: 'Update error',
        message: 'Could not check for updates.',
        detail: String(err?.message || err)
      })
    userAskedForCheck = false
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart QuoteDesk to finish installing the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })
}

function checkForUpdates(win) {
  const w = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!app.isPackaged) {
    dialog.showMessageBox(w, {
      type: 'info',
      title: 'QuoteDesk',
      message: 'Updates are only available in the installed app.',
      detail: 'This check works once QuoteDesk is installed from a release.'
    })
    return
  }
  wireUpdater(w)
  userAskedForCheck = true
  autoUpdater.checkForUpdates().catch(() => {
    /* the error handler above surfaces this to the user */
  })
}

// Send a menu action to the renderer (React handles it).
function send(browserWindow, action) {
  if (browserWindow) browserWindow.webContents.send('menu-action', action)
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Quotation',
          accelerator: 'CmdOrCtrl+N',
          click: (_i, bw) => send(bw, 'new-quotation')
        },
        {
          label: 'New Purchase Order',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: (_i, bw) => send(bw, 'new-po')
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: (_i, bw) => send(bw, 'open')
        },
        {
          id: 'save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: false,
          click: (_i, bw) => send(bw, 'save')
        },
        { type: 'separator' },
        {
          id: 'export',
          label: 'Export PDF…',
          accelerator: 'CmdOrCtrl+E',
          enabled: false,
          click: (_i, bw) => send(bw, 'export')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: (_i, bw) => checkForUpdates(bw)
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Manage My Companies…',
          click: (_i, bw) => send(bw, 'manage-sellers')
        },
        {
          label: 'Manage Buyers…',
          click: (_i, bw) => send(bw, 'manage-customers')
        },
        {
          label: 'Manage Suppliers…',
          click: (_i, bw) => send(bw, 'manage-suppliers')
        },
        { type: 'separator' },
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+H',
          click: (_i, bw) => send(bw, 'home')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Save / Export only make sense with a document open. The renderer tells us
// which view it's in so those items (and their Ctrl+S / Ctrl+E shortcuts) can't
// fire to nothing on the Home screen.
ipcMain.on('menu:context', (_e, view) => {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const inEditor = view === 'editor'
  const save = menu.getMenuItemById('save')
  const exp = menu.getMenuItemById('export')
  if (save) save.enabled = inEditor
  if (exp) exp.enabled = inEditor
})

// Set once the renderer has flushed its autosave, so the close can proceed.
let allowClose = false
let closeTimer = null

// App icon for the running window / taskbar. In production the packaged .exe
// already carries the icon; this also covers dev and Linux. Shipped via
// extraResources (see package.json), and read from the project's build/ in dev.
const windowIcon = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(app.getAppPath(), 'build', 'icon.png')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // In dev, electron-vite serves the renderer over a dev server URL.
  // In production, load the built index.html.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Give the renderer a chance to autosave before the window actually closes.
  win.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    win.webContents.send('app-closing')
    // Safety net: never let a stuck renderer block quitting.
    closeTimer = setTimeout(() => {
      if (!allowClose && !win.isDestroyed()) {
        allowClose = true
        win.destroy()
      }
    }, 3000)
  })
}

// Renderer finished flushing its autosave — let the close proceed.
ipcMain.on('closing:done', (event) => {
  allowClose = true
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) win.close()
})

// Render the current page to a PDF (print CSS applies) and save it.
ipcMain.handle('export-pdf', async (event, defaultName) => {
  const wc = event.sender
  const win = BrowserWindow.fromWebContents(wc)

  // Margins belong to the print engine, not to .page padding: a fragmented box
  // only gets padding-top on its first page and padding-bottom on its last, so
  // page-div padding leaves multi-page output with no margin at the breaks.
  // 12mm = 0.472in (top/bottom), 14mm = 0.551in (left/right).
  const data = await wc.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0.472, bottom: 0.472, left: 0.551, right: 0.551 }
  })

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Quotation PDF',
    defaultPath: defaultName || 'quotation.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (canceled || !filePath) return { success: false, canceled: true }

  await writeFile(filePath, data)
  return { success: true, filePath }
})

// One set of handlers for every collection — masters (companies / customers /
// suppliers) and documents (quotations / purchaseOrders) alike. Keeps each in
// its own JSON file without duplicating the plumbing per file.
ipcMain.handle('collection:get', (_e, key) => getCollection(key))
ipcMain.handle('collection:save', (_e, key, data) => saveCollection(key, data))
ipcMain.handle('doc:save', (_e, key, doc) => saveDoc(key, doc))
ipcMain.handle('doc:delete', (_e, key, id) => deleteDoc(key, id))

// Read-only historical archive: manifest (small) + one company/year slice.
ipcMain.handle('archive:manifest', () => getArchiveManifest())
ipcMain.handle('archive:partition', (_e, sellerId, type, fy) =>
  getArchivePartition(sellerId, type, fy)
)

// Pick an image file and return it as a data URL (embeds into the seller JSON).
ipcMain.handle('image:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose logo image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  })
  if (canceled || !filePaths[0]) return null

  const buf = await readFile(filePaths[0])
  const ext = extname(filePaths[0]).slice(1).toLowerCase()
  const mime =
    ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${buf.toString('base64')}`
})

app.whenReady().then(async () => {
  buildMenu()
  // Backfill full buyer/supplier lists into pre-existing installs (runs once).
  await runOneTimeMigrations()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
