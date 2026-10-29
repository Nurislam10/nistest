'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { QUESTIONS, publicQuestions } = require('./questions');
const { grade } = require('./grading');
const { Store } = require('./store');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 32 * 1024;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function createServer({ adminPassword, dataFile }) {
  const store = new Store(dataFile);
  const sessions = new Map(); // token -> expiresAt

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  }

  function json(res, status, data, headers = {}) {
    send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new Error('too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  function getToken(req) {
    const m = /(?:^|;\s*)admin_session=([a-f0-9]+)/.exec(req.headers.cookie || '');
    return m ? m[1] : null;
  }

  function isAdmin(req) {
    const token = getToken(req);
    const exp = token && sessions.get(token);
    if (!exp) return false;
    if (exp < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function passwordMatches(given) {
    const a = crypto.createHash('sha256').update(String(given)).digest();
    const b = crypto.createHash('sha256').update(adminPassword).digest();
    return crypto.timingSafeEqual(a, b);
  }

  function serveStatic(res, file) {
    const full = path.join(PUBLIC_DIR, file);
    fs.readFile(full, (err, data) => {
      if (err) return send(res, 404, 'Not found');
      send(res, 200, data, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    });
  }

  function cleanText(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  }

  async function handleSubmit(req, res) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { error: 'Қате сұраныс' });
    }
    const name = cleanText(body.name, 100);
    const grade_ = cleanText(body.grade, 20);
    if (!name) return json(res, 400, { error: 'Аты-жөніңізді енгізіңіз' });

    const answers = {};
    const raw = body.answers && typeof body.answers === 'object' ? body.answers : {};
    for (const q of QUESTIONS) {
      const v = raw[q.id];
      if (Number.isInteger(v) && v >= 0 && v < q.options.length) answers[q.id] = v;
    }

    store.add({
      id: crypto.randomUUID(),
      name,
      grade: grade_,
      submittedAt: new Date().toISOString(),
      answers,
      result: grade(answers),
    });
    // Оқушыға нәтиже қайтарылмайды — тек админ көреді.
    json(res, 200, { ok: true });
  }

  async function handleLogin(req, res) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { error: 'Қате сұраныс' });
    }
    if (!passwordMatches(body.password || '')) return json(res, 401, { error: 'Құпиясөз қате' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    json(res, 200, { ok: true }, {
      'Set-Cookie': `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    });
  }

  function summary(r) {
    return {
      id: r.id,
      name: r.name,
      grade: r.grade,
      submittedAt: r.submittedAt,
      score: r.result.score,
      maxScore: r.result.maxScore,
      level: r.result.level.name,
    };
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const m = req.method;

    try {
      if (m === 'GET' && (p === '/' || p === '/index.html')) return serveStatic(res, 'index.html');
      if (m === 'GET' && (p === '/admin' || p === '/admin.html')) return serveStatic(res, 'admin.html');
      if (m === 'GET' && ['/style.css', '/test.js', '/admin.js'].includes(p)) return serveStatic(res, p.slice(1));

      if (m === 'GET' && p === '/api/questions') return json(res, 200, publicQuestions());
      if (m === 'POST' && p === '/api/submit') return await handleSubmit(req, res);

      if (m === 'POST' && p === '/api/admin/login') return await handleLogin(req, res);
      if (m === 'POST' && p === '/api/admin/logout') {
        sessions.delete(getToken(req));
        return json(res, 200, { ok: true }, { 'Set-Cookie': 'admin_session=; HttpOnly; Path=/; Max-Age=0' });
      }

      if (p.startsWith('/api/admin/')) {
        if (!isAdmin(req)) return json(res, 401, { error: 'Кіру қажет' });
        if (m === 'GET' && p === '/api/admin/results') {
          const list = store.all().map(summary).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
          return json(res, 200, list);
        }
        const rm = /^\/api\/admin\/results\/([\w-]+)$/.exec(p);
        if (rm && m === 'GET') {
          const r = store.get(rm[1]);
          return r ? json(res, 200, r) : json(res, 404, { error: 'Табылмады' });
        }
        if (rm && m === 'DELETE') {
          return store.remove(rm[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Табылмады' });
        }
      }

      send(res, 404, 'Not found');
    } catch (err) {
      console.error(err);
      json(res, 500, { error: 'Сервер қатесі' });
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = 'admin123';
    console.warn('ESKERTU: ADMIN_PASSWORD орнатылмаған, әдепкі "admin123" құпиясөзі қолданылады. Оны міндетті түрде өзгертіңіз!');
  }
  const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'results.json');
  createServer({ adminPassword, dataFile }).listen(port, () => {
    console.log(`Тест: http://localhost:${port}/`);
    console.log(`Админ панелі: http://localhost:${port}/admin`);
  });
}
