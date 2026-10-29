'use strict';

const $ = (id) => document.getElementById(id);
let questions = [];
let current = 0;
const answers = {};
let student = null;

function show(section) {
  for (const id of ['start', 'quiz', 'done']) $(id).classList.toggle('hidden', id !== section);
}

function render() {
  const q = questions[current];
  $('counter').textContent = `Сұрақ ${current + 1} / ${questions.length}`;
  $('bar').style.width = `${(Object.keys(answers).length / questions.length) * 100}%`;
  $('topic').textContent = q.topic;
  $('question').textContent = `${current + 1}. ${q.text}`;

  const box = $('options');
  box.replaceChildren();
  q.options.forEach((opt, i) => {
    const label = document.createElement('label');
    label.className = 'option' + (answers[q.id] === i ? ' selected' : '');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `q${q.id}`;
    input.checked = answers[q.id] === i;
    input.addEventListener('change', () => {
      answers[q.id] = i;
      render();
    });
    label.append(input, document.createTextNode(opt));
    box.append(label);
  });

  $('prev').disabled = current === 0;
  const last = current === questions.length - 1;
  $('next').textContent = last ? 'Аяқтау' : 'Келесі →';

  const dots = $('dots');
  dots.replaceChildren();
  questions.forEach((qq, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = i + 1;
    if (answers[qq.id] !== undefined) b.classList.add('answered');
    if (i === current) b.classList.add('current');
    b.addEventListener('click', () => { current = i; render(); });
    dots.append(b);
  });
  $('quiz-error').textContent = '';
}

async function submit() {
  const unanswered = questions.map((q, i) => (answers[q.id] === undefined ? i + 1 : null)).filter(Boolean);
  if (unanswered.length && !confirm(`Жауап берілмеген сұрақтар: ${unanswered.join(', ')}. Сонда да аяқтайсыз ба?`)) return;
  $('next').disabled = true;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...student, answers }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Қате');
    show('done');
  } catch (e) {
    $('quiz-error').textContent = `Жіберу сәтсіз аяқталды: ${e.message}. Қайталап көріңіз.`;
    $('next').disabled = false;
  }
}

$('start-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  if (!name) return;
  student = { name, grade: $('grade').value.trim() };
  try {
    const res = await fetch('/api/questions');
    questions = await res.json();
  } catch {
    $('start-error').textContent = 'Сұрақтарды жүктеу мүмкін болмады.';
    return;
  }
  show('quiz');
  render();
});

$('prev').addEventListener('click', () => { if (current > 0) { current -= 1; render(); } });
$('next').addEventListener('click', () => {
  if (current < questions.length - 1) { current += 1; render(); } else submit();
});
