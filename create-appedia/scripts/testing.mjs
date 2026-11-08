// Shared test assessment validation and evidence packing. Never executes project code.
import { createHash } from 'node:crypto';
const hash = s => createHash('sha256').update(s).digest('hex');
const own = (o, k) => o != null && Object.hasOwn(o, k);
const pathOK = p => typeof p === 'string' && !!p && !/[\\:\x00]/.test(p) && !p.startsWith('/') && !p.split('/').some(x => x === '..' || x === '.');
const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_~-]+$/.test(id);
const list = (v, where, errors) => { if (v === undefined) return []; if (!Array.isArray(v)) { errors.push(`${where}: expected an array`); return []; } return v; };
const text = v => typeof v === 'string' && !!v.trim();
const statuses = new Set(['tested', 'partial', 'not-found', 'unassessed']);
const methods = new Set(['automated', 'scripted', 'manual']);
const changes = new Set(['added', 'changed', 'removed', 'unchanged', 'unknown']);
const fileAt = (side, file) => own(side?.files, file) ? side.files[file] : null;
function excerpt(file, location, where, errors) {
  if (!file || typeof file.source !== 'string') return null;
  const lines = file.source.split('\n');
  const start = location.line ?? 1, end = location.endLine ?? lines.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) { errors.push(`${where}: source line range is outside the recorded file`); return null; }
  return { source: lines.slice(start - 1, end).join('\n'), line: start, endLine: end, sha256: file.sha256 };
}
export function prepareTesting(authored, snapshot, { flows = {}, packages = {}, refs = () => true, isDiff = false, baseRevision, headRevision, fingerprints = {} } = {}) {
  const errors = [], warnings = [];
  const data = authored || {};
  if (authored != null && (typeof authored !== 'object' || Array.isArray(authored))) errors.push('tests: expected an object');
  if (snapshot && snapshot.version !== 1) errors.push('test evidence: unsupported snapshot version');
  for (const side of ['base', 'head']) if (snapshot?.[side]) {
    const files = snapshot[side].files;
    if (!files || typeof files !== 'object' || Array.isArray(files)) { errors.push(`test evidence ${side}: files object required`); continue; }
    for (const [file, value] of Object.entries(files)) {
      if (!pathOK(file) || !value || !/^[a-f0-9]{64}$/.test(value.sha256 || '')) errors.push(`test evidence ${side}: invalid file ${file}`);
      if (value?.image) {
        const encoded = String(value.image).split(',')[1] || '';
        if (hash(Buffer.from(encoded, 'base64')) !== value.sha256) errors.push(`test evidence ${side}: image hash mismatch for ${file}`);
      }
      if (typeof value?.source === 'string' && hash(value.source) !== value.sha256) errors.push(`test evidence ${side}: source hash mismatch for ${file}`);
    }
  }
  function ids(items, where) {
    const seen = new Set();
    for (const v of items) { if (!v || !idOK(v.id) || seen.has(v.id)) errors.push(`${where}: invalid or duplicate id ${v?.id}`); seen.add(v?.id); }
  }
  const rawEvidence = list(data.evidence, 'tests.evidence', errors), rawFeatures = list(data.features, 'tests.features', errors), rawCaptures = list(data.captures, 'tests.captures', errors);
  ids(rawEvidence, 'tests.evidence'); ids(rawFeatures, 'tests.features'); ids(rawCaptures, 'tests.captures');
  const head = snapshot?.head, base = snapshot?.base;
  const evidence = rawEvidence.filter(Boolean).map(e => {
    if (!text(e.name) || !methods.has(e.method) || !text(e.proves) || !text(e.limits)) errors.push(`evidence ${e.id}: name, method, proves and limits required`);
    if (e.file !== undefined && !pathOK(e.file)) errors.push(`evidence ${e.id}: invalid repository-relative file`);
    if (e.integration !== undefined && !['project', 'fallback'].includes(e.integration)) errors.push(`evidence ${e.id}: invalid integration`);
    if ((e.integration === 'fallback' || e.method === 'scripted') && !text(e.fallbackReason)) errors.push(`evidence ${e.id}: fallbackReason required for ad hoc or fallback checks`);
    if (e.result && (!['passed', 'failed', 'not-run', 'reported', 'unknown'].includes(e.result.status) || (e.result.status === 'passed' && (!text(e.result.command) || !text(e.result.at))))) errors.push(`evidence ${e.id}: result requires a valid status; passed needs command and date`);
    const now = fileAt(head, e.file), before = fileAt(base, e.base?.file || e.file);
    if (e.base?.file && !pathOK(e.base.file)) errors.push(`evidence ${e.id}: invalid base file`);
    if (head && e.file && !now && !(isDiff && before)) errors.push(`evidence ${e.id}: file not present in collected evidence: ${e.file}`);
    const current = excerpt(now, e, `evidence ${e.id}`, errors);
    const previous = excerpt(before, e.base || {}, `evidence ${e.id} base`, errors);
    let change = 'unknown', changeBasis = 'unverified';
    if (base && head && e.file) {
      if (!before && now) { change = 'added'; changeBasis = 'file'; }
      else if (before && !now) { change = 'removed'; changeBasis = 'file'; }
      else if (current && previous && e.base) { change = current.source === previous.source ? 'unchanged' : 'changed'; changeBasis = 'body'; }
      else if (now && before && now.sha256 === before.sha256) { change = 'unchanged'; changeBasis = 'file'; }
    }
    if (e.change !== undefined && (!changes.has(e.change) || (e.change !== 'unknown' && e.change !== change))) errors.push(`evidence ${e.id}: test change ${e.change} is not supported by the collected sources; provide base/current line ranges`);
    const resultRevisionMismatch = !!(e.result?.revision && head?.revision && e.result.revision !== head.revision);
    const assessmentStale = !!(e.reviewedHash && now && e.reviewedHash !== now.sha256);
    const resultStale = !!(resultRevisionMismatch || (e.result?.fingerprint && head && e.result.fingerprint !== head.fingerprint));
    const stale = assessmentStale || resultStale;
    if (assessmentStale) warnings.push(`evidence ${e.id} source changed since review; linked scenarios need reassessment`);
    if (resultStale) warnings.push(`evidence ${e.id} execution is from a different endpoint; source relevance remains a separate assessment`);
    if (e.method === 'automated' && !e.file) errors.push(`evidence ${e.id}: automated tests require a source file`);
    return { ...e, source: current?.source ?? previous?.source ?? null, line: current?.line ?? previous?.line ?? e.line ?? 1, sha256: now?.sha256 ?? before?.sha256 ?? null, baseSource: previous?.source ?? null, change, changeBasis, stale, assessmentStale, resultStale };
  });
  const evidenceById = new Map(evidence.map(e => [e.id, e]));
  const captures = rawCaptures.filter(Boolean).map(c => {
    if (!text(c.title) || !text(c.state) || !pathOK(c.file) || !text(c.observation) || !text(c.limits)) errors.push(`capture ${c.id}: title, state, file, observation and limits required`);
    const file = fileAt(head, c.file) || fileAt(base, c.file);
    if (snapshot && !file?.image) errors.push(`capture ${c.id}: image not collected: ${c.file}`);
    const image = file?.image;
    if (image && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image)) errors.push(`capture ${c.id}: unsupported embedded image`);
    if (c.size !== undefined && (!Array.isArray(c.size) || c.size.length !== 2 || !c.size.every(v => Number.isInteger(v) && v > 0))) errors.push(`capture ${c.id}: size must contain two positive integers`);
    for (const id of list(c.evidence, `capture ${c.id}.evidence`, errors)) if (!evidenceById.has(id)) errors.push(`capture ${c.id}: unknown evidence ${id}`);
    return { ...c, image: image || null };
  });
  const captureIds = new Set(captures.map(c => c.id));
  const features = rawFeatures.filter(Boolean).map(f => {
    if (!text(f.title) || !text(f.summary)) errors.push(`feature ${f.id}: title and summary required`);
    if (f.change !== undefined && !changes.has(f.change)) errors.push(`feature ${f.id}: invalid change`);
    const scenarios = list(f.scenarios, `feature ${f.id}.scenarios`, errors); ids(scenarios, `feature ${f.id}.scenarios`);
    const packed = scenarios.filter(Boolean).map(s => {
      if (!text(s.title) || !text(s.summary) || !statuses.has(s.status) || !['behavior', 'layout', 'interaction'].includes(s.dimension)) errors.push(`scenario ${f.id}/${s.id}: title, summary, status and dimension required`);
      if (s.change !== undefined && !changes.has(s.change)) errors.push(`scenario ${f.id}/${s.id}: invalid change`);
      if (s.status !== 'unassessed' && !text(s.limit)) errors.push(`scenario ${f.id}/${s.id}: evidence limit required`);
      const evidenceIds = list(s.evidence, `scenario ${f.id}/${s.id}.evidence`, errors);
      if (['tested', 'partial'].includes(s.status) && !evidenceIds.length) errors.push(`scenario ${f.id}/${s.id}: supported assessment requires evidence`);
      for (const id of evidenceIds) if (!evidenceById.has(id)) errors.push(`scenario ${f.id}/${s.id}: unknown evidence ${id}`);
      const flowIds = list(s.flows, `scenario ${f.id}/${s.id}.flows`, errors);
      for (const id of flowIds) if (!own(flows, id)) errors.push(`scenario ${f.id}/${s.id}: unknown flow ${id}`);
      for (const id of list(s.captures, `scenario ${f.id}/${s.id}.captures`, errors)) if (!captureIds.has(id)) errors.push(`scenario ${f.id}/${s.id}: unknown capture ${id}`);
      for (const ref of s.sources?.refs || []) if (!refs(ref)) errors.push(`scenario ${f.id}/${s.id}: unknown reference ${ref}`);
      for (const file of s.sources?.files || []) if (!pathOK(file)) errors.push(`scenario ${f.id}/${s.id}: invalid source file`);
      if (s.suggestion && (!text(s.reason) || !['First', 'Next', 'Later'].includes(s.priority))) errors.push(`scenario ${f.id}/${s.id}: suggested tests require priority and reason`);
      if (s.status === 'tested' && s.change !== 'removed' && evidenceIds.length && evidenceIds.every(id => evidenceById.get(id)?.change === 'removed')) errors.push(`scenario ${f.id}/${s.id}: removed tests alone cannot support reviewed-head behavior`);
      const stale = evidenceIds.some(id => evidenceById.get(id)?.assessmentStale) || f.needsReview === true;
      return { ...s, flows: flowIds, evidence: evidenceIds, captures: s.captures || [], assessedStatus: s.status, status: stale ? 'unassessed' : s.status, stale };
    });
    for (const ref of f.sources?.refs || []) if (!refs(ref)) errors.push(`feature ${f.id}: unknown reference ${ref}`);
    for (const file of f.sources?.files || []) if (!pathOK(file)) errors.push(`feature ${f.id}: invalid source file`);
    return { ...f, scenarios: packed, flows: [...new Set(packed.flatMap(s => s.flows))] };
  });
  const coverage = {};
  for (const side of ['base', 'head']) {
    const c = snapshot?.coverage?.[side]; if (!c) continue;
    if (!text(c.command) || !text(c.collectedAt) || !text(c.scope) || c.metric !== 'statements' || !Array.isArray(c.packages)) { errors.push(`coverage ${side}: command, date, scope, statements metric and packages required`); continue; }
    const seen = new Set();
    for (const row of c.packages) {
      if (!row || !text(row.path) || seen.has(row.path) || !Number.isInteger(row.statements) || !Number.isInteger(row.covered) || row.covered < 0 || row.statements < row.covered) errors.push(`coverage ${side}: invalid or duplicate statement counts`);
      if (row) seen.add(row.path);
    }
    const expected = side === 'base' ? baseRevision : headRevision;
    const revisionKey = value => value === 'working tree' ? 'WORKTREE' : value;
    const endpointMatches = !!snapshot?.[side]?.revision && revisionKey(c.revision) === revisionKey(snapshot[side].revision);
    const revMatches = !expected || c.revision === expected || (side === 'head' && expected === 'working tree' && c.revision === 'WORKTREE');
    const modelMatches = !!fingerprints[side] && fingerprints[side] === snapshot?.[side]?.fingerprint;
    const eligible = !!(modelMatches && endpointMatches && snapshot?.[side]?.fingerprint && c.fingerprint === snapshot[side].fingerprint && revMatches);
    coverage[side] = { ...c, eligible, reason: eligible ? '' : 'Profile provenance is not bound to this model endpoint. Recollect through prepare/appediff, or supply matching extraction provenance; no percentage or delta is inferred.' };
  }
  const sameEnvironment = coverage.base?.environment && coverage.head?.environment && JSON.stringify(Object.entries(coverage.base.environment).sort()) === JSON.stringify(Object.entries(coverage.head.environment).sort());
  const comparable = !!(sameEnvironment && coverage.base?.toolchain && coverage.base.toolchain === coverage.head?.toolchain && coverage.base?.eligible && coverage.head?.eligible && coverage.base.metric === coverage.head.metric && coverage.base.mode === coverage.head.mode && coverage.base.scope === coverage.head.scope && coverage.base.result === 'passed' && coverage.head.result === 'passed');
  return { data: { version: 1, scope: data.scope || '', features, evidence, captures, coverage: { ...coverage, comparable }, collectedAt: snapshot?.collectedAt || null, endpoints: { base: base?.revision || null, head: head?.revision || null } }, errors, warnings };
}

