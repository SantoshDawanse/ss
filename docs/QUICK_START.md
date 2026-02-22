# Quick Start - Get Running in 5 Minutes

## Option 1: Automated Setup (Recommended)

Run the automated setup script:

```bash
./quick-start.sh
```

This will:
- ✓ Check prerequisites
- ✓ Set up Cloud Brain with virtual environment
- ✓ Install all dependencies
- ✓ Run tests to verify everything works

## Option 2: Using Make Commands

```bash
# Install everything
make quick-start

# Or install components separately
make setup-cloud
make setup-local
```

## Option 3: Manual Setup

### Cloud Brain (Terminal 1)

```bash
# 1. Navigate to cloud-brain
cd cloud-brain

# 2. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# 4. Verify with tests
pytest
```

### Local Brain (Terminal 2)

```bash
# 1. Navigate to local-brain
cd local-brain

# 2. Install dependencies
npm install

# 3. Verify with tests
npm test

# 4. Start development server
npm start
```

### Web Dashboard (Terminal 3)

```bash
# 1. Navigate to web-dashboard
cd cloud-brain/web-dashboard

# 2. Install dependencies
npm install

# 3. Verify with tests
npm test

# 4. Start development server
npm run dev

# Dashboard will be available at http://localhost:5173
```

## Running the App

Once setup is complete, choose your platform:

### Android
```bash
cd local-brain
npm run android
```

### iOS (macOS only)
```bash
cd local-brain
npm run ios
```

### Web Browser
```bash
cd local-brain
npm run web
```

### Physical Device (Expo Go)
1. Install Expo Go app from App Store/Play Store
2. Run `npm start` in local-brain directory
3. Scan QR code with Expo Go app

## Verify Everything Works

### Cloud Brain Health Check
```bash
cd cloud-brain
source venv/bin/activate
pytest -v
```

Expected output: All tests passing ✓

### Local Brain Health Check
```bash
cd local-brain
npm test
```

Expected output: All tests passing ✓

## What You Should See

### Cloud Brain Terminal
```
============================== test session starts ==============================
collected 45 items

tests/test_content_generation.py ........                                  [ 17%]
tests/test_educator_dashboard.py .......                                   [ 33%]
tests/test_monitoring.py ........                                          [ 50%]
...

============================== 45 passed in 2.34s ===============================
```

### Local Brain Terminal (Expo DevTools)
```
› Metro waiting on exp://192.168.1.100:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
```

### Web Dashboard Terminal
```
  VITE v4.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.100:5173/
  ➜  press h to show help
```

Open http://localhost:5173 in your browser to see the educator dashboard.

### Mobile App
You should see:
- Home screen with welcome message
- Lessons tab with sample lessons
- Quizzes tab with sample quizzes
- All content loads instantly (offline-first)

### Web Dashboard
You should see:
- Summary cards (Total Students, Active Students, etc.)
- Student Progress tab with individual student data
- Class Performance tab with aggregate metrics
- Curriculum Coverage tab with subject breakdowns

## Common First-Run Issues

### "Python not found"
```bash
# Install Python 3.11+
brew install python@3.11  # macOS
```

### "npm not found"
```bash
# Install Node.js 18+
brew install node  # macOS
```

### "expo: command not found"
```bash
# Use npx instead
npx expo start
```

### "Port 8081 already in use"
```bash
# Kill the process
lsof -ti:8081 | xargs kill -9
```

### Tests fail
This might be expected if some features are still in development. Check `TEST_STATUS.md` for current test status.

## Next Steps

1. ✓ Setup complete - you're ready to develop!

2. Explore the codebase:
   - `cloud-brain/src/` - Python backend services
   - `local-brain/src/` - TypeScript mobile app logic
   - `local-brain/app/` - React Native UI screens

3. Review documentation:
   - `LOCAL_SETUP_GUIDE.md` - Detailed setup guide
   - `TROUBLESHOOTING.md` - Common issues and solutions
   - `.kiro/specs/` - Feature specifications

4. Start developing:
   - Check `.kiro/specs/sikshya-sathi-system/tasks.md` for remaining tasks
   - Run tests in watch mode: `make test-watch`
   - Make changes and see them live reload

## Development Workflow

### Typical Session

**Terminal 1 - Cloud Brain Tests:**
```bash
cd cloud-brain
source venv/bin/activate
pytest --watch  # Auto-run tests on file changes
```

**Terminal 2 - Local Brain Dev Server:**
```bash
cd local-brain
npm start
```

**Terminal 3 - Web Dashboard:**
```bash
cd cloud-brain/web-dashboard
npm run dev
```

**Terminal 4 - Run on Device:**
```bash
cd local-brain
npm run android  # or ios
```

### Quick Commands Reference

```bash
# Run all tests
make test

# Run specific component tests
make test-cloud
make test-local
make test-dashboard

# Run property-based tests
make test-pbt

# Lint code
make lint

# Clean build artifacts
make clean

# Start components
make run-local      # Local Brain
make run-dashboard  # Web Dashboard
make run-android
make run-ios
```

## Getting Help

- **Setup issues**: See `TROUBLESHOOTING.md`
- **Detailed guide**: See `LOCAL_SETUP_GUIDE.md`
- **Architecture**: See `README.md`
- **Test status**: See `TEST_STATUS.md`

---

**You're all set! Happy coding! 🚀**
