# Sikshya-Sathi Local Brain

Offline-first mobile application for content delivery and performance tracking.

## Architecture

- **Framework**: React Native with TypeScript
- **Database**: SQLite with SQLCipher encryption
- **State Management**: React Context + Hooks
- **Testing**: Jest + fast-check (property-based testing)

## Project Structure

```
local-brain/
├── src/
│   ├── components/        # React Native components
│   ├── screens/           # Screen components
│   ├── services/          # Business logic services
│   ├── database/          # SQLite database layer
│   ├── models/            # TypeScript interfaces
│   ├── utils/             # Utility functions
│   └── navigation/        # Navigation configuration
├── tests/                 # Test files
├── android/               # Android native code
├── ios/                   # iOS native code
└── package.json
```

## Setup

```bash
# Install dependencies
npm install

# iOS setup
cd ios && pod install && cd ..

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run tests
npm test

# Run property-based tests
npm run test:pbt
```

## Environment Variables

Create a `.env` file:

```
API_BASE_URL=https://api.sikshya-sathi.np/v1
ENVIRONMENT=development
```

## Requirements

- Node.js 18+
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS)
