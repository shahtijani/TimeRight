const test = require('node:test');
const assert = require('node:assert');
const L = require('../renderer/locations.js');
const top = (q, n = 1) => L.search(q, new Date('2026-10-04T00:00:00Z'), n).map(l => l.id);

test('covers every country zone with a flag-able code', () => {
  assert.ok(L.all.length > 390);
  assert.ok(L.all.every(l => /^[A-Z]{2}$/.test(l.code)));
});
test('city, country and nearby-city search', () => {
  assert.deepEqual(top('auckland'), ['Pacific/Auckland']);
  assert.deepEqual(top('new zealand'), ['Pacific/Auckland']);
  assert.deepEqual(top('mumbai'), ['Asia/Kolkata']);
  assert.deepEqual(top('india'), ['Asia/Kolkata']);
  assert.deepEqual(top('sao paulo'), ['America/Sao_Paulo']);
  assert.deepEqual(top('london'), ['Europe/London']);
});
test('countries rank their popular zone first', () => {
  assert.equal(top('australia')[0], 'Australia/Sydney');
  assert.equal(top('united states')[0], 'America/New_York');
});
test('abbreviations clients use', () => {
  assert.ok(top('est', 8).includes('America/New_York'));
  assert.ok(top('ist', 8).includes('Asia/Kolkata'));
  assert.ok(top('nzdt', 8).includes('Pacific/Auckland'));
  assert.ok(top('aedt', 8).includes('Australia/Sydney'));
});
test('empty query gives popular list; nonsense gives nothing', () => {
  assert.equal(L.search('')[0].id, 'Asia/Kolkata');
  assert.deepEqual(L.search('zzzzqq'), []);
});
test('alias resolves to the same location', () => {
  assert.equal(L.fromTZ('Asia/Calcutta').id, 'Asia/Kolkata');
  assert.equal(L.fromTZ('Mars/Base').city, 'Base');
});
test('names', () => {
  assert.equal(L.byId.get('Asia/Kolkata').name, 'India (Kolkata)');
  assert.equal(L.byId.get('Pacific/Auckland').name, 'New Zealand (Auckland)');
  assert.equal(L.byId.get('Asia/Singapore').name, 'Singapore');
});
