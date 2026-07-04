# @coldcash/web

ColdCash web UI - Next.js demo flows

## Environment Variables

### `NEXT_PUBLIC_XCHAN_URL`

Optional. Controls the XChan cash-out section on the homepage.

- **When set:** Must be a valid `https://` URL. Renders a homepage section linking to XChan (external KX → USDC conversion service).
- **When unset or empty:** Section does not render in production. In development mode, a small muted operator note appears instead.
- **Development default:** `https://xchan.io`

```bash
# .env.development (committed)
NEXT_PUBLIC_XCHAN_URL=https://xchan.io

# .env.local (optional override)
NEXT_PUBLIC_XCHAN_URL=https://your-custom-instance.example.com
```

## Development

```bash
pnpm dev       # Start development server
pnpm build     # Build for production
pnpm test      # Run tests
pnpm typecheck # Type checking
```
