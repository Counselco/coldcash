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

## Task Environment PATH Facts

**On-machine installation results (2026-07-04):**

All required tooling was genuinely absent from the system PATH and required installation:

- **Foundry** (forge, cast, anvil): Installed to `~/.foundry/bin` via official foundryup installer
  - Version: forge 1.7.1 (4072e48705 2026-05-08)
  
- **Node.js & npm**: Installed to `~/.local/node20/bin` via official Node 20 LTS macOS arm64 tarball
  - Version: node v20.18.0, npm 10.8.2
  
- **pnpm**: Installed to `~/.local/bin` via `npm install -g pnpm@9 --prefix ~/.local`
  - Version: pnpm 9.15.9

**Notes:**
- `/opt/homebrew/bin` exists on system but was not on PATH and contained no required tools
- Session PATH did not include standard Homebrew, Foundry, or user-local bin directories
- All installations are user-local (no sudo required)
- For Claude Code tasks, ensure PATH includes: `~/.foundry/bin:~/.local/node20/bin:~/.local/bin`
