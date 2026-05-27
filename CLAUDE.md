# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BHSS Result System is a **no-build static web app** deployed to GitHub Pages. There is no package.json, no bundler, and no transpilation step. All JS runs directly in the browser as-is.

The backend is a **Google Apps Script Web App** (`Code.gs`) that reads/writes a Google Sheet acting as the database. The frontend communicates with it via `fetch()`.

## Development

**Local testing:** Open `index.html` directly in a browser, or use any static file server:
```
npx serve .
# or
python -m http.server 8000
```

**Deployment:** Upload all files to a GitHub repository. Enable GitHub Pages (Settings → Pages → branch: main, folder: /root). No build step required.

**Backend deployment:** Paste `Code.gs` into the Google Apps Script editor (via the linked Google Sheet → Extensions → Apps Script). Deploy → New deployment → Web app. On subsequent edits, use Manage deployments → edit → New version to preserve the URL.

There are no lint, test, or build commands — this is intentional.

## Architecture

### Request Flow

```
Browser (index.html + js/)
  └─► Google Identity Services (accounts.google.com/gsi/client)
        └─► Auth.handleCredentialResponse()
              └─► Api.verifyUser(token) ──► Code.gs (GAS Web App)
                                               └─► Google Sheet
```

Every authenticated API call sends the raw Google ID token (JWT) in the request body. `Code.gs` validates it against Google's `tokeninfo` endpoint and checks the `Users` sheet for the role — **no session management on the server**.

### JS Module Pattern

All JS files use the IIFE module pattern (`const X = (() => { ... return {...}; })();`). Globals exposed: `Utils`, `Api`, `Auth`, `Pages`, `Router`. Script load order in `index.html` is critical:

```
config.js → utils.js → api.js → auth.js → pages.js → router.js → app.js
```

### State Management

Auth state lives in `Auth` (module-level variable + `sessionStorage` key `srs_session`). Consumers call `Auth.onChange(fn)` to subscribe; `Router` and the navbar use this to update visibility after login/logout. There is no shared state store beyond `Auth`.

### Routing

Hash-based SPA (`#/home`, `#/admin`, etc.). All `<section id="page-*">` elements exist in the DOM at all times — the router adds/removes Tailwind's `hidden` class to show one at a time. Route access control (`roles` array in the routes map in `router.js`) re-checks `Auth.getRole()` on every navigation and on every auth state change.

### Navigation Dropdowns

The nav supports nested dropdowns (used by HS Results). Pattern in `index.html`:

```html
<div class="relative" data-dropdown data-roles="admin,teacher" hidden>
  <button class="nav-link dropdown-toggle" data-nav="hs-results">HS Results ▾</button>
  <div class="dropdown-menu hidden absolute ..."> ...items... </div>
</div>
```

Two visibility mechanisms are deliberately separated:

| Concern | Mechanism | Why |
|---|---|---|
| Role-based hiding of the whole dropdown | HTML `hidden` **attribute** on the `[data-dropdown]` wrapper | Cannot use the `hidden` class — it conflicts with the dropdown menu's open/close state |
| Dropdown menu open/close state | Tailwind `hidden` **class** on `.dropdown-menu` | Toggled by click handler in `app.js` |

`updateNavVisibility()` (in `router.js`) handles both: it iterates `nav [data-roles]` and applies the right mechanism based on whether the element has `data-dropdown`.

Toggle logic in `js/app.js#initDropdowns`:
- Click toggle → open that menu, close any uninvolved menus (ancestors stay open)
- Click an `<a>` inside a menu → close all
- Click outside any dropdown / press Escape / `hashchange` → close all

### HS vs HSS Asymmetry (current state)

HS and HSS are intentionally **not symmetric** right now:

- **HSS Results** is a simple nav link → class-selector page → 3 per-class buttons (Marks Entry external link, Marks Entry Review, Result Preview). Uses `Pages.renderSchoolResults('hss')`, `renderMarksReview('hss', class)`, `renderResultPreview('hss', class)`. Form URLs come from the `Links` sheet.
- **HS Results** is a nested dropdown nav → 2 static placeholder pages (`#/hs-entry-review`, `#/hs-results-preview`). HS Marks Entry URL is **hardcoded** in `index.html` as `https://bhssresult.github.io/HS-Marks-Entry/` (a separate GitHub Pages app), not pulled from the `Links` sheet.

