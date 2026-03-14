const http = require('http');
const nodemailer = require('nodemailer');

function readEnv(name, { required = false, defaultValue = undefined } = {}) {
  const value = process.env[name] ?? defaultValue;
  if (required && (!value || String(value).trim() === '')) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(String(header));
  if (!m) return null;
  return m[1];
}

async function main() {
  const listenPort = Number(readEnv('PORT', { defaultValue: '8787' }));
  const serviceToken = readEnv('NODEMAILER_SERVICE_TOKEN', { defaultValue: '' });

  const smtpHost = readEnv('NODEMAILER_SMTP_HOST', { defaultValue: '' });
  const smtpPort = Number(readEnv('NODEMAILER_SMTP_PORT', { defaultValue: '465' }));
  const smtpSecure = parseBool(readEnv('NODEMAILER_SMTP_SECURE', { defaultValue: 'true' }), true);
  const smtpUser = readEnv('NODEMAILER_SMTP_USER', { defaultValue: '' });
  const smtpPass = readEnv('NODEMAILER_SMTP_PASS', { defaultValue: '' });

  const transporter = smtpHost
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth:
          smtpUser && smtpPass
            ? {
                user: smtpUser,
                pass: smtpPass,
              }
            : undefined,
      })
    : null;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' });
        return;
      }

      if (serviceToken && serviceToken.length > 0) {
        const token = getBearerToken(req);
        if (!token || token !== serviceToken) {
          sendJson(res, 401, { error: 'unauthorized' });
          return;
        }
      }

      if (req.url !== '/' && req.url !== '/send') {
        sendJson(res, 404, { error: 'not found' });
        return;
      }

      const payload = await readJson(req);
      if (!payload || typeof payload !== 'object') {
        sendJson(res, 400, { error: 'missing json body' });
        return;
      }

      const to = payload.to;
      const from = payload.from;
      const subject = payload.subject;
      const text = payload.text;
      const html = payload.html;

      if (!transporter) {
        sendJson(res, 503, { error: 'smtp not configured' });
        return;
      }

      if (!to || !from || !subject || (!text && !html)) {
        sendJson(res, 400, { error: 'missing required fields' });
        return;
      }

      await transporter.sendMail({
        to,
        from,
        subject,
        text: text || undefined,
        html: html || undefined,
      });

      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
    }
  });

  await new Promise((resolve) => server.listen(listenPort, resolve));
  process.stdout.write(`mailer-service listening on ${listenPort}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

