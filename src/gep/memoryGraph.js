const fs = require('fs');
const path = require('path');
const { getMemoryDir } = require('./paths');

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
}

function stableHash(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function nowIso() {
  return new Date().toISOString();
}

function computeSignalKey(signals) {
  const list = Array.isArray(signals) ? signals.map(String) : [];
  const uniq = Array.from(new Set(list.filter(Boolean))).sort();
  return uniq.join('|') || '(none)';
}

function memoryGraphPath() {
  const memoryDir = getMemoryDir();
  return process.env.MEMORY_GRAPH_PATH || path.join(memoryDir, 'memory_graph.jsonl');
}

function memoryGraphStatePath() {
  const memoryDir = getMemoryDir();
  return path.join(memoryDir, 'memory_graph_state.json');
}

function appendJsonl(filePath, obj) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function tryReadMemoryGraphEvents(limitLines = 2000) {
  try {
    const p = memoryGraphPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const recent = lines.slice(Math.max(0, lines.length - limitLines));
    return recent
      .map(l => {
        try {
          return JSON.parse(l);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function jaccard(aList, bList) {
  const a = new Set((Array.isArray(aList) ? aList : []).map(String));
  const b = new Set((Array.isArray(bList) ? bList : []).map(String));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function decayWeight(updatedAtIso, halfLifeDays) {
  const hl = Number(halfLifeDays);
  if (!Number.isFinite(hl) || hl <= 0) return 1;
  const t = Date.parse(updatedAtIso);
  if (!Number.isFinite(t)) return 1;
  const ageDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  // Exponential half-life decay: weight = 0.5^(age/hl)
  return Math.pow(0.5, ageDays / hl);
}

function aggregateEdges(events) {
  // Aggregate by (signal_key, gene_id) from outcome events.
  // Laplace smoothing to avoid 0/1 extremes.
  const map = new Map();
  for (const ev of events) {
    if (!ev || ev.type !== 'MemoryGraphEvent') continue;
    if (ev.kind !== 'outcome') continue;
    const signalKey = ev.signal && ev.signal.key ? String(ev.signal.key) : '(none)';
    const geneId = ev.gene && ev.gene.id ? String(ev.gene.id) : null;
    if (!geneId) continue;

    const k = `${signalKey}::${geneId}`;
    const cur = map.get(k) || { signalKey, geneId, success: 0, fail: 0, last_ts: null, last_score: null };
    const status = ev.outcome && ev.outcome.status ? String(ev.outcome.status) : 'unknown';
    if (status === 'success') cur.success += 1;
    else if (status === 'failed') cur.fail += 1;

    const ts = ev.ts || ev.created_at || ev.at;
    if (ts && (!cur.last_ts || Date.parse(ts) > Date.parse(cur.last_ts))) {
      cur.last_ts = ts;
      cur.last_score =
        ev.outcome && Number.isFinite(Number(ev.outcome.score)) ? Number(ev.outcome.score) : cur.last_score;
    }
    map.set(k, cur);
  }
  return map;
}

function edgeExpectedSuccess(edge, opts) {
  const e = edge || { success: 0, fail: 0, last_ts: null };
  const succ = Number(e.success) || 0;
  const fail = Number(e.fail) || 0;
  const total = succ + fail;
  const p = (succ + 1) / (total + 2); // Laplace smoothing
  const halfLifeDays = opts && Number.isFinite(Number(opts.half_life_days)) ? Number(opts.half_life_days) : 30;
  const w = decayWeight(e.last_ts || '', halfLifeDays);
  return { p, w, total, value: p * w };
}

function getMemoryAdvice({ signals, genes, driftEnabled }) {
  const events = tryReadMemoryGraphEvents(2000);
  const edges = aggregateEdges(events);
  const curSignals = Array.isArray(signals) ? signals : [];
  const curKey = computeSignalKey(curSignals);

  const bannedGeneIds = new Set();
  const scoredGeneIds = [];

  // Similarity: consider exact key first, then any key with overlap.
  const seenKeys = new Set();
  const candidateKeys = [];
  candidateKeys.push({ key: curKey, sim: 1 });
  seenKeys.add(curKey);

  for (const ev of events) {
    if (!ev || ev.type !== 'MemoryGraphEvent') continue;
    const k = ev.signal && ev.signal.key ? String(ev.signal.key) : '(none)';
    if (seenKeys.has(k)) continue;
    const sigs = ev.signal && Array.isArray(ev.signal.signals) ? ev.signal.signals : [];
    const sim = jaccard(curSignals, sigs);
    if (sim >= 0.34) {
      candidateKeys.push({ key: k, sim });
      seenKeys.add(k);
    }
  }

  const byGene = new Map();
  for (const ck of candidateKeys) {
    for (const g of Array.isArray(genes) ? genes : []) {
      if (!g || g.type !== 'Gene' || !g.id) continue;
      const k = `${ck.key}::${g.id}`;
      const edge = edges.get(k);
      if (!edge) continue;
      const ex = edgeExpectedSuccess(edge, { half_life_days: 30 });
      const weighted = ex.value * ck.sim;
      const cur = byGene.get(g.id) || { geneId: g.id, best: 0, attempts: 0, last_ts: null };
      if (weighted > cur.best) cur.best = weighted;
      cur.attempts = Math.max(cur.attempts, ex.total);
      cur.last_ts = edge.last_ts || cur.last_ts;
      byGene.set(g.id, cur);
    }
  }

  for (const [geneId, info] of byGene.entries()) {
    scoredGeneIds.push({ geneId, score: info.best, attempts: info.attempts });
    // Low-efficiency path suppression (unless drift is explicit).
    if (!driftEnabled && info.attempts >= 2 && info.best < 0.18) {
      bannedGeneIds.add(geneId);
    }
  }

  scoredGeneIds.sort((a, b) => b.score - a.score);
  const preferredGeneId = scoredGeneIds.length ? scoredGeneIds[0].geneId : null;

  const explanation = [];
  if (preferredGeneId) explanation.push(`memory_prefer:${preferredGeneId}`);
  if (bannedGeneIds.size) explanation.push(`memory_ban:${Array.from(bannedGeneIds).slice(0, 6).join(',')}`);
  if (driftEnabled) explanation.push('random_drift:enabled');

  return {
    currentSignalKey: curKey,
    preferredGeneId,
    bannedGeneIds,
    explanation,
  };
}

function hasErrorSignal(signals) {
  const list = Array.isArray(signals) ? signals : [];
  return list.includes('log_error');
}

function recordAttempt({ signals, selectedGene, selector, driftEnabled, selectedBy }) {
  const signalKey = computeSignalKey(signals);
  const geneId = selectedGene && selectedGene.id ? String(selectedGene.id) : null;
  const geneCategory = selectedGene && selectedGene.category ? String(selectedGene.category) : null;
  const ts = nowIso();
  const actionId = `act_${Date.now()}_${stableHash(`${signalKey}|${geneId || 'none'}|${ts}`)}`;
  const ev = {
    type: 'MemoryGraphEvent',
    kind: 'attempt',
    id: `mge_${Date.now()}_${stableHash(actionId)}`,
    ts,
    signal: { key: signalKey, signals: Array.isArray(signals) ? signals : [] },
    gene: { id: geneId, category: geneCategory },
    action: {
      id: actionId,
      drift: !!driftEnabled,
      selected_by: selectedBy || 'selector',
      selector: selector || null,
    },
  };

  appendJsonl(memoryGraphPath(), ev);

  // State is mutable; graph is append-only.
  const statePath = memoryGraphStatePath();
  const state = readJsonIfExists(statePath, { last_action: null });
  state.last_action = {
    action_id: actionId,
    signal_key: signalKey,
    signals: Array.isArray(signals) ? signals : [],
    gene_id: geneId,
    gene_category: geneCategory,
    had_error: hasErrorSignal(signals),
    created_at: ts,
    outcome_recorded: false,
  };
  writeJsonAtomic(statePath, state);

  return { actionId, signalKey };
}

function inferOutcomeFromSignals({ prevHadError, currentHasError }) {
  if (prevHadError && !currentHasError) return { status: 'success', score: 0.85, note: 'error_cleared' };
  if (prevHadError && currentHasError) return { status: 'failed', score: 0.2, note: 'error_persisted' };
  if (!prevHadError && currentHasError) return { status: 'failed', score: 0.15, note: 'new_error_appeared' };
  return { status: 'success', score: 0.6, note: 'stable_no_error' };
}

function recordOutcomeFromState({ signals }) {
  const statePath = memoryGraphStatePath();
  const state = readJsonIfExists(statePath, { last_action: null });
  const last = state && state.last_action ? state.last_action : null;
  if (!last || !last.action_id) return null;
  if (last.outcome_recorded) return null;

  const currentHasError = hasErrorSignal(signals);
  const inferred = inferOutcomeFromSignals({ prevHadError: !!last.had_error, currentHasError });
  const ts = nowIso();
  const ev = {
    type: 'MemoryGraphEvent',
    kind: 'outcome',
    id: `mge_${Date.now()}_${stableHash(`${last.action_id}|outcome|${ts}`)}`,
    ts,
    signal: { key: String(last.signal_key || '(none)'), signals: Array.isArray(last.signals) ? last.signals : [] },
    gene: { id: last.gene_id || null, category: last.gene_category || null },
    action: { id: String(last.action_id) },
    outcome: {
      status: inferred.status,
      score: inferred.score,
      note: inferred.note,
      observed: { current_signals: Array.isArray(signals) ? signals : [] },
    },
    confidence: {
      // This is an interpretable, decayed success estimate derived from outcomes; aggregation is computed at read-time.
      half_life_days: 30,
    },
  };

  appendJsonl(memoryGraphPath(), ev);

  last.outcome_recorded = true;
  last.outcome_recorded_at = ts;
  state.last_action = last;
  writeJsonAtomic(statePath, state);

  return ev;
}

module.exports = {
  memoryGraphPath,
  computeSignalKey,
  tryReadMemoryGraphEvents,
  getMemoryAdvice,
  recordAttempt,
  recordOutcomeFromState,
};

