/* MCI SIM · KKU — shared tabletop map for mass-casualty-incident drills.
 * Live sync between devices via MQTT over WebSocket (public broker, no account needed).
 * Every map item is stored as a retained message: <prefix>/<room>/i/<id>
 */
(() => {
'use strict';

/* ---------------- config ---------------- */
const BROKERS = {
  hivemq: { name: 'HiveMQ public', url: 'wss://broker.hivemq.com:8884/mqtt' },
  emqx:   { name: 'EMQX public',   url: 'wss://broker.emqx.io:8084/mqtt' },
};
const PREFIX = 'kkumcisim/v1';
const PLACES = [
  { id: 'srinagarind', name: 'Srinagarind Hospital (KKU)', ll: [16.4681, 102.8301], z: 17 },
  { id: 'central',     name: 'Central Khon Kaen Campus',   ll: [16.4632, 102.8303], z: 18 },
  { id: 'both',        name: 'Srinagarind + Central Campus', ll: [16.4655, 102.8310], z: 17 },
  { id: 'kku',         name: 'KKU main campus (overview)', ll: [16.4745, 102.8230], z: 15 },
];
const DEFAULT_VIEW = PLACES[2];

/* ---------------- component catalog ---------------- */
const C = { red: '#d32f2f', yel: '#f9c80e', grn: '#2e9d48', blk: '#1a1a1a', blu: '#1565c0', org: '#ef6c00' };
const CATS = [
  { id: 'sign', name: 'Signs' }, { id: 'veh', name: 'Vehicles' }, { id: 'per', name: 'Staff' },
  { id: 'pt', name: 'Patients' }, { id: 'zone', name: 'Zones & Lines' }, { id: 'eq', name: 'Equipment' },
];
const T = {};
function def(t, cat, kind, name, o = {}) { T[t] = Object.assign({ t, cat, kind, name }, o); }
// signs (look like the printed tiles)
def('s_triage', 'sign', 'sign', 'Triage area', { text: 'Triage\narea' });
def('s_treat', 'sign', 'sign', 'Treatment area', { text: 'Treatment\narea' });
def('s_treat_r', 'sign', 'sign', 'Treatment – Red', { text: 'RED\nImmediate', bar: C.red });
def('s_treat_y', 'sign', 'sign', 'Treatment – Yellow', { text: 'YELLOW\nDelayed', bar: C.yel });
def('s_treat_g', 'sign', 'sign', 'Treatment – Green', { text: 'GREEN\nMinor', bar: C.grn });
def('s_morgue', 'sign', 'sign', 'Morgue / Black', { text: 'Morgue', bar: C.blk });
def('s_cp', 'sign', 'sign', 'Command Post', { text: 'Command\nPost', bar: C.blu });
def('s_load', 'sign', 'sign', 'Loading area', { text: 'Loading\narea' });
def('s_stage', 'sign', 'sign', 'Staging area', { text: 'Staging\narea' });
def('s_entr', 'sign', 'sign', 'Entrance', { text: 'Entrance', cls: 'dark' });
def('s_exit', 'sign', 'sign', 'Exit', { text: 'Exit', cls: 'exit' });
def('s_decon', 'sign', 'sign', 'Decontamination', { text: 'Decon', bar: C.org });
def('s_heli', 'sign', 'sign', 'Helipad', { text: 'H', cls: 'big' });
def('s_family', 'sign', 'sign', 'Family / Media', { text: 'Family /\nMedia' });
def('s_haz', 'sign', 'sign', 'Hazard', { text: '⚠ Hazard', bar: C.org });
def('s_custom', 'sign', 'sign', 'Custom sign', { text: 'Sign' });
// vehicles
def('v_als', 'veh', 'veh', 'Ambulance ALS', { emo: '🚑', ring: C.red, pre: 'ALS' });
def('v_bls', 'veh', 'veh', 'Ambulance BLS', { emo: '🚑', ring: C.blu, pre: 'BLS' });
def('v_fr', 'veh', 'veh', 'First responder', { emo: '🚙', ring: C.grn, pre: 'FR' });
def('v_rescue', 'veh', 'veh', 'Rescue car', { emo: '🚐', ring: C.org, pre: 'RES' });
def('v_fire', 'veh', 'veh', 'Fire truck', { emo: '🚒', ring: C.red, pre: 'FIRE' });
def('v_pol', 'veh', 'veh', 'Police', { emo: '🚓', ring: C.blk, pre: 'POL' });
def('v_bus', 'veh', 'veh', 'Bus', { emo: '🚌', ring: '#6d4c41', pre: 'BUS' });
def('v_heli', 'veh', 'veh', 'Helicopter', { emo: '🚁', ring: '#6a1b9a', pre: 'HEMS' });
def('v_car', 'veh', 'veh', 'Private car', { emo: '🚗', ring: '#78909c', pre: 'CAR' });
// staff
def('p_ic', 'per', 'per', 'Incident Commander', { code: 'IC', vest: '#c62828' });
def('p_mc', 'per', 'per', 'Medical Commander', { code: 'MC', vest: '#ad1457' });
def('p_tri', 'per', 'per', 'Triage officer', { code: 'TRI', vest: '#ef6c00' });
def('p_trt', 'per', 'per', 'Treatment officer', { code: 'TRT', vest: '#2e7d32' });
def('p_trn', 'per', 'per', 'Transport officer', { code: 'TRN', vest: '#00838f' });
def('p_md', 'per', 'per', 'Doctor', { code: 'MD', vest: '#1565c0' });
def('p_rn', 'per', 'per', 'Nurse', { code: 'RN', vest: '#5e35b1' });
def('p_emt', 'per', 'per', 'Paramedic / EMT', { code: 'EMT', vest: '#f57c00' });
def('p_res', 'per', 'per', 'Rescue volunteer', { code: 'RES', vest: '#558b2f' });
def('p_pol', 'per', 'per', 'Police officer', { code: 'POL', vest: '#263238' });
def('p_ff', 'per', 'per', 'Firefighter', { code: 'FF', vest: '#b71c1c' });
def('p_by', 'per', 'per', 'Bystander', { code: 'BY', vest: '#9e9e9e' });
// patients
def('pt_r', 'pt', 'pt', 'Red · Immediate', { tri: 'r' });
def('pt_y', 'pt', 'pt', 'Yellow · Delayed', { tri: 'y' });
def('pt_g', 'pt', 'pt', 'Green · Minor', { tri: 'g' });
def('pt_b', 'pt', 'pt', 'Black · Dead/Expectant', { tri: 'b' });
def('pt_u', 'pt', 'pt', 'Untriaged casualty', { tri: 'u' });
// zones & lines
def('z_hot', 'zone', 'zone', 'Hot zone', { col: C.red, r: 40 });
def('z_warm', 'zone', 'zone', 'Warm zone', { col: '#f9a825', r: 70 });
def('z_cold', 'zone', 'zone', 'Cold zone', { col: C.grn, r: 110 });
def('z_area', 'zone', 'zone', 'Area circle', { col: C.blu, r: 25 });
def('l_tape', 'zone', 'tape', 'Barrier tape (line)', {});
def('l_arrow', 'zone', 'arrow', 'Traffic flow arrow', { col: C.blu });
def('l_route', 'zone', 'arrow', 'Ambulance route', { col: C.red });
// equipment
def('e_cone', 'eq', 'cone', 'Traffic cone', {});
def('e_flag_r', 'eq', 'flag', 'Red flag', { col: C.red });
def('e_flag_y', 'eq', 'flag', 'Yellow flag', { col: C.yel });
def('e_flag_g', 'eq', 'flag', 'Green flag', { col: C.grn });
def('e_flag_b', 'eq', 'flag', 'Black flag', { col: C.blk });
def('e_barrier', 'eq', 'barrier', 'Barrier', {});
def('e_tent', 'eq', 'equip', 'Tent', { emo: '⛺' });
def('e_stretch', 'eq', 'equip', 'Stretcher', { emo: '🛏️' });
def('e_supply', 'eq', 'equip', 'Supplies', { emo: '📦' });
def('e_o2', 'eq', 'equip', 'Oxygen', { emo: '🫁' });
def('e_fire', 'eq', 'equip', 'Fire / smoke', { emo: '🔥' });
def('e_wreck', 'eq', 'equip', 'Crash site', { emo: '💥' });
def('e_wind', 'eq', 'wind', 'Wind direction', {});
def('e_note', 'eq', 'note', 'Text note', {});

const TRI = { r: ['Red', C.red], y: ['Yellow', C.yel], g: ['Green', C.grn], b: ['Black', C.blk], u: ['Untriaged', '#90a4ae'] };

/* ---------------- state ---------------- */
const $ = (s) => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('mcisim.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mcisim.' + k, JSON.stringify(v)); } catch {} },
};
const clientId = 'mci_' + Math.random().toString(36).slice(2, 10);
const S = {
  room: null, name: LS.get('name', ''), items: new Map(), views: new Map(),
  sel: null, mode: null, dragging: new Set(), locked: LS.get('locked', false),
  zoomScale: LS.get('zoomScale', true), broker: LS.get('broker', 'hivemq'),
  peers: new Map(), log: [], timer: { run: false, base: 0, start: 0 }, seen: new Set(),
  connected: false, cat: 'sign',
};

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cleanRoom(r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24); }
function randRoom() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = 'KKU-'; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function fmtTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); }
function clock(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
function itemName(it) { const d = T[it.t]; return (it.label && it.label.trim()) ? `${d ? d.name : it.t} “${it.label.split('\n')[0]}”` : (d ? d.name : it.t); }

/* ---------------- modal helpers (no native dialogs) ---------------- */
function modal(html, onReady) {
  $('#modalBox').innerHTML = html; $('#modal').hidden = false;
  return new Promise((resolve) => {
    const close = (v) => { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; resolve(v); };
    $('#modalBox').querySelectorAll('[data-v]').forEach((b) => b.onclick = () => {
      const inp = $('#modalBox input[type=text]');
      close(b.dataset.v === 'ok' && inp ? inp.value : b.dataset.v);
    });
    const inp = $('#modalBox input[type=text]');
    if (inp) { inp.focus(); inp.select(); inp.onkeydown = (e) => { if (e.key === 'Enter') close(inp.value); if (e.key === 'Escape') close(null); }; }
    $('#modal').onclick = (e) => { if (e.target.id === 'modal') close(null); };
    onReady && onReady(close);
  });
}
async function ask(title, text, value = '', ok = 'OK') {
  const v = await modal(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<input type="text" value="${esc(value)}"><div class="btns"><button data-v="cancel">Cancel</button><button class="primary" data-v="ok">${esc(ok)}</button></div>`);
  return (v === 'cancel' || v == null) ? null : v;
}
async function confirmBox(title, text, ok = 'OK', danger = false) {
  const v = await modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="btns"><button data-v="no">Cancel</button><button class="${danger ? 'danger' : 'primary'}" data-v="yes">${esc(ok)}</button></div>`);
  return v === 'yes';
}

/* ---------------- map ---------------- */
const map = L.map('map', { zoomControl: false, maxZoom: 21, doubleClickZoom: false, tap: true })
  .setView(DEFAULT_VIEW.ll, DEFAULT_VIEW.z);
const LAYERS = {
  street: { name: 'Street (OSM)', l: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap contributors' }) },
  sat: { name: 'Satellite', l: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }) },
  hybrid: { name: 'Satellite + labels', l: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri' }),
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { maxNativeZoom: 19, maxZoom: 21, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }) ]) },
  light: { name: 'Light (clean)', l: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxNativeZoom: 19, maxZoom: 21, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }) },
};
let curLayer = LS.get('layer', 'street'); if (!LAYERS[curLayer]) curLayer = 'street';
LAYERS[curLayer].l.addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
const itemPane = map.createPane('items'); itemPane.style.zIndex = 620;

