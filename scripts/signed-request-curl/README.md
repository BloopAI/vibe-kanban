# signed-request-curl

Small Node CLI to generate a signed cURL command for:

- `POST /api/auth/signed-test`
- headers: `x-vk-timestamp`, `x-vk-signature`
- signature payload format: `{timestamp}.{method}.{path}`

## Install

```bash
cd scripts/signed-request-curl
npm install
```

## Usage

```bash
node generate-signed-curl.js \
  --public-key "ssh-ed25519 AAAA... user@host" \
  --url "http://127.0.0.1:3001/api/auth/signed-test"
```

This prints one cURL command to stdout that you can paste into Postman import.

### Optional flags

- `--method POST`
- `--body '{"hello":"world"}'`
- `--timestamp 1730000000`
- `--private-key-path ~/.ssh/id_ed25519`
- `--secret-key-b64 <base64 secret key>`
- `--show-json` (prints trusted key JSON snippet to stderr)

## Key loading behavior

1. If `--secret-key-b64` is provided, it signs with that key.
2. Otherwise it tries to find a matching key in `~/.ssh/*.pub` and loads the corresponding private key file.
3. If it cannot find one, pass `--private-key-path` or `--secret-key-b64`.

Notes:
- OpenSSH private keys must be unencrypted for direct parsing in this script.
- If your private key is encrypted, use `--secret-key-b64` instead.
