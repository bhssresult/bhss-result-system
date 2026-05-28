# BHSS Result System

A school result management dashboard that runs on **GitHub Pages** and stores its data in a **Google Sheet**. No build tools, no server hosting, no Node.js — just static files and a Google Apps Script.

## What's Inside

| File | What it does |
|---|---|
| `index.html` | The main page (everything is here as hidden sections) |
| `style.css` | Print styles + small overrides |
| `js/config.js` | **The only file you must edit** (paste 2 values) |
| `js/utils.js` | Grade & division calculations |
| `js/api.js` | Calls to your Google Apps Script |
| `js/auth.js` | Google sign-in / sign-out |
| `js/pages.js` | All page content rendering |
| `js/router.js` | Tab routing + role-based access |
| `js/app.js` | Starts everything up |
| `Code.gs` | The backend (paste into Apps Script editor) |

## Features

- **Public student result lookup (3 steps)** — (1) a student enters roll number + class + section (+ stream for 11/12); the details are checked against their record. (2) They then type the email address registered for that student (a masked hint of it is shown to help). (3) Only when the email matches is a one-time code emailed; the result is shown after the code is confirmed. Requiring the full email before any send prevents anyone from draining the daily email quota by spamming requests. No account needed.
- **Google OAuth login** — for teachers and admins
- **HS Results / HSS Results** — three actions per class:
  - Marks Entry → opens your Google Form
  - Marks Entry Review → view what was entered
  - Result Preview → see computed results with print support
- **Admin panel** — manage users, exam config (subjects/max/pass marks), and Google Form URLs
- **Print** — clean print layout for result cards

---

## Setup Steps (for a non-technical user)

You'll do four things, in this order:
1. Create the Google Sheet (5 min)
2. Set up the Apps Script backend (5 min)
3. Create a Google OAuth Client ID (10 min)
4. Upload files to GitHub Pages (5 min)

Total: about 30 minutes for the first time. Updates after that take less than a minute.

---

### Step 1 — Create the Google Sheet

1. Open <https://sheets.google.com> with your school Google account
2. Create a blank sheet → rename it: **"BHSS Result System Database"**
3. Create these **8 tabs** at the bottom (right-click the tab → Rename):
   - `Users`
   - `HS_Students`
   - `HSS_Students`
   - `HS_Marks`
   - `HSS_Marks`
   - `ExamConfig`
   - `Links`
   - `HS_Links`

4. Add the **header row** for each tab (first row, exactly as written):

**`Users`** (row 1):
```
email | name | role | added_date
```

**`HS_Students`** (row 1) — `email` is where the result one-time code is sent:
```
roll_no | name | class | section | email
```

**`HSS_Students`** (row 1):
```
roll_no | name | class | section | stream | email
```

