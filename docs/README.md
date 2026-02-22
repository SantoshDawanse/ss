# Sikshya-Sathi Documentation

This folder contains comprehensive documentation for the Sikshya-Sathi system.

## Getting Started

New to the project? Start here:

1. **[START_HERE.md](START_HERE.md)** - Your first stop! Step-by-step guide to get running locally
2. **[QUICK_START.md](QUICK_START.md)** - Get up and running in 5 minutes
3. **[LOCAL_SETUP_GUIDE.md](LOCAL_SETUP_GUIDE.md)** - Detailed setup instructions for all components

## Architecture & Configuration

- **[SYSTEM_COMPONENTS.md](SYSTEM_COMPONENTS.md)** - Overview of Cloud Brain, Local Brain, and Web Dashboard architecture
- **[DASHBOARD_SETUP.md](DASHBOARD_SETUP.md)** - Web Dashboard setup, configuration, and deployment guide

## Troubleshooting

- **[../TROUBLESHOOTING.md](../TROUBLESHOOTING.md)** - Common issues and solutions (in root directory)

## Component-Specific Documentation

- **[Cloud Brain](../cloud-brain/README.md)** - Backend services, AI content generation
- **[Local Brain](../local-brain/README.md)** - Mobile app, offline-first architecture
- **[Web Dashboard](../cloud-brain/web-dashboard/README.md)** - Educator analytics interface

## Specifications

Detailed requirements, design, and implementation tasks:

- **[Requirements](../.kiro/specs/sikshya-sathi-system/requirements.md)**
- **[Design](../.kiro/specs/sikshya-sathi-system/design.md)**
- **[Tasks](../.kiro/specs/sikshya-sathi-system/tasks.md)**

## Quick Reference

### Running the System

```bash
# Cloud Brain
cd cloud-brain
source venv/bin/activate
pytest

# Local Brain
cd local-brain
npm start

# Web Dashboard
cd cloud-brain/web-dashboard
npm run dev
```

### Testing

```bash
# All tests
make test

# Component-specific
make test-cloud
make test-local
make test-dashboard
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.
