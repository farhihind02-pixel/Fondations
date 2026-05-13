/* ═══════════════════════════════════════════════════════════
   SGTM FONDATIONS — app.js  (Pieux uniquement)
   - Filtres multi-sélection (checkboxes)
   - Bétonnés / Forés corrigés
   - Semelles supprimées
═══════════════════════════════════════════════════════════ */

// ── MAPPING BLOC ↔ ZONES ──────────────────────────────────
const BLOC_ZONE_MAP = {
  'Bloc 1': ['1','2'],
  'Bloc 2': ['3','4'],
  'Bloc 3': ['5','6'],
  'Bloc 4': ['7','8'],
};

const DIR_LABELS = {
  N:'Nord', S:'Sud', E:'Est', W:'Ouest',
  NE:'Nord-Est', NW:'Nord-Ouest', SE:'Sud-Est', SW:'Sud-Ouest'
};

const TYPE_COLORS = {
  'Pieu BA-ST': '#ffa017',
  'Pieu BA-PC': '#f97316',
  'BA_ST':      '#ffa017',
  'BA_PC':      '#f97316',
  'PI':         '#ffa017',
};

// ── DONNÉES STATIQUES FALLBACK ────────────────────────────
// OOP_BETONNE et OOP_FORE : 1 = oui, 0 = non
const STATIC_DATA = [
  { dbId:1001, elementType:'PI', famille:'Pieu BA-ST', zone:'1', bloc:'Bloc 1', direction:'NE', volume:2131, length:12.5, betonne:1, fore:1 },
  { dbId:1002, elementType:'PI', famille:'Pieu BA-ST', zone:'2', bloc:'Bloc 1', direction:'NW', volume:7403, length:14.2, betonne:1, fore:1 },
  { dbId:1003, elementType:'PI', famille:'Pieu BA-PC', zone:'3', bloc:'Bloc 2', direction:'SE', volume:1237, length:10.0, betonne:0, fore:1 },
  { dbId:1004, elementType:'PI', famille:'Pieu BA-PC', zone:'4', bloc:'Bloc 2', direction:'SW', volume:4435, length:11.8, betonne:1, fore:1 },
  { dbId:1005, elementType:'PI', famille:'Pieu BA-ST', zone:'5', bloc:'Bloc 3', direction:'N',  volume:1890, length:13.0, betonne:0, fore:0 },
  { dbId:1006, elementType:'PI', famille:'Pieu BA-PC', zone:'6', bloc:'Bloc 3', direction:'S',  volume:2210, length:9.5,  betonne:1, fore:1 },
  { dbId:1007, elementType:'PI', famille:'Pieu BA-ST', zone:'7', bloc:'Bloc 4', direction:'E',  volume:3100, length:16.0, betonne:1, fore:1 },
  { dbId:1008, elementType:'PI', famille:'Pieu BA-PC', zone:'8', bloc:'Bloc 4', direction:'W',  volume:2750, length:11.2, betonne:0, fore:0 },
  { dbId:1009, elementType:'PI', famille:'Pieu BA-ST', zone:'1', bloc:'Bloc 1', direction:'NE', volume:1850, length:11.0, betonne:1, fore:1 },
  { dbId:1010, elementType:'PI', famille:'Pieu BA-ST', zone:'3', bloc:'Bloc 2', direction:'SE', volume:3200, length:13.5, betonne:0, fore:1 },
  { dbId:1011, elementType:'PI', famille:'Pieu BA-PC', zone:'5', bloc:'Bloc 3', direction:'N',  volume:2680, length:10.8, betonne:1, fore:1 },
  { dbId:1012, elementType:'PI', famille:'Pieu BA-ST', zone:'7', bloc:'Bloc 4', direction:'E',  volume:4100, length:17.2, betonne:1, fore:1 },
];

let allElements      = [];
let filteredElements = [];
let charts           = {};
let viewer           = null;
let viewerLoaded     = false;

// État des filtres multi-sélection
const filterState = {
  bloc:      new Set(),
  zone:      new Set(),
  direction: new Set(),
  type:      new Set(),
};

