import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareTesting, seedTesting } from '../scripts/testing.mjs';
import { makeIndex, makeImpact } from '../scripts/impact.mjs';
const sha = source => createHash('sha256').update(source).digest('hex');
const source = 'func TestOrder(t *testing.T) {\n  assertOrder(t)\n}\n';
const file = { source, sha256: sha(source) };
const head = { revision: 'head', fingerprint: 'head-fingerprint', files: { 'orders_test.go': file } };
const base = { revision: 'base', fingerprint: 'base-fingerprint', files: { 'orders_test.go': { source: '// old helper\n' + source, sha256: sha('// old helper\n' + source) } } };
const snapshot = { version: 1, collectedAt: '2026-11-01', head, base, coverage: {} };
const authored = { scope: 'Order placement', evidence: [{ id: 'order', name: 'TestOrder', method: 'automated', file: 'orders_test.go', line: 1, endLine: 3, base: { line: 2, endLine: 4 }, proves: 'Saves a valid order', limits: 'Stubbed repository' }], features: [{ id: 'orders', title: 'Place an order', summary: 'Accept a customer order', scenarios: [{ id: 'place', title: 'Save an order', summary: 'Saved via a repository stub', dimension: 'behavior', status: 'tested', evidence: ['order'], flows: ['place'], limit: 'Not an HTTP journey' }] }], captures: [] };
const options = { flows: { place: {} }, isDiff: true, baseRevision: 'base', headRevision: 'head', fingerprints: { head: 'head-fingerprint', base: 'base-fingerprint' } };
const prepare = (a = authored, s = snapshot) => prepareTesting(a, s, options);
let result = prepare();
assert.deepEqual(result.errors, []);
assert.equal(result.data.evidence[0].change, 'unchanged', 'test body can remain unchanged in a changed file');
assert.equal(result.data.evidence[0].changeBasis, 'body');
assert.equal(result.data.features[0].scenarios[0].status, 'tested');
const stale = structuredClone(authored); stale.evidence[0].reviewedHash = sha('earlier code');
result = prepare(stale); assert(result.warnings.length); assert.equal(result.data.features[0].scenarios[0].status, 'unassessed');
const earlierRun = structuredClone(authored); earlierRun.evidence[0].result = { status: 'passed', command: 'go test ./...', at: '2026-10-01', fingerprint: 'earlier-code' };
result = prepare(earlierRun); assert(result.data.evidence[0].resultStale); assert.equal(result.data.features[0].scenarios[0].status, 'tested', 'execution and assertion relevance are independent');
const changed = structuredClone(snapshot); changed.head.files['orders_test.go'] = { source: source.replace('assertOrder', 'assertNewOrder'), sha256: sha(source.replace('assertOrder', 'assertNewOrder')) };
assert.equal(prepare(authored, changed).data.evidence[0].change, 'changed');
const added = structuredClone(snapshot); added.base.files = {};
assert.equal(prepare(authored, added).data.evidence[0].change, 'added');
const removed = structuredClone(snapshot); removed.head.files = {};
assert.equal(prepare(authored, removed).data.evidence[0].change, 'removed');
const unreadable = structuredClone(snapshot);
unreadable.head.files['orders_test.go'] = { source: null, sha256: sha(Buffer.from([0xe9])) };
const unreadableResult = prepare(authored, unreadable);
assert.deepEqual(unreadableResult.errors, []);
assert.equal(unreadableResult.data.evidence[0].source, null, 'unavailable head text must not be replaced by baseline text');
assert.equal(unreadableResult.data.evidence[0].baseSource, source.trimEnd());
for (const mutate of [
  a => a.features.push(a.features[0]),
  a => a.features[0].scenarios[0].flows = ['not-a-flow'],
  a => a.features[0].scenarios[0].evidence = ['not-a-test'],
  a => a.features[0].scenarios[0].evidence = [],
  a => a.evidence[0].endLine = 999,
  a => a.evidence[0].file = '../secret',
  a => a.evidence[0].method = 'guessed',
  a => { a.evidence[0].method = 'scripted'; },
  a => a.evidence[0].result = { status: 'passed' },
  a => a.evidence[0].change = 'added',
  a => a.features[0].scenarios[0].captures = ['missing'],
]) { const a = structuredClone(authored); mutate(a); assert(prepare(a).errors.length, 'invalid content must be rejected'); }
const brokenHash = structuredClone(snapshot); brokenHash.head.files['orders_test.go'].source += '// changed';
assert(prepare(authored, brokenHash).errors.some(e => /hash mismatch/.test(e)));
const coverage = (fingerprint, revision, covered = 1) => ({ command: 'go test -cover ./...', toolchain: 'go fixture', environment: { GOOS: 'fixture', GOARCH: 'fixture' }, collectedAt: '2026-11-01', scope: './...', metric: 'statements', mode: 'atomic', result: 'passed', fingerprint, revision, packages: [{ path: 'example.test/orders', covered, statements: 2 }] });
assert.equal(prepareTesting(authored, { ...snapshot, coverage: { head: coverage(head.fingerprint, 'head') } }, { flows: { place: {} } }).data.coverage.head.eligible, false, 'an unbound legacy model cannot adopt an arbitrary profile');
const measured = structuredClone(snapshot); measured.coverage = { head: coverage(head.fingerprint, 'head'), base: coverage(base.fingerprint, 'base', 0) };
result = prepare(authored, measured); assert.equal(result.data.coverage.comparable, true); assert.equal(result.data.coverage.base.packages[0].covered, 0);
measured.coverage.head.fingerprint = 'other-code'; result = prepare(authored, measured); assert.equal(result.data.coverage.head.eligible, false); assert.equal(result.data.coverage.comparable, false);
measured.coverage.head.fingerprint = head.fingerprint; measured.coverage.head.scope = './orders'; assert.equal(prepare(authored, measured).data.coverage.comparable, false);
measured.coverage.head.scope = './...'; measured.coverage.head.revision = 'other-revision'; assert.equal(prepare(authored, measured).data.coverage.head.eligible, false); measured.coverage.head.revision = 'head'; measured.coverage.head.result = 'failed'; assert.equal(prepare(authored, measured).data.coverage.comparable, false);
const seed = seedTesting(authored, { place: {} }, []);
assert.equal(seed.evidence[0].id, 'order'); assert.equal(seed.features[0].scenarios[0].status, 'unassessed');
assert.equal(seed.features[0].needsReview, true);
const withCapture = structuredClone(authored);
withCapture.evidence.push({ ...withCapture.evidence[0], id: 'capture-test' });
withCapture.captures = [{ id: 'form', evidence: ['capture-test'] }];
withCapture.features[0].scenarios[0].captures = ['form'];
assert.deepEqual(seedTesting(withCapture, { place: {} }, []).evidence.map(e => e.id), ['order', 'capture-test']);
assert.equal(seedTesting(authored, {}, []).features.length, 0);
const model = { packages: {}, relations: [], usedBy: {} };
const content = { tests: authored, flows: { place: { participants: [], steps: [], sources: { files: ['orders.go'] } } } };
const index = makeIndex(content, model);
assert(index.items.find(x => x.kind === 'test-scenario').files.includes('orders_test.go'));
assert(index.items.find(x => x.kind === 'test-scenario').files.includes('orders.go'));
const impact = makeImpact({ before: model, after: model, index, fileChanges: [{ file: 'orders_test.go', status: 'changed' }] });
assert(impact.items.some(x => x.id === 'test-scenario:orders/place'));
assert.deepEqual(prepareTesting(undefined, null).errors, []);
console.log('testing: references, paired sources, unchanged tests, stale evidence, coverage provenance, seeding and refresh associations passed');
