#!/usr/bin/env bash
#
# Canonical Hostinger deployment script for uponproof.com
#
# This is the SOLE entrypoint for Hostinger FTP deploys. It:
# - Reads FTP credentials from macOS keychain (item: 'uponproof-ftp')
# - Builds the static site via deploy/build-site.sh
# - Uploads to public_html/ via secure FTP (TLS preferred)
# - Verifies deployment by curling uponproof.com
#
# Usage:
#   ./scripts/deploy-hostinger.sh           # Build and deploy
#   ./scripts/deploy-hostinger.sh --skip-build  # Deploy existing build
#
# Required Herald allowlist entries (add to .claude/settings.json):
#   {
#     "bash": {
#       "allow": [
#         {
#           "match": "./scripts/deploy-hostinger.sh",
#           "comment": "Hostinger deploy script"
#         },
#         {
#           "match": "bash scripts/deploy-hostinger.sh",
#           "comment": "Hostinger deploy script (explicit bash)"
#         },
#         {
#           "match": "security find-internet-password*",
#           "comment": "FTP credential read (scoped to uponproof-ftp item)"
#         }
#       ]
#     }
#   }
#
# One-time keychain setup (already done; shown for reference):
#   1. Open Keychain Access.app
#   2. Find the "uponproof-ftp" item
#   3. Right-click → Get Info → Access Control
#   4. Add Terminal.app / your shell to "Always allow access"

set -euo pipefail

# Verify macOS (script requires `security` command)
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "✗ Error: This script requires macOS (uses \`security\` for keychain access)" >&2
  exit 1
fi

# Parse flags
SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ============================================================================
# Step 1: Read FTP credentials from keychain
# ============================================================================

echo "→ Reading FTP credentials from keychain..."

# Disable command tracing to prevent password leakage
set +x

# Read keychain item 'uponproof-ftp'
if ! KEYCHAIN_ENTRY=$(security find-internet-password -l "uponproof-ftp" 2>&1); then
  echo "✗ Error: Keychain item 'uponproof-ftp' not found" >&2
  echo "  Run: security add-internet-password -l uponproof-ftp -a <user> -s <host> -w" >&2
  exit 1
fi

# Extract host (from 'srvr' attribute)
FTP_HOST=$(echo "$KEYCHAIN_ENTRY" | grep '"srvr"<blob>=' | sed -E 's/.*"srvr"<blob>="([^"]+)".*/\1/')

# Extract username (from 'acct' attribute)
FTP_USER=$(echo "$KEYCHAIN_ENTRY" | grep '"acct"<blob>=' | sed -E 's/.*"acct"<blob>="([^"]+)".*/\1/')

# Extract password (via -w flag, which outputs password only)
if ! FTP_PASS=$(security find-internet-password -l "uponproof-ftp" -w 2>/dev/null); then
  echo "✗ Error: Failed to read password from keychain item 'uponproof-ftp'" >&2
  exit 1
fi

# Validate credentials were extracted
if [[ -z "$FTP_HOST" || -z "$FTP_USER" || -z "$FTP_PASS" ]]; then
  echo "✗ Error: Failed to extract FTP credentials from keychain" >&2
  echo "  Host: ${FTP_HOST:-<missing>}" >&2
  echo "  User: ${FTP_USER:-<missing>}" >&2
  echo "  Pass: ${FTP_PASS:+<present>}${FTP_PASS:-<missing>}" >&2
  exit 1
fi

echo "✓ Credentials loaded (host: $FTP_HOST, user: $FTP_USER)"

# Export credentials for Python subprocess
export FTP_HOST
export FTP_USER
export FTP_PASS

# ============================================================================
# Step 2: Build the static site
# ============================================================================

if [[ "$SKIP_BUILD" == true ]]; then
  echo "→ Skipping build (--skip-build flag set)"

  # Verify export directory exists
  if [[ ! -d "packages/web/out" ]]; then
    echo "✗ Error: packages/web/out/ not found (build required)" >&2
    exit 1
  fi
else
  echo "→ Building static site..."

  if [[ -x "deploy/build-site.sh" ]]; then
    ./deploy/build-site.sh
  else
    echo "  Using direct pnpm build..."
    pnpm --filter @coldcash/web build
  fi

  # Verify export directory exists
  if [[ ! -d "packages/web/out" ]]; then
    echo "✗ Error: Build failed - packages/web/out/ not found" >&2
    exit 1
  fi

  echo "✓ Build complete"
fi

EXPORT_DIR="$REPO_ROOT/packages/web/out"
export EXPORT_DIR

# ============================================================================
# Step 3: Upload to Hostinger via FTP
# ============================================================================

echo "→ Uploading to Hostinger (public_html/)..."

# Create Python upload script
python3 <<PYTHON_UPLOAD
import ftplib
import os
import sys
from pathlib import Path

# Read credentials from environment
FTP_HOST = os.environ['FTP_HOST']
FTP_USER = os.environ['FTP_USER']
FTP_PASS = os.environ['FTP_PASS']
EXPORT_DIR = os.environ['EXPORT_DIR']

# Known Hostinger placeholder files to delete
PLACEHOLDERS = [
    'default.php',
    # Only delete index.html/index2.html if they match placeholder signatures
    # (We'll check file size as a proxy; Hostinger placeholders are typically < 5KB)
]