const sum = (arr, key) => arr.reduce((s, i) => s + (Number(i[key]) || 0), 0);
const fmt = (v) => {
  const n = Number(v);
  if (Number.isInteger(n)) return n.toLocaleString('fr-FR');
  return n.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 });
};

// ── UTILITAIRE APS ────────────────────────────────────────
function getProp(props, name) {
  if (!props) return null;
  const norm = s => s.replace(/[\s_\-]/g,'').toLowerCase();
  const target = norm(name);
  for (const group of Object.values(props)) {
    if (typeof group !== 'object' || !group) continue;
    for (const [k, v] of Object.entries(group)) {
      if (norm(k) === target) return v;
    }
  }
  return null;
}

// ── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setDate();
  checkAuth();
  loadData();
  document.getElementById('btnHome') &&
    document.getElementById('btnHome').addEventListener('click', () => viewer && viewer.fitToView());
  document.getElementById('btnFullscreen') &&
    document.getElementById('btnFullscreen').addEventListener('click', () => {
      const c = document.getElementById('viewer3d');
      c && (c.requestFullscreen ? c.requestFullscreen() : null);
    });
});

function setDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('fr-FR');
}

// ── AUTH ──────────────────────────────────────────────────
async function checkAuth() {
  const badge = document.getElementById('accStatus');
  const label = document.getElementById('accLabel');
  try {
    const data = await fetch('/api/auth/status').then(r => r.json());
    if (data.connected) {
      badge.className = 'acc-pill acc-on';
      label.textContent = 'ACC connecté';
      badge.style.cursor = 'default';
      badge.onclick = null;
      initViewer();
    } else {
      badge.className = 'acc-pill acc-off';
      label.textContent = 'Se connecter à ACC';
      badge.onclick = () => window.location.href = '/api/auth/login';
      showViewerLogin();
    }
  } catch {
    badge.className = 'acc-pill acc-off';
    label.textContent = 'Se connecter à ACC';
    badge.onclick = () => window.location.href = '/api/auth/login';
    showViewerLogin();
  }
}

// ── DATA ──────────────────────────────────────────────────
async function loadData() {
  try {
    const res  = await fetch('/api/properties');
    const data = await res.json();
    if (data.elements && data.elements.length >= 5) {
      allElements = data.elements
        .filter(e => (e.elementType || '').toUpperCase() === 'PI')
        .map(e => ({
          dbId:      e.dbId,
          name:      e.name || '',
          elementType: 'PI',
          famille:   e.famille || 'Pieu',
          subType:   e.subType  || '—',
          zone:      String(e.zone || '').trim(),
          bloc:      getBlocFromZone(String(e.zone || '').trim()),
          direction: String(e.direction || '').trim().toUpperCase(),
          volume:    parseFloat(e.volume)  || 0,
          length:    parseFloat(e.length)  || 0,
          // Forcer la conversion numérique — l'API peut retourner string "1" ou number 1
          betonne:   Number(e.betonne),
          fore:      Number(e.fore),
        }));
    } else throw new Error('fallback');
  } catch {
    allElements = STATIC_DATA;
  }
  filteredElements = [...allElements];
  populateFilters();
  refresh();
}

function getBlocFromZone(zone) {
  for (const [bloc, zones] of Object.entries(BLOC_ZONE_MAP)) {
    if (zones.includes(String(zone))) return bloc;
  }
  return '—';
}

// ── FILTRES MULTI-SÉLECTION ───────────────────────────────
function naturalSort(a, b) {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const menu = dd.querySelector('.f-menu');
  const isOpen = menu.classList.contains('open');
  // Fermer tous les autres
  document.querySelectorAll('.f-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.f-dropdown.active').forEach(d => d.classList.remove('active'));
  if (!isOpen) {
    menu.classList.add('open');
    dd.classList.add('active');
  }
}

function selectAll(menuId) {
  const menu = document.getElementById(menuId);
  const boxes = menu.querySelectorAll('input[type="checkbox"]:not(.cb-selectall)');
  const allChecked = [...boxes].every(cb => cb.checked);
  boxes.forEach(cb => cb.checked = !allChecked);
  // Met à jour la case "Tout sélectionner"
  const master = menu.querySelector('.cb-selectall');
  if (master) master.checked = !allChecked;
  applyFilters();
}

