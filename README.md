# webapp-ai-teamwork

Internal ERP-style web application: **Next.js (App Router)** front end with **MySQL** persistence, **JWT** session auth, and an **Ant Design** UI. Modules include customers, suppliers, products, warehouse operations, sales (quotations, orders, invoices), purchasing, and administration (users, settings, master data import/export).

## Tech stack

- **Next.js** 15, **React** 19, **TypeScript**
- **Ant Design** 5, **Tailwind CSS**
- **mysql2** (connection pool)
- **jsonwebtoken** / **bcryptjs** for authentication

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **MySQL** 8.x (or compatible) with a database created for the app

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Database connection**

   The app reads MySQL settings from [`src/data/db-config.json`](src/data/db-config.json) (host, port, database, pool options). **User and password are masked** (`********`) in that file; set real credentials via environment variables:

   - `DB_USER`, `DB_PASSWORD` (required when masked)
   - Optional overrides: `DB_HOST`, `DB_PORT`, `DB_NAME`

   Use `.env.local` (see `.env.example`) for local development. Scripts under `scripts/` use the same resolution rules.

3. **Environment variables**

   Copy [`.env.example`](.env.example) to `.env.local` (or `.env`) in the project root and set at least:

   - **`JWT_SECRET`** — required for production; used by auth API routes and middleware. A weak or missing value is unsafe.

   Optional / situational variables are documented in `.env.example` (e.g. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for stable server actions across deploys, `DEBUG_DB_QUERIES` for query logging in development).

   Next.js loads `.env`, `.env.local`, `.env.development`, and `.env.production` automatically; see [Next.js environment variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables).

4. **Run the development server**

   ```bash
   npm run dev
   ```

   The app listens on **port 8000** by default ([`package.json`](package.json) `dev` script). Open [http://localhost:8000](http://localhost:8000).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Development server (`next dev -p 8000`) |
| `npm run build` | Production build |
| `npm run start` | Start production server (`next start`; set `PORT` if needed) |
| `npm run lint` | ESLint |
| `npm run seed:items` | Seed script for items/categories (see `scripts/`) |

## Project layout (high level)

- `src/app/` — App Router pages and `api/` route handlers
- `src/components/` — Shared UI (layout, tables, breadcrumbs, etc.)
- `src/contexts/` — React context (e.g. auth)
- `src/hooks/` — Shared hooks (permissions, pagination, language, navigation)
- `src/lib/` — DB access, auth helpers, i18n, logging
- `src/data/` — Static data such as menu JSON and `db-config.json`
- `scripts/` — Node scripts for seeding and maintenance

## Internationalization

UI language is driven by a **global system setting** (stored in the database and exposed via `/api/system/language`), with **`useSystemLanguage`** and page/module translation files under `src/app/**/i18n/` and `src/lib/i18n/`. Optional `?lang=` on URLs can override for specific pages where supported.

## Production notes

- Set a strong **`JWT_SECRET`** and MySQL credentials via **`DB_USER`** / **`DB_PASSWORD`** (not in `db-config.json`).
- Run `npm run build` then `npm run start` (or use your process manager). Configure reverse proxy, TLS, and `PORT` as needed for your host.

## License

Private project (`"private": true` in `package.json`).
