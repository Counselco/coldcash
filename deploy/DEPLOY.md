# Upon Proof Production Deployment

Production architecture:
- **Frontend**: Static Next.js export on Hostinger shared hosting (uponproof.com)
- **Backend**: API + Oracle services on Vultr VPS (api.uponproof.com → 45.63.22.189)

## Prerequisites

- Hostinger shared hosting account with domain uponproof.com
- Vultr VPS at 45.63.22.189
- DNS access in Hostinger control panel

## Part 1: Frontend Deployment (Hostinger)

### Option A: Manual Upload via hPanel

1. Build the static site locally:
   ```bash
   cd /path/to/coldcash-work
   ./deploy/build-site.sh
   ```

2. Download the tarball:
   ```bash
   # Tarball location: out/deploy/uponproof-site.tar.gz
   ```

3. Upload to Hostinger:
   - Log in to hPanel
   - Go to File Manager
   - Navigate to `public_html/`
   - Upload `uponproof-site.tar.gz`
   - Extract in place (File Manager has an "Extract" option)
   - Verify files are in `public_html/` (not a subdirectory)

4. Test: Visit https://uponproof.com

### Option B: SSH Deployment (Automated)

1. Enable SSH in Hostinger hPanel:
   - Go to Advanced → SSH Access
   - Enable SSH
   - Note the SSH port (usually 65002)

2. Add your SSH key to Hostinger:
   ```bash
   # Generate key if needed
   ssh-keygen -t ed25519 -C "deploy@uponproof"
   
   # Copy public key
   cat ~/.ssh/id_ed25519.pub
   
   # In hPanel, paste the public key in SSH Access → SSH Keys
   ```

3. Deploy script (run from your local machine):
   ```bash
   #!/usr/bin/env bash
   # deploy-to-hostinger.sh
   
   set -euo pipefail
   
   HOSTINGER_USER="u123456789"  # Replace with your Hostinger username
   HOSTINGER_HOST="srv123.hostinger.com"  # Replace with your Hostinger host
   HOSTINGER_PORT="65002"  # Replace with your SSH port
   
   # Build
   ./deploy/build-site.sh
   
   # Upload
   scp -P "$HOSTINGER_PORT" out/deploy/uponproof-site.tar.gz \
     "$HOSTINGER_USER@$HOSTINGER_HOST:~/public_html/"
   
   # Extract remotely
   ssh -p "$HOSTINGER_PORT" "$HOSTINGER_USER@$HOSTINGER_HOST" \
     "cd ~/public_html && tar -xzf uponproof-site.tar.gz && rm uponproof-site.tar.gz"
   
   echo "✓ Deployed to https://uponproof.com"
   ```

## Part 2: Backend Deployment (Vultr)

### DNS Setup

Add A record in Hostinger DNS zone for uponproof.com:
```
Type: A
Name: api
Value: 45.63.22.189
TTL: 3600
```

Wait for DNS propagation (verify with `dig api.uponproof.com`).

### Vultr VPS Setup

SSH into the Vultr box:
```bash
ssh root@45.63.22.189
```

#### 1. Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install nginx
apt install -y nginx

# Install certbot
apt install -y certbot python3-certbot-nginx
```

#### 2. Create Service User

```bash
useradd -r -m -s /bin/bash uponproof
mkdir -p /opt/uponproof/{api,oracle}
chown -R uponproof:uponproof /opt/uponproof
```

#### 3. Deploy API Service

```bash
# Build locally (on your dev machine)
cd /path/to/coldcash-work/packages/api
pnpm build

# Copy to server
scp -r dist/ root@45.63.22.189:/opt/uponproof/api/
scp package.json root@45.63.22.189:/opt/uponproof/api/

# On server
cd /opt/uponproof/api
npm install --production
```

#### 4. Deploy Oracle Service

```bash
# Build locally (on your dev machine)
cd /path/to/coldcash-work/packages/oracle
pnpm build

# Copy to server
scp -r dist/ root@45.63.22.189:/opt/uponproof/oracle/
scp package.json root@45.63.22.189:/opt/uponproof/oracle/

# On server
cd /opt/uponproof/oracle
npm install --production
```

#### 5. Configure Environment Files

**NEVER commit secrets to the repo.** Create env files on the server:

```bash
# API environment
cat > /opt/uponproof/api/.env <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost/uponproof
RPC_URL=https://arb1.arbitrum.io/rpc
PRIVATE_KEY=0x...  # Server-side key for contract interactions
EOF

# Oracle environment
cat > /opt/uponproof/oracle/.env <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@localhost/uponproof
RPC_URL=https://arb1.arbitrum.io/rpc
POLL_INTERVAL_MS=30000
EOF

# Secure the env files
chown uponproof:uponproof /opt/uponproof/{api,oracle}/.env
chmod 600 /opt/uponproof/{api,oracle}/.env
```

#### 6. Install systemd Units

```bash
# Copy unit files from repo
scp deploy/uponproof-api.service root@45.63.22.189:/etc/systemd/system/
scp deploy/uponproof-oracle.service root@45.63.22.189:/etc/systemd/system/

# Enable and start
systemctl daemon-reload
systemctl enable uponproof-api uponproof-oracle
systemctl start uponproof-api uponproof-oracle

# Verify
systemctl status uponproof-api
systemctl status uponproof-oracle
journalctl -u uponproof-api -f
```

#### 7. Configure nginx

```bash
# Copy nginx config from repo
scp deploy/nginx-api.conf root@45.63.22.189:/etc/nginx/sites-available/api.uponproof.com

# Enable site
ln -s /etc/nginx/sites-available/api.uponproof.com /etc/nginx/sites-enabled/

# Obtain SSL certificate (after DNS propagation)
certbot certonly --nginx -d api.uponproof.com --email admin@uponproof.com --agree-tos --no-eff-email

# Test nginx config
nginx -t

# Reload nginx
systemctl reload nginx
```

#### 8. Firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (certbot renewal)
ufw allow 443/tcp   # HTTPS
ufw enable
```

## Verification

1. **Frontend**: Visit https://uponproof.com → should load demo flows
2. **API Health**: `curl https://api.uponproof.com/health` → should return 200
3. **CORS**: Check browser console on uponproof.com when making API calls → no CORS errors
4. **SSL**: https://www.ssllabs.com/ssltest/ → verify A+ rating
5. **Logs**:
   ```bash
   journalctl -u uponproof-api -f
   journalctl -u uponproof-oracle -f
   tail -f /var/log/nginx/api.uponproof.com.access.log
   ```

## Ongoing Maintenance

- **SSL renewal**: certbot auto-renews via cron (check: `certbot renew --dry-run`)
- **Log rotation**: systemd journal auto-rotates; nginx logs via logrotate
- **Updates**: redeploy via the same `scp` + `systemctl restart` flow
- **Monitoring**: set up alerts on systemd service failures

## Rollback

If deployment fails:
1. Frontend: re-upload previous tarball to Hostinger
2. Backend: `systemctl stop uponproof-{api,oracle}`, restore previous dist/, `systemctl start`

## Notes

- Shared hosting (Hostinger) serves ONLY static files — no server-side code
- All dynamic logic (API, oracle) runs on Vultr box at 45.63.22.189
- Secrets live in EnvironmentFile on Vultr, never in repo or systemd units
- CORS allows only https://uponproof.com and https://www.uponproof.com
- nginx proxies api.uponproof.com → localhost:3001 (api service)
