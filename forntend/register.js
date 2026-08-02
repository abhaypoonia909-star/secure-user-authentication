/* ==========================================================================
   register.js — account creation form behaviour.

   Inline validation, live password strength scoring, a requirement checklist
   that ticks off as rules are met, and the confirm-password match. No account
   is created here; wire the form to your Flask /register route.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SecureAuth;
  var form = document.getElementById('registerForm');
  if (!form || !S) return;

  var status = document.getElementById('registerStatus');
  var fullName = document.getElementById('full_name');
  var email = document.getElementById('email');
  var password = document.getElementById('password');
  var confirm = document.getElementById('confirm_password');
  var terms = document.getElementById('terms');
  var submitBtn = form.querySelector('button[type="submit"]');
  var done = document.getElementById('registerDone');

  var meter = document.getElementById('strength');
  var meterLabel = document.getElementById('strength-label');
  var reqItems = S.$$('#reqs [data-req]');

  var LABELS = [
    'Use 8+ characters with a mix of letters, numbers, and symbols.',
    '<b>Weak</b> — easy to guess. Add length and variety.',
    '<b>Fair</b> — add a symbol or a few more characters.',
    '<b>Strong</b> — good to go.',
    '<b>Excellent</b> — this one will hold up.'
  ];

  /* ------------------------------------------------------------------
     Strength meter + requirement checklist
     ------------------------------------------------------------------ */
  function updateStrength() {
    var value = password.value;
    var score = S.scorePassword(value);
    var checks = S.passwordChecks(value);

    meter.setAttribute('data-score', String(score));
    meterLabel.innerHTML = LABELS[score];

    reqItems.forEach(function (item) {
      item.classList.toggle('is-met', Boolean(checks[item.getAttribute('data-req')]));
    });
  }

  /* ------------------------------------------------------------------
     Validators
     ------------------------------------------------------------------ */
  function validateName() {
    return S.setFieldState(fullName, S.rules.fullName(fullName.value));
  }

  function validateEmail() {
    return S.setFieldState(email, S.rules.email(email.value));
  }

  function validatePassword() {
    return S.setFieldState(password, S.rules.passwordStrong(password.value));
  }

  function validateConfirm() {
    // Stay quiet until the user has actually typed in this field.
    if (!confirm.value) return S.setFieldState(confirm, '');
    return S.setFieldState(confirm, S.rules.match(confirm.value, password.value));
  }

  function validateTerms() {
    var wrapper = terms.closest('.check');
    var ok = terms.checked;
    wrapper.classList.toggle('is-invalid', !ok);
    return ok;
  }

  /* ------------------------------------------------------------------
     Events
     ------------------------------------------------------------------ */
  fullName.addEventListener('blur', validateName);
  email.addEventListener('blur', validateEmail);
  password.addEventListener('blur', validatePassword);
  confirm.addEventListener('blur', validateConfirm);
  terms.addEventListener('change', validateTerms);

  password.addEventListener('input', function () {
    updateStrength();
    if (password.closest('.field').classList.contains('is-invalid')) {
      S.clearFieldState(password);
    }
    // Keep the match state honest while the first password changes.
    if (confirm.value) validateConfirm();
  });

  confirm.addEventListener('input', function () {
    if (confirm.value.length >= password.value.length || confirm.value === password.value) {
      validateConfirm();
    } else {
      S.clearFieldState(confirm);
    }
  });

  [fullName, email].forEach(function (input) {
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
    var checks = [validateName(), validateEmail(), validatePassword(), validateConfirm(), validateTerms()];
    var allOk = checks.every(Boolean);

    if (!allOk) {
      event.preventDefault();
      S.setFormStatus(status, 'A few details need attention before we can create your account.', 'error');
      var firstBad = form.querySelector('.field.is-invalid .field__input') ||
                     form.querySelector('.check.is-invalid input');
      if (firstBad) firstBad.focus();
      return;
    }

    if (S.scorePassword(password.value) < 2) {
      event.preventDefault();
      S.setFieldState(password, 'That password is too easy to guess. Add length or variety.');
      S.toast({
        tone: 'warn',
        title: 'Choose a stronger password',
        text: 'Aim for at least Fair on the strength meter.'
      });
      password.focus();
      return;
    }

    /* --------------------------------------------------------------
       Real submit: no preventDefault, so the browser posts normally to
       url_for('register'). Field names (full_name, email, password,
       confirm_password, terms) already match what Flask expects. On
       success the server redirects to /login; on failure it re-renders
       this page with the error in .form__status.
       -------------------------------------------------------------- */
    S.progress.start();
    submitBtn.classList.add('is-busy');
    submitBtn.disabled = true;
  });

  // Resting state on load.
  updateStrength();
})();