function applyZoomScale() {
  const s = S.zoomScale ? Math.min(2.2, Math.max(0.35, Math.pow(2, map.getZoom() - 17))) : 1;
  map.getContainer().style.setProperty('--zs', s);
}
map.on('zoomend', applyZoomScale); applyZoomScale();

/* ---------------- rendering ---------------- */
function tokenHTML(it, preview = false) {
  const d = T[it.t]; if (!d) return '<div class="tok"><div class="tok-in equip">?</div></div>';
  const rot = it.rot || 0, sz = it.sz || 1;
  const cls = 'tok' + (S.sel === it.id && !preview ? ' sel' : '');
  const st = `style="--rot:${rot}deg;--sz:${sz}"`;
  let inner = '', lbl = '';
  switch (d.kind) {
    case 'sign': {
      const text = it.label != null && it.label !== '' ? it.label : d.text;
      inner = `<div class="sign ${d.cls || ''}" style="${d.bar ? `--bar:${d.bar}` : ''}">${esc(text)}</div>`; break;
    }
    case 'veh': inner = `<div class="veh" style="--ring:${d.ring}">${d.emo}</div>`; lbl = it.label; break;
    case 'per': inner = `<div class="per" style="--vest:${d.vest}">${d.code}</div>`; lbl = it.label; break;
    case 'pt': { const tri = it.tri || d.tri; inner = `<div class="pt ${tri}" style="${tri === 'u' ? 'background:#90a4ae;color:#fff' : ''}">${esc((it.label || '').replace(/^#/, '').slice(0, 3))}</div>`; break; }
    case 'cone': inner = `<svg width="22" height="26" viewBox="0 0 24 28"><path d="M9 2h6l7 21H2z" fill="#e53935"/><path d="M7.6 8h8.8l1.3 4H6.3zM5.3 15h13.4l1.3 4H4z" fill="#fff"/><rect x="0" y="22.5" width="24" height="4.5" rx="1" fill="#b71c1c"/></svg>`; lbl = it.label; break;
    case 'flag': inner = `<svg width="28" height="38" viewBox="0 0 30 40"><rect x="13.5" y="10" width="3" height="27" fill="#fff" stroke="#888" stroke-width=".6"/><rect x="7" y="35" width="16" height="4" rx="1" fill="#fff" stroke="#888" stroke-width=".6"/><rect x="2" y="2" width="26" height="12" rx="2" fill="${d.col}" stroke="#fff" stroke-width="2"/></svg>`; lbl = it.label; break;
    case 'barrier': inner = `<svg width="46" height="14" viewBox="0 0 46 14"><defs><pattern id="bz" width="10" height="14" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)"><rect width="5" height="14" fill="#e53935"/><rect x="5" width="5" height="14" fill="#fff"/></pattern></defs><rect x="1" y="1" width="44" height="12" rx="2" fill="url(#bz)" stroke="#555"/></svg>`; lbl = it.label; break;
    case 'equip': inner = `<div class="equip">${d.emo}</div>`; lbl = it.label; break;
    case 'wind': inner = `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#fff" stroke="#0277bd" stroke-width="2"/><path d="M17 5 L24 20 L17 16 L10 20 Z" fill="#0277bd"/><text x="17" y="30" font-size="7" text-anchor="middle" fill="#0277bd" font-weight="700">WIND</text></svg>`; lbl = it.label; break;
    case 'note': inner = `<div class="note">${esc(it.label || 'Note')}</div>`; break;
  }
  return `<div class="${cls}" ${st}><div class="tok-in">${inner}</div>${lbl ? `<div class="tok-lbl">${esc(lbl)}</div>` : ''}</div>`;
}

