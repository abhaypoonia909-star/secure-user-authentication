/* ==========================================================================
   login.js — sign-in form behaviour.

   Validates in the browser, shows progress while a submit is in flight, and
   handles the password-reset dialog. The actual sign-in is the backend's job:
   point the form at your Flask route and remove the demo block below.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SecureAuth;
  var form = document.getElementById('loginForm');
  if (!form || !S) return;

  var status = document.getElementById('loginStatus');
  var email = document.getElementById('email');
  var password = document.getElementById('password');
  var submitBtn = form.querySelector('button[type="submit"]');

  /* ------------------------------------------------------------------
     Per-field validation
     ------------------------------------------------------------------ */
  function validateEmail() {
    return S.setFieldState(email, S.rules.email(email.value));
  }

  function validatePassword() {
    return S.setFieldState(password, S.rules.passwordPresent(password.value));
  }

  // Validate on blur, then clear the error as soon as the user starts fixing it.
  email.addEventListener('blur', validateEmail);
  password.addEventListener('blur', validatePassword);

  [email, password].forEach(function (input) {
    input.addEventListener('input', function () {
      if (input.closest('.field').classList.contains('is-invalid')) {
        S.clearFieldState(input);
      }
      S.setFormStatus(status, '');
    });
  });

  /* ------------------------------------------------------------------
     Submit
     ------------------------------------------------------------------ */
  form.addEventListener('submit', function (event) {
    var emailOk = validateEmail();
    var passwordOk = validatePassword();

    if (!emailOk || !passwordOk) {
      event.preventDefault();
      S.setFormStatus(status, 'Fix the highlighted fields and try again.', 'error');
      var firstBad = form.querySelector('.field.is-invalid .field__input');
      if (firstBad) firstBad.focus();
      return;
    }

    /* --------------------------------------------------------------
       Real submit: no preventDefault, so the browser posts normally to
       url_for('login'). The progress bar and busy state give visual
       feedback while the server round trip and redirect happen.
       -------------------------------------------------------------- */
    S.progress.start();
    submitBtn.classList.add('is-busy');
    submitBtn.disabled = true;
    S.setFormStatus(status, '');
  });

  /* ==================================================================
     Password reset dialog (UI only)
     ================================================================== */
  var forgotLink = document.getElementById('forgotLink');
  var forgotModal = document.getElementById('forgotModal');
  var sendReset = document.getElementById('sendReset');
  var resetEmail = document.getElementById('resetEmail');
  var cooldown = document.getElementById('resendCooldown');
  var cooldownCount = cooldown ? cooldown.querySelector('[data-cooldown-count]') : null;
  var cooldownBar = cooldown ? cooldown.querySelector('.cooldown__bar span') : null;

  var COOLDOWN_SECONDS = 30;
  var cooldownTimer = null;

  if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', function () {
      // Carry anything already typed into the dialog.
      if (resetEmail && email.value) resetEmail.value = email.value;
      S.openModal(forgotModal);
    });

    // Deep link from the footer: login.html#forgot
    if (window.location.hash === '#forgot') S.openModal(forgotModal);
  }

  /**
   * Hold the send button for COOLDOWN_SECONDS. A real backend enforces the
   * limit; this only makes the wait legible.
   */
  function startCooldown() {
    if (!cooldown) return;
    var left = COOLDOWN_SECONDS;

    cooldown.classList.add('is-shown');
    sendReset.disabled = true;
    sendReset.querySelector('.btn__label').textContent = 'Resend link';
    if (cooldownCount) cooldownCount.textContent = left + 's';
    if (cooldownBar) cooldownBar.style.transform = 'scaleX(1)';

    window.clearInterval(cooldownTimer);
    cooldownTimer = window.setInterval(function () {
      left -= 1;
      if (cooldownCount) cooldownCount.textContent = left + 's';
      if (cooldownBar) cooldownBar.style.transform = 'scaleX(' + (left / COOLDOWN_SECONDS) + ')';

      if (left <= 0) {
        window.clearInterval(cooldownTimer);
        cooldown.classList.remove('is-shown');
        sendReset.disabled = false;
      }
    }, 1000);
  }

  if (sendReset) {
    sendReset.addEventListener('click', function () {
      var value = (resetEmail.value || '').trim();
      var error = S.rules.email(value);

      if (error) {
        S.setFieldState(resetEmail, error);
        resetEmail.focus();
        return;
      }
      S.setFieldState(resetEmail, '');

      sendReset.classList.add('is-busy');

      setTimeout(function () {
        sendReset.classList.remove('is-busy');

        S.toast({
          tone: 'success',
          title: 'Reset link sent',
          // The message deliberately doesn't confirm whether the account
          // exists — that would let anyone enumerate registered emails.
          text: 'If an account exists for that address, a link is on its way. It expires in 15 minutes.',
          duration: 6000
        });

        startCooldown();
      }, 700);
    });
  }

  // Reset the dialog when it closes so a reopen starts clean.
  if (forgotModal) {
    forgotModal.addEventListener('click', function (event) {
      if (event.target !== forgotModal && !event.target.closest('[data-close-modal]')) return;
      window.clearInterval(cooldownTimer);
      if (cooldown) cooldown.classList.remove('is-shown');
      if (sendReset) {
        sendReset.disabled = false;
        sendReset.querySelector('.btn__label').textContent = 'Send reset link';
      }
      if (resetEmail) S.clearFieldState(resetEmail);
    });
  }
})();
