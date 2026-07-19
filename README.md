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

Upload `dist/` (or the zip) to Netlify, Vercel, Cloudflare Pages, S3, or any static host.  
See **[docs/DEPLOY.md](docs/DEPLOY.md)** for step-by-step hosting and Apps Script sync.

## Stack

React + TypeScript + Vite + date-fns
