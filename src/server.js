require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const {
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_CALLBACK_URL = 'http://localhost:3000/api/auth/callback',
  PORT = 3000,
} = process.env;

// ── Maquette Fondations ───────────────────────────────────────────────────────
const VERSION_URN   = 'urn:adsk.wipprod:fs.file:vf.XLwcx4YUVROV6idLRuBSLg?version=1';
const VIEWABLE_GUID = '51de9167-5c01-ab73-d85b-8569c525f054';
const DERIVATIVE_URN = Buffer.from(VERSION_URN).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

console.log('[Config] URN:', DERIVATIVE_URN);

// ── Session ───────────────────────────────────────────────────────────────────
let session = { token: null, refreshToken: null, expiresAt: 0 };

async function getValidToken() {
  if (session.token && Date.now() < session.expiresAt) return session.token;
  if (session.refreshToken) {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: session.refreshToken,
        client_id:     APS_CLIENT_ID,
        client_secret: APS_CLIENT_SECRET,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      session = {
        token:        data.access_token,
        refreshToken: data.refresh_token || session.refreshToken,
        expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
      };
      console.log('[Auth] Token rafraîchi ✓');
      return session.token;
    }
    session = { token: null, refreshToken: null, expiresAt: 0 };
  }
  throw new Error('NON_AUTHENTIFIE');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/auth/login', (_req, res) => {
  const url = new URL('https://developer.api.autodesk.com/authentication/v2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id',     APS_CLIENT_ID);
  url.searchParams.set('redirect_uri',  APS_CALLBACK_URL);
  url.searchParams.set('scope',         'data:read viewables:read');
  res.redirect(url.toString());
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Code manquant');
  try {
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     APS_CLIENT_ID,
        client_secret: APS_CLIENT_SECRET,
        redirect_uri:  APS_CALLBACK_URL,
      }),
    });
    if (!resp.ok) throw new Error(`${resp.status} — ${await resp.text()}`);
    const data = await resp.json();
    session = {
      token:        data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
    };
    console.log('[Auth] Connecté ✓');
    res.redirect('/');
  } catch (err) {
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

app.get('/api/auth/status', (_req, res) => {
  res.json({ connected: !!(session.token && Date.now() < session.expiresAt + 3600000) });
});

// ══════════════════════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/token', async (_req, res) => {
  try { res.json({ access_token: await getValidToken(), expires_in: 3600 }); }
  catch { res.status(401).json({ error: 'NON_AUTHENTIFIE' }); }
});

app.get('/api/model-urn', (_req, res) => {
  res.json({ urn: DERIVATIVE_URN, viewableGuid: VIEWABLE_GUID });
});