function visualKey(it) { const c = Object.assign({}, it); delete c.lat; delete c.lng; delete c.ts; delete c.by; return JSON.stringify(c) + (S.sel === it.id) + S.locked; }

function removeView(id) {
  const v = S.views.get(id); if (!v) return;
  v.layers.forEach((l) => map.removeLayer(l)); S.views.delete(id);
}

function render(it) {
  const d = T[it.t]; if (!d) return;
  const old = S.views.get(it.id);
  const key = visualKey(it);
  if (old && old.key === key) {
    // only position changed
    if (old.marker && !S.dragging.has(it.id)) old.marker.setLatLng([it.lat, it.lng]);
    if (old.circle) old.circle.setLatLng([it.lat, it.lng]);
    return;
  }
  removeView(it.id);
  const v = { key, layers: [] };
  if (d.kind === 'zone') {
    const col = it.col || d.col;
    v.circle = L.circle([it.lat, it.lng], { radius: it.r || d.r, color: col, weight: 2, dashArray: it.t === 'z_warm' ? '8 6' : null, fillColor: col, fillOpacity: .13, pane: 'overlayPane' });
    v.circle.bindTooltip(esc(it.label || d.name), { permanent: true, direction: 'center', className: 'zlabel' });
    v.circle.on('click', (e) => { L.DomEvent.stop(e); if (S.mode) map.fire('click', { latlng: e.latlng }); else select(it.id); });
    v.marker = L.marker([it.lat, it.lng], { pane: 'items', draggable: !S.locked, icon: L.divIcon({ className: 'tokwrap', iconSize: [14, 14], html: `<div class="zhandle" style="--zc:${col}"></div>` }) });
    if (S.sel === it.id) v.circle.setStyle({ weight: 4 });
    v.layers.push(v.circle, v.marker);
  } else if (d.kind === 'tape' || d.kind === 'arrow') {
    const pts = it.pts || [];
    if (d.kind === 'tape') {
      const a = L.polyline(pts, { color: '#f9c80e', weight: 7, opacity: 1 });
      const b = L.polyline(pts, { color: '#111', weight: 7, dashArray: '10 10', opacity: 1 });
      v.layers.push(a, b);
    } else {
      const col = it.col || d.col;
      const line = L.polyline(pts, { color: col, weight: 5, opacity: .9, dashArray: it.t === 'l_route' ? '12 8' : null });
      v.layers.push(line);
      if (pts.length >= 2) {
        const p1 = map.project(pts[pts.length - 2], 18), p2 = map.project(pts[pts.length - 1], 18);
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 90;
        const head = L.marker(pts[pts.length - 1], { pane: 'items', interactive: false, icon: L.divIcon({ className: 'tokwrap', iconSize: [18, 18], html: `<div class="arrowhead" style="--ac:${col};transform:rotate(${ang}deg)"></div>` }) });
        v.layers.push(head);
      }
    }
    if (S.sel === it.id) v.layers.push(L.polyline(pts, { color: '#1e88e5', weight: 13, opacity: .35, interactive: false }));
    if (it.label && pts.length) v.layers[0].bindTooltip(esc(it.label), { permanent: true, className: 'zlabel', direction: 'top' });
    v.layers.forEach((l) => l.on && l.on('click', (e) => { L.DomEvent.stop(e); if (S.mode) map.fire('click', { latlng: e.latlng }); else select(it.id); }));
  } else {
    v.marker = L.marker([it.lat, it.lng], { pane: 'items', draggable: !S.locked, riseOnHover: true, icon: L.divIcon({ className: 'tokwrap', iconSize: [0, 0], html: tokenHTML(it) }) });
    v.layers.push(v.marker);
  }
  if (v.marker) {
    const mk = v.marker; let last = 0;
    mk.on('click', (e) => { L.DomEvent.stop(e); if (S.mode) map.fire('click', { latlng: e.latlng }); else select(it.id); });
    mk.on('dragstart', () => { S.dragging.add(it.id); });
    mk.on('drag', () => {
      const ll = mk.getLatLng(); const cur = S.items.get(it.id); if (!cur) return;
      if (v.circle) v.circle.setLatLng(ll);
      const now = Date.now();
      if (now - last > 120) { last = now; publishItem(Object.assign({}, cur, { lat: ll.lat, lng: ll.lng }), 0); }
    });
    mk.on('dragend', () => {
      const ll = mk.getLatLng(); const cur = S.items.get(it.id);
      S.dragging.delete(it.id);
      if (!cur) return;
      const up = Object.assign({}, cur, { lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) });
      upsertLocal(up); publishItem(up, 1); logAction(`moved ${itemName(up)}`);
    });
  }
  v.layers.forEach((l) => l.addTo(map));
  S.views.set(it.id, v);
}