// Seed relevant features without throwing away unchanged tests. All assessments remain drafts.
export function seedTesting(testing, flows, changedFiles = [], changedRefs = []) {
  if (!testing) return undefined;
  const touched = new Set(changedFiles);
  const evidence = new Map((testing.evidence || []).map(e => [e.id, e]));
  const features = (testing.features || []).filter(f => (f.scenarios || []).some(s => [...(f.sources?.refs || []), ...(s.sources?.refs || [])].some(ref => changedRefs.some(ch => ch === ref || ch.startsWith(ref + '.'))) || (s.flows || []).some(id => own(flows, id)) || [...(f.sources?.files || []), ...(s.sources?.files || []), ...(s.evidence || []).map(id => evidence.get(id)?.file)].some(file => touched.has(file))));
  const evidenceIds = new Set(features.flatMap(f => (f.scenarios || []).flatMap(s => s.evidence || [])));
  const captures = new Set(features.flatMap(f => (f.scenarios || []).flatMap(s => s.captures || [])));
  for (const capture of testing.captures || []) if (captures.has(capture.id)) for (const id of capture.evidence || []) evidenceIds.add(id);
  return { ...testing, features: features.map(f => ({ ...f, needsReview: true, scenarios: (f.scenarios || []).map(s => ({ ...s, previousStatus: s.status, status: 'unassessed' })) })), evidence: (testing.evidence || []).filter(e => evidenceIds.has(e.id)), captures: (testing.captures || []).filter(c => captures.has(c.id)) };
}
