#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nacl = require('tweetnacl');

const DEFAULT_URL = 'http://127.0.0.1:3001/api/auth/signed-test';
const DEFAULT_METHOD = 'POST';
const OPENSSH_PRIVATE_KEY_HEADER = '-----BEGIN OPENSSH PRIVATE KEY-----';
const OPENSSH_PRIVATE_KEY_FOOTER = '-----END OPENSSH PRIVATE KEY-----';
const OPENSSH_KEY_MAGIC = 'openssh-key-v1\0';
const BOOLEAN_FLAGS = new Set(['help', 'show-json']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      fail(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      args[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      fail(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node generate-signed-curl.js --public-key "<ssh-ed25519 ...>" [options]

Required:
  --public-key        OpenSSH public key line (ssh-ed25519 ...)

Options:
  --url               Request URL (default: ${DEFAULT_URL})
  --method            HTTP method (default: ${DEFAULT_METHOD})
  --body              Request body (default: empty)
  --timestamp         Unix timestamp seconds (default: now)
  --private-key-path  OpenSSH private key path (unencrypted key)
  --secret-key-b64    64-byte (or 32-byte seed) secret key in base64
  --show-json         Print trusted key JSON snippet
  --help              Show this help

Examples:
  node generate-signed-curl.js --public-key "ssh-ed25519 AAAA... user@host"
  node generate-signed-curl.js --public-key "ssh-ed25519 AAAA... user@host" --url "http://127.0.0.1:4001/api/auth/signed-test"
  node generate-signed-curl.js --public-key "ssh-ed25519 AAAA... user@host" --secret-key-b64 "<base64>"
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  readU32() {
    if (this.offset + 4 > this.buffer.length) {
      throw new Error('Unexpected end while reading uint32');
    }
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readBytes(length) {
    if (this.offset + length > this.buffer.length) {
      throw new Error('Unexpected end while reading bytes');
    }
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readStringBuffer() {
    const length = this.readU32();
    return this.readBytes(length);
  }

  readStringUtf8() {
    return this.readStringBuffer().toString('utf8');
  }
}

function parseOpenSshPublicKeyLine(publicKeyLine) {
  const tokens = publicKeyLine.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    throw new Error('Expected OpenSSH public key format: "ssh-ed25519 AAAA..."');
  }
  const keyType = tokens[0];
  const blobB64 = tokens[1];
  if (keyType !== 'ssh-ed25519') {
    throw new Error(`Unsupported key type: ${keyType} (expected ssh-ed25519)`);
  }

  const blob = Buffer.from(blobB64, 'base64');
  if (blob.length === 0) {
    throw new Error('Public key blob is not valid base64');
  }

  const reader = new BinaryReader(blob);
  const encodedType = reader.readStringUtf8();
  const rawPublicKey = reader.readStringBuffer();

  if (encodedType !== 'ssh-ed25519') {
    throw new Error(
      `Public key blob type mismatch: ${encodedType} (expected ssh-ed25519)`
    );
  }
  if (rawPublicKey.length !== 32) {
    throw new Error(
      `Public key length was ${rawPublicKey.length}, expected 32 bytes`
    );
  }

  return {
    keyType,
    blobB64,
    rawPublicKey,
    rawPublicKeyB64: rawPublicKey.toString('base64')
  };
}

function parseOpenSshPrivateKey(privateKeyPath) {
  const pem = fs.readFileSync(privateKeyPath, 'utf8');
  if (!pem.includes(OPENSSH_PRIVATE_KEY_HEADER)) {
    throw new Error('Private key must be an OpenSSH private key file');
  }

  const body = pem
    .replace(OPENSSH_PRIVATE_KEY_HEADER, '')
    .replace(OPENSSH_PRIVATE_KEY_FOOTER, '')
    .replace(/\s+/g, '');
  const raw = Buffer.from(body, 'base64');
  if (raw.length === 0) {
    throw new Error('Private key file is not valid base64');
  }

  const reader = new BinaryReader(raw);
  const magic = reader.readBytes(OPENSSH_KEY_MAGIC.length).toString('binary');
  if (magic !== OPENSSH_KEY_MAGIC) {
    throw new Error('Not an OpenSSH key-v1 private key');
  }

  const cipherName = reader.readStringUtf8();
  const kdfName = reader.readStringUtf8();
  const _kdfOptions = reader.readStringBuffer();
  const keyCount = reader.readU32();

  if (cipherName !== 'none' || kdfName !== 'none') {
    throw new Error(
      'Encrypted OpenSSH private keys are not supported. Use --secret-key-b64 instead.'
    );
  }
  if (keyCount < 1) {
    throw new Error('Private key file has no keys');
  }

  for (let i = 0; i < keyCount; i++) {
    reader.readStringBuffer();
  }

  const privateBlock = reader.readStringBuffer();
  const privateReader = new BinaryReader(privateBlock);
  const check1 = privateReader.readU32();
  const check2 = privateReader.readU32();
  if (check1 !== check2) {
    throw new Error('OpenSSH private key checkints do not match');
  }

  const keyType = privateReader.readStringUtf8();
  if (keyType !== 'ssh-ed25519') {
    throw new Error(
      `Unsupported private key type: ${keyType} (expected ssh-ed25519)`
    );
  }

  const publicKey = privateReader.readStringBuffer();
  const privateKey = privateReader.readStringBuffer();
  privateReader.readStringBuffer();

  if (publicKey.length !== 32) {
    throw new Error(`Invalid embedded public key length: ${publicKey.length}`);
  }
  if (privateKey.length !== 64) {
    throw new Error(`Invalid embedded private key length: ${privateKey.length}`);
  }

  return {
    publicKey,
    privateKey
  };
}

function findMatchingPrivateKeyPath(publicKeyBlobB64) {
  const sshDir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(sshDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(sshDir)
    .filter((name) => name.endsWith('.pub'))
    .map((name) => path.join(sshDir, name));

  const matches = [];
  for (const pubPath of candidates) {
    try {
      const line = fs.readFileSync(pubPath, 'utf8').trim();
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2 && tokens[1] === publicKeyBlobB64) {
        const privateKeyPath = pubPath.slice(0, -4);
        if (fs.existsSync(privateKeyPath)) {
          matches.push(privateKeyPath);
        }
      }
    } catch (_error) {
      // Ignore unreadable candidate files.
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(
      `Found multiple matching private keys: ${matches.join(', ')}. Pass --private-key-path explicitly.`
    );
  }
  return null;
}

function decodeSecretKeyFromBase64(secretKeyB64) {
  const decoded = Buffer.from(secretKeyB64, 'base64');
  if (decoded.length === 64) {
    return Uint8Array.from(decoded);
  }
  if (decoded.length === 32) {
    return nacl.sign.keyPair.fromSeed(Uint8Array.from(decoded)).secretKey;
  }
  throw new Error(
    `Secret key length was ${decoded.length} bytes, expected 64 bytes (or 32-byte seed).`
  );
}

function loadSecretKeyBytes(args, parsedPublic) {
  if (args['secret-key-b64']) {
    const secretKey = decodeSecretKeyFromBase64(args['secret-key-b64']);
    const derivedPublic = Buffer.from(secretKey.slice(32));
    if (!derivedPublic.equals(parsedPublic.rawPublicKey)) {
      throw new Error(
        'Provided --secret-key-b64 does not match the provided --public-key'
      );
    }
    return secretKey;
  }

  const privateKeyPath =
    args['private-key-path'] || findMatchingPrivateKeyPath(parsedPublic.blobB64);
  if (!privateKeyPath) {
    throw new Error(
      'No matching private key was found in ~/.ssh. Pass --private-key-path or --secret-key-b64.'
    );
  }

  const parsedPrivate = parseOpenSshPrivateKey(privateKeyPath);
  if (!Buffer.from(parsedPrivate.publicKey).equals(parsedPublic.rawPublicKey)) {
    throw new Error(
      `Private key at ${privateKeyPath} does not match provided public key`
    );
  }
  return Uint8Array.from(parsedPrivate.privateKey);
}

function getTimestamp(args) {
  if (!args.timestamp) {
    return Math.floor(Date.now() / 1000);
  }
  const value = Number.parseInt(args.timestamp, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --timestamp value: ${args.timestamp}`);
  }
  return value;
}

function singleQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const publicKeyArg = args['public-key'];
  if (!publicKeyArg) {
    fail('Missing required --public-key');
  }

  const parsedPublic = parseOpenSshPublicKeyLine(publicKeyArg);
  const secretKey = loadSecretKeyBytes(args, parsedPublic);

  const url = args.url || DEFAULT_URL;
  const method = (args.method || DEFAULT_METHOD).toUpperCase();
  const body = args.body || '';
  const timestamp = getTimestamp(args);

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid --url: ${error.message}`);
  }

  const pathOnly = parsedUrl.pathname;
  const message = `${timestamp}.${method}.${pathOnly}`;
  const signature = nacl.sign.detached(
    Buffer.from(message, 'utf8'),
    Uint8Array.from(secretKey)
  );
  const signatureB64 = Buffer.from(signature).toString('base64');

  if (args['show-json']) {
    console.error('trusted_ed25519_public_keys.json snippet:');
    console.error(
      JSON.stringify({ keys: [parsedPublic.rawPublicKeyB64] }, null, 2)
    );
    console.error('');
  }

  const curlParts = [
    'curl',
    '-X',
    method,
    singleQuote(url),
    '-H',
    singleQuote(`x-vk-timestamp: ${timestamp}`),
    '-H',
    singleQuote(`x-vk-signature: ${signatureB64}`)
  ];

  if (body) {
    curlParts.push('-H', singleQuote('content-type: application/json'));
    curlParts.push('--data', singleQuote(body));
  }

  console.log(curlParts.join(' '));
}

try {
  main();
} catch (error) {
  fail(error.message);
}
