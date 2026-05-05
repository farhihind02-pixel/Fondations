/* ═══════════════════════════════════════════════════════════
   SGTM FONDATIONS — app.js
   Grand Stade Hassan II – Lot 3
═══════════════════════════════════════════════════════════ */

const TYPE_COLORS = {
  // Pieux — OOP_Famille values from Revit
  'BA_ST':     '#E8460A',
  'BA_PC':     '#f97316',
  'PI':        '#E8460A',
  // Semelles
  'SI_C':      '#1e3a5f',
  'SI_T':      '#2d5f8a',
  'SI_T2':     '#5b8db8',
  'SI':        '#1e3a5f',
};

const STATIC_DATA = [
  { dbId:1001, elementType:'Pieu BA-ST', categorie:'Pieux', famille:'Pieu BA-ST', zone:'Bloc 1', subType:'Ø1000', volume:2131, count:187 },
  { dbId:1002, elementType:'Pieu BA-ST', categorie:'Pieux', famille:'Pieu BA-ST', zone:'Bloc 2', subType:'Ø1600', volume:7403, count:196 },
  { dbId:1003, elementType:'Pieu BA-PC', categorie:'Pieux', famille:'Pieu BA-PC', zone:'Bloc 3', subType:'Ø1000', volume:1237, count:96  },
  { dbId:1004, elementType:'Pieu BA-PC', categorie:'Pieux', famille:'Pieu BA-PC', zone:'Bloc 4', subType:'Ø1600', volume:4435, count:120 },
  { dbId:2001, elementType:'SI-C',       categorie:'Semelles', famille:'SI-C', zone:'Bloc 1', subType:'5000×5000',    volume:2354, count:64 },
  { dbId:2002, elementType:'SI-C',       categorie:'Semelles', famille:'SI-C', zone:'Bloc 2', subType:'12800×8000',   volume:1699, count:7  },
  { dbId:2003, elementType:'SI-C',       categorie:'Semelles', famille:'SI-C', zone:'Bloc 3', subType:'Autres',       volume:2830, count:11 },
  { dbId:2004, elementType:'SI-T',       categorie:'Semelles', famille:'SI-T', zone:'Bloc 4', subType:'17600×12800',  volume:4037, count:8  },
  { dbId:2005, elementType:'SI-T',       categorie:'Semelles', famille:'SI-T', zone:'Bloc 1', subType:'17600×17600',  volume:5351, count:6  },
  { dbId:2006, elementType:'SI-T',       categorie:'Semelles', famille:'SI-T', zone:'Bloc 2', subType:'12800×12800',  volume:2364, count:7  },
  { dbId:2007, elementType:'SI-T2',      categorie:'Semelles', famille:'SI-T2', zone:'Bloc 3', subType:'BORD_B_08',  volume:2582, count:3  },
];

let allElements      = [];
let filteredElements = [];
let charts           = {};
let viewer           = null;
let viewerLoaded     = false;

const sum  = (arr, key) => arr.reduce((s, i) => s + (i[key] || 0), 0);
const cnt  = (arr)      => arr.reduce((s, i) => s + (i.count || 1), 0);
const nbr  = (arr)      => arr.length; // count from APS = 1 per element
const fmt  = (v)        => Number(v).toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 });

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setDate();
  checkAuth();
  loadData();

  document.getElementById('btnReset') && document.getElementById('btnReset').addEventListener('click', resetFilters);
  document.getElementById('btnHome') && document.getElementById('btnHome').addEventListener('click', () => viewer && viewer.fitToView());
  document.getElementById('btnFullscreen') && document.getElementById('btnFullscreen').addEventListener('click', () => {
    const c = document.getElementById('viewer3d');
    c.requestFullscreen ? c.requestFullscreen() : null;
  });
});

function setDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('fr-FR');
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  const badge = document.getElementById('accStatus');
  const label = document.getElementById('accLabel');
  try {
    const r    = await fetch('/api/auth/status');
    const data = await r.json();
    if (data.connected) {
      badge.className   = 'acc-badge acc-connected';
      label.textContent = 'ACC connecté';
      badge.style.cursor = 'default';
      badge.onclick = null;
      initViewer();
    } else {
      badge.className   = 'acc-badge acc-disconnected';
      label.textContent = 'Se connecter à ACC';
      badge.style.cursor = 'pointer';
      badge.onclick = () => window.location.href = '/api/auth/login';
      showViewerLogin();
    }
  } catch {
    badge.className   = 'acc-badge acc-disconnected';
    label.textContent = 'Se connecter à ACC';
    badge.onclick = () => window.location.href = '/api/auth/login';
    showViewerLogin();
  }
}

// ── DATA ──────────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res  = await fetch('/api/properties');
    const data = await res.json();
    if (data.elements && data.elements.length >= 5) {
      allElements = data.elements.map((e, i) => ({ ...e, count: e.count || 1, dbId: e.dbId || i + 1 }));
    } else throw new Error('fallback');
  } catch {
    allElements = STATIC_DATA;
  }
  filteredElements = [...allElements];
  populateFilters();
  refresh();
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function naturalSort(a, b) {
  return a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
}

function naturalSort(a, b) {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

function populateFilters() {
  const zones  = [...new Set(allElements.map(e => e.zone).filter(Boolean))].sort(naturalSort);
  const familles = [...new Set(allElements.map(e => e.famille).filter(Boolean))].sort(naturalSort);
  const zSel   = document.getElementById('filterZone');
  const tSel   = document.getElementById('filterType');
  zSel.innerHTML = '<option value="Tout">Tout</option>' + zones.map(z => `<option value="${z}">${z}</option>`).join('');
  tSel.innerHTML = '<option value="Tout">Tout</option>' + familles.map(t => `<option value="${t}">${t}</option>`).join('');
}

function applyFilters() {
  const zone     = document.getElementById('filterZone').value;
  const categorie= document.getElementById('filterCategorie').value;
  const type     = document.getElementById('filterType').value;
  filteredElements = allElements.filter(e =>
    (zone      === 'Tout' || e.zone === zone) &&
    (categorie === 'Tout' || e.elementType === categorie) &&
    (type      === 'Tout' || e.famille === type)
  );
  refresh();
  highlightViewerElements();
}

function resetFilters() {
  document.getElementById('filterZone').value = 'Tout';
  document.getElementById('filterCategorie').value = 'Tout';
  document.getElementById('filterType').value = 'Tout';
  applyFilters();
}

function refresh() {
  const total = cnt(filteredElements);
  document.getElementById('elementCount').textContent = `${total.toLocaleString('fr-FR')} éléments`;
  updateKPIs();
  updateCharts();
  updateTable();
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function updateKPIs() {
  const pieux    = filteredElements.filter(e => e.elementType === 'PI' || e.categorie === 'Pieux');
  const semelles = filteredElements.filter(e => e.elementType === 'SI' || e.categorie === 'Semelles');
  const pC = cnt(pieux),  pV = sum(pieux, 'volume');
  const sC = cnt(semelles), sV = sum(semelles, 'volume');
  const tC = pC + sC, tV = pV + sV;

  document.getElementById('kpiPieuxCount').textContent    = pC.toLocaleString('fr-FR');
  document.getElementById('kpiPieuxVolume').textContent   = `${fmt(pV)} m³`;
  document.getElementById('kpiSemellesCount').textContent = sC.toLocaleString('fr-FR');
  document.getElementById('kpiSemellesVolume').textContent= `${fmt(sV)} m³`;
  document.getElementById('kpiTotalCount').textContent    = tC.toLocaleString('fr-FR');
  document.getElementById('kpiTotalVolume').textContent   = `${fmt(tV)} m³`;

  // Profondeurs:
  // MIN = Elévation à la base la plus basse (tous éléments)
  // MAX = Elévation en haut la plus haute (Pieux PI uniquement)
  let minVal = Infinity, minZone = '—';
  let maxVal = -Infinity, maxZone = '—';

  filteredElements.forEach(e => {
    if (!isNaN(e.elevBase) && e.elevBase !== 0 && e.elevBase < minVal) {
      minVal = e.elevBase; minZone = e.zone || '—';
    }
    if (e.elementType === 'PI' && !isNaN(e.elevHaut) && e.elevHaut !== 0 && e.elevHaut > maxVal) {
      maxVal = e.elevHaut; maxZone = e.zone || '—';
    }
  });

  const profMinEl  = document.getElementById('profMin');
  const profMinZEl = document.getElementById('profMinZone');
  const profMaxEl  = document.getElementById('profMax');
  const profMaxZEl = document.getElementById('profMaxZone');

  if (profMinEl)  profMinEl.textContent  = minVal !== Infinity  ? minVal.toFixed(2) + ' m'  : '—';
  if (profMinZEl) profMinZEl.textContent = minVal !== Infinity  ? 'Zone ' + minZone : '';
  if (profMaxEl)  profMaxEl.textContent  = maxVal !== -Infinity ? maxVal.toFixed(2) + ' m'  : '—';
  if (profMaxZEl) profMaxZEl.textContent = maxVal !== -Infinity ? 'Zone ' + maxZone : '';

  const pPct = tV ? Math.round(pV / tV * 100) : 0;
  const sPct = 100 - pPct;
  document.getElementById('barPieux').style.width        = `${pPct}%`;
  document.getElementById('barSemelles').style.width     = `${sPct}%`;
  document.getElementById('barPieuxValue').textContent   = `${fmt(pV)} m³`;
  document.getElementById('barSemellesValue').textContent= `${fmt(sV)} m³`;
  document.getElementById('barPieuxPct').textContent     = `${pPct}%`;
  document.getElementById('barSemellesPct').textContent  = `${sPct}%`;
}

// ── CHARTS ────────────────────────────────────────────────────────────────────
const TOOLTIP_OPTS = {
  backgroundColor: '#fff',
  titleColor: '#1a1d23',
  bodyColor: '#6b7280',
  borderColor: '#e2e5ea',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
};
const LEGEND_OPTS = { labels: { color: '#6b7280', font: { size: 11 }, boxWidth: 12, padding: 14 } };

function mkChart(id, type, data, options) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), { type, data, options });
}