function syncSelectAll(menuId) {
  const menu = document.getElementById(menuId);
  const boxes = [...menu.querySelectorAll('input[type="checkbox"]:not(.cb-selectall)')];
  const master = menu.querySelector('.cb-selectall');
  if (master) master.checked = boxes.length > 0 && boxes.every(cb => cb.checked);
  applyFilters();
}

function buildMenu(menuId, items) {
  const selectAllRow = `<label class="f-item f-item-all">
    <input type="checkbox" class="cb-selectall" onchange="selectAll('${menuId}')"> Tout sélectionner
  </label>
  <div class="f-divider"></div>`;
  return selectAllRow + items;
}

function populateFilters() {
  // Zones
  const zones = [...new Set(allElements.map(e => e.zone).filter(Boolean))].sort(naturalSort);
  document.getElementById('menuZone').innerHTML = buildMenu('menuZone',
    zones.map(z => `<label class="f-item"><input type="checkbox" value="${z}" onchange="syncSelectAll('menuZone')"> Zone ${z}</label>`).join('')
  );

}

function getCheckedValues(menuId) {
  return [...document.querySelectorAll(`#${menuId} input[type="checkbox"]:checked:not(.cb-selectall)`)].map(cb => cb.value);
}

function updateBadge(badgeId, values) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  if (values.length > 0) {
    badge.textContent = values.length;
    badge.classList.add('visible');
  } else {
    badge.textContent = '';
    badge.classList.remove('visible');
  }
}

function applyFilters() {
  const zones = getCheckedValues('menuZone');

  const etats = getCheckedValues('menuEtat');

  updateBadge('badgeZone',      zones);

  updateBadge('badgeEtat',      etats);

  filteredElements = allElements.filter(e => {
    const okZone = zones.length === 0 || zones.includes(e.zone);

    const okEtat = etats.length === 0 || (
      (etats.includes('betonne') && e.betonne === 1) ||
      (etats.includes('fore')    && e.fore    === 1)
    );
    return okZone && okEtat;
  });

  refresh();
  updateViewerHighlight();
}

function resetFilters() {
  document.querySelectorAll('.f-menu input[type="checkbox"]').forEach(cb => cb.checked = false);
  ['badgeZone','badgeEtat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('visible'); }
  });
  filteredElements = [...allElements];
  refresh();
  resetViewerHighlight();
}

// ── REFRESH ───────────────────────────────────────────────
function refresh() {
  document.getElementById('elementCount').textContent =
    `${filteredElements.length.toLocaleString('fr-FR')} éléments`;
  updateKPIs();
  updateCharts();
  updateTable();
}

// ── KPIs ──────────────────────────────────────────────────
function updateKPIs() {
  // Profondeur totale = somme de ME_LENGTH de tous les pieux filtrés
  const pieux  = filteredElements.filter(e => e.elementType === 'PI');
  const pLen   = sum(pieux, 'length');
  const pVol   = sum(pieux, 'volume');

  document.getElementById('kpiPieuxCount').textContent  = fmt(pLen);
  document.getElementById('kpiPieuxVolume').textContent = `${pieux.length.toLocaleString('fr-FR')} pieux`;
  document.getElementById('kpiTotalCount').textContent  = fmt(pVol);
  document.getElementById('kpiTotalVolume').textContent = 'm³';

  // BÉTONNÉS = éléments avec OOP_BETONNE === 1
  // Le serveur retourne betonne = 1 (number) quand OOP_BETONNE vaut 1
  const betonnes = filteredElements.filter(e => e.betonne === 1);
  const bCount   = betonnes.length;
  const bVol     = sum(betonnes, 'volume');

  document.getElementById('kpiBetonne').textContent       = fmt(bVol);
  document.getElementById('kpiBetonneVolume').textContent  = bCount.toLocaleString('fr-FR') + ' éléments bétonnés';


  // PROFONDEUR FORÉE = bétonnés (car bétonné => foré avant) + forés, sans doublon
  const fores    = filteredElements.filter(e => e.fore === 1);
  const fCount   = fores.length;
  // Union sans doublon : éléments forés OU bétonnés
  const foreIds  = new Set(fores.map(e => e.dbId));
  const unionFB  = filteredElements.filter(e => e.fore === 1 || e.betonne === 1);
  const unionIds = new Set(unionFB.map(e => e.dbId));
  const profFore = sum(unionFB, 'length');
  const unionCount = unionFB.length;

  document.getElementById('kpiFore').textContent       = fmt(profFore) + ' ml';
  document.getElementById('kpiForeLength').textContent = unionCount.toLocaleString('fr-FR') + ' éléments (forés + bétonnés)';

}

