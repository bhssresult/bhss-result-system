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
config.js → utils.js → api.js → auth.js → pages.js → hs-marks-entry.js → router.js → app.js
```

### State Management

Auth state lives in `Auth` (module-level variable + `sessionStorage` key `srs_session`). Consumers call `Auth.onChange(fn)` to subscribe; `Router` and the navbar use this to update visibility after login/logout. There is no shared state store beyond `Auth`.

### Routing

Hash-based SPA (`#/home`, `#/admin`, etc.). All `<section id="page-*">` elements exist in the DOM at all times — the router adds/removes Tailwind's `hidden` class to show one at a time. Route access control (`roles` array in the routes map in `router.js`) re-checks `Auth.getRole()` on every navigation and on every auth state change.

**Per-role home:** logged-in roles never see the public `#/home` lookup page. `handleRoute` redirects `home` to each role's landing page — `admin` → `#/admin`, `hs_teacher` → `#/hs-home`, `hss_teacher` → `#/hss-home`, `principal` → `#/principal-home` (so the logo, which links to `#/home`, lands each role on their own home). The Home nav link is hidden for all logged-in roles via `data-hide-roles="admin,hs_teacher,hss_teacher,principal"` (the inverse of `data-roles`, handled in `updateNavVisibility`) — it stays visible only to logged-out visitors.

### Navbar

The navbar is **flat**: just the logo, a **Home** link (logged-out only), an **Admin** link (admin only), and the user-info/logout block. There are no HS/HSS navbar items — teachers reach their tools from the buttons on their role homepage instead (see below).

`updateNavVisibility()` (in `router.js`) drives visibility from two attributes on `nav` elements: `data-roles` (show only to the listed roles) and `data-hide-roles` (hide from the listed roles, show to everyone else, including logged-out). It also still supports a `[data-dropdown]` wrapper that toggles via the HTML `hidden` attribute rather than the `hidden` class, and `js/app.js#initDropdowns` still wires generic open/close behavior — but **no dropdowns currently exist in the markup**, so that code is inert (kept for reuse).

### Role homepages (HS / HSS teachers, principal)

Each teacher role gets a landing page with three buttons that replace the old navbar navigation for Marks Entry / Entry Review / Result Preview. Admins reach both from "Open HS View" / "Open HSS View" buttons at the top of `#page-admin`.

- **`hs_teacher`** → `#/hs-home` (`#page-hs-home`): a **static** page; the 3 buttons link straight to `#/hs-marks-entry` (the 3-step wizard), `#/hs-entry-review`, and `#/hs-results-preview` (the latter two are still placeholder pages).
- **`hss_teacher`** → `#/hss-home` (`#page-hss-home`): a **dynamic** page rendered by `Pages.renderHssHome()`. Because HSS actions are per-class, it shows a class `<select>` first; picking a class enables the 3 buttons — Marks Entry opens that class's external form URL (`hss_<class>` in the `Links` sheet, new tab; disabled if unset), Entry Review → `#/hss-marks-review?class=X`, Result Preview → `#/hss-result-preview?class=X`.
- **`principal`** → `#/principal-home` (`#page-principal-home`): a **static** page with two buttons — HS View → `#/hs-home`, HSS View → `#/hss-home`. The principal has teacher-level access to both schools' pages (the HS/HSS routes include `principal` in their `roles`).

`renderHssHome`, `renderMarksReview`, and `renderResultPreview` are the live HSS render functions (the old `renderSchoolResults` class-grid was removed). HS Entry Review / Results Preview have no render function yet — they are static placeholders.

#### HS Marks Entry module (`js/hs-marks-entry.js`)

