const C = window.TimeCore;
const L = window.TimeLocations;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- persistence ----------
const STORE = 'timeright.v1';
const P = window.TimePlanner;
const DEFAULT_FAVS = ['Asia/Kolkata', 'Pacific/Auckland', 'Australia/Sydney', 'America/New_York', 'Europe/London', 'Asia/Dubai'];
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ favorites: favorites.map(l => l.id), home: home.id, target: target.id, pmFrom: pm.from.id, pmPeople: pm.people.map(l => l.id) })); } catch (e) { /* storage unavailable */ }
}
const saved = load();
const pickLoc = (id, fallback) => (id && C.isValidTZ(id) ? L.fromTZ(id) : fallback);

// ---------- state ----------
const detected = L.fromTZ(Intl.DateTimeFormat().resolvedOptions().timeZone); // handles aliases like Asia/Calcutta
let home = pickLoc(saved.home, detected);
let target = pickLoc(saved.target, L.byId.get('Pacific/Auckland'));
let favorites = (saved.favorites || DEFAULT_FAVS).filter(C.isValidTZ).map(id => L.fromTZ(id));
let convFrom = home, convTo = target;
let pm = { from: pickLoc(saved.pmFrom, target), people: (saved.pmPeople || [home.id]).filter(C.isValidTZ).map(id => L.fromTZ(id)), pick: 0 };
let currentView = 'home';
let lastPlan = null;
let pick = 0; // which occurrence to use when the entered time is ambiguous (DST ending)
const pickers = {};

// ---------- helpers ----------
function flag(code) {
  const c = (code || '').toLowerCase();
  return c ? `<span class="flag"><img src="assets/flags/${c}.svg" alt="${c.toUpperCase()}" draggable="false"></span>` : '<span class="flag flag-none">🌐</span>';
}
function optionHTML(l, now, extra = '') {
  return `<button type="button" class="location-option" data-id="${esc(l.id)}">${flag(l.code)}<span><strong>${esc(l.name)}</strong><small>${esc(l.tz)} · ${esc(C.zoneAbbr(now, l.tz))}${extra}</small></span><em class="opt-time">${C.timeText(now, l.tz)}</em></button>`;
}
function listHTML(q, now) {
  const hits = L.search(q, now, 8);
  return hits.length ? hits.map(l => optionHTML(l, now)).join('') : '<div class="opt-empty">No location found</div>';
}
function dstPill(el, now, loc) {
  const on = C.isDST(now, loc.tz), observes = C.observesDST(now, loc.tz);
  el.textContent = on ? 'DST: ON (Daylight Saving)' : observes ? 'DST: OFF (Standard Time)' : 'DST: Not used';
  el.className = 'pill ' + (on ? 'on' : observes ? 'off' : 'neutral');
}

// ---------- searchable location picker ----------
function createPicker(el, initial, onChange, opts = {}) {
  el.innerHTML = `<button type="button" class="location-select buttonish pk-btn"></button><div class="target-menu pk-menu hidden"><input class="pk-search" placeholder="Search city, country or zone (e.g. Sydney, EST)…" autocomplete="off" spellcheck="false"><div class="pk-list"></div></div>`;
  const btn = el.querySelector('.pk-btn'), menu = el.querySelector('.pk-menu'), input = el.querySelector('.pk-search'), list = el.querySelector('.pk-list');
  let current = initial, active = -1;
  const paint = () => { btn.innerHTML = opts.label ? `<span class="pk-name">${esc(opts.label)}</span><span class="chev">⌄</span>` : `${flag(current.code)}<span class="pk-name">${esc(current.name)}</span><span class="chev">⌄</span>`; };
  const items = () => [...list.querySelectorAll('.location-option')];
  const highlight = i => { const it = items(); it.forEach(x => x.classList.remove('active')); active = Math.max(0, Math.min(i, it.length - 1)); if (it[active]) { it[active].classList.add('active'); it[active].scrollIntoView({ block: 'nearest' }); } };
  const refill = () => { list.innerHTML = listHTML(input.value, new Date()); highlight(0); };
  const close = () => menu.classList.add('hidden');
  const choose = id => { const l = L.fromTZ(id); if (!opts.label) current = l; paint(); close(); onChange(l); };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const wasHidden = menu.classList.contains('hidden');
    closeAllPickers();
    if (wasHidden) { input.value = ''; refill(); menu.classList.remove('hidden'); input.focus(); }
  });
  input.addEventListener('input', refill);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter') { const it = items()[active]; if (it) choose(it.dataset.id); }
    else if (e.key === 'Escape') close();
  });
  menu.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-id]'); if (b) choose(b.dataset.id); });
  paint();
  return { set(l) { current = l; paint(); }, close };
}
function closeAllPickers() { Object.values(pickers).forEach(p => p.close()); }

