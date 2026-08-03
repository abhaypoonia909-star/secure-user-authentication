/* ==========================================================================
   main.js — shared behaviour, loaded on every page.

   Exposes a small helper namespace on window.SecureAuth so the page scripts
   (login.js / register.js / dashboard.js) can reuse the theme controller,
   toasts, validators, field state, and modal controls without a bundler.

   Nothing here stores credentials or talks to a server. Form submission is
   intentionally left to the backend you add later.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* ==================================================================
     THEME
     Persisted in localStorage under a UI-only key.

     Why storage is acceptable here but not for auth: a theme choice is a
     non-sensitive display preference. Reading it back can't impersonate
     anyone. Session state is the opposite — it must live in a signed,
     HttpOnly cookie the browser cannot read, which is why this project
     keeps no auth state client-side.
     ================================================================== */
  var THEME_KEY = 'secureauth:theme';

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (err) { return null; }
  }

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme, announce) {
    var root = document.documentElement;

    // Suppress transitions for one frame so the swap reads as instant
    // rather than every element crossfading at a different rate.
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        root.classList.remove('theme-switching');
      });
    });

    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* private mode */ }

    $$('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
    });

    if (announce && window.SecureAuth) {
      window.SecureAuth.toast({
        tone: 'info',
        title: theme === 'dark' ? 'Dark theme on' : 'Light theme on',
        text: 'Saved for next time on this device.',
        duration: 2600
      });
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  // Follow the OS while the user hasn't made an explicit choice.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (event) {
    if (!storedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
  });

  $$('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', toggleTheme);
  });
  applyTheme(currentTheme(), false);

  /* ==================================================================
     TOASTS
     SecureAuth.toast({ title, text, tone, duration })
     tone: info | success | warn | error
     ================================================================== */
  var ICONS = {
    success: '<path d="M20 6L9 17l-5-5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    warn: '<path d="M10.3 4.3L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>'
  };

  function toastStack() {
    var stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'region');
      stack.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function dismissToast(toast) {
    if (!toast || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    window.setTimeout(function () { toast.remove(); }, 200);
  }

  function toast(options) {
    var opts = options || {};
    var tone = opts.tone || 'info';
    var duration = typeof opts.duration === 'number' ? opts.duration : 4200;
    var stack = toastStack();

    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('data-tone', tone);
    // Errors interrupt; everything else waits for a pause in speech.
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');

    el.innerHTML =
      '<span class="toast__icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[tone] || ICONS.info) + '</svg>' +
      '</span>' +
      '<div class="toast__body">' +
        '<p class="toast__title"></p>' +
        (opts.text ? '<p class="toast__text"></p>' : '') +
      '</div>' +
      '<button class="toast__close" type="button" aria-label="Dismiss notification">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
        'stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' +
      (duration ? '<span class="toast__timer"></span>' : '');

    // textContent, never innerHTML, for anything user-supplied.
    $('.toast__title', el).textContent = opts.title || '';
    if (opts.text) $('.toast__text', el).textContent = opts.text;

    var timer = $('.toast__timer', el);
    if (timer && !reduceMotion) timer.style.animationDuration = duration + 'ms';

    $('.toast__close', el).addEventListener('click', function () { dismissToast(el); });

    stack.appendChild(el);

    // Keep the stack from growing without bound.
    var toasts = $$('.toast', stack);
    if (toasts.length > 4) dismissToast(toasts[0]);

    if (duration) {
      var countdown = window.setTimeout(function () { dismissToast(el); }, duration);
      // Pause the countdown while the pointer rests on the toast.
      el.addEventListener('mouseenter', function () {
        window.clearTimeout(countdown);
        if (timer) timer.style.animationPlayState = 'paused';
      });
      el.addEventListener('mouseleave', function () {
        countdown = window.setTimeout(function () { dismissToast(el); }, 1600);
        if (timer) timer.style.animationPlayState = 'running';
      });
    }

    return el;
  }

  /* ==================================================================
     TOP PROGRESS BAR
     Shown while a submit is in flight so the wait has a visible anchor.
     ================================================================== */
  function progressBar() {
    var bar = $('.route-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'route-progress';
      document.body.appendChild(bar);
    }
    return bar;
  }

  var progress = {
    start: function () {
      var bar = progressBar();
      bar.classList.remove('is-done');
      // Force a reflow so the transition restarts from zero.
      void bar.offsetWidth;
      bar.classList.add('is-active');
    },
    done: function () {
      var bar = progressBar();
      bar.classList.remove('is-active');
      bar.classList.add('is-done');
      window.setTimeout(function () { bar.classList.remove('is-done'); }, 400);
    }
  };

  /* ==================================================================
     FIELD VALIDATION
     Each field is a .field wrapper holding one input and one .field__msg.
     ================================================================== */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  var rules = {
    fullName: function (value) {
      var name = value.trim();
      if (!name) return 'Enter your full name.';
      if (name.length < 2) return 'That name looks too short.';
      if (!/^[\p{L}\s'.-]+$/u.test(name)) return 'Use letters, spaces, hyphens, and apostrophes only.';
      return '';
    },
    email: function (value) {
      var email = value.trim();
      if (!email) return 'Enter your email address.';
      if (!EMAIL_RE.test(email)) return 'That email address is missing something — check the @ and domain.';
      return '';
    },
    passwordPresent: function (value) {
      if (!value) return 'Enter your password.';
      return '';
    },
    passwordStrong: function (value) {
      if (!value) return 'Choose a password.';
      if (value.length < 8) return 'Use at least 8 characters.';
      if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
        return 'Mix in at least one letter and one number.';
      }
      return '';
    },
    match: function (value, other) {
      if (!value) return 'Type your password again.';
      if (value !== other) return 'The two passwords don\'t match.';
      return '';
    }
  };

  /** Which individual requirements a password currently meets. */
  function passwordChecks(value) {
    return {
      length: value.length >= 8,
      case: /[a-z]/.test(value) && /[A-Z]/.test(value),
      number: /[0-9]/.test(value),
      symbol: /[^A-Za-z0-9]/.test(value)
    };
  }

  /** Score a password 0–4 from length and character variety. */
  function scorePassword(value) {
    if (!value) return 0;
    var score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
    // Obvious sequences and repeats shouldn't score well at any length.
    if (/^(.)\1+$/.test(value) || /12345|qwerty|password|abcdef/i.test(value)) score = Math.min(score, 1);
    return Math.max(0, Math.min(4, score));
  }

  /**
   * Apply a validation result to a field.
   * message === '' marks the field valid; a non-empty string marks it invalid.
   */
  function setFieldState(input, message) {
    var field = input.closest('.field');
    if (!field) return !message;

    var msgEl = $('.field__msg', field);
    field.classList.toggle('is-invalid', Boolean(message));
    field.classList.toggle('is-valid', !message && input.value.trim() !== '');
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (msgEl) msgEl.textContent = message || '';
    return !message;
  }

  /** Clear a field back to neutral (used while the user retypes). */
  function clearFieldState(input) {
    var field = input.closest('.field');
    if (!field) return;
    field.classList.remove('is-invalid', 'is-valid');
    input.removeAttribute('aria-invalid');
    var msgEl = $('.field__msg', field);
    if (msgEl) msgEl.textContent = '';
  }

  /** Show a form-level message above the fields. */
  function setFormStatus(el, message, tone) {
    if (!el) return;
    var textEl = $('[data-status-text]', el) || el;
    textEl.textContent = message;
    el.setAttribute('data-tone', tone || 'error');
    el.classList.toggle('is-shown', Boolean(message));
  }

  /* ------------------------------------------------------------------
     Show / hide password
     ------------------------------------------------------------------ */
  $$('[data-reveal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-reveal'));
      if (!input) return;
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!showing));
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      // Keep the caret where the user left it.
      var end = input.value.length;
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(end, end); } catch (err) { /* type change race */ }
    });
  });

  /* ------------------------------------------------------------------
     Caps Lock warning on password fields
     A silent Caps Lock is one of the most common causes of a failed
     sign-in, so it's worth catching before the request is made.
     ------------------------------------------------------------------ */
  $$('[data-caps-for]').forEach(function (hint) {
    var input = document.getElementById(hint.getAttribute('data-caps-for'));
    if (!input) return;

    var update = function (event) {
      if (typeof event.getModifierState !== 'function') return;
      hint.classList.toggle('is-shown', event.getModifierState('CapsLock'));
    };

    input.addEventListener('keydown', update);
    input.addEventListener('keyup', update);
    input.addEventListener('blur', function () { hint.classList.remove('is-shown'); });
  });

  /* ------------------------------------------------------------------
     Button ripple — anchored to where the pointer landed
     ------------------------------------------------------------------ */
  if (!reduceMotion) {
    document.addEventListener('pointerdown', function (event) {
      var btn = event.target.closest('.btn');
      if (!btn || btn.disabled) return;

      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var ripple = document.createElement('span');
      ripple.className = 'btn__ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      window.setTimeout(function () { ripple.remove(); }, 560);
    });
  }

  /* ------------------------------------------------------------------
     Modals — opened by page scripts, closed and focus-trapped here
     ------------------------------------------------------------------ */
  var lastFocused = null;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus only once the dialog is actually visible. Calling focus() while
    // the element is still visibility:hidden silently does nothing, which
    // would leave focus on the trigger and let Tab walk the page behind it.
    window.requestAnimationFrame(function () {
      var first = $(FOCUSABLE, modal);
      if (first) first.focus({ preventScroll: true });
    });
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus({ preventScroll: true });
  }

  // Backdrop click and close buttons dismiss.
  $$('.modal').forEach(function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal || event.target.closest('[data-close-modal]')) {
        closeModal(modal);
      }
    });
  });

  // Escape closes; Tab cycles within the dialog instead of escaping behind it.
  document.addEventListener('keydown', function (event) {
    var open = $('.modal.is-open');
    if (!open) return;

    if (event.key === 'Escape') { closeModal(open); return; }
    if (event.key !== 'Tab') return;

    var items = $$(FOCUSABLE, open).filter(function (el) { return el.offsetParent !== null; });
    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];

    // If focus has drifted outside the dialog for any reason, pull it back.
    if (!open.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ------------------------------------------------------------------
     Header: mobile menu + stuck state
     ------------------------------------------------------------------ */
  var navToggle = $('#navToggle');
  var nav = $('#primaryNav');

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    $$('a', nav).forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var header = $('#siteHeader');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  var revealables = $$('.reveal');
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          // Small stagger so a row of cards arrives in sequence, not as a block.
          setTimeout(function () { entry.target.classList.add('is-visible'); }, i * 70);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -60px' });

      revealables.forEach(function (el) { observer.observe(el); });
    }
  }

  /* ------------------------------------------------------------------
     Hero headline: characters resolve out of ciphertext
     ------------------------------------------------------------------ */
  var scrambleEl = $('[data-scramble]');
  if (scrambleEl && !reduceMotion) {
    var GLYPHS = '#$%&*+/<>?@^~01';

    // Rebuild the headline as one span per character, preserving the <em> accent.
    var rebuild = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split('').forEach(function (ch) {
            var span = document.createElement('span');
            span.className = 'scramble-char';
            span.textContent = ch;
            span.dataset.final = ch;
            frag.appendChild(span);
          });
          node.replaceChild(frag, child);
        } else {
          rebuild(child);
        }
      });
    };
    rebuild(scrambleEl);

    var spans = $$('.scramble-char', scrambleEl).filter(function (s) {
      return s.dataset.final.trim() !== '';
    });

    spans.forEach(function (span) { span.classList.add('is-cipher'); });

    var frame = 0;
    var ticker = setInterval(function () {
      frame++;
      var resolved = 0;
      spans.forEach(function (span, i) {
        // Each character locks in after its own short delay.
        if (frame > i * 1.1 + 6) {
          span.textContent = span.dataset.final;
          span.classList.remove('is-cipher');
          resolved++;
        } else {
          span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      });
      if (resolved === spans.length) clearInterval(ticker);
    }, 38);
  }

  /* ------------------------------------------------------------------
     Hero handshake: steps light up in order, then the padlock closes
     ------------------------------------------------------------------ */
  var consoleEl = $('#handshake');
  if (consoleEl) {
    var steps = $$('.handshake__step', consoleEl);

    if (reduceMotion) {
      steps.forEach(function (s) { s.classList.add('is-done'); });
      consoleEl.classList.add('is-locked');
    } else {
      var run = function () {
        steps.forEach(function (s) { s.classList.remove('is-done', 'is-active'); });
        consoleEl.classList.remove('is-locked');

        steps.forEach(function (step, i) {
          setTimeout(function () {
            step.classList.add('is-active');
            setTimeout(function () {
              step.classList.remove('is-active');
              step.classList.add('is-done');
              if (i === steps.length - 1) consoleEl.classList.add('is-locked');
            }, 520);
          }, 700 + i * 620);
        });
      };

      run();
      // Loop so the card stays alive while the page is read.
      setInterval(run, 7200);
    }
  }

  /* ------------------------------------------------------------------
     Misc: current year in footers
     ------------------------------------------------------------------ */
  $$('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */
  window.SecureAuth = {
    $: $,
    $$: $$,
    rules: rules,
    passwordChecks: passwordChecks,
    scorePassword: scorePassword,
    setFieldState: setFieldState,
    clearFieldState: clearFieldState,
    setFormStatus: setFormStatus,
    openModal: openModal,
    closeModal: closeModal,
    toast: toast,
    dismissToast: dismissToast,
    progress: progress,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    currentTheme: currentTheme,
    reduceMotion: reduceMotion
  };
})();
