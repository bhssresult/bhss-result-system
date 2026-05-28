/**
 * Google OAuth integration + authentication state.
 *
 * Uses Google Identity Services (GIS) - the official client library
 * loaded from accounts.google.com/gsi/client in index.html.
 */

const Auth = (() => {

  const STORAGE_KEY = 'srs_session';
  const INACTIVITY_MS = 30 * 60 * 1000; // auto sign-out after 30 min idle
  let state = { user: null, role: null, token: null };
  const listeners = [];

  let logoutTimer = null;
  let tokenExpMs = null;     // absolute time (ms) the JWT expires
  let lastReschedule = 0;    // throttle activity-driven reschedules

  function loadFromStorage() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user && parsed.role && parsed.token) {
        state = parsed;
      }
    } catch (e) { /* ignore */ }
  }

  function saveToStorage() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function clearStorage() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Read the `exp` claim (seconds since epoch) from a Google ID token JWT.
  function decodeTokenExp(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(part));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (e) { return null; }
  }

  // Schedule an automatic sign-out at the earlier of: 30 min of inactivity,
  // or the moment the Google token actually expires (so the backend never
  // sees a stale token and returns "Invalid token").
  function scheduleAutoLogout() {
    clearTimeout(logoutTimer);
    if (!state.token) return;
    const now = Date.now();
    let fireAt = now + INACTIVITY_MS;
    if (tokenExpMs && tokenExpMs < fireAt) fireAt = tokenExpMs;
    logoutTimer = setTimeout(function () {
      logout('Your session expired. Please sign in again.');
    }, Math.max(0, fireAt - now));
  }

  function onActivity() {
    if (!state.user) return;
    const now = Date.now();
    if (now - lastReschedule < 5000) return; // reschedule at most once / 5s
    lastReschedule = now;
    scheduleAutoLogout();
  }

  // When the tab regains focus (e.g. laptop woke from sleep), the scheduled
  // timer may not have fired yet — sign out immediately if already expired.
  function onVisible() {
    if (document.visibilityState !== 'visible' || !state.user) return;
    if (tokenExpMs && Date.now() >= tokenExpMs) {
      logout('Your session expired. Please sign in again.');
    }
  }

  function getState() {
    return state;
  }

  function isLoggedIn() {
    return !!state.user;
  }

  function getRole() {
    return state.role;
  }

  function getToken() {
    return state.token;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach(fn => { try { fn(state); } catch (e) {} });
  }

  /**
   * Render either the Google Sign-In button (if not logged in)
   * or the user info + logout button (if logged in).
   */
  function renderAuthUI() {
    const signinBar = document.getElementById('signin-bar');
    const userInfo  = document.getElementById('user-info');
    const userName  = document.getElementById('user-name');
    const userRole  = document.getElementById('user-role');

    if (state.user) {
      if (signinBar) signinBar.classList.add('hidden');
      userInfo.classList.remove('hidden');
      userInfo.classList.add('flex');
      userName.textContent = state.user.name || state.user.email;
      userRole.textContent = state.role || '';
    } else {
      if (signinBar) signinBar.classList.remove('hidden');
      userInfo.classList.add('hidden');
      userInfo.classList.remove('flex');
      userName.textContent = '';
      userRole.textContent = '';
      tryRenderGoogleButton();
    }
  }

  /**
   * Initialize Google Identity Services and render the Sign-In button.
   * Called once on page load.
   */
  function init() {
    loadFromStorage();

    document.getElementById('logout-btn').addEventListener('click', function () { logout(); });

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function (evt) {
      window.addEventListener(evt, onActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisible);

    // If a stored session's token has already expired, drop it on load.
    if (state.token) {
      tokenExpMs = decodeTokenExp(state.token);
      if (tokenExpMs && Date.now() >= tokenExpMs) {
        logout('Your session expired. Please sign in again.');
        return;
      }
      scheduleAutoLogout();
    }

    // GIS might not be loaded yet; renderAuthUI will retry.
    renderAuthUI();
    notify();
  }

  function tryRenderGoogleButton() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      // GIS not yet loaded - retry shortly
      setTimeout(tryRenderGoogleButton, 200);
      return;
    }
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.indexOf('PASTE-YOUR-CLIENT-ID') !== -1) {
      const el = document.getElementById('google-signin-btn');
      el.innerHTML = '<span class="text-xs bg-red-600 text-white px-2 py-1 rounded">Configure Client ID</span>';
      return;
    }
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      const el = document.getElementById('google-signin-btn');
      el.innerHTML = '';
      google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'filled_white',
        size: 'medium',
        text: 'signin_with',
        shape: 'rectangular'
      });
    } catch (e) {
      console.error('Google sign-in init failed:', e);
    }
  }

  /**
   * Callback from Google after a successful sign-in. Sends the credential
   * to GAS for verification + role lookup.
   */
  async function handleCredentialResponse(response) {
    if (!response || !response.credential) return;
    const token = response.credential;
    Utils.showLoading(true);
    try {
      const data = await Api.verifyUser(token);
      state = {
        user:  { email: data.email, name: data.name },
        role:  data.role,
        token: token
      };
      saveToStorage();
      tokenExpMs = decodeTokenExp(token);
      scheduleAutoLogout();
      renderAuthUI();
      notify();
      Utils.showToast('Signed in as ' + data.name, 'success');
    } catch (err) {
      console.error('Verify user failed:', err);
      Utils.showToast(err.message || 'Sign-in failed', 'error');
      logout();
    } finally {
      Utils.showLoading(false);
    }
  }

  function logout(reason) {
    clearTimeout(logoutTimer);
    tokenExpMs = null;
    state = { user: null, role: null, token: null };
    clearStorage();
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    }
    renderAuthUI();
    notify();
    if (location.hash !== '#/home' && location.hash !== '') {
      location.hash = '#/home';
    }
    if (reason && Utils && Utils.showToast) {
      Utils.showToast(reason, 'warn');
    }
  }

  return {
    init,
    isLoggedIn,
    getRole,
    getToken,
    getState,
    onChange,
    logout
  };
})();
