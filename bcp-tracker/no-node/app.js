(function () {
  'use strict';

  const STORAGE_KEY = 'bcp_readiness_sites_v2';
  const THEME_KEY = 'bcp_readiness_theme_v2';
  const API_URL = 'api/sites.php';
  const clusters = ['Noel', 'Bel', 'VisMin', 'AJ'];
  const months = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNumbers = Object.fromEntries(months.map((month, index) => [month, index + 3]));
  const views = [
    ['analytics', 'Overview & Charts'],
    ['matrix', 'All Sites'],
    ['calendar', 'Calendar'],
    ['kanban', 'Status Board'],
    ['timeline', 'Timeline'],
    ['mop', 'How-to Guide']
  ];
  const app = document.getElementById('app');
  let databaseState = window.location.protocol === 'file:' ? 'browser' : 'connecting';
  let storageMode = 'browser';
  let sites = readSites();
  let dark = readTheme();
  let currentView = 'analytics';
  let filters = { search: '', cluster: 'All', track: 'Both', status: 'All', asOfMonth: 'All' };
  let layoutMode = 'cards';
  let sortBy = 'cluster';
  let sortDirection = 1;
  let editingSite = null;
  let selectedDate = '2026-11-22';
  let calendarMonth = 10;
  let toastTimer;
  let toastMessage = '';
  let saveQueue = Promise.resolve();

  function readSites() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
        throw new Error('Saved site data is not a list.');
      }
    } catch (error) {
      console.error('Unable to load saved site data:', error);
    }
    return window.initialSitesData.map((site) => ({ ...site }));
  }

  function readTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : saved === 'dark';
    } catch (error) {
      console.error('Unable to load saved theme:', error);
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  async function requestDatabase(url, options) {
    const response = await fetch(url, options);
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('The XAMPP API returned an invalid response.');
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `XAMPP request failed (${response.status}).`);
    }
    return payload;
  }

  function writeDatabaseSites(updated) {
    return requestDatabase(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ sites: updated })
    });
  }

  async function saveSites(updated) {
    if (databaseState === 'connecting') {
      showToast('Wait for the XAMPP database connection to finish.');
      return false;
    }

    const previous = sites;
    sites = updated;
    render();

    if (storageMode === 'database') {
      const write = saveQueue.then(() => writeDatabaseSites(updated));
      saveQueue = write.catch(() => undefined);
      try {
        await write;
        databaseState = 'connected';
      } catch (error) {
        console.error('Unable to save site data to XAMPP:', error);
        if (sites === updated) sites = previous;
        databaseState = 'offline';
        render();
        showToast('XAMPP save failed. Changes were reverted; check Apache, MySQL, and the database setup.');
        return false;
      }
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
      } catch (error) {
        console.error('Unable to save site data:', error);
        if (sites === updated) sites = previous;
        render();
        showToast('Could not save changes in this browser. Check storage permissions.');
        return false;
      }
    }

    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('bcp_realtime_sync_channel');
        channel.postMessage({ type: 'SITES_UPDATED', payload: sites });
        channel.close();
      }
    } catch (error) {
      console.error('Unable to sync site changes:', error);
    }
    render();
    return true;
  }

  async function connectToDatabase() {
    if (window.location.protocol === 'file:') return;

    try {
      const response = await requestDatabase(API_URL, {
        headers: { 'Accept': 'application/json' }
      });
      if (!Array.isArray(response.sites)) {
        throw new Error('The XAMPP API did not return a sites list.');
      }

      if (response.sites.length === 0) {
        sites = window.initialSitesData.map((site) => ({ ...site }));
        await writeDatabaseSites(sites);
      } else {
        sites = response.sites;
      }

      storageMode = 'database';
      databaseState = 'connected';
      render();
      showToast('Connected to XAMPP MySQL.');
    } catch (error) {
      console.error('Unable to connect to XAMPP:', error);
      storageMode = 'browser';
      databaseState = 'offline';
      render();
      showToast('XAMPP is not connected. Check Apache/MySQL, api/config.php, and import api/schema.sql.');
    }
  }

  function showToast(message) {
    toastMessage = message;
    renderToast();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMessage = '';
      renderToast();
    }, 3200);
  }

  function renderToast() {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    if (!toastMessage) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = toastMessage;
    document.body.appendChild(toast);
  }

  function overallStatus(site) {
    if (site.networkStatus === 'Completed' && site.serverStatus === 'Completed') return 'Fully Completed';
    if (site.networkStatus === 'Not Started' && site.serverStatus === 'Not Started') return 'Not Started';
    return 'Partially Completed';
  }

  function getFilteredSites() {
    const maxMonth = filters.asOfMonth === 'All' ? Infinity : (monthNumbers[filters.asOfMonth] || 12);
    const query = filters.search.trim().toLowerCase();
    return sites.filter((site) => {
      if (filters.cluster !== 'All' && site.cluster !== filters.cluster) return false;
      if (query) {
        const text = [site.site, site.address, site.networkCRQ, site.serverCRQ, site.networkRemarks, site.serverRemarks].join(' ').toLowerCase();
        if (!text.includes(query)) return false;
      }
      if (filters.status !== 'All') {
        if (filters.track === 'Network' && site.networkStatus !== filters.status) return false;
        if (filters.track === 'Server' && site.serverStatus !== filters.status) return false;
        if (filters.track === 'Both') {
          if (filters.status === 'Completed' && (site.networkStatus !== 'Completed' || site.serverStatus !== 'Completed')) return false;
          if (filters.status === 'In Progress' && site.networkStatus !== 'In Progress' && site.serverStatus !== 'In Progress') return false;
          if (filters.status === 'Not Started' && site.networkStatus !== 'Not Started' && site.serverStatus !== 'Not Started') return false;
        }
      }
      if (maxMonth !== Infinity) {
        const netMonth = site.networkMonthNum || monthNumbers[site.networkMonth] || 99;
        const srvMonth = site.serverMonthNum || monthNumbers[site.serverMonth] || 99;
        if (filters.track === 'Network' && netMonth > maxMonth) return false;
        if (filters.track === 'Server' && srvMonth > maxMonth) return false;
        if (filters.track === 'Both' && netMonth > maxMonth && srvMonth > maxMonth) return false;
      }
      return true;
    });
  }

  function calculateMetrics(list) {
    const total = list.length;
    const netCompleted = list.filter((site) => site.networkStatus === 'Completed').length;
    const netInProgress = list.filter((site) => site.networkStatus === 'In Progress').length;
    const netNotStarted = list.filter((site) => site.networkStatus === 'Not Started').length;
    const srvCompleted = list.filter((site) => site.serverStatus === 'Completed').length;
    const srvInProgress = list.filter((site) => site.serverStatus === 'In Progress').length;
    const srvNotStarted = list.filter((site) => site.serverStatus === 'Not Started').length;
    const fullyCompleted = list.filter((site) => overallStatus(site) === 'Fully Completed').length;
    const notStarted = list.filter((site) => overallStatus(site) === 'Not Started').length;
    const percent = (completed) => total ? Math.round(completed / total * 1000) / 10 : 0;
    return {
      total, netCompleted, netInProgress, netNotStarted, srvCompleted, srvInProgress, srvNotStarted,
      fullyCompleted, notStarted, partiallyCompleted: total - fullyCompleted - notStarted,
      netPercent: percent(netCompleted), srvPercent: percent(srvCompleted)
    };
  }

  function metricCard(label, value, sub, progress, action) {
    return `<button class="metric" data-action="${action}">
      <div class="metric-label">${label}</div><div class="metric-value">${value}</div>
      ${progress === null ? '' : `<div class="progress"><span style="width:${progress}%"></span></div>`}
      <div class="metric-sub">${sub}</div></button>`;
  }

  function renderHeader() {
    const search = `<input class="search" id="searchBox" placeholder="Find site, CRQ, city..." value="${escapeHtml(filters.search)}" aria-label="Search sites">`;
    const nav = views.map(([id, label]) => `<button class="${currentView === id ? 'active' : ''}" data-action="view" data-view="${id}">${label}</button>`).join('');
    const mobileNav = views.map(([id, label]) => `<button class="${currentView === id ? 'active' : ''}" data-action="view" data-view="${id}">${label}</button>`).join('');
    const connectionLabel = databaseState === 'connected' ? 'XAMPP · Connected' :
      databaseState === 'connecting' ? 'XAMPP · Connecting' :
        databaseState === 'offline' ? 'XAMPP · Offline' : 'Browser Storage';
    return `<header class="topbar"><div class="top-inner">
      <div class="top-row">
        <div class="brand"><div class="brand-mark">BCP</div><div><h1>BCP Site Tracker <span class="brand-badge">${sites.length} Sites</span></h1><p>Server &amp; Network Business Continuity Readiness</p><span class="connection-pill ${databaseState}">${connectionLabel}</span></div></div>
        <nav class="nav" aria-label="Dashboard views">${nav}</nav>
        <div class="actions">${search}
          <button class="button primary" data-action="import"><span class="wide-label">Import CSV</span> ⤒</button>
          <button class="button quiet" data-action="export" title="Export CSV">↓</button>
          <button class="button quiet" data-action="reset" title="Reset baseline">↺</button>
          <button class="button quiet" data-action="theme" title="Toggle color theme">${dark ? '☀' : '☾'}</button>
        </div>
      </div>
      <nav class="mobile-nav" aria-label="Dashboard views">${mobileNav}</nav>
      <input id="csvInput" class="hidden" type="file" accept=".csv,text/csv">
    </div></header>`;
  }

  function renderMetrics(list, metrics) {
    return `<section class="metrics" aria-label="Summary metrics">
      ${metricCard('Total Monitored', metrics.total, '4 clusters · Noel, Bel, VisMin, AJ', null, 'metric-all')}
      ${metricCard('Network BCP', `${metrics.netPercent}%`, `${metrics.netCompleted} completed · ${metrics.netInProgress} active · ${metrics.netNotStarted} not started`, metrics.netPercent, 'metric-network')}
      ${metricCard('Server BCP', `${metrics.srvPercent}%`, `${metrics.srvCompleted} completed · ${metrics.srvInProgress} active · ${metrics.srvNotStarted} not started`, metrics.srvPercent, 'metric-server')}
      ${metricCard('Fully Signed Off', `${metrics.fullyCompleted}`, `of ${metrics.total} sites ready in both tracks`, metrics.total ? metrics.fullyCompleted / metrics.total * 100 : 0, 'metric-completed')}
      ${metricCard('Server Action Queue', `${metrics.srvInProgress + metrics.srvNotStarted}`, `${metrics.srvInProgress} in progress · ${metrics.srvNotStarted} not started`, null, 'metric-active')}
    </section>`;
  }

  function renderFilters(list) {
    const clusterButtons = ['All', ...clusters].map((cluster) =>
      `<button class="pill ${filters.cluster === cluster ? 'active' : ''}" data-action="cluster" data-value="${cluster}">${cluster === 'All' ? 'All Clusters' : cluster}<small>${cluster === 'All' ? sites.length : sites.filter((site) => site.cluster === cluster).length}</small></button>`
    ).join('');
    const monthsOptions = ['All', ...months.slice(0, 9)].map((month) =>
      `<option value="${month}" ${filters.asOfMonth === month ? 'selected' : ''}>${month === 'All' ? 'All Months' : `As of ${month} 2026`}</option>`
    ).join('');
    return `<section class="panel filters" aria-label="Site filters">
      <div class="filter-row"><div class="pill-row"><span class="metric-label">Cluster</span>${clusterButtons}</div>
      <div class="quick-row">
        <button class="pill quick ${filters.status === 'All' && filters.track === 'Both' ? 'active' : ''}" data-action="quick-all">All Sites</button>
        <button class="pill quick ${filters.status === 'In Progress' ? 'active' : ''}" data-action="quick-active">Active Failovers</button>
        <button class="pill quick ${filters.status === 'Completed' ? 'active' : ''}" data-action="quick-completed">Fully Signed Off</button>
      </div></div>
      <div class="filter-row"><div class="select-row">
        <select class="select" id="trackFilter" aria-label="Track"><option value="Both">Both Net &amp; Server</option><option value="Network">Network BCP only</option><option value="Server">Server BCP only</option></select>
        <select class="select" id="monthFilter" aria-label="Progression month">${monthsOptions}</select>
        <select class="select" id="statusFilter" aria-label="Status">
          <option value="All">All statuses</option><option>Completed</option><option>In Progress</option><option>Not Started</option>
        </select>
        <button class="button quiet ${filters.cluster === 'All' && filters.track === 'Both' && filters.status === 'All' && filters.asOfMonth === 'All' && !filters.search ? 'hidden' : ''}" data-action="clear">Clear filters</button>
      </div><div class="counter">Showing <strong>${list.length}</strong> of ${sites.length} sites</div></div>
    </section>`;
  }

  function renderOverview(list, metrics) {
    const clusterRows = clusters.map((cluster) => {
      const rows = list.filter((site) => site.cluster === cluster);
      const net = rows.filter((site) => site.networkStatus === 'Completed').length;
      const srv = rows.filter((site) => site.serverStatus === 'Completed').length;
      const denominator = rows.length || 1;
      return `<div class="cluster-line"><div class="cluster-name">${cluster}<small class="metric-sub"> · ${rows.length}</small></div>
        <div class="dual-bars"><div class="bar-line"><span style="width:${net / denominator * 100}%"></span></div><div class="bar-line server"><span style="width:${srv / denominator * 100}%"></span></div></div>
        <div class="cluster-numbers">Net ${net} · Srv ${srv}</div></div>`;
    }).join('');
    const monthlyBars = months.slice(0, 9).map((month, index) => {
      const m = index + 3;
      const netCount = list.filter((site) => site.networkStatus === 'Completed' && (site.networkMonthNum || monthNumbers[site.networkMonth] || 99) <= m).length;
      const srvCount = list.filter((site) => site.serverStatus === 'Completed' && (site.serverMonthNum || monthNumbers[site.serverMonth] || 99) <= m).length;
      const denominator = list.length || 1;
      return `<div class="month-col" title="${month}: Network ${netCount}, Server ${srvCount}"><span class="net" style="height:${netCount / denominator * 100}%"></span><span class="srv" style="height:${srvCount / denominator * 100}%"></span></div>`;
    }).join('');
    const monthLabels = months.slice(0, 9).map((month) => `<span>${month.slice(0, 3)}</span>`).join('');
    const priority = list.filter((site) => site.serverStatus !== 'Completed').slice(0, 5);
    return `<div class="overview-grid">
      <section class="panel"><div class="section-heading"><div><h2>Cluster Readiness</h2><p>Completed sites by cluster · Network and Server</p></div></div>
        <div class="legend"><span><i style="background:var(--sky)"></i>Network</span><span><i style="background:var(--accent)"></i>Server</span></div><div class="cluster-list">${clusterRows}</div></section>
      <section class="panel"><div class="section-heading"><div><h2>Monthly Progression</h2><p>Cumulative completed sites from March to November 2026</p></div></div>
        <div class="month-chart">${monthlyBars}</div><div class="month-labels">${monthLabels}</div>
        <div class="legend"><span><i style="background:var(--sky)"></i>Network</span><span><i style="background:var(--accent)"></i>Server</span></div></section>
      <section class="panel"><div class="section-heading"><div><h2>Readiness Snapshot</h2><p>${metrics.fullyCompleted} fully signed off · ${metrics.partiallyCompleted} in progress · ${metrics.notStarted} not started</p></div>
        <button class="button" data-action="view" data-view="matrix">Open directory</button></div>
        <div class="progress"><span style="width:${metrics.total ? metrics.fullyCompleted / metrics.total * 100 : 0}%;background:var(--green)"></span></div>
        <div class="metric-sub">${metrics.fullyCompleted} of ${metrics.total} sites completed both tracks</div></section>
      <section class="panel"><div class="section-heading"><div><h2>Server Action Queue</h2><p>Sites with remaining server work</p></div></div>
        ${priority.length ? `<div class="table-wrap"><table><thead><tr><th>Site</th><th>Cluster</th><th>Server status</th></tr></thead><tbody>${priority.map((site) => `<tr data-action="edit" data-id="${escapeHtml(site.id)}"><td>${escapeHtml(site.site)}</td><td>${escapeHtml(site.cluster)}</td><td>${statusTag(site.serverStatus)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No sites in the server action queue.</div>'}</section>
    </div>`;
  }

  function statusTag(status) {
    return `<span class="status ${status.replace(' ', '-')}">${escapeHtml(status)}</span>`;
  }

  function readinessTag(site) {
    const status = overallStatus(site);
    return status === 'Fully Completed' ? '<span class="tag success">Fully Ready</span>' :
      status === 'Not Started' ? '<span class="tag neutral">Not Started</span>' : '<span class="tag warning">In Progress</span>';
  }

  function siteCard(site) {
    return `<article class="site-card" data-action="edit" data-id="${escapeHtml(site.id)}">
      <div class="card-top"><span class="tag ${escapeHtml(site.cluster)}">Cluster ${escapeHtml(site.cluster)}</span>${readinessTag(site)}</div>
      <h3>${escapeHtml(site.site)}</h3><div class="address">${escapeHtml(site.address || 'Address pending verification')}</div>
      <div class="tracks">
        ${trackCard(site, 'network', 'Network', site.networkStatus, site.networkDate, site.networkCRQ)}
        ${trackCard(site, 'server', 'Server', site.serverStatus, site.serverDate, site.serverCRQ)}
      </div>
      <div class="card-bottom"><span>${escapeHtml(site.serverRemarks || site.networkRemarks || 'Standard MOP verified')}</span><button class="button" data-action="edit" data-id="${escapeHtml(site.id)}">Details</button></div>
    </article>`;
  }

  function trackCard(site, track, label, status, date, crq) {
    return `<div class="track ${track}"><div class="track-head"><span>${label}</span>
      <button class="status ${status.replace(' ', '-')}" data-action="cycle" data-track="${track}" data-id="${escapeHtml(site.id)}" title="Click to cycle status">${escapeHtml(status)}</button></div>
      <div class="track-date">${escapeHtml(date || 'Date TBD')}</div><div class="crq">${escapeHtml(crq || 'CRQ pending')}</div></div>`;
  }

  function sorted(list) {
    return [...list].sort((a, b) => String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')) * sortDirection);
  }

  function renderMatrix(list) {
    const sitesSorted = sorted(list);
    return `<section class="panel"><div class="section-heading"><div><h2>Site Readiness Directory (${list.length})</h2><p>Click a site for details or click a status to cycle it.</p></div>
      <div class="quick-row"><button class="button ${layoutMode === 'cards' ? 'primary' : ''}" data-action="layout" data-layout="cards">Cards</button><button class="button ${layoutMode === 'table' ? 'primary' : ''}" data-action="layout" data-layout="table">Table</button></div></div>
      ${layoutMode === 'cards' ? (sitesSorted.length ? `<div class="site-grid">${sitesSorted.map(siteCard).join('')}</div>` : '<div class="empty">No sites match these filters.</div>') : renderSiteTable(sitesSorted)}
    </section>`;
  }

  function renderSiteTable(list) {
    return `<div class="table-wrap"><table><thead><tr>
      ${[['cluster','Cluster'],['site','Site'],['networkStatus','Network'],['serverStatus','Server'],['overallStatus','Readiness']].map(([key,label]) => `<th data-action="sort" data-sort="${key}">${label}${sortBy === key ? (sortDirection > 0 ? ' ↑' : ' ↓') : ' ↕'}</th>`).join('')}
      <th>Action</th></tr></thead><tbody>${list.map((site) => `<tr data-action="edit" data-id="${escapeHtml(site.id)}">
      <td><span class="tag ${escapeHtml(site.cluster)}">${escapeHtml(site.cluster)}</span></td><td><strong>${escapeHtml(site.site)}</strong><br><span class="metric-sub">${escapeHtml(site.address)}</span></td>
      <td>${statusTag(site.networkStatus)}<br><button class="button" data-action="cycle" data-track="network" data-id="${escapeHtml(site.id)}">Update</button></td>
      <td>${statusTag(site.serverStatus)}<br><button class="button" data-action="cycle" data-track="server" data-id="${escapeHtml(site.id)}">Update</button></td>
      <td>${readinessTag(site)}</td><td><button class="button" data-action="edit" data-id="${escapeHtml(site.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function getEvents(list) {
    const events = [];
    list.forEach((site) => {
      if (site.networkDate) events.push({ site, track: 'Network', date: site.networkDate, status: site.networkStatus, crq: site.networkCRQ || 'CRQ Pending', remarks: site.networkRemarks });
      if (site.serverDate) events.push({ site, track: 'Server', date: site.serverDate, status: site.serverStatus, crq: site.serverCRQ && site.serverCRQ !== 'NA' ? site.serverCRQ : 'No Local Server / NA', remarks: site.serverRemarks });
    });
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderCalendar(list) {
    const first = new Date(2026, calendarMonth, 1).getDay();
    const days = new Date(2026, calendarMonth + 1, 0).getDate();
    const dateCells = Array.from({ length: first }, () => '<div></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = `2026-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const events = getEvents(list).filter((event) => event.date === date);
      dateCells.push(`<button class="day ${selectedDate === date ? 'selected' : ''}" data-action="date" data-date="${date}"><span class="day-num">${day}</span>${events.slice(0, 2).map((event) => `<div class="event-label">${escapeHtml(event.track)} · ${escapeHtml(event.site.site.split(',')[0])}</div><div class="event-dot ${event.track === 'Server' ? 'server' : ''}"></div>`).join('')}${events.length > 2 ? `<div class="event-label">+${events.length - 2} more</div>` : ''}</button>`);
    }
    const events = getEvents(list).filter((event) => event.date === selectedDate);
    const monthTitle = new Date(2026, calendarMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const calendarEvents = events.length ? events.map((event) => `<div class="event-card" data-action="edit" data-id="${escapeHtml(event.site.id)}">
      <span class="tag ${event.track === 'Network' ? '' : 'Bel'}">${event.track} BCP</span><h4>${escapeHtml(event.site.site)}</h4><p>${escapeHtml(event.crq)} · ${escapeHtml(event.status)}</p><p>${escapeHtml(event.remarks || 'Standard MOP switching executed')}</p>
      <button class="button" data-action="calendar-toggle" data-id="${escapeHtml(event.site.id)}" data-track="${event.track.toLowerCase()}">${event.status === 'Completed' ? 'Mark In Progress' : 'Mark Completed'}</button></div>`).join('') : '<div class="empty">No failovers on this date.</div>';
    return `<div class="calendar-layout"><section class="panel">
      <div class="section-heading"><div><h2>Live Failover Execution Calendar</h2><p>${getEvents(list).length} events tracked across sites</p></div>
      <div class="quick-row"><button class="button" data-action="month" data-delta="-1" ${calendarMonth <= 2 ? 'disabled' : ''}>‹</button><strong>${monthTitle}</strong><button class="button" data-action="month" data-delta="1" ${calendarMonth >= 11 ? 'disabled' : ''}>›</button></div></div>
      <div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => `<div class="weekday">${day}</div>`).join('')}${dateCells.join('')}</div>
    </section><section class="panel"><div class="section-heading"><div><h2>Failovers on ${escapeHtml(selectedDate)}</h2><p>${events.length} scheduled or recorded</p></div></div>${calendarEvents}</section></div>`;
  }

  function boardGroup(list) {
    return [
      ['Fully Ready', list.filter((site) => overallStatus(site) === 'Fully Completed')],
      ['In Progress', list.filter((site) => site.networkStatus === 'In Progress' || site.serverStatus === 'In Progress')],
      ['Network Done · Server Pending', list.filter((site) => site.networkStatus === 'Completed' && site.serverStatus === 'Not Started')],
      ['Not Started', list.filter((site) => overallStatus(site) === 'Not Started')],
      ['Other Partial', list.filter((site) => overallStatus(site) === 'Partially Completed' && site.networkStatus !== 'In Progress' && site.serverStatus !== 'In Progress' && !(site.networkStatus === 'Completed' && site.serverStatus === 'Not Started'))]
    ];
  }

  function renderKanban(list) {
    return `<div class="board">${boardGroup(list).map(([title, items]) => `<section class="board-column"><div class="board-title"><span>${title}</span><span>${items.length}</span></div><div class="board-items">${items.length ? items.map((site) => `<article class="site-card" data-action="edit" data-id="${escapeHtml(site.id)}"><div class="card-top"><span class="tag ${escapeHtml(site.cluster)}">${escapeHtml(site.cluster)}</span><button class="button" data-action="advance" data-id="${escapeHtml(site.id)}">Update ›</button></div><h3>${escapeHtml(site.site)}</h3><div class="metric-sub">Network: ${escapeHtml(site.networkStatus)}<br>Server: ${escapeHtml(site.serverStatus)}</div></article>`).join('') : '<div class="empty">No sites in this stage.</div>'}</div></section>`).join('')}</div>`;
  }

  function renderTimeline(list) {
    return `<section class="panel"><div class="section-heading"><div><h2>BCP Execution Timeline</h2><p>Failover milestones across Network and Server tracks · March–December 2026</p></div></div>
      <div class="timeline-wrap"><div class="timeline"><div class="timeline-months"><div>Site / Cluster</div>${months.map((month) => `<div>${month.slice(0,3)}</div>`).join('')}</div>
      ${clusters.map((cluster) => `<div class="metric-label" style="padding:12px 0 5px">Cluster ${cluster}</div>${list.filter((site) => site.cluster === cluster).map((site) => {
        const net = (site.networkMonthNum || monthNumbers[site.networkMonth] || 0) - 3;
        const srv = (site.serverMonthNum || monthNumbers[site.serverMonth] || 0) - 3;
        return `<div class="timeline-row" data-action="edit" data-id="${escapeHtml(site.id)}"><div class="timeline-site">${escapeHtml(site.site)}</div>${months.map((_, index) => `<div class="timeline-cell">${index === net && net >= 0 ? '<span class="mark" title="Network"></span>' : ''}${index === srv && srv >= 0 ? '<span class="mark server" title="Server"></span>' : ''}</div>`).join('')}</div>`;
      }).join('')}`).join('')}</div></div></section>`;
  }

  function renderGuide() {
    const procedures = window.bcpMethodOfProcedures || {};
    const server = procedures.server || {};
    const commands = Array.isArray(server.testingChecklist) ? server.testingChecklist : [];
    return `<section class="panel" style="margin-bottom:14px"><h2>Step-by-Step BCP Method of Procedure</h2><p class="metric-sub">Standard operating procedures, failover sequences, and verification guidance</p></section>
      <div class="guide-grid">
        <section class="panel"><h2>Network Failover Sequence (Router FO)</h2><div class="guide-step"><strong>Stage 1 (Saturday):</strong> Load Balanced → MK2. Operate the MK2 circuit for the day.</div><div class="guide-step"><strong>Stage 2 (Sunday):</strong> MK2 → ALA. Switch to the secondary circuit for the day.</div><div class="guide-step"><strong>Stage 3 (Monday):</strong> ALA → Load Balanced. Restore normal dual-circuit balancing.</div><div class="guide-step"><strong>Pre-test:</strong> Run ping and trace on key tools to establish baseline latency and obtain Operations sign-off.</div><div class="guide-step"><strong>Post-test:</strong> Compare trace results after failover and confirm routing without packet loss.</div></section>
        <section class="panel"><h2>Server Switching Hierarchy (AD, DNS &amp; DHCP)</h2><div class="guide-step"><strong>Three-tier redundancy:</strong><br>Localized Server → Secondary (MK2) → Tertiary (ALA)</div><p class="metric-sub">Configuration varies by site depending on local domain controllers and connections to Tera/ALA.</p><h3>Verification commands</h3>
          ${commands.map((item) => `<div class="command"><div><strong>${escapeHtml(item.tool)}</strong><br><span class="metric-sub">${escapeHtml(item.expected)}</span><br><code>${escapeHtml(item.command)}</code></div><button class="button" data-action="copy" data-copy="${escapeHtml(item.command)}">Copy</button></div>`).join('')}
        </section></div>`;
  }

  function renderModal() {
    if (!editingSite) return '';
    const site = editingSite;
    const input = (label, key, type, full) => `<div class="field ${full ? 'full' : ''}"><label for="field-${key}">${label}</label><input id="field-${key}" name="${key}" type="${type || 'text'}" value="${escapeHtml(site[key] || '')}"></div>`;
    const select = (label, key) => `<div class="field"><label for="field-${key}">${label}</label><select id="field-${key}" name="${key}">${['Completed','In Progress','Not Started'].map((status) => `<option ${site[key] === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>`;
    return `<div class="modal-backdrop" data-action="close-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head"><h2 id="modalTitle">${escapeHtml(site.site)} · Cluster ${escapeHtml(site.cluster)}</h2><button class="button" data-action="close">Close</button></div>
      <form id="siteForm"><div class="form-grid">
        ${input('Site name','site','text',true)}${input('Address','address','text',true)}
        <div class="field full"><strong>Network BCP</strong></div>${select('Status','networkStatus')}${input('Failover date','networkDate','date')}${input('Approved CRQ','networkCRQ')}${input('Remarks','networkRemarks','text',true)}
        <div class="field full"><strong>Server BCP</strong></div>${select('Status','serverStatus')}${input('Failover date','serverDate','date')}${input('Approved CRQ','serverCRQ')}${input('Remarks','serverRemarks','text',true)}
      </div><div class="modal-foot"><button type="button" class="button" data-action="close">Cancel</button><button type="submit" class="button primary">Save Changes</button></div></form>
    </section></div>`;
  }

  function render() {
    document.body.classList.toggle('dark', dark);
    const list = getFilteredSites();
    const metrics = calculateMetrics(list);
    let view;
    if (currentView === 'analytics') view = renderOverview(list, metrics);
    else if (currentView === 'matrix') view = renderMatrix(list);
    else if (currentView === 'calendar') view = renderCalendar(list);
    else if (currentView === 'kanban') view = renderKanban(list);
    else if (currentView === 'timeline') view = renderTimeline(list);
    else view = renderGuide();
    app.innerHTML = `<div class="shell">${renderHeader()}<main class="main">${renderMetrics(list, metrics)}${renderFilters(list)}${view}</main>
      <footer class="footer"><div class="footer-inner"><span><strong>IT BCP READINESS DASHBOARD</strong> · <span>${storageMode === 'database' ? 'XAMPP MySQL storage' : 'Browser storage'}</span></span><span>Clusters: Noel · Bel · VisMin · AJ</span></div></footer>${renderModal()}</div>`;
    const track = document.getElementById('trackFilter');
    const status = document.getElementById('statusFilter');
    if (track) track.value = filters.track;
    if (status) status.value = filters.status;
    const month = document.getElementById('monthFilter');
    if (month) month.value = filters.asOfMonth;
    renderToast();
  }

  async function updateSiteStatus(id, track, status) {
    const updated = sites.map((site) => {
      if (site.id !== id) return site;
      const next = { ...site, [track === 'network' ? 'networkStatus' : 'serverStatus']: status };
      next.overallStatus = overallStatus(next);
      return next;
    });
    if (await saveSites(updated)) showToast(`${track === 'network' ? 'Network' : 'Server'} status updated to ${status}`);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some((value) => value.trim() !== '')) rows.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('CSV must include a header row and at least one site row.');
    const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
    return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  }

  function importCsv(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rows = parseCsv(String(reader.result || ''));
        const validClusters = new Set(clusters);
        const imported = rows.map((row, index) => {
          const value = (...keys) => {
            for (const key of keys) if (row[key] !== undefined && row[key] !== '') return String(row[key]);
            return '';
          };
          const networkStatus = value('Network_Status', 'NetworkStatus') || (value('Network') === 'Completed' ? 'Completed' : 'In Progress');
          const serverStatus = value('Server_Status', 'ServerStatus') || (value('Server') === 'Completed' ? 'Completed' : 'Not Started');
          const cluster = value('Cluster', 'cluster');
          const site = {
            id: `site-imported-${Date.now()}-${index + 1}`,
            cluster: validClusters.has(cluster) ? cluster : 'Bel',
            site: value('Site', 'site', 'Site Name') || `Site ${index + 1}`,
            address: value('Address', 'address'),
            networkStatus: ['Completed','In Progress','Not Started'].includes(networkStatus) ? networkStatus : 'In Progress',
            networkDate: value('Network_Date','NetworkDate'),
            networkCRQ: value('Network_CRQ','NetworkCRQ','CRQ'),
            networkRemarks: value('Network_Remarks','Remarks'),
            serverStatus: ['Completed','In Progress','Not Started'].includes(serverStatus) ? serverStatus : 'Not Started',
            serverDate: value('Server_Date','ServerDate'),
            serverCRQ: value('Server_CRQ','ServerCRQ'),
            serverRemarks: value('Server_Remarks')
          };
          site.networkMonthNum = site.networkDate ? Number(site.networkDate.slice(5,7)) : undefined;
          site.serverMonthNum = site.serverDate ? Number(site.serverDate.slice(5,7)) : undefined;
          site.overallStatus = overallStatus(site);
          return site;
        });
        if (await saveSites(imported)) showToast(`Imported ${imported.length} sites from CSV.`);
      } catch (error) {
        console.error('CSV import failed:', error);
        showToast(error.message || 'Could not read the CSV file.');
      }
    };
    reader.onerror = () => showToast('Could not read the selected file.');
    reader.readAsText(file);
  }

  function exportCsv() {
    const headers = ['Cluster','Site','Address','Network_Status','Network_Month','Network_Date','Network_CRQ','Network_Remarks','Server_Status','Server_Month','Server_Date','Server_CRQ','Server_Remarks','Overall_Readiness'];
    const rows = getFilteredSites().map((site) => [
      site.cluster, site.site, site.address, site.networkStatus, site.networkMonth || '', site.networkDate || '',
      site.networkCRQ || '', site.networkRemarks || '', site.serverStatus, site.serverMonth || '',
      site.serverDate || '', site.serverCRQ || '', site.serverRemarks || '', overallStatus(site)
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `IT_BCP_Site_Readiness_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Filtered site list exported to CSV.');
  }

  function openSite(id) {
    const site = sites.find((item) => item.id === id);
    if (site) {
      editingSite = { ...site };
      render();
      document.getElementById('field-site').focus();
    }
  }

  app.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'view') { currentView = target.dataset.view; render(); }
    else if (action === 'theme') {
      dark = !dark;
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (error) { console.error('Unable to save theme:', error); }
      render();
    } else if (action === 'import') document.getElementById('csvInput').click();
    else if (action === 'export') exportCsv();
    else if (action === 'reset') {
      if (window.confirm('Reset all sites to the original 48-site template?')) {
        if (await saveSites(window.initialSitesData.map((site) => ({ ...site })))) {
          showToast('Site data restored to the original template.');
        }
      }
    } else if (action === 'cluster') { filters.cluster = target.dataset.value; render(); }
    else if (action === 'clear') {
      filters = { search: '', cluster: 'All', track: 'Both', status: 'All', asOfMonth: 'All' };
      render();
    } else if (action === 'quick-all') { filters.status = 'All'; filters.track = 'Both'; render(); }
    else if (action === 'quick-active') { filters.status = 'In Progress'; filters.track = 'Both'; render(); }
    else if (action === 'quick-completed') { filters.status = 'Completed'; filters.track = 'Both'; render(); }
    else if (action === 'metric-all') { filters.track = 'Both'; filters.status = 'All'; currentView = 'matrix'; render(); }
    else if (action === 'metric-network') { filters.track = 'Network'; currentView = 'matrix'; render(); }
    else if (action === 'metric-server') { filters.track = 'Server'; currentView = 'matrix'; render(); }
    else if (action === 'metric-completed') { filters.status = 'Completed'; currentView = 'matrix'; render(); }
    else if (action === 'metric-active') { filters.status = 'In Progress'; currentView = 'matrix'; render(); }
    else if (action === 'layout') { layoutMode = target.dataset.layout; render(); }
    else if (action === 'sort') { sortDirection = sortBy === target.dataset.sort ? -sortDirection : 1; sortBy = target.dataset.sort; render(); }
    else if (action === 'edit' && target.dataset.id) { event.stopPropagation(); openSite(target.dataset.id); }
    else if (action === 'cycle') {
      event.stopPropagation();
      const site = sites.find((item) => item.id === target.dataset.id);
      if (!site) return;
      const key = target.dataset.track === 'network' ? 'networkStatus' : 'serverStatus';
      const sequence = ['Completed', 'In Progress', 'Not Started'];
      await updateSiteStatus(site.id, target.dataset.track, sequence[(sequence.indexOf(site[key]) + 1) % sequence.length]);
    } else if (action === 'date') { selectedDate = target.dataset.date; render(); }
    else if (action === 'month') { calendarMonth = Math.min(11, Math.max(2, calendarMonth + Number(target.dataset.delta))); render(); }
    else if (action === 'calendar-toggle') {
      const site = sites.find((item) => item.id === target.dataset.id);
      if (site) await updateSiteStatus(site.id, target.dataset.track, site[`${target.dataset.track}Status`] === 'Completed' ? 'In Progress' : 'Completed');
    } else if (action === 'advance') {
      const site = sites.find((item) => item.id === target.dataset.id);
      if (site) {
        if (site.serverStatus !== 'Completed') await updateSiteStatus(site.id, 'server', 'Completed');
        else openSite(site.id);
      }
    } else if (action === 'close') editingSite = null, render();
    else if (action === 'close-backdrop' && event.target === target) editingSite = null, render();
    else if (action === 'copy') {
      const text = target.dataset.copy;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => showToast('Command copied.')).catch((error) => { console.error('Clipboard copy failed:', error); showToast('Could not copy. Select and copy the command manually.'); });
      else showToast('Clipboard access is unavailable in this browser.');
    }
  });

  app.addEventListener('input', (event) => {
    if (event.target.id !== 'searchBox') return;
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    filters.search = value;
    render();
    const search = document.getElementById('searchBox');
    if (search) { search.focus(); search.setSelectionRange(cursor, cursor); }
  });

  app.addEventListener('change', (event) => {
    if (event.target.id === 'trackFilter') filters.track = event.target.value;
    else if (event.target.id === 'statusFilter') filters.status = event.target.value;
    else if (event.target.id === 'monthFilter') filters.asOfMonth = event.target.value;
    else if (event.target.id === 'csvInput') {
      const file = event.target.files && event.target.files[0];
      if (file) importCsv(file);
      event.target.value = '';
      return;
    } else if (editingSite && event.target.name) {
      editingSite[event.target.name] = event.target.value;
      return;
    } else return;
    render();
  });

  app.addEventListener('submit', async (event) => {
    if (event.target.id !== 'siteForm' || !editingSite) return;
    event.preventDefault();
    const formData = new FormData(event.target);
    for (const [key, value] of formData.entries()) editingSite[key] = value;
    editingSite.networkMonthNum = editingSite.networkDate ? Number(editingSite.networkDate.slice(5,7)) : editingSite.networkMonthNum;
    editingSite.serverMonthNum = editingSite.serverDate ? Number(editingSite.serverDate.slice(5,7)) : editingSite.serverMonthNum;
    editingSite.overallStatus = overallStatus(editingSite);
    const savedName = editingSite.site;
    const saved = await saveSites(sites.map((site) => site.id === editingSite.id ? { ...editingSite } : site));
    editingSite = null;
    render();
    if (saved) showToast(`Saved updates for ${savedName}.`);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      if (Array.isArray(next)) { sites = next; render(); }
    } catch (error) {
      console.error('Received invalid synchronized site data:', error);
    }
  });

  if ('BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('bcp_realtime_sync_channel');
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'SITES_UPDATED' && Array.isArray(event.data.payload)) {
          sites = event.data.payload;
          render();
        }
      };
    } catch (error) {
      console.error('Cross-tab synchronization is unavailable:', error);
    }
  }

  render();
  connectToDatabase();
})();
