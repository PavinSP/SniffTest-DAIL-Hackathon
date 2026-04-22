# SniffTest Frontend

Browser game for the SniffTest media-literacy trainer.

## What is here

- `index.html` - app shell
- `styles.css` - responsive UI
- `js/config.js` - level metadata, API defaults, and storage keys
- `js/content.js` - local level content
- `js/app.js` - routing, gameplay, scoring, settings, and progress views
- `js/services/` - HTTP clients for the binary and multiclass APIs
- `js/state/progress.js` - localStorage progress persistence
- `config.local.example.js` - optional local API override template

## Run

From the project root:

```bash
python3 -m http.server 4173 --directory frontend
```

Open:

```text
http://127.0.0.1:4173
```

The frontend defaults to:

- Binary API: `http://127.0.0.1:5000`
- Multiclass API: `http://127.0.0.1:8000`

If either API is unavailable, the game can continue with mock fallback predictions so the interaction flow remains playable.

## Local overrides

Copy the example file when you need custom URLs:

```bash
cp frontend/config.local.example.js frontend/config.local.js
```

Then edit `frontend/config.local.js`. This file is ignored by Git.
