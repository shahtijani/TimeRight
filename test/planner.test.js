const test = require('node:test');
const assert = require('node:assert');
const P = require('../renderer/planner.js');
const L = require('../renderer/locations.js');
const NOW = new Date('2026-10-03T18:00:00Z'); // Sat 3 Oct 2026 (23:30 IST, Sun 4 Oct 05:00 Sydney)
const kolkata = L.byId.get('Asia/Kolkata');

test('parse: time + city + relative day', () => {
  const r = P.parseMeetingText('3:50 PM Sydney tomorrow', NOW);
  assert.equal(r.time, '15:50'); assert.equal(r.loc.id, 'Australia/Sydney'); assert.deepEqual(r.dateSpec, { type: 'rel', n: 1 });
});
test('parse: the client phrases from the brief', () => {
  assert.equal(P.parseMeetingText('3:50 pm Australian time', NOW).loc.id, 'Australia/Sydney');
  assert.equal(P.parseMeetingText('tomorrow 3:50 p.m. EST', NOW).loc.id, 'America/New_York');
  assert.equal(P.parseMeetingText('let\'s meet at 10am New Zealand time', NOW).loc.id, 'Pacific/Auckland');
  assert.equal(P.parseMeetingText('10am Eastern', NOW).loc.id, 'America/New_York');
});
test('parse: 24h, noon, bare hour am/pm, weekday, explicit dates', () => {
  assert.equal(P.parseMeetingText('15:30 london', NOW).time, '15:30');
  assert.equal(P.parseMeetingText('noon dubai', NOW).time, '12:00');
  assert.equal(P.parseMeetingText('9am tokyo', NOW).time, '09:00');
  assert.equal(P.parseMeetingText('12am tokyo', NOW).time, '00:00');
  assert.equal(P.parseMeetingText('12pm tokyo', NOW).time, '12:00');
  assert.deepEqual(P.parseMeetingText('10am london friday', NOW).dateSpec, { type: 'weekday', wd: 5, next: false });
  assert.deepEqual(P.parseMeetingText('5 Oct 9am London', NOW).dateSpec, { type: 'md', m: 10, d: 5 });
  assert.deepEqual(P.parseMeetingText('Oct 5th 9:30 pm London', NOW).dateSpec, { type: 'md', m: 10, d: 5 });
  assert.equal(P.parseMeetingText('9am', NOW).loc, null);
});
test('resolve dates in the meeting zone', () => {
  const syd = 'Australia/Sydney'; // it is already Sun 4 Oct in Sydney
  assert.equal(P.resolveDate({ type: 'rel', n: 0 }, syd, NOW), '2026-10-04');
  assert.equal(P.resolveDate({ type: 'rel', n: 1 }, syd, NOW), '2026-10-05');
  assert.equal(P.resolveDate({ type: 'rel', n: 1 }, 'America/New_York', NOW), '2026-10-04');
  assert.equal(P.resolveDate({ type: 'weekday', wd: 5, next: false }, syd, NOW), '2026-10-09');
  assert.equal(P.resolveDate({ type: 'md', m: 10, d: 5 }, syd, NOW), '2026-10-05');
  assert.equal(P.resolveDate({ type: 'md', m: 1, d: 5 }, syd, NOW), '2027-01-05'); // already passed -> next year
});
test('plan: 3:50 PM Sydney on 5 Oct (DST on) -> India', () => {
  const p = P.planMeeting({ from: L.byId.get('Australia/Sydney'), date: '2026-10-05', time: '15:50', participants: [kolkata] });
  assert.equal(p.status, 'ok');
  assert.equal(p.source.abbr, 'AEDT'); assert.equal(p.source.dst, 'ON');
  assert.equal(p.rows[0].time, '10:20 AM'); assert.equal(p.rows[0].dst, 'none'); assert.equal(p.rows[0].dayDelta, 0);
});
test('plan: DST flips between two dates for the same wall-clock time', () => {
  const syd = L.byId.get('Australia/Sydney');
  const before = P.planMeeting({ from: syd, date: '2026-10-02', time: '15:50', participants: [kolkata] }); // AEST +10
  const after = P.planMeeting({ from: syd, date: '2026-10-05', time: '15:50', participants: [kolkata] });  // AEDT +11
  assert.equal(before.rows[0].time, '11:20 AM'); assert.equal(before.source.dst, 'OFF');
  assert.equal(after.rows[0].time, '10:20 AM'); assert.equal(after.source.dst, 'ON');
});
test('plan: day rollover and gap/ambiguous', () => {
  const p = P.planMeeting({ from: L.byId.get('Pacific/Auckland'), date: '2026-10-05', time: '01:00', participants: [L.byId.get('America/Los_Angeles')] });
  assert.equal(p.rows[0].dayDelta, -1);
  const gap = P.planMeeting({ from: L.byId.get('Pacific/Auckland'), date: '2026-09-27', time: '02:30', participants: [kolkata] });
  assert.equal(gap.status, 'gap');
  const amb = P.planMeeting({ from: L.byId.get('America/New_York'), date: '2026-11-01', time: '01:30', participants: [kolkata], pick: 1 });
  assert.equal(amb.status, 'ambiguous'); assert.equal(amb.rows[0].time, '12:00 PM');
});
test('timeline marks the meeting cell and categories', () => {
  const p = P.planMeeting({ from: kolkata, date: '2026-10-05', time: '10:00', participants: [L.byId.get('Pacific/Auckland')] });
  const tl = p.rows[0].timeline;
  assert.equal(tl.length, 24); assert.equal(tl.filter(c => c.meeting).length, 1);
  assert.equal(tl[12].hour, 17 + 0); // 10:00 IST = 04:30Z = 17:30 NZDT
  assert.equal(P.category(10), 'good'); assert.equal(P.category(8), 'ok'); assert.equal(P.category(3), 'bad');
});
test('summary text', () => {
  const syd = L.byId.get('Australia/Sydney');
  const p = P.planMeeting({ from: syd, date: '2026-10-05', time: '15:50', participants: [kolkata] });
  const t = P.summaryText(p, syd);
  assert.match(t, /3:50 PM AEDT \(DST on\)/); assert.match(t, /10:20 AM IST/);
});