// ── CHARTS ────────────────────────────────────────────────
const TT = {
  backgroundColor:'#fff', titleColor:'#1a1d23', bodyColor:'#6b7280',
  borderColor:'#e2e5ea', borderWidth:1, padding:10, cornerRadius:8,
};
const LEG = { labels:{ color:'#6b7280', font:{ size:10 }, boxWidth:10, padding:10 } };

function mkChart(id, type, data, options) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas, { type, data, options });
}

function updateCharts() {
  // ── Volumes par Zone (barres) ──────────────────────────
  const byZone = {};
  filteredElements.forEach(e => {
    const lbl = e.zone ? `Zone ${e.zone}` : '—';
    byZone[lbl] = (byZone[lbl] || 0) + (e.volume || 0);
  });
  const zoneSorted = Object.keys(byZone).sort((a, b) => a.localeCompare(b,'fr',{numeric:true}));
  mkChart('chartBloc', 'bar', {
    labels: zoneSorted,
    datasets: [{
      label: 'Volume (m³)',
      data: zoneSorted.map(z => byZone[z]),
      backgroundColor: '#ffa017', borderRadius: 5, borderSkipped: false,
    }]
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: TT },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
      y: { grid: { color: '#f0f0f0' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
    }
  });

  // ── Volume bétonné vs total (donut) ────────────────────
  const totalVol   = sum(filteredElements, 'volume');
  const betonneVol = sum(filteredElements.filter(e => e.betonne === 1), 'volume');
  const resteVol   = Math.max(0, totalVol - betonneVol);
  const bPct = totalVol ? Math.round(betonneVol / totalVol * 100) : 0;

  mkChart('chartBetonnePie', 'doughnut', {
    labels: [`Bétonné — ${bPct}%`, `Non bétonné — ${100 - bPct}%`],
    datasets: [{
      data: [betonneVol, resteVol],
      backgroundColor: ['#ffa017', '#e5e7eb'],
      borderWidth: 3, borderColor: '#fff', hoverOffset: 4,
    }]
  }, {
    responsive: true, maintainAspectRatio: false, cutout: '65%',
    plugins: {
      legend: { ...LEG, position: 'right' },
      tooltip: { ...TT, callbacks: { label: ctx => ` ${fmt(ctx.raw)} m³` } }
    }
  });

  // ── Mini donut bétonnés (KPI) ──────────────────────────
  const bN  = filteredElements.filter(e => e.betonne === 1).length;
  const nbN = filteredElements.length - bN;
  mkChart('chartBetonneKpi', 'doughnut', {
    labels: ['Bétonnés','Non bétonnés'],
    datasets: [{ data: [bN, nbN], backgroundColor: ['#ffa017','#e5e7eb'], borderWidth: 0 }]
  }, {
    responsive: true, maintainAspectRatio: false, cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  });

  // ── Mini donut forés (KPI) ─────────────────────────────
  const fN  = filteredElements.filter(e => e.fore === 1).length;
  const nfN = filteredElements.length - fN;
  mkChart('chartForeKpi', 'doughnut', {
    labels: ['Forés','Non forés'],
    datasets: [{ data: [fN, nfN], backgroundColor: ['#1e3a5f','#e5e7eb'], borderWidth: 0 }]
  }, {
    responsive: true, maintainAspectRatio: false, cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  });

}

