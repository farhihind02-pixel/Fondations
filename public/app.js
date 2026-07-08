/* ═══════════════════════════════════════════════════════════
   SGTM FONDATIONS — app.js
   - Filtres : Zone (ME_ELEMENT SUB ZONE), Etat, Entreprise
   - Entreprise filtre sur le paramètre texte ENTREPRISE
   - % AVANC calculé sur le total réel filtré
   - Zoom sur filtre sélectionné
═══════════════════════════════════════════════════════════ */

const BLOC_ZONE_MAP = {
  'Bloc 1': ['1','2'],
  'Bloc 2': ['3','4'],
  'Bloc 3': ['5','6'],
  'Bloc 4': ['7','8'],
};

const STATIC_DATA = [
  { dbId:1001, elementType:'PI', famille:'Pieu', subType:'Ø1000', zone:'1', subzone:'SS', volume:2131, length:12.5, betonne:1, fore:1, betonneEtat:1, etatAvancement:'BETONNE', entreprise:'SGTM' },
  { dbId:1002, elementType:'PI', famille:'Pieu', subType:'Ø1600', zone:'2', subzone:'SS', volume:7403, length:14.2, betonne:1, fore:1, betonneEtat:1, etatAvancement:'BETONNE', entreprise:'SGTM' },
  { dbId:1003, elementType:'PI', famille:'Pieu', subType:'Ø1000', zone:'3', subzone:'NO', volume:1237, length:10.0, betonne:0, fore:1, betonneEtat:0, etatAvancement:'FORE',    entreprise:'TGCC' },
  { dbId:1004, elementType:'PI', famille:'Pieu', subType:'Ø1600', zone:'4', subzone:'NO', volume:4435, length:11.8, betonne:1, fore:1, betonneEtat:1, etatAvancement:'BETONNE', entreprise:'TGCC' },
  { dbId:1005, elementType:'PI', famille:'Pieu', subType:'Ø1000', zone:'5', subzone:'SE', volume:1890, length:13.0, betonne:0, fore:0, betonneEtat:0, etatAvancement:'',        entreprise:'SGTM' },
  { dbId:1006, elementType:'PI', famille:'Pieu', subType:'Ø1600', zone:'6', subzone:'SE', volume:2210, length:9.5,  betonne:1, fore:1, betonneEtat:1, etatAvancement:'BETONNE', entreprise:'SGTM' },
  { dbId:1007, elementType:'PI', famille:'Pieu', subType:'Ø1000', zone:'7', subzone:'OU', volume:3100, length:16.0, betonne:1, fore:1, betonneEtat:1, etatAvancement:'BETONNE', entreprise:'TGCC' },
  { dbId:1008, elementType:'PI', famille:'Pieu', subType:'Ø1600', zone:'8', subzone:'OU', volume:2750, length:11.2, betonne:0, fore:0, betonneEtat:0, etatAvancement:'',        entreprise:'SGTM' },
];

let allElements      = [];
let filteredElements = [];
let charts           = {};
let viewer           = null;
let viewerLoaded     = false;

const sum = (arr, key) => arr.reduce((s, i) => s + (Number(i[key]) || 0), 0);
const fmt = (v) => {
  const n = Number(v);
  if (Number.isInteger(n)) return n.toLocaleString('fr-FR');
  return n.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 });
};

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

async function loadData() {
  try {
    const res  = await fetch('/api/properties');
    const data = await res.json();
    if (data.elements && data.elements.length >= 5) {
      allElements = data.elements
        .filter(e => (e.elementType || '').toUpperCase() === 'PI')
        .map(e => ({
          dbId:           e.dbId,
          name:           e.name || '',
          elementType:    'PI',
          famille:        e.famille || 'Pieu',
          subType:        e.subType  || '—',
          zone:           String(e.zone || '').trim(),
          subzone:        String(e.subzone || '').trim(),
          direction:      String(e.direction || '').trim().toUpperCase(),
          volume:         parseFloat(e.volume)  || 0,
          length:         parseFloat(e.length)  || 0,
          betonne:        Number(e.betonne),
          fore:           Number(e.fore),
          tgcc:           Number(e.tgcc),
          entreprise:     String(e.entreprise || '').trim().toUpperCase(), // ← paramètre texte
          zoneTrv:        String(e.zoneTrv || '').trim(),
          betonneEtat:    Number(e.betonneEtat),
          etatAvancement: String(e.etatAvancement || '').trim().toUpperCase(),
          elementZone:    String(e.elementZone || '').trim().toUpperCase(),
        }));
    } else throw new Error('fallback');
  } catch {
    allElements = STATIC_DATA;
  }
  filteredElements = [...allElements];
  populateFilters();
  refresh();
}

