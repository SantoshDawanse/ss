# Local Brain Project Structure

This document describes the directory structure and organization of the Local Brain mobile application for the Sikshya Sathi educational platform.

## Overview

Local Brain is a React Native mobile application built with Expo that provides offline-first learning capabilities. It synchronizes with Cloud Brain to receive personalized learning content and upload student performance data.

## Directory Structure

```
local-brain/
├── app/                          # Expo Router app directory
│   ├── (tabs)/                   # Tab-based navigation screens
│   └── _layout.tsx               # Root layout configuration
├── assets/                       # Static assets (images, fonts, etc.)
├── components/                   # Reusable React components
│   ├── AppNavigationWrapper.tsx  # Navigation wrapper component
│   ├── FeedbackDisplay.tsx       # Quiz feedback display
│   ├── LessonDisplay.tsx         # Lesson content display
│   ├── QuizDisplay.tsx           # Quiz interface
│   └── index.ts                  # Component exports
├── constants/                    # App-wide constants
├── hooks/                        # Custom React hooks
│   ├── use-accessibility.ts      # Accessibility features hook
│   ├── use-localization.ts       # Localization hook
│   ├── useGracefulDegradation.ts # Graceful degradation hook
│   └── usePullToRefresh.ts       # Pull-to-refresh hook
├── src/                          # Source code directory
│   ├── components/               # Additional components
│   ├── contexts/                 # React contexts
│   │   └── AppContext.tsx        # Global app context
│   ├── database/                 # Database layer
│   │   ├── repositories/         # Data access repositories
│   │   │   ├── BaseRepository.ts           # Base repository class
│   │   │   ├── HintRepository.ts           # Hints data access
│   │   │   ├── LearningBundleRepository.ts # Bundles data access
│   │   │   ├── LessonRepository.ts         # Lessons data access
│   │   │   ├── PerformanceLogRepository.ts # Logs data access
│   │   │   ├── QuizRepository.ts           # Quizzes data access
│   │   │   ├── StudentStateRepository.ts   # Student state data access
│   │   │   ├── StudyTrackRepository.ts     # Study tracks data access
│   │   │   ├── SyncSessionRepository.ts    # Sync sessions data access
│   │   │   └── index.ts                    # Repository exports
│   │   ├── DatabaseManager.ts    # Database connection manager
│   │   ├── index.ts              # Database exports
│   │   ├── schema.ts             # SQLite schema definitions
│   │   └── validation.ts         # Database validation utilities
│   ├── hooks/                    # Additional custom hooks
│   ├── localization/             # Internationalization
│   │   ├── en.ts                 # English translations
│   │   └── ne.ts                 # Nepali translations
│   ├── models/                   # TypeScript type definitions
│   │   └── index.ts              # Model exports
│   ├── services/                 # Business logic services
│   │   ├── AccessibilityService.ts              # Accessibility features
│   │   ├── AdaptiveContentSelectionService.ts   # Content adaptation
│   │   ├── AdaptiveRulesEngine.ts               # Adaptive rules
│   │   ├── AuthenticationService.ts             # JWT authentication
│   │   ├── BundleImportService.ts               # Bundle import/validation
│   │   ├── ContentDeliveryService.ts            # Offline content delivery
│   │   ├── CulturalContextService.ts            # Cultural adaptation
│   │   ├── DatabaseRecoveryService.ts           # Database recovery
│   │   ├── EncryptionService.ts                 # Data encryption
│   │   ├── GracefulDegradationService.ts        # Graceful degradation
│   │   ├── LocalizationService.ts               # Localization
│   │   ├── MonitoringService.ts                 # Metrics and monitoring
│   │   ├── PerformanceTrackingService.ts        # Performance logging
│   │   ├── SecureNetworkService.ts              # HTTP client with TLS
│   │   ├── StatePersistenceService.ts           # State persistence
│   │   ├── StudentProfileService.ts             # Student profiles
│   │   ├── SyncErrorHandler.ts                  # Sync error handling
│   │   ├── SyncOrchestratorService.ts           # Sync state machine
│   │   └── index.ts                             # Service exports
│   ├── types/                    # Additional TypeScript types
│   │   ├── accessibility.ts      # Accessibility types
│   │   └── localization.ts       # Localization types
│   ├── utils/                    # Utility functions
│   │   ├── errorHandling.ts      # Error handling utilities
│   │   ├── index.ts              # Utility exports
│   │   ├── initializeDatabase.ts # Database initialization
│   │   └── sampleData.ts         # Sample data for testing
│   └── App.tsx                   # Main app component
├── tests/                        # Test files
│   ├── __mocks__/                # Mock implementations
│   │   └── expo-sqlite.ts        # SQLite mock for testing
│   ├── *.test.ts                 # Unit tests
│   ├── *.pbt.test.ts             # Property-based tests
│   ├── pbt-setup.ts              # PBT arbitraries and config
│   └── setup.ts                  # Test setup
├── .env.example                  # Environment variables template
├── app.config.js                 # Expo configuration
├── babel.config.js               # Babel configuration
├── eslint.config.js              # ESLint configuration
├── jest.config.js                # Jest configuration
├── jest.setup.js                 # Jest setup
├── package.json                  # Dependencies and scripts
├── PROJECT_STRUCTURE.md          # This file
├── README.md                     # Project README
├── SYNC_GUIDE.md                 # Sync feature guide
├── tailwind.config.js            # Tailwind CSS configuration
└── tsconfig.json                 # TypeScript configuration
```

