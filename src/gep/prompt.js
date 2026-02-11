const { captureEnvFingerprint } = require('./envFingerprint');

/**
 * Build a minimal prompt for direct-reuse mode.
 * Instead of full GEP reasoning, instructs the Hand to apply a known verified solution.
 */
function buildReusePrompt({ capsule, signals, nowIso }) {
  const payload = capsule.payload || capsule;
  const summary = payload.summary || capsule.summary || '(no summary)';
  const gene = payload.gene || capsule.gene || '(unknown)';
  const confidence = payload.confidence || capsule.confidence || 0;
  const assetId = capsule.asset_id || '(unknown)';
  const sourceNode = capsule.source_node_id || '(unknown)';
  const trigger = Array.isArray(payload.trigger || capsule.trigger_text)
    ? (payload.trigger || String(capsule.trigger_text || '').split(',')).join(', ')
    : '';

  return `
GEP -- REUSE MODE (Search-First) [${nowIso || new Date().toISOString()}]

You are applying a VERIFIED solution from the EvoMap Hub.
This capsule was published, reviewed, and promoted by the network.

Source asset: ${assetId}
Source node: ${sourceNode}
Confidence: ${confidence}
Gene: ${gene}
Trigger signals: ${trigger}

Summary:
${summary}

Your signals: ${JSON.stringify(signals || [])}

Instructions:
1. Read the capsule details below and understand the fix.
2. Apply the fix to the local codebase, adapting paths and names as needed.
3. Run validation to confirm the fix works in this environment.
4. If validation passes, run: node index.js solidify
5. If it fails, ROLLBACK and report the failure.

Capsule payload:
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

IMPORTANT: This is a reuse. Do NOT reinvent the solution. Apply it faithfully.
After solidify, the source_type will be recorded as "reused".
`.trim();
}

/**
 * Build a Hub Matched Solution block to inject into the standard GEP prompt.
 * Used in "reference" reuse mode -- the Brain sees this as a strong hint
 * but can still adapt or override if local context requires it.
 */
function buildHubMatchedBlock({ capsule }) {
  const payload = capsule.payload || capsule;
  const summary = payload.summary || capsule.summary || '(no summary)';
  const gene = payload.gene || capsule.gene || '(unknown)';
  const confidence = payload.confidence || capsule.confidence || 0;
  const assetId = capsule.asset_id || '(unknown)';
  const sourceNode = capsule.source_node_id || '(unknown)';

  return `
Hub Matched Solution (STRONG REFERENCE -- prefer this over inventing from scratch):
- Asset: ${assetId}
- Node: ${sourceNode}
- Confidence: ${confidence}
- Gene: ${gene}
- Summary: ${summary}
- Payload:
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
If this solution applies to your current signals, USE IT as your primary approach.
Adapt file paths and variable names to the local codebase, but preserve the core logic.
`.trim();
}