function naturalSort(a, b) {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const menu = dd.querySelector('.f-menu');
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.f-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.f-dropdown.active').forEach(d => d.classList.remove('active'));
  if (!isOpen) { menu.classList.add('open'); dd.classList.add('active'); }
}

function selectAll(menuId) {
  const menu = document.getElementById(menuId);
  const boxes = menu.querySelectorAll('input[type="checkbox"]:not(.cb-selectall)');
  const allChecked = [...boxes].every(cb => cb.checked);
  boxes.forEach(cb => cb.checked = !allChecked);
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
  return `<label class="f-item f-item-all">
    <input type="checkbox" class="cb-selectall" onchange="selectAll('${menuId}')"> Tout sélectionner
  </label>
  <div class="f-divider"></div>` + items;
}

function populateFilters() {
 const subzones = [...new Set(allElements.map(e => e.subzone).filter(Boolean))].sort(naturalSort);
  document.getElementById('menuZone').innerHTML = buildMenu('menuZone',
    subzones.map(z => `<label class="f-item"><input type="checkbox" value="${z}" onchange="syncSelectAll('menuZone')"> ${z}</label>`).join('')
  );
}

function getCheckedValues(menuId) {
  return [...document.querySelectorAll(`#${menuId} input[type="checkbox"]:checked:not(.cb-selectall)`)].map(cb => cb.value);
}

function updateBadge(badgeId, values) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  if (values.length > 0) { badge.textContent = values.length; badge.classList.add('visible'); }
  else { badge.textContent = ''; badge.classList.remove('visible'); }
}

// ── FILTRE PRINCIPAL ──────────────────────────────────────
function applyFilters() {
  const zones      = getCheckedValues('menuZone');
  const etats      = getCheckedValues('menuEtat');
  const entreprise = getCheckedValues('menuEntreprise');

  updateBadge('badgeZone',       zones);
  updateBadge('badgeEtat',       etats);
  updateBadge('badgeEntreprise', entreprise);

  filteredElements = allElements.filter(e => {
    // Filtre Zone → ME_ELEMENT SUB ZONE
    const okZone = zones.length === 0 || zones.includes(e.subzone);

    // Filtre Etat
    const okEtat = etats.length === 0 || (
      (etats.includes('BETONNE') && e.betonneEtat === 1) ||
      (etats.includes('FORE')    && e.etatAvancement === 'FORE')
    );

    // Filtre Entreprise → paramètre texte ENTREPRISE
    // Compare e.entreprise (ex: 'TGCC' ou 'SGTM') avec la sélection
    const okEntreprise = entreprise.length === 0 ||
      entreprise.some(val => e.entreprise === val);

    return okZone && okEtat && okEntreprise;
  });

  refresh();
  updateViewerHighlight();
}

function resetFilters() {
  document.querySelectorAll('.f-menu input[type="checkbox"]').forEach(cb => cb.checked = false);
  ['badgeZone','badgeEtat','badgeEntreprise'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('visible'); }
  });
  filteredElements = [...allElements];
  refresh();
  resetViewerHighlight();
}

function refresh() {
  document.getElementById('elementCount').textContent =
    `${filteredElements.length.toLocaleString('fr-FR')} éléments`;
  updateKPIs();
  updateCharts();
  updateTable();
}

