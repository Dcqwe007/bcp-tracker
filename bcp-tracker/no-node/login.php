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
  <link rel="stylesheet" href="styles.css?v=11">
</head>
<body class="login-page">
  <main class="login-shell">
    <section class="login-card">
      <img class="login-logo" src="assets/concentrix-logo.png" alt="Concentrix logo">
      <h1 id="loginTitle">BCP Site Tracker</h1>
      <p id="loginSubtitle" class="login-subtitle">Checking your XAMPP connection…</p>
      <p id="loginStatus" class="login-status" role="status">Please wait.</p>
      <div id="loginError" class="login-alert" role="alert" hidden></div>
      <form id="loginForm" class="login-form" hidden>
        <label for="loginUsername">Username</label>
        <input id="loginUsername" name="username" autocomplete="username" minlength="3" maxlength="80" required>
        <label for="loginPassword">Password</label>
        <input id="loginPassword" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
        <p id="passwordHelp" class="login-help" hidden>For the first setup, use at least 12 characters. This shared login is stored in MySQL as a password hash.</p>
        <button id="loginSubmit" class="button primary" type="submit">Sign in</button>
      </form>
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
      let configured = false;

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
          configured = payload.configured;
          title.textContent = configured ? 'Sign in' : 'Set up the shared login';
          subtitle.textContent = configured
            ? 'Sign in to open the BCP Site Tracker.'
            : 'Create the shared account used to access this local dashboard.';
          submit.textContent = configured ? 'Sign in' : 'Create login';
          password.autocomplete = configured ? 'current-password' : 'new-password';
          password.minLength = configured ? 1 : 12;
          passwordHelp.hidden = configured;
          status.hidden = true;
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
        submit.textContent = configured ? 'Signing in…' : 'Setting up…';
        try {
          const response = await fetch('api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              action: configured ? 'login' : 'setup',
              username: username.value,
              password: password.value
            })
          });
          await readResponse(response);
          window.location.replace('index.php');
        } catch (error) {
          errorBox.textContent = error.message || 'Could not sign in.';
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = configured ? 'Sign in' : 'Create login';
        }
      });

      checkLogin();
    })();
  </script>
</body>
</html>
