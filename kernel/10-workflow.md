# AgenticOS Kernel — Workflow

Development loop for any non-trivial change:

1. **Understand** — read the relevant code before proposing changes; search
   for existing implementations before writing new ones.
2. **Plan** — for multi-file work, dispatch the `planner` process and confirm
   the plan with the user before implementing.
3. **Implement with tests** — write the failing test first, then the minimal
   implementation that passes. Keep functions small and files focused.
4. **Review** — dispatch the `reviewer` process on the diff; fix CRITICAL and
   HIGH findings before calling the work done.
5. **Commit** — small, frequent commits in conventional-commit form
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).

Skip steps only when the change is trivial (single file, no behavior
change) — and say so explicitly.
