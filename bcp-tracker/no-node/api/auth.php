<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/session.php';
startBcpSession();

function authRespond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clearBcpSession(): void
{
    $_SESSION = [];
    $parameters = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $parameters['path'],
        'secure' => $parameters['secure'],
        'httponly' => $parameters['httponly'],
        'samesite' => 'Strict',
    ]);
    session_destroy();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    authRespond(405, ['ok' => false, 'error' => 'Use GET to check login status or POST to register, sign in, or sign out.']);
}

$payload = [];
if ($method === 'POST') {
    try {
        $payload = json_decode((string) file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        authRespond(400, ['ok' => false, 'error' => 'The request must contain valid JSON.']);
    }
    if (!is_array($payload)) {
        authRespond(400, ['ok' => false, 'error' => 'The request must contain a JSON object.']);
    }
    if (($payload['action'] ?? '') === 'logout') {
        clearBcpSession();
        authRespond(200, ['ok' => true]);
    }
}

try {
    $pdo = connectBcpDatabase();
} catch (PDOException $error) {
    error_log('BCP tracker authentication database error: ' . $error->getMessage());
    authRespond(503, ['ok' => false, 'error' => 'Cannot connect to MySQL. Check XAMPP and api/config.php.']);
}

try {
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS bcp_auth (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            username VARCHAR(80) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY idx_bcp_auth_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $idColumn = $pdo->query("SHOW COLUMNS FROM bcp_auth LIKE 'id'")->fetch(PDO::FETCH_ASSOC);
    if (!$idColumn) {
        authRespond(503, ['ok' => false, 'error' => 'Could not prepare account storage. Check api/schema.sql.']);
    }
    if (strpos(strtolower((string) $idColumn['Extra']), 'auto_increment') === false) {
        $pdo->exec('ALTER TABLE bcp_auth MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT');
    }
} catch (PDOException $error) {
    error_log('BCP tracker account schema migration error: ' . $error->getMessage());
    authRespond(503, ['ok' => false, 'error' => 'Could not prepare account storage. Check MySQL permissions and api/schema.sql.']);
}

if ($method === 'GET') {
    $configured = (int) $pdo->query('SELECT COUNT(*) FROM bcp_auth')->fetchColumn() > 0;
    authRespond(200, [
        'ok' => true,
        'configured' => $configured,
        'authenticated' => isBcpAuthenticated(),
    ]);
}

$action = $payload['action'] ?? '';
$username = $payload['username'] ?? '';
$password = $payload['password'] ?? '';
if (!is_string($username) || !is_string($password)) {
    authRespond(400, ['ok' => false, 'error' => 'Enter a valid username and password.']);
}
$username = trim($username);

if ($action === 'register' || $action === 'setup') {
    if (!preg_match('/^[A-Za-z0-9._@-]{3,80}$/D', $username)) {
        authRespond(400, ['ok' => false, 'error' => 'Use 3–80 letters, numbers, or . _ @ - for the username.']);
    }
    if (strlen($password) < 12 || strlen($password) > 1024) {
        authRespond(400, ['ok' => false, 'error' => 'Choose a password with at least 12 characters.']);
    }
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if ($passwordHash === false) {
        authRespond(500, ['ok' => false, 'error' => 'Could not securely prepare the password.']);
    }

    try {
        $statement = $pdo->prepare('INSERT INTO bcp_auth (username, password_hash) VALUES (?, ?)');
        $statement->execute([$username, $passwordHash]);
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            authRespond(409, ['ok' => false, 'error' => 'That username is already in use. Choose another.']);
        }
        error_log('BCP tracker account registration failed: ' . $error->getMessage());
        authRespond(500, ['ok' => false, 'error' => 'Could not create the account.']);
    }

    authRespond(200, ['ok' => true]);
}

if ($action === 'login') {
    if ($username === '' || strlen($username) > 80 || $password === '' || strlen($password) > 1024) {
        authRespond(401, ['ok' => false, 'error' => 'Username or password is incorrect.']);
    }
    $statement = $pdo->prepare('SELECT username, password_hash FROM bcp_auth WHERE username = ?');
    $statement->execute([$username]);
    $account = $statement->fetch();
    if (!$account || !password_verify($password, $account['password_hash'])) {
        authRespond(401, ['ok' => false, 'error' => 'Username or password is incorrect.']);
    }

    session_regenerate_id(true);
    $_SESSION['bcp_authenticated'] = true;
    authRespond(200, ['ok' => true]);
}

authRespond(400, ['ok' => false, 'error' => 'Choose a valid login action.']);
