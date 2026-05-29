/**
 * Hash-based router.
 *
 * Routes:
 *   #/home
 *   #/admin
 *   #/hs-home
 *   #/hss-home
 *   #/hs-marks-entry
 *   #/hs-entry-review
 *   #/hs-results-preview
 *   #/hss-marks-review?class=11
 *   #/hss-result-preview?class=11
 *   #/access-denied
 */

const Router = (() => {

  const routes = {
    'home':               { section: 'page-home',                roles: null },
    'admin':              { section: 'page-admin',               roles: ['admin'] },
    'hs-home':            { section: 'page-hs-home',             roles: ['admin', 'hs_teacher'] },
    'hss-home':           { section: 'page-hss-home',            roles: ['admin', 'hss_teacher'] },
    'hs-marks-entry':     { section: 'page-hs-marks-entry',      roles: ['admin', 'hs_teacher'] },
    'hs-entry-review':    { section: 'page-hs-entry-review',     roles: ['admin', 'hs_teacher'] },
    'hs-results-preview': { section: 'page-hs-results-preview',  roles: ['admin', 'hs_teacher'] },
    'hss-marks-review':   { section: 'page-marks-review',        roles: ['admin', 'hss_teacher'] },
    'hss-result-preview': { section: 'page-result-preview',      roles: ['admin', 'hss_teacher'] },
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
      'admin': 'admin'
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

    // Inverse of data-roles: hide an element for specific roles only. Used for
    // the Home link, which is hidden for admins (their home is the Admin page)
    // but stays visible to logged-out students and teachers.
    document.querySelectorAll('nav [data-hide-roles]').forEach(el => {
      const hideFor = el.dataset.hideRoles.split(',');
      el.classList.toggle('hidden', !!role && hideFor.indexOf(role) !== -1);
    });
  }

  async function handleRoute() {
    const { path, params } = parseHash();

    // Logged-in roles each have their own landing page instead of the public
    // lookup. Redirect #/home to the right one.
    if (path === 'home') {
      const homeFor = { admin: '#/admin', hs_teacher: '#/hs-home', hss_teacher: '#/hss-home' };
      const dest = homeFor[Auth.getRole()];
      if (dest) {
        if (location.hash !== dest) location.hash = dest;
        return;
      }
    }

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
        case 'hss-home':
          await Pages.renderHssHome();
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
