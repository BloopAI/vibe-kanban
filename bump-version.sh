TIMESTAMP="$(date +%s)"

if [[ "$1" == "--prerelease" ]]; then
  npm version prerelease --preid="$2" --no-git-tag-version
elif [[ "$1" == "--major" ]]; then
  npm version major --no-git-tag-version
elif [[ "$1" == "--minor" ]]; then
  npm version minor --no-git-tag-version
else
  npm version patch --no-git-tag-version
fi

NEW_VERSION=$(node -p "require('./package.json').version")
NEW_TAG="v$NEW_VERSION.$TIMESTAMP"

echo "NEW_VERSION: $NEW_VERSION"
echo "NEW_TAG: $NEW_TAG"

(
  cd npx-cli || exit
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
)

(
  cd packages/local-web || exit
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
)

cargo set-version "$NEW_VERSION"

node -e "
  const fs = require('fs');
  const path = 'crates/tauri-app/tauri.conf.json';
  const conf = JSON.parse(fs.readFileSync(path, 'utf8'));
  conf.version = '$NEW_VERSION';
  fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
"

git add package.json Cargo.lock pnpm-lock.yaml npx-cli/package.json npx-cli/package-lock.json packages/local-web/package.json crates/tauri-app/tauri.conf.json
git add $(find . -name Cargo.toml)
[ -f crates/remote/Cargo.lock ] && git add crates/remote/Cargo.lock || true
[ -f crates/relay-tunnel/Cargo.lock ] && git add crates/relay-tunnel/Cargo.lock || true
git commit -m "chore: bump version to $NEW_VERSION"
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