// ---------- cards & lists ----------
function renderCard(prefix, loc, now) {
  $(`#${prefix}Time`).textContent = C.timeText(now, loc.tz);
  $(`#${prefix}Date`).textContent = C.dateText(now, loc.tz);
  $(`#${prefix}Zone`).textContent = `${C.zoneAbbr(now, loc.tz)} · ${C.offsetLabel(C.offsetMinutes(now, loc.tz))}`;
  dstPill($(`#${prefix === 'local' ? 'localDst' : 'targetDst'}`), now, loc);
  $(`#${prefix}Note`).textContent = C.transitionText(now, loc.tz);
}
function render() {
  const now = new Date();
  renderCard('local', home, now);
  renderCard('target', target, now);
  const diff = C.offsetMinutes(now, target.tz) - C.offsetMinutes(now, home.tz);
  const relation = diff > 0 ? 'ahead of' : 'behind';
  $('#difference').innerHTML = diff === 0
    ? `<span class="difference-icon">◷</span> <strong>${esc(target.city)}</strong> is the <strong>same time</strong> as <strong>${esc(home.city)}</strong>`
    : `<span class="difference-icon">◷</span> <strong>${esc(target.city)}</strong> is <strong>${C.formatDiff(diff)}</strong> ${relation} <strong>${esc(home.city)}</strong>`;
  renderFavorites(now); renderWorld(now);
}
function renderFavorites(now) {
  $('#favoritesList').innerHTML = favorites.length ? favorites.map(l => `<div class="fav-item" data-id="${esc(l.id)}"><div class="fav-row"><div><div class="fav-city">${flag(l.code)} ${esc(l.city)}</div><div class="fav-zone">${C.zoneAbbr(now, l.tz)} · ${C.offsetLabel(C.offsetMinutes(now, l.tz))}${C.isDST(now, l.tz) ? ' · DST' : ''}</div></div><div><div class="fav-time">${C.timeText(now, l.tz)}</div><div class="fav-date">${C.shortDateText(now, l.tz)}</div></div></div></div>`).join('') : '<div class="opt-empty">No favorites yet. Use “Add Location”.</div>';
}
function renderWorld(now) {
  $('#worldClock').innerHTML = favorites.slice(0, 5).map(l => { const on = C.isDST(now, l.tz); return `<div class="world-card" data-id="${esc(l.id)}"><div class="city">${flag(l.code)} ${esc(l.city)}</div><div class="wc-time">${C.timeText(now, l.tz)}</div><small>${C.zoneAbbr(now, l.tz)} · ${C.offsetLabel(C.offsetMinutes(now, l.tz))}</small><div class="dst ${on ? 'on' : ''}">${on ? 'DST ON' : 'DST OFF'}</div></div>`; }).join('');
}

