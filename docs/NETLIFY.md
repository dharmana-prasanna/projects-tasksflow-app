# Netlify checklist (Flowboard)

## Before you deploy

1. Apps Script web app is deployed (`/exec` URL, access: Anyone).
2. Repo is on GitHub/GitLab (or you will upload `dist/` manually).
3. You have the Sheets URL ready for the env var below.

## Connect the site

1. [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. Pick this repository.
3. Build settings are already in `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Node:** 22

## Set the Sheets URL (keeps Sync button)

1. Site → **Site configuration** → **Environment variables** → **Add a variable**.
2. Add:

   | Key | Value |
   |-----|--------|
   | `VITE_SHEETS_SCRIPT_URL` | `https://script.google.com/macros/s/YOUR_ID/exec` |

3. Scopes: **Production** (and Deploy Previews if you want previews synced too).
4. **Trigger deploy** (env vars only apply to new builds).

The **Sheets** button stays in the UI for status, Pull, Push, Calendar, and optional URL override.

## Verify

1. Open the Netlify URL.
2. Confirm Board / Graph load.
3. Open **Sheets** — URL should be prefilled from the build; sync status should leave “Local only”.
4. Pull / Push once against your sheet.

## CLI alternative

```bash
npx netlify login
npx netlify init
npx netlify env:set VITE_SHEETS_SCRIPT_URL "https://script.google.com/macros/s/YOUR_ID/exec"
npx netlify deploy --prod --build
```

## Local production build (same as Netlify)

```bash
cp .env.example .env.production
# edit .env.production — set VITE_SHEETS_SCRIPT_URL
npm run build
npm run preview
```

See also [DEPLOY.md](./DEPLOY.md).
