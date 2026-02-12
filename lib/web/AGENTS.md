# lib/web/

## OVERVIEW

Static SPA (no framework): `index.html` + `app.js` + `styles.css` served by `lib/server.js`.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Initial data load | `app.js` | `loadData()` → `/api/models`, `/api/config`, `/api/profiles`, `/api/agents` |
| Model browsing UI | `app.js` | search/provider/capability filters; model cards; details modal |
| Agent model assignment | `app.js` | model selector modal + `/api/config` save |
| Profile management | `app.js` | create/duplicate/delete/export/import/activate profiles |
| Styling / provider badges | `styles.css` | provider pill styling + layout tokens |

## CONVENTIONS

- Vanilla DOM + fetch; no build step.
- Prefer small, local helper functions over introducing libraries.
- Keep API shapes in sync with `lib/server.js` responses.

## ANTI-PATTERNS

- Don’t add frontend dependencies or bundlers.
- Don’t duplicate server-side model formatting logic unless it’s purely presentational.
