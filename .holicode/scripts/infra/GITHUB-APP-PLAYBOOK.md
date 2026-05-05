# HoliCode GitHub App — Per-Deployment Setup Playbook

The HoliCode workspace stack uses a **single shared GitHub App** for both `gh` CLI authentication (installation tokens) and user-facing OAuth flows (Coder login + VK Remote login). Each deployment (CampoYa, Giftcash, Hologence, future) is a separate org installation of the same App.

## Why a single App, multiple installations?

- One App definition to maintain (permissions, branding, secrets)
- Each org gets its own scoped installation token
- Adding a new deployment requires no code change — only adding callback URLs to the App settings

## When you spin up a new deployment

After you have working DNS (`coder.<DEPLOYMENT>` and `vk-remote.<DEPLOYMENT>`), do these two things:

### 1. Install the App on the deployment's GitHub org

The org owner of the new deployment installs the App:

1. Go to https://github.com/apps/<APP-NAME>/installations/new
2. Select the org (must be an org you own — not just admin on a single repo)
3. Choose repos: "Only select repositories" → pick the project repos
4. Confirm install
5. Note the new **Installation ID** (visible in the URL after install: `installations/<ID>`)

### 2. Add the deployment's callback URLs to the App

Open the App settings (Developer Settings → GitHub Apps → <App>) and add these **three** callback URLs in the "Identifying and authorizing users" section:

```
https://coder.<DEPLOYMENT>/api/v2/users/oauth2/github/callback
https://coder.<DEPLOYMENT>/external-auth/github/callback
https://vk-remote.<DEPLOYMENT>/v1/oauth/github/callback
```

| Callback URL | Used by |
|--------------|---------|
| `coder.<DEPLOYMENT>/api/v2/users/oauth2/github/callback` | Coder's "Sign in with GitHub" flow (workspace user login) |
| `coder.<DEPLOYMENT>/external-auth/github/callback` | Coder's external-auth — VK delegates to this when a workspace user clicks "Connect GitHub" inside VK |
| `vk-remote.<DEPLOYMENT>/v1/oauth/github/callback` | VK Remote's own GitHub login (separate from VK inside a workspace) |

GitHub Apps allow multiple callback URLs — just add each one. Order doesn't matter.

### 3. Wire the App credentials into the Coder template

In your deployment's tfvars (set at `coder templates push` time, NOT committed to repo):

```hcl
github_app_id              = "<APP-ID>"
github_app_installation_id = "<INSTALLATION-ID-from-step-1>"
github_app_private_key_b64 = "<base64-encoded-private-key>"
```

Or pass via `--variable` flags — see `scripts/infra/coder-template-x86/SPEC.md` "Template Push" section.

## Why no wildcard URLs?

GitHub Apps don't support wildcard or pattern-matched callback URLs (security guarantee — every redirect target must be explicitly registered). For 1-5 deployments, the per-deployment-add-3-URLs cost is negligible.

If the count ever grows past ~10 deployments, consider a callback proxy service:

- Single shared URL like `https://gh-callback.holagence.com/<deployment>` registered in the App
- Service receives the OAuth callback, parses the deployment from the path or `state` parameter, 302s to the actual deployment URL
- Adds one piece of infrastructure to maintain — only worth it at scale

## Troubleshooting

### "The redirect_uri is not associated with this application"

Means GitHub doesn't see the URL in the App's callback list. Capture the exact `redirect_uri=` query param from the failing OAuth URL and add it character-by-character to the App settings. Common gotchas:

- Trailing slash (`/callback` vs `/callback/`) — GitHub matches strictly
- Different path than expected (e.g. `/v1/oauth/github/callback` vs `/api/auth/github/callback` — VK uses the former)
- HTTP vs HTTPS

### Token mints but `gh` CLI fails on private repo clone

The App installation on that org doesn't include the repo. Two-step fix:

1. App settings → Configure (on the right org installation) → add the repo to "Repository access"
2. The next `github-app-gh-auth` run picks up the new permissions automatically (token is re-minted on workspace start)

### "Invalid client_id" error

Verify the `GITHUB_APP_ID` matches the App's actual ID (number under the App name in settings — NOT the client ID slug). Also confirm `GITHUB_APP_PRIVATE_KEY_B64` is base64 of the .pem file you downloaded when you generated the key (no extra whitespace, no header/footer trimming).

## Related

- App auth details (image-side): `scripts/infra/coder-image/files/github-app-gh-auth.sh`
- Forgejo bootstrap (separate concern): `scripts/infra/coder-template/SPEC.md` — Forgejo Sidecar section
- Initial App setup script (one-time): `scripts/infra/create-github-app.sh`