function renderAll() { S.items.forEach(render); renderStats(); }

/* ---------------- item store ---------------- */
let saveT;
function persist() { clearTimeout(saveT); saveT = setTimeout(() => { LS.set('room.' + S.room, [...S.items.values()]); if (S.items.size) LS.set('backup.' + S.room, { ts: Date.now(), items: [...S.items.values()] }); }, 400); }
function upsertLocal(it) { S.items.set(it.id, it); render(it); renderStats(); persist(); if (S.sel === it.id) renderInspector(); }
function removeLocal(id) { S.items.delete(id); removeView(id); if (S.sel === id) select(null); renderStats(); persist(); }

function createItem(t, ll, extra = {}) {
  const d = T[t]; const it = { id: uid(), t, lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7), by: S.name, ts: Date.now() };
  if (d.kind === 'veh') it.label = `${d.pre} ${nextNum((x) => x.t === t)}`;
  if (d.kind === 'pt') { it.label = '' + nextNum((x) => T[x.t] && T[x.t].kind === 'pt'); it.tri = d.tri; }
  if (d.kind === 'zone') { it.r = d.r; it.col = d.col; it.label = d.name; }
  if (d.kind === 'note') it.label = 'Note';
  Object.assign(it, extra);
  upsertLocal(it); publishItem(it, 1); logAction(`added ${itemName(it)}`);
  return it;
}
function nextNum(pred) {
  let n = 0; S.items.forEach((x) => { if (pred(x)) { const m = String(x.label || '').match(/(\d+)\s*$/); if (m) n = Math.max(n, +m[1]); } });
  return n + 1;
}
function updateItem(id, patch, logMsg) {
  const cur = S.items.get(id); if (!cur) return;
  const up = Object.assign({}, cur, patch, { ts: Date.now(), by: S.name });
  upsertLocal(up); publishItem(up, 1); if (logMsg) logAction(logMsg);
}
function deleteItem(id) {
  const cur = S.items.get(id); if (!cur) return;
  removeLocal(id); publishDelete(id); logAction(`removed ${itemName(cur)}`);
}

/* ---------------- stats ---------------- */
function renderStats() {
  const c = { r: 0, y: 0, g: 0, b: 0, u: 0 }; let veh = 0, per = 0;
  S.items.forEach((it) => { const d = T[it.t]; if (!d) return; if (d.kind === 'pt') c[it.tri || d.tri]++; if (d.kind === 'veh') veh++; if (d.kind === 'per') per++; });
  const tot = c.r + c.y + c.g + c.b + c.u;
  $('#stats').innerHTML =
    ['r', 'y', 'g', 'b'].map((k) => `<span class="st" title="${TRI[k][0]}"><span class="sw" style="background:${TRI[k][1]}"></span>${c[k]}</span>`).join('') +
    (c.u ? `<span class="st" title="Untriaged"><span class="sw" style="background:#90a4ae"></span>${c.u}</span>` : '') +
    `<span class="st tot">Pts ${tot}</span><span class="st tot">🚑 ${veh}</span><span class="st tot">👥 ${per}</span>`;
}

/* ---------------- palette ---------------- */
function renderPalette() {
  $('#palTabs').innerHTML = CATS.map((c) => `<button data-cat="${c.id}" class="${c.id === S.cat ? 'on' : ''}">${c.name}</button>`).join('');
  const items = Object.values(T).filter((d) => d.cat === S.cat);
  $('#palItems').innerHTML = items.map((d) => {
    let pv;
    if (d.kind === 'zone') pv = `<svg width="34" height="34"><circle cx="17" cy="17" r="14" fill="${d.col}" fill-opacity=".2" stroke="${d.col}" stroke-width="2"/></svg>`;
    else if (d.kind === 'tape') pv = `<svg width="44" height="12"><rect width="44" height="10" y="1" fill="#f9c80e"/><path d="M0 1h6v10H0zM12 1h6v10h-6zM24 1h6v10h-6zM36 1h6v10h-6z" fill="#111"/></svg>`;
    else if (d.kind === 'arrow') pv = `<svg width="44" height="16"><path d="M2 8h32" stroke="${d.col}" stroke-width="4" ${d.t === 'l_route' ? 'stroke-dasharray="6 4"' : ''}/><path d="M32 2l10 6-10 6z" fill="${d.col}"/></svg>`;
    else pv = tokenHTML({ id: '_pv', t: d.t, tri: d.tri, label: d.kind === 'pt' ? '' : (d.kind === 'veh' ? '' : undefined) }, true);
    const armed = S.mode && S.mode.t === d.t ? ' armed' : '';
    return `<button class="pal-item${armed}" data-t="${d.t}" draggable="true" title="${esc(d.name)}"><span class="pv">${pv}</span>${esc(d.name)}</button>`;
  }).join('');
}
$('#palTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; renderPalette(); });
$('#palItems').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  if (S.locked) return toast('View-only mode is on (☰ menu to unlock)');
  const t = b.dataset.t;
  if (S.mode && S.mode.t === t) return setMode(null);
  setMode({ t, pts: [] });
});
$('#palItems').addEventListener('dragstart', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; e.dataTransfer.setData('text/mci', b.dataset.t); });
map.getContainer().addEventListener('dragover', (e) => e.preventDefault());
map.getContainer().addEventListener('drop', (e) => {
  const t = e.dataTransfer.getData('text/mci'); if (!t || !T[t] || S.locked) return;
  e.preventDefault();
  const kind = T[t].kind;
  if (kind === 'tape' || kind === 'arrow') { setMode({ t, pts: [] }); return; }
  createItem(t, map.mouseEventToLatLng(e));
});
$('#palToggle').onclick = () => { $('#palette').classList.toggle('collapsed'); $('#palToggle').textContent = $('#palette').classList.contains('collapsed') ? '▴' : '▾'; };

