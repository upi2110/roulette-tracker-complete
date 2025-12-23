# 🚀 Quick Start Guide

## For Desktop App (Use Right Now!)

```bash
# 1. Extract the complete package
unzip roulette-tracker-COMPLETE.zip
cd roulette-tracker-complete

# 2. Run setup (ONE TIME ONLY)
./SETUP_COMPLETE.sh

# 3. Start the desktop app
npm start
```

**That's it! The app will open in 2-3 seconds!**

---

## For Python Development (Phase 2 - Later)

```bash
# Activate Python environment
source python-env/bin/activate

# Run Python engine
python backend/roulette_engine.py

# When done
deactivate
```

---

## Data is Shared!

Both the desktop app and Python backend use the same data:
- **Session files**: `shared/data/`
- **Exports**: `shared/exports/`
- **Config**: `shared/configs/`

Save a session in the desktop app → Python can read it!
Process data in Python → Desktop app can load it!

---

## Common Commands

| Command | What It Does |
|---------|-------------|
| `npm start` | Run desktop app |
| `source python-env/bin/activate` | Enter Python environment |
| `python backend/roulette_engine.py` | Test Python engine |
| `deactivate` | Exit Python environment |

---

**ONE project, BOTH technologies, EVERYTHING works together!** 🎰
