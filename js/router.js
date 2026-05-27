/**
 * Hash-based router.
 *
 * Routes:
 *   #/home
 *   #/admin
 *   #/hs-marks-entry
 *   #/hs-entry-review
 *   #/hs-results-preview
 *   #/hss-results
 *   #/hss-marks-review?class=11
 *   #/hss-result-preview?class=11
 *   #/access-denied
 */

const Router = (() => {

  const routes = {
    'home':               { section: 'page-home',                roles: null },
    'admin':              { section: 'page-admin',               roles: ['admin'] },
    'hs-marks-entry':     { section: 'page-hs-marks-entry',      roles: ['admin', 'teacher'] },
    'hs-entry-review':    { section: 'page-hs-entry-review',     roles: ['admin', 'teacher'] },
    'hs-results-preview': { section: 'page-hs-results-preview',  roles: ['admin', 'teacher'] },
    'hss-results':        { section: 'page-hss-results',         roles: ['admin', 'teacher'] },
    'hss-marks-review':   { section: 'page-marks-review',        roles: ['admin', 'teacher'] },
    'hss-result-preview': { section: 'page-result-preview',      roles: ['admin', 'teacher'] },
    'access-denied':      { section: 'page-access-denied',       roles: null },
    'not-found':          { section: 'page-not-found',           roles: null }
  };

  function parseHash() {
    const raw = (location.hash || '#/home').replace(/^#\/?/, '');
    const [path, queryStr] = raw.split('?');
    const params = {};
    if (queryStr) {
      queryStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path: path || 'home', params };
  }

  function hideAllPages() {
    document.querySelectorAll('main .page').forEach(el => el.classList.add('hidden'));
  }

  function showPage(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) el.classList.remove('hidden');
  }

  function updateNavActive(path) {
    const links = document.querySelectorAll('[data-nav]');
    const map = {
      'home': 'home',
      'admin': 'admin',
      'hs-marks-entry': 'hs-results',
      'hs-entry-review': 'hs-results',
      'hs-results-preview': 'hs-results',
      'hss-results': 'hss-results',
      'hss-marks-review': 'hss-results',
      'hss-result-preview': 'hss-results'
    };
    const activeKey = map[path] || 'home';
    links.forEach(a => {
      if (a.dataset.nav === activeKey) a.classList.add('active');
      else a.classList.remove('active');
    });
  }

  function updateNavVisibility() {
    const role = Auth.getRole();
    // Targets both <a class="nav-link" data-roles=...> and dropdown wrappers <div data-dropdown data-roles=...>
    document.querySelectorAll('nav [data-roles]').forEach(el => {
      const allowed = el.dataset.roles.split(',');
      const allowed2 = role && allowed.indexOf(role) !== -1;
      // Dropdown wrappers use the `hidden` attribute; nav-link <a>s use the Tailwind class.
      if (el.hasAttribute('data-dropdown')) {
        if (allowed2) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      } else {
        if (allowed2) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    });
  }

  async function handleRoute() {
    const { path, params } = parseHash();
    const route = routes[path];

    if (!route) {
      hideAllPages();
      showPage('page-not-found');
      updateNavActive(path);
      return;
    }

    // Role check
    if (route.roles) {
      const role = Auth.getRole();
      if (!Auth.isLoggedIn() || route.roles.indexOf(role) === -1) {
        hideAllPages();
        showPage('page-access-denied');
        updateNavActive(path);
        return;
      }
    }

    hideAllPages();
    showPage(route.section);
    updateNavActive(path);

    // Per-route initialization
    try {
      switch (path) {
        case 'home':
          Pages.renderHome();
          break;
        case 'admin':
          await Pages.renderAdmin();
          break;
        case 'hs-marks-entry':
          await HsMarksEntry.activate();
          break;
        case 'hss-results':
          await Pages.renderSchoolResults('hss');
          break;
        case 'hss-marks-review':
          await Pages.renderMarksReview('hss', params.class || '');
          break;
        case 'hss-result-preview':
          await Pages.renderResultPreview('hss', params.class || '');
          break;
        // hs-entry-review and hs-results-preview are static placeholders — no JS needed
      }
    } catch (err) {
      console.error('Route handler error:', err);
      Utils.showToast(err.message || 'An error occurred', 'error');
    }
  }

  function init() {
    window.addEventListener('hashchange', handleRoute);
    Auth.onChange(() => {
      updateNavVisibility();
      // Re-evaluate current route in case role changed
      handleRoute();
    });
    updateNavVisibility();
    if (!location.hash) location.hash = '#/home';
    handleRoute();
  }

  return { init, handleRoute, updateNavVisibility };
})();
