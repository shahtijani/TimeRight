/* TimeRight locations: every IANA zone with country, plus ranked search. Browser (window.TimeLocations) and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./zones.js'));
  else root.TimeLocations = factory(root.TimeCore, root.TR_ZONES);
})(typeof self !== 'undefined' ? self : this, function (C, ZONES) {
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  // Shown first and ranked higher.
  const POPULAR = ['Asia/Kolkata','Pacific/Auckland','Australia/Sydney','America/New_York','America/Los_Angeles','Europe/London','Asia/Dubai',
    'America/Toronto','Asia/Singapore','Asia/Tokyo','Europe/Paris','Europe/Berlin','America/Sao_Paulo','Pacific/Honolulu','America/Chicago',
    'America/Vancouver','Australia/Perth','Australia/Brisbane','Australia/Melbourne','America/Denver','Asia/Hong_Kong','Asia/Shanghai',
    'Asia/Seoul','Asia/Karachi','Asia/Dhaka','Asia/Manila','Africa/Johannesburg','Africa/Cairo','Europe/Moscow','Europe/Istanbul',
    'America/Mexico_City','Europe/Madrid','Europe/Rome','Europe/Amsterdam','Europe/Dublin','Asia/Bangkok','Asia/Jakarta','Australia/Adelaide'];

  // Extra words people search for (nearby big cities, abbreviations clients use).
  const EXTRA = {
    'Asia/Kolkata': 'mumbai delhi new delhi bangalore bengaluru chennai hyderabad pune calcutta bombay ist',
    'Asia/Dubai': 'abu dhabi uae gst', 'Pacific/Auckland': 'nz wellington kiwi', 'Australia/Sydney': 'canberra nsw aus',
    'Australia/Melbourne': 'victoria aus', 'Australia/Brisbane': 'queensland aus', 'Australia/Perth': 'western australia aus',
    'Australia/Adelaide': 'south australia aus', 'America/New_York': 'nyc boston miami atlanta washington philadelphia usa',
    'America/Los_Angeles': 'san francisco seattle california las vegas usa', 'America/Chicago': 'houston dallas texas usa',
    'America/Denver': 'colorado utah usa', 'Europe/London': 'uk england scotland britain', 'Asia/Shanghai': 'beijing china',
    'Asia/Tokyo': 'japan', 'Asia/Seoul': 'korea', 'Asia/Karachi': 'islamabad lahore', 'Asia/Dhaka': 'bangladesh',
  };
  const FIX = { 'Sao Paulo': 'São Paulo', 'Curacao': 'Curaçao', 'Asuncion': 'Asunción', 'Bogota': 'Bogotá', 'Cancun': 'Cancún', 'Merida': 'Mérida', 'Reunion': 'Réunion', 'Noumea': 'Nouméa' };

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const all = [];
  for (const line of ZONES.split('\n')) {
    const [code, tz] = line.split('|');
    if (!tz || !C.isValidTZ(tz)) continue;
    let city = tz.split('/').pop().replace(/_/g, ' ');
    city = FIX[city] || city;
    const country = regionNames.of(code) || code;
    const name = (city === country || country.includes(city)) ? country : `${country} (${city})`;
    const loc = { id: tz, tz, city, country, code, name, popular: POPULAR.indexOf(tz) };
    loc.hay = norm(`${city} ${country} ${tz.replace(/[_/]/g, ' ')} ${EXTRA[tz] || ''}`);
    loc.words = loc.hay.split(/\s+/);
    all.push(loc);
  }
  const byId = new Map(all.map(l => [l.id, l]));
  const popular = POPULAR.map(id => byId.get(id)).filter(Boolean);

  /** Location for any tz string, resolving aliases (Asia/Calcutta -> Asia/Kolkata). Creates an ad-hoc one if unknown. */
  function fromTZ(tz) {
    if (byId.has(tz)) return byId.get(tz);
    const canon = C.canonicalTZ(tz);
    const hit = all.find(l => C.canonicalTZ(l.tz) === canon);
    if (hit) return hit;
    const city = (tz.split('/').pop() || tz).replace(/_/g, ' ');
    return { id: tz, tz, city, country: '', code: '', name: city, popular: -1, hay: norm(city), words: [norm(city)] };
  }

  const abbrIndex = new Map(); // upper-case abbreviation -> [locations], built lazily
  function abbrFor(abbr, now) {
    if (!abbrIndex.size) {
      for (const l of all) {
        for (const d of [new Date(Date.UTC(now.getUTCFullYear(), 0, 15)), new Date(Date.UTC(now.getUTCFullYear(), 6, 15))]) {
          const a = C.zoneAbbr(d, l.tz).toUpperCase();
          if (!abbrIndex.has(a)) abbrIndex.set(a, new Set());
          abbrIndex.get(a).add(l);
        }
      }
    }
    return abbrIndex.get(abbr.toUpperCase()) || new Set();
  }

  /** Ranked search over city, country, zone id, nearby cities and abbreviations (EST, IST, AEDT...). */
  function search(q, now = new Date(), limit = 8) {
    const nq = norm(q).trim();
    if (!nq) return popular.slice(0, limit);
    const abbrHits = /^[a-z]{2,5}$/.test(nq) ? abbrFor(nq, now) : new Set();
    const scored = [];
    for (const l of all) {
      let s = 0;
      const city = norm(l.city), country = norm(l.country);
      if (city === nq) s = 100;
      else if (city.startsWith(nq)) s = 90;
      else if (country === nq) s = 85;
      else if (country.startsWith(nq)) s = 80;
      else if (l.words.some(w => w === nq)) s = 70;
      else if (l.words.some(w => w.startsWith(nq))) s = 60;
      else if (l.hay.includes(nq)) s = 40;
      if (abbrHits.has(l)) s = Math.max(s, 95);
      if (!s) continue;
      if (l.popular >= 0) s += 20 - Math.min(l.popular, 19) * 0.5; // popular zones first, in popular order
      scored.push([s, l]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, limit).map(x => x[1]);
  }

  return { all, popular, byId, fromTZ, search, norm };
});