// ── TABLE AVANCEMENT ──────────────────────────────────────
function updateTable() {
  // Grouper par OOP_Type + ME_ELEMENT SUB TYPE (Dim)
  // Chaque groupe = une ligne dans le tableau
  const groups = {};

  // On utilise allElements pour NB TOTAL (tous les pieux de ce type)
  // et filteredElements pour NB RÉALISÉ / FORÉ (selon filtre Etat)
  // Tout basé sur filteredElements — réagit aux filtres Zone et Etat
  filteredElements.forEach(e => {
    const element = e.famille || 'Pieux';
    const dim     = e.subType || '—';
    const k       = dim;
    if (!groups[k]) groups[k] = {
      element, dim,
      total: 0,      volumeTotal: 0,  lengthTotal: 0,
      coule: 0,      volumeCoule: 0,
      fore:  0,      lengthFore:  0,
    };
    groups[k].total       += 1;
    groups[k].volumeTotal += e.volume || 0;
    groups[k].lengthTotal += e.length || 0;
    if (e.betonne === 1) {
      groups[k].coule       += 1;
      groups[k].volumeCoule += e.volume || 0;
    }
    // NB FORÉ = foré OU bétonné (car bétonné implique foré préalable)
    if (e.fore === 1 || e.betonne === 1) {
      groups[k].fore       += 1;
      groups[k].lengthFore += e.length || 0;
    }
  });

  const rows = Object.values(groups).sort((a, b) => a.dim.localeCompare(b.dim, 'fr', { numeric: true }));

  // ── TABLEAU COULAGE ────────────────────────────────────
  let totalC = 0, totalCoule = 0, totalVolT = 0, totalVolC = 0;
  document.getElementById('tableCoulageBody').innerHTML = rows.map(g => {
    const pct = g.total ? Math.round(g.coule / g.total * 100) : 0;
    totalC     += g.total;
    totalCoule += g.coule;
    totalVolT  += g.volumeTotal;
    totalVolC  += g.volumeCoule;
    return '<tr>' +
      '<td class="td-elem">' + g.element + '</td>' +
      '<td class="td-dim">' + g.dim + '</td>' +
      '<td>' + g.total + '</td>' +
      '<td class="td-orange">' + g.coule + '</td>' +
      '<td>' + fmt(g.volumeTotal) + '</td>' +
      '<td class="td-orange">' + fmt(g.volumeCoule) + '</td>' +
      '<td><div class="pct-inline"><div class="pct-track"><div class="pct-fill-bar" style="width:' + pct + '%"></div></div><span>' + pct + '%</span></div></td>' +
      '</tr>';
  }).join('');

  const pctTotalC = totalC ? Math.round(totalCoule / totalC * 100) : 0;
  document.getElementById('tableCoulageFoot').innerHTML =
    '<tr class="tfoot-total">' +
    '<td colspan="2"><strong>TOTAL PIEUX</strong></td>' +
    '<td><strong>' + totalC + '</strong></td>' +
    '<td class="td-orange"><strong>' + totalCoule + '</strong></td>' +
    '<td><strong>' + fmt(totalVolT) + '</strong></td>' +
    '<td class="td-orange"><strong>' + fmt(totalVolC) + '</strong></td>' +
    '<td><strong>' + pctTotalC + '%</strong></td>' +
    '</tr>';

  // ── TABLEAU FORAGE ─────────────────────────────────────
  let totalF = 0, totalFore = 0, totalLenT = 0, totalLenF = 0;
  document.getElementById('tableForageBody').innerHTML = rows.map(g => {
    const pct = g.total ? Math.round(g.fore / g.total * 100) : 0;
    totalF    += g.total;
    totalFore += g.fore;
    totalLenT += g.lengthTotal;
    totalLenF += g.lengthFore;
    return '<tr>' +
      '<td class="td-elem">' + g.element + '</td>' +
      '<td class="td-dim">' + g.dim + '</td>' +
      '<td>' + g.total + '</td>' +
      '<td class="td-navy">' + g.fore + '</td>' +
      '<td>' + fmt(g.lengthTotal) + '</td>' +
      '<td class="td-navy">' + fmt(g.lengthFore) + '</td>' +
      '<td><div class="pct-inline"><div class="pct-track"><div class="pct-fill-bar" style="background:#1e3a5f;width:' + pct + '%"></div></div><span>' + pct + '%</span></div></td>' +
      '</tr>';
  }).join('');

  const pctTotalF = totalF ? Math.round(totalFore / totalF * 100) : 0;
  document.getElementById('tableForageFoot').innerHTML =
    '<tr class="tfoot-total">' +
    '<td colspan="2"><strong>TOTAL PIEUX</strong></td>' +
    '<td><strong>' + totalF + '</strong></td>' +
    '<td class="td-navy"><strong>' + totalFore + '</strong></td>' +
    '<td><strong>' + fmt(totalLenT) + '</strong></td>' +
    '<td class="td-navy"><strong>' + fmt(totalLenF) + '</strong></td>' +
    '<td><strong>' + pctTotalF + '%</strong></td>' +
    '</tr>';
}