/* ---------------- placement / drawing modes ---------------- */
let preview = null;
function setMode(m) {
  S.mode = m;
  if (preview) { map.removeLayer(preview); preview = null; }
  const bar = $('#modeBar');
  map.getContainer().classList.toggle('placing', !!m);
  if (!m) { bar.hidden = true; renderPalette(); return; }
  const d = T[m.t]; const line = d.kind === 'tape' || d.kind === 'arrow';
  bar.hidden = false;
  $('#modeUndo').hidden = !line; $('#modeDone').hidden = !line;
  updateModeText();
  if (window.innerWidth <= 720 && !line) $('#palette').classList.add('collapsed');
  renderPalette();
}
function updateModeText() {
  const m = S.mode; if (!m) return; const d = T[m.t];
  const line = d.kind === 'tape' || d.kind === 'arrow';
  $('#modeTxt').textContent = line ? `${d.name}: tap points (${m.pts.length})` : `Tap map to place: ${d.name}`;
}
map.on('click', (e) => {
  if (!S.mode) { select(null); closeDropdowns(); return; }
  const d = T[S.mode.t];
  if (d.kind === 'tape' || d.kind === 'arrow') {
    S.mode.pts.push([+e.latlng.lat.toFixed(7), +e.latlng.lng.toFixed(7)]);
    if (preview) map.removeLayer(preview);
    preview = L.polyline(S.mode.pts, { color: d.kind === 'tape' ? '#f9c80e' : (d.col || '#1565c0'), weight: 5, dashArray: '4 6' }).addTo(map);
    updateModeText();
    return;
  }
  createItem(S.mode.t, e.latlng);
  if (!$('#repeatPlace').checked) setMode(null);
});
map.on('dblclick', () => { if (S.mode && S.mode.pts && S.mode.pts.length >= 2) finishLine(); });
function finishLine() {
  const m = S.mode; if (!m) return;
  if (m.pts.length < 2) return toast('Need at least 2 points');
  const lat = m.pts.reduce((a, p) => a + p[0], 0) / m.pts.length, lng = m.pts.reduce((a, p) => a + p[1], 0) / m.pts.length;
  createItem(m.t, L.latLng(lat, lng), { pts: m.pts.slice() });
  setMode(null);
}
$('#modeDone').onclick = finishLine;
$('#modeUndo').onclick = () => { if (S.mode && S.mode.pts.length) { S.mode.pts.pop(); if (preview) preview.setLatLngs(S.mode.pts); updateModeText(); } };
$('#modeCancel').onclick = () => setMode(null);
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea')) return;
  if (e.key === 'Escape') { setMode(null); select(null); closeDropdowns(); }
  if (e.key === 'Enter' && S.mode && S.mode.pts) finishLine();
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && !S.locked) deleteItem(S.sel);
});

