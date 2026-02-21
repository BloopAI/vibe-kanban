# @vibe/ui

Shared UI package for reusable frontend primitives.

## Scope (initial)

- Package scaffold and exports.
- Shared utility helpers (`cn`).
- Tailwind class generation remains configured in `frontend/tailwind.new.config.js`.

## Notes

- Tailwind scanning for this package is enabled from `frontend/tailwind.new.config.js` via:
  `../packages/ui/src/**/*.{ts,tsx}`.
- The app-level stylesheet remains `frontend/src/styles/new/index.css`.
