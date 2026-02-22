# Troubleshooting Guide

Common issues and solutions when running Sikshya-Sathi locally.

## Quick Diagnostics

Run these commands to check your setup:

```bash
# Check versions
python3 --version  # Should be 3.11+
node --version     # Should be 18+
npm --version

# Check if virtual environment is active (Cloud Brain)
which python  # Should point to venv/bin/python

# Check if dependencies are installed
cd cloud-brain && pip list
cd local-brain && npm list --depth=0
```

## Cloud Brain Issues

### Issue: `pip: command not found`
**Cause**: pip is not installed or not in PATH

**Solution**:
```bash
# Install pip
python3 -m ensurepip --upgrade

# Or use package manager
brew install python3  # macOS
```

### Issue: `ModuleNotFoundError: No module named 'boto3'`
**Cause**: Dependencies not installed or virtual environment not activated

**Solution**:
```bash
cd cloud-brain
source venv/bin/activate  # Activate venv first
pip install -r requirements.txt
```

### Issue: Tests fail with AWS credential errors
**Cause**: Tests trying to connect to real AWS services

**Solution**: Tests should use mocks. Check if `moto` is installed:
```bash
pip install moto
```

If tests still fail, set dummy credentials:
```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

### Issue: `ImportError: cannot import name 'X' from 'src'`
**Cause**: Python path not set correctly

**Solution**:
```bash
# Add src to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"

# Or install package in development mode
pip install -e .
```

### Issue: Hypothesis tests take too long
**Cause**: Property-based tests run many examples

**Solution**: Skip them during development:
```bash
pytest -m "not property_test"
```

Or reduce examples in test files:
```python
@given(st.text())
@settings(max_examples=10)  # Reduce from default 100
def test_something(text):
    ...
```

## Local Brain Issues

### Issue: `expo: command not found`
**Cause**: Expo CLI not installed

**Solution**:
```bash
npm install -g expo-cli
# or use npx
npx expo start
```

### Issue: `npm install` fails with permission errors
**Cause**: npm trying to write to system directories

**Solution**:
```bash
# Don't use sudo! Instead, fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bash_profile
source ~/.bash_profile
```

### Issue: Metro bundler won't start
**Cause**: Port 8081 already in use or cache issues

**Solution**:
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Clear cache and restart
npm start -- --clear
# or
expo start -c
```

### Issue: `Unable to resolve module` errors
**Cause**: Metro bundler cache or missing dependencies

**Solution**:
```bash
# Clear all caches
rm -rf node_modules
npm cache clean --force
npm install

# Clear Metro cache
npm start -- --reset-cache
```

### Issue: Android build fails with "SDK location not found"
**Cause**: ANDROID_HOME not set

**Solution**:
```bash
# Add to ~/.bash_profile or ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Reload shell
source ~/.bash_profile  # or ~/.zshrc
```

### Issue: iOS build fails with "Command PhaseScriptExecution failed"
**Cause**: CocoaPods not installed or pods not updated

**Solution**:
```bash
# Install CocoaPods
sudo gem install cocoapods

# Install pods
cd ios
pod install
cd ..

# Clean and rebuild
cd ios
xcodebuild clean
cd ..
npm run ios
```

### Issue: Expo Go app shows "Unable to connect"
**Cause**: Device and computer on different networks

**Solution**:
1. Make sure both are on same WiFi network
2. Try tunnel mode: `expo start --tunnel`
3. Check firewall settings

### Issue: SQLite errors on device
**Cause**: Database not initialized or corrupted

**Solution**:
```bash
# Clear app data on device
# Android: Settings > Apps > Sikshya Sathi > Clear Data
# iOS: Delete and reinstall app

# Or add database reset in code
import * as SQLite from 'expo-sqlite';
await SQLite.deleteDatabaseAsync('sikshya-sathi.db');
```

### Issue: TypeScript errors in IDE but tests pass
**Cause**: IDE using different TypeScript version

**Solution**:
```bash
# Use workspace TypeScript version
# In VS Code: Cmd+Shift+P > "TypeScript: Select TypeScript Version" > "Use Workspace Version"

# Or reinstall
rm -rf node_modules
npm install
```

## Testing Issues

### Issue: Jest tests timeout
**Cause**: Async operations not completing

**Solution**:
```javascript
// Increase timeout in test
jest.setTimeout(10000);

// Or in jest.config.js
module.exports = {
  testTimeout: 10000
};
```

### Issue: Property-based tests fail intermittently
**Cause**: Tests finding edge cases

**Solution**: This is expected! Fix the code or adjust test constraints:
```typescript
// Add constraints to generated data
fc.string({ minLength: 1, maxLength: 100 })

// Or add preconditions
fc.pre(value.length > 0);
```

### Issue: Mock not working in tests
**Cause**: Mock not set up before import

**Solution**:
```typescript
// Mock BEFORE importing module
jest.mock('expo-sqlite');
import { DatabaseManager } from '../src/database/DatabaseManager';
```

## Performance Issues

### Issue: App is slow on device
**Cause**: Development mode or debug builds

**Solution**:
```bash
# Build release version
expo build:android --release-channel production
expo build:ios --release-channel production
```

### Issue: Hot reload is slow
**Cause**: Large project or many dependencies

**Solution**:
```bash
# Disable Fast Refresh temporarily
# In app.json:
{
  "expo": {
    "developer": {
      "fastRefresh": false
    }
  }
}
```

## Environment Issues

### Issue: Different behavior on device vs simulator
**Cause**: Platform-specific code or native modules

**Solution**:
```typescript
// Use Platform.select
import { Platform } from 'react-native';

const config = Platform.select({
  ios: { /* iOS config */ },
  android: { /* Android config */ },
  default: { /* fallback */ }
});
```

### Issue: Environment variables not loading
**Cause**: .env file not in correct location

**Solution**:
```bash
# Create .env in project root
cp .env.example .env

# Use expo-constants to access
import Constants from 'expo-constants';
const apiUrl = Constants.expoConfig?.extra?.apiUrl;
```

## Still Having Issues?

1. Check the logs:
   - Cloud Brain: Look for Python tracebacks
   - Local Brain: Check Metro bundler output and device logs

2. Search for similar issues:
   - Expo: https://github.com/expo/expo/issues
   - React Native: https://github.com/facebook/react-native/issues

3. Clean everything and start fresh:
```bash
# Cloud Brain
cd cloud-brain
rm -rf venv __pycache__ .pytest_cache
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Local Brain
cd local-brain
rm -rf node_modules .expo
npm install
npm start -- --clear
```

4. Check system requirements:
   - macOS: 10.15+ (for iOS development)
   - Xcode: Latest version
   - Android Studio: Latest version
   - Node.js: 18+
   - Python: 3.11+

5. Review documentation:
   - `LOCAL_SETUP_GUIDE.md` - Detailed setup instructions
   - `README.md` - Project overview
   - Component READMEs in `cloud-brain/` and `local-brain/`
