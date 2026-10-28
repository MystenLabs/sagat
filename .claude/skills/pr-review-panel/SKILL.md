---
name: pr-review-panel
description: Multi-agent review of a PR or branch through five lenses, with every finding challenged before it is reported. Use when asked to "review this PR across security, consistency, duplication, efficiency and tests", "run the review panel", "challenge the findings", or "is this PR safe", and from any broader pre-merge review that wants its findings.
---

# PR review panel

Five reviewers read the diff in parallel, then challengers try to knock down every finding, so what reaches the report is real, reachable and worth blocking a merge on. Security leads: this is a security product, and a missed issue is the worst outcome of a review; a nitpick dressed as a finding is the second worst. The deliverable is a verdict backed by confirmed findings, the dismissed list and a coverage line.

The lenses are security, consistency, duplication and code quality, efficiency, and tests. What each one raises, and its bar, lives in `panel.js` beside this file; change a lens there.

## 1. Scope

- **Base and head**: before any command uses a ref or branch name (`baseRefName` from `gh` too), check it is plain ref syntax (letters, digits and `. _ / ~ ^ @ -`, not starting with `-`) and stop on anything else. For a PR, stop unless `<n>` is digits only, then run `gh pr view <n> --json baseRefName,headRefOid`, `git fetch origin` and `git fetch origin pull/<n>/head`. Head is the `headRefOid` SHA, never the branch name, so the review covers the PR whatever is checked out (fork PRs too); base is `origin/<baseRefName>`. Otherwise the refs the user named, with head defaulting to `HEAD`. Resolve every ref that is not already a SHA with `git rev-parse --verify --end-of-options '<ref>^{commit}'` and use only the printed SHA from then on, in the diff below and as `base` and `head` in `args`.
- **Diff**: `git diff <baseSha>...<headSha> --stat`. An empty diff ends the review here.
- **Spec**: the issue the PR closes or the branch names (`gh pr view <n> --json body`), plus any brief the user gave, plus deviations the user approved. Pass the text, not a link.
- **Threat model**: the contents of `SECURITY.md` or `docs/threat-model.md` when the repository has one; otherwise an empty string. The security lens carries its own checklist either way.
- **Depth**: `thorough` (three challengers per security finding) when the diff touches authentication, sessions, signatures, transaction building, API routes or anything that moves value; `quick` (one challenger per finding) otherwise. The user's word overrides.

Done when base, head, pr, spec, depth and threatModel each hold a value (an empty string counts for pr, spec and threatModel) and the diff is non-empty.

## 2. Run the panel

Invoking this skill is the user's opt-in to run the Workflow tool. Call it with `scriptPath` set to this skill's base directory (announced when the skill loads) joined with `panel.js`, and `args: { base, head, pr, spec, depth, threatModel }` as a JSON object. To pick the reviewer model and reasoning effort your environment offers for review work, add `model` and `effort` inside `args`. Omitted, `model` inherits the session's; `effort` inherits it for the lens reviewers, while challengers default to `high` and the diff-listing agent always runs at `low`.

Done when the workflow returns `{ confirmed, unconfirmed, polish, dismissed, coverage }`. If it stops partway, or the security lens returns nothing (a run without security coverage stops instead of reporting), relaunch with `resumeFromRunId` so finished agents are not paid for twice.

## 3. Triage and report

Read the code at each confirmed finding before agreeing with it; the challenge pass narrows the list, your check closes it. Give each one a verdict:

- **Fix**: real, and the fix belongs in this PR.
- **Decline**: a deliberate trade-off or a wrong claim, with the reason in one line.
- **Follow-up**: real, but outside this PR's scope.

Unconfirmed findings are security questions for a human: carry each one into the report with what would settle it. Polish findings are real and above the lens bar, but the challenger would approve with them unchanged (for security, most passing challengers would and the severity is low or medium); they never block.

Report in this order:

1. **Verdict**: safe to merge, or blocked, naming the blocking findings. Only confirmed findings block; unconfirmed ones go to a human, polish never blocks.
2. **Confirmed**, security first, then by severity: `file:line`, the one-line claim, why it survived the challenge, the suggested fix, and your triage verdict.
3. **Unconfirmed**: each with the open question.
4. **Polish**: worth a sentence in the PR, not a blocker; one line each, `file:line` and the claim.
5. **Dismissed**: one line each, the title and why it fell.
6. **Coverage**: lenses run (and any that failed), files in the diff, findings per lens, and anything the workflow logged as skipped.

Done when every confirmed, unconfirmed and polish finding has its line in the report and the coverage line names the files reviewed. This skill ends at the report; applying fixes, committing and commenting on the PR are the caller's next steps.
