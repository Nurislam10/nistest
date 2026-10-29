'use strict';

const $ = (id) => document.getElementById(id);
let currentId = null;

function show(section) {
  for (const id of ['login', 'list', 'detail']) $(id).classList.toggle('hidden', id !== section);
}

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function fmtDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) {
    show('login');
    throw new Error('unauthorized');
  }
  return res.json();
}

async function loadList() {
  const list = await api('/api/admin/results');
  const rows = $('rows');
  rows.replaceChildren();
  for (const r of list) {
    const tr = el('tr');
    tr.append(
      el('td', r.name),
      el('td', r.grade || '—'),
      el('td', fmtDate(r.submittedAt)),
      el('td', `${r.score} / ${r.maxScore}`),
      el('td', r.level),
    );
    tr.addEventListener('click', () => openDetail(r.id));
    rows.append(tr);
  }
  $('empty').classList.toggle('hidden', list.length > 0);

  const overview = $('overview');
  overview.replaceChildren();
  const avg = list.length ? (list.reduce((s, r) => s + r.score, 0) / list.length).toFixed(1) : '—';
  for (const [label, value] of [['Тапсырғандар', list.length], ['Орташа балл', avg]]) {
    const s = el('div', undefined, 'stat');
    s.append(el('div', label, 'muted'), el('div', String(value), 'v'));
    overview.append(s);
  }
  show('list');
}

async function openDetail(id) {
  const r = await api(`/api/admin/results/${encodeURIComponent(id)}`);
  currentId = id;
  const res = r.result;
  $('d-name').textContent = r.name;
  $('d-meta').textContent = `Сынып: ${r.grade || '—'} · ${fmtDate(r.submittedAt)}`;
  $('d-score').textContent = `${res.score} / ${res.maxScore}`;
  $('d-level').textContent = res.level.name;
  $('d-level-desc').textContent = res.level.description;

  const improve = $('d-improve');
  improve.replaceChildren();
  for (const t of res.toImprove) {
    const li = el('li');
    li.append(el('strong', `${t.topic} (${t.correct}/${t.total})`), el('div', t.advice, 'advice'));
    improve.append(li);
  }
  if (!res.toImprove.length) improve.append(el('li', 'Барлық тақырыптар меңгерілген.'));

  const known = $('d-known');
  known.replaceChildren();
  for (const t of res.known) known.append(el('li', `${t.topic} (${t.correct}/${t.total})`));
  if (!res.known.length) known.append(el('li', 'Толық меңгерілген тақырып жоқ.'));

  const body = $('d-answers');
  body.replaceChildren();
  for (const d of res.details) {
    const tr = el('tr');
    const mark = el('td');
    mark.append(el('span', d.correct ? 'Дұрыс' : 'Қате', `badge ${d.correct ? 'ok' : 'bad'}`));
    tr.append(el('td', String(d.id)), el('td', d.topic), el('td', d.text), el('td', d.given ?? '— (жауап жоқ)'), el('td', d.correctAnswer), mark);
    tr.style.cursor = 'default';
    body.append(tr);
  }
  show('detail');
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('password').value }),
  });
  if (!res.ok) {
    $('login-error').textContent = (await res.json()).error || 'Қате';
    return;
  }
  $('password').value = '';
  loadList();
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  show('login');
});

$('back').addEventListener('click', () => loadList());

$('delete').addEventListener('click', async () => {
  if (!currentId || !confirm('Бұл нәтижені өшіруге сенімдісіз бе?')) return;
  await api(`/api/admin/results/${encodeURIComponent(currentId)}`, { method: 'DELETE' });
  loadList();
});

loadList().catch(() => {});
