# Russian Localization Upstream Plan

Status: active
Date: 2026-03-29
Branch: feat/i18n-foundation-ru

## Goal

Add Russian as a first-class Vibe Kanban locale and upstream it in a way that maintainers can review and extend easily.

## Why This Is Split Into Two PRs

One large "add Russian + invent the locale workflow" PR is harder to review and easier to reject on process grounds.

Two smaller PRs keep the review clean:

1. PR 1 adds localization infrastructure for future contributors.
2. PR 2 adds the Russian locale using that infrastructure.

## PR 1: Localization Infrastructure

Scope:

- Add a documented workflow for introducing a new locale.
- Add a locale scaffold script that copies the English namespace files into a new locale directory.
- Add a QA helper that reports untranslated or unchanged strings compared to English.
- Keep the change small. No new runtime abstractions. No CI policy changes.

Out of scope:

- Adding Russian translations.
- Refactoring the existing i18n system.
- Translating docs or README.

## PR 2: Add Russian Locale

Scope:

- Add `RU` to the config enum and generated shared types.
- Register `ru` in the frontend language map and i18n resources.
- Add `packages/web-core/src/i18n/locales/ru/*.json`.
- Verify language selection, browser detection, and key consistency.

Out of scope:

- Rewriting existing copy.
- Bulk cleanup of unrelated hardcoded strings.
- Translating the marketing site or documentation.

## Acceptance Bar

Both PRs should be independently reviewable and green on existing checks.

PR 1 should make the next locale cheaper to add.

PR 2 should feel like a complete product locale, not a partial translation dump.