app.get('/api/properties', async (_req, res) => {
  try {
    const token = await getValidToken();

    // Step 1: Get metadata list to find the correct model GUID
    const metaResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaResp.ok) {
      const txt = await metaResp.text();
      console.log('[Properties] Metadata error:', metaResp.status, txt.slice(0,200));
      return res.status(metaResp.status).json({ error: `Metadata inaccessible: ${metaResp.status}` });
    }
    const metaData = await metaResp.json();
    console.log('[Properties] Metadata:', JSON.stringify(metaData).slice(0,300));

    // Find guid — prefer OO_TENT_ACC view
    const metaList = (metaData.data && metaData.data.metadata) || [];
    let guid = metaList.find(m => m.name === 'OO_TENT_ACC')?.guid
            || metaList.find(m => m.role === '3d')?.guid
            || metaList[0]?.guid
            || VIEWABLE_GUID;

    console.log('[Properties] Using guid:', guid);

    // Step 2: Properties
    const propsResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata/${guid}/properties?forceget=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!propsResp.ok) {
      const txt = await propsResp.text();
      console.log('[Properties] Props error:', propsResp.status, txt.slice(0,200));
      return res.status(propsResp.status).json({ error: `Properties inaccessibles: ${propsResp.status}` });
    }

    const propsData  = await propsResp.json();
    const collection = (propsData.data && propsData.data.collection) || [];
    const elements   = [];

    for (const obj of collection) {
      const allProps = {};
      for (const group of Object.values(obj.properties || {})) {
        if (typeof group === 'object' && group !== null) Object.assign(allProps, group);
      }
      // ME_ELEMENT TYPE = "SI" (semelles) ou "PI" (pieux)
      const typeCode = allProps['ME_ELEMENT TYPE'] || '';
      if (!typeCode) continue;

      const famille  = allProps['OOP_Famille'] || typeCode;
      const zone     = allProps['OOP_Zone'] || allProps['ME_ELEMENT ZONE'] || 'N/A';
      const subType  = allProps['OOP_Sub Type'] || allProps['ME_ELEMENT SUB TYPE'] || '';
      const niveau   = allProps['OOP_Niveau'] || allProps['ME_ELEMENT LEVEL'] || '';
      const categorie = typeCode === 'PI' ? 'Pieux' : 'Semelles';

      // Volume
      // PI : ME_VOLUME en m³ directement
      // SI : ME_AREA (m²) × "Epaisseur de fondation" (m)
      let volume = 0;
      if (typeCode === 'PI' && allProps['ME_VOLUME']) {
        volume = Math.round(parseFloat(allProps['ME_VOLUME']) * 100) / 100;
      } else if (typeCode === 'SI') {
        const area = parseFloat(allProps['ME_AREA']) || 0;
        const epaisseur = parseFloat(allProps['Epaisseur de fondation'] || allProps['Foundation Thickness'] || allProps['ME_WIDTH B'] || 0);
        if (area > 0 && epaisseur > 0) {
          volume = Math.round(area * epaisseur * 100) / 100;
        }
      }

      // Elévations (profondeurs)
      const elevBase = parseFloat(allProps['Elévation à la base'] || allProps['Base Elevation'] || allProps['Elevation at Bottom'] || 0);
      const elevHaut = parseFloat(allProps['Elévation en haut']   || allProps['Top Elevation']  || allProps['Elevation at Top']    || 0);

      elements.push({
        dbId: obj.objectid,
        name: obj.name || '',
        elementType: typeCode,
        famille,
        categorie,
        zone,
        subType,
        niveau,
        volume,
        elevBase,
        elevHaut
      });
    }
    res.json({ total: elements.length, elements });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug-props', async (_req, res) => {
  try {
    const token = await getValidToken();
    const metaResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const metaData = await metaResp.json();
    const metaList = (metaData.data && metaData.data.metadata) || [];
    const guid = metaList[0]?.guid || VIEWABLE_GUID;

    const propsResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata/${guid}/properties?forceget=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const propsData = await propsResp.json();
    const collection = (propsData.data && propsData.data.collection) || [];

    // Return first 3 elements with ALL their properties
    const sample = collection.slice(0, 3).map(obj => ({
      objectid: obj.objectid,
      name: obj.name,
      properties: obj.properties
    }));
    res.json({ total: collection.length, sample });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/acc-status', async (_req, res) => {
  try {
    const token = await getValidToken();
    const resp  = await fetch('https://developer.api.autodesk.com/project/v1/hubs',
      { headers: { Authorization: `Bearer ${token}` } });
    res.json({ connected: resp.status === 200 });
  } catch { res.json({ connected: false }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏗️  SGTM Fondations  →  http://localhost:${PORT}`);
  console.log(`🔑 Login            →  http://localhost:${PORT}/api/auth/login`);
});

// TEMP: debug raw props — show all values
app.get('/api/raw-props', async (_req, res) => {
  try {
    const token = await getValidToken();
    const metaResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const metaData = await metaResp.json();
    const guid = (metaData.data?.metadata || [])[0]?.guid || VIEWABLE_GUID;
    const propsResp = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${DERIVATIVE_URN}/metadata/${guid}/properties?forceget=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const propsData = await propsResp.json();
    const collection = propsData.data?.collection || [];
    // One SI and one PI with ALL values
    const findOne = (type) => {
      const obj = collection.find(o => {
        const flat = {};
        Object.values(o.properties||{}).forEach(g => { if(typeof g==='object') Object.assign(flat,g); });
        return flat['ME_ELEMENT TYPE'] === type;
      });
      if (!obj) return null;
      const flat = {};
      Object.values(obj.properties||{}).forEach(g => { if(typeof g==='object') Object.assign(flat,g); });
      // Return ALL ME_ and OOP_ params with their values
      const result = { name: obj.name };
      Object.entries(flat).forEach(([k,v]) => {
        if (k.startsWith('ME_') || k.startsWith('OOP_') || k === 'Volume') result[k] = v;
      });
      return result;
    };
    res.json({ total: collection.length, SI: findOne('SI'), PI: findOne('PI') });
  } catch(e) { res.status(500).json({error: e.message}); }
});