## Key Components

### Database Layer

The database layer uses SQLite with SQLCipher encryption for secure data storage:

- **DatabaseManager**: Singleton class managing database connections, schema creation, and transactions
- **Repositories**: Data access objects following the repository pattern for each entity type
- **Schema**: SQL table definitions with foreign key constraints and indexes

### Services Layer

Services implement business logic and coordinate between components:

- **SyncOrchestratorService**: Manages the sync state machine and workflows
- **BundleImportService**: Validates and imports learning bundles
- **ContentDeliveryService**: Delivers lessons and quizzes offline
- **PerformanceTrackingService**: Logs student interactions
- **SecureNetworkService**: HTTP client with TLS 1.3 encryption
- **AuthenticationService**: JWT token management with auto-refresh

### Models

TypeScript interfaces defining the data structures:

- **Lesson**: Lesson content with sections and curriculum standards
- **Quiz**: Quiz with questions of various types
- **Hint**: Progressive hints for quiz questions
- **PerformanceLog**: Student interaction events
- **LearningBundle**: Complete learning content package
- **SyncSession**: Sync operation state and metadata

## Testing Strategy

### Unit Tests (`*.test.ts`)

- Test specific examples and edge cases
- Mock external dependencies (network, file system)
- Validate error conditions and error messages
- Test integration points between components

### Property-Based Tests (`*.pbt.test.ts`)

- Verify universal properties across all inputs
- Generate random test data using fast-check
- Test invariants and round-trip properties
- Validate state machine transitions
- Run minimum 100 iterations per property

### Test Configuration

- **Framework**: Jest with jest-expo preset
- **PBT Library**: fast-check for property-based testing
- **Mocks**: Custom mocks for Expo modules in `tests/__mocks__/`
- **Setup**: `pbt-setup.ts` provides custom arbitraries for domain objects

## Dependencies

### Core Dependencies

- **expo**: React Native framework
- **expo-sqlite**: SQLite database with SQLCipher support
- **react-native**: Mobile app framework
- **pako**: Gzip compression/decompression
- **crypto-js**: Cryptographic functions (SHA-256)

### Development Dependencies

- **typescript**: Type checking
- **jest**: Testing framework
- **fast-check**: Property-based testing
- **eslint**: Code linting

## Configuration Files

### TypeScript (`tsconfig.json`)

- Strict mode enabled for type safety
- Path aliases configured (`@/*` maps to root)
- Extends Expo's base TypeScript configuration

### Jest (`jest.config.js`)

- Preset: `jest-expo` for React Native testing
- Test environment: `node`
- Transform ignore patterns for React Native modules
- Module name mapper for path aliases
- Coverage collection from `src/**/*.{ts,tsx}`

### Babel (`babel.config.js`)

- Expo preset for React Native
- NativeWind plugin for Tailwind CSS

## Scripts

Available npm scripts:

- `npm start`: Start Expo development server
- `npm run android`: Run on Android emulator
- `npm run ios`: Run on iOS simulator
- `npm run web`: Run in web browser
- `npm test`: Run all tests
- `npm run test:pbt`: Run only property-based tests
- `npm run test:watch`: Run tests in watch mode
- `npm run lint`: Run ESLint

## Environment Variables

Required environment variables (see `.env.example`):

- `EXPO_PUBLIC_API_URL`: Cloud Brain API endpoint
- `EXPO_PUBLIC_DB_ENCRYPTION_KEY`: SQLCipher encryption key
- `EXPO_PUBLIC_RSA_PUBLIC_KEY`: RSA public key for signature verification

## Security Features

- **SQLCipher Encryption**: AES-256 encryption for database at rest
- **TLS 1.3**: Encrypted network communications
- **JWT Authentication**: Secure API authentication with auto-refresh
- **Checksum Verification**: SHA-256 checksums for data integrity
- **Secure Storage**: Expo SecureStore for sensitive data

## Offline-First Architecture

The app is designed to work offline:

- All learning content stored locally in SQLite
- Performance logs queued for sync when online
- Content delivery works without network connectivity
- Sync resumes automatically after interruption
- Graceful degradation when features unavailable

## State Management

- **React Context**: Global app state (AppContext)
- **Local State**: Component-level state with hooks
- **Persistent State**: SQLite for durable storage
- **Sync State**: State machine in SyncOrchestratorService

## Accessibility

- Screen reader support (TalkBack, VoiceOver)
- High contrast mode
- Text scaling
- Haptic feedback
- Audio descriptions

## Localization

- English (en) and Nepali (ne) translations
- RTL support for future languages
- Cultural context adaptation
- Date/time formatting

## Performance Optimization

- Content caching in memory
- Lesson preloading (next 3 lessons)
- Database indexes for fast queries
- Lazy loading of components
- Optimized bundle sizes

## Error Handling

- Exponential backoff retry logic
- User-friendly error messages
- Structured error logging
- Graceful degradation on failures
- Transaction rollback on database errors

## Monitoring and Metrics

- Sync success/failure rates
- Sync duration (p50, p95, p99)
- Bundle generation latency
- Token refresh success rate
- Database query performance

## Future Enhancements

- Content signature verification (RSA-2048)
- Adaptive content difficulty
- Study track recommendations
- Curriculum standards alignment
- Multi-device sync
