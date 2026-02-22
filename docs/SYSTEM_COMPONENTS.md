# Sikshya-Sathi System Components

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Sikshya-Sathi System                             │
│                                                                          │
│  ┌──────────────────┐         ┌──────────────────┐                     │
│  │   Cloud Brain    │◄───────►│  Web Dashboard   │                     │
│  │                  │         │                  │                     │
│  │  • Python/Lambda │         │  • React + Vite  │                     │
│  │  • Bedrock Agent │         │  • Material-UI   │                     │
│  │  • DynamoDB      │         │  • TypeScript    │                     │
│  │  • S3 Storage    │         │  • Port 5173     │                     │
│  └────────┬─────────┘         └──────────────────┘                     │
│           │                                                              │
│           │ Sync API                                                     │
│           │                                                              │
│  ┌────────▼─────────┐                                                   │
│  │   Local Brain    │                                                   │
│  │                  │                                                   │
│  │  • React Native  │                                                   │
│  │  • Expo          │                                                   │
│  │  • SQLite        │                                                   │
│  │  • Offline-first │                                                   │
│  │  • Port 8081     │                                                   │
│  └──────────────────┘                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Three Main Components

### 1. Cloud Brain (Backend)
**Location**: `cloud-brain/`
**Technology**: Python 3.11, AWS Lambda, Bedrock
**Purpose**: AI-powered content generation and personalization

**Key Features**:
- Content generation using Bedrock Agent
- Student knowledge model management
- Learning bundle creation
- Sync orchestration
- Data privacy and security

**Run Locally**:
```bash
cd cloud-brain
source venv/bin/activate
pytest
```

**Port**: N/A (serverless, runs tests locally)

---

### 2. Local Brain (Mobile App)
**Location**: `local-brain/`
**Technology**: React Native, Expo, TypeScript, SQLite
**Purpose**: Offline-first mobile learning application

**Key Features**:
- Offline lesson and quiz delivery
- Performance tracking
- Adaptive content selection
- State persistence
- Crash recovery

**Run Locally**:
```bash
cd local-brain
npm start
# Then press 'a' for Android, 'i' for iOS, or 'w' for web
```

**Port**: 8081 (Metro bundler)

---

### 3. Web Dashboard (Educator Interface)
**Location**: `cloud-brain/web/`
**Technology**: Next.js 16, React 19, Material-UI, TypeScript
**Purpose**: Educator analytics and monitoring

**Key Features**:
- Student progress tracking
- Class performance reports
- Curriculum coverage visualization
- Struggling student identification
- Top performer recognition

**Run Locally**:
```bash
cd cloud-brain/web
npm run dev
```

**Port**: 3000 (Next.js dev server)
**URL**: http://localhost:3000

---

## Component Interactions

### Cloud Brain ↔ Local Brain
- **Sync Protocol**: REST API over HTTPS
- **Data Flow**: Learning bundles (Cloud → Local), Performance logs (Local → Cloud)
- **Frequency**: Every 2 weeks or on-demand
- **Security**: TLS 1.3, content signing, encryption

### Cloud Brain ↔ Web Dashboard
- **API**: REST API with JWT authentication
- **Data Flow**: Dashboard data (Cloud → Dashboard)
- **Frequency**: Real-time on page load
- **Endpoints**:
  - `GET /api/educator/dashboard`
  - `GET /api/educator/student-progress`
  - `GET /api/educator/class-report`
  - `GET /api/educator/curriculum-coverage`

### Local Brain ↔ Web Dashboard
- **No direct connection**: Both connect to Cloud Brain independently

---

## Development Ports

| Component | Port | URL | Purpose |
|-----------|------|-----|---------|
| Cloud Brain | N/A | N/A | Serverless (tests run locally) |
| Local Brain | 8081 | exp://localhost:8081 | Metro bundler |
| Web Dashboard | 3000 | http://localhost:3000 | Next.js dev server |

---

## Running All Components

### Terminal Setup

**Terminal 1 - Cloud Brain**:
```bash
cd cloud-brain
source venv/bin/activate
pytest --watch  # Continuous testing
```

**Terminal 2 - Local Brain**:
```bash
cd local-brain
npm start
```

**Terminal 3 - Web Dashboard**:
```bash
cd cloud-brain/web
npm run dev
```

**Terminal 4 - Mobile App**:
```bash
cd local-brain
npm run android  # or ios
```

### Using Make Commands

```bash
# Setup all components
make setup

# Test all components
make test

# Run specific components
make run-local      # Local Brain
make run-dashboard  # Web Dashboard
make run-android    # Android app
make run-ios        # iOS app
```

