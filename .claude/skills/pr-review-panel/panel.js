export const meta = {
  name: 'pr-review-panel',
  description: 'Five-lens review of a diff (security, consistency, quality, efficiency, tests) with every finding challenged before it is reported',
  whenToUse: 'Run from the pr-review-panel skill with args { base, head, pr, spec, depth, threatModel }, plus optional model and effort for the reviewer agents',
  phases: [
    { title: 'Review', detail: 'list the diff, run the five lenses in parallel, dedup' },
    { title: 'Challenge', detail: 'challengers try to refute every finding' },
    { title: 'Report', detail: 'rank survivors, list dismissals and coverage' },
  ],
}

// ---------- inputs ----------

const A = args || {}
if (!A.base || !A.head) throw new Error('pr-review-panel needs args.base and args.head')
// Refs are interpolated into shell commands the agents run, so only plain ref syntax is accepted.
const SAFE_REF = /^[A-Za-z0-9._\/~^@-]+$/
const SAFE_PATH = /^[A-Za-z0-9._\/@+-]+$/
for (const ref of [A.base, A.head]) {
  if (typeof ref !== 'string' || !SAFE_REF.test(ref) || ref.startsWith('-')) throw new Error(`Unsafe git ref: ${ref}`)
}
const BASE = A.base
const HEAD = A.head
const THOROUGH = A.depth === 'thorough'
const PR_LABEL = A.pr ? `PR #${A.pr}` : `${HEAD} against ${BASE}`