// ---------- converter (recomputed only when its inputs change, never on the 1s tick) ----------
function convert() {
  const from = convFrom, to = convTo;
  const ds = $('#fromDate').value, ts = $('#fromTime').value, out = $('#converted');
  if (!ds || !ts) { out.textContent = '—'; return; }
  const [y, m, d] = ds.split('-').map(Number), [h, mi] = ts.split(':').map(Number);
  const r = C.zonedToUtc(y, m, d, h, mi, from.tz);
  if (pick >= r.options.length) pick = 0;
  const utc = r.options[r.status === 'ambiguous' ? pick : 0] || r.utc;
  const dstTag = (loc, t) => C.isDST(t, loc.tz) ? 'DST ON' : C.observesDST(t, loc.tz) ? 'DST OFF' : 'no DST';
  let warn = '';
  if (r.status === 'gap') {
    warn = `<div class="warn">⚠ ${ts} doesn't exist in ${esc(from.city)} on that date: clocks jump forward ${r.gapMinutes} min. Showing ${C.timeText(utc, from.tz)} instead.</div>`;
  } else if (r.status === 'ambiguous') {
    warn = `<div class="warn">⚠ ${ts} happens twice in ${esc(from.city)} on that date (clocks go back). Which one?<div class="pick">${r.options.map((o, i) => `<button data-pick="${i}" class="${i === pick ? 'sel' : ''}">${i === 0 ? 'First' : 'Second'} · ${C.zoneAbbr(o, from.tz)}</button>`).join('')}</div></div>`;
  }
  out.innerHTML = `<strong>${C.timeText(utc, to.tz)}</strong><small>${C.dateText(utc, to.tz)}</small><span>${C.zoneAbbr(utc, to.tz)} · ${C.offsetLabel(C.offsetMinutes(utc, to.tz))} · ${dstTag(to, utc)} &nbsp;|&nbsp; ${esc(from.city)}: ${dstTag(from, utc)}</span>${warn}`;
}
function syncConverter() { pick = 0; convFrom = home; convTo = target; pickers.from.set(home); pickers.to.set(target); convert(); }

// ---------- actions ----------
function setTarget(l) { target = l; pickers.target.set(l); syncConverter(); save(); render(); }
function setHome(l) { home = l; pickers.home.set(l); syncConverter(); save(); render(); }
function swapLocations() { [home, target] = [target, home]; pickers.home.set(home); pickers.target.set(target); syncConverter(); save(); render(); }
function toggleFavorite(l) {
  favorites = favorites.some(f => f.id === l.id) ? favorites.filter(f => f.id !== l.id) : [...favorites, l];
  save(); render();
}


