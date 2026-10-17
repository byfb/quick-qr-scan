# Quick QR Scan

A QR code scanner for your browser. Scan with your camera, keep recent results on your device, and reopen the scanner offline.

## Features

- **Tap to scan:** use your device's camera and tap the preview again to scan another code.
- **Camera controls:** adjust zoom and torch on supported devices. Automatic zoom and best-effort focus, exposure, and white balance help with difficult scans.
- **Decode adjustments:** tune brightness and contrast without changing the visible camera preview.
- **Recent scans:** keep the latest 20 unique results, with scan counts and timestamps. Copy a result, open a link, delete one entry, or clear the history.
- **Link handling:** review scanned HTTP/HTTPS links before opening them, or enable **Auto-open links** in Camera controls.
- **Offline access:** reopen the cached scanner without a connection. Install it on your home screen where your browser supports it.

## How to use

1. Open the app over HTTPS and tap the camera preview. Allow camera access when prompted.
2. Point the camera at a QR code. Scanning pauses when a result is found; tap the preview to scan again.
3. Copy the result or open a detected web link. Opening a link stops the camera to save power.
4. Use the **Recent scans** button to revisit or delete results. On a small screen, you can also swipe in from the right edge.

Camera controls depend on your browser and device. If scanning is difficult, try better lighting, a different distance, or the brightness and contrast controls.

## Privacy and links

Camera frames and scan results are processed in your browser. The app does not upload them to a backend.

Recent results, timestamps, and scan counts are saved without encryption in your browser's local storage. They stay on that browser and device; use **Delete** or **Clear all** to remove saved entries. Clearing site data also removes the history and saved settings.

Only HTTP and HTTPS values are offered as web links. This checks the link format, not whether the destination is trustworthy. Opening a link connects to that website. **Auto-open links** is off by default.

## Offline use

Visit the app online once and let it finish saving its offline files. You can then reopen it and scan codes without a network connection. Opening websites still needs a connection.

Use **Refresh app** while online to check for a new version. **Reset Camera** restores camera controls; it does not clear scan history or update the app.

## Run locally

Use Node.js 22.22.2+ on the 22.x line, 24.15+ on the 24.x line, or 26+, with pnpm 10.33.2.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by the dev server. Camera access works on localhost; testing from another device requires HTTPS.

| Command | Purpose |
| --- | --- |
| `pnpm test` | Run automated tests |
| `pnpm build` | Build the static app into `dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm deploy` | Build and deploy to Cloudflare Pages |

For deployment, authenticate with `pnpm exec wrangler login` and set the Pages project name in [`wrangler.toml`](wrangler.toml) to your own project before running `pnpm deploy`.

## License

Copyright 2026 byfb. Licensed under the [Apache License 2.0](LICENSE).