/* ---------------- inspector ---------------- */
function select(id) {
  const prev = S.sel; S.sel = id;
  if (prev && S.items.get(prev)) render(S.items.get(prev));
  if (id && S.items.get(id)) render(S.items.get(id));
  renderInspector();
}
function renderInspector() {
  const box = $('#inspector'); const it = S.sel && S.items.get(S.sel);
  if (!it) { box.hidden = true; return; }
  const d = T[it.t]; $('#logPanel').hidden = true;
  const ro = S.locked ? 'disabled' : '';
  let h = `<button class="close" data-a="close">✕</button><h3>${esc(d.name)}</h3><div class="meta">Last edit: ${esc(it.by || '?')} · ${clock(it.ts || Date.now())}</div>`;
  const isText = d.kind === 'sign' || d.kind === 'note';
  h += `<label>${isText ? 'Text' : 'Label'}</label>`;
  h += isText ? `<textarea id="insLabel" ${ro} placeholder="${esc(d.text || '')}">${esc(it.label ?? '')}</textarea>` : `<input type="text" id="insLabel" ${ro} value="${esc(it.label ?? '')}">`;
  if (d.kind === 'pt') {
    h += `<label>Triage</label><div class="row">${['r', 'y', 'g', 'b', 'u'].map((k) => `<button ${ro} data-tri="${k}" class="tri-${k} ${(it.tri || d.tri) === k ? 'on' : ''}">${TRI[k][0]}</button>`).join('')}</div>`;
    h += `<label>Notes (injury / vitals / treatment)</label><textarea id="insNote" ${ro}>${esc(it.note || '')}</textarea>`;
  }
  if (d.kind === 'zone') {
    h += `<label>Radius: <b id="rv">${it.r} m</b></label><input type="range" id="insR" min="5" max="400" step="5" value="${it.r}" ${ro}>`;
    h += `<label>Colour</label><div class="row swatches">${[C.red, '#f9a825', C.grn, C.blu, '#6a1b9a', '#424242'].map((c) => `<button ${ro} data-col="${c}" style="background:${c}" class="${it.col === c ? 'on' : ''}"></button>`).join('')}</div>`;
  }
  if (!['zone', 'tape', 'arrow', 'pt'].includes(d.kind)) {
    h += `<label>Rotate / size</label><div class="row"><button ${ro} data-a="rl">⟲ 45°</button><button ${ro} data-a="rr">⟳ 45°</button><button ${ro} data-a="sm">－</button><button ${ro} data-a="lg">＋</button></div>`;
  }
  h += `<label>&nbsp;</label><div class="row">`;
  if (!['tape', 'arrow'].includes(d.kind)) h += `<button ${ro} data-a="dup">⧉ Duplicate</button>`;
  h += `<button ${ro} data-a="del" class="del">🗑 Delete</button></div>`;
  box.innerHTML = h; box.hidden = false;
  const lab = $('#insLabel');
  if (lab) lab.onchange = () => updateItem(it.id, { label: lab.value }, `renamed ${d.name} → “${lab.value.split('\n')[0]}”`);
  const note = $('#insNote'); if (note) note.onchange = () => updateItem(it.id, { note: note.value }, `updated notes of patient ${it.label}`);
  const r = $('#insR'); if (r) { r.oninput = () => { $('#rv').textContent = r.value + ' m'; const v = S.views.get(it.id); v && v.circle && v.circle.setRadius(+r.value); }; r.onchange = () => updateItem(it.id, { r: +r.value }, `${d.name} radius ${r.value} m`); }
}
$('#inspector').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const it = S.items.get(S.sel); if (!it) return; const d = T[it.t];
  if (b.dataset.tri) return updateItem(it.id, { tri: b.dataset.tri }, `re-triaged patient ${it.label} → ${TRI[b.dataset.tri][0]}`);
  if (b.dataset.col) return updateItem(it.id, { col: b.dataset.col });
  switch (b.dataset.a) {
    case 'close': select(null); break;
    case 'rl': updateItem(it.id, { rot: ((it.rot || 0) - 45 + 360) % 360 }); break;
    case 'rr': updateItem(it.id, { rot: ((it.rot || 0) + 45) % 360 }); break;
    case 'sm': updateItem(it.id, { sz: Math.max(0.4, +((it.sz || 1) - 0.2).toFixed(2)) }); break;
    case 'lg': updateItem(it.id, { sz: Math.min(4, +((it.sz || 1) + 0.2).toFixed(2)) }); break;
    case 'del': deleteItem(it.id); break;
    case 'dup': {
      const p = map.latLngToContainerPoint([it.lat, it.lng]).add([30, 30]);
      const extra = Object.assign({}, it); delete extra.id; delete extra.lat; delete extra.lng;
      if (d.kind === 'veh') extra.label = `${d.pre} ${nextNum((x) => x.t === it.t)}`;
      if (d.kind === 'pt') extra.label = '' + nextNum((x) => T[x.t] && T[x.t].kind === 'pt');
      const n = createItem(it.t, map.containerPointToLatLng(p), extra); select(n.id); break;
    }
  }
});

/* ---------------- activity log ---------------- */
function addLog(entry) {
  S.log.push(entry); if (S.log.length > 500) S.log.shift();
  const li = document.createElement('li');
  li.innerHTML = `<span class="t">${clock(entry.ts)}</span><span class="n">${esc(entry.name)}</span>${esc(entry.msg)}`;
  const list = $('#logList'); list.prepend(li); while (list.children.length > 300) list.lastChild.remove();
}
function logAction(msg) {
  const e = { name: S.name, msg, ts: Date.now(), cid: clientId };
  addLog(e); pub(`log`, e, { qos: 0, retain: false });
}
$('#logBtn').onclick = () => { closeDropdowns(); select(null); $('#logPanel').hidden = !$('#logPanel').hidden; };
document.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => ($('#' + b.dataset.close).hidden = true));

/* ---------------- timer ---------------- */
function timerElapsed() { const t = S.timer; return t.run ? t.base + (Date.now() - t.start) : t.base; }
setInterval(() => { $('#timerTxt').textContent = fmtTime(timerElapsed()); $('#timer').classList.toggle('running', S.timer.run); $('#timerToggle').textContent = S.timer.run ? '⏸' : '▶'; }, 250);
$('#timerToggle').onclick = () => {
  if (S.locked) return toast('View-only mode');
  const t = S.timer;
  S.timer = t.run ? { run: false, base: timerElapsed(), start: 0 } : { run: true, base: t.base, start: Date.now() };
  pub('timer', S.timer, { retain: true, qos: 1 }); logAction(S.timer.run ? `started timer at ${fmtTime(S.timer.base)}` : `paused timer at ${fmtTime(S.timer.base)}`);
};
$('#timerReset').onclick = async () => {
  if (S.locked) return toast('View-only mode');
  if (!(await confirmBox('Reset timer?', 'Resets the shared scenario clock for everyone.', 'Reset'))) return;
  S.timer = { run: false, base: 0, start: 0 }; pub('timer', S.timer, { retain: true, qos: 1 }); logAction('reset timer');
};

/* ---------------- MQTT sync ---------------- */
let client = null;
const topic = (s) => `${PREFIX}/${S.room}/${s}`;
function pub(sub, obj, opt) { if (!client) return; client.publish(topic(sub), obj == null ? '' : JSON.stringify(obj), opt); }
function publishItem(it, qos = 1) { S.pendingIds && S.pendingIds.add(it.id); pub(`i/${it.id}`, it, { retain: true, qos }); }
function publishDelete(id) { pub(`i/${id}`, null, { retain: true, qos: 1 }); }

function setConn(state) {
  const dot = $('#connDot'); dot.className = 'dot ' + state; S.connected = state === 'on';
  dot.title = state === 'on' ? 'Live sync connected' : state === 'wait' ? 'Connecting…' : 'Offline — changes stay on this device';
}

