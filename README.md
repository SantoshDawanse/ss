# Sikshya-Sathi System

An offline-first agentic tutor system for rural Nepali K-12 students, employing a two-brain architecture for personalized learning.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Sikshya-Sathi System                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐              ┌──────────────────┐     │
│  │   Cloud Brain    │◄────Sync────►│   Local Brain    │     │
│  │                  │              │                  │     │
│  │  • Bedrock Agent │              │  • React Native  │     │
│  │  • MCP Server    │              │  • SQLite        │     │
│  │  • Personalization│              │  • Offline-first │     │
│  │  • Content Gen   │              │  • Performance   │     │
│  │                  │              │    Tracking      │     │
│  └──────────────────┘              └──────────────────┘     │
│         AWS                              Mobile              │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
sikshya-sathi/
├── cloud-brain/           # AWS Lambda-based Cloud Brain
│   ├── src/               # Python source code
│   ├── tests/             # Tests (pytest + hypothesis)
│   └── infrastructure/    # AWS CDK infrastructure
│
├── local-brain/           # React Native Local Brain
│   ├── src/               # TypeScript source code
│   ├── tests/             # Tests (jest + fast-check)
│   ├── android/           # Android native code
│   └── ios/               # iOS native code
│
├── .github/workflows/     # CI/CD pipelines
└── .kiro/specs/           # Feature specifications
```

## Quick Start

### Cloud Brain Setup

```bash
cd cloud-brain

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run tests
pytest

# Deploy infrastructure
cd infrastructure
cdk deploy --context environment=development
```

### Local Brain Setup

```bash
cd local-brain

# Install dependencies
npm install

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run tests
npm test
```

## Development Environments

- **Development**: Local testing and development
- **Staging**: Pre-production validation
- **Production**: Live environment for students

## Testing Strategy

The project uses a dual testing approach:

1. **Unit Tests**: Specific examples and edge cases
   - Cloud Brain: `pytest -m "not property_test"`
   - Local Brain: `npm test`

2. **Property-Based Tests**: Universal correctness properties
   - Cloud Brain: `pytest -m property_test`
   - Local Brain: `npm run test:pbt`

## Key Features

- **Offline-First**: Local Brain operates for 2+ weeks without connectivity
- **Personalization**: AI-powered content adaptation using Bedrock Agent
- **Curriculum Alignment**: MCP Server ensures Nepal K-12 standards compliance
- **Bandwidth Efficient**: Compressed learning bundles (5MB per week)
- **Secure**: End-to-end encryption, content signing, TLS 1.3
- **Scalable**: Cloud components scale to 10,000+ concurrent students

## Requirements

### Cloud Brain
- Python 3.11+
- AWS Account with Bedrock access
- AWS CDK

### Local Brain
- Node.js 18+
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS/macOS)

## Documentation

- [Cloud Brain README](cloud-brain/README.md)
- [Local Brain README](local-brain/README.md)
- [Requirements Document](.kiro/specs/sikshya-sathi-system/requirements.md)
- [Design Document](.kiro/specs/sikshya-sathi-system/design.md)
- [Implementation Tasks](.kiro/specs/sikshya-sathi-system/tasks.md)

## Contributing

1. Create a feature branch from `develop`
2. Make changes and add tests
3. Ensure all tests pass
4. Submit a pull request

## License

Copyright © 2026 Sikshya-Sathi Project
