/**
 * Validate `quiz:` front matter for articles.
 *
 * Shared by scripts/backfill-quiz.js (authoring) and the test suite, so a malformed or
 * unsellable quiz fails locally instead of publishing a question whose answer key points
 * off the end of the option list.
 *
 * A quiz with a broken answer key is worse than no quiz: the reader is told confidently
 * that a false statement about money is true. On a site read by teenagers learning to
 * invest, that is the one failure mode worth gating hard.
 */
'use strict';

const MAX_QUESTIONS = 3;
const MAX_QUESTION_CHARS = 200;
const MAX_OPTION_CHARS = 120;

/**
 * @param {*} quiz value of page.quiz
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateQuiz(quiz) {
  const errors = [];

  if (quiz === undefined || quiz === null) return { ok: true, errors };
  if (!Array.isArray(quiz)) {
    return { ok: false, errors: ['quiz must be a list'] };
  }
  if (quiz.length === 0) return { ok: true, errors };
  if (quiz.length > MAX_QUESTIONS) {
    errors.push(`quiz has ${quiz.length} questions; keep it to ${MAX_QUESTIONS} (two reads best for this audience)`);
  }

  quiz.forEach((q, i) => {
    const at = `question ${i + 1}`;
    if (!q || typeof q !== 'object') {
      errors.push(`${at}: must be a mapping`);
      return;
    }

    if (typeof q.question !== 'string' || !q.question.trim()) {
      errors.push(`${at}: missing "question"`);
    } else if (q.question.length > MAX_QUESTION_CHARS) {
      errors.push(`${at}: question longer than ${MAX_QUESTION_CHARS} chars (${q.question.length})`);
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`${at}: needs at least 2 options`);
      return; // answer check below is meaningless without options
    }
    if (q.options.length > 5) errors.push(`${at}: more than 5 options`);

    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) {
      errors.push(`${at}: every option must be non-empty text`);
    }
    if (q.options.some((o) => typeof o === 'string' && o.length > MAX_OPTION_CHARS)) {
      errors.push(`${at}: an option exceeds ${MAX_OPTION_CHARS} chars`);
    }

    const seen = new Set();
    for (const o of q.options) {
      const key = typeof o === 'string' ? o.trim().toLowerCase() : String(o);
      if (seen.has(key)) errors.push(`${at}: duplicate option "${key}"`);
      seen.add(key);
    }

    // Answer must be an in-range integer index, not a string from YAML shenanigans.
    if (!Number.isInteger(q.answer)) {
      errors.push(`${at}: "answer" must be an integer index (got ${JSON.stringify(q.answer)})`);
    } else if (q.answer < 0 || q.answer >= q.options.length) {
      errors.push(`${at}: answer index ${q.answer} is outside 0..${q.options.length - 1}`);
    }

    if (q.why !== undefined && (typeof q.why !== 'string' || !q.why.trim())) {
      errors.push(`${at}: "why" must be non-empty text when present`);
    }
  });

  return { ok: errors.length === 0, errors };
}

module.exports = { validateQuiz, MAX_QUESTIONS, MAX_QUESTION_CHARS, MAX_OPTION_CHARS };
