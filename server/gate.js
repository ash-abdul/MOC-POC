// Access gate for hosted demos. When PORTAL_PASSWORD is set, every page and API call needs a
// shared password first (a signed cookie, valid 7 days). Without the variable – e.g. on a
// developer's machine – the gate is off. Also keeps the demo out of search engines.
import crypto from 'node:crypto';

const COOKIE = 'moe_poc_access';
const MAX_AGE = 7 * 24 * 3600;

export function accessGate() {
  const password = process.env.PORTAL_PASSWORD;
  if (!password) return (_req, _res, next) => next();
  // the cookie value is an HMAC of the password, so changing the password signs everyone out
  const token = crypto.createHmac('sha256', password).update('moe-poc-access').digest('hex');
  const hasAccess = (req) => (req.headers.cookie || '').split(';').some((c) => c.trim() === `${COOKIE}=${token}`);
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  return (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    if (req.path === '/healthz') return res.json({ ok: true });
    if (req.path === '/__access' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        const given = new URLSearchParams(body).get('password') || '';
        if (!same(given, password)) return res.status(401).type('html').send(page(true));
        const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
        res.redirect(303, '/');
      });
      return;
    }
    if (hasAccess(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'access_required', message: 'Demo access password required' });
    res.status(401).type('html').send(page(false));
  };
}

const page = (wrong) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>MoE Registration Portal – PoC access</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8f3;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#232528;padding:16px;box-sizing:border-box}
  .box{background:#fff;border:1px solid #e1e3e5;border-top:4px solid #b68a35;border-radius:12px;padding:28px;width:min(400px,100%);box-shadow:0 4px 18px rgb(0 0 0/.06)}
  h1{font-size:1.2rem;margin:0 0 4px} p{margin:0 0 16px;color:#5f646d;font-size:.9rem}
  .ar{direction:rtl;text-align:right;font-size:.88rem;color:#5f646d;border-top:1px solid #e1e3e5;margin-top:18px;padding-top:12px}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c3c6cb;border-radius:8px;font:inherit;margin-bottom:12px}
  button{width:100%;padding:10px;border:0;border-radius:8px;background:#92722a;color:#fff;font:inherit;font-weight:600;cursor:pointer}
  .err{background:#fdf3f2;color:#a3221c;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:.88rem}
</style></head><body><form class="box" method="post" action="/__access">
  <h1>MoE School Registration Portal</h1>
  <p>Proof of concept with synthetic data only. Not an official Ministry of Education or UAE PASS service. Enter the demo access password.</p>
  ${wrong ? '<div class="err">Incorrect password.</div>' : ''}
  <input type="password" name="password" placeholder="Access password" autofocus required>
  <button type="submit">Continue</button>
  <div class="ar">نموذج إثبات مفهوم ببيانات تجريبية فقط، وليس خدمة رسمية لوزارة التربية والتعليم أو الهوية الرقمية. أدخل كلمة مرور العرض.</div>
</form></body></html>`;
