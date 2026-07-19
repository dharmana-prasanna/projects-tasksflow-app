# Deploy Flowboard

Flowboard is a **static SPA** (Vite → `dist/`). Host the contents of `dist/` on any static file host. Google Sheets / Calendar sync still uses your Apps Script web app URL (set in the UI or via env at build time).

## 1. Build the package

```bash
npm install
npm run build          # runs tests, then compiles to dist/
npm run pack:dist      # optional: creates flowboard-dist.zip
```

Output:

| Path | Purpose |
|------|---------|
| `dist/` | Files to upload / publish |
| `flowboard-dist.zip` | Same files, zipped (after `pack:dist`) |

### Optional: bake in Sheets URL at build time

```bash
# .env.production (do not commit secrets you care about)
VITE_SHEETS_SCRIPT_URL=https://script.google.com/macros/s/…/exec
```

Users can also paste the Apps Script URL later under **Sheets** in the app.

## 2. Host options (pick one)

### A. Netlify (recommended)

The **Sheets / Sync** button stays on the page. Bake the Apps Script URL into the build so sync works out of the box; users can still open Sync to Pull / Push / change URL.

#### Option A1 — Git-connected site (best)

1. Push this repo to GitHub/GitLab.
2. Netlify → **Add new site** → Import repository.
3. Build settings are already in `netlify.toml` (`npm run build` → `dist`).
4. **Site configuration → Environment variables → Add variable:**
   - Key: `VITE_SHEETS_SCRIPT_URL`
   - Value: your Apps Script web app URL ending in `/exec`
   - Scopes: **Builds** (Production + Deploy Previews if you want)
5. Deploy. After publish, open the site → **Sheets** button still appears (status / Pull / Push / Calendar).

#### Option A2 — Local build + drag-and-drop

```bash
# Create .env.production (gitignored) with your URL:
echo 'VITE_SHEETS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec' > .env.production

npm run build
# Drop the dist/ folder at https://app.netlify.com/drop
```

#### Option A3 — Netlify CLI

```bash
npx netlify login
npx netlify init          # link or create site
npx netlify env:set VITE_SHEETS_SCRIPT_URL "https://script.google.com/macros/s/YOUR_ID/exec"
npx netlify deploy --prod --build
```

### B. Vercel

```bash
npx vercel
```

Or import the repo in the Vercel dashboard — `vercel.json` is already configured.

### C. Cloudflare Pages

1. Dashboard → Workers & Pages → Create → Upload assets  
2. Upload `dist/`  
   Or connect Git: build command `npm run build`, output directory `dist`

### D. GitHub Pages

```bash
# Build with the repo subpath if using https://USER.github.io/REPO/
# Set in vite.config.ts: base: '/REPO/'
npm run build
# Then push dist/ with a Pages action, or use gh-pages
```

For a custom domain or user site root, keep `base: '/'` (default).

### E. Any VPS / nginx / Apache / S3

Upload everything inside `dist/` to the web root. Example nginx:

```nginx
server {
  listen 80;
  server_name flowboard.example.com;
  root /var/www/flowboard;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### F. Preview locally (same as production build)

```bash
npm run build
npm run preview
```

Opens the production bundle (default `http://localhost:4173`).

## 3. Apps Script (Sheets / Calendar) after hosting

1. Deploy `google-apps-script/Code.gs` as a Web App (Execute as: Me, Who has access: Anyone).
2. Copy the `/exec` URL into Flowboard → **Sheets**, or set `VITE_SHEETS_SCRIPT_URL` and rebuild.
3. If the site is on HTTPS (required for most hosts), the script URL must also be HTTPS.

Local browser storage still works without Sheets; sync is optional.

## 4. What gets shipped

- React UI (Board + Graph), localStorage persistence, optional Sheets sync client
- **Not** included: a Node server — none is required for the frontend
- Apps Script remains hosted by Google separately
