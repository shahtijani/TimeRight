const test = require('node:test');
const assert = require('node:assert');
const C = require('../renderer/core.js');
const iso = d => d.toISOString();

test('Auckland DST on in early Oct 2026, off in July', () => {
  assert.equal(C.isDST(new Date('2026-10-03T02:37:00Z'), 'Pacific/Auckland'), true);
  assert.equal(C.offsetMinutes(new Date('2026-10-03T02:37:00Z'), 'Pacific/Auckland'), 780);
  assert.equal(C.isDST(new Date('2026-07-01T00:00:00Z'), 'Pacific/Auckland'), false);
});
test('Zones without DST', () => {
  for (const tz of ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Perth', 'Australia/Brisbane'])
    assert.equal(C.isDST(new Date('2026-10-03T00:00:00Z'), tz), false, tz);
  assert.equal(C.observesDST(new Date('2026-10-03T00:00:00Z'), 'Asia/Kolkata'), false);
  assert.equal(C.observesDST(new Date('2026-10-03T00:00:00Z'), 'Europe/London'), true);
});
test('Northern hemisphere DST', () => {
  assert.equal(C.isDST(new Date('2026-07-01T12:00:00Z'), 'America/New_York'), true);
  assert.equal(C.isDST(new Date('2026-01-15T12:00:00Z'), 'America/New_York'), false);
  assert.equal(C.isDST(new Date('2026-07-01T12:00:00Z'), 'Europe/Dublin'), true);
  assert.equal(C.isDST(new Date('2026-01-15T12:00:00Z'), 'Europe/Dublin'), false);
});
test('Sydney and Auckland differ by 2h in summer (both DST)', () => {
  const n = new Date('2026-10-10T00:00:00Z');
  assert.equal(C.offsetMinutes(n, 'Pacific/Auckland') - C.offsetMinutes(n, 'Australia/Sydney'), 120);
});
test('Alias canonicalisation', () => {
  assert.equal(C.canonicalTZ('Asia/Calcutta'), C.canonicalTZ('Asia/Kolkata'));
  assert.equal(C.isValidTZ('Mars/Olympus'), false);
});
test('Normal conversion', () => {
  const r = C.zonedToUtc(2026, 10, 3, 15, 50, 'Australia/Sydney');
  assert.equal(r.status, 'ok');
  assert.equal(iso(r.utc), '2026-10-03T05:50:00.000Z'); // Sydney is still UTC+10 until 4 Oct
  assert.equal(C.timeText(r.utc, 'Asia/Kolkata'), '11:20 AM');
});
test('Conversion on the day DST begins (Auckland 27 Sep 2026)', () => {
  assert.equal(iso(C.zonedToUtc(2026, 9, 27, 10, 0, 'Pacific/Auckland').utc), '2026-09-26T21:00:00.000Z');
  assert.equal(iso(C.zonedToUtc(2026, 9, 27, 1, 30, 'Pacific/Auckland').utc), '2026-09-26T13:30:00.000Z');
});
test('Skipped time is flagged as a gap', () => {
  const r = C.zonedToUtc(2026, 9, 27, 2, 30, 'Pacific/Auckland');
  assert.equal(r.status, 'gap');
  assert.equal(r.gapMinutes, 60);
  assert.equal(C.timeText(r.utc, 'Pacific/Auckland'), '3:30 AM'); // moved forward by the gap
  assert.equal(C.zonedToUtc(2026, 3, 8, 2, 30, 'America/New_York').status, 'gap'); // US spring forward
});
test('Repeated time is flagged as ambiguous', () => {
  const r = C.zonedToUtc(2026, 11, 1, 1, 30, 'America/New_York');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.options.map(iso), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  assert.equal(C.zonedToUtc(2026, 4, 5, 2, 30, 'Pacific/Auckland').status, 'ambiguous'); // NZ ends DST 5 Apr 2026
});
test('Next transition', () => {
  const t = C.nextTransition(new Date('2026-10-03T00:00:00Z'), 'Pacific/Auckland');
  assert.equal(t.startsDST, false);
  assert.equal(C.ymd(t.at, 'Pacific/Auckland'), '2027-04-04'); // NZ DST ends first Sunday of April 2027
  assert.equal(C.nextTransition(new Date('2026-10-03T00:00:00Z'), 'Asia/Kolkata'), null);
  const sy = C.nextTransition(new Date('2026-10-03T00:00:00Z'), 'Australia/Sydney');
  assert.equal(sy.startsDST, true);
  assert.equal(C.ymd(sy.at, 'Australia/Sydney'), '2026-10-04');
});
test('Formatting', () => {
  assert.equal(C.offsetLabel(330), 'UTC +05:30');
  assert.equal(C.offsetLabel(-240), 'UTC -04:00');
  assert.equal(C.formatDiff(390), '6 hours 30 minutes');
  assert.equal(C.formatDiff(60), '1 hour');
});
test('Real abbreviations instead of GMT+x', () => {
  const d = new Date('2026-10-03T02:37:00Z');
  assert.equal(C.zoneAbbr(d, 'Asia/Kolkata'), 'IST');
  assert.equal(C.zoneAbbr(d, 'Pacific/Auckland'), 'NZDT');
  assert.equal(C.zoneAbbr(d, 'America/New_York'), 'EDT');
  assert.equal(C.zoneAbbr(d, 'Europe/London'), 'BST');
});
