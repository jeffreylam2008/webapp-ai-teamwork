# Deploying the App (Standalone Build)

This app is configured to build in **standalone** mode, producing a self-contained output you can copy to another server and run with Node.js (no need for the full repo or `node_modules`).

---

## 1. Build standalone on your machine

```bash
# Clean previous build (optional)
rm -rf .next node_modules/.cache

# Install dependencies and build
npm ci
npm run build
```

After the build, the standalone output is in:

```
.next/standalone/
├── server.js          # Main entry – run this with Node.js
├── .next/             # Prerendered pages and runtime
├── node_modules/      # Only required production deps (minimal)
└── package.json
```

Static assets (e.g. from `public/`) are not copied into `standalone` by Next.js. The packaging script handles that (see step 2).

---

## 2. Package for deployment

From the project root:

```bash
chmod +x scripts/package-standalone.sh
./scripts/package-standalone.sh
```

This will:

- Copy `public/` → `standalone/public/`
- Copy `.next/static/` → `standalone/.next/static/`
- Optionally copy `src/data/db-config.json` → `standalone/data/db-config.json` (if you want to ship a config file)
- Create `webapp-ai-standalone.tar.gz` in the project root

You can then copy `webapp-ai-standalone.tar.gz` to the other server.

---

## 3. Copy to the other server

Using `scp` (replace with your server and path):

```bash
scp webapp-ai-standalone.tar.gz user@your-server:/opt/webapp-ai/
```

Or use rsync, SFTP, or any other transfer method.

---

## 4. On the other server: unpack and run

```bash
# Example: deploy under /opt/webapp-ai
sudo mkdir -p /opt/webapp-ai
sudo tar -xzf webapp-ai-standalone.tar.gz -C /opt/webapp-ai
cd /opt/webapp-ai

# Ensure Node.js 18+ is installed
node -v

# Optional: use environment variables for config (recommended for production)
# export JWT_SECRET="your-secret"
# export NODE_ENV=production

# Run the app (default port 3000)
node server.js
```

To listen on a specific port (e.g. 8000):

```bash
PORT=8000 node server.js
```

To run in the background (e.g. with nohup):

```bash
PORT=8000 nohup node server.js > app.log 2>&1 &
```

---

## 5. Database and config on the other server

- The app reads database config from `src/data/db-config.json` at build time; at runtime it may be bundled or loaded from the same relative path inside the standalone folder.
- For the **other server**, either:
  - **Option A:** Place `db-config.json` in the same relative path inside the unpacked standalone (e.g. ensure `data/db-config.json` or `src/data/db-config.json` exists next to where `server.js` runs), or  
  - **Option B:** Change the app to read from environment variables (e.g. `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) and set those on the server.

---

## 6. Using a process manager (recommended for production)

Example with **systemd** (`/etc/systemd/system/webapp-ai.service`):

```ini
[Unit]
Description=Webapp AI Next.js
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/webapp-ai
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable webapp-ai
sudo systemctl start webapp-ai
sudo systemctl status webapp-ai
```

---

## Quick reference

| Step | Command |
|------|--------|
| Build | `npm run build` |
| Package | `./scripts/package-standalone.sh` |
| Copy to server | `scp webapp-ai-standalone.tar.gz user@host:/path/` |
| On server (run) | `cd /path && PORT=8000 node server.js` |
