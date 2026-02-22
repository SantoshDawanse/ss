# Quick Start Guide

## Run on Android Device

### Option 1: Expo Go (Fastest)

1. Install Expo Go from Google Play Store on your Android device
2. Start the development server:
   ```bash
   yarn start
   ```
3. Scan the QR code with Expo Go app
4. App will load on your device!

### Option 2: Development Build

1. Connect your Android device via USB or start an emulator
2. Run:
   ```bash
   yarn android
   ```
3. App will build and install on your device

## Test the Services

```bash
# Run all tests
yarn test

# Run property-based tests
yarn test:pbt

# Watch mode
yarn test:watch
```

## Project Structure

```
local-brain/
├── app/                    # Expo Router (UI)
│   └── (tabs)/
│       └── index.tsx      # Home screen
├── src/                   # Core services (framework-agnostic)
│   ├── services/
│   │   ├── ContentDeliveryService.ts
│   │   ├── PerformanceTrackingService.ts
│   │   └── StatePersistenceService.ts
│   ├── database/
│   │   ├── DatabaseManager.ts (✅ Updated for Expo SQLite)
│   │   └── repositories/
│   └── models/
└── tests/                 # All tests
```

## What's Working

✅ Fresh Expo app structure
✅ All services migrated
✅ DatabaseManager updated for Expo SQLite
✅ Tests ready to run
✅ Clean Android/iOS configs

## Next Steps

1. **Test on device**: `yarn start` → Scan QR code
2. **Integrate services**: Connect services to UI components
3. **Add screens**: Create lesson/quiz screens in `app/`
4. **Test database**: Initialize DatabaseManager and test CRUD operations

## Need Help?

- Expo docs: https://docs.expo.dev
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Check MIGRATION.md for detailed migration notes