A self-contained IIFE module (`HsMarksEntry`), originally ported from the standalone [HS-Marks-Entry](https://github.com/bhssresult/HS-Marks-Entry) app:

- The Term / Teacher / Class-Section **options are fixed** in `index.html`. The destination **URLs are data**, kept in the `HS_Links` sheet (`term | name | class_section | url`) and fetched at runtime via `Api.getHsLinks()` → `getHsLinks` GAS endpoint. `URL_MAP` is built from the response and keyed `"term|name|class_section"`. To change/add links, edit the sheet — no code edits or redeploy. (`HS_Links-seed.tsv` in the repo root holds all 480 term/teacher/class combinations for the initial paste-in — First Mid Term has real URLs, the other five terms have blank `url` cells to fill in later. It can be deleted after import.)
- `HsMarksEntry.init()` (called once from `app.js`) attaches the dropdown/button listeners. `HsMarksEntry.activate()` (called by `router.js` on each navigation to the page) resets the wizard to step 1 and loads the links once per session (subsequent visits reuse the cached map; a full page reload re-fetches).
- Element IDs are prefixed `hs-` (`hs-dd-term`, `hs-dd-name`, `hs-dd-classsection`, `hs-dot1..3`, `hs-btn-go`, `hs-url-preview`, `hs-error-msg`). The "Go to Entry Sheet" button navigates in the same tab (`window.location.href = url`). Combinations with no matching `HS_Links` row show a "not configured yet" message.
- The card logo is `assets/logo.png` (the school crest).
- The script tag loads after `pages.js` and before `router.js`.

### Theme

The app uses an **indigo/violet** palette (matching the HS Marks Entry portal). The Tailwind `brand.*` scale is redefined in `index.html`'s `tailwind.config` to indigo shades, so all existing `brand-*` classes re-theme automatically. Fonts are **DM Sans** (body, set on `body` in `style.css`) and **DM Serif Display** (headings via the `.hs-serif` class), loaded from Google Fonts in `index.html`. The HS Marks Entry page's component styles (`.bg-mesh`, `.card-glow`, `.btn-submit`, `.step-dot`, `.step-line`, and the scoped `#page-hs-marks-entry select` arrow) live in `style.css`.

### GAS API Convention

- **GET** requests pass `action` + params as URL query params.
- **POST** requests send a JSON body as `Content-Type: text/plain` (to avoid CORS preflight). `Code.gs` reads it with `JSON.parse(e.postData.contents)`.
- All responses: `{ success: true, data: {...} }` or `{ success: false, error: "..." }`. `Api.*` functions throw if `success` is false.

### Google Sheets Schema

Sheets: `Users`, `HS_Students`, `HSS_Students`, `HS_Marks`, `HSS_Marks`, `ExamConfig`, `Links`, `HS_Links`, and the optional `HS_Teachers` / `HSS_Teachers` (drive the auto-sync below).

`HS_Students` / `HSS_Students` carry an **`email`** column — the address the result OTP is sent to (HSS also has `stream`). The `email` is stripped from `buildStudentResult` before the result is returned to the client. `ExamConfig` has a **`sections`** key (CSV, e.g. `A,B,C`) used to populate the homepage Section dropdown, and an optional **`contact_email`** key used as the Reply-To on the OTP email. The OTP email is sent with a sender display name (`school_name`) and a branded HTML body (`handleRequestResultOtp`).

`HS_Links` (columns: `term`, `name`, `class_section`, `url`) holds the HS Marks Entry destination URLs. `term`/`name`/`class_section` must match the `<option value>`s in the HS Marks Entry `<select>`s in `index.html` (e.g. `firstterm`, `madampuii`, `IX-A`). Read by `handleGetHsLinks` and exposed as a `"term|name|class_section" → url` map.

`ExamConfig` is a key-value store (columns: `key`, `value`, `updated_date`). Subject lists, max marks, and pass marks are stored as comma-separated strings and parsed with `Utils.csvToArray()` / `Utils.csvToNumbers()`.

`HS_Marks` / `HSS_Marks` header rows use subject names directly as column headers. `Code.gs` reads the header row dynamically to map columns.

### Teacher sheets → Users auto-sync

Two optional tabs (same workbook) are the **source of truth for teacher + principal users**: `HS_Teachers` and `HSS_Teachers`. In each, column **A** = name, column **F** = email (G/H are ignored — one user per row). The split is by row:

- **Row 2 (F2) → role `principal`.** HS_Teachers F2 and HSS_Teachers F2 are two *different* principals; both are stored as `principal`. The principal reconcile is scoped to the union of *both* sheets' F2 cells (`collectPrincipalEmails`), so syncing one sheet never deletes the other's principal.
- **Rows 3+ (F3:F) → the teacher role:** `HS_Teachers` → `hs_teacher`, `HSS_Teachers` → `hss_teacher`.

`syncRoleFromTeacherSheet(sheetName, role)` runs `reconcileRole(usersSheet, role, desired)` for the principal set and for that sheet's teacher rows. Each `reconcileRole` pass, scoped to one role:

- email desired but not in Users → append with that role (name from col A, `added_date` = today)
- existing row of that role whose name changed → update the name
- that role's email no longer desired → delete that Users row

Rows of other roles are never touched, and an email already held by a user of a different role is left alone (no duplicate). Because these rows are fully managed here, **add/remove teachers/principals in `HS_Teachers` / `HSS_Teachers`, not directly in `Users`** (manual rows of those roles get pruned on the next sync).

The sync runs from a single **installable on-edit trigger** (`onTeachersEdit`, which re-syncs whichever of the two tabs was edited — see `TEACHER_SOURCES`). One-time setup, run each once from the Apps Script editor: `syncAllTeachers()` (initial backfill of both) then `createTeachersSyncTrigger()` (installs the trigger; safe to re-run, and it also clears the older `onHsTeachersEdit` trigger). There is no frontend/endpoint involvement — it is pure sheet-side automation.

### HS_Teachers → Google Group sync (separate standalone script)

A second, **independent** automation lives in `group-sync.gs` (repo root) — **not** part of the Web App `Code.gs`. It mirrors ranges of the `HS_Teachers` and `HSS_Teachers` tabs into **Google Groups** via the **AdminDirectory** advanced service, driven by a `SHEET_CONFIGS` list (one config per sheet, each with its own `mappings` of range → group email):

- `HS_Teachers`: `F2:G18` → master `bhss-hs-teachers@baptisthss.in`, plus one per-subject group per row (`F3:G3` … `F18:G18`).
- `HSS_Teachers`: `F2:G43` → master `bhss-hss-teachers@baptisthss.in`, plus one per-subject group per row (`F3:G3` … `F43:G43`).
- **Cross-mappings:** HS `F2:G2` is also mapped to the HSS master, and HSS `F2:G2` to the HS master — so each sheet's row 2 feeds *both* masters. A group can therefore be fed by several ranges (even across sheets): `collectGroupSources()` builds a `group → [{sheet,range}]` map and `syncGroupMembers(sources, group)` unions all of a group's ranges **before** the add/remove diff. This single authoritative pass per group is essential — running the two ranges as separate authoritative syncs would make each delete the other's members.

On edit, `onRangeEdit` finds the groups whose ranges (on the edited sheet) overlap the edit, then re-syncs each of those groups from the union of *all* its sources (across both sheets). So editing a teacher row updates its subject group and its own master, and editing row 2 also updates the other school's master. Ranges are **fixed A1 strings**; extend a sheet's `mappings` (and widen its master range) if teachers are added past the last row. Any `@`-bearing cell in a mapped range counts as a member; managers/owners and `PROTECTED_EMAILS` are never auto-removed. A single on-edit trigger covers both sheets (same workbook). Pasted into the workbook's Apps Script (own file or own project), it requires a **Workspace admin** + the **Admin SDK API** enabled, and is set up by running `manualSync()` (both sheets) then `installTrigger()`. It shares no code with `Code.gs` and needs no Web App redeploy — both simply read the teacher tabs and write to different destinations (`Users` sheet vs. the Groups).

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
4. Add a way to reach it: either a navbar link (`<a href="#/foo" data-nav="foo" data-roles="admin,hs_teacher" class="nav-link ...">Foo</a>`) or, more commonly for teacher tools, a button on the relevant role homepage (`#page-hs-home` / `#page-hss-home`).
5. *(If you added a navbar link that should highlight on child routes)* Add to the `map` in `router.js#updateNavActive`.

### Adding a New GAS Endpoint

1. Add a `case 'actionName': return sendJson(handleActionName(e.parameter));` in `doGet` or `doPost` in `Code.gs`
2. Implement `handleActionName(params)` — call `requireRole(params.token, ['admin'])` at the top for protected endpoints
3. Add a corresponding async function to `api.js` that calls `get('actionName', {...})` or `post('actionName', {...})`
4. Redeploy as a new version (same URL is preserved)

## Key Constraints

- **No `innerHTML` with unescaped data** — always use `Utils.escapeHtml()` (aliased as `esc` in `pages.js`) when rendering sheet data into HTML strings.
- **GAS URL stability** — the `GAS_URL` in `js/config.js` must not change after initial setup (teachers bookmark the site). Always use "new version" on the existing deployment, never create a new deployment.
- **Role values** — the only valid roles are `admin`, `hs_teacher`, `hss_teacher`, and `principal` (lowercase). The `Users` sheet and all role checks use these exact strings. The former single `teacher` role was split; backend endpoints treat `hs_teacher`/`hss_teacher`/`principal` as the same data-access level (no per-school server isolation), while the frontend routes each to its own homepage. `principal` has teacher-level access to **both** schools and lands on `#/principal-home` (HS View / HSS View buttons); it is sourced from F2 of each teacher sheet (see the auto-sync above).
- **Roll numbers** — must be unique across both `HS_Students` and `HSS_Students` sheets. `findStudentByRoll` searches HS first, then HSS, and returns the first match.
- **Public results are OTP-gated (3-step flow)** — there is intentionally no endpoint that returns a result from a roll number alone (the old public `lookupStudent` was removed). The homepage flow is:
  1. `validateStudent` (POST, public) — verifies roll + class + section + stream against the record. Sends **no email**; returns only a masked email hint (`maskEmailHint`: first character + the two characters before the `@`, with only the middle of the local part masked and the domain shown, e.g. `r•••••ar@gmail.com`) so the student can confirm which address to type.
  2. `requestResultOtp` (POST, public) — re-verifies the same details **and** requires the student to enter the full registered email (case-insensitive match). Only on a match does it email a 6-digit code via `MailApp`. Requiring the full email before any send is the anti-abuse gate: it stops anyone from draining the daily email quota by spamming requests on guessed roll/class/section combos.
  3. `verifyResultOtp` (POST, public) — checks the code, then returns `buildStudentResult`.

  `matchStudentIdentity(rollNo, cls, section, stream)` is the shared identity check used by steps 1 and 2. OTP state lives in `CacheService`: 6-digit code, 5-minute expiry (360s TTL), max 5 verify attempts. Per-roll send rate-limit: 60s minimum between sends, max 3 sends per 15-minute window (900s TTL on the rate-limit key `rotp_rl_<rollNo>`). After exhausting all 3 sends the wait is up to 15 minutes. Identity mismatches return a generic error — never reveal which field or whether the roll exists; an email mismatch returns a specific "does not match" message (the hint already exposes part of the address, and a clear message helps legitimate students fix typos). `getLookupOptions` (public GET) returns only the non-sensitive class/section/stream lists for the dropdowns.
