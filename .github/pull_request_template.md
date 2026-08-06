## What

<!-- One paragraph: what changed and why. -->

## Gate checklist

- [ ] `npm test` passes
- [ ] `npm run test:domain` passes
- [ ] `npm run check:boundaries` passes
- [ ] `npm run smoke:pack` passes
- [ ] `git diff --check` is clean
- [ ] `npm run perf:check` passes (if runtime / action / effects / perf paths touched)
- [ ] Docs updated (or change explicitly scoped as internal / archived note)
- [ ] I agree to the [CLA](../CLA.md)

## Boundary statement

<!-- Which layer does this change belong to (runtime / agent / action / canon /
knowledge / effects / narrative / domain / sdk)? Confirm no provider writes
state, no narrative layer creates world facts, and no world-specific
vocabulary entered core. Delete this section for docs-only PRs. -->