def upload_directory(ftp, local_root):
    """Recursively upload directory to FTP server"""
    uploaded_files = 0
    uploaded_bytes = 0

    # Descend into public_html ONLY if we're not already at the docroot.
    # This Hostinger account's FTP home IS /public_html; a blind cwd('public_html')
    # drops uploads into an unserved /public_html/public_html/ nested directory.
    cur = ftp.pwd().rstrip('/')
    if cur.rsplit('/', 1)[-1] == 'public_html':
        print(f"✓ Already at docroot ({cur}) — not descending into public_html")
    else:
        try:
            ftp.cwd('public_html')
            print(f"✓ Changed to public_html directory")
        except ftplib.error_perm:
            # Either already in public_html or it doesn't exist - proceed with current directory
            print(f"✓ Using current directory (may already be in public_html)")

    # Delete known placeholders
    for placeholder in PLACEHOLDERS:
        try:
            ftp.delete(placeholder)
            print(f"  Deleted placeholder: {placeholder}")
        except ftplib.error_perm:
            pass  # File doesn't exist, continue

    # Check and potentially delete index.html/index2.html placeholders
    for index_file in ['index.html', 'index2.html']:
        try:
            size = ftp.size(index_file)
            if size and size < 5000:  # Likely a placeholder
                ftp.delete(index_file)
                print(f"  Deleted placeholder: {index_file} ({size} bytes)")
        except (ftplib.error_perm, AttributeError):
            pass  # File doesn't exist or FTP server doesn't support SIZE

    # Walk local directory
    local_path = Path(local_root)
    for root, dirs, files in os.walk(local_path):
        rel_root = Path(root).relative_to(local_path)

        # Create remote subdirectories (relative to current working directory)
        if str(rel_root) != '.':
            remote_dir_parts = Path(rel_root).parts

            # Build path incrementally to create missing subdirectories
            for i, part in enumerate(remote_dir_parts):
                subdir_path = '/'.join(remote_dir_parts[:i+1])
                try:
                    # Try to create the directory (will fail if it exists)
                    ftp.mkd(subdir_path)
                    print(f"  Created subdirectory: {subdir_path}")
                except ftplib.error_perm as e:
                    # Directory already exists or creation failed
                    if "exists" not in str(e).lower() and "550" not in str(e):
                        print(f"  Warning: Could not create subdirectory {subdir_path}: {e}")
                    # Continue regardless

        # Upload files with paths RELATIVE to current working directory
        for filename in files:
            local_file = Path(root) / filename
            # Remote path is relative to where we are (public_html)
            remote_file = str(rel_root / filename) if str(rel_root) != '.' else filename

            with open(local_file, 'rb') as f:
                file_size = os.path.getsize(local_file)

                # Use STOR to upload (path is relative to current directory)
                ftp.storbinary(f'STOR {remote_file}', open(local_file, 'rb'))
                uploaded_files += 1
                uploaded_bytes += file_size

    return uploaded_files, uploaded_bytes

try:
    # Connect with TLS (preferred)
    try:
        ftp = ftplib.FTP_TLS(FTP_HOST)
        ftp.login(FTP_USER, FTP_PASS)
        ftp.prot_p()  # Secure data connection
        print(f"✓ Connected via FTP_TLS to {FTP_HOST}")
    except Exception as tls_error:
        # Fall back to plain FTP
        print(f"⚠ TLS negotiation failed ({tls_error}), falling back to plain FTP")
        ftp = ftplib.FTP(FTP_HOST)
        ftp.login(FTP_USER, FTP_PASS)
        print(f"✓ Connected via plain FTP to {FTP_HOST} (WARNING: unencrypted)")

    # Upload files
    uploaded_files, uploaded_bytes = upload_directory(ftp, EXPORT_DIR)

    # Report
    uploaded_mb = uploaded_bytes / 1024 / 1024
    print(f"✓ Upload complete: {uploaded_files} files, {uploaded_mb:.2f} MB")

    # Close connection
    ftp.quit()

except Exception as e:
    print(f"✗ FTP upload failed: {e}", file=sys.stderr)
    sys.exit(1)
PYTHON_UPLOAD

if [[ $? -ne 0 ]]; then
  echo "✗ Error: FTP upload failed" >&2
  exit 1
fi

# ============================================================================
# Step 4: Verify deployment
# ============================================================================

echo "→ Verifying deployment..."

# Wait for cache/propagation (Hostinger shared hosting may have caching)
echo "  Waiting 20s for cache propagation..."
sleep 20

# Test apex domain
echo "  Testing https://uponproof.com..."
APEX_RESPONSE=$(curl -sL https://uponproof.com)

if ! echo "$APEX_RESPONSE" | grep -q "Upon Proof"; then
  echo "⚠ Warning: Apex domain may still show placeholder, retrying in 60s..."
  sleep 60

  APEX_RESPONSE=$(curl -sL https://uponproof.com)
  if ! echo "$APEX_RESPONSE" | grep -q "Upon Proof"; then
    echo "✗ Error: Apex domain verification failed (expected 'Upon Proof' in body)" >&2
    exit 1
  fi
fi

echo "✓ Apex domain verified"

# Test key pages (HTTP 200 checks)
for PAGE in /backer /seeker /status; do
  echo "  Testing https://uponproof.com$PAGE..."

  HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" "https://uponproof.com$PAGE")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "✗ Error: Page $PAGE returned HTTP $HTTP_CODE (expected 200)" >&2
    exit 1
  fi
done

echo "✓ All pages verified (200 OK)"

# ============================================================================
# Done
# ============================================================================

echo ""
echo "🚀 Deployment successful!"
echo "   Site: https://uponproof.com"
echo "   Verified pages: /, /backer, /seeker, /status"
