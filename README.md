# Flowboard

Calendar-based task board with dependency arrows — inspired by a hand-drawn schedule/workflow sketch.

## Features

- **Week calendar grid** — dates across the top, hours down the side
- **Create / edit / delete tasks** — click a cell or use **+ New task**
- **Link dependencies** — enter Link mode, click source then target; arrows connect them
- **Remove links** — hover an arrow and click the ×
- **Persists locally** — saved in `localStorage`, with a **Reset sample** to restore the sketch demo

## Run

```bash
npm install
npm run dev
```

## Build & deploy

```bash
npm run build       # tests + production bundle → dist/
npm run pack:dist   # same, plus flowboard-dist.zip
npm run preview     # serve dist/ locally
```

### Netlify

1. Import this repo in Netlify (`netlify.toml` is ready).
2. Set env var **`VITE_SHEETS_SCRIPT_URL`** to your Apps Script `/exec` URL.
3. Deploy — the **Sheets** sync button stays on the site.

Step-by-step: **[docs/NETLIFY.md](docs/NETLIFY.md)** · general hosting: **[docs/DEPLOY.md](docs/DEPLOY.md)**

## Stack

React + TypeScript + Vite + date-fns
