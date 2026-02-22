# Sikshya Sathi - Local Brain

Offline-first mobile learning application built with Expo and React Native.

## Features

- 📚 Offline lessons and quizzes
- 💾 Automatic progress saving every 30 seconds
- 🎯 Adaptive learning paths
- 💡 Progressive hints for quizzes
- 📊 Performance tracking
- 🔄 Crash recovery

## Tech Stack

- **Framework**: Expo (React Native)
- **Database**: Expo SQLite
- **State Management**: AsyncStorage
- **Testing**: Jest + Fast-check (Property-based testing)
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js >= 18
- Yarn
- Expo CLI
- Android Studio (for Android) or Xcode (for iOS)

### Installation

```bash
# Install dependencies
yarn install

# Start the development server
yarn start

# Run on Android
yarn android

# Run on iOS
yarn ios
```

### Running Tests

```bash
# Run all tests
yarn test

# Run property-based tests
yarn test:pbt

# Run tests in watch mode
yarn test:watch
```

## Project Structure

```
local-brain-v2/
├── app/                    # Expo Router pages
│   └── (tabs)/            # Tab navigation
├── src/                   # Core business logic
│   ├── services/          # Business services
│   │   ├── ContentDeliveryService.ts
│   │   ├── PerformanceTrackingService.ts
│   │   └── StatePersistenceService.ts
│   ├── database/          # Database layer
│   │   ├── DatabaseManager.ts
│   │   ├── repositories/  # Data access layer
│   │   └── schema.ts
│   ├── models/            # TypeScript interfaces
│   └── utils/             # Utility functions
├── tests/                 # Test files
├── components/            # React components
└── assets/               # Images, fonts, etc.
```

## Core Services

### ContentDeliveryService
Handles offline content delivery with preloading and caching for lessons, quizzes, and hints.

### PerformanceTrackingService
Tracks student events and manages performance logs with immediate SQLite writes for crash recovery.

### StatePersistenceService
Manages automatic state persistence with 30-second auto-save and crash recovery.

## Development

The app uses Expo's file-based routing. Main screens are in `app/(tabs)/`.

Core business logic is in `src/` and is framework-agnostic, making it easy to test and maintain.

## Building for Production

```bash
# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

## License

Private - Sikshya Sathi Project