// ---------- meeting planner ----------
function renderPlanner() {
  const date = $('#pmDate').value, time = $('#pmTime').value;
  if (!date || !time) { $('#pmRows').innerHTML = '<div class="opt-empty">Pick a date and time.</div>'; $('#pmWarn').innerHTML = ''; return; }
  const plan = P.planMeeting({ from: pm.from, date, time, participants: pm.people, pick: pm.pick });
  lastPlan = plan;
  const dd = r => r.dayDelta === 0 ? '' : ` <span class="dd">${r.dayDelta > 0 ? '+' : '−'}${Math.abs(r.dayDelta)} day</span>`;
  const badges = r => `<div class="pm-badges"><span class="pm-badge ${r.dst === 'ON' ? 'on' : r.dst === 'OFF' ? 'off' : 'none'}">${esc(r.abbr)} · ${r.dst === 'ON' ? 'DST ON' : r.dst === 'OFF' ? 'DST OFF' : 'no DST'}</span><span class="pm-badge none">${r.offset}</span></div>`;
  const tl = cells => `<div class="tl">${cells.map(c => `<i class="c-${c.cat}${c.meeting ? ' m' : ''}${c.midnight ? ' md' : ''}">${c.hour}</i>`).join('')}</div>`;
  const row = (r, cells, i) => `<div class="pm-row${i < 0 ? ' src' : ''}"><div class="pm-city">${flag(r.loc.code)}<div>${esc(r.loc.name)}<small>${i < 0 ? 'Meeting time set here' : esc(r.loc.tz)}</small></div></div><div class="pm-time">${r.time}<small>${r.date}${dd(r)}</small></div><div>${badges(r)}${tl(cells)}</div>${i < 0 ? '<span></span>' : `<button class="pm-x" data-rm="${i}" title="Remove">×</button>`}</div>`;
  $('#pmRows').innerHTML = row(plan.source, plan.sourceTimeline, -1) + plan.rows.map((r, i) => row(r, r.timeline, i)).join('');
  let warn = '';
  if (plan.status === 'gap') warn = `<div class="warn">⚠ ${esc(time)} doesn't exist in ${esc(pm.from.city)} on that date: clocks jump forward ${plan.gapMinutes} min. Using ${plan.source.time} instead.</div>`;
  else if (plan.status === 'ambiguous') warn = `<div class="warn">⚠ ${esc(time)} happens twice in ${esc(pm.from.city)} on that date (clocks go back). Which one?<div class="pick">${plan.options.map((o, i) => `<button data-pick="${i}" class="${i === pm.pick ? 'sel' : ''}">${i === 0 ? 'First' : 'Second'} · ${C.zoneAbbr(o, pm.from.tz)}</button>`).join('')}</div></div>`;
  $('#pmWarn').innerHTML = warn;
}
function plannerChanged() { pm.pick = 0; renderPlanner(); save(); }
function applyQuick() {
  const text = $('#quick').value, note = $('#quickNote');
  if (!text.trim()) { note.className = 'quick-note'; note.textContent = ''; return; }
  const r = P.parseMeetingText(text, new Date());
  if (r.loc) { pm.from = r.loc; pickers.pm.set(r.loc); }
  if (r.time) $('#pmTime').value = r.time;
  if (r.dateSpec) $('#pmDate').value = P.resolveDate(r.dateSpec, pm.from.tz);
  else if (r.loc && !$('#pmDate').dataset.touched) $('#pmDate').value = C.ymd(new Date(), pm.from.tz);
  const bits = [];
  if (r.time) bits.push(`<b>${C.timeText(new Date(Date.UTC(2000, 0, 1, ...r.time.split(':').map(Number))), 'UTC')}</b>`);
  if (r.loc) bits.push(`<b>${esc(r.loc.name)}</b>`);
  if (r.dateSpec) { const [y, m, d] = $('#pmDate').value.split('-').map(Number); bits.push(`<b>${C.shortDateText(new Date(Date.UTC(y, m - 1, d, 12)), 'UTC')}</b>`); }
  if (!r.time) { note.className = 'quick-note err'; note.innerHTML = 'Add a time, for example “3:50 PM”.' + (r.zoneText && !r.loc ? ` Couldn't find “${esc(r.zoneText)}”.` : ''); }
  else if (r.zoneText && !r.loc) { note.className = 'quick-note err'; note.innerHTML = `Couldn't find a location for “${esc(r.zoneText)}”. Using ${esc(pm.from.name)}.`; }
  else { note.className = 'quick-note'; note.innerHTML = 'Understood: ' + bits.join(' · '); }
  pm.pick = 0; renderPlanner(); save();
}
function initPlanner() {
  pickers.pm = createPicker($('#pmPicker'), pm.from, l => { pm.from = l; plannerChanged(); });
  pickers.pmAdd = createPicker($('#pmAddPicker'), pm.from, l => { if (!pm.people.some(p => p.id === l.id)) { pm.people.push(l); plannerChanged(); } }, { label: '＋ Add another location' });
  $('#pmDate').value = C.ymd(new Date(), pm.from.tz);
  $('#pmDate').addEventListener('change', e => { e.target.dataset.touched = '1'; plannerChanged(); });
  $('#pmTime').addEventListener('change', plannerChanged); $('#pmTime').addEventListener('input', plannerChanged);
  $('#quick').addEventListener('input', applyQuick);
  $('#pmRows').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { pm.people.splice(+b.dataset.rm, 1); plannerChanged(); } });
  $('#pmWarn').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { pm.pick = +b.dataset.pick; renderPlanner(); } });
  $('#pmCopy').addEventListener('click', async () => {
    const txt = P.summaryText(lastPlan, pm.from);
    try { await navigator.clipboard.writeText(txt); $('#pmCopy').textContent = 'Copied ✓'; } catch (e) { $('#pmCopy').textContent = 'Copy failed'; }
    setTimeout(() => { $('#pmCopy').textContent = 'Copy summary'; }, 1600);
  });
  renderPlanner();
}

