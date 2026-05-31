/**
 * Entry point. Initializes auth + router after DOM is ready.
 * Also wires up nav dropdown toggle behavior (click to open, click outside to close).
 */

(function () {
  function start() {
    Auth.init();
    Router.init();
    HsMarksEntry.init();
    HsEntryReview.init();
    initDropdowns();
    initMobileNav();
  }

  // Mobile hamburger: toggles the collapsible nav panel (#nav-menu).
  function initMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const menu = document.getElementById('nav-menu');
    if (!toggle || !menu) return;

    function close() {
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function open() {
      menu.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.classList.contains('hidden')) open();
      else close();
    });

    // Tapping a real link collapses the menu; tapping a dropdown toggle button
    // just expands its submenu (handled by initDropdowns), so leave it open.
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) close();
    });

    // Collapse on navigation, and when tapping outside the nav.
    window.addEventListener('hashchange', close);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('nav')) close();
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
  }

  function initDropdowns() {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.dropdown-toggle');

      // Case 1: a dropdown link/menu item was clicked → close all and let nav happen.
      if (e.target.closest('.dropdown-menu a')) {
        closeAllDropdowns();
        return;
      }

      // Case 2: a dropdown toggle button was clicked → toggle its menu.
      if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = toggle.closest('[data-dropdown]');
        const menu = wrapper.querySelector(':scope > .dropdown-menu');
        const willOpen = menu.classList.contains('hidden');

        // Close any open menus that aren't ancestors of this toggle.
        document.querySelectorAll('.dropdown-menu').forEach(m => {
          if (!m.contains(toggle)) m.classList.add('hidden');
        });

        if (willOpen) menu.classList.remove('hidden');
        else menu.classList.add('hidden');
        return;
      }

      // Case 3: click anywhere else → close all
      if (!e.target.closest('[data-dropdown]')) {
        closeAllDropdowns();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    window.addEventListener('hashchange', closeAllDropdowns);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
