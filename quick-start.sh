#!/bin/bash

# Sikshya-Sathi Quick Start Script
# This script helps you get both Cloud Brain and Local Brain running locally

set -e  # Exit on error

echo "🚀 Sikshya-Sathi Local Setup"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check prerequisites
print_step "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi
print_success "Python $(python3 --version) found"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi
print_success "Node.js $(node --version) found"

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
print_success "npm $(npm --version) found"

echo ""

# Setup Cloud Brain
print_step "Setting up Cloud Brain..."
cd cloud-brain

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_step "Creating Python virtual environment..."
    python3 -m venv venv
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

# Activate virtual environment
print_step "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
print_step "Installing Cloud Brain dependencies..."
pip install -q -r requirements.txt
pip install -q -r requirements-dev.txt
print_success "Cloud Brain dependencies installed"

# Run tests
print_step "Running Cloud Brain tests..."
if pytest -q; then
    print_success "Cloud Brain tests passed"
else
    print_warning "Some Cloud Brain tests failed (this might be expected)"
fi

cd ..
echo ""

# Setup Local Brain
print_step "Setting up Local Brain..."
cd local-brain

# Install dependencies
if [ ! -d "node_modules" ]; then
    print_step "Installing Local Brain dependencies (this may take a few minutes)..."
    npm install
    print_success "Local Brain dependencies installed"
else
    print_success "Local Brain dependencies already installed"
fi

# Run tests
print_step "Running Local Brain tests..."
if npm test -- --passWithNoTests 2>/dev/null; then
    print_success "Local Brain tests passed"
else
    print_warning "Some Local Brain tests failed (this might be expected)"
fi

cd ..
echo ""

# Setup Web Dashboard
print_step "Setting up Web Dashboard..."
cd cloud-brain/web-dashboard

# Install dependencies
if [ ! -d "node_modules" ]; then
    print_step "Installing Web Dashboard dependencies (this may take a few minutes)..."
    npm install
    print_success "Web Dashboard dependencies installed"
else
    print_success "Web Dashboard dependencies already installed"
fi

# Run tests
print_step "Running Web Dashboard tests..."
if npm test -- --passWithNoTests 2>/dev/null; then
    print_success "Web Dashboard tests passed"
else
    print_warning "Some Web Dashboard tests failed (this might be expected)"
fi

cd ../..
echo ""

# Summary
echo "=============================="
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "=============================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start Cloud Brain (in one terminal):"
echo "   cd cloud-brain"
echo "   source venv/bin/activate"
echo "   pytest  # Run tests"
echo ""
echo "2. Start Local Brain (in another terminal):"
echo "   cd local-brain"
echo "   npm start  # Start Expo dev server"
echo ""
echo "3. Start Web Dashboard (in another terminal):"
echo "   cd cloud-brain/web-dashboard"
echo "   npm run dev  # Start at http://localhost:5173"
echo ""
echo "4. Run the mobile app:"
echo "   npm run android  # For Android"
echo "   npm run ios      # For iOS (macOS only)"
echo "   npm run web      # For web browser"
echo ""
echo "📖 For detailed instructions, see LOCAL_SETUP_GUIDE.md"
echo ""
