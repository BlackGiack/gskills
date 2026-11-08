// Behavioral checks against a built site's actual shared Tests renderer.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareTesting } from '../scripts/testing.mjs';
const [site, jsdom] = process.argv.slice(2);
const { JSDOM, VirtualConsole } = createRequire(join(jsdom, 'package.json'))('jsdom');
let html = readFileSync(join(site, 'index.html'), 'utf8');
for (const file of ['data/model.js', 'data/content.js', 'data/infra.js', 'data/diff.js', 'tests.js', 'appedia.js']) html = html.replace(`<script src="${file}"></script>`, () => '<script>' + readFileSync(join(site, file), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
const errors = [], console = new VirtualConsole(); console.on('jsdomError', e => errors.push(e.detail?.stack || e.message));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'file:///site/index.html#tests', virtualConsole: console, beforeParse(w) {
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.Element.prototype.scrollTo = () => {};
  w.SVGElement.prototype.getScreenCTM = function () { return { a: 1, inverse() { return this; } }; };
  w.SVGElement.prototype.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: 0, y: 0 }; } });
  w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 100, width: 10, height: 10 }); w.scrollTo = () => {};
} });
const w = dom.window, d = w.document;
const tick = () => new Promise(resolve => setTimeout(resolve, 45));
const go = async route => { w.location.hash = route; await tick(); };
const hash = s => createHash('sha256').update(s).digest('hex');
const flow = Object.keys(w.APPEDIA_CONTENT.flows || {})[0] || 'test-flow';
const raw = 'func TestOrder() {\n  checkOrder()\n}\n';
const record = source => ({ source, sha256: hash(source) });
const snapshot = { version: 1, head: { revision: 'head', fingerprint: 'head', files: { 'order_test.go': record(raw), 'new_test.go': record(raw), 'review.md': record('Inspected the form'), 'form.png': { sha256: hash(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64')), image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=' } } }, base: { revision: 'base', fingerprint: 'base', files: { 'order_test.go': record('// helper changed\n' + raw) } }, coverage: {} };
const authored = { scope: 'Fictional fixture', evidence: [
  { id: 'existing', name: 'Existing order regression', method: 'automated', file: 'order_test.go', line: 1, endLine: 3, base: { line: 2, endLine: 4 }, proves: 'Checks order contents', limits: 'Repository stub', result: { status: 'passed', command: 'go test ./...', at: '2026-11-01', fingerprint: 'head' } },
  { id: 'new', name: 'New order regression', method: 'automated', file: 'new_test.go', proves: 'Checks new validation', limits: 'Only one invalid case' },
  { id: 'manual', name: 'Form observation', method: 'manual', file: 'review.md', proves: 'Observed fields', limits: 'One image', integration: 'fallback', fallbackReason: 'Fixture has no E2E runner' }
], captures: [{ id: 'form', title: 'Fixture form', state: 'Empty', file: 'form.png', observation: 'Labels visible', limits: 'Synthetic image fixture only', evidence: ['manual'], size: [80,24], unit: 'cells' }], features: [
  { id: 'orders', title: 'Place <orders>', summary: 'Validate and save orders', change: 'changed', scenarios: [
    { id: 'saved', title: 'Preserve order contents', summary: 'Old regression supports the changed route', dimension: 'behavior', status: 'tested', change: 'changed', flows: [flow], evidence: ['existing'], limit: 'Not HTTP E2E' },
    { id: 'layout', title: 'Keep layout visible', summary: 'One observed form', dimension: 'layout', status: 'partial', flows: [flow], evidence: ['manual'], captures: ['form'], limit: 'No screenshot baseline', suggestion: 'Add project E2E assertions', priority: 'Next', reason: 'Repeat layout feedback' },
    { id: 'retry', title: 'Recover from failed save', summary: 'No retry assertion found', dimension: 'interaction', status: 'not-found', flows: [flow], evidence: [], limit: 'Search was scoped to the fixture' },
    { id: 'other', title: 'Other state', summary: 'Not reviewed', dimension: 'behavior', status: 'unassessed', flows: [], evidence: [] }
  ] }, { id: 'shipping', title: 'Ship orders', summary: 'Shipment', scenarios: [] }
] };
const prepared = prepareTesting(authored, snapshot, { flows: { [flow]: {} }, isDiff: !!w.APPEDIA_DIFF }); assert.deepEqual(prepared.errors, []);
w.APPEDIA_MODEL.testing = prepared.data; w.APPEDIA_TEST_UI.render('tests');
assert.equal(d.querySelectorAll('.test-feature-row').length, 2); assert(!d.querySelector('.test-feature-row orders'));
const search = d.getElementById('test-feature-search'); search.value = 'RETRY'; search.dispatchEvent(new w.Event('input')); assert.equal(d.querySelectorAll('.test-feature-row').length, 1);
search.value = 'no feature'; search.dispatchEvent(new w.Event('input')); assert(d.querySelector('.test-empty')); d.querySelector('.test-clear').click(); assert.equal(d.querySelectorAll('.test-feature-row').length, 2);
await go('tests-orders'); assert.equal(d.querySelectorAll('.test-scenario').length, 4);
d.querySelector('[data-dimension="layout"]').click(); assert.equal(d.querySelectorAll('.test-scenario').length, 1);
await go('tests-orders/saved'); assert(d.getElementById('scenario-saved').open);
if (w.APPEDIA_DIFF) { const select = d.querySelector('[aria-label="Filter scenarios by test change"]'); select.value='unchanged';select.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.test-scenario').length,1); }
await go('tests-source-existing'); assert(d.querySelector('.test-source').textContent.includes('checkOrder')); assert.equal(w.APPEDIA_MODEL.testing.evidence[0].change,'unchanged');
await go('tests-capture-form'); assert(d.querySelector('.test-full-capture img').src.startsWith('data:image/png')); assert.match(d.querySelector('#mode-tests').textContent,/No automated image assertion/);
if (Object.keys(w.APPEDIA_CONTENT.flows || {}).length) {
  await go('flow-'+flow); assert.equal(d.querySelectorAll('.test-flow-scenario').length,3);
  d.querySelector('.test-flow-scenario a').click(); await tick(); assert(d.querySelector('.test-scenario[open]'));
}
const modelPaths = Object.values(w.APPEDIA_MODEL.packages).map(p=>p.importPath || (w.APPEDIA_MODEL.module+'/'+p.path).replace(/\/\.$/,''));
const coverage = (fingerprint, covered) => ({ eligible:true, fingerprint, revision:fingerprint, command:'go test -cover ./...', collectedAt:'2026-11-01', scope:'./...', mode:'atomic', metric:'statements', result:'passed', packages:[{path:modelPaths[0],covered,statements:10}] });
w.APPEDIA_MODEL.testing.coverage = { head:coverage('head',0),base:coverage('base',5),comparable:true };
await go('tests-coverage'); assert.match(d.querySelector('.test-coverage-summary').textContent,/0.0%/);
if (w.APPEDIA_DIFF) assert.match(d.querySelector('.test-coverage-summary').textContent,/-50.0 pp/);
let input=d.getElementById('test-package-search');input.value='no such package';input.dispatchEvent(new w.Event('input'));assert.match(d.querySelector('tbody').textContent,/No packages match/);
w.APPEDIA_MODEL.testing.coverage.head.eligible=false;w.APPEDIA_MODEL.testing.coverage.comparable=false;w.APPEDIA_TEST_UI.render('tests-coverage');assert.equal(d.querySelectorAll('.test-coverage-summary > div strong')[w.APPEDIA_DIFF ? 1 : 0].textContent,'Not collected');
w.APPEDIA_MODEL.testing.coverage={};w.APPEDIA_TEST_UI.render('tests-coverage');assert.match(d.querySelector('#mode-tests').textContent,/No coverage profiles/);
// Build validation runs before rendering and must be able to reject broken associations.
const temp=mkdtempSync(join(tmpdir(),'tests-build-'));
try {
  const content=structuredClone(w.APPEDIA_CONTENT);content.tests=structuredClone(authored);
  if (!content.flows?.[flow]) { content.flows={...(content.flows||{}),[flow]:{title:'Fixture flow',summary:'Synthetic renderer fixture',participants:[['u','fixtureUser']],steps:[['u','u','self','Check','','']]}};content.externals={...(content.externals||{}),fixtureUser:['Fixture user','test']}; }
  writeFileSync(join(temp,'content.js'),'window.APPEDIA_CONTENT = '+JSON.stringify(content)+';');
  writeFileSync(join(temp,'model.json'),JSON.stringify(w.APPEDIA_MODEL));
  writeFileSync(join(temp,'tests.json'),JSON.stringify(snapshot));
  const buildScript=join(dirname(fileURLToPath(import.meta.url)),'../scripts/build.mjs');
  const valid=spawnSync('node',[buildScript,'--model',join(temp,'model.json'),'--content',join(temp,'content.js'),'--test-evidence',join(temp,'tests.json'),'--out',join(temp,'site')],{encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr||valid.stdout);
  const built=JSON.parse(readFileSync(join(temp,'site/data/model.js'),'utf8').replace(/^window\.APPEDIA_MODEL = /,'').replace(/;\s*$/,''));
  assert.equal(built.testing.evidence[0].source.includes('checkOrder'),true);
  assert.equal(JSON.parse(readFileSync(join(temp,'site/data/test-evidence.json'),'utf8')).version,1);
  assert.ok(readFileSync(join(temp,'site/tests.js'),'utf8').includes('APPEDIA_TEST_UI'));
  content.tests.features[0].scenarios[0].flows=['missing-flow'];
  writeFileSync(join(temp,'content.js'),'window.APPEDIA_CONTENT = '+JSON.stringify(content)+';');
  writeFileSync(join(temp,'model.json'),JSON.stringify(w.APPEDIA_MODEL));
  const result=spawnSync('node',[join(dirname(fileURLToPath(import.meta.url)),'../scripts/build.mjs'),'--model',join(temp,'model.json'),'--content',join(temp,'content.js'),'--out',join(temp,'site')],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/unknown flow missing-flow/);
} finally {rmSync(temp,{recursive:true,force:true});dom.window.close();}
assert.deepEqual(errors,[]);
process.stdout.write('Tests UI: search, filters, unchanged-test relevance, evidence/captures, flow round trip, coverage and build rejection passed\n');