// ── VIEWER ────────────────────────────────────────────────
function showViewerLogin() {
  const ph = document.getElementById('viewerPlaceholder');
  if (ph) ph.innerHTML = `
    <div class="viewer-ph-inner">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffa017" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      </svg>
      <p style="color:#6b7280;margin-bottom:12px">Connectez-vous avec votre compte Autodesk</p>
      <button onclick="window.location.href='/api/auth/login'" style="background:#ffa017;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">
        Se connecter à ACC
      </button>
    </div>`;
}

function showViewerError(msg) {
  const ph = document.getElementById('viewerPlaceholder');
  if (ph) ph.innerHTML = `<div class="viewer-ph-inner"><p style="color:#6b7280">${msg}</p></div>`;
}

async function initViewer() {
  try {
    const [tokenRes, urnRes] = await Promise.all([fetch('/api/token'), fetch('/api/model-urn')]);
    if (tokenRes.status === 401) { showViewerLogin(); return; }
    const tokenData = await tokenRes.json();
    const urnData   = await urnRes.json();
    if (!tokenData.access_token) { showViewerLogin(); return; }

    Autodesk.Viewing.Initializer({
      env: 'AutodeskProduction2', api: 'streamingV2',
      getAccessToken: (cb) => cb(tokenData.access_token, 3599)
    }, () => {
      viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('viewer3d'));
      viewer.start();
      Autodesk.Viewing.Document.load(`urn:${urnData.urn}`, (doc) => {
        const viewables = doc.getRoot().search({ type:'geometry', role:'3d' });
        const selected  = viewables.find(v => v.data?.guid === urnData.viewableGuid) || viewables[0];
        if (!selected) { showViewerError('Aucune vue 3D disponible.'); return; }
        viewer.loadDocumentNode(doc, selected).then(() => {
          viewerLoaded = true;
          const ph = document.getElementById('viewerPlaceholder');
          if (ph) ph.classList.add('hidden');
          updateViewerHighlight();
        }).catch(() => showViewerError('Impossible de charger la vue 3D.'));
      }, () => showViewerError('Erreur ACC — vérifiez la connexion'));
    });
  } catch { showViewerError('Erreur initialisation viewer'); }
}

function hasActiveFilters() {
  return document.querySelectorAll('.f-menu input[type="checkbox"]:checked').length > 0;
}

function updateViewerHighlight() {
  if (!viewerLoaded || !viewer || !window.THREE) return;
  if (!hasActiveFilters()) { resetViewerHighlight(); return; }

  viewer.clearThemingColors();
  const filteredIds = new Set(filteredElements.map(e => e.dbId).filter(id => typeof id === 'number'));
  const allIds = allElements.map(e => e.dbId).filter(id => typeof id === 'number');

  const orange      = new THREE.Vector4(1.0, 0.549, 0.294, 1);   // #ffa017
  const transparent = new THREE.Vector4(0.4, 0.4, 0.4, 0.15);    // très atténué

  allIds.forEach(id => {
    viewer.setThemingColor(id, filteredIds.has(id) ? orange : transparent);
  });
  viewer.impl && viewer.impl.invalidate(true, true, true);
}

function resetViewerHighlight() {
  if (!viewerLoaded || !viewer) return;
  // Reset agressif : alpha=0 sur chaque element puis clearThemingColors global
  const allIds = allElements.map(e => e.dbId).filter(id => typeof id === 'number');
  allIds.forEach(id => viewer.setThemingColor(id, new THREE.Vector4(0, 0, 0, 0)));
  viewer.clearThemingColors();
  viewer.impl && viewer.impl.invalidate(true, true, true);
}