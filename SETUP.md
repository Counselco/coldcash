# ColdCash Development Setup

## Prerequisites

This project requires the following tools:

### 1. Foundry (for Solidity contracts)

Install Foundry via foundryup:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

After installation, install forge-std dependencies:

```bash
cd packages/contracts
forge install foundry-rs/forge-std --no-git
```

Verify installation:

```bash
cd packages/contracts
forge test
```

Expected output: 17/17 tests passing

### 2. Node.js and pnpm (for TypeScript packages)

Install Node.js 20+ from [nodejs.org](https://nodejs.org/) or via package manager:

```bash
# macOS (via Homebrew)
brew install node@20

# Or use nvm
nvm install 20
nvm use 20
```

Install pnpm globally:

```bash
npm install -g pnpm@9
```

### 3. Install dependencies

From the repository root:

```bash
pnpm install
```

### 4. Build all packages

```bash
pnpm -r build
```

### 5. Run all tests

```bash
# Forge tests
cd packages/contracts && forge test

# TypeScript tests
pnpm -r test
```

## Verification

- `forge test` should show 17/17 tests passing
- `pnpm -r build` should complete without errors
- `pnpm -r typecheck` should complete without errors
- `pnpm -r test` should show all unit tests passing
