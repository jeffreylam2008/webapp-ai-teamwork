# Install / plugin setup

These pages are **outside the main application menu**. Open them by URL while the app is running (default port **8000**).

## Entry URLs

| Page | URL |
|------|-----|
| Install home | http://localhost:8000/install |
| Plugin Lab (select / test plugins) | http://localhost:8000/install/plugins |
| Project Setup (planned) | http://localhost:8000/install/project-setup |

If the app is served on another host or port, replace the origin accordingly, for example:

- `http://<host>:8000/install/plugins`

## What lives here

| Path | Purpose |
|------|---------|
| `install/plugins/` | Plugin registry code (`monthly-invoices`, enable/disable storage, route guard) |
| `src/app/install/` | Next.js routes for the install UI |

Plugin enablement is stored in the browser (`localStorage`) for testing. Project Setup will later save a server-side profile per deployment.

## Notes

- Sign in is still required (same auth as the app).
- Turning **Monthly Invoices** off hides that sales menu item and blocks `/sales/monthly-invoices/*`.
- Do not add these routes to `base-menu.json` — install tools stay URL-only.
