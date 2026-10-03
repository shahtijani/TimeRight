/* TimeRight core: pure timezone/DST logic, no DOM. Works in browser (window.TimeCore) and Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TimeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60000;
  const dtfCache = new Map();

  function dtf(tz, opts, key, locale = 'en-US') {
    const k = tz + '|' + key;
    let f = dtfCache.get(k);
    if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }); dtfCache.set(k, f); }
    return f;
  }

  const FULL = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };

  /** UTC offset of `tz` at instant `date`, in minutes (e.g. Auckland in Oct 2026 = 780). */
  function offsetMinutes(date, tz) {
    const p = {};
    for (const x of dtf(tz, FULL, 'full').formatToParts(date)) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / MIN);
  }

  /** Canonical IANA name, so aliases like Asia/Calcutta and Asia/Kolkata compare equal. */
  function canonicalTZ(tz) {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone; }
    catch (e) { return null; }
  }
  function isValidTZ(tz) { return canonicalTZ(tz) !== null; }

  /**
   * The zone's "standard" offset for the year around `date`: the smallest offset seen
   * across the year (sampled monthly). DST is whenever the current offset is above it.
   * Handles the southern hemisphere, half-hour DST (Lord Howe) and Ireland's negative-DST data.
   */
  function standardOffset(date, tz) {
    const y = date.getUTCFullYear();
    let min = Infinity;
    for (let m = 0; m < 12; m++) {
      min = Math.min(min, offsetMinutes(new Date(Date.UTC(y, m, 1)), tz), offsetMinutes(new Date(Date.UTC(y, m, 15)), tz));
    }
    return min;
  }
  function isDST(date, tz) { return offsetMinutes(date, tz) > standardOffset(date, tz); }
  /** Does this zone observe DST at all in the year of `date`? */
  function observesDST(date, tz) {
    const y = date.getUTCFullYear(); const o = new Set();
    for (let m = 0; m < 12; m++) o.add(offsetMinutes(new Date(Date.UTC(y, m, 15)), tz));
    return o.size > 1;
  }

  /**
   * Next offset change after `date` (within ~13 months), located to the minute.
   * Returns { at: Date, before: min, after: min, startsDST: bool } or null.
   */
  function nextTransition(date, tz) {
    const DAY = 86400000;
    let prev = offsetMinutes(date, tz);
    let lo = date.getTime();
    for (let d = 1; d <= 400; d++) {
      const hi = date.getTime() + d * DAY;
      const cur = offsetMinutes(new Date(hi), tz);
      if (cur !== prev) {
        let a = lo, b = hi; // a has offset prev, b has offset cur
        while (b - a > MIN) {
          const mid = Math.floor((a + b) / 2 / MIN) * MIN;
          if (mid <= a) break;
          if (offsetMinutes(new Date(mid), tz) === prev) a = mid; else b = mid;
        }
        return { at: new Date(b), before: prev, after: cur, startsDST: cur > prev };
      }
      lo = hi; prev = cur;
    }
    return null;
  }

  /**
   * Interpret a wall-clock time in `tz` and return the real instant(s).
   * status: 'ok' | 'gap' (clock skips this time; `utc` is moved forward by the gap) |
   *         'ambiguous' (clock repeats; `options` holds [first, second], `utc` = first).
   */
  function zonedToUtc(y, mo, d, h, mi, tz) {
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    const DAY = 86400000;
    const offs = [...new Set([offsetMinutes(new Date(wall - DAY), tz), offsetMinutes(new Date(wall + DAY), tz)])];
    const valid = [];
    for (const o of offs) {
      const cand = wall - o * MIN;
      if (offsetMinutes(new Date(cand), tz) === o) valid.push(cand);
    }
    valid.sort((a, b) => a - b);
    if (valid.length === 1) return { status: 'ok', utc: new Date(valid[0]), options: [new Date(valid[0])] };
    if (valid.length > 1) return { status: 'ambiguous', utc: new Date(valid[0]), options: valid.map(v => new Date(v)) };
    // Gap: use the offset in force before the jump, which lands after the gap.
    const sorted = offs.slice().sort((a, b) => a - b);
    const utc = new Date(wall - sorted[0] * MIN);
    return { status: 'gap', utc, options: [utc], gapMinutes: sorted[sorted.length - 1] - sorted[0] };
  }

  /** Hour of day (0-23) at `date` in `tz`. */
  function localHour(date, tz) {
    const p = dtf(tz, { hour: '2-digit', hourCycle: 'h23' }, 'hour').formatToParts(date).find(x => x.type === 'hour');
    return +p.value % 24;
  }

  function offsetLabel(min) {
    const sign = min >= 0 ? '+' : '-'; const a = Math.abs(min);
    return `UTC ${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  }
  // en-US only names US zones (others come back as "GMT+5:30"), so try other locales for real abbreviations.
  const ABBR_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-NZ', 'en-IN', 'en-CA', 'en-SG', 'en-AE', 'ja-JP'];
  const abbrCache = new Map();
  function zoneAbbr(date, tz) {
    const off = offsetMinutes(date, tz), key = tz + '|' + off;
    if (abbrCache.has(key)) return abbrCache.get(key);
    let first = '', found = '';
    for (const loc of ABBR_LOCALES) {
      const p = dtf(tz, { timeZoneName: 'short' }, 'abbr' + loc, loc).formatToParts(date).find(x => x.type === 'timeZoneName');
      const v = p ? p.value : '';
      if (!first) first = v;
      if (/^[A-Z]{2,5}$/.test(v)) { found = v; break; } // short real abbreviations only (not "Gulf ST" or "GMT+4")
    }
    const out = found || first;
    abbrCache.set(key, out);
    return out;
  }
  function timeText(date, tz, hour12 = true) {
    return dtf(tz, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 }, 'time' + hour12).format(date);
  }
  function dateText(date, tz) {
    return dtf(tz, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }, 'date').format(date);
  }
  function shortDateText(date, tz) {
    return dtf(tz, { weekday: 'short', month: 'short', day: 'numeric' }, 'sdate').format(date);
  }
  function formatDiff(diff) {
    const a = Math.abs(diff), h = Math.floor(a / 60), m = a % 60;
    return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
  }
  /** 'YYYY-MM-DD' for `date` as seen in `tz`. */
  function ymd(date, tz) {
    const p = {};
    for (const x of dtf(tz, FULL, 'full').formatToParts(date)) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
  }
  /** Human sentence for the next transition, e.g. "DST ends Sun, Apr 5". */
  function transitionText(date, tz) {
    const t = nextTransition(date, tz);
    if (!t) return '';
    const label = t.startsDST ? 'DST starts' : 'DST ends';
    return `${label} ${shortDateText(t.at, tz)}`;
  }

  return { offsetMinutes, canonicalTZ, isValidTZ, standardOffset, isDST, observesDST, nextTransition, zonedToUtc,
    localHour, offsetLabel, zoneAbbr, timeText, dateText, shortDateText, formatDiff, ymd, transitionText };
});
