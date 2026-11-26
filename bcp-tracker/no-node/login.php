<?php
declare(strict_types=1);

require_once __DIR__ . '/api/session.php';
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
if (isBcpAuthenticated()) {
    header('Location: index.php');
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f5f7fb">
  <title>Sign in · BCP Site Tracker</title>
  <link rel="icon" type="image/png" href="assets/concentrix-logo.png?v=1">
  <link rel="stylesheet" href="styles.css?v=16">
</head>
<body class="login-page">
  <main class="login-shell">
    <section class="login-card">
      <img class="login-logo" src="assets/concentrix-logo.png" alt="Concentrix logo">
      <h1 id="loginTitle">Sign in</h1>
      <p id="loginSubtitle" class="login-subtitle">Sign in to open the BCP Site Tracker.</p>
      <p id="loginStatus" class="login-status" role="status">Please wait.</p>
      <div id="loginError" class="login-alert" role="alert" hidden></div>
      <form id="loginForm" class="login-form" hidden>
        <label for="loginUsername">Username</label>
        <input id="loginUsername" name="username" autocomplete="username" minlength="3" maxlength="80" required>
        <label for="loginPassword">Password</label>
        <input id="loginPassword" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
        <p id="passwordHelp" class="login-help" hidden>Use at least 12 characters. Your password is stored securely as a hash.</p>
        <button id="loginSubmit" class="button primary" type="submit">Sign in</button>
      </form>
      <div id="loginDivider" class="login-divider" aria-hidden="true"><span>or</span></div>
      <p id="loginActions" class="login-actions">
        <a id="createAccountLink" class="create-account-button" href="login.php?create=1">Create account</a>
        <a id="signInLink" href="login.php" hidden>Back to sign in</a>
      </p>
      <p class="login-footer">For local XAMPP use. Do not expose this app to the public internet.</p>
    </section>
  </main>
  <script>
    (function () {
      'use strict';
      const form = document.getElementById('loginForm');
      const title = document.getElementById('loginTitle');
      const subtitle = document.getElementById('loginSubtitle');
      const status = document.getElementById('loginStatus');
      const errorBox = document.getElementById('loginError');
      const username = document.getElementById('loginUsername');
      const password = document.getElementById('loginPassword');
      const passwordHelp = document.getElementById('passwordHelp');
      const submit = document.getElementById('loginSubmit');
      const loginActions = document.getElementById('loginActions');
      const loginDivider = document.getElementById('loginDivider');
      const createAccountLink = document.getElementById('createAccountLink');
      const signInLink = document.getElementById('signInLink');
      const createRequested = new URLSearchParams(window.location.search).get('create') === '1';
      const accountCreated = new URLSearchParams(window.location.search).get('account-created') === '1';
      let registrationMode = false;

      async function readResponse(response) {
        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          throw new Error('The XAMPP login service returned an invalid response.');
        }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Login request failed (${response.status}).`);
        }
        return payload;
      }

      async function checkLogin() {
        try {
          const response = await fetch('api/auth.php', { headers: { 'Accept': 'application/json' } });
          const payload = await readResponse(response);
          if (payload.authenticated) {
            window.location.replace('index.php');
            return;
          }
          registrationMode = createRequested;
          title.textContent = registrationMode ? 'Create your account' : 'Sign in';
          subtitle.textContent = registrationMode
            ? 'Create an account to access the BCP Site Tracker.'
            : 'Sign in to open the BCP Site Tracker.';
          submit.textContent = registrationMode ? 'Create account' : 'Sign in';
          password.autocomplete = registrationMode ? 'new-password' : 'current-password';
          password.minLength = registrationMode ? 12 : 1;
          passwordHelp.hidden = !registrationMode;
          loginDivider.hidden = registrationMode;
          createAccountLink.hidden = registrationMode;
          signInLink.hidden = !registrationMode;
          if (accountCreated) {
            status.textContent = 'Account created. Sign in with your username and password.';
            status.hidden = false;
          } else {
            status.hidden = true;
          }
          form.hidden = false;
        } catch (error) {
          status.hidden = true;
          errorBox.textContent = error.message || 'Could not connect to the login service.';
          errorBox.hidden = false;
        }
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        submit.disabled = true;
        submit.textContent = registrationMode ? 'Creating account…' : 'Signing in…';
        try {
          const response = await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              action: registrationMode ? 'register' : 'login',
              username: username.value,
              password: password.value
            })
          });
          await readResponse(response);
          window.location.replace(registrationMode ? 'login.php?account-created=1' : 'index.php');
        } catch (error) {
          errorBox.textContent = error.message || 'Could not sign in.';
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = registrationMode ? 'Create account' : 'Sign in';
        }
      });

      checkLogin();
    })();
  </script>
</body>
</html>
