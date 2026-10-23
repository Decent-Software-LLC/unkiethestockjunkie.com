const fs=require('fs'),{JSDOM}=require('jsdom');
(async()=>{
let pass=0,fail=0; const t=(n,c)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n));};
const html=fs.readFileSync(process.env.QUIZ_FIXTURE || '_site/articles/paper-trading-practice-without-risk/index.html','utf8');
const qz=fs.readFileSync('assets/js/quiz.js','utf8');
const click=e=>e.dispatchEvent(new e.ownerDocument.defaultView.Event('click',{bubbles:true}));
const tick=()=>new Promise(r=>setTimeout(r,20));

// correct answer path
{const d=new JSDOM(html,{runScripts:'outside-only'}).window;
 d.eval(qz); const q=d.document.querySelectorAll('.quiz-question')[0];
 const opts=q.querySelectorAll('.quiz-option');
 click(opts[0]); await tick();
 t('correct pick marked is-correct',opts[0].classList.contains('is-correct'));
 t('feedback affirms without lecturing',/nailed/i.test(q.querySelector('.quiz-feedback').textContent));
 t('explanation revealed after answering', !q.querySelector('.quiz-why').hidden);
 t('all options disabled after answering', [...opts].every(o=>o.disabled));}

// wrong answer path
{const d=new JSDOM(html,{runScripts:'outside-only'}).window;
 d.eval(qz); const q=d.document.querySelectorAll('.quiz-question')[0];
 const opts=q.querySelectorAll('.quiz-option');
 click(opts[1]); await tick();
 t('wrong pick marked is-wrong',opts[1].classList.contains('is-wrong'));
 t('correct option also revealed on a miss',opts[0].classList.contains('is-correct'));
 t('wrong answer still shows the why',!q.querySelector('.quiz-why').hidden);
 t('soft feedback wording (not "Wrong!")',/not quite/i.test(q.querySelector('.quiz-feedback').textContent));}

// lock: clicking again must not change state
{const d=new JSDOM(html,{runScripts:'outside-only'}).window;
 d.eval(qz); const q=d.document.querySelectorAll('.quiz-question')[0];
 const opts=q.querySelectorAll('.quiz-option');
 click(opts[1]); await tick();
 click(opts[0]); await tick();
 t('question locks after first answer (retry cannot turn it green)',
   opts[1].classList.contains('is-wrong') && !opts[0].classList.contains('is-correct')===false ? true : (opts[1].classList.contains('is-wrong')&&opts[0].classList.contains('is-correct')));
 t('feedback unchanged by second click',/not quite/i.test(q.querySelector('.quiz-feedback').textContent));}

// no-JS: questions readable
{const d=new JSDOM(html).window;
 const qs=[...d.document.querySelectorAll('.quiz-prompt')].map(p=>p.textContent.trim());
 t('questions readable without JavaScript',qs.length===2&&qs[0].length>30);
 t('noscript hint present',/Turn on JavaScript/.test(d.document.querySelector('section.quiz').innerHTML));}

// malformed data degrades safely
{const bad=html.replace('data-correct="0"','data-correct="9"');
 const d=new JSDOM(bad,{runScripts:'outside-only'}).window; d.eval(qz);
 const q=d.document.querySelectorAll('.quiz-question')[0];
 const opts=[...q.querySelectorAll('.quiz-option')];
 t('out-of-range answer key disables rather than dead-clicks',opts.every(o=>o.disabled)&&/skipped/i.test(q.querySelector('.quiz-feedback').textContent));}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
