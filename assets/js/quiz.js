/**
 * Grades the end-of-article quiz rendered by _includes/quiz.html.
 *
 * Contract with the template:
 *   .quiz-question[data-correct="1"]  -> index of the correct option
 *   .quiz-option[data-index="0"]      -> each choice
 *   .quiz-feedback                    -> aria-live region for this question
 *   .quiz-why[hidden]                 -> explanation, revealed after an answer
 *
 * Behaviour notes:
 *  - Once answered, a question locks. Re-clicking to hunt for the right button teaches
 *    nothing and makes the green state meaningless; the explanation is what should be read.
 *  - The wrong-answer path is encouraging rather than corrective. Getting it wrong in front
 *    of peers is the reason teens disengage from these things.
 *  - Nothing is stored or scored. See _includes/quiz.html for why streaks are avoided.
 */
(function () {
  'use strict';

  var questions = document.querySelectorAll('.quiz-question');
  if (!questions.length) return;

  Array.prototype.forEach.call(questions, function (question) {
    var options = question.querySelectorAll('.quiz-option');
    var feedback = question.querySelector('.quiz-feedback');
    var why = question.querySelector('.quiz-why');
    var correctAttr = parseInt(question.getAttribute('data-correct'), 10);
    var answered = false;

    // Malformed data must not strand the reader with dead buttons.
    if (isNaN(correctAttr) || correctAttr < 0 || correctAttr >= options.length) {
      Array.prototype.forEach.call(options, function (o) {
        o.disabled = true;
      });
      if (feedback) feedback.textContent = 'This question had a problem and was skipped — keep reading.';
      return;
    }

    Array.prototype.forEach.call(options, function (option) {
      option.addEventListener('click', function () {
        if (answered) return;
        answered = true;

        var picked = parseInt(option.getAttribute('data-index'), 10);
        var right = picked === correctAttr;

        Array.prototype.forEach.call(options, function (o, i) {
          o.disabled = true;
          o.setAttribute('aria-pressed', String(i === picked));
          if (i === correctAttr) o.classList.add('is-correct');
          if (i === picked && !right) o.classList.add('is-wrong');
        });

        if (feedback) {
          feedback.textContent = right ? 'Nailed it.' : 'Not quite — here’s the thing:';
          feedback.classList.add(right ? 'is-right' : 'is-off');
        }

        if (why && why.textContent.trim()) {
          why.hidden = false;
          // A wrong answer without the reasoning is just a red X; surface it either way.
          why.classList.add('revealed');
        }

        question.classList.add('answered');
      });
    });
  });
})();
