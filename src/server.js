require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

const {
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_CALLBACK_URL = 'http://localhost:3000/api/auth/callback',
  PORT = 3000,
} = process.env;

const VERSION_URN = 'urn:adsk.wipprod:fs.file:vf.6nUM4v2vTUC8rBM9fTkEfA?version=19';
const VIEWABLE_GUID  = '7a6f05d0-a271-92da-5c30-a08b214d7678';
const DERIVATIVE_URN = Buffer.from(VERSION_URN).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

console.log('[Config] URN:', DERIVATIVE_URN);

let session = { token: null, refreshToken: null, expiresAt: 0 };

async function getValidToken() {
  if (session.token && Date.now() < session.expiresAt) return session.token;
  if (session.refreshToken) {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: session.refreshToken,
        client_id: APS_CLIENT_ID, client_secret: APS_CLIENT_SECRET,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      session = { token: data.access_token, refreshToken: data.refresh_token || session.refreshToken, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
      return session.token;
    }
    session = { token: null, refreshToken: null, expiresAt: 0 };
  }
  throw new Error('NON_AUTHENTIFIE');
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.get('/api/auth/login', (_req, res) => {
  const url = new URL('https://developer.api.autodesk.com/authentication/v2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id',    APS_CLIENT_ID);
  url.searchParams.set('redirect_uri', APS_CALLBACK_URL);
  url.searchParams.set('scope',        'data:read viewables:read');
  res.redirect(url.toString());
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Code manquant');
  try {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: APS_CLIENT_ID, client_secret: APS_CLIENT_SECRET, redirect_uri: APS_CALLBACK_URL }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    session = { token: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    res.redirect('/');
  } catch (err) { res.redirect('/?error=' + encodeURIComponent(err.message)); }
});

app.get('/api/auth/status', (_req, res) => {
  res.json({ connected: !!(session.token && Date.now() < session.expiresAt + 3600000) });
});

app.get('/api/token', async (_req, res) => {
  try { res.json({ access_token: await getValidToken(), expires_in: 3600 }); }
  catch { res.status(401).json({ error: 'NON_AUTHENTIFIE' }); }
});

app.get('/api/model-urn', (_req, res) => {
  res.json({ urn: DERIVATIVE_URN, viewableGuid: VIEWABLE_GUID });
});

// ── Helper commun ─────────────────────────────────────────────────────────────
async function fetchProps(token) {
  const metaResp = await fetch(
    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaResp.ok) throw new Error(`Metadata: ${metaResp.status}`);
  const metaData = await metaResp.json();
  const metaList = (metaData.data && metaData.data.metadata) || [];
  const guid = metaList.find(m => m.guid === VIEWABLE_GUID)?.guid
            || metaList.find(m => m.role === '3d')?.guid
            || metaList[0]?.guid
            || VIEWABLE_GUID;
  const propsResp = await fetch(
    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata/${guid}/properties?forceget=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!propsResp.ok) throw new Error(`Properties: ${propsResp.status}`);
  const propsData = await propsResp.json();
  return { collection: (propsData.data && propsData.data.collection) || [], guid };
}

function normKey(s) { return String(s).replace(/[\s\-_]/g, '').toLowerCase(); }
function buildPropMap(properties) {
  const map = {};
  for (const group of Object.values(properties || {})) {
    if (typeof group !== 'object' || group === null) continue;
    for (const [k, v] of Object.entries(group)) map[normKey(k)] = v;
  }
  return (name) => map[normKey(name)];
}
function toBool(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (v === 1 || v === true) return 1;
  const s = String(v).trim().toLowerCase();
  return (s === 'yes' || s === '1' || s === 'true' || s === 'oui') ? 1 : 0;
}

// ── /api/properties ───────────────────────────────────────────────────────────
app.get('/api/properties', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const elements = [];
    for (const obj of collection) {
      const P = buildPropMap(obj.properties);
      const typeCode = String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase();
      if (typeCode !== 'PI' && typeCode !== 'SI') continue;
      const etatAvancement = String(P("OO-ETAT D'AVENCEMENT 1") || P('OO-ETAT DAVENCEMENT 1') || '').trim().toUpperCase();
      const rawZoneTrv = String(P('OOT-ZONE DE TRV') || P('OOT_ZONE DE TRV') || '').trim().toLowerCase();

      // ── Paramètre ENTREPRISE (texte) ──────────────────
      // Essayer plusieurs variantes de noms possibles dans Revit
      const entrepriseRaw = P('ENTREPRISE') || P('Entreprise') || P('entreprise') ||
                            P('OOP_Entreprise') || P('OOP-ENTREPRISE') || '';
      const entreprise = String(entrepriseRaw || '').trim().toUpperCase();

      elements.push({
        dbId:        obj.objectid,
        name:        obj.name || '',
        elementType: typeCode,
        famille:     String(P('OOP_Type') || P('OOP_Famille') || typeCode).trim(),
        zone:        String(P('OOP_Zone') || '').trim(),
        direction:   String(P('OOF_ZONE') || '').trim().toUpperCase(),
        subType:     String(P('OOP_Sub Type') || P('ME_ELEMENT SUB TYPE') || '').trim(),
        subzone:     String(P('ME_ELEMENT SUB ZONE') || P('ME_ELEMENT SUBZONE') || '').trim(),
        elementZone: String(P('ME_ELEMENT ZONE') || '').trim().toUpperCase(),
        entreprise,  // ← paramètre texte ENTREPRISE (ex: 'TGCC', 'SGTM')
        volume:      Math.round((parseFloat(String(P('ME_VOLUME') || '').replace(/[^0-9.]/g, '')) || 0) * 100) / 100,
        length:      parseFloat(String(P('ME_LENGTH') || '').replace(/[^0-9.]/g, '')) || 0,
        betonne:     toBool(P('OOP-BETONNE')),
        fore:        toBool(P('OOP-FORE')),
        tgcc:        toBool(P('TGCC')),
        zoneTrv:     rawZoneTrv === 'yes' || rawZoneTrv === '1' || rawZoneTrv === 'oui' ? 'Oui' : rawZoneTrv === 'no' || rawZoneTrv === '0' || rawZoneTrv === 'non' ? 'Non' : '',
        betonneEtat:    etatAvancement === 'BETONNE' ? 1 : 0,
        etatAvancement,
        elevBase: parseFloat(String(P('Elevation a la base') || '0').replace(/[^0-9.\-]/g, '')) || 0,
        elevHaut: parseFloat(String(P('Elevation en haut')   || '0').replace(/[^0-9.\-]/g, '')) || 0,
      });
    }
    res.json({ total: elements.length, elements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/debug-entreprise — pour vérifier les valeurs du paramètre ────────────
app.get('/api/debug-entreprise', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const stats = {};
    for (const obj of collection) {
      const P = buildPropMap(obj.properties);
      if (String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase() !== 'PI') continue;
      const val = String(
        P('ENTREPRISE') || P('Entreprise') || P('entreprise') ||
        P('OOP_Entreprise') || P('OOP-ENTREPRISE') || '(vide)'
      ).trim().toUpperCase();
      stats[val] = (stats[val] || 0) + 1;
    }
    res.json({ stats, total: Object.values(stats).reduce((a,b)=>a+b,0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/debug-subzones ───────────────────────────────────────────────────────
app.get('/api/debug-subzones', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const stats = {};
    let totalVol = 0;
    for (const obj of collection) {
      const P = buildPropMap(obj.properties);
      if (String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase() !== 'PI') continue;
      const subzone = String(P('ME_ELEMENT SUB ZONE') || '').trim();
      const vol     = parseFloat(String(P('ME_VOLUME') || '').replace(/[^0-9.]/g, '')) || 0;
      totalVol += vol;
      const key = subzone || '(vide)';
      if (!stats[key]) stats[key] = { count: 0, volume: 0 };
      stats[key].count++;
      stats[key].volume = Math.round((stats[key].volume + vol) * 100) / 100;
    }
    res.json({ totalVolume: Math.round(totalVol * 100) / 100, subzones: stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/debug-pi ─────────────────────────────────────────────────────────────
app.get('/api/debug-pi', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const pi = collection.find(o => {
      const P = buildPropMap(o.properties);
      return String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase() === 'PI';
    });
    if (!pi) return res.json({ error: 'Aucun PI trouvé' });
    res.json({ objectid: pi.objectid, name: pi.name, properties: pi.properties });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/debug-fore ───────────────────────────────────────────────────────────
app.get('/api/debug-fore', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const fores = [];
    let totalLen = 0;
    for (const obj of collection) {
      const P = buildPropMap(obj.properties);
      if (String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase() !== 'PI') continue;
      if (!toBool(P('OOP-FORE'))) continue;
      const length = parseFloat(String(P('ME_LENGTH') || '0').replace(/[^0-9.]/g, '')) || 0;
      totalLen += length;
      fores.push({ id: obj.objectid, name: obj.name, length });
    }
    res.json({ count: fores.length, totalLength: Math.round(totalLen * 100) / 100, fores: fores.slice(0, 20) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/count-pi ─────────────────────────────────────────────────────────────
app.get('/api/count-pi', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    let total = 0, withB = 0, withoutB = 0;
    const sans = [];
    for (const obj of collection) {
      const P = buildPropMap(obj.properties);
      if (String(P('ME_ELEMENT TYPE') || '').trim().toUpperCase() !== 'PI') continue;
      total++;
      if (obj.name && obj.name.includes('[')) withB++;
      else { withoutB++; if (sans.length < 20) sans.push({ id: obj.objectid, name: obj.name }); }
    }
    res.json({ totalPI: total, withBracket: withB, withoutBracket: withoutB, exemples: sans });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/debug-props ──────────────────────────────────────────────────────────
app.get('/api/debug-props', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const sample = collection.slice(0, 3).map(obj => ({ objectid: obj.objectid, name: obj.name, properties: obj.properties }));
    res.json({ total: collection.length, sample });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/list-views ───────────────────────────────────────────────────────────
app.get('/api/list-views', async (_req, res) => {
  try {
    const token = await getValidToken();
    const metaResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(await metaResp.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/raw-props ────────────────────────────────────────────────────────────
app.get('/api/raw-props', async (_req, res) => {
  try {
    const token = await getValidToken();
    const { collection } = await fetchProps(token);
    const findOne = (type) => {
      const obj = collection.find(o => {
        const flat = {};
        Object.values(o.properties || {}).forEach(g => { if (typeof g === 'object') Object.assign(flat, g); });
        return flat['ME_ELEMENT TYPE'] === type;
      });
      if (!obj) return null;
      const flat = {};
      Object.values(obj.properties || {}).forEach(g => { if (typeof g === 'object') Object.assign(flat, g); });
      const result = { name: obj.name };
      Object.entries(flat).forEach(([k, v]) => { if (k.startsWith('ME_') || k.startsWith('OOP_') || k === 'Volume') result[k] = v; });
      return result;
    };
    res.json({ total: collection.length, SI: findOne('SI'), PI: findOne('PI') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/acc-status ───────────────────────────────────────────────────────────
app.get('/api/acc-status', async (_req, res) => {
  try {
    const token = await getValidToken();
    const resp  = await fetch('https://developer.api.autodesk.com/project/v1/hubs', { headers: { Authorization: `Bearer ${token}` } });
    res.json({ connected: resp.status === 200 });
  } catch { res.json({ connected: false }); }
});

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏗️  SGTM Fondations  →  http://localhost:${PORT}`);
  console.log(`🔑 Login            →  http://localhost:${PORT}/api/auth/login`);
});