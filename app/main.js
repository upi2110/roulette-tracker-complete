const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            cache: false,
            devTools: true,
            webSecurity: false  // ← ADD THIS LINE
        },
        backgroundColor: '#f5f5f5',
        title: 'European Roulette Tracker Pro',
        icon: path.join(__dirname, 'icon.png')
    });

    // FORCE RELOAD WITHOUT CACHE ON EVERY START
    mainWindow.loadFile('index-3tables.html').then(() => {
        mainWindow.webContents.reloadIgnoringCache();
    });

    // ── window.open() handler ──
    // Without an explicit handler, Electron treats child windows as
    // attached sub-frames that can't be moved outside the main
    // window's bounds. Allow same-origin popups (Selection Process,
    // StrategyAnalyser pop-out) to open as fully independent OS-level
    // BrowserWindows so the user can drag them to another monitor.
    mainWindow.webContents.setWindowOpenHandler(({ frameName }) => {
        // Recognise our known popouts by their window.open name.
        const known = new Set([
            'analyserExplainPopout',
            'aiSelectionProcess'
        ]);
        if (!known.has(frameName)) {
            // Unknown popup — default-deny is safer than silently
            // opening; the renderer can be updated to register here.
            return { action: 'deny' };
        }
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: 1100,
                height: 820,
                minWidth: 480,
                minHeight: 320,
                parent: null,            // detach — not a child window
                modal: false,
                show: true,
                frame: true,             // standard OS chrome
                movable: true,
                resizable: true,
                minimizable: true,
                maximizable: true,
                fullscreenable: true,
                skipTaskbar: false,
                alwaysOnTop: false,
                autoHideMenuBar: true,
                // CRITICAL on macOS: tabbingIdentifier=null prevents the
                // popout being grouped as a tab of the main window. And
                // type:'normal' makes it a top-level window, not a panel
                // (panels can be constrained to the parent's space).
                tabbingIdentifier: null,
                type: 'normal',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: false,   // allow window.opener access
                    sandbox: false,
                    devTools: true
                }
            }
        };
    });

    // Belt-and-braces: after the popout is created, explicitly drop
    // any parent association the platform may have set. On macOS,
    // child windows of an NSWindow are constrained to its screen
    // space; clearing parentWindow makes the popout truly free.
    mainWindow.webContents.on('did-create-window', (childWin, details) => {
        try {
            childWin.setParentWindow(null);
            childWin.setAlwaysOnTop(false);
            // Make sure it can be moved off-screen / to a 2nd monitor.
            childWin.setMovable(true);
            childWin.setFullScreenable(true);
        } catch (_) { /* defensive */ }
    });

    // ── Session log infrastructure ──
    // Per-session frontend + backend logs under
    //   logs/{frontend|backend}/YYYY-MM-DD/HH-MM-SS-session.log
    // Auto-purges any subdirectory older than 24h on startup.
    const LOGS_ROOT = path.join(__dirname, '..', 'logs');
    const _now = new Date();
    const _pad = (n) => String(n).padStart(2, '0');
    const _ymd = `${_now.getFullYear()}-${_pad(_now.getMonth()+1)}-${_pad(_now.getDate())}`;
    const _hms = `${_pad(_now.getHours())}-${_pad(_now.getMinutes())}-${_pad(_now.getSeconds())}`;
    const SESSION_FE_LOG = path.join(LOGS_ROOT, 'frontend', _ymd, `${_hms}-session.log`);
    const SESSION_BE_LOG = path.join(LOGS_ROOT, 'backend',  _ymd, `${_hms}-session.log`);
    // Always-current pointers for the active session. Live for the
    // entire Electron lifetime, blown away + recreated on next launch
    // so the path is predictable: just open logs/{frontend,backend}/current.log.
    const CURRENT_FE_LOG = path.join(LOGS_ROOT, 'frontend', 'current.log');
    const CURRENT_BE_LOG = path.join(LOGS_ROOT, 'backend',  'current.log');
    try {
        fs.mkdirSync(path.dirname(SESSION_FE_LOG), { recursive: true });
        fs.mkdirSync(path.dirname(SESSION_BE_LOG), { recursive: true });
        // Truncate current.log files at session start so each launch
        // begins with a fresh, complete log captured to one place.
        try { fs.writeFileSync(CURRENT_FE_LOG, '', 'utf-8'); } catch (_) {}
        try { fs.writeFileSync(CURRENT_BE_LOG, '', 'utf-8'); } catch (_) {}
    } catch (e) { console.warn('Log dir create failed:', e.message); }
    const _purgeOld = (root) => {
        try {
            if (!fs.existsSync(root)) return;
            for (const channel of fs.readdirSync(root)) {
                const channelPath = path.join(root, channel);
                if (!fs.statSync(channelPath).isDirectory()) continue;
                for (const dayDir of fs.readdirSync(channelPath)) {
                    const dayPath = path.join(channelPath, dayDir);
                    if (!fs.statSync(dayPath).isDirectory()) continue;
                    const ageMs = Date.now() - fs.statSync(dayPath).mtimeMs;
                    if (ageMs > 24 * 3600 * 1000) {
                        fs.rmSync(dayPath, { recursive: true, force: true });
                        console.log('[logs] purged old log dir:', dayPath);
                    }
                }
            }
        } catch (e) { console.warn('[logs] purge error:', e.message); }
    };
    _purgeOld(LOGS_ROOT);

    const _appendBackend = (line) => {
        // Write to BOTH the timestamped session log (historical) AND
        // the always-current pointer (predictable path for review).
        try { fs.appendFileSync(SESSION_BE_LOG, line + '\n', 'utf-8'); } catch (_) {}
        try { fs.appendFileSync(CURRENT_BE_LOG, line + '\n', 'utf-8'); } catch (_) {}
    };
    // Mirror backend console output into the backend log file so every
    // ipc/file event is captured. Idempotent — only patch once.
    if (!console.__patchedForSessionLog) {
        const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
        const _fmt = (level, args) => `[${new Date().toISOString()}] ${level} ${args.map(a => typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (_) { return String(a); } })()).join(' ')}`;
        console.log   = (...a) => { _appendBackend(_fmt('LOG  ', a));   orig.log.apply(console, a); };
        console.info  = (...a) => { _appendBackend(_fmt('INFO ', a));   orig.info.apply(console, a); };
        console.warn  = (...a) => { _appendBackend(_fmt('WARN ', a));   orig.warn.apply(console, a); };
        console.error = (...a) => { _appendBackend(_fmt('ERROR', a));   orig.error.apply(console, a); };
        console.__patchedForSessionLog = true;
    }
    console.log(`[logs] backend session log: ${SESSION_BE_LOG}`);
    console.log(`[logs] frontend session log: ${SESSION_FE_LOG}`);
    console.log(`[logs] CURRENT (always-up-to-date) backend log:  ${CURRENT_BE_LOG}`);
    console.log(`[logs] CURRENT (always-up-to-date) frontend log: ${CURRENT_FE_LOG}`);

    // IPC handler: frontend forwards every console.* line through
    // aiAPI.appendLog → this handler appends to the frontend log file
    // AND the current.log pointer.
    ipcMain.handle('append-frontend-log', async (event, line) => {
        try { fs.appendFileSync(SESSION_FE_LOG, String(line) + '\n', 'utf-8'); } catch (_) {}
        try { fs.appendFileSync(CURRENT_FE_LOG, String(line) + '\n', 'utf-8'); } catch (_) {}
        return true;
    });

    // IPC handler: append flash diagnostic log to project folder
    ipcMain.handle('write-flash-log', async (event, data) => {
        const logPath = path.join(__dirname, 'flash-debug.log');
        fs.appendFileSync(logPath, data, 'utf-8');
        return logPath;
    });

    // IPC handler: regenerate snapshots/current.{html,xlsx} from the
    // supplied live spin list. Called by snapshot-bridge.js whenever
    // window.spins changes. Pure side-effect — no Electron state is
    // touched. Reads only from the locked core/tables/* modules.
    ipcMain.handle('refresh-snapshot', async (event, spinsArray, opts) => {
        try {
            const { snapshot }   = require(path.join(__dirname, '..', 'core', 'tables', 'snapshot.js'));
            const { renderHtml } = require(path.join(__dirname, '..', 'core', 'tables', 'writers', 'html.js'));
            const { writeXlsx }  = require(path.join(__dirname, '..', 'core', 'tables', 'writers', 'xlsx.js'));
            const outDir = path.join(__dirname, '..', 'snapshots');
            const histDir = path.join(outDir, 'history');
            fs.mkdirSync(outDir,  { recursive: true });
            fs.mkdirSync(histDir, { recursive: true });

            const safeSpins = Array.isArray(spinsArray)
                ? spinsArray.filter(n => typeof n === 'number' && !Number.isNaN(n))
                : [];
            const visibleFamilies = (opts && Array.isArray(opts.visibleFamilies))
                ? opts.visibleFamilies.slice()
                : null;
            const selections = (opts && opts.selections && typeof opts.selections === 'object')
                ? opts.selections
                : null;
            const filters    = (opts && opts.filters && typeof opts.filters === 'object')
                ? opts.filters
                : null;
            const snap = snapshot(safeSpins, {
                timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
                visibleFamilies,
                selections,
                filters
            });
            const idx = String(snap.meta.spinCount).padStart(3, '0');

            const html = renderHtml(snap);
            fs.writeFileSync(path.join(outDir, 'current.html'), html);
            fs.writeFileSync(path.join(histDir, `spin-${idx}.html`), html);

            // JSON snapshot for the analyser. Same shape that
            // snapshot() returned — written unmodified so any consumer
            // can read this file directly.
            const json = JSON.stringify(snap, null, 2);
            fs.writeFileSync(path.join(outDir, 'current.json'), json);
            fs.writeFileSync(path.join(histDir, `spin-${idx}.json`), json);

            await writeXlsx(snap, path.join(outDir,  'current.xlsx'));
            await writeXlsx(snap, path.join(histDir, `spin-${idx}.xlsx`));

            return { ok: true, spinCount: snap.meta.spinCount, idx };
        } catch (e) {
            console.error('refresh-snapshot failed:', e && e.stack ? e.stack : e);
            return { ok: false, error: String(e && e.message || e) };
        }
    });

    // IPC handler: load historical spin data from app/data/ directory
    ipcMain.handle('load-historical-data', async () => {
        try {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) {
                return { files: [], error: 'data/ folder not found' };
            }
            const fileNames = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt'));
            const files = fileNames.map(f => ({
                filename: f,
                content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
            }));
            console.log(`📂 Loaded ${files.length} historical data file(s)`);
            return { files };
        } catch (error) {
            console.error('❌ Failed to load historical data:', error);
            return { files: [], error: error.message };
        }
    });

    // IPC handler: open test data file for backtesting
    ipcMain.handle('open-test-file', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Load Test Data',
                properties: ['openFile'],
                filters: [{ name: 'Text Files', extensions: ['txt'] }]
            });
            if (result.canceled || result.filePaths.length === 0) return null;
            const content = fs.readFileSync(result.filePaths[0], 'utf-8');
            return { filename: path.basename(result.filePaths[0]), content };
        } catch (error) {
            console.error('❌ Failed to open test file:', error);
            return null;
        }
    });

    // IPC handler: save Excel report.
    // Accepts an optional filename (2nd arg) so callers other than the
    // Auto Test report (e.g. the Money Management session report with a
    // "session-result-..." filename) can override the default path. When
    // no filename is supplied the legacy auto-test-report-<ts>.xlsx
    // default is preserved, so existing callers remain byte-identical.
    ipcMain.handle('save-xlsx', async (event, buffer, filename) => {
        try {
            // Default save location is the user's Desktop per product
            // request — the Save dialog still appears so the user can
            // override, but the initial folder + pre-filled filename
            // land in Desktop so every report (Auto Test, session
            // result, comparison, verification) has a predictable
            // home. app.getPath('desktop') resolves to
            // ~/Desktop on macOS, C:\Users\<user>\Desktop on Windows,
            // and $XDG_DESKTOP_DIR on Linux.
            const baseName = (typeof filename === 'string' && filename.trim())
                ? filename
                : `auto-test-report-${Date.now()}.xlsx`;
            const desktopDir = (() => {
                try { return app.getPath('desktop'); } catch (_) { return null; }
            })();
            const defaultPath = desktopDir ? path.join(desktopDir, baseName) : baseName;
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Excel Report',
                defaultPath,
                filters: [{ name: 'Excel', extensions: ['xlsx'] }]
            });
            if (result.canceled) return false;
            fs.writeFileSync(result.filePath, Buffer.from(buffer));
            return true;
        } catch (error) {
            console.error('❌ Failed to save xlsx:', error);
            return false;
        }
    });

    // Create menu
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Session',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.send('new-session');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Save Session',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.send('save-session');
                    }
                },
                {
                    label: 'Load Session',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        mainWindow.webContents.send('load-session');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export to CSV',
                    click: () => {
                        mainWindow.webContents.send('export-csv');
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo Last Spin',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => {
                        mainWindow.webContents.send('undo-spin');
                    }
                },
                { type: 'separator' },
                { role: 'copy' },
                { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Roulette Tracker Pro',
                            message: 'European Roulette Tracker Pro v1.0.0',
                            detail: 'Professional roulette analysis and tracking system.\n\nDeveloped for advanced pattern recognition and decision support.'
                        });
                    }
                },
                {
                    label: 'Documentation',
                    click: () => {
                        mainWindow.webContents.send('show-help');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // When the main window is being closed, take every other
    // BrowserWindow down with it. Popouts (Selection Process,
    // StrategyAnalyser explain) are created with parent:null so
    // the user can drag them to another monitor — that detachment
    // means they would otherwise outlive the app. Force-close them
    // here so a restart always begins from defaults: no stale
    // popouts, no residual window state.
    mainWindow.on('close', () => {
        for (const w of BrowserWindow.getAllWindows()) {
            if (w !== mainWindow && !w.isDestroyed()) {
                try { w.destroy(); } catch (_) { /* defensive */ }
            }
        }
    });
}

// IPC handlers for file operations
ipcMain.handle('save-file-dialog', async (event, data) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Session',
        defaultPath: `roulette-session-${Date.now()}.json`,
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return { success: true, filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, cancelled: true };
});

ipcMain.handle('open-file-dialog', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Session',
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
        try {
            const data = fs.readFileSync(filePaths[0], 'utf8');
            return { success: true, data: JSON.parse(data) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, cancelled: true };
});

ipcMain.handle('export-csv-dialog', async (event, csvContent) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export to CSV',
        defaultPath: `roulette-export-${Date.now()}.csv`,
        filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, csvContent);
            return { success: true, filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, cancelled: true };
});

// CLEAR ALL CACHES ON START
app.on('ready', () => {
    const { session } = require('electron');
    session.defaultSession.clearCache().then(() => {
        console.log('Cache cleared on startup');
        createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
