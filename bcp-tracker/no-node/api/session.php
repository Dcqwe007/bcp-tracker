<?php
declare(strict_types=1);

function startBcpSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    session_name('BCPTrackerSession');
    $scriptDirectory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    $appDirectory = preg_replace('~/api$~', '', $scriptDirectory) ?? '/';
    $cookiePath = rtrim($appDirectory, '/') . '/';
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $cookiePath === '//' ? '/' : $cookiePath,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function isBcpAuthenticated(): bool
{
    startBcpSession();
    return !empty($_SESSION['bcp_authenticated']);
}

function requireBcpAuthentication(): void
{
    if (isBcpAuthenticated()) {
        return;
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => 'Sign in to continue.']);
    exit;
}