`Pages.renderSchoolResults`, `renderMarksReview`, `renderResultPreview` are kept because HSS still uses them. Do not delete them when working on HS unless HSS is migrated too.

### GAS API Convention

- **GET** requests pass `action` + params as URL query params.
- **POST** requests send a JSON body as `Content-Type: text/plain` (to avoid CORS preflight). `Code.gs` reads it with `JSON.parse(e.postData.contents)`.
- All responses: `{ success: true, data: {...} }` or `{ success: false, error: "..." }`. `Api.*` functions throw if `success` is false.

### Google Sheets Schema

Seven sheets: `Users`, `HS_Students`, `HSS_Students`, `HS_Marks`, `HSS_Marks`, `ExamConfig`, `Links`.

`ExamConfig` is a key-value store (columns: `key`, `value`, `updated_date`). Subject lists, max marks, and pass marks are stored as comma-separated strings and parsed with `Utils.csvToArray()` / `Utils.csvToNumbers()`.

`HS_Marks` / `HSS_Marks` header rows use subject names directly as column headers. `Code.gs` reads the header row dynamically to map columns.

### ExamConfig Read/Write — Locale Safety

`getExamConfigObject()` uses `sheet.getDataRange().getDisplayValues()` (not `getValues()`). This is intentional: Google Sheets in some locales auto-converts `"100,100,100,100,100"` to the number `100100100100100` (treating commas as thousands separators), destroying the CSV structure. `getDisplayValues()` always returns the string the user sees in the cell, preserving commas.

When saving ExamConfig values (`handleSaveExamConfig`), the value cell is explicitly set to `@STRING@` number format before `setValue()` to prevent Google Sheets from re-interpreting the saved string as a number on future reads.

`Utils.csvToNumbers()` also strips any commas inside individual tokens (`.replace(/,/g, '')`) as a client-side safety net.

**Do not revert these to `getValues()` / plain `setValue()` — the bug is locale-dependent and may not appear during local testing.**

### Print CSS Architecture

The print stylesheet in `style.css` relies on the router's existing `hidden` class state rather than trying to enumerate which pages to show/hide:

- `.page.hidden { display: none !important; }` — pages the router hid stay hidden
- `#page-home > div:not(#lookup-result) { display: none !important; }` — on the Home page, hides the hero and search form, leaving only the result card visible
- `nav`, `footer`, and `.no-print` elements are hidden globally

Do not add `display: none` rules targeting specific `#page-*` IDs by name — that was the original bug (Home page result was blank because `#page-home` was explicitly hidden).

### Adding a New Page

1. Add a `<section id="page-foo" class="page hidden">` in `index.html`
2. Add an entry to the `routes` object in `router.js` (with `roles: null` for public, or `roles: ['admin']` etc.)
3. *(Dynamic pages only)* Add a `case 'foo': await Pages.renderFoo(); break;` in `router.js#handleRoute`, and add `renderFoo()` to `pages.js`. Static placeholder pages skip this — the section renders as-is.
4. Add a nav entry:
   - Standalone link: `<a href="#/foo" data-nav="foo" data-roles="admin,teacher" class="nav-link ...">Foo</a>`
   - Inside an existing dropdown: add an `<a href="#/foo">` inside the relevant `.dropdown-menu`
5. *(If the new route belongs under an existing nav group)* Add to the `map` in `router.js#updateNavActive` so the parent nav item highlights when on the child route.

### Adding a New GAS Endpoint

1. Add a `case 'actionName': return sendJson(handleActionName(e.parameter));` in `doGet` or `doPost` in `Code.gs`
2. Implement `handleActionName(params)` — call `requireRole(params.token, ['admin'])` at the top for protected endpoints
3. Add a corresponding async function to `api.js` that calls `get('actionName', {...})` or `post('actionName', {...})`
4. Redeploy as a new version (same URL is preserved)

## Key Constraints

- **No `innerHTML` with unescaped data** — always use `Utils.escapeHtml()` (aliased as `esc` in `pages.js`) when rendering sheet data into HTML strings.
- **GAS URL stability** — the `GAS_URL` in `js/config.js` must not change after initial setup (teachers bookmark the site). Always use "new version" on the existing deployment, never create a new deployment.
- **Role values** — the only valid roles are `admin` and `teacher` (lowercase). The `Users` sheet and all role checks use these exact strings.
- **Roll numbers** — must be unique across both `HS_Students` and `HSS_Students` sheets. `lookupStudent` searches HS first, then HSS, and returns the first match.
