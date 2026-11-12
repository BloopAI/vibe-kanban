# Releasing (npx, from a Mac)

GitHub Actions and the R2 bucket are unavailable, so releases are built and
published locally with `scripts/release-local.sh`:

- Binaries for all six platforms are attached to the **GitHub Release** for the
  tag. The npx CLI downloads them from
  `https://github.com/BloopAI/vibe-kanban/releases/download/<tag>/`.
- The npm package is published under the **`next`** dist-tag first and moved to
  **`latest`** only after testing.
- The desktop app is not released (no signing certificates). `--desktop` falls
  back to browser mode.
- Analytics and crash reporting are always off in these builds.

Versions up to 0.1.44 still download from `npm-cdn.vibekanban.com` (R2), which
is read-only now but still serving. Leave it alone so they keep working.

## One-time setup

1. Tools: `brew install colima docker gh` and `gh auth login`.
2. npm: `npm login` with an account that owns `vibe-kanban`. CI used OIDC
   trusted publishing; a local publish asks for your 2FA code instead.
3. Docker VM for the Linux/Windows cross builds, with enough memory for rustc:

   ```bash
   colima start --cpu 8 --memory 16 --disk 100
   ```

4. Build-time values come from the environment, then `.env.release`, then
   `.env`. Only the lines the script needs are read, so other secrets in `.env`
   stay out of it. Required:
   - `VK_SHARED_API_BASE` (`https://api.vibekanban.com`)
   - `VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY` (the log viewer needs it)

   `VK_SHARED_RELAY_API_BASE` is left unset: the relay is sunset with the rest
   of the remote features, and the app then just reports relay as unavailable.

   Releases never include analytics or crash reporting. `build` clears every
   `POSTHOG_*` and `SENTRY_*` variable before compiling, whatever `.env` or your
   shell says. It then fails if a PostHog project key (`phc_…`) or a Sentry DSN
   turns up in the frontend bundle or the binaries anyway. `build` prints the
   settings it used.

## Cutting a release

A release can be cut from the PR branch that carries the changes and merged
only once it is out and tested. The npm package never depends on `main`.

### 1. Dry run (optional, nothing leaves the Mac)

```bash
scripts/release-local.sh build    # all 6 platforms; the first run also builds the Docker image
scripts/release-local.sh smoke    # installs the packed CLI and runs it against the built assets
```

On a HEAD without a `v*` tag these build as `v<version>-dryrun` into
`release-out/`, and `publish` refuses them. Fix and repeat until both pass;
no version number is used up.

### 2. Bump and build

```bash
./bump-version.sh                 # commits the bump and creates tag v<version>.<timestamp>
scripts/release-local.sh build
scripts/release-local.sh smoke
```

The tag stays local until `publish`. If something needs fixing now, commit
the fix and move the tag onto it rather than bumping again:

```bash
git tag -fa <tag> -m "Release <tag>"
```

### 3. Publish

```bash
scripts/release-local.sh publish
```

This runs in three stages and asks before each:

1. Pushes the tag and creates a GitHub **pre-release** with the assets. This
   can still be undone with `gh release delete <tag> -R BloopAI/vibe-kanban
   --cleanup-tag`.
2. Runs the smoke test again, this time downloading from the real GitHub
   release with no override, exactly as users will.
3. Publishes to npm under `next`. This is the only step that cannot be
   undone: npm never lets a version number be reused, even after deprecating
   it. `latest` is untouched, so `npx vibe-kanban` users see nothing yet.

Answering no at the npm question stops there; rerunning `publish` reuses the
pre-release if it matches the build. A tag that is not on `origin/main`
gets a note and a question, which is expected when releasing from a branch.

### 4. Test `@next`

```bash
npx vibe-kanban@next
```

Linux can be tested in Docker, then opened at http://localhost:3000:

```bash
docker run -it --rm -p 3000:3000 -e HOST=0.0.0.0 -e PORT=3000 node:22 npx -y vibe-kanban@next
```

Windows x64 and arm64 both run in a Windows 11 ARM VM (UTM). If `@next` is
broken, fix it, bump, and publish again; `latest` was never touched.

### 5. Promote, then merge

```bash
scripts/release-local.sh promote  # npm latest -> this version, GitHub release marked latest
```

`npx vibe-kanban` users get the new version from then on. Merge the PR
afterwards. The repo only allows squash merges, so the tag keeps pointing at
the branch commit; GitHub keeps that commit because the tag references it.

## Rolling back

```bash
scripts/release-local.sh rollback 0.1.44
```

This points `latest` back at the given version straight away. Nothing is
unpublished; the bad version stays reachable by its exact number.

## Partial builds

`scripts/release-local.sh build macos-arm64` builds one platform, which is
handy for testing the pipeline. `publish` refuses to run until all six
platforms are built. `ALLOW_DIRTY=1` builds from a dirty tree; don't publish
those.

## Testing against a mirror

`VIBE_KANBAN_DOWNLOAD_BASE_URL` makes the CLI download from another server with
the same `<base>/<tag>/<asset>` layout. `smoke` uses this to serve
`release-out/<tag>/assets/` locally.

## Release assets

```
manifest.json                       sha256 + size of every zip
<platform>-vibe-kanban.zip          app server
<platform>-vibe-kanban-mcp.zip      MCP server
<platform>-vibe-kanban-review.zip   review CLI
vibe-kanban-<version>.tgz           the npm package as published
```

`<platform>` is one of `macos-arm64`, `macos-x64`, `linux-x64`, `linux-arm64`,
`windows-x64`, `windows-arm64`. The Linux binaries are static musl builds made
with `cargo zigbuild`; the Windows ones use `cargo xwin` (which downloads the
MSVC CRT and Windows SDK and accepts Microsoft's license for them, as CI did).
