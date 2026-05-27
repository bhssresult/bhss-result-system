/**
 * Entry point. Initializes auth + router after DOM is ready.
 * Also wires up nav dropdown toggle behavior (click to open, click outside to close).
 */

(function () {
  function start() {
    Auth.init();
    Router.init();
    initDropdowns();
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
