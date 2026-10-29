'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../src/server');
const { QUESTIONS } = require('../src/questions');
const { grade } = require('../src/grading');

test('grading: all correct gives max score and no topics to improve', () => {
  const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.answer]));
  const r = grade(answers);
  assert.strictEqual(r.score, 20);
  assert.strictEqual(r.level.name, 'Жоғары');
  assert.strictEqual(r.toImprove.length, 0);
  assert.strictEqual(r.known.length, 10);
});

test('grading: empty answers puts every topic into toImprove', () => {
  const r = grade({});
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.level.name, 'Төмен');
  assert.strictEqual(r.known.length, 0);
  assert.strictEqual(r.toImprove.length, 10);
});

test('http: student gets no answers or results; admin does', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlt-'));
  const server = createServer({ adminPassword: 'secret', dataFile: path.join(dir, 'r.json') });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const qs = await (await fetch(`${base}/api/questions`)).json();
  assert.strictEqual(qs.length, 20);
  assert.ok(qs.every((q) => !('answer' in q)));

  const answers = Object.fromEntries(QUESTIONS.slice(0, 10).map((q) => [q.id, q.answer]));
  const sub = await fetch(`${base}/api/submit`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Айбек', grade: '7А', answers }),
  });
  assert.deepStrictEqual(await sub.json(), { ok: true });

  assert.strictEqual((await fetch(`${base}/api/admin/results`)).status, 401);
  const bad = await fetch(`${base}/api/admin/login`, { method: 'POST', body: '{"password":"x"}' });
  assert.strictEqual(bad.status, 401);

  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', body: '{"password":"secret"}' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const list = await (await fetch(`${base}/api/admin/results`, { headers: { cookie } })).json();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].score, 10);
  const detail = await (await fetch(`${base}/api/admin/results/${list[0].id}`, { headers: { cookie } })).json();
  assert.strictEqual(detail.result.known.length, 5);
  assert.strictEqual(detail.result.toImprove.length, 5);
});
