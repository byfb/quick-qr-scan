# Quick QR Scan

Single-page QR scanner built with Astro static output for Cloudflare Pages. Source uses a small Feature-Sliced Design structure, and production build emits `dist/index.html` plus hashed CSS/JavaScript assets for Cloudflare caching.

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
- Scanned `http:` and `https:` URLs prompt before opening unless `Auto-open links` is enabled in camera controls.
- Native `BarcodeDetector` is attempted first; bundled `jsQR` is loaded as a fallback only when needed.
