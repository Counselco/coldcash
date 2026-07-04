#!/usr/bin/env bash
set -euo pipefail

echo "ColdCash Bootstrap Script"
echo "========================="
echo

# Check if Foundry is installed
if ! command -v forge &> /dev/null; then
    echo "Installing Foundry..."
    curl -L https://foundry.paradigm.xyz | bash
    export PATH="$HOME/.foundry/bin:$PATH"
    foundryup
    echo "✓ Foundry installed"
else
    echo "✓ Foundry already installed"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
else
    echo "✓ Node.js found: $(node --version)"
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm@9
    echo "✓ pnpm installed"
else
    echo "✓ pnpm already installed: $(pnpm --version)"
fi

# Install forge-std
echo
echo "Installing forge-std..."
cd packages/contracts
if [ ! -d "lib/forge-std" ]; then
    forge install foundry-rs/forge-std --no-git
    echo "✓ forge-std installed"
else
    echo "✓ forge-std already installed"
fi
cd ../..

# Install npm dependencies
echo
echo "Installing npm dependencies..."
pnpm install
echo "✓ Dependencies installed"

# Build packages
echo
echo "Building packages..."
pnpm -r build
echo "✓ Build complete"

# Run tests
echo
echo "Running tests..."
echo
echo "Forge tests:"
cd packages/contracts
forge test
cd ../..

echo
echo "TypeScript tests:"
pnpm -r test

echo
echo "✅ Bootstrap complete!"
echo
echo "Next steps:"
echo "  - Run 'forge test' in packages/contracts"
echo "  - Run 'pnpm -r build' to build all packages"
echo "  - Run 'pnpm -r test' to run all tests"