---

## Data Flow Example

### Student Learning Session

1. **Student opens app** (Local Brain)
   - Loads lessons from SQLite
   - Displays content offline
   - Tracks performance locally

2. **Student completes quiz** (Local Brain)
   - Saves results to SQLite
   - Updates local knowledge model
   - Queues for sync

3. **Sync occurs** (Local Brain → Cloud Brain)
   - Uploads performance logs
   - Downloads new learning bundle
   - Updates local content

4. **Educator checks progress** (Web Dashboard)
   - Fetches data from Cloud Brain
   - Displays student metrics
   - Identifies struggling students

5. **Cloud Brain generates content** (Cloud Brain)
   - Analyzes student performance
   - Generates personalized lessons
   - Creates new learning bundle

---

## Technology Stack Summary

### Cloud Brain
- **Language**: Python 3.11
- **Framework**: AWS Lambda Powertools
- **AI**: Amazon Bedrock (Claude 3.5 Sonnet)
- **Database**: DynamoDB
- **Storage**: S3
- **Testing**: pytest, hypothesis

### Local Brain
- **Language**: TypeScript
- **Framework**: React Native + Expo
- **Database**: SQLite (expo-sqlite)
- **State**: AsyncStorage
- **Testing**: Jest, fast-check

### Web Dashboard
- **Language**: TypeScript
- **Framework**: Next.js 16 (App Router)
- **UI Library**: Material-UI v5
- **Styling**: Tailwind CSS
- **Testing**: Jest (to be added)

---

## File Structure

```
sikshya-sathi/
├── cloud-brain/                    # Backend (Python)
│   ├── src/
│   │   ├── handlers/               # Lambda handlers
│   │   ├── services/               # Business logic
│   │   ├── models/                 # Data models
│   │   └── utils/                  # Utilities
│   ├── tests/                      # Tests
│   ├── infrastructure/             # AWS CDK
│   ├── web/                        # Educator Dashboard (Next.js)
│   │   ├── app/
│   │   │   ├── components/         # React components
│   │   │   ├── types.ts            # TypeScript types
│   │   │   └── mockData.ts         # Development data
│   │   ├── package.json
│   │   └── next.config.ts
│   ├── requirements.txt
│   └── venv/
│
├── local-brain/                    # Mobile App (React Native)
│   ├── app/                        # Expo Router pages
│   │   └── (tabs)/                 # Tab navigation
│   ├── src/
│   │   ├── services/               # Business services
│   │   ├── database/               # SQLite layer
│   │   ├── models/                 # TypeScript types
│   │   └── utils/                  # Utilities
│   ├── tests/                      # Tests
│   ├── package.json
│   └── node_modules/
│
├── .kiro/specs/                    # Specifications
├── Makefile                        # Build commands
├── quick-start.sh                  # Setup script
└── Documentation files
```

---

## Quick Reference

### Install Dependencies
```bash
# Cloud Brain
cd cloud-brain && pip install -r requirements.txt -r requirements-dev.txt

# Local Brain
cd local-brain && npm install

# Web Dashboard
cd cloud-brain/web && npm install
```

### Run Tests
```bash
# Cloud Brain
cd cloud-brain && pytest

# Local Brain
cd local-brain && npm test

# Web Dashboard
cd cloud-brain/web && npm test
```

### Start Development
```bash
# Cloud Brain (tests)
cd cloud-brain && pytest --watch

# Local Brain
cd local-brain && npm start

# Web Dashboard
cd cloud-brain/web && npm run dev
```

### Build for Production
```bash
# Cloud Brain
cd cloud-brain/infrastructure && cdk deploy

# Local Brain
cd local-brain && expo build:android  # or ios

# Web Dashboard
cd cloud-brain/web && npm run build
```

---

## Next Steps

1. **Setup**: Run `./quick-start.sh` or `make quick-start`
2. **Explore**: Open each component and review the code
3. **Test**: Run tests for all components
4. **Develop**: Start making changes and see them live
5. **Deploy**: Follow deployment guides for each component

## Documentation

- `START_HERE.md` - Quick start guide
- `LOCAL_SETUP_GUIDE.md` - Detailed setup
- `DASHBOARD_SETUP.md` - Dashboard configuration (legacy Vite version)
- `cloud-brain/web/README.md` - Current Next.js dashboard
- `TROUBLESHOOTING.md` - Common issues
- Component READMEs in each directory

---

**All three components work together to provide a complete offline-first learning system!**
