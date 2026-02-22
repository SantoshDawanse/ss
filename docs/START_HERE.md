# 🚀 START HERE - Run Sikshya-Sathi Locally

## Current Status

Based on your setup:
- ✅ Python 3.11.13 installed
- ✅ Node.js v22.17.1 installed  
- ✅ npm 11.5.2 installed
- ✅ Local Brain dependencies installed (node_modules exists)
- ✅ Virtual environment appears to be active

## Fastest Way to Get Running

### Step 1: Verify Cloud Brain Setup

```bash
# Make sure you're in the project root
cd /path/to/sikshya-sathi

# Navigate to cloud-brain
cd cloud-brain

# If venv is not active, activate it:
source venv/bin/activate

# If venv doesn't exist, create it:
# python3 -m venv venv
# source venv/bin/activate

# Install/update dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run tests to verify
pytest
```

### Step 2: Verify Local Brain Setup

Open a NEW terminal window:

```bash
# Navigate to local-brain
cd /path/to/sikshya-sathi/local-brain

# Dependencies should already be installed
# If not, run: npm install

# Run tests to verify
npm test

# Start the development server
npm start
```

### Step 3: Setup Web Dashboard (Educator Dashboard)

Open a NEW terminal window:

```bash
# Navigate to web-dashboard
cd /path/to/sikshya-sathi/cloud-brain/web-dashboard

# Install dependencies
npm install

# Start the development server
npm run dev

# Dashboard will be available at http://localhost:5173
```

### Step 4: Run the Mobile App

After `npm start` in local-brain, you'll see options:

**Option A - Android Emulator:**
- Press `a` in the terminal, OR
- Run `npm run android` in a new terminal

**Option B - iOS Simulator (macOS only):**
- Press `i` in the terminal, OR
- Run `npm run ios` in a new terminal

**Option C - Web Browser:**
- Press `w` in the terminal, OR
- Run `npm run web` in a new terminal

**Option D - Physical Device:**
1. Install "Expo Go" app from App Store or Play Store
2. Scan the QR code shown in terminal
3. App will load on your device

## Expected Results

### Cloud Brain
When you run `pytest`, you should see:
```
============================== test session starts ==============================
platform darwin -- Python 3.11.13
collected XX items

tests/test_*.py ........

============================== XX passed in X.XXs ===============================
```

### Local Brain
When you run `npm start`, you should see:
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator  
› Press w │ open web
```

### Web Dashboard
When you run `npm run dev`, you should see:
```
  VITE v4.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
  ➜  press h to show help
```

Open http://localhost:5173 in your browser to see the educator dashboard.

### Mobile App
The app should show:
- 📱 Home screen with welcome message
- 📚 Lessons tab with sample content
- 📝 Quizzes tab with sample quizzes
- ⚡ Everything loads instantly (offline-first)

## If Something Goes Wrong

### Cloud Brain Issues

**Virtual environment not found:**
```bash
cd cloud-brain
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

**Tests fail:**
- Check `TEST_STATUS.md` - some tests may be expected to fail
- See `TROUBLESHOOTING.md` for specific error messages

### Local Brain Issues

**Metro bundler won't start:**
```bash
# Clear cache
npm start -- --clear
```

**Module not found errors:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

**Port 8081 in use:**
```bash
lsof -ti:8081 | xargs kill -9
npm start
```

## Alternative: Use Automated Setup

If you want to start fresh or verify everything:

```bash
# From project root
./quick-start.sh
```

Or using Make:
```bash
make quick-start
```

## Project Structure Quick Reference

```
sikshya-sathi/
├── cloud-brain/              # Python backend
│   ├── src/                  # Source code
│   │   ├── handlers/         # Lambda handlers
│   │   ├── services/         # Business logic
│   │   └── models/           # Data models
│   ├── tests/                # Tests
│   ├── web-dashboard/        # Educator web dashboard
│   │   ├── src/              # React components
│   │   └── package.json      # Dashboard dependencies
│   └── venv/                 # Virtual environment
│
├── local-brain/              # React Native app
│   ├── app/                  # UI screens (Expo Router)
│   │   └── (tabs)/           # Tab navigation
│   ├── src/                  # Core logic
│   │   ├── services/         # Business services
│   │   ├── database/         # SQLite layer
│   │   └── models/           # TypeScript types
│   ├── tests/                # Tests
│   └── node_modules/         # Dependencies
│
└── .kiro/specs/              # Feature specifications
```

## Development Commands Cheat Sheet

```bash
# Cloud Brain
cd cloud-brain
source venv/bin/activate      # Activate environment
pytest                        # Run tests
pytest -v                     # Verbose output
pytest -m "not property_test" # Skip property tests
ruff check src/               # Lint code
mypy src/                     # Type check

# Web Dashboard
cd cloud-brain/web-dashboard
npm install                   # Install dependencies
npm run dev                   # Start dev server (http://localhost:5173)
npm run build                 # Build for production
npm test                      # Run tests
npm run lint                  # Lint code

# Local Brain  
cd local-brain
npm start                     # Start dev server
npm test                      # Run tests
npm run test:watch            # Watch mode
npm run android               # Run on Android
npm run ios                   # Run on iOS
npm run web                   # Run in browser
npm run lint                  # Lint code

# Both (from project root)
make test                     # Test everything
make test-cloud               # Test cloud only
make test-local               # Test local only
make lint                     # Lint everything
```

## What to Do Next

1. **Verify setup works** - Run tests for both components
2. **Explore the app** - Run on simulator/device and try features
3. **Review architecture** - Read `README.md` and design docs
4. **Check tasks** - See `.kiro/specs/sikshya-sathi-system/tasks.md`
5. **Start coding** - Pick a task and start developing!

## Documentation Index

- **This file** - Quick start guide (you are here)
- `QUICK_START.md` - Alternative quick start with more details
- `LOCAL_SETUP_GUIDE.md` - Comprehensive setup guide
- `DASHBOARD_SETUP.md` - Web Dashboard setup and configuration
- `TROUBLESHOOTING.md` - Common issues and solutions
- `README.md` - Project overview and architecture
- `TEST_STATUS.md` - Current test status
- `cloud-brain/README.md` - Cloud Brain specific docs
- `local-brain/README.md` - Local Brain specific docs
- `cloud-brain/web-dashboard/README.md` - Web Dashboard docs

## Need Help?

1. Check `TROUBLESHOOTING.md` for common issues
2. Review test files for usage examples
3. Check implementation docs in `cloud-brain/docs/` and `local-brain/docs/`
4. Review the spec files in `.kiro/specs/`

---

**Ready to start? Run the commands in Step 1 above! 🎉**
