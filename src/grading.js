'use strict';

const { TOPICS, QUESTIONS } = require('./questions');

const LEVELS = [
  { min: 18, name: 'Жоғары', description: 'Математика мен логикадан білімі өте жақсы, олимпиадалық деңгейдегі есептерге дайын.' },
  { min: 14, name: 'Жақсы', description: 'Негізгі тақырыптарды жақсы меңгерген, жекелеген тақырыптарды бекіту қажет.' },
  { min: 8, name: 'Орташа', description: 'Базалық білім бар, бірақ бірнеше тақырыпта олқылықтар бар.' },
  { min: 0, name: 'Төмен', description: 'Негізгі тақырыптарды қайта бастан жүйелі түрде оқу ұсынылады.' },
];

function levelFor(score) {
  return LEVELS.find((l) => score >= l.min);
}

// answers: { [questionId]: optionIndex }
function grade(answers) {
  const topicStats = {};
  for (const key of Object.keys(TOPICS)) topicStats[key] = { correct: 0, total: 0 };

  const details = QUESTIONS.map((q) => {
    const given = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    const correct = given === q.answer;
    topicStats[q.topic].total += 1;
    if (correct) topicStats[q.topic].correct += 1;
    return {
      id: q.id,
      topic: TOPICS[q.topic].name,
      text: q.text,
      given: given === null ? null : q.options[given],
      correctAnswer: q.options[q.answer],
      correct,
    };
  });

  const score = details.filter((d) => d.correct).length;
  const known = [];
  const toImprove = [];
  for (const [key, s] of Object.entries(topicStats)) {
    const entry = { topic: TOPICS[key].name, correct: s.correct, total: s.total };
    if (s.correct === s.total) known.push(entry);
    else toImprove.push({ ...entry, advice: TOPICS[key].advice });
  }
  // Ең әлсіз тақырыптар бірінші тұрады.
  toImprove.sort((a, b) => a.correct / a.total - b.correct / b.total);

  return { score, maxScore: QUESTIONS.length, level: levelFor(score), known, toImprove, details };
}

module.exports = { grade, levelFor, LEVELS };