function updateKPIs() {
  const pieux = filteredElements.filter(e => e.elementType === 'PI');
  document.getElementById('kpiPieuxCount').textContent  = fmt(sum(pieux, 'length')) + ' ml';
  document.getElementById('kpiPieuxVolume').textContent = pieux.length.toLocaleString('fr-FR') + ' pieux';
  document.getElementById('kpiTotalCount').textContent  = fmt(sum(pieux, 'volume')) + ' m³';
  document.getElementById('kpiTotalVolume').textContent = '';

  const betonnes = filteredElements.filter(e => e.betonneEtat === 1);
  document.getElementById('kpiBetonne').textContent       = fmt(sum(betonnes, 'volume')) + ' m³';
  document.getElementById('kpiBetonneVolume').textContent = betonnes.length.toLocaleString('fr-FR') + ' éléments bétonnés';

  const profFore   = sum(filteredElements.filter(e => e.betonneEtat === 1), 'length')
                   + sum(filteredElements.filter(e => e.etatAvancement === 'FORE'), 'length');
  const unionCount = filteredElements.filter(e => e.betonneEtat === 1 || e.etatAvancement === 'FORE').length;
  document.getElementById('kpiFore').textContent       = fmt(profFore) + ' ml';
  document.getElementById('kpiForeLength').textContent = unionCount.toLocaleString('fr-FR') + ' éléments';
}

const TT  = { backgroundColor:'#fff', titleColor:'#1a1d23', bodyColor:'#6b7280', borderColor:'#e2e5ea', borderWidth:1, padding:10, cornerRadius:8 };
const LEG = { labels:{ color:'#6b7280', font:{ size:10 }, boxWidth:10, padding:10 } };

function mkChart(id, type, data, options) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas, { type, data, options });
}

function updateCharts() {
  const totalVol   = sum(filteredElements, 'volume');
  const betonneVol = sum(filteredElements.filter(e => e.betonneEtat === 1), 'volume');
  const bPct = totalVol ? Math.round(betonneVol / totalVol * 100) : 0;
  mkChart('chartBetonnePie', 'doughnut', {
    labels: [`Volume réalisé — ${bPct}%`, `Reste — ${100-bPct}%`],
    datasets: [{ data:[betonneVol, Math.max(0,totalVol-betonneVol)], backgroundColor:['#ffa017','#e5e7eb'], borderWidth:3, borderColor:'#fff', hoverOffset:4 }]
  }, { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{...LEG,position:'right'}, tooltip:{...TT,callbacks:{label:ctx=>` ${fmt(ctx.raw)} m³`}} } });

  const profTotale = sum(filteredElements, 'length');
  const profForee  = sum(filteredElements.filter(e => e.betonneEtat===1||e.etatAvancement==='FORE'), 'length');
  const fPct = profTotale ? Math.round(profForee/profTotale*100) : 0;
  mkChart('chartForePie', 'doughnut', {
    labels: [`Profondeur forée — ${fPct}%`, `Reste — ${100-fPct}%`],
    datasets: [{ data:[profForee, Math.max(0,profTotale-profForee)], backgroundColor:['#1e3a5f','#e5e7eb'], borderWidth:3, borderColor:'#fff', hoverOffset:4 }]
  }, { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{...LEG,position:'right'}, tooltip:{...TT,callbacks:{label:ctx=>` ${fmt(ctx.raw)} ml`}} } });
}