function buildGepPrompt({
  nowIso,
  context,
  signals,
  selector,
  parentEventId,
  selectedGene,
  capsuleCandidates,
  genesPreview,
  capsulesPreview,
  capabilityCandidatesPreview,
  externalCandidatesPreview,
  hubMatchedBlock,
}) {
  const parentValue = parentEventId ? `"${parentEventId}"` : 'null';
  const selectedGeneId = selectedGene && selectedGene.id ? selectedGene.id : 'gene_<name>';
  const envFingerprint = captureEnvFingerprint();

  // Create a minimal context for execution if it's too large
  let executionContext = context || '';
  const contextMaxChars = 20000; // Increased context limit
  if (executionContext.length > contextMaxChars) {
      executionContext = executionContext.slice(0, contextMaxChars) + '\n...[TRUNCATED_EXECUTION_CONTEXT]...';
  }

  const basePrompt = `
GEP — GENOME EVOLUTION PROTOCOL (v1.9.5 STRICT) [${nowIso}]

You are a protocol-bound evolution execution engine.
Compliance overrides local optimality.

━━━━━━━━━━━━━━━━━━━━━━
I. Mandatory Evolution Object Model (Output EXACTLY these 5 objects)
━━━━━━━━━━━━━━━━━━━━━━

Output these 5 objects in valid JSON sequence. Missing any = PROTOCOL FAILURE.
Do not wrap them in a single array. Output them as separate JSON objects.

0. Mutation (The Trigger)
{
  "type": "Mutation",
  "id": "mut_<timestamp>",
  "category": "repair | optimize | innovate",
  "trigger_signals": ${JSON.stringify(signals || [])},
  "target": "<module | behavior | gene_id>",
  "expected_effect": "<specific_outcome>",
  "risk_level": "low | medium | high"
}

1. PersonalityState (The Mood)
{
  "type": "PersonalityState",
  "rigor": 0.0-1.0,
  "creativity": 0.0-1.0,
  "verbosity": 0.0-1.0,
  "risk_tolerance": 0.0-1.0,
  "obedience": 0.0-1.0
}

2. EvolutionEvent (The Record)
{
  "type": "EvolutionEvent",
  "id": "evt_<timestamp>",
  "parent": ${parentValue},  // MUST link to previous event
  "intent": "repair | optimize | innovate",
  "signals": ${JSON.stringify(signals || [])},
  "genes_used": ["<gene_id>"],
  "mutation_id": "<mut_id>",
  "personality_state": { ... },
  "blast_radius": { "files": N, "lines": N },
  "outcome": { "status": "success | failed", "score": 0.0-1.0 }
}

3. Gene (The Knowledge)
   - Reuse existing ID if updating. Create new ID only if novel.
   - If using "${selectedGeneId}", output it here with updated strategy.
{
  "type": "Gene",
  "id": "gene_<name>",
  "category": "repair | optimize | innovate",
  "signals_match": ["<pattern>"],
  "preconditions": ["<condition>"],
  "strategy": ["<step_1>", "<step_2>"],
  "constraints": { "max_files": N, "forbidden_paths": [] },
  "validation": ["<check_1>"]
}

4. Capsule (The Result)
   - Only on success. MUST reference the Gene used.
{
  "type": "Capsule",
  "id": "capsule_<timestamp>",
  "trigger": ["<signal>"],
  "gene": "<gene_id>",
  "summary": "<one sentence>",
  "confidence": 0.0-1.0,
  "blast_radius": { "files": N, "lines": N }
}

━━━━━━━━━━━━━━━━━━━━━━
II. Execution Flow & Logic
━━━━━━━━━━━━━━━━━━━━━━

1. Signal Extraction:
   - Signals are provided in Context. Do not hallucinate new ones.

2. Intent Determination:
   - Use Selector decision: ${JSON.stringify(selector || {})}
   - Innovate (Default): Create new capability or major refactor.
   - Optimize: Improve existing logic, reduce tokens, speed up.
   - Repair: Fix broken tool or error.

3. Selection:
   - Selected Gene: "${selectedGeneId}"
   - If selected gene exists in "Gene Preview", ADHERE to its strategy.
   - If signals contain "issue_already_resolved", DO NOT target the same repair objective again.
     You must switch to a different target (optimize/innovate) and explain the new objective.
   - If signals contain "openclaw_self_healed", treat it as platform self-recovery.
     You MUST NOT claim evolver fixed that issue.

4. Execution:
   - Apply changes via tool calls (edit, write, exec).
   - Repair/Optimize: Small, reversible changes.
   - Innovate: New skills allowed in \`skills/<name>/\`.
   - Record blast_radius (files touched, lines changed).

5. Validation:
   - Run the gene's validation steps.
   - If validation fails, ROLLBACK.

6. Solidify:
   - Output the 5 Mandatory Objects.
   - Append EvolutionEvent to history.
   - Update Gene/Capsule files.

7. Report:
   - Use \`feishu-evolver-wrapper/report.js\` to announce result.
   - Describe WHAT changed and WHY.
   - Never claim "fixed" when the issue was already resolved before this cycle.
   - Never attribute OpenClaw platform self-heal to evolver.

━━━━━━━━━━━━━━━━━━━━━━
III. Selector (Mandatory Guidance)
━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(selector, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━
IV. Evolution Philosophy
━━━━━━━━━━━━━━━━━━━━━━

1. Automate Patterns: 3+ manual occurrences = build a tool.
2. Innovate > Maintain: 60% innovation. Build real things.
3. Robustness: Fix recurring errors permanently (validators, fallbacks).
4. Safety: Never delete protected files (MEMORY.md, SOUL.md, etc).

━━━━━━━━━━━━━━━━━━━━━━
V. Tool Constraints
━━━━━━━━━━━━━━━━━━━━━━

- No \`exec\` for messaging. Use \`feishu-post\` or \`feishu-card\`.
- \`exec\` usage for background tasks (loops, daemons) is permitted but must be logged.
- New skills go to \`skills/<name>/\`.
- Do not modify \`skills/evolver/\` core logic without \`rigor > 0.8\`.

Final Directive
━━━━━━━━━━━━━━━━━━━━━━

Every cycle must leave the system measurably better.
Protocol compliance matters, but tangible output matters more.

Context [Signals]:
${JSON.stringify(signals)}

Context [Env Fingerprint]:
${JSON.stringify(envFingerprint, null, 2)}

Context [Gene Preview] (Reference for Strategy):
${genesPreview}

Context [Capsule Preview] (Reference for Past Success):
${capsulesPreview}

Context [Capability Candidates]:
${capabilityCandidatesPreview || '(none)'}

Context [Hub Matched Solution]:
${hubMatchedBlock || '(no hub match for current signals)'}

Context [External Candidates]:
${externalCandidatesPreview || '(none)'}

Context [Execution]:
${executionContext}
`.trim();

  // Strict truncation to avoid context overflow
  const maxChars = Number.isFinite(Number(process.env.GEP_PROMPT_MAX_CHARS))
    ? Number(process.env.GEP_PROMPT_MAX_CHARS)
    : 50000; // Increased default limit

  if (basePrompt.length <= maxChars) return basePrompt;
  
  // If still too large, cut the execution context further
  const charsOver = basePrompt.length - maxChars;
  const executionContextIndex = basePrompt.indexOf("Context [Execution]:");
  
  if (executionContextIndex > -1) {
      // Keep everything before execution context
      const prefix = basePrompt.slice(0, executionContextIndex + 20); // + length of "Context [Execution]:"
      const currentExecution = basePrompt.slice(executionContextIndex + 20);
      
      const allowedExecutionLength = Math.max(0, maxChars - prefix.length - 100);
      return prefix + "\n" + currentExecution.slice(0, allowedExecutionLength) + "\n...[TRUNCATED FOR BUDGET]...";
  }

  return basePrompt.slice(0, maxChars) + "\n...[TRUNCATED FOR BUDGET]...";
}

module.exports = { buildGepPrompt, buildReusePrompt, buildHubMatchedBlock };
