import assert from 'node:assert/strict';
import test from 'node:test';

// Mirror of resolveBinaryBaseUrl — keep in sync with download.ts helper.
function resolveBinaryBaseUrl(baked, envValue) {
  const raw = (envValue && envValue.trim()) || baked;
  return raw.replace(/\/$/, '');
}

test('uses baked URL when env unset', () => {
  assert.equal(
    resolveBinaryBaseUrl('https://npm-cdn.example.com', undefined),
    'https://npm-cdn.example.com'
  );
});

test('env override wins and strips trailing slash', () => {
  assert.equal(
    resolveBinaryBaseUrl('https://npm-cdn.example.com', 'https://mirror.example/binaries/'),
    'https://mirror.example/binaries'
  );
});

test('blank env falls back to baked', () => {
  assert.equal(
    resolveBinaryBaseUrl('https://npm-cdn.example.com', '   '),
    'https://npm-cdn.example.com'
  );
});
