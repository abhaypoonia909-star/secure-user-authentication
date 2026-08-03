/* ==========================================================================
   dashboard.js — protected page behaviour.

   Note on protection: this page is guarded on the SERVER, not here. Flask
   should decorate the route with @login_required and redirect anonymous
   visitors to /login. A front-end check would be trivially bypassed, and
   this project deliberately keeps no auth state in the browser.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SecureAuth;
  if (!S) return;

  /* ------------------------------------------------------------------
     Greeting that matches the time of day
     ------------------------------------------------------------------ */
  var greetingEl = document.querySelector('[data-greeting]');
  if (greetingEl) {
    var hour = new Date().getHours();
    var greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    greetingEl.textContent = greeting;
  }

  /* ------------------------------------------------------------------
     Avatar initials derived from the rendered name
     (Flask injects the real name into [data-user-name].)
     ------------------------------------------------------------------ */
  var nameEl = document.querySelector('[data-user-name]');
  if (nameEl) {
    var initials = nameEl.textContent.trim().split(/\s+/).slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join('');
    S.$$('[data-initials]').forEach(function (el) { el.textContent = initials; });
  }

  /* ==================================================================
     SKELETON LOADING
     Elements marked [data-skeleton] are masked until the view is ready.

     With a backend, drop the timeout and clear the skeletons in your
     fetch/render callback instead — the markup and CSS stay identical.
     ================================================================== */
  var skeletons = S.$$('[data-skeleton]');
  skeletons.forEach(function (el) { el.classList.add('skeleton'); });

  window.setTimeout(function () {
    skeletons.forEach(function (el, i) {
      window.setTimeout(function () {
        el.classList.remove('skeleton');
        el.classList.add('fade-in');
      }, i * 45);
    });
  }, S.reduceMotion ? 0 : 650);

  /* ------------------------------------------------------------------
     Sidebar on small screens
     ------------------------------------------------------------------ */
  var sideToggle = document.getElementById('sideToggle');
  var side = document.getElementById('dashSide');

  if (sideToggle && side) {
    sideToggle.addEventListener('click', function () {
      var open = side.classList.toggle('is-open');
      sideToggle.setAttribute('aria-expanded', String(open));
      sideToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    S.$$('.dash-nav__link', side).forEach(function (link) {
      link.addEventListener('click', function () {
        side.classList.remove('is-open');
        sideToggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', function (event) {
      if (!side.classList.contains('is-open')) return;
      if (side.contains(event.target) || sideToggle.contains(event.target)) return;
      side.classList.remove('is-open');
      sideToggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ------------------------------------------------------------------
     Sidebar highlight follows the section in view.
     Only [data-spy] links are managed — a second link may point at the
     same section (Password → Profile) and shouldn't light up alongside it.
     ------------------------------------------------------------------ */
  var links = S.$$('.dash-nav__link[data-spy]');
  var sections = links
    .map(function (link) {
      var href = link.getAttribute('href') || '';
      if (href.length < 2 || href.charAt(0) !== '#') return null;
      try { return document.querySelector(href); } catch (err) { return null; }
    })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-25% 0px -65%' });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ==================================================================
     SESSION COUNTDOWN
     Server-side sessions expire whether or not the tab is open, so the
     remaining time is shown and can be extended. The real expiry is set
     by the server; render it into [data-session-seconds] from Flask, e.g.
       data-session-seconds="{{ (session_expires - now).seconds }}"
     ================================================================== */
  var timerEl = document.getElementById('sessionTimer');

  if (timerEl) {
    var valueEl = timerEl.querySelector('.session-timer__value');
    var total = parseInt(timerEl.getAttribute('data-session-seconds'), 10) || 1800;
    var left = total;
    var warned = false;

    function format(seconds) {
      var m = Math.floor(seconds / 60);
      var s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function render() {
      valueEl.textContent = left > 0 ? 'in ' + format(left) : 'expired';
      timerEl.classList.toggle('is-low', left <= 300 && left > 60);
      timerEl.classList.toggle('is-critical', left <= 60 && left > 0);

      if (left === 120 && !warned) {
        warned = true;
        S.toast({
          tone: 'warn',
          title: 'Session expiring soon',
          text: 'Two minutes left. Choose Extend to stay signed in.',
          duration: 8000
        });
      }
    }

    var tick = window.setInterval(function () {
      if (left <= 0) {
        window.clearInterval(tick);
        S.toast({
          tone: 'error',
          title: 'Session expired',
          text: 'Sign in again to continue.',
          duration: 0
        });
        return;
      }
      left -= 1;
      render();
    }, 1000);

    render();

    var extendBtn = document.getElementById('extendSession');
    if (extendBtn) {
      extendBtn.addEventListener('click', function () {
        // With a backend this is a request that renews the session cookie.
        left = total;
        warned = false;
        render();
        S.toast({
          tone: 'success',
          title: 'Session extended',
          text: 'You have another ' + Math.round(total / 60) + ' minutes.',
          duration: 3000
        });
      });
    }
  }

  /* ------------------------------------------------------------------
     Copy the user ID — handy when quoting it in a support ticket
     ------------------------------------------------------------------ */
  S.$$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var source = document.querySelector(btn.getAttribute('data-copy'));
      if (!source) return;
      var text = source.textContent.trim();

      var confirmCopy = function () {
        S.toast({ tone: 'success', title: 'Copied', text: text, duration: 2200 });
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(confirmCopy, function () {
          S.toast({ tone: 'error', title: 'Couldn\'t copy', text: 'Select the text and copy it manually.' });
        });
      } else {
        S.toast({ tone: 'info', title: 'Copy manually', text: text, duration: 5000 });
      }
    });
  });

  /* ------------------------------------------------------------------
     End another device's session
     ------------------------------------------------------------------ */
  S.$$('[data-end-session]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('li');
      var label = row.querySelector('strong').textContent.trim();

      btn.classList.add('is-busy');
      btn.disabled = true;

      // With a backend, this is a POST that revokes that session record.
      window.setTimeout(function () {
        row.classList.add('is-ending');
        window.setTimeout(function () {
          row.remove();

          var list = document.querySelector('.session-list');
          if (list && !list.querySelector('li')) {
            var empty = document.createElement('p');
            empty.className = 'session-list__empty';
            empty.textContent = 'Only this device is signed in.';
            list.appendChild(empty);
          }

          S.toast({
            tone: 'success',
            title: 'Session ended',
            text: label + ' has been signed out.',
            duration: 3500
          });
        }, 320);
      }, 500);
    });
  });

  /* ------------------------------------------------------------------
     Log out — confirm, then hand off to the server
     ------------------------------------------------------------------ */
  var logoutBtn = document.getElementById('logoutBtn');
  var logoutModal = document.getElementById('logoutModal');
  var confirmLogout = document.getElementById('confirmLogout');
  var logoutForm = document.getElementById('logoutForm');

  if (logoutBtn && logoutModal) {
    logoutBtn.addEventListener('click', function () { S.openModal(logoutModal); });
  }

  if (confirmLogout) {
    confirmLogout.addEventListener('click', function () {
      confirmLogout.classList.add('is-busy');
      S.progress.start();

      /* ------------------------------------------------------------
         POST to url_for('logout') via the hidden #logoutForm so the
         server can clear the session cookie.
         ------------------------------------------------------------ */
      if (logoutForm) {
        logoutForm.submit();
      } else {
        window.location.href = 'index.html';
      }
    });
  }
})();