// ---------- modal ----------
function openModal(title, body) { $('#modalBody').onclick = null; $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === currentView)); }
function openFavorites() {
  openModal('Manage Favorites', `<input class="modal-search" id="favSearch" placeholder="Search to add a city or country…" autocomplete="off"><div id="favResults"></div><div class="modal-sub">YOUR FAVORITES</div><div id="favCurrent"></div>`);
  const body = $('#modalBody'), input = $('#favSearch');
  const draw = () => {
    const now = new Date(), q = input.value.trim();
    $('#favResults').innerHTML = q ? L.search(q, now, 8).map(l => optionHTML(l, now, favorites.some(f => f.id === l.id) ? ' · ★ in favorites' : '')).join('') || '<div class="opt-empty">No location found</div>' : '';
    $('#favCurrent').innerHTML = favorites.map(l => `<div class="fav-edit">${flag(l.code)}<span class="nm">${esc(l.name)}</span><button data-remove="${esc(l.id)}">Remove</button></div>`).join('') || '<div class="opt-empty">Nothing here yet.</div>';
  };
  input.addEventListener('input', draw);
  body.onclick = e => {
    const opt = e.target.closest('.location-option'), rm = e.target.closest('[data-remove]');
    if (opt) { toggleFavorite(L.fromTZ(opt.dataset.id)); draw(); }
    if (rm) { toggleFavorite(L.fromTZ(rm.dataset.remove)); draw(); }
  };
  draw(); input.focus();
}
function showView(view) {
  currentView = view;
  $('#viewHome').classList.toggle('hidden', view === 'planner');
  $('#viewPlanner').classList.toggle('hidden', view !== 'planner');
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'planner') renderPlanner();
}
function navigate(view) {
  if (view === 'home' || view === 'planner' || view === 'converter') showView(view === 'converter' ? 'home' : view);
  else document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'world') {
    const now = new Date();
    openModal('World Clock', `<p>Your favorites. Click one to make it the target.</p>${favorites.map(l => optionHTML(l, now)).join('')}`);
    $('#modalBody').onclick = e => { const b = e.target.closest('[data-id]'); if (b) { setTarget(L.fromTZ(b.dataset.id)); closeModal(); } };
  }
  else if (view === 'converter') { $('#fromTime').focus(); $('.converter').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (view === 'favorites') openFavorites();
  else if (view === 'settings') openModal('Settings', '<p>V1 uses your system timezone automatically. More preferences will be added in a later release.</p>');
  else if (view === 'about') openModal('About TimeRight', '<p><strong>TimeRight V1</strong></p><p>Timezone and DST calculations use the IANA timezone database built into your system.</p>');
}

// ---------- init ----------
function init() {
  const now = new Date();
  pickers.home = createPicker($('#homePicker'), home, setHome);
  pickers.target = createPicker($('#targetPicker'), target, setTarget);
  pickers.from = createPicker($('#fromPicker'), convFrom, l => { convFrom = l; pick = 0; convert(); });
  pickers.to = createPicker($('#toPicker'), convTo, l => { convTo = l; pick = 0; convert(); });
  $('#fromDate').value = C.ymd(now, home.tz);
  for (const id of ['fromDate', 'fromTime']) $('#' + id).addEventListener('change', () => { pick = 0; convert(); });
  $('#fromTime').addEventListener('input', () => { pick = 0; convert(); });
  $('#converted').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { pick = +b.dataset.pick; convert(); } });

  // top search bar: choose the target location
  const search = $('#search'), results = $('#searchResults');
  const drawResults = () => {
    const q = search.value.trim();
    if (!q) { results.classList.add('hidden'); return; }
    results.innerHTML = listHTML(q, new Date());
    results.classList.remove('hidden');
    const first = results.querySelector('.location-option'); if (first) first.classList.add('active');
  };
  search.addEventListener('input', drawResults);
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const f = results.querySelector('.location-option'); if (f) { setTarget(L.fromTZ(f.dataset.id)); search.value = ''; results.classList.add('hidden'); } }
    else if (e.key === 'Escape') { search.value = ''; results.classList.add('hidden'); }
  });
  results.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { setTarget(L.fromTZ(b.dataset.id)); search.value = ''; results.classList.add('hidden'); } });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap') && !e.target.closest('.search-results')) results.classList.add('hidden');
    if (!e.target.closest('.picker')) closeAllPickers();
  });

  document.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.view)));
  $('#viewAll').onclick = () => navigate('world'); $('#manageFav').onclick = openFavorites; $('#addFav').onclick = openFavorites;
  $('#closeModal').onclick = closeModal; $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#swap').onclick = swapLocations;
  $('#worldClock').addEventListener('click', e => { const card = e.target.closest('[data-id]'); if (card) setTarget(L.fromTZ(card.dataset.id)); });
  $('#favoritesList').addEventListener('click', e => { const item = e.target.closest('[data-id]'); if (item) setTarget(L.fromTZ(item.dataset.id)); });
  initPlanner();
  render(); convert(); setInterval(render, 1000);
}
init();
