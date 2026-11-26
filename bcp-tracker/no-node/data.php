<?php
declare(strict_types=1);

require_once __DIR__ . '/api/session.php';
if (!isBcpAuthenticated()) {
    http_response_code(401);
    header('Content-Type: application/javascript; charset=utf-8');
    header('Cache-Control: no-store');
    exit('throw new Error("Sign in to load site data.");');
}

$dataFile = __DIR__ . '/data.js';
if (!is_file($dataFile) || !is_readable($dataFile)) {
    error_log('BCP tracker site data file is unavailable.');
    http_response_code(500);
    exit;
}

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');
readfile($dataFile);
