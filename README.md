# 🎰 European Roulette Tracker - Complete System
## Desktop App + Python AI Backend - All in One!

---

## 📋 Project Structure

This is a UNIFIED project containing:
1. **Desktop GUI Application** (Electron/Node.js) - Working NOW!
2. **Python AI Backend** (TensorFlow/ML) - Ready for Phase 2
3. **Complete Documentation** - Everything you need
4. **Shared Data** - Both systems use same data

---

## 🚀 Quick Start

### For Desktop App (Use Right Away):
```bash
# Install Node.js dependencies (ONE TIME)
npm install

# Run the desktop app
npm start
```

### For Python AI Development (Phase 2):
```bash
# Setup Python environment (ONE TIME)
./setup-python.sh

# Activate Python environment
source python-env/bin/activate

# Run Python scripts
python backend/roulette_engine.py
```

---

## 📁 Project Structure

```
roulette-tracker-complete/
│
├── app/                      # Desktop Application (Electron)
│   ├── main.js              # Electron main process
│   ├── preload.js           # IPC bridge
│   ├── index.html           # UI
│   ├── styles.css           # Styling
│   └── renderer.js          # App logic
│
├── backend/                  # Python AI Backend
│   ├── roulette_engine.py   # Core calculation engine
│   ├── models/              # ML models (Phase 2)
│   ├── analysis/            # Data analysis scripts
│   └── api/                 # API endpoints
│
├── shared/                   # Shared between app and backend
│   ├── data/                # Session data (JSON/CSV)
│   ├── exports/             # Exported files
│   └── configs/             # Configuration files
│
├── docs/                     # Documentation
│   ├── PRD.md               # Product Requirements
│   ├── SETUP_GUIDE.md       # Setup instructions
│   └── USER_GUIDE.md        # How to use
│
├── tests/                    # Unit tests
│   ├── app/                 # JavaScript tests
│   └── backend/             # Python tests
│
├── package.json             # Node.js config
├── requirements.txt         # Python dependencies
├── setup-python.sh          # Python environment setup
└── README.md               # This file
```

---

## 🎯 Two Ways to Use This Project

### Option 1: Desktop App Only (Now)
Just use the GUI - no Python needed!
```bash
npm install
npm start
```

### Option 2: Full System with AI (Later)
Use both desktop app AND Python backend:
```bash
# Setup both
npm install
./setup-python.sh

# Run desktop app
npm start

# In another terminal, run Python services
source python-env/bin/activate
python backend/api/server.py
```

---

## 📊 Data Flow

```
Desktop App (GUI)
    ↓
Saves to: shared/data/
    ↓
Python Backend reads same files
    ↓
Trains AI models
    ↓
Provides predictions back to Desktop App
```

---

## 🔧 Configuration

All settings in: `shared/configs/config.yaml`

```yaml
# Paths work for both systems
data_path: "shared/data"
exports_path: "shared/exports"
models_path: "backend/models"
```

---

## 📖 Documentation

- **Setup Guide**: docs/SETUP_GUIDE.md
- **User Guide**: docs/USER_GUIDE.md
- **API Docs**: docs/API.md
- **PRD**: docs/PRD.md

---

## ✅ What's Working NOW

- ✅ Desktop GUI app
- ✅ Real-time tracking
- ✅ All calculations
- ✅ Save/Load sessions
- ✅ CSV export
- ✅ Statistics

## 🔮 What's Ready for Phase 2

- ✅ Python environment setup
- ✅ Data structures defined
- ✅ ML model templates
- ✅ API framework ready
- ✅ Training pipeline skeleton

---

## 🆘 Need Help?

See: docs/SETUP_GUIDE.md

Quick commands:
- Desktop app: `npm start`
- Python: `source python-env/bin/activate`
- Tests: `npm test` or `pytest`

---

**ONE project, TWO technologies, UNIFIED system!** 🎰🚀
