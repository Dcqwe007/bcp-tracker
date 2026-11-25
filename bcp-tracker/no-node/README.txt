BCP Site Tracker — no-Node.js edition

Run without XAMPP
1. Open index.html in a modern browser.
2. No Node.js, npm, build step, or web server is required.
3. This mode saves site records in this browser only.

Connect through XAMPP and MySQL
1. Copy the contents of this folder into C:\xampp\htdocs\bcp-tracker\.
2. Start Apache and MySQL from the XAMPP Control Panel.
3. In phpMyAdmin, import api\schema.sql. It creates the bcp_tracker database
   and sites table.
4. Open http://localhost/bcp-tracker/ in your browser.
5. On first connection, the dashboard seeds the database with the 48 baseline
   sites. Later edits are saved in MySQL and shared by browsers using this URL.

XAMPP connection settings are in api\config.php. The defaults are MySQL at
127.0.0.1:3306, database bcp_tracker, username root, and a blank password.
Update those values if your MySQL account uses a password or another port.
The PHP PDO MySQL extension must be enabled in XAMPP.
The API is intended for local development and has no user authentication.
Do not expose this XAMPP instance to the public internet.

Features
- Overview charts and summary metrics
- Search, cluster, status, track, and month filters
- Site cards and sortable directory table
- Calendar, status board, and timeline views
- Site detail editing with MySQL storage in XAMPP or local browser storage
- CSV import and export
- Light/dark theme and cross-tab synchronization

Spreadsheet import
This dependency-free edition imports CSV files. If you have an Excel workbook,
save or export it as CSV before importing. Use Export CSV to keep a separate
copy of your data.