function updateTable() {
  const groups = {};
  filteredElements.forEach(e => {
    const dim = e.subType || '—';
    if (!groups[dim]) groups[dim] = { element:e.famille||'Pieux', dim, total:0, volumeTotal:0, lengthTotal:0, coule:0, volumeCoule:0, fore:0, lengthFore:0 };
    groups[dim].total       += 1;
    groups[dim].volumeTotal += e.volume||0;
    groups[dim].lengthTotal += e.length||0;
    if (e.betonneEtat===1) { groups[dim].coule++; groups[dim].volumeCoule += e.volume||0; }
    if (e.betonneEtat===1||e.etatAvancement==='FORE') { groups[dim].fore++; groups[dim].lengthFore += e.length||0; }
  });
  const rows = Object.values(groups).sort((a,b)=>a.dim.localeCompare(b.dim,'fr',{numeric:true}));

  let tC=0,tCoule=0,tVolT=0,tVolC=0;
  document.getElementById('tableCoulageBody').innerHTML = rows.map(g => {
    const pct = g.total>0?Math.round(g.coule/g.total*100):0;
    tC+=g.total; tCoule+=g.coule; tVolT+=g.volumeTotal; tVolC+=g.volumeCoule;
    return `<tr><td class="td-elem">${g.element}</td><td class="td-dim">${g.dim}</td><td>${g.total}</td><td class="td-orange">${g.coule}</td><td>${fmt(g.volumeTotal)}</td><td class="td-orange">${fmt(g.volumeCoule)}</td><td><div class="pct-inline"><div class="pct-track"><div class="pct-fill-bar" style="width:${Math.min(pct,100)}%"></div></div><span>${pct}%</span></div></td></tr>`;
  }).join('');
  const pctC = tC>0?Math.round(tCoule/tC*100):0;
  document.getElementById('tableCoulageFoot').innerHTML =
    `<tr class="tfoot-total"><td colspan="2"><strong>TOTAL PIEUX</strong></td><td><strong>${tC}</strong></td><td class="td-orange"><strong>${tCoule}</strong></td><td><strong>${fmt(tVolT)}</strong></td><td class="td-orange"><strong>${fmt(tVolC)}</strong></td><td><strong>${pctC}%</strong></td></tr>`;

  let tF=0,tFore=0,tLenT=0,tLenF=0;
  document.getElementById('tableForageBody').innerHTML = rows.map(g => {
    const pct = g.total>0?Math.round(g.fore/g.total*100):0;
    tF+=g.total; tFore+=g.fore; tLenT+=g.lengthTotal; tLenF+=g.lengthFore;
    return `<tr><td class="td-elem">${g.element}</td><td class="td-dim">${g.dim}</td><td>${g.total}</td><td class="td-navy">${g.fore}</td><td>${fmt(g.lengthTotal)}</td><td class="td-navy">${fmt(g.lengthFore)}</td><td><div class="pct-inline"><div class="pct-track"><div class="pct-fill-bar" style="background:#1e3a5f;width:${Math.min(pct,100)}%"></div></div><span>${pct}%</span></div></td></tr>`;
  }).join('');
  const pctF = tF>0?Math.round(tFore/tF*100):0;
  document.getElementById('tableForageFoot').innerHTML =
    `<tr class="tfoot-total"><td colspan="2"><strong>TOTAL PIEUX</strong></td><td><strong>${tF}</strong></td><td class="td-navy"><strong>${tFore}</strong></td><td><strong>${fmt(tLenT)}</strong></td><td class="td-navy"><strong>${fmt(tLenF)}</strong></td><td><strong>${pctF}%</strong></td></tr>`;
}

// ── VIEWER ────────────────────────────────────────────────
function showViewerLogin() {
  const ph = document.getElementById('viewerPlaceholder');
  if (ph) ph.innerHTML = `
    <div class="viewer-ph-inner">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffa017" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
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
          function autoFit() { try { viewer.fitToView(); } catch(e) {} }
          if (viewer.isLoadDone && viewer.isLoadDone()) setTimeout(autoFit, 300);
          viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => setTimeout(autoFit, 300), { once: true });
          setTimeout(autoFit, 3000);
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
  const filteredIds = filteredElements.map(e => e.dbId).filter(id => typeof id === 'number');
  viewer.isolate(filteredIds);
  if (filteredIds.length > 0) setTimeout(() => viewer.fitToView(filteredIds, viewer.model, false), 300);
  viewer.clearThemingColors(viewer.model);
  const orange = new THREE.Vector4(1.0, 0.627, 0.090, 1);
  filteredElements.forEach(e => {
    if (typeof e.dbId === 'number') viewer.setThemingColor(e.dbId, orange, viewer.model, true);
  });
  viewer.impl && viewer.impl.invalidate(true, true, true);
}

function resetViewerHighlight() {
  if (!viewerLoaded || !viewer) return;
  viewer.showAll();
  viewer.clearThemingColors(viewer.model);
  viewer.fitToView();
  viewer.impl && viewer.impl.invalidate(true, true, true);
}