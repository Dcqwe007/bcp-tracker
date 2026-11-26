<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/session.php';
requireBcpAuthentication();

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readText(array $site, string $key, int $maxLength = 5000): string
{
    $value = $site[$key] ?? '';
    if (!is_string($value) && !is_numeric($value)) {
        throw new InvalidArgumentException("Invalid value for {$key}.");
    }

    $value = (string) $value;
    if (strlen($value) > $maxLength) {
        throw new InvalidArgumentException("Value for {$key} is too long.");
    }

    return $value;
}

function readMonthNumber(array $site, string $key): ?int
{
    $value = $site[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }

    $month = filter_var($value, FILTER_VALIDATE_INT);
    if ($month === false || $month < 1 || $month > 12) {
        throw new InvalidArgumentException("Invalid month number for {$key}.");
    }

    return $month;
}

try {
    $pdo = connectBcpDatabase();
} catch (PDOException $error) {
    error_log('BCP tracker database connection failed: ' . $error->getMessage());
    respond(503, [
        'ok' => false,
        'error' => 'Cannot connect to MySQL. Check api/config.php and import api/schema.sql.',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        $rows = $pdo->query(
            'SELECT id, cluster, site, address, network_status, network_month,
                    network_month_num, network_date, network_crq, network_remarks,
                    server_status, server_month, server_month_num, server_date,
                    server_crq, server_remarks, overall_status
             FROM sites
             ORDER BY sort_order ASC, id ASC'
        )->fetchAll();

        $sites = array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'cluster' => $row['cluster'],
                'site' => $row['site'],
                'address' => $row['address'],
                'networkStatus' => $row['network_status'],
                'networkMonth' => $row['network_month'],
                'networkMonthNum' => $row['network_month_num'] === null ? null : (int) $row['network_month_num'],
                'networkDate' => $row['network_date'],
                'networkCRQ' => $row['network_crq'],
                'networkRemarks' => $row['network_remarks'],
                'serverStatus' => $row['server_status'],
                'serverMonth' => $row['server_month'],
                'serverMonthNum' => $row['server_month_num'] === null ? null : (int) $row['server_month_num'],
                'serverDate' => $row['server_date'],
                'serverCRQ' => $row['server_crq'],
                'serverRemarks' => $row['server_remarks'],
                'overallStatus' => $row['overall_status'],
            ];
        }, $rows);

        respond(200, ['ok' => true, 'sites' => $sites]);
    } catch (Throwable $error) {
        error_log('BCP tracker could not read sites: ' . $error->getMessage());
        respond(500, ['ok' => false, 'error' => 'Could not load sites from MySQL.']);
    }
}

if ($method !== 'PUT') {
    header('Allow: GET, PUT');
    respond(405, ['ok' => false, 'error' => 'Use GET to load sites or PUT to save them.']);
}

try {
    $payload = json_decode((string) file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($payload) || !isset($payload['sites']) || !is_array($payload['sites'])) {
        respond(400, ['ok' => false, 'error' => 'The request must contain a sites array.']);
    }

    $clusters = ['Noel', 'Bel', 'VisMin', 'AJ'];
    $statuses = ['Completed', 'In Progress', 'Not Started'];
    $normalized = [];
    $ids = [];

    foreach ($payload['sites'] as $index => $site) {
        if (!is_array($site)) {
            throw new InvalidArgumentException('Each site must be an object.');
        }

        $id = readText($site, 'id', 80);
        $cluster = readText($site, 'cluster', 20);
        $name = readText($site, 'site', 255);
        $networkStatus = readText($site, 'networkStatus', 20);
        $serverStatus = readText($site, 'serverStatus', 20);

        if ($id === '' || $name === '' || !in_array($cluster, $clusters, true)) {
            throw new InvalidArgumentException('A site needs an id, name, and valid cluster.');
        }
        if (isset($ids[$id])) {
            throw new InvalidArgumentException('Site IDs must be unique.');
        }
        if (!in_array($networkStatus, $statuses, true) || !in_array($serverStatus, $statuses, true)) {
            throw new InvalidArgumentException('Site statuses must be Completed, In Progress, or Not Started.');
        }

        $overallStatus = $networkStatus === 'Completed' && $serverStatus === 'Completed'
            ? 'Fully Completed'
            : ($networkStatus === 'Not Started' && $serverStatus === 'Not Started'
                ? 'Not Started'
                : 'Partially Completed');

        $ids[$id] = true;
        $normalized[] = [
            $id,
            $index,
            $cluster,
            $name,
            readText($site, 'address'),
            $networkStatus,
            readText($site, 'networkMonth', 20),
            readMonthNumber($site, 'networkMonthNum'),
            readText($site, 'networkDate', 20),
            readText($site, 'networkCRQ', 255),
            readText($site, 'networkRemarks'),
            $serverStatus,
            readText($site, 'serverMonth', 20),
            readMonthNumber($site, 'serverMonthNum'),
            readText($site, 'serverDate', 20),
            readText($site, 'serverCRQ', 255),
            readText($site, 'serverRemarks'),
            $overallStatus,
        ];
    }

    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM sites');
    $statement = $pdo->prepare(
        'INSERT INTO sites (
            id, sort_order, cluster, site, address, network_status, network_month,
            network_month_num, network_date, network_crq, network_remarks,
            server_status, server_month, server_month_num, server_date,
            server_crq, server_remarks, overall_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($normalized as $row) {
        $statement->execute($row);
    }
    $pdo->commit();

    respond(200, ['ok' => true, 'saved' => count($normalized)]);
} catch (JsonException | InvalidArgumentException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(400, ['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('BCP tracker could not save sites: ' . $error->getMessage());
    respond(500, ['ok' => false, 'error' => 'Could not save sites to MySQL.']);
}