// Agent options with the optional args.model added; undefined keys are dropped so unset values inherit the session's.
function withModel(opts) {
  const out = { ...opts, model: A.model }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

// ---------- shared vocabulary ----------

const SEVERITIES = ['critical', 'high', 'medium', 'low']
const SEVERITY_GUIDE = 'Severity: critical = exploitable, or loses funds or data, as merged; high = wrong behaviour real users will hit; medium = a real defect with limited reach; low = real but minor.'

// ---------- lenses: the single source of truth for what each reviewer raises ----------

const LENSES = [
  {
    key: 'security',
    title: 'Security',
    prompt: [
      'This is a security product; a missed issue here is the worst outcome of this review. Check every changed path against each of these:',
      '- Authentication and sessions: signed-message sessions (what the message commits to, nonce, expiry, domain), cookies and JWTs (flags, expiry, signature and algorithm checks), and the binding between an address and the public key that signed.',
      '- Authorization: who may do what (member, external proposer, anyone), checked on every route and every query, scoped to the account the request acts on rather than only to the caller.',
      '- Signature and transaction integrity: the bytes a signer approves are the bytes that execute; digests, intent scopes, multisig thresholds and weights, replay across accounts, networks or signer-set changes.',
      '- Input validation at trust boundaries: API params and bodies, chain data treated as untrusted, and the client trusting API data it renders or asks the user to sign.',
      '- Injection and SQL/ORM misuse: interpolated raw queries, where clauses missing the account scope, mass assignment, HTML or command injection.',
      '- Secrets and logging: keys, tokens, signatures or personal data reaching logs, error bodies, responses or the client bundle.',
      '- Denial-of-service shaped inputs: unbounded arrays, sizes and page limits, expensive verification an unauthenticated caller can trigger.',
      '- Races on money movement and state transitions: check-then-act without a lock or constraint, double execution, concurrent approvals crossing a threshold.',
      A.threatModel ? `- The repository's threat model; check each risk it names:\n${A.threatModel}` : '- No threat model was provided; the list above is the full checklist.',
      'When the diff touches Move code or chain-level code (transaction building, signature schemes, object handling) and a skill named `sui-pr-security-review` is available, load it with the Skill tool and apply its invariants to those files as well.',
    ].join('\n'),
    bar: 'Raise it when you can name who triggers it (an attacker, a malicious member, or an honest client that goes wrong), the input or state they control, and the outcome: access they should not have, a signature or transaction that does something other than what the signer saw, funds or approvals moved wrongly, a secret exposed, or the service knocked over cheaply. A plausible issue you cannot fully prove still goes in, at the severity it would carry if real, with the claim saying what would confirm it; the challenge pass settles it.',
  },
  {
    key: 'consistency',
    title: 'Consistency',
    prompt: [
      'Look for logic this diff introduces that disagrees with existing logic for the same concept:',
      '- Two definitions of one concept ("expired", "ready", "member", a threshold met), or a status derived two different ways.',
      '- A validation applied on one path and skipped on its twin (create vs update, API vs worker, legacy vs new route).',
      '- A frontend rule that diverges from the API rule it mirrors.',
      '- State that can become contradictory (two fields or tables that can disagree, a cache that outlives its source).',
      '- Behaviour the diff removes or changes that callers still rely on; grep for every caller.',
      '- Error handling that differs between twin paths (one throws, one returns null; different status codes for the same failure).',
    ].join('\n'),
    bar: 'Raise it when two parts of the system would give different answers to the same question, or a caller would now break, and you can quote both sides. Two styles that reach the same outcome are below the bar.',
  },
  {
    key: 'quality',
    title: 'Duplication and code quality',
    prompt: [
      'Look for code a maintainer would send back:',
      '- A copy of an existing helper, hook or component instead of reuse; grep the codebase for the existing one and cite it.',
      '- Repeated blocks inside the diff that should be one.',
      '- Dead code: unused exports, parameters, branches, flags or files.',
      '- Misleading names, and comments that say something the code does not do.',
      '- Wrong altitude: hand-rolled logic where a project primitive exists (SDK validators and helpers, the design-system components, shared query hooks).',
    ].join('\n'),
    bar: 'Raise it when a maintainer would ask for the change in review: the duplicate will drift, the dead code misleads, the name or comment sends the next reader the wrong way, or a project primitive already does the job. Taste alone (ordering, a name you would have picked differently, a refactor with no defect behind it) is below the bar.',
  },
  {
    key: 'efficiency',
    title: 'Efficiency',
    prompt: [
      'Look for work that grows with data on either side of the wire:',
      '- N+1 queries or RPC calls: an API loop issuing a query per row, a frontend hook fetching per row or per item, a DataLoader missing where batching across many keys is real.',
      '- Unbounded lists returned or rendered without pagination or a limit.',
      '- Repeated work per render or per request that belongs in a memo, the query cache, or a single query.',
      '- Sequential awaits on independent work that could run together.',
      '- O(n^2) passes over user-sized inputs (proposals, signers, coins, transactions).',
    ].join('\n'),
    bar: 'Raise it when the cost is measurable at realistic sizes for this product (hundreds of proposals, tens of signers, thousands of coins, a page loaded on every navigation), and name the size and the cost: queries per request, RPC calls per render, added latency. Asymptotic purity at sizes the product never reaches is below the bar.',
  },
  {
    key: 'tests',
    title: 'Tests and coverage',
    prompt: [
      'Judge the tests by quality over quantity. Raise two kinds of finding:',
      '- Missing protection: a user-visible regression this diff could cause that no unit or e2e test would catch. Name the test that should exist: one representative case plus the real boundary, at the level (unit or e2e) where it is cheapest to keep.',
      '- Over-testing: exact-copy tests, permutation or layout sweeps, tests that pin implementation details, the same behaviour covered by both unit and e2e. Name each test to remove.',
      '- Also check that every test name matches what it asserts.',
      'Run nothing heavy; read the test files and the code under test.',
    ].join('\n'),
    bar: 'Raise a missing test only for a regression a user would notice, and name the one test that would catch it. Raise over-testing when removing the tests loses no protection, and name them. A coverage percentage, or "add a test for X" with no regression in mind, is below the bar.',
  },
]
const LENS_KEYS = LENSES.map(l => l.key)
const LENS_BY_KEY = {}
for (const l of LENSES) LENS_BY_KEY[l.key] = l

// ---------- schemas ----------

const FILES_SCHEMA = {
  type: 'object',
  properties: {
    baseSha: { type: 'string', description: 'Full 40-character commit SHA the base ref resolved to' },
    headSha: { type: 'string', description: 'Full 40-character commit SHA the head ref resolved to' },
    files: { type: 'array', items: { type: 'string' } },
    error: { type: 'string', description: 'Empty when the command succeeded; otherwise the error text' },
  },
  required: ['baseSha', 'headSha', 'files', 'error'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the problem, under 80 characters' },
          file: { type: 'string', description: 'Repo-relative path' },
          line: { type: 'integer', description: 'Line at head; 0 for a file-level finding' },
          severity: { type: 'string', enum: SEVERITIES },
          lens: { type: 'string', enum: LENS_KEYS },
          claim: { type: 'string', description: 'One sentence: what is wrong' },
          evidence: { type: 'string', description: 'The quoted lines that show it' },
          failure_scenario: { type: 'string', description: 'Concrete input or state, and the wrong outcome it produces' },
          suggested_fix: { type: 'string' },
        },
        required: ['title', 'file', 'line', 'severity', 'lens', 'claim', 'evidence', 'failure_scenario', 'suggested_fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    holds: { type: 'boolean', description: 'The claim is true of the code at head' },
    realistic: { type: 'boolean', description: 'A real user, attacker or deployment can produce the failure scenario' },
    nitpick: { type: 'boolean', description: "Below the lens's bar: taste, or not worth a review comment" },
    would_block: { type: 'boolean', description: 'You would request changes before merging; false when you would approve with this unchanged and at most mention it' },
    user_impact: { type: 'string', description: "What a user, operator or attacker experiences if it ships as is; 'none' when nothing changes for them" },
    severity: { type: 'string', enum: SEVERITIES },
    reason: { type: 'string', description: 'One or two sentences citing file:line' },
    counterexample_or_repro: { type: 'string', description: 'The code that refutes the claim, or concrete repro steps' },
  },
  required: ['holds', 'realistic', 'nitpick', 'would_block', 'user_impact', 'severity', 'reason', 'counterexample_or_repro'],
}

// ---------- prompts ----------

function lensPrompt(lens, files) {
  const others = LENSES.filter(l => l.key !== lens.key).map(l => l.title.toLowerCase()).join(', ')
  return [
    `You are the ${lens.title.toLowerCase()} reviewer on a five-lens review panel for ${PR_LABEL}. Other reviewers cover ${others}; stay on your lens.`,
    `Run \`${DIFF}\` yourself, then read the surrounding code, callers and tests as needed to judge real behaviour. ${READ_AT_HEAD}`,
    `Files in the diff; account for every one under your lens:\n${files.map(f => `- ${f}`).join('\n')}`,
    A.spec ? `What the change is meant to do (context only; spec compliance is reviewed elsewhere):\n${A.spec}` : '',
    lens.prompt,
    `Bar: ${lens.bar}`,
    `Return only findings that meet the bar; an empty list is the right answer for a clean diff. For each finding, quote the lines as evidence, cite file and line, write failure_scenario as a concrete input or state and the wrong outcome it produces, set lens to "${lens.key}", and give the smallest fix. ${SEVERITY_GUIDE}`,
  ].filter(Boolean).join('\n\n')
}

const ANGLES = {
  refute: 'Refute the claim against the code: read the code at the finding and its callers, and grep for handling elsewhere (middleware, validators, DB constraints, the caller, the SDK) that already prevents it.',
  reachable: 'Test reachability: can inputs a real user or attacker produce, through the entry points the product actually exposes, reach the failure? Trace the path from the entry point to the line.',
  block: 'Weigh it as a senior reviewer on a security product: would you request changes on this, or approve with it unchanged and at most mention it?',
}
const SINGLE = `Do all three of these:\n${Object.values(ANGLES).map(a => `- ${a}`).join('\n')}`
// Three challengers per security finding on a thorough run, one otherwise.
const anglesFor = f => (f.lens === 'security' && THOROUGH ? Object.values(ANGLES) : [SINGLE])

const CALIBRATION = 'A finding earns its place when fixing it changes what a user or attacker can do or see, or stops a maintainer trap (dead code that reads as live, a name or comment that lies, duplicated logic that will drift). Set nitpick=true for everything else: style, a constant that could be reused, a helper that could be extracted, a test that could be tidier, repetition under about ten lines, or a missing test for a path with no user-visible regression behind it. Set would_block=false whenever you would approve the PR with this unchanged. On a typical PR most low-severity findings fall at this step; confirming every finding you are given means you are not challenging.'

function challengePrompt(f, angle) {
  const lens = LENS_BY_KEY[f.lens]
  const isSecurity = f.lens === 'security'
  // The path comes from a lens agent's output, so it enters the shell command only when it is plain path syntax.
  const fileDiff = SAFE_PATH.test(f.file) && !f.file.startsWith('-')
  const context = fileDiff
    ? `Run \`${DIFF} -- ${f.file}\` for context, and the full \`${DIFF}\` only if the finding depends on other files.`
    : `Run \`${DIFF}\` for context.`
  return [
    `You are challenging one finding from a review of ${PR_LABEL}. ${context} ${READ_AT_HEAD}`,
    `Finding:\n${JSON.stringify(finderView(f), null, 2)}`,
    f.also.length ? `The same spot was also flagged as:\n${f.also.map(o => `- [${o.lens}] line ${o.line}: ${o.title}: ${o.claim}`).join('\n')}\nJudge the main finding; mention in reason whether these change the picture.` : '',
    `The ${lens.title.toLowerCase()} lens bar: ${lens.bar}`,
    angle,
    'Try hard to refute it.',
    CALIBRATION,
    'Then set holds (the claim is true of the code), realistic (the failure scenario can happen in practice), nitpick (below the bar), would_block (you would request changes before merging), user_impact (what a user, operator or attacker experiences if it ships as is, or "none"), your own severity, a reason citing file:line, and the refuting code or the repro steps.',
    f.lens === 'tests'
      ? 'For a tests finding, realistic means the regression the missing test would guard is one users would hit, or the over-tested behaviour is covered elsewhere; a test defect such as a vacuous or misnamed assertion is realistic by definition.'
      : '',
    isSecurity
      ? 'This is a security finding: answer honestly from the code rather than defaulting either way. A wrong dismissal leaves a hole in a security product; a wrong confirmation costs a human an hour.'
      : 'When the code leaves you uncertain, answer holds=false.',
    SEVERITY_GUIDE,
  ].filter(Boolean).join('\n\n')
}

// ---------- dedup and merge (plain code) ----------

const sevRank = s => {
  const i = SEVERITIES.indexOf(s)
  return i < 0 ? SEVERITIES.length : i
}
const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const finderView = f => ({
  title: f.title, file: f.file, line: f.line, severity: f.severity, lens: f.lens,
  claim: f.claim, evidence: f.evidence, failure_scenario: f.failure_scenario, suggested_fix: f.suggested_fix,
})

function mergePair(a, b) {
  // A security finding is never folded under another lens; otherwise the higher severity leads.
  const aIsSecurity = a.lens === 'security'
  const bIsSecurity = b.lens === 'security'
  const bLeads = aIsSecurity !== bIsSecurity ? bIsSecurity : sevRank(b.severity) < sevRank(a.severity)
  const [primary, other] = bLeads ? [b, a] : [a, b]
  return {
    ...primary,
    severity: SEVERITIES[Math.min(sevRank(a.severity), sevRank(b.severity))] || primary.severity,
    lenses: [...new Set([...primary.lenses, ...other.lenses])],
    also: [
      ...primary.also,
      { lens: other.lens, title: other.title, line: other.line, claim: other.claim },
      ...other.also,
    ],
  }
}

function dedupe(findings) {
  // Only findings at the same file, line and title merge; nearby findings stay separate.
  const merged = new Map()
  for (const raw of findings) {
    const f = { ...raw, lenses: [raw.lens], also: [] }
    const k = `${f.file}|${f.line}|${normTitle(f.title)}`
    const prev = merged.get(k)
    merged.set(k, prev ? mergePair(prev, f) : f)
  }
  return [...merged.values()]
}

// ---------- survival rules ----------

function decide(f, verdicts) {
  const passes = verdicts.filter(v => v.holds && v.realistic && !v.nitpick)
  const holds = verdicts.filter(v => v.holds)
  const reasons = vs => vs.map(v => v.reason).join(' | ')
  const medianSeverity = vs => {
    const sorted = vs.map(v => v.severity).sort((x, y) => sevRank(x) - sevRank(y))
    return sorted[Math.floor(sorted.length / 2)] || f.severity
  }
  if (!verdicts.length) {
    return f.lens === 'security'
      ? { ...f, status: 'unconfirmed', reason: 'No challenger returned a verdict.', verdicts }
      : { ...f, status: 'dismissed', reason: 'No challenger returned a verdict.', verdicts }
  }
  if (f.lens === 'security') {
    const expected = anglesFor(f).length
    if (verdicts.length < expected) {
      const reason = `Only ${verdicts.length} of ${expected} challengers returned a verdict. ${reasons(verdicts)}`
      return { ...f, status: 'unconfirmed', reason, verdicts }
    }
    if (passes.length * 2 > verdicts.length) {
      const severity = medianSeverity(passes)
      // Policy: a low or medium security finding most passing challengers would approve unchanged is polish; high and critical always confirm.
      const approving = passes.filter(v => v.would_block === false).length
      const status = approving * 2 > passes.length && (severity === 'low' || severity === 'medium') ? 'polish' : 'confirmed'
      return { ...f, status, severity, reason: reasons(passes), verdicts }
    }
    if (!holds.length || verdicts.every(v => v.nitpick)) return { ...f, status: 'dismissed', reason: reasons(verdicts), verdicts }
    return { ...f, status: 'unconfirmed', reason: reasons(verdicts), verdicts }
  }
  const v = verdicts[0]
  if (v.holds && v.realistic && !v.nitpick) {
    // Real and above the bar; only a finding the challenger would block on is confirmed, the rest is polish.
    const status = v.would_block ? 'confirmed' : 'polish'
    return { ...f, status, severity: v.severity || f.severity, reason: v.reason, verdicts }
  }
  const why = !v.holds ? 'does not hold' : !v.realistic ? 'not realistic' : 'nitpick'
  return { ...f, status: 'dismissed', reason: `${why}: ${v.reason}`, verdicts }
}

const reportView = f => ({
  ...finderView(f),
  lenses: f.lenses,
  also: f.also,
  survived_because: f.reason,
  challengers: f.verdicts.map(v => ({
    holds: v.holds, realistic: v.realistic, nitpick: v.nitpick, would_block: v.would_block, severity: v.severity,
    user_impact: v.user_impact, reason: v.reason, counterexample_or_repro: v.counterexample_or_repro,
  })),
})

// ---------- Review ----------

phase('Review')

const listed = await agent(
  [
    `In the repository, run \`git rev-parse --verify ${BASE}^{commit}\` and \`git rev-parse --verify ${HEAD}^{commit}\`, and return the two full SHAs they print as baseSha and headSha.`,
    'Then run `git diff --name-only <baseSha>...<headSha>` with those SHAs and return every path it prints, in order, as files.',
    'If a ref is missing, run `git fetch origin` once and retry. Put the error text in error if it still fails (with empty strings for any SHA you could not resolve), otherwise an empty string.',
  ].join(' '),
  withModel({ label: 'List diff files', phase: 'Review', schema: FILES_SCHEMA, effort: 'low' }))
if (!listed) throw new Error('The diff listing agent returned nothing')
if (listed.error) throw new Error(`Could not list the diff: ${listed.error}`)
const SHA = /^[0-9a-f]{40}$/
if (!SHA.test(listed.baseSha) || !SHA.test(listed.headSha)) {
  throw new Error(`The diff listing agent returned invalid SHAs: base ${listed.baseSha}, head ${listed.headSha}`)
}
const BASE_SHA = listed.baseSha
const HEAD_SHA = listed.headSha
// Every prompt from here on names the SHAs, so all agents see the same commits and a resume keys on them.
const DIFF = `git diff ${BASE_SHA}...${HEAD_SHA}`
const READ_AT_HEAD = `Read and search code as it is at ${HEAD_SHA}; when ${HEAD_SHA} is not the checked-out commit, read files with \`git show ${HEAD_SHA}:<path>\` and search with \`git grep <pattern> ${HEAD_SHA}\` rather than the working tree.`
const files = listed.files

if (!files.length) {
  log(`Empty diff for ${PR_LABEL}; nothing to review`)
  return {
    confirmed: [], unconfirmed: [], polish: [], dismissed: [],
    coverage: { lenses: [], lensesFailed: [], findingsPerLens: {}, filesInDiff: [], depth: THOROUGH ? 'thorough' : 'quick' },
  }
}
log(`${files.length} files in the diff`)

const lensResults = await parallel(LENSES.map(lens => () =>
  agent(lensPrompt(lens, files), withModel({ label: `Lens: ${lens.title}`, phase: 'Review', schema: FINDINGS_SCHEMA, effort: A.effort }))
    .then(r => (r ? { lens: lens.key, findings: r.findings.map(f => ({ ...f, lens: lens.key })) } : null))))
const ran = lensResults.filter(Boolean)
const lensesRun = ran.map(r => r.lens)
const lensesFailed = LENS_KEYS.filter(k => lensesRun.indexOf(k) < 0)
if (lensesFailed.length) log(`Lenses that returned nothing (not covered): ${lensesFailed.join(', ')}`)
if (lensesFailed.indexOf('security') >= 0) throw new Error('The security lens returned nothing; relaunch with resumeFromRunId instead of reporting without security coverage')

const findingsPerLens = {}
for (const r of ran) findingsPerLens[r.lens] = r.findings.length
log(`Findings per lens: ${LENS_KEYS.map(k => `${k} ${findingsPerLens[k] === undefined ? '-' : findingsPerLens[k]}`).join(', ')}`)

const raw = ran.flatMap(r => r.findings)
const findings = dedupe(raw)
if (raw.length !== findings.length) log(`Merged ${raw.length - findings.length} duplicate findings; ${findings.length} go to the challenge`)

// ---------- Challenge ----------

phase('Challenge')

let judged = []
if (findings.length) {
  judged = (await pipeline(
    findings,
    f => {
      const angles = anglesFor(f)
      return parallel(angles.map((angle, j) => () =>
        agent(challengePrompt(f, angle), withModel({
          label: `Challenge ${j + 1}/${angles.length}: ${f.title}`.slice(0, 80),
          phase: 'Challenge',
          schema: VERDICT_SCHEMA,
          effort: A.effort || 'high',
        })))).then(vs => vs.filter(Boolean))
    },
    (verdicts, f) => decide(f, verdicts),
  )).filter(Boolean)
  if (judged.length < findings.length) log(`${findings.length - judged.length} findings lost in the challenge stage (agent failure); they are not in the report`)
} else {
  log('No findings to challenge')
}

// ---------- Report ----------

phase('Report')

const rankOrder = (x, y) =>
  (x.lens === 'security' ? 0 : 1) - (y.lens === 'security' ? 0 : 1) ||
  sevRank(x.severity) - sevRank(y.severity) ||
  String(x.file).localeCompare(String(y.file)) ||
  x.line - y.line

const confirmed = judged.filter(f => f.status === 'confirmed').sort(rankOrder).map(reportView)
const unconfirmed = judged.filter(f => f.status === 'unconfirmed').sort(rankOrder).map(reportView)
const polish = judged.filter(f => f.status === 'polish').sort(rankOrder).map(reportView)
const dismissed = judged.filter(f => f.status === 'dismissed').sort(rankOrder)
  .map(f => ({ title: f.title, file: f.file, line: f.line, lens: f.lens, reason: f.reason }))
log(`${confirmed.length} confirmed, ${unconfirmed.length} unconfirmed, ${polish.length} polish, ${dismissed.length} dismissed`)

return {
  confirmed,
  unconfirmed,
  polish,
  dismissed,
  coverage: {
    lenses: lensesRun,
    lensesFailed,
    findingsPerLens,
    filesInDiff: files,
    depth: THOROUGH ? 'thorough' : 'quick',
  },
}