**`HS_Marks`** (row 1) — list `roll_no`, `class`, then one column for each subject (must match the subject names you'll put in `ExamConfig`):
```
roll_no | class | Nepali | English | Math | Science | Social
```

**`HSS_Marks`** (row 1):
```
roll_no | class | stream | Nepali | English | Physics | Chemistry | Math
```

**`ExamConfig`** (row 1):
```
key | value | updated_date
```
Then fill in these starter rows (column A and B):

| key | value |
|---|---|
| school_name | Your School Name |
| exam_name | First Terminal Examination |
| exam_date | 2026-03-15 |
| sections | A,B,C |
| hs_classes | 9,10 |
| hs_subjects | Nepali,English,Math,Science,Social |
| hs_max_marks | 100,100,100,100,100 |
| hs_pass_marks | 32,32,40,32,32 |
| hss_classes | 11,12 |
| hss_subjects_science | Nepali,English,Physics,Chemistry,Math |
| hss_max_marks_science | 100,100,75,75,100 |
| hss_pass_marks_science | 32,32,27,27,40 |
| hss_subjects_arts | Nepali,English,Economics,History,Civics |
| hss_max_marks_arts | 100,100,100,100,100 |
| hss_pass_marks_arts | 32,32,32,32,32 |

**`Links`** (row 1):
```
school | class | form_url | updated_date
```

**`HS_Links`** (row 1) — destination spreadsheet URLs for the HS Marks Entry wizard:
```
term | name | class_section | url
```
The `term`, `name`, and `class_section` values must match the dropdown options on the HS Marks Entry page (e.g. `firstterm`, `madampuii`, `IX-A`). To populate this quickly, open **`HS_Links-seed.tsv`** (in the project folder), select all, copy, and paste into cell **A1** of this tab. It fills in the header plus **every** term/teacher/class combination — First Mid Term already has its real links, and the other terms have a **blank `url` cell** ready for you to fill in. When a new term's entry sheet is ready, just paste its link into that row's `url` cell (no need to add rows). A blank `url` simply means the wizard shows "not configured yet" for that combination. (You can delete `HS_Links-seed.tsv` after pasting.)

5. Add yourself as the first admin in `Users`:
```
your-email@gmail.com | Your Name | admin | 2026-05-27
```

6. Add 2–3 sample students to `HS_Students` for testing. Set `email` to an address you can check (use your own for the test rows so you receive the code):
```
901 | Ram Kumar | 9 | A | you@example.com
902 | Sita Devi | 9 | A | you@example.com
1001 | Hari Lal | 10 | B | you@example.com
```

7. Add matching marks to `HS_Marks`:
```
901 | 9 | 75 | 82 | 60 | 90 | 70
902 | 9 | 88 | 71 | 95 | 66 | 84
1001 | 10 | 50 | 60 | 70 | 80 | 90
```

---

### Step 2 — Set Up the Apps Script Backend

1. With your sheet open, click **Extensions → Apps Script**
2. A new tab opens with a code editor. Delete the existing `function myFunction()` placeholder.
3. Open `Code.gs` from this project folder, copy **all** of its contents, paste into the Apps Script editor.
4. Click the **save icon** (or `Ctrl+S`). Name the project "BHSS Result System".
5. Click **Deploy → New deployment**
6. Click the **gear icon** next to "Select type" → choose **Web app**
7. Fill in:
   - **Description:** `BHSS Result System v1`
   - **Execute as:** **Me** (your school Google account)
   - **Who has access:** **Anyone**
8. Click **Deploy**
9. Click **Authorize access** → choose your Google account → click **Advanced → Go to (unsafe)** if you see a warning (this is normal for your own scripts) → **Allow**
10. After deploying, you'll see a **Web App URL** that looks like:
    ```
    https://script.google.com/macros/s/AKfycb.../exec
    ```
11. **Copy this URL** — you'll paste it into `js/config.js` in Step 4.

> **Updating later:** When you edit `Code.gs`, go to **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. This keeps the same URL.

**Quick test:** Paste this in your browser (replace the URL with yours):
```
https://script.google.com/macros/s/.../exec?action=getLookupOptions
```
You should see JSON with your class/section/stream options. If yes, the backend is working.

> **Note:** results are no longer returned by roll number alone — there is no public endpoint that does that. The result is only released after the emailed one-time code is confirmed (see the result flow in the Features section).

---

### Step 3 — Create a Google OAuth Client ID

This lets teachers and admins sign in with their Google accounts.

1. Open <https://console.cloud.google.com> with your school Google account
2. Click the project dropdown (top-left) → **New Project**
   - Name: `BHSS Result System`
   - Click **Create**
3. Wait ~20 seconds, then make sure the new project is selected in the dropdown
4. Go to **APIs & Services → OAuth consent screen**
5. Choose **External** → **Create**
6. Fill the form:
   - App name: `BHSS Result System`
   - User support email: your school email
   - Developer contact email: your school email
   - Leave everything else default → **Save and Continue**
7. **Scopes:** click **Add or Remove Scopes**
   - Find and tick: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - Click **Update** → **Save and Continue**
8. **Test users:** click **Add users** → add the email of every teacher/admin who needs access → **Save and Continue**
9. Click **Back to Dashboard**
10. Go to **APIs & Services → Credentials**
11. Click **+ Create Credentials → OAuth client ID**
12. **Application type:** Web application
13. **Name:** `BHSS Result System Web Client`
14. Under **Authorized JavaScript origins**, click **Add URI** and add:
    - `https://YOURUSERNAME.github.io` (replace `YOURUSERNAME` with your GitHub username)
    - `http://localhost:8000` (optional, for testing locally)
15. Leave **Authorized redirect URIs** empty (not needed)
16. Click **Create**
17. A popup shows your **Client ID** — something like `123456789-abcdef.apps.googleusercontent.com`
18. **Copy the Client ID** — paste into `js/config.js`.

---

### Step 4 — Configure and Upload to GitHub Pages

1. **Edit `js/config.js`** in this project folder:
   ```javascript
   const GOOGLE_CLIENT_ID = "PASTE-YOUR-CLIENT-ID-HERE.apps.googleusercontent.com";
   const GAS_URL = "https://script.google.com/macros/s/PASTE-DEPLOYMENT-ID/exec";
   ```
   Replace both values with what you copied in Steps 2 and 3.

2. **Create a GitHub account** at <https://github.com> if you don't have one yet.

3. **Create a new repository:**
   - Click **+ → New repository** (top right)
   - Repository name: `bhss-result-system` (use exactly this name — lowercase, no spaces)
   - Set to **Public**
   - Tick **Add a README file**
   - Click **Create repository**

4. **Upload your files:**
   - On the repository page, click **Add file → Upload files**
   - Drag the **entire contents** of your project folder (NOT the folder itself — drag what's inside it):
     - `index.html`, `style.css`, `Code.gs`, `README.md`
     - The whole `js/` folder
   - Scroll down → **Commit changes**

5. **Turn on GitHub Pages:**
   - Click **Settings** (top of repo) → **Pages** (left sidebar)
   - Under **Source**, select **Deploy from a branch**
   - Branch: `main`, Folder: `/ (root)` → **Save**

6. Wait about a minute. Your site is live at:
   ```
   https://YOURUSERNAME.github.io/bhss-result-system/
   ```

7. **Verify the OAuth origin** matches:
   - Go back to Google Cloud Console → Credentials → click your OAuth client
   - Confirm `https://YOURUSERNAME.github.io` is in **Authorized JavaScript origins**
   - If it's wrong, fix it and click **Save**. Wait ~5 minutes for the change to propagate.

---

## Testing the Live Site

1. Open `https://YOURUSERNAME.github.io/bhss-result-system/`
2. **Home tab** — enter roll `901`, Class `9`, Section `A` → **Continue** → a masked hint of the registered email appears; type that student's full email → **Send code** → check the inbox → enter the 6-digit code → **Verify & View Result** → result card appears. (Wrong class/section is rejected with a generic message; a wrong email is rejected too — in both cases **no code is sent**.)
3. **Sign In** (top right) — use the email you added to the `Users` sheet as admin
4. After sign-in, you should see all 4 tabs: Home, Admin, HS Results, HSS Results
5. **Admin tab** — try adding a user, editing exam config, setting Google Form URLs
6. **HS Results tab** — pick a class → try the three buttons
7. **Result Preview** — click 🖨️ Print All → check the print preview looks clean

---

## Updating the Site Later

- **Change frontend code:** Upload changed files via the GitHub web UI (Add file → Upload). Changes go live in about a minute.
- **Change backend code (`Code.gs`):** Paste new code in Apps Script editor → Deploy → Manage deployments → pencil icon → Version: New version → Deploy. The URL stays the same so `config.js` doesn't need updates.
- **Add a new teacher/admin:** Sign in as admin → Admin tab → User Management → add their email. They must also be added in Google Cloud Console → OAuth consent screen → Test users (while the OAuth app is in Testing mode).

---

## Troubleshooting

**"GAS_URL is not configured" toast appears**
You forgot to edit `js/config.js`. Open it, replace both placeholder values, re-upload.

**Sign-in popup appears but then says "User not registered"**
Your email isn't in the `Users` sheet. Sign in as another admin and add it, or edit the sheet directly.

**"Insufficient permissions" when clicking Admin tab**
Your role in the `Users` sheet is `teacher`, not `admin`. Change it in the sheet.

**Sign-in button does not appear**
The Client ID in `js/config.js` is wrong or the GitHub Pages URL isn't in your OAuth client's **Authorized JavaScript origins**.

**Result Preview prints the whole page**
Use **Print All** button in the Result Preview, not the browser print menu directly from a non-preview page. Or check that `style.css` is loading correctly.

**"This app isn't verified" warning during sign-in**
Normal while your OAuth app is in Testing mode. As long as your email is in **Test users**, click Advanced → Continue. To remove the warning, publish the app in OAuth consent screen, but for a school system staying in Testing mode is fine.

---

## Security Notes

- Role checks are enforced **server-side** in `Code.gs` via Google's `tokeninfo` API — frontend tab hiding is cosmetic only.
- The Google Client ID is public by design (it's in your HTML) — security comes from the **Authorized JavaScript origins** restriction.
- The GAS Web App URL is reachable by anyone, but every protected endpoint requires a valid Google ID token + an email present in the `Users` sheet.
- Tokens are stored in `sessionStorage`, which is cleared when the browser tab closes.
- All values from the sheet are escaped before rendering (no XSS via student names).
- **Result access is OTP-gated (3 steps).** A result is only returned after a one-time code is confirmed. First the roll/class/section/stream details must match the record (mismatch → generic message, no leak, no code sent). Then the student must type the **full registered email** — no code is sent unless it matches the address on file. This email-match gate is the main protection against quota-draining spam, since an attacker can't trigger emails just by guessing roll/class/section. Codes expire in 5 minutes, allow 5 verify attempts, and sends are rate-limited per roll (60s between sends, max 3 per 15 min) via `CacheService`.
- **Email sending:** the script sends codes with `MailApp` as the deploying account, so when you authorize the deployment you'll grant a "send email as you" permission. Daily send limits apply — about **100 emails/day on a consumer @gmail.com** account and **~1500/day on Google Workspace**. If a result day could exceed that, deploy under a Workspace account.

---

## File Layout

```
bhss-result-system/
├── index.html
├── style.css
├── js/
│   ├── config.js
│   ├── utils.js
│   ├── api.js
│   ├── auth.js
│   ├── pages.js
│   ├── router.js
│   └── app.js
├── Code.gs
└── README.md
```
