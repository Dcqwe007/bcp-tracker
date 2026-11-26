<?php
declare(strict_types=1);

require_once __DIR__ . '/api/session.php';
if (!isBcpAuthenticated()) {
    header('Location: login.php');
    exit;
}

$document = file_get_contents(__DIR__ . '/index.html');
if ($document === false) {
    error_log('BCP tracker could not read index.html.');
    http_response_code(500);
    exit('The dashboard could not be loaded.');
}

$document = preg_replace('~src="data\.js([^"]*)"~', 'src="data.php$1"', $document, 1);
if ($document === null) {
    error_log('BCP tracker could not prepare the authenticated data script.');
    http_response_code(500);
    exit('The dashboard could not be loaded.');
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
echo $document;
