/* TimeRight meeting planner logic: parse "3:50 PM Sydney tomorrow", convert a meeting to many zones. No DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./locations.js'));
  else root.TimePlanner = factory(root.TimeCore, root.TimeLocations);
})(typeof self !== 'undefined' ? self : this, function (C, L) {
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const DEMONYMS = { australian: 'australia', indian: 'india', american: 'united states', us: 'united states', usa: 'united states', british: 'united kingdom',
    uk: 'united kingdom', kiwi: 'new zealand', canadian: 'canada', japanese: 'japan', singaporean: 'singapore', emirati: 'united arab emirates',
    german: 'germany', french: 'france', brazilian: 'brazil', irish: 'ireland', chinese: 'china', spanish: 'spain', italian: 'italy', dutch: 'netherlands',
    korean: 'south korea', pakistani: 'pakistan', filipino: 'philippines', 'south african': 'south africa', eastern: 'est', pacific: 'pst', central: 'cst', mountain: 'mst' };
  const FILLER = /\b(at|on|in|for|the|a|an|time|timezone|zone|meeting|call|please|my|our|their|your|let's|lets|meet|is|be|@|around|about)\b/g;

  const pad = n => String(n).padStart(2, '0');
  const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return dateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function dayDiff(a, b) { return Math.round((Date.UTC(...a.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...b.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / 86400000); }
  function weekdayOf(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

  /**
   * Understand things like "3:50 PM Sydney tomorrow", "10am EST friday", "15:30 india time", "5 Oct 9am London".
   * Returns { time:'HH:MM'|null, loc|null, dateSpec:{type,...}|null, zoneText }. Dates are resolved later in the meeting's zone.
   */
  function parseMeetingText(text, now = new Date()) {
    let s = ' ' + String(text || '').toLowerCase().replace(/[,]/g, ' ') + ' ';
    let dateSpec = null;
    let m;
    // explicit dates
    if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { dateSpec = { type: 'date', y: +m[1], m: +m[2], d: +m[3] }; s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/))) { dateSpec = { type: 'md', m: MONTHS.indexOf(m[2]) + 1, d: +m[1] }; s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) { dateSpec = { type: 'md', m: MONTHS.indexOf(m[1]) + 1, d: +m[2] }; s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { dateSpec = { type: 'md', m: +m[2], d: +m[1], y: m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : undefined }; s = s.replace(m[0], ' '); } // dd/mm
    if (!dateSpec) {
      if ((m = s.match(/\b(day after tomorrow)\b/))) { dateSpec = { type: 'rel', n: 2 }; s = s.replace(m[0], ' '); }
      else if ((m = s.match(/\b(today|tonight|tomorrow|tmrw|tmr|yesterday)\b/))) { dateSpec = { type: 'rel', n: { today: 0, tonight: 0, tomorrow: 1, tmrw: 1, tmr: 1, yesterday: -1 }[m[1]] }; s = s.replace(m[0], ' '); }
      else if ((m = s.match(/\b(?:(next)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/)) && WEEKDAYS.some(w => w.startsWith(m[2]))) {
        dateSpec = { type: 'weekday', wd: WEEKDAYS.findIndex(w => w.startsWith(m[2].slice(0, 3))), next: !!m[1] }; s = s.replace(m[0], ' ');
      }
    }
    // time
    let time = null;
    const set = (h, mi, ap) => {
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      if (h > 23 || mi > 59) return false; time = `${pad(h)}:${pad(mi)}`; return true;
    };
    if ((m = s.match(/\b(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/))) { if (set(+m[1], +m[2], m[3] ? m[3][0] + 'm' : '')) s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/))) { if (set(+m[1], 0, m[2][0] + 'm')) s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\b(noon|midday)\b/))) { time = '12:00'; s = s.replace(m[0], ' '); }
    else if ((m = s.match(/\bmidnight\b/))) { time = '00:00'; s = s.replace(m[0], ' '); }
    else if ((m = s.match(/(?:^|\s)(\d{1,2})\s*h\b/))) { if (set(+m[1], 0, '')) s = s.replace(m[0], ' '); }
    // zone
    let zoneText = s.replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    for (const k of Object.keys(DEMONYMS).sort((a, b) => b.length - a.length)) {
      if (new RegExp(`(^|\\s)${k}(\\s|$)`).test(zoneText)) { zoneText = zoneText.replace(new RegExp(`(^|\\s)${k}(\\s|$)`), ` ${DEMONYMS[k]} `).trim(); break; }
    }
    const loc = zoneText ? (L.search(zoneText, now, 1)[0] || null) : null;
    return { time, loc, dateSpec, zoneText };
  }

  /** Resolve a parsed date spec into 'YYYY-MM-DD' as seen in `tz`. */
  function resolveDate(spec, tz, now = new Date()) {
    const today = C.ymd(now, tz);
    if (!spec) return today;
    if (spec.type === 'rel') return addDays(today, spec.n);
    if (spec.type === 'date') return dateKey(spec.y, spec.m, spec.d);
    if (spec.type === 'md') {
      const y = spec.y || +today.slice(0, 4);
      let k = dateKey(y, spec.m, spec.d);
      if (!spec.y && k < today) k = dateKey(y + 1, spec.m, spec.d); // a date that already passed means next year
      return k;
    }
    if (spec.type === 'weekday') {
      let n = (spec.wd - weekdayOf(today) + 7) % 7;
      if (spec.next && n === 0) n = 7; else if (spec.next) n += 0;
      return addDays(today, n);
    }
    return today;
  }

  /** Comfort of a local hour for a meeting: good 9-18, ok 7-9 & 18-22, bad otherwise. */
  function category(hour) { return hour >= 9 && hour < 18 ? 'good' : (hour >= 7 && hour < 9) || (hour >= 18 && hour < 22) ? 'ok' : 'bad'; }

  /**
   * Convert a meeting (wall-clock `date` `time` in `from`) for every participant.
   * pick = 0|1 chooses between the two occurrences when the time is repeated by a DST change.
   */
  function planMeeting({ from, date, time, participants, pick = 0 }) {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
    const r = C.zonedToUtc(y, mo, d, h, mi, from.tz);
    const utc = r.options[r.status === 'ambiguous' ? Math.min(pick, r.options.length - 1) : 0] || r.utc;
    const srcDay = C.ymd(utc, from.tz);
    const dstTag = (loc) => C.isDST(utc, loc.tz) ? 'ON' : C.observesDST(utc, loc.tz) ? 'OFF' : 'none';
    const rowFor = loc => ({
      loc, time: C.timeText(utc, loc.tz), date: C.shortDateText(utc, loc.tz), abbr: C.zoneAbbr(utc, loc.tz),
      offset: C.offsetLabel(C.offsetMinutes(utc, loc.tz)), dst: dstTag(loc), dayDelta: dayDiff(C.ymd(utc, loc.tz), srcDay),
      hour: C.localHour(utc, loc.tz), cat: category(C.localHour(utc, loc.tz)),
    });
    const timeline = loc => Array.from({ length: 24 }, (_, i) => {
      const t = new Date(utc.getTime() + (i - 12) * 3600000);
      const hr = C.localHour(t, loc.tz);
      return { hour: hr, cat: category(hr), meeting: i === 12, midnight: hr === 0 };
    });
    return {
      status: r.status, gapMinutes: r.gapMinutes, options: r.options, utc, source: rowFor(from),
      rows: participants.map(p => ({ ...rowFor(p), timeline: timeline(p) })), sourceTimeline: timeline(from),
    };
  }

  /** Plain-text summary suitable for pasting into an email or chat. */
  function summaryText(plan, from) {
    const dst = r => r.dst === 'ON' ? ' (DST on)' : r.dst === 'OFF' ? ' (DST off)' : '';
    const day = r => r.dayDelta === 0 ? '' : r.dayDelta > 0 ? ' (+1 day)' : ' (-1 day)';
    const line = r => `${r.time} ${r.abbr}${dst(r)} - ${r.loc.name}, ${r.date}${day(r)}`;
    return [`Meeting time: ${plan.source.date} ${plan.source.time} ${plan.source.abbr}${dst(plan.source)} (${from.name})`, ...plan.rows.map(line)].join('\n');
  }

  return { parseMeetingText, resolveDate, addDays, planMeeting, summaryText, category, dayDiff };
});
