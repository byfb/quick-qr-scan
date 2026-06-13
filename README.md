# Quick QR Scan

Single-page QR scanner built for Cloudflare Pages. Source is modular for development, but production build outputs one bundled `dist/index.html`.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm deploy
```

`pnpm deploy` runs `pnpm build && wrangler pages deploy dist`.

## Deployment

Cloudflare Pages config lives in `wrangler.toml`:

```toml
name = "quick-qr-scan"
compatibility_date = "2026-06-13"
pages_build_output_dir = "dist"
```

## Notes

- Scan history is local-only via browser storage.
- Camera zoom, torch, focus, exposure, and white balance controls are best-effort because browser/device support varies.
- The app never auto-opens scanned URLs. Use the `Open` button for `http:` and `https:` results.
