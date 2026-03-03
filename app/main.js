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

    // IPC handler: append flash diagnostic log to project folder
    ipcMain.handle('write-flash-log', async (event, data) => {
        const logPath = path.join(__dirname, 'flash-debug.log');
        fs.appendFileSync(logPath, data, 'utf-8');
        return logPath;
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

    // IPC handler: append verbose session log to app/logs/ folder
    ipcMain.handle('append-session-log', async (event, { filename, content }) => {
        try {
            const logsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            const logPath = path.join(logsDir, filename);
            fs.appendFileSync(logPath, content, 'utf-8');
            return { success: true, path: logPath };
        } catch (error) {
            console.error('❌ Failed to append session log:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler: save Excel report
    ipcMain.handle('save-xlsx', async (event, buffer) => {
        try {
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Excel Report',
                defaultPath: `auto-test-report-${Date.now()}.xlsx`,
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