function connect() {
  if (client) { try { client.end(true); } catch {} client = null; }
  S.peers.clear(); updatePeers(); S.seen = new Set(); S.pendingIds = new Set();
  if (typeof mqtt === 'undefined') { setConn('off'); toast('Sync library failed to load — offline mode'); return; }
  setConn('wait');
  const b = BROKERS[S.broker] || BROKERS.hivemq;
  client = mqtt.connect(b.url, { clientId, clean: true, keepalive: 30, reconnectPeriod: 2500, connectTimeout: 10000,
    will: { topic: topic(`p/${clientId}`), payload: '', qos: 0, retain: false } });
  client.on('connect', () => {
    setConn('on');
    client.subscribe(`${PREFIX}/${S.room}/#`, { qos: 1 });
    heartbeat();
    // after retained state has arrived, drop cached items that no longer exist on the server
    clearTimeout(connect._prune);
    connect._prune = setTimeout(() => {
      [...S.items.keys()].forEach((id) => { if (!S.seen.has(id) && !S.pendingIds?.has(id)) removeLocal(id); });
    }, 3500);
  });
  client.on('reconnect', () => setConn('wait'));
  client.on('offline', () => setConn('off'));
  client.on('close', () => setConn(S.connected ? 'wait' : 'off'));
  client.on('error', (e) => { console.warn('mqtt', e); });
  client.on('message', onMessage);
}
S.pendingIds = new Set();
function onMessage(t, buf) {
  const base = `${PREFIX}/${S.room}/`; if (!t.startsWith(base)) return;
  const sub = t.slice(base.length); const txt = buf.toString();
  let data = null; if (txt) { try { data = JSON.parse(txt); } catch { return; } }
  if (sub.startsWith('i/')) {
    const id = sub.slice(2); S.seen.add(id);
    if (!data) { if (S.items.has(id)) removeLocal(id); return; }
    if (!data.id || !T[data.t] || typeof data.lat !== 'number') return;
    if (S.dragging.has(id)) return;
    const cur = S.items.get(id);
    if (cur && JSON.stringify(cur) === JSON.stringify(data)) return;
    S.items.set(id, data); render(data); renderStats(); persist(); if (S.sel === id) renderInspector();
  } else if (sub.startsWith('p/')) {
    const id = sub.slice(2); if (id === clientId) return;
    if (!data) S.peers.delete(id); else S.peers.set(id, { name: data.name, seen: Date.now() });
    updatePeers();
  } else if (sub === 'log') {
    if (data && data.cid !== clientId) addLog(data);
  } else if (sub === 'timer') {
    if (data) S.timer = { run: !!data.run, base: +data.base || 0, start: +data.start || 0 };
  } else if (sub === 'follow') {
    if (data && data.cid !== clientId && Array.isArray(data.c)) { map.flyTo(data.c, data.z); toast(`${data.name} brought everyone to their view`); }
  } else if (sub === 'clear') {
    // marker only; actual deletions come through item topics
  }
}
function heartbeat() { if (client && client.connected) pub(`p/${clientId}`, { name: S.name, ts: Date.now() }, { qos: 0, retain: false }); }
setInterval(heartbeat, 5000);
setInterval(() => { const now = Date.now(); let ch = false; S.peers.forEach((p, k) => { if (now - p.seen > 16000) { S.peers.delete(k); ch = true; } }); if (ch) updatePeers(); }, 4000);
function updatePeers() { $('#peerCount').textContent = S.peers.size + 1; }
window.addEventListener('beforeunload', () => { try { client && client.publish(topic(`p/${clientId}`), '', { qos: 0 }); } catch {} });

/* ---------------- rooms ---------------- */
function setRoom(room, push = true) {
  room = cleanRoom(room) || randRoom();
  S.room = room; LS.set('lastRoom', room);
  $('#roomCode').textContent = room;
  document.title = `MCI SIM · ${room}`;
  const u = new URL(location.href); u.searchParams.set('room', room);
  if (push) history.replaceState(null, '', u);
  // load cache for instant display
  S.items.forEach((_, id) => removeView(id)); S.items.clear(); S.sel = null; renderInspector();
  (LS.get('room.' + room, []) || []).forEach((it) => { if (it && it.id && T[it.t]) S.items.set(it.id, it); });
  S.timer = { run: false, base: 0, start: 0 };
  $('#logList').innerHTML = ''; S.log = [];
  renderAll(); connect();
}
function shareUrl() { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', S.room); return u.toString(); }
async function showShare() {
  const url = shareUrl(); let qrSvg = '';
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); qrSvg = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch {}
  await modal(`<h2>Room ${esc(S.room)}</h2><p>Anyone with this link sees and edits the same map live. Scan with a phone:</p><div class="qr">${qrSvg}</div><div class="linkbox">${esc(url)}</div><div class="btns"><button data-v="copy" id="copyBtn">Copy link</button><button class="primary" data-v="ok">Done</button></div>`, (close) => {
    $('#copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Copy failed — select the link manually'); } };
  });
}
$('#roomBtn').onclick = showShare;
$('#peersBtn').onclick = () => {
  const list = [`<li><b>${esc(S.name)}</b> (you)</li>`, ...[...S.peers.values()].map((p) => `<li>${esc(p.name || 'Anonymous')}</li>`)].join('');
  const b = BROKERS[S.broker];
  modal(`<h2>${S.peers.size + 1} online in ${esc(S.room)}</h2><p>Sync: ${S.connected ? '🟢 connected' : '🔴 offline'} via ${esc(b.name)}</p><ul class="peerlist">${list}</ul><div class="btns"><button class="primary" data-v="ok">Close</button></div>`);
};

/* ---------------- menus ---------------- */
function closeDropdowns() { ['#menu', '#placesMenu', '#layerMenu'].forEach((s) => ($(s).hidden = true)); }
function toggleDD(sel) { const was = $(sel).hidden; closeDropdowns(); $(sel).hidden = !was; }
$('#menuBtn').onclick = (e) => { e.stopPropagation(); toggleDD('#menu'); };
$('#placesBtn').onclick = (e) => {
  e.stopPropagation();
  $('#placesMenu').innerHTML = PLACES.map((p) => `<button data-p="${p.id}">📍 ${esc(p.name)}</button>`).join('') + `<div class="sep"></div><button data-p="_me">🧭 My location</button>`;
  toggleDD('#placesMenu');
};
$('#placesMenu').onclick = (e) => {
  const b = e.target.closest('[data-p]'); if (!b) return; closeDropdowns();
  if (b.dataset.p === '_me') { map.locate({ setView: true, maxZoom: 18 }); return; }
  const p = PLACES.find((x) => x.id === b.dataset.p); if (p) map.flyTo(p.ll, p.z);
};
map.on('locationerror', () => toast('Location unavailable'));
$('#layerBtn').onclick = (e) => {
  e.stopPropagation();
  $('#layerMenu').innerHTML = Object.entries(LAYERS).map(([k, v]) => `<button data-l="${k}" class="${k === curLayer ? 'active' : ''}">${esc(v.name)}</button>`).join('');
  toggleDD('#layerMenu');
};
$('#layerMenu').onclick = (e) => {
  const b = e.target.closest('[data-l]'); if (!b) return;
  map.removeLayer(LAYERS[curLayer].l); curLayer = b.dataset.l; LAYERS[curLayer].l.addTo(map); LS.set('layer', curLayer); closeDropdowns();
};
[$('#menu'), $('#placesMenu'), $('#layerMenu')].forEach((m) => m.addEventListener('click', (e) => e.stopPropagation()));
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown,#menuBtn,#placesBtn,#layerBtn')) closeDropdowns(); });

