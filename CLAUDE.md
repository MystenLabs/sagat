# Working in this repo

## Linear

- One Linear issue per PR. A stack of PRs gets a parent issue, with a sub-issue per PR.
- Put the issue ID in the branch name: `<you>/<issue-id>-short-topic`.
- End the PR body with `Closes <issue-id>`.
- Linear moves the issue when the PR is opened, marked ready, and merged. Close issues without a PR by hand.

## Copy

- Every user-facing string lives in `app/src/content.ts`: titles, labels, buttons, placeholders, helper and error lines, empty states, dialogs, toasts, tooltips and aria labels. Components read it as `content.<screen>.<key>`; files in `app/src/lib/` import it from `../content`, because e2e loads them without the `@/` alias.
- Reuse before you add. A string with the same role on several screens (Cancel, View on explorer, the "4 of 7" threshold label) lives in `content.common`; wording that belongs to one screen lives under that screen's namespace.
- A string with values is a function of them (`toasts.signatureAddedNeeds(missing)`), so components never assemble sentences.
- Wording follows the design frames word for word. Diverge only where the frame would be untrue for the app or shows data the app doesn't have, and say why in the PR.
- Punctuation is typographic: ’ “ ” and …
- A file that reads one namespace several times aliases it once (`const COPY = content.proposal.approvals;`).
