/**
 * HS Marks Entry — in-app 3-step wizard (Term → Teacher → Class & Section).
 *
 * The Term / Teacher / Class options are fixed in index.html. The actual
 * destination URLs are maintained in the Google Sheet `HS_Links` tab
 * (columns: term, name, class_section, url) and fetched at runtime via the
 * `getHsLinks` GAS endpoint — so links can be updated in the spreadsheet
 * without editing any code or redeploying.
 *
 * Exposes:
 *   HsMarksEntry.init()      — attach listeners once (called from app.js)
 *   HsMarksEntry.activate()  — load links from the sheet + reset the wizard
 *                              (called by router.js on navigation to the page)
 */
const HsMarksEntry = (() => {

  // Populated from the HS_Links sheet by load().
  // Keys: "term|name|class-section" (e.g. "firstterm|madampuii|IX-A").
  let URL_MAP = {};
  let loaded = false;
  let loading = false;

  // ─── DOM HELPERS ──────────────────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }

  function setDot(n, state) {
    const el = $id("hs-dot" + n);
    if (el) el.className =
      "step-dot" + (state === "active" ? " active" : state === "done" ? " done" : "");
  }

  function resetFrom(step) {
    if (step <= 2) {
      $id("hs-dd-name").value = "";
      $id("hs-dd-name").disabled = true;
      setDot(2, "pending");
    }
    if (step <= 3) {
      $id("hs-dd-classsection").value = "";
      $id("hs-dd-classsection").disabled = true;
      setDot(3, "pending");
    }
    $id("hs-btn-go").disabled = true;
    $id("hs-url-preview").classList.add("hidden");
    $id("hs-error-msg").classList.add("hidden");
  }

  function buildKey() {
    return [
      $id("hs-dd-term").value,
      $id("hs-dd-name").value,
      $id("hs-dd-classsection").value,
    ].join("|");
  }

  // ─── EVENT HANDLERS ───────────────────────────────────────────────────────
  function onTermChange() {
    const term = $id("hs-dd-term").value;
    resetFrom(2);
    if (term) {
      $id("hs-dd-name").disabled = false;
      setDot(1, "done");
      setDot(2, "active");
    } else {
      setDot(1, "active");
    }
  }

  function onNameChange() {
    const name = $id("hs-dd-name").value;
    resetFrom(3);
    if (name) {
      $id("hs-dd-classsection").disabled = false;
      setDot(2, "done");
      setDot(3, "active");
    } else {
      setDot(2, "active");
    }
  }

  function updateButton() {
    const cs = $id("hs-dd-classsection").value;
    const errEl = $id("hs-error-msg");
    if (!cs) { setDot(3, "active"); return; }

    const url = URL_MAP[buildKey()];

    setDot(3, "done");
    errEl.classList.add("hidden");

    if (url) {
      $id("hs-btn-go").disabled = false;
      $id("hs-url-preview-text").textContent = url;
      $id("hs-url-preview").classList.remove("hidden");
    } else {
      $id("hs-btn-go").disabled = true;
      $id("hs-url-preview").classList.add("hidden");
      errEl.textContent = "⚠ No entry sheet configured for this combination yet.";
      errEl.classList.remove("hidden");
    }
  }

  function goToPage() {
    const url = URL_MAP[buildKey()];
    if (url) {
      $id("hs-error-msg").classList.add("hidden");
      window.location.href = url;
    } else {
      const errEl = $id("hs-error-msg");
      errEl.textContent = "⚠ Please complete all three selections before continuing.";
      errEl.classList.remove("hidden");
    }
  }

  // ─── DATA ───────────────────────────────────────────────────────────────────
  // Fetch the term|name|class-section → URL map from the HS_Links sheet (once
  // per session). On failure, leaves URL_MAP empty and surfaces a toast.
  async function load() {
    if (loaded || loading) return;
    loading = true;
    try {
      const data = await Api.getHsLinks(Auth.getToken());
      URL_MAP = (data && data.links) || {};
      loaded = true;
    } catch (err) {
      Utils.showToast(err.message || "Could not load entry sheet links", "error");
    } finally {
      loading = false;
    }
  }

  // ─── INIT / RESET / ACTIVATE ──────────────────────────────────────────────
  // Reset the wizard back to step 1.
  function reset() {
    const term = $id("hs-dd-term");
    if (!term) return;
    term.value = "";
    resetFrom(2);
    setDot(1, "active");
  }

  // Called by the router each time the page is shown: reset the wizard, then
  // make sure the links are loaded (first visit shows the loading overlay).
  async function activate() {
    reset();
    if (loaded) return;
    Utils.showLoading(true);
    try {
      await load();
    } finally {
      Utils.showLoading(false);
    }
  }

  // Attach listeners once. The section lives in the DOM from page load (hidden),
  // so this is safe to call at startup.
  let wired = false;
  function init() {
    if (wired) return;
    const term = $id("hs-dd-term");
    if (!term) return;
    term.addEventListener("change", onTermChange);
    $id("hs-dd-name").addEventListener("change", onNameChange);
    $id("hs-dd-classsection").addEventListener("change", updateButton);
    $id("hs-btn-go").addEventListener("click", goToPage);
    wired = true;
    reset();
  }

  return { init, reset, activate };
})();
