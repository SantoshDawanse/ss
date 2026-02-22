# Local Setup Guide - Sikshya-Sathi System

This guide will help you run both the Cloud Brain and Local Brain components locally.

## Prerequisites

### For Cloud Brain (Python Backend)
- Python 3.11 or higher
- pip (Python package manager)
- AWS CLI configured (optional, for AWS services)

### For Local Brain (Mobile App)
- Node.js 18 or higher
- npm or yarn
- Expo CLI
- For Android: Android Studio with Android SDK
- For iOS: Xcode (macOS only)

## Step 1: Cloud Brain Setup

### 1.1 Navigate to Cloud Brain Directory
```bash
cd cloud-brain
```

### 1.2 Create Virtual Environment (Recommended)
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate

# On Windows:
# venv\Scripts\activate
```

### 1.3 Install Dependencies
```bash
# Install production dependencies
pip install -r requirements.txt

# Install development dependencies (for testing)
pip install -r requirements-dev.txt
```

### 1.4 Set Up Environment Variables
Create a `.env` file in the `cloud-brain` directory:

```bash
# Copy example if it exists
cp .env.example .env

# Or create manually with these variables:
# AWS_REGION=us-east-1
# DYNAMODB_TABLE=sikshya-sathi-dev
# S3_BUCKET=sikshya-sathi-bundles-dev
# BEDROCK_AGENT_ID=your-agent-id
# BEDROCK_AGENT_ALIAS_ID=your-alias-id
```

### 1.5 Run Tests
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src

# Run only unit tests (skip property-based tests)
pytest -m "not property_test"

# Run only property-based tests
pytest -m property_test
```

### 1.6 Run Local Development Server (if applicable)
```bash
# If you have a local server script
python src/main.py

# Or use AWS SAM for local Lambda testing
sam local start-api
```

## Step 2: Local Brain Setup

### 2.1 Navigate to Local Brain Directory
```bash
cd local-brain
```

### 2.2 Install Dependencies
```bash
# Using npm
npm install

# Or using yarn
yarn install
```

### 2.3 Start Development Server
```bash
# Start Expo development server
npm start
# or
yarn start
```

This will open the Expo DevTools in your browser.

### 2.4 Run on Device/Simulator

#### Option A: Run on Android
```bash
# Make sure Android Studio is installed and an emulator is running
npm run android
# or
yarn android
```

#### Option B: Run on iOS (macOS only)
```bash
# Make sure Xcode is installed
npm run ios
# or
yarn ios
```

#### Option C: Run on Web
```bash
npm run web
# or
yarn web
```

#### Option D: Use Expo Go App
1. Install Expo Go app on your physical device
2. Scan the QR code from the terminal/browser
3. App will load on your device

### 2.5 Run Tests
```bash
# Run all tests
npm test
# or
yarn test

# Run property-based tests only
npm run test:pbt
# or
yarn test:pbt

# Run tests in watch mode
npm run test:watch
# or
yarn test:watch
```

## Step 3: Web Dashboard Setup (Educator Dashboard)

### 3.1 Navigate to Web Dashboard Directory
```bash
cd cloud-brain/web-dashboard
```

### 3.2 Install Dependencies
```bash
# Using npm
npm install

# Or using yarn
yarn install
```

### 3.3 Start Development Server
```bash
# Start Vite development server
npm run dev
# or
yarn dev
```

This will start the dashboard at http://localhost:5173

### 3.4 Run Tests
```bash
# Run tests
npm test
# or
yarn test
```

## Step 4: Verify Everything Works

### Cloud Brain Verification
```bash
cd cloud-brain

# Run quick test
pytest tests/ -v

# Check code quality
ruff check src/
mypy src/
```

### Local Brain Verification
```bash
cd local-brain

# Run tests
npm test

# Check TypeScript compilation
npx tsc --noEmit

# Run linter
npm run lint
```

### Web Dashboard Verification
```bash
cd cloud-brain/web-dashboard

# Run tests
npm test

# Check TypeScript compilation
npx tsc --noEmit

# Run linter
npm run lint

# Verify dev server starts
npm run dev
# Should see: "Local: http://localhost:5173/"
```

## Common Issues & Solutions

### Cloud Brain Issues

#### Issue: `ModuleNotFoundError`
**Solution**: Make sure virtual environment is activated and dependencies are installed
```bash
source venv/bin/activate  # Activate venv
pip install -r requirements.txt
```

#### Issue: AWS credentials not found
**Solution**: Configure AWS CLI or use local mocks
```bash
aws configure
# Or set environment variables for local testing
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
```

### Local Brain Issues

#### Issue: `expo: command not found`
**Solution**: Install Expo CLI globally
```bash
npm install -g expo-cli
```

#### Issue: Android build fails
**Solution**: 
1. Make sure Android Studio is installed
2. Set ANDROID_HOME environment variable
3. Accept Android SDK licenses:
```bash
cd ~/Library/Android/sdk/tools/bin
./sdkmanager --licenses
```

#### Issue: iOS build fails (macOS)
**Solution**:
1. Install Xcode from App Store
2. Install Xcode Command Line Tools:
```bash
xcode-select --install
```
3. Install CocoaPods:
```bash
sudo gem install cocoapods
cd ios && pod install
```

#### Issue: Metro bundler cache issues
**Solution**: Clear cache and restart
```bash
npm start -- --clear
# or
expo start -c
```

## Development Workflow

### Typical Development Session

1. **Start Cloud Brain** (Terminal 1):
```bash
cd cloud-brain
source venv/bin/activate
# Run tests or start local server
pytest --watch
```

2. **Start Local Brain** (Terminal 2):
```bash
cd local-brain
npm start
```

3. **Start Web Dashboard** (Terminal 3):
```bash
cd cloud-brain/web-dashboard
npm run dev
```

4. **Run on Device** (Terminal 4):
```bash
cd local-brain
npm run android  # or ios
```

### Running Tests Continuously

**Cloud Brain**:
```bash
cd cloud-brain
pytest-watch  # Install with: pip install pytest-watch
```

**Local Brain**:
```bash
cd local-brain
npm run test:watch
```

**Web Dashboard**:
```bash
cd cloud-brain/web-dashboard
npm test -- --watch
```

## Next Steps

1. Review the architecture documentation in `.kiro/specs/sikshya-sathi-system/`
2. Check implementation status in `TEST_STATUS.md`
3. Review feature-specific documentation in `cloud-brain/docs/` and `local-brain/docs/`
4. Check the Web Dashboard guide in `DASHBOARD_SETUP.md`
5. Start implementing remaining tasks from `.kiro/specs/sikshya-sathi-system/tasks.md`

## Useful Commands Reference

### Cloud Brain
```bash
# Run specific test file
pytest tests/test_specific.py

# Run with verbose output
pytest -v

# Run with coverage report
pytest --cov=src --cov-report=html

# Type checking
mypy src/

# Code formatting
ruff format src/

# Linting
ruff check src/
```

### Local Brain
```bash
# Clear cache and restart
npm start -- --clear

# Run specific test
npm test -- ContentDeliveryService

# Generate coverage report
npm test -- --coverage

# Build for production
expo build:android
expo build:ios
```

### Web Dashboard
```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Lint code
npm run lint

# Type check
npx tsc --noEmit
```

## Support

For issues or questions:
1. Check the documentation in each component's README
2. Review implementation docs in `docs/` folders
3. Check test files for usage examples
4. Review the spec files in `.kiro/specs/`