function applyLock() {
  $('#lockTxt').textContent = S.locked ? 'Unlock editing' : 'View-only mode';
  $('#palette').style.display = S.locked ? 'none' : '';
  $('#zsTxt').textContent = 'Icons scale with zoom: ' + (S.zoomScale ? 'ON' : 'OFF');
  [...S.views.keys()].forEach((id) => { const it = S.items.get(id); removeView(id); if (it) render(it); });
  renderInspector();
}

$('#menu').onclick = async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return; closeDropdowns();
  switch (b.dataset.act) {
    case 'share': showShare(); break;
    case 'newroom': if (await confirmBox('Start a new room?', 'Creates an empty map with a new room code. The current room stays on the server.', 'Create')) setRoom(randRoom()); break;
    case 'joinroom': { const r = await ask('Join room', 'Enter the room code (e.g. KKU-AB12)', '', 'Join'); if (r && cleanRoom(r)) setRoom(r); break; }
    case 'rename': { const n = await ask('Your name', 'Shown to others in the log and online list', S.name, 'Save'); if (n && n.trim()) { S.name = n.trim().slice(0, 30); LS.set('name', S.name); heartbeat(); } break; }
    case 'lock': S.locked = !S.locked; LS.set('locked', S.locked); setMode(null); applyLock(); toast(S.locked ? 'View-only: you cannot move items' : 'Editing enabled'); break;
    case 'zoomscale': S.zoomScale = !S.zoomScale; LS.set('zoomScale', S.zoomScale); applyZoomScale(); applyLock(); break;
    case 'follow': pub('follow', { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom(), name: S.name, cid: clientId }, { qos: 1, retain: false }); toast('Sent your view to everyone'); break;
    case 'export': {
      const data = { app: 'mcisim', v: 1, room: S.room, exported: new Date().toISOString(), view: { c: map.getCenter(), z: map.getZoom() }, items: [...S.items.values()] };
      download(`mci-${S.room}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`, JSON.stringify(data, null, 1), 'application/json'); break;
    }
    case 'import': if (!S.locked) $('#importFile').click(); break;
    case 'restore': {
      const bk = LS.get('backup.' + S.room, null);
      if (!bk || !bk.items || !bk.items.length) { toast('No local backup for this room on this device'); break; }
      if (!(await confirmBox('Restore backup?', `Re-publish ${bk.items.length} items saved on this device at ${new Date(bk.ts).toLocaleString()}. Existing items are kept.`, 'Restore'))) break;
      bk.items.forEach((it) => { if (T[it.t]) { upsertLocal(it); publishItem(it, 1); } }); logAction(`restored ${bk.items.length} items from backup`); break;
    }
    case 'exportlog': {
      const rows = [['time', 'name', 'action'], ...S.log.map((l) => [new Date(l.ts).toISOString(), l.name, l.msg])];
      download(`mci-log-${S.room}.csv`, '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv'); break;
    }
    case 'server': {
      const v = await modal(`<h2>Sync server</h2><p>If live sync doesn't connect on your network, try the other public server. Everyone in the room must use the same one.</p><div class="btns">${Object.entries(BROKERS).map(([k, x]) => `<button data-v="${k}" class="${k === S.broker ? 'primary' : ''}">${esc(x.name)}</button>`).join('')}<button data-v="cancel">Cancel</button></div>`);
      if (v && BROKERS[v] && v !== S.broker) { S.broker = v; LS.set('broker', v); connect(); toast('Switched to ' + BROKERS[v].name); }
      break;
    }
    case 'clear': {
      if (S.locked) break;
      if (!(await confirmBox('Clear the whole map?', `Deletes all ${S.items.size} items for everyone in room ${S.room}. Export first if you want to keep it.`, 'Clear all', true))) break;
      [...S.items.keys()].forEach((id) => { removeLocal(id); publishDelete(id); });
      logAction('cleared the map'); break;
    }
  }
};
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text()); const items = (data.items || []).filter((it) => it && it.id && T[it.t] && typeof it.lat === 'number');
    if (!items.length) return toast('No items found in file');
    const replace = await confirmBox('Import scenario', `${items.length} items found. Replace the current map (delete existing ${S.items.size} items) or merge?`, 'Replace');
    if (replace) [...S.items.keys()].forEach((id) => { removeLocal(id); publishDelete(id); });
    items.forEach((it) => { upsertLocal(it); publishItem(it, 1); });
    if (data.view && data.view.c) map.setView([data.view.c.lat, data.view.c.lng], data.view.z);
    logAction(`imported ${items.length} items`);
  } catch (err) { toast('Could not read file'); }
};
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------------- boot ---------------- */
async function boot() {
  renderPalette();
  const params = new URLSearchParams(location.search);
  const room = cleanRoom(params.get('room')) || LS.get('lastRoom', '') || randRoom();
  if (!S.name) S.name = 'User-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  setRoom(room);
  applyLock();
  if (!LS.get('name', '')) {
    const n = await ask('Welcome to MCI SIM', 'Your name or role (shown to others in this room)', '', 'Join');
    if (n && n.trim()) S.name = n.trim().slice(0, 30);
    LS.set('name', S.name); heartbeat();
  }
}
boot();
// expose for debugging
window.MCISIM = { S, T, map };
})();