function updateCharts() {
  const byZone = {}, byType = {}, byCat = { Pieux: 0, Semelles: 0 };

  filteredElements.forEach(e => {
    byZone[e.zone] = byZone[e.zone] || { Pieux: 0, Semelles: 0 };
    const cat = e.elementType === 'PI' ? 'Pieux' : 'Semelles';
    byZone[e.zone][cat] += e.volume || 0;
    byType[e.famille || e.elementType] = (byType[e.famille || e.elementType] || 0) + (e.volume || 0);
    byCat[cat] += e.count || 1;
  });

  const zones = Object.keys(byZone).sort();

  // Chart 1 – Volumes par Zone (tri naturel)
  const zonesSorted = zones.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  mkChart('chartBloc', 'bar', {
    labels: zonesSorted,
    datasets: [
      { label: 'Pieux (m³)',    data: zonesSorted.map(z => byZone[z].Pieux),    backgroundColor: '#E8460A', borderRadius: 6, borderSkipped: false },
      { label: 'Semelles (m³)', data: zonesSorted.map(z => byZone[z].Semelles), backgroundColor: '#1e3a5f', borderRadius: 6, borderSkipped: false },
    ]
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: LEGEND_OPTS, tooltip: TOOLTIP_OPTS },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b7280' } },
      y: { grid: { color: '#f0f0f0' }, ticks: { color: '#6b7280', callback: v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v } }
    }
  });

  // Chart 2 – Répartition par Type avec pourcentages
  const typeLabels = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  const totalByType = typeLabels.reduce((s, t) => s + byType[t], 0);
  mkChart('chartType', 'pie', {
    labels: typeLabels.map(t => {
      const pct = totalByType ? Math.round(byType[t]/totalByType*100) : 0;
      return `${t} — ${pct}%`;
    }),
    datasets: [{ data: typeLabels.map(t => byType[t]), backgroundColor: typeLabels.map(t => TYPE_COLORS[t] || '#ccc'), borderWidth: 2, borderColor: '#fff' }]
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { ...LEGEND_OPTS, position: 'right' },
      tooltip: { ...TOOLTIP_OPTS, callbacks: {
        label: ctx => ` ${fmt(ctx.raw)} m³ (${totalByType ? Math.round(ctx.raw/totalByType*100) : 0}%)`
      }}
    }
  });

  // Chart 3 – Donut volume avec pourcentages
  const pV = sum(filteredElements.filter(e => e.elementType === 'PI' || e.categorie === 'Pieux'), 'volume');
  const sV = sum(filteredElements.filter(e => e.elementType === 'SI' || e.categorie === 'Semelles'), 'volume');
  const totalVol = pV + sV;
  const pVpct = totalVol ? Math.round(pV/totalVol*100) : 0;
  const sVpct = totalVol ? Math.round(sV/totalVol*100) : 0;
  mkChart('chartDonut', 'doughnut', {
    labels: [`Pieux — ${pVpct}%`, `Semelles — ${sVpct}%`],
    datasets: [{ data: [pV, sV], backgroundColor: ['#E8460A', '#1e3a5f'], borderWidth: 3, borderColor: '#fff', hoverOffset: 4 }]
  }, {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: {
      legend: LEGEND_OPTS,
      tooltip: { ...TOOLTIP_OPTS, callbacks: {
        label: ctx => ` ${fmt(ctx.raw)} m³ (${totalVol ? Math.round(ctx.raw/totalVol*100) : 0}%)`
      }}
    }
  });

  // Chart 4 – Donut nombre avec pourcentages
  const pN = filteredElements.filter(e => e.elementType === 'PI' || e.categorie === 'Pieux').length;
  const sN = filteredElements.filter(e => e.elementType === 'SI' || e.categorie === 'Semelles').length;
  const totalN = pN + sN;
  mkChart('chartCountDonut', 'doughnut', {
    labels: ['Pieux', 'Semelles'],
    datasets: [{ data: [pN, sN], backgroundColor: ['#E8460A', '#1e3a5f'], borderWidth: 3, borderColor: '#fff', hoverOffset: 4 }]
  }, {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: {
      legend: LEGEND_OPTS,
      tooltip: { ...TOOLTIP_OPTS, callbacks: {
        label: ctx => ` ${ctx.label}: ${ctx.raw} éléments (${totalN ? Math.round(ctx.raw/totalN*100) : 0}%)`
      }}
    }
  });
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
function updateTable() {
  // Grouper par OOP_Famille (les 5 vrais types : BA_ST, BA_PC, SI_C, SI_T, SI_T2)
  const groups = {};
  const total  = sum(filteredElements, 'volume');

  filteredElements.forEach(e => {
    const famille   = e.famille || e.elementType || '—';
    const categorie = e.elementType === 'PI' ? 'Pieux' : 'Semelles';
    if (!groups[famille]) {
      groups[famille] = { famille, categorie, volume: 0, count: 0 };
    }
    groups[famille].volume += e.volume || 0;
    groups[famille].count  += 1;
  });

  document.getElementById('detailTableBody').innerHTML = Object.values(groups)
    .sort((a, b) => b.volume - a.volume)
    .map(g => {
      const pct = total ? Math.round(g.volume / total * 100) : 0;
      const badgeClass = g.categorie === 'Pieux' ? 'badge-p' : 'badge-s';
      return `<tr>
        <td><strong>${g.famille}</strong></td>
        <td><span class="${badgeClass}">${g.categorie}</span></td>
        <td>${g.count.toLocaleString('fr-FR')}</td>
        <td><span style="font-family:var(--font-mono)">${fmt(g.volume)}</span></td>
        <td>
          <div class="pct-inline">
            <div class="pct-track"><div class="pct-fill-bar" style="width:${pct}%"></div></div>
            <span style="font-family:var(--font-mono);font-size:0.75rem">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
}

// ── VIEWER ────────────────────────────────────────────────────────────────────
function showViewerLogin() {
  const ph = document.getElementById('viewerPlaceholder');
  const msg = document.getElementById('viewerMsg');
  if (msg) msg.textContent = 'Connectez-vous pour afficher la maquette 3D';
  if (ph) {
    ph.innerHTML = `
      <div class="viewer-ph-inner">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E8460A" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        </svg>
        <p style="color:#6b7280;margin-bottom:12px">Connectez-vous avec votre compte Autodesk</p>
        <button onclick="window.location.href='/api/auth/login'" style="
          background:#E8460A;color:#fff;border:none;padding:10px 24px;
          border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">
          Se connecter à ACC
        </button>
      </div>`;
  }
}

async function initViewer() {
  try {
    const [tokenRes, urnRes] = await Promise.all([fetch('/api/token'), fetch('/api/model-urn')]);
    if (tokenRes.status === 401) { showViewerLogin(); return; }

    const tokenData = await tokenRes.json();
    const urnData   = await urnRes.json();
    if (!tokenData.access_token) { showViewerLogin(); return; }

    Autodesk.Viewing.Initializer({
      env: 'AutodeskProduction2',
      api: 'streamingV2',
      getAccessToken: (cb) => cb(tokenData.access_token, 3599)
    }, () => {
      viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('viewer3d'));
      viewer.start();

      Autodesk.Viewing.Document.load(`urn:${urnData.urn}`, (doc) => {
        const viewables = doc.getRoot().search({ type: 'geometry', role: '3d' });
        const selected  = viewables.find(v => v.data && v.data.guid === urnData.viewableGuid) || viewables[0];
        if (!selected) { showViewerError('Aucune vue 3D disponible.'); return; }

        viewer.loadDocumentNode(doc, selected).then(() => {
          viewerLoaded = true;
          const ph = document.getElementById('viewerPlaceholder');
          if (ph) ph.classList.add('hidden');
          applyViewerColoring();
          highlightViewerElements();
        }).catch(() => showViewerError('Impossible de charger la vue 3D.'));
      }, () => showViewerError('Erreur de chargement — vérifiez la connexion ACC'));
    });
  } catch {
    showViewerError('Erreur initialisation viewer');
  }
}

function showViewerError(msg) {
  const ph = document.getElementById('viewerPlaceholder');
  if (ph) ph.innerHTML = `<div class="viewer-ph-inner"><p style="color:#6b7280">${msg}</p></div>`;
}

function applyViewerColoring() {
  if (!viewerLoaded || !viewer || !window.THREE) return;
  filteredElements.forEach(e => {
    if (typeof e.dbId !== 'number') return;
    const c = new THREE.Color(TYPE_COLORS[e.famille] || TYPE_COLORS[e.elementType] || '#999');
    viewer.setThemingColor(e.dbId, new THREE.Vector4(c.r, c.g, c.b, 1));
  });
}

function highlightViewerElements() {
  if (!viewerLoaded || !viewer) return;
  const ids = filteredElements.map(e => e.dbId).filter(id => typeof id === 'number');
  ids.length && ids.length < allElements.length ? viewer.isolate(ids) : viewer.showAll();
}
