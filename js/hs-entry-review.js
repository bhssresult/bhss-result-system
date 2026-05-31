/**
 * HS Entry Review — in-app 3-step wizard (Term → Name → Class & Section).
 *
 * A near-clone of HsMarksEntry, but the destination is keyed only by
 * "term|class_section" (read from the `HS_Review_Links` sheet, columns:
 * term, class_section, url) via the `getHsReviewLinks` GAS endpoint. The Name
 * dropdown is intentionally kept (for future use) but is NOT part of the key,
 * so it does not affect which review sheet opens.
 *
 * Exposes:
 *   HsEntryReview.init()      — attach listeners once (called from app.js)
 *   HsEntryReview.activate()  — load links from the sheet + reset the wizard
 *                               (called by router.js on navigation to the page)
 */
const HsEntryReview = (() => {

  // Populated from the HS_Review_Links sheet by load().
  // Keys: "term|class-section" (e.g. "firstterm|IX-A") — name is excluded.
  let URL_MAP = {};
  let loaded = false;
  let loading = false;

  // ─── DOM HELPERS ──────────────────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }

  function setDot(n, state) {
    const el = $id("hsr-dot" + n);
    if (el) el.className =
      "step-dot" + (state === "active" ? " active" : state === "done" ? " done" : "");
  }

  function resetFrom(step) {
    if (step <= 2) {
      $id("hsr-dd-name").value = "";
      $id("hsr-dd-name").disabled = true;
      setDot(2, "pending");
    }
    if (step <= 3) {
      $id("hsr-dd-classsection").value = "";
      $id("hsr-dd-classsection").disabled = true;
      setDot(3, "pending");
    }
    $id("hsr-btn-go").disabled = true;
    $id("hsr-url-preview").classList.add("hidden");
    $id("hsr-error-msg").classList.add("hidden");
  }

  // Key by term + class-section only. Name is deliberately excluded.
  function buildKey() {
    return [
      $id("hsr-dd-term").value,
      $id("hsr-dd-classsection").value,
    ].join("|");
  }

  // Human-readable summary of the destination, using the visible option
  // labels. Name is omitted since it is not part of the mapping key,
  // e.g. "First Mid Term | Class IX A".
  function selectionLabel() {
    function labelOf(id) {
      const sel = $id(id);
      return sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : "";
    }
    return [labelOf("hsr-dd-term"), labelOf("hsr-dd-classsection")].join(" | ");
  }

  // ─── EVENT HANDLERS ───────────────────────────────────────────────────────
  function onTermChange() {
    const term = $id("hsr-dd-term").value;
    resetFrom(2);
    if (term) {
      $id("hsr-dd-name").disabled = false;
      setDot(1, "done");
      setDot(2, "active");
    } else {
      setDot(1, "active");
    }
  }

  function onNameChange() {
    const name = $id("hsr-dd-name").value;
    resetFrom(3);
    if (name) {
      $id("hsr-dd-classsection").disabled = false;
      setDot(2, "done");
      setDot(3, "active");
    } else {
      setDot(2, "active");
    }
  }

  function updateButton() {
    const cs = $id("hsr-dd-classsection").value;
    const errEl = $id("hsr-error-msg");
    if (!cs) { setDot(3, "active"); return; }

    const url = URL_MAP[buildKey()];

    setDot(3, "done");
    errEl.classList.add("hidden");

    if (url) {
      $id("hsr-btn-go").disabled = false;
      $id("hsr-url-preview-text").textContent = selectionLabel();
      $id("hsr-url-preview").classList.remove("hidden");
    } else {
      $id("hsr-btn-go").disabled = true;
      $id("hsr-url-preview").classList.add("hidden");
      errEl.textContent = "⚠ No review sheet configured for this combination yet.";
      errEl.classList.remove("hidden");
    }
  }

  function goToPage() {
    const url = URL_MAP[buildKey()];
    if (url) {
      $id("hsr-error-msg").classList.add("hidden");
      window.location.href = url;
    } else {
      const errEl = $id("hsr-error-msg");
      errEl.textContent = "⚠ Please complete all three selections before continuing.";
      errEl.classList.remove("hidden");
    }
  }

  // ─── DATA ───────────────────────────────────────────────────────────────────
  // Fetch the term|class-section → URL map from the HS_Review_Links sheet (once
  // per session). On failure, leaves URL_MAP empty and surfaces a toast.
  async function load() {
    if (loaded || loading) return;
    loading = true;
    try {
      const data = await Api.getHsReviewLinks(Auth.getToken());
      URL_MAP = (data && data.links) || {};
      loaded = true;
    } catch (err) {
      Utils.showToast(err.message || "Could not load review sheet links", "error");
    } finally {
      loading = false;
    }
  }

  // ─── INIT / RESET / ACTIVATE ──────────────────────────────────────────────
  // Reset the wizard back to step 1.
  function reset() {
    const term = $id("hsr-dd-term");
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
    const term = $id("hsr-dd-term");
    if (!term) return;
    term.addEventListener("change", onTermChange);
    $id("hsr-dd-name").addEventListener("change", onNameChange);
    $id("hsr-dd-classsection").addEventListener("change", updateButton);
    $id("hsr-btn-go").addEventListener("click", goToPage);
    wired = true;
    reset();
  }

  return { init, reset, activate };
})();
