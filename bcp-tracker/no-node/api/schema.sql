CREATE DATABASE IF NOT EXISTS bcp_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bcp_tracker;

CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  cluster VARCHAR(20) NOT NULL,
  site VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL DEFAULT '',
  network_status VARCHAR(20) NOT NULL,
  network_month VARCHAR(20) NULL,
  network_month_num TINYINT UNSIGNED NULL,
  network_date VARCHAR(20) NULL,
  network_crq VARCHAR(255) NULL,
  network_remarks TEXT NULL,
  server_status VARCHAR(20) NOT NULL,
  server_month VARCHAR(20) NULL,
  server_month_num TINYINT UNSIGNED NULL,
  server_date VARCHAR(20) NULL,
  server_crq VARCHAR(255) NULL,
  server_remarks TEXT NULL,
  overall_status VARCHAR(30) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sites_cluster (cluster),
  KEY idx_sites_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bcp_auth (
  id TINYINT UNSIGNED NOT NULL,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_bcp_auth_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
