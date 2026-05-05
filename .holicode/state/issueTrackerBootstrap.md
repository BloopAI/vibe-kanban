# Issue Tracker Bootstrap Checklist

Use this temporary checklist during project setup to validate issue type taxonomy.

Delete this file once all applicable checks are complete.

## Mode

- **issue_tracker**: vibe_kanban
- **Date**: 2026-05-05
- **Owner**: Szymon Stasik (single maintainer)

## Recommended Type Taxonomy (Non-Blocking)

Preferred type tags/labels:
- `epic`
- `story`
- `task`
- `technical-design`
- `spike`
- `bug`

## Validation

### External Trackers (`vibe_kanban`, `github`)
- [x] Checked tags in VK project `Vibe Kanban` (id `fd38a3f1-…`) on 2026-05-05.
      Existing tags: `bug`, `feature`, `enhancement`, `documentation`. Type tags
      (`epic`/`story`/`task`/`spike`/`technical-design`) are NOT present.
- [x] Missing tags accepted as missing for now (no project-wide rename without user input).
      Fallback convention chosen: type encoded in description metadata + title prefixes
      (`[epic]`, `[story]`, `[task]`, `[td]`, `[spike]`) where useful.
- [x] Use `feature` for new feature work, `documentation` for HoliCode/docs work,
      `bug` for fixes, `enhancement` for improvements to existing features. Verified
      against issues already created (VIB-59 = `documentation`; VIB-60, VIB-61 = `feature`).

### Local Mode (`local`)
- N/A — fork uses `vibe_kanban` as its tracker.

## Git Hygiene (Optional)

`.holicode` IS tracked in this fork (no exclusion in `.gitignore` for `.holicode/state/`).
- [ ] Staged bootstrap-related updates (separate commit recommended; single-purpose).
- [ ] Committed setup updates (only if the user explicitly asks for it; this session does
      NOT commit).
- [ ] Verified no uncommitted tracker-state changes before branch switch.

## Outcome

- **Status**: complete for tag-validation; commit step intentionally deferred to user.
- **Notes**: Five seed issues created in the existing `Vibe Kanban` VK project on
  2026-05-05: VIB-59 (Init HoliCode), VIB-60 (Release pipeline), VIB-61 (Latest models
  umbrella), VIB-62 (GPT 5.5), VIB-63 (OpenCode parity). VIB-61 ↔ VIB-46 linked as
  `related`. Real IDs are now reflected in `WORK_SPEC.md` and `activeContext.md`.

---

When completed (after VK project exists and tags are verified or accepted), remove this file
to reduce noise.
