/* Shared offline Tests UI. Curated assessments and recorded evidence live in model.testing. */
(function () {
  'use strict';
  const M = window.APPEDIA_MODEL, C = window.APPEDIA_CONTENT, diff = window.APPEDIA_DIFF;
  const empty = { features: [], evidence: [], captures: [], coverage: {} };
  const data = () => M.testing || empty;
  const labels = { tested: 'Evidence found', partial: 'Partial evidence', 'not-found': 'No evidence found', unassessed: 'Not assessed' };
  const symbols = { tested: '✓', partial: '◐', 'not-found': '?', unassessed: '○' };
  const dimensions = { behavior: 'Behavior', layout: 'Layout', interaction: 'Interaction' };
  const methods = { automated: 'Automated test', scripted: 'Ad hoc scripted check', manual: 'Manual inspection' };
  const state = { featureQuery: '', packageQuery: '', packageSort: 'coverage-asc' };
  const h = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'text') n.textContent = value;
      else if (key.startsWith('on')) n.addEventListener(key.slice(2), value);
      else n.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) if (child != null && child !== false) n.append(child);
    return n;
  };
  const p = text => h('p', { text });
  const link = (text, route, cls = '') => h('a', { href: '#' + route, class: cls, text });
  const field = (label, value) => h('div', { class: 'test-field' }, h('strong', { text: label }), p(value));
  const pill = status => h('span', { class: 'test-pill ' + status, text: symbols[status] + ' ' + labels[status] });
  const evidence = id => data().evidence.find(e => e.id === id);
  const capture = id => data().captures.find(c => c.id === id);
  const method = e => h('span', { class: 'test-method ' + e.method, text: methods[e.method] });
  const flowTitle = id => C.flows?.[id]?.title || id;
  const match = (text, query) => query.trim().toLowerCase().split(/\s+/).every(word => text.toLowerCase().includes(word));
  const counts = scenarios => Object.fromEntries(Object.keys(labels).map(status => [status, scenarios.filter(s => s.status === status).length]));
  const date = value => { if (!value) return 'Date not recorded'; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; };
  function change(value, isTest = false) {
    if (isTest && typeof value !== 'string' && value.method !== 'automated') return null;
    const ch = typeof value === 'string' ? value : value.change;
    const title = isTest ? ({ added: 'New test', changed: 'Modified test body', removed: 'Removed test', unchanged: 'Existing test', unknown: 'Test change not compared' })[ch] : ({ added: 'Added', changed: 'Changed', removed: 'Removed', unchanged: 'Existing behavior', unknown: 'Change not assessed' })[ch];
    return diff && title ? h('span', { class: 'chpill' + (['added', 'changed', 'removed'].includes(ch) ? ' ch-' + ch : ''), text: title }) : null;
  }
  function stats(f) {
    const n = counts(f.scenarios);
    return h('div', { class: 'test-stats' }, ...Object.entries(n).filter(([id, count]) => id !== 'unassessed' || count).map(([id, count]) => h('div', { class: id }, h('strong', { text: count }), h('span', { text: labels[id] }))),
      h('div', {}, h('strong', { text: new Set(f.scenarios.flatMap(s => s.evidence)).size }), h('span', { text: 'Evidence records' })));
  }
  function overview(root) {
    root.append(h('div', { class: 'test-kicker', text: diff ? 'Coverage of the change' : 'Functional coverage' }), h('h1', { text: diff ? 'How is this change tested?' : 'What is tested?' }),
      p('Explore behavior, layout and interaction. Inspect the evidence and decide what to test next.'),
      h('div', { class: 'test-scope' }, h('strong', { text: 'Assessment scope' }), p(data().scope || (data().features.length ? 'Only the features and scenarios listed below have been assessed.' : 'No feature assessments have been recorded. Unassessed does not mean untested.'))));
    const results = h('div', { class: 'test-feature-results' }), status = h('p', { class: 'test-help', role: 'status' });
    const input = h('input', { type: 'search', id: 'test-feature-search', value: state.featureQuery, placeholder: 'Search features or scenarios…', oninput: () => { state.featureQuery = input.value; draw(); } });
    const clear = h('button', { type: 'button', class: 'test-clear', text: 'Clear search', onclick: () => { input.value = state.featureQuery = ''; draw(); input.focus(); } });
    function draw() {
      const selected = data().features.filter(f => match([f.title, f.summary, f.area || '', ...f.scenarios.map(s => s.title + ' ' + s.summary)].join(' '), input.value));
      status.textContent = `${selected.length} of ${data().features.length} assessed features.`;
      clear.hidden = !input.value;
      results.replaceChildren(...selected.map(f => {
        const n = counts(f.scenarios), hit = input.value.trim() && f.scenarios.find(s => match(s.title + ' ' + s.summary, input.value));
        return h('a', { class: 'test-feature test-feature-row', href: '#tests-' + f.id },
          h('div', { class: 'test-feature-info' }, h('div', { class: 'test-kicker', text: f.area || 'Feature' }), h('h2', {}, f.title, change(f)), p(f.summary),
            h('div', { class: 'test-dimension-labels' }, ...Object.entries(dimensions).map(([id, label]) => h('span', { text: label + ' · ' + f.scenarios.filter(s => s.dimension === id).length }))),
            hit ? h('p', { class: 'test-search-match', text: 'Matching scenario: ' + hit.title }) : null),
          h('div', { class: 'test-feature-coverage' }, ...Object.entries(n).filter(([id, count]) => id !== 'unassessed' || count).map(([id, count]) => h('span', { class: 'test-list-count ' + id }, h('strong', { text: count }), h('span', { text: ({ tested: 'Supported', partial: 'Partial', 'not-found': 'Gaps', unassessed: 'Unassessed' })[id] }))), h('span', { class: 'test-row-open', text: 'Inspect evidence →' })));
      }));
      if (!selected.length) results.append(h('div', { class: 'test-empty' }, h('h2', { text: data().features.length ? 'No features match' : 'No assessments yet' }), p('Add evidence-based feature assessments to populate this view. Search covers feature names, descriptions and scenarios.')));
    }
    draw();
    root.append(h('div', { class: 'test-section-head' }, h('h2', { text: 'Assessed features' })), h('label', { for: 'test-feature-search', class: 'test-search-label', text: 'Search features and scenarios' }), h('div', { class: 'test-search-controls' }, input, clear), status, results,
      h('div', { class: 'test-legend' }, field('Evidence found', 'An assertion or documented observation supports the stated scenario within its limits.'), field('Partial / missing evidence', 'Read the missing assertions and suggested next tests.'), field('Not assessed', 'No current conclusion has been established, or the supporting source needs review.')),
      p('Scenario counts are not a percentage of application coverage. Test change, relevance, execution results and manual observations are separate facts.'));
  }
  function captureCard(c) {
    return h('a', { class: 'test-capture-card', href: '#tests-capture-' + c.id }, c.image ? h('img', { src: c.image, alt: c.state, loading: 'lazy' }) : h('span', { text: 'Image not collected' }), h('strong', { text: c.title }), h('small', { text: c.size ? c.size.join('×') + ' ' + (c.unit || 'pixels') : 'Dimensions not recorded' }));
  }
  function row(s, index, f) {
    return h('details', { class: 'test-scenario', id: 'scenario-' + s.id }, h('summary', {}, h('span', { class: 'test-scenario-number', text: String(index + 1).padStart(2, '0') }), h('span', { class: 'test-scenario-title' }, s.title, change(s)), pill(s.status), h('span', { class: 'test-chevron', text: '+', 'aria-hidden': 'true' })),
      h('div', { class: 'test-scenario-body' }, p(s.summary), s.stale ? field('Needs reassessment', 'Supporting source changed or this assessment was seeded as a draft. Its previous conclusion is not current evidence.') : null,
        s.flows.length ? h('div', { class: 'test-scenario-flows' }, h('strong', { text: 'Related flows' }), ...s.flows.map(id => link(flowTitle(id) + ' ↗', 'flow-' + id))) : null,
        ...s.evidence.map(id => { const e = evidence(id); return h('div', { class: 'test-evidence' }, method(e), change(e, true), link(e.name, 'tests-source-' + id), e.kind ? h('small', { text: e.kind }) : null, p(e.proves), e.integration === 'fallback' || e.method === 'scripted' ? field('Fallback reason', e.fallbackReason) : null); }),
        s.captures.length ? h('div', { class: 'test-capture-links' }, ...s.captures.map(id => captureCard(capture(id)))) : null,
        field('Evidence limit', s.limit || 'This scenario has not been assessed.'), s.suggestion ? field('Suggested test · ' + s.priority, s.suggestion) : null, s.reason ? p(s.reason) : null));
  }
  function scenarios(f) {
    let dimension = 'all';
    const rows = h('div', { class: 'test-scenarios' }), status = h('p', { class: 'test-help', role: 'status' });
    const select = (label, options) => h('select', { 'aria-label': label, onchange: draw }, ...options.map(([value, title]) => h('option', { value, text: title })));
    const byStatus = select('Filter scenarios by evidence', [['all', 'Any evidence status'], ...Object.entries(labels)]), byMethod = select('Filter scenarios by evidence method', [['all', 'Any evidence method'], ...Object.entries(methods)]), byOrigin = select('Filter scenarios by test change', [['all', 'Any test origin'], ['added', 'New tests'], ['changed', 'Modified test bodies'], ['unchanged', 'Existing tests'], ['removed', 'Removed tests']]);
    const tabs = h('div', { class: 'test-dimension-tabs', role: 'group', 'aria-label': 'Scenario dimensions' }, ...[['all', 'All scenarios'], ...Object.entries(dimensions)].map(([id, label]) => h('button', { type: 'button', 'data-dimension': id, 'aria-pressed': String(id === 'all'), onclick: () => { dimension = id; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dimension === id))); draw(); } }, `${label} (${f.scenarios.filter(s => id === 'all' || s.dimension === id).length})`)));
    function draw() {
      const selected = f.scenarios.filter(s => (dimension === 'all' || s.dimension === dimension) && (byStatus.value === 'all' || s.status === byStatus.value) && (byMethod.value === 'all' || s.evidence.some(id => evidence(id).method === byMethod.value)) && (byOrigin.value === 'all' || s.evidence.some(id => evidence(id).method === 'automated' && evidence(id).change === byOrigin.value)));
      status.textContent = `Showing ${selected.length} of ${f.scenarios.length} scenarios. Open a row to inspect evidence and limits.`;
      rows.replaceChildren();
      for (const [id, label] of Object.entries(dimensions)) { const group = selected.filter(s => s.dimension === id); if (group.length) rows.append(h('h3', { class: 'test-dimension-heading', text: label }), ...group.map(s => row(s, f.scenarios.indexOf(s), f))); }
      if (!selected.length) rows.append(p('No scenarios match these filters.'));
    }
    draw();
    return h('section', {}, h('h2', { text: 'Scenarios' }), tabs, h('div', { class: 'test-filters' }, byStatus, byMethod, diff ? byOrigin : null), status, rows);
  }
  function detail(root, f) {
    const related = data().evidence.filter(e => f.scenarios.some(s => s.evidence.includes(e.id))), captures = [...new Set(f.scenarios.flatMap(s => s.captures))];
    root.append(link('← All features', 'tests', 'test-back'), h('div', { class: 'test-kicker', text: f.area || 'Feature' }), h('h1', {}, f.title, change(f)), p(f.summary),
      ...(diff && (f.before || f.after) ? [h('div', { class: 'test-before-after' }, field('Before', f.before || 'Not described'), field('After', f.after || 'Not described'))] : []),
      ...(f.verdict ? [h('div', { class: 'test-verdict', text: f.verdict })] : []), stats(f),
      h('div', { class: 'test-columns' }, h('div', {}, scenarios(f), h('section', { class: 'test-gallery' }, h('h2', { text: 'UI evidence' }), captures.length ? h('div', { class: 'test-capture-grid' }, ...captures.map(id => captureCard(capture(id)))) : p('No UI captures recorded for these scenarios. Read any available layout and interaction assertions.'), p('Prefer screenshots produced by project-owned E2E tests. Ad hoc checks and manual observations remain separately identified.')),
        h('section', { class: 'test-next' }, h('h2', { text: 'What to test next' }), ...f.scenarios.filter(s => s.suggestion).sort((a, b) => ['First', 'Next', 'Later'].indexOf(a.priority) - ['First', 'Next', 'Later'].indexOf(b.priority)).map(s => h('article', {}, h('span', { class: 'test-priority', text: s.priority + ' · ' + dimensions[s.dimension] }), h('h3', { text: s.title }), p(s.suggestion), p(s.reason))))),
        h('aside', { class: 'test-aside', 'aria-label': 'Assessment context' },
          diff ? h('section', {}, h('h2', { text: 'Test changes' }), ...[['added','New tests'],['changed','Modified test bodies'],['unchanged','Existing tests'],['removed','Removed tests'],['unknown','Not compared']].filter(([id]) => related.some(e => e.method === 'automated' && e.change === id)).map(([id,title]) => field(title, related.filter(e => e.method === 'automated' && e.change === id).length + ' directly referenced test(s)')), p('Test relevance is independent of these change marks.')) : null,
          h('section', {}, h('h2', { text: 'How this is checked' }), ...Object.entries(methods).map(([id, title]) => field(title, related.filter(e => e.method === id).length + ' evidence record(s)')), p('An unchanged existing test can support changed behavior. Read the assertions and their boundary, independently of the diff marks.')),
          h('section', {}, h('h2', { text: 'Related flows' }), ...f.flows.map(id => h('div', { class: 'test-related-flow' }, link(flowTitle(id) + ' ↗', 'flow-' + id), h('small', { text: f.scenarios.filter(s => s.flows.includes(id)).length + ' related scenario(s)' })))),
          h('section', {}, h('h2', { text: 'Evidence and execution' }), ...related.map(e => h('div', { class: 'test-evidence-index' }, method(e), change(e, true), link(e.name, 'tests-source-' + e.id), h('small', { text: e.assessmentStale ? 'Source needs review' : e.resultStale ? 'Run belongs to an earlier endpoint' : e.result?.status || 'Not run / not recorded' })))),
          h('section', {}, h('h2', { text: 'Assessment scope' }), p(f.scope || data().scope || 'Only the listed scenarios have been assessed.'), p('A test run, a source assessment and a screenshot observation describe different evidence.')))));
  }
  function source(root, id) {
    const e = evidence(id), f = data().features.find(f => f.scenarios.some(s => s.evidence.includes(id)));
    if (!e) { root.append(h('h1', { text: 'Evidence not found' })); return; }
    root.append(link('← ' + (f?.title || 'Features'), f ? 'tests-' + f.id : 'tests', 'test-back'), method(e), ...(diff ? [h('span', {}, change(e, true))] : []), h('h1', { class: 'test-source-title', text: e.name }), ...(e.kind ? [h('div', { class: 'test-kicker', text: e.kind })] : []), p((e.file || 'No source file recorded') + (e.file ? ':' + e.line : '')), field('What it establishes', e.proves), field('Evidence limit', e.limits),
      field('Execution provenance', e.result?.fingerprint ? (e.resultStale ? 'Does not match this collected endpoint' : 'Recorded source fingerprint supplied') : 'Source fingerprint not recorded; do not attribute the result to this endpoint.'), field('Execution result', e.result ? `${e.result.status} · ${date(e.result.at)} · ${e.result.scope || 'result scope not recorded'}` : 'Not run / not recorded'), ...(e.result?.command ? [h('pre', { class: 'test-command' }, h('code', { text: e.result.command }))] : []),
      ...(e.integration === 'fallback' || e.method === 'scripted' ? [field('Fallback reason', e.fallbackReason)] : []), ...(e.assessmentStale ? [field('Needs review', 'Recorded source differs from the reviewed file.')] : []),
      ...(diff && window.APPEDIA_DIFF.files.some(f => f.path === e.file) ? [link('Open test file diff →', 'file-' + e.file)] : []), h('h2', { text: 'Recorded source' }),
      ...(e.source == null ? [p('Source has not been collected. No code snapshot is being inferred.')] : [h('pre', { class: 'test-source' }, ...e.source.split('\n').map((line, i) => h('span', { class: 'test-code-line' }, h('span', { class: 'test-line-number', 'aria-hidden': 'true', text: e.line + i }), h('code', { text: line || ' ' })))), p('Source SHA-256: ' + e.sha256)]),
      ...(diff ? [h('details', { class: 'test-base-source' }, h('summary', { text: 'Source at baseline' }), e.baseSource == null ? p('No corresponding baseline excerpt was collected.') : h('pre', { class: 'test-source' }, h('code', { text: e.baseSource }))), p('Test change basis: ' + e.changeBasis + '. Unchanged bodies can still depend on changed helpers or fixtures.')] : []));
  }
  function captureView(root, id) {
    const c = capture(id), f = data().features.find(f => f.scenarios.some(s => s.captures.includes(id)));
    if (!c) { root.append(h('h1', { text: 'Capture not found' })); return; }
    root.append(link('← ' + (f?.title || 'Features'), f ? 'tests-' + f.id : 'tests', 'test-back'), h('div', { class: 'test-kicker', text: 'UI evidence' }), h('h1', { text: c.title }), p(c.state), p(`${c.size ? c.size.join('×') + ' ' + (c.unit || 'pixels') : 'Dimensions not recorded'} · ${date(c.at)} · ${c.environment || 'Environment not recorded'}`),
      h('div', { class: 'test-capture-assessment' }, h('section', {}, field('Automated assertions', c.assertions || 'No automated image assertion recorded.')), h('section', {}, field('Visual observation', c.observation), field('Observation limit', c.limits))),
      ...(c.image ? [h('a', { href: c.image, target: '_blank', rel: 'noopener', class: 'test-full-capture' }, h('img', { src: c.image, alt: c.state }))] : [p('Image not collected.')]),
      ...(c.command ? [field('Reproduction command', c.command)] : []), ...((c.evidence || []).map(id => link(evidence(id).name, 'tests-source-' + id))), p('A retained screenshot alone is not a visual regression baseline or proof of the full journey.'));
  }
  function coverage(root) {
    const cov = data().coverage, head = cov.head, base = cov.base;
    const percent = row => row?.statements ? 100 * row.covered / row.statements : null;
    const format = value => value == null ? 'Not collected' : value.toFixed(1) + '%';
    const total = side => side?.eligible ? side.packages.reduce((a, r) => ({ covered: a.covered + r.covered, statements: a.statements + r.statements }), { covered: 0, statements: 0 }) : null;
    root.append(h('div', { class: 'test-kicker', text: 'Technical view · statement coverage' }), h('h1', { text: diff ? 'Code coverage of the change' : 'Code coverage' }), p('Measurements describe statements exercised by a recorded run. Use Features to assess the behaviors and UI states that tests establish.'),
      h('div', { class: 'test-coverage-summary' }, ...(diff ? [h('div', {}, h('strong', { text: format(percent(total(base))) }), h('span', { text: 'Base' }))] : []), h('div', {}, h('strong', { text: format(percent(total(head))) }), h('span', { text: diff ? 'Head' : 'Recorded statement coverage' })), ...(!diff ? [h('div', {}, h('strong', { text: (head?.eligible ? head.packages.filter(r => r.statements > 0).length : 0) + ' / ' + new Set([...Object.values(M.packages).map(p => p.importPath || (M.module + '/' + p.path).replace(/\/\.$/, '')), ...(head?.packages || []).map(r => r.path)]).size }), h('span', { text: 'Packages with statement measurements' }))] : []), h('div', {}, h('strong', { text: diff ? cov.comparable && percent(total(head)) != null && percent(total(base)) != null ? (percent(total(head)) - percent(total(base))).toFixed(1) + ' pp' : 'Unavailable' : ({passed:'Passed',failed:'Failed'})[head?.result] || head?.result || 'Not recorded' }), h('span', { text: diff ? 'Delta · comparable profiles only' : 'Test run result' }))),
      ...['base', 'head'].flatMap(side => { const c = cov[side]; return c ? [h('div', { class: 'test-coverage-scope' }, h('strong', { text: side + ' · ' + date(c.collectedAt) + ' · ' + (c.result || 'Result not recorded') }), p(c.scope), h('code', { text: c.command }), h('div', { class: 'test-coverage-downloads' }, h('a', { href: 'data/test-evidence.json', text: 'Evidence and coverage metadata ↗' }), c.profile ? h('a', { href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(c.profile), download: side + '-coverage.out', text: 'Download recorded profile ↗' }) : null), p(c.toolchain || 'Toolchain not recorded'), p(c.eligible ? 'Profile fingerprint matches this collected endpoint. Totals are weighted by statement counts.' : c.reason), c.result === 'failed' ? p('Failed run: available measurements may be incomplete; no delta is inferred.') : null)] : []; }));
    if (!head && !base) root.append(h('div', { class: 'test-empty' }, p('No coverage profiles were collected. Missing measurements are distinct from a measured 0%.')));
    const packages = new Map();
    for (const p of Object.values(M.packages)) {
      if (diff && !p.ch && !diff.files.some(f => p.path === '.' ? !f.path.includes('/') : f.path.startsWith(p.path + '/'))) continue;
      packages.set(p.importPath || (M.module + '/' + p.path).replace(/\/\.$/, ''), { title: p.path, route: 'pkg-' + p.id });
    }
    if (!diff) for (const r of head?.packages || []) if (!packages.has(r.path)) packages.set(r.path, { title: r.path });
    const get = (side, path) => side?.eligible ? side.packages.find(r => r.path === path) : null;
    const tbody = h('tbody'), status = h('p', { class: 'test-help', role: 'status' });
    const input = h('input', { type: 'search', id: 'test-package-search', value: state.packageQuery, placeholder: 'Search packages…', oninput: () => { state.packageQuery = input.value; draw(); } });
    const sort = h('select', { 'aria-label': 'Sort packages', onchange: () => { state.packageSort = sort.value; draw(); } }, ...[['coverage-asc', 'Lowest coverage first'], ['coverage-desc', 'Highest coverage first'], ['name', 'Package name']].map(([value, text]) => h('option', { value, text }))); sort.value = state.packageSort;
    function draw() {
      const rows = [...packages].filter(([path, p]) => match(path + ' ' + p.title, input.value)).sort(([a], [b]) => { const x = percent(get(head, a)), y = percent(get(head, b)); return sort.value === 'name' ? a.localeCompare(b) : x == null || y == null ? (x == null) - (y == null) || a.localeCompare(b) : (sort.value === 'coverage-desc' ? y - x : x - y) || a.localeCompare(b); });
      status.textContent = `${rows.length} of ${packages.size} ${diff ? 'changed ' : ''}packages.`;
      tbody.replaceChildren(...rows.map(([path, p]) => { const a = get(base, path), b = get(head, path); return h('tr', { 'data-package': path }, h('th', { scope: 'row' }, p.route ? link(p.title === '.' ? '(root) ↗' : p.title + ' ↗', p.route) : p.title), ...(diff ? [h('td', { text: a?.statements === 0 ? 'No statements' : format(percent(a)) })] : []), h('td', { class: 'test-coverage-value', text: b?.statements === 0 ? 'No statements' : format(percent(b)) }), h('td', { text: diff ? cov.comparable && percent(a) != null && percent(b) != null ? (percent(b) - percent(a)).toFixed(1) + ' pp' : 'Unavailable' : b ? b.covered + ' / ' + b.statements : '—' })); }));
      if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: diff ? '4' : '3', text: 'No packages match.' })));
    }
    draw(); root.append(h('div', { class: 'test-section-head' }, h('h2', { text: diff ? 'Changed packages' : 'Packages' })), h('label', { for: 'test-package-search', class: 'test-search-label', text: 'Search packages' }), h('div', { class: 'test-search-controls' }, input, sort), status, h('div', { class: 'test-coverage-scroll' }, h('table', { class: 'test-coverage-table' }, h('caption', { text: 'Statement coverage by package · not functional coverage' }), h('thead', {}, h('tr', {}, ...(diff ? ['Package', 'Base', 'Head', 'Delta'] : ['Package', 'Statement coverage', 'Exercised / total']).map(text => h('th', { scope: 'col', text })))), tbody)));
  }
  function flowPanel(flowId, view = 'head') {
    const header = document.querySelector('#flowmain .flowhead'); if (!header) return;
    const previous = header.querySelector('.test-flow-assessment');
    if (previous?.dataset.flow === flowId && previous.dataset.view === view) return;
    previous?.remove();
    const related = data().features.flatMap(f => f.scenarios.filter(s => s.flows.includes(flowId)).map(s => ({ f, s })));
    const panel = h('details', { class: 'test-flow-assessment', 'data-flow': flowId, 'data-view': view });
    const n = counts(related.map(r => r.s));
    panel.append(h('summary', {}, h('strong', { text: 'Tests and gaps' }), h('span', { class: 'test-flow-count', text: related.length ? related.length + ' related scenarios' : 'No assessment linked' }), ...Object.entries(n).filter(([, count]) => count).map(([status, count]) => h('span', { class: 'test-pill ' + status, text: count + ' ' + labels[status] }))),
      h('div', { class: 'test-flow-assessment-body' }, p(!related.length ? 'No assessment is linked here. This does not mean the flow is untested.' : view === 'before' ? 'These scenario assessments describe the reviewed head. Baseline scenario coverage has not been established by switching the diagram to Before.' : 'Scenario evidence is not a coverage score for this entire flow.'),
        ...data().features.filter(f => related.some(r => r.f.id === f.id)).map(f => h('section', {}, h('h3', {}, link(f.title, 'tests-' + f.id)), ...related.filter(r => r.f.id === f.id).map(({ s }) => h('div', { class: 'test-flow-scenario' }, link(s.title, 'tests-' + f.id + '/' + s.id), pill(s.status), change(s))))), !related.length ? link('Browse assessed features →', 'tests') : null));
    header.append(panel);
  }
  function fitViewport() { const root = document.querySelector('#mode-tests'); if (root?.classList.contains('on')) root.style.maxHeight = Math.max(200, window.innerHeight - (document.querySelector('.top')?.offsetHeight || 54)) + 'px'; }
  window.addEventListener('resize', fitViewport);
  function render(route) {
    const root = h('div', { class: 'test-page' });
    root.append(h('nav', { class: 'test-subtabs', 'aria-label': 'Tests views' }, link('Features', 'tests'), link('Code coverage', 'tests-coverage')));
    root.querySelectorAll('.test-subtabs a').forEach(a => a.setAttribute('aria-current', (a.hash === '#tests-coverage') === (route === 'tests-coverage') ? 'page' : 'false'));
    if (diff) root.append(h('div', { class: 'test-review-range', text: `Review: ${diff.base} → ${diff.head}` }));
    let focused = null;
    if (route === 'tests' || route === 'tests-features') overview(root);
    else if (route === 'tests-coverage') coverage(root);
    else if (route.startsWith('tests-source-')) source(root, route.slice(13));
    else if (route.startsWith('tests-capture-')) captureView(root, route.slice(14));
    else { const [id, scenario] = route.slice(6).split('/'), f = data().features.find(f => f.id === id); if (f) { detail(root, f); focused = scenario; } else root.append(h('h1', { text: 'Feature not found' }), link('All features', 'tests')); }
    const viewport = document.querySelector('#mode-tests'); viewport.replaceChildren(root); fitViewport(); viewport.scrollTop = 0;
    if (focused) { const row = document.getElementById('scenario-' + focused); if (row) { row.open = true; requestAnimationFrame(() => { if (!row.isConnected) return; viewport.scrollTo({ top: row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 16 }); row.querySelector('summary').focus({ preventScroll: true }); }); } }
  }
  const searchEntries = () => [{ kind: 'page', title: 'Tests · Features', sub: 'Functional evidence and gaps', route: 'tests', hay: 'tests features scenarios evidence gaps', w: 3 }, { kind: 'page', title: 'Tests · Code coverage', sub: 'Statement coverage by package', route: 'tests-coverage', hay: 'tests code coverage packages statements', w: 3 }, ...data().features.flatMap(f => [{ kind: 'feature', title: f.title, sub: f.summary, route: 'tests-' + f.id, hay: (f.title + ' ' + f.summary).toLowerCase(), w: 4 }, ...f.scenarios.map(s => ({ kind: 'scenario', title: s.title, sub: f.title, route: 'tests-' + f.id + '/' + s.id, hay: (s.title + ' ' + s.summary + ' ' + f.title).toLowerCase(), w: 2 }))])];
  window.APPEDIA_TEST_UI = { render, flowPanel, searchEntries };
})();
