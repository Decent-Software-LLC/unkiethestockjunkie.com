#!/usr/bin/env node
/**
 * Unkie The Stock Junkie - Article Generator
 * 
 * Generates educational investing articles using NVIDIA's free Nemotron 3 Nano Omni 30B API
 * and creates custom illustrations using NVIDIA's FLUX.1-schnell image generation.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Shared with scripts/backfill-related-articles.js so a generated article and a backfilled
// one can never disagree about what "related" means. Reusing rankRelated is deliberate:
// reimplementing scoring here drifted once already, and pickRelatedArticles below used to be
// imported from this module under a name that does not exist - destructuring a missing export
// yields undefined rather than throwing, so it would have failed at call time, not load time.
const { loadArticleIndex, rankRelated, toFrontMatter } = require('./lib/related-articles');
// Single tested implementation of scaffolding removal. Importing rather than re-implementing
// here matters: the inline regex version guarded every rule with a "##" prefix while the model
// emits bold headings, so 95% of articles published their own writing instructions and no test
// noticed. A missing binding here is a ReferenceError at generate time, which is why
// scripts/test-prompt.js now exercises this function directly.
const { cleanBodyText: stripScaffolding } = require('./clean-article-bodies');
const { validateQuiz, MIN_QUESTIONS } = require('./lib/quiz');
const { checkCandidate, MIN_WORDS } = require('./lib/candidate-gate');

// Configuration
const TOPICS_FILE = path.join(__dirname, '..', 'topics.json');
const GENERATED_TOPICS_FILE = path.join(__dirname, '..', 'generated-topics.json');
const PUBLISH_RESULT_FILE = path.join(__dirname, '..', '.generate-result.json');
const QUIZ_BANK_FILE = path.join(__dirname, 'quiz-content.json');

function readQuizBank() {
  try { return JSON.parse(fs.readFileSync(QUIZ_BANK_FILE, 'utf8')); } catch (e) { return {}; }
}
const ARTICLES_DIR = path.join(__dirname, '..', '_articles');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images', 'articles');
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// Ensure directories exist
if (!fs.existsSync(ARTICLES_DIR)) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Utility: Delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Utility: Format date for filename
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Utility: Load topics
function loadTopics() {
  try {
    const data = fs.readFileSync(TOPICS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading topics:', error.message);
    process.exit(1);
  }
}

// Utility: Load generated topics tracking
function loadGeneratedTopics() {
  try {
    const data = fs.readFileSync(GENERATED_TOPICS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { generated: [], lastReset: new Date().toISOString() };
  }
}

// Utility: Save generated topics tracking
function saveGeneratedTopics(data) {
  fs.writeFileSync(GENERATED_TOPICS_FILE, JSON.stringify(data, null, 2));
}

// Utility: Check if article already exists
function articleExists(topic) {
  const slug = generateSlug(topic.title);
  const files = fs.readdirSync(ARTICLES_DIR);
  return files.some(file => file.includes(slug));
}

// Utility: Select unused topic
function selectUnusedTopic(topics, generated) {
  // Filter out topics already in tracking AND topics with existing files
  const unused = topics.filter(topic => {
    const inTracking = !generated.includes(topic.title);
    const fileExists = articleExists(topic);
    return inTracking && !fileExists;
  });

  if (unused.length === 0) {
    console.log('⚠️ All topics have been generated. Resetting tracking file...');
    return { topic: topics[0], reset: true };
  }

  // Random selection
  const randomIndex = Math.floor(Math.random() * unused.length);
  return { topic: unused[randomIndex], reset: false };
}

// Utility: Generate image using NVIDIA FLUX.1-schnell with fallback to dev
async function generateImage(topic) {
  if (!NVIDIA_API_KEY) {
    console.log('⚠️ No NVIDIA_API_KEY found. Skipping image generation.');
    return null;
  }

  const imagePrompt = generateImagePrompt(topic);

  // FLUX.3 Image Klein (fast, reliable successor to FLUX.1)
  try {
    console.log('🎨 Generating illustration with FLUX.3 Image Klein...');

    const response = await axios.post(
      'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein',
      {
        prompt: imagePrompt,
        width: 1024,
        height: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 120000
      }
    );

    let imageData = extractImageData(response.data);
    if (imageData) {
      return saveImage(imageData, topic);
    }

    console.log('⚠️ FLUX.3 returned no image');
  } catch (error) {
    console.error('❌ FLUX.3 Image Klein failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }

  return null;
}

// Helper: Extract image data from various API response formats
function extractImageData(data) {
  if (data && data.image) {
    return data.image;
  } else if (data && data.artifacts && data.artifacts.length > 0) {
    // FLUX API returns artifacts array with base64 images
    return data.artifacts[0].base64 || data.artifacts[0];
  }
  return null;
}

// Helper: Save image to disk
function saveImage(imageData, topic) {
  const imageBuffer = Buffer.from(imageData, 'base64');
  const imageFileName = `${generateSlug(topic.title)}-${Date.now()}.jpg`;
  const imagePath = path.join(IMAGES_DIR, imageFileName);

  fs.writeFileSync(imagePath, imageBuffer);
  console.log(`✅ Image generated: ${imageFileName}`);

  return `/assets/images/articles/${imageFileName}`;
}

// Utility: Generate image prompt
function generateImagePrompt(topic) {
  const basePrompt = "Modern minimalist editorial illustration, flat design style, vibrant gradient background with blues and purples, clean geometric shapes, abstract financial concept visualization, professional stock market theme, flat vector art style, no text, high quality, suitable for educational blog header";
  
  const topicSpecific = {
    'warren-buffett': ' wise elderly investor silhouette, Berkshire Hathaway, value investing concept',
    'benjamin-graham': ' open book, margin of safety, security analysis',
    'peter-lynch': ' growth chart, upward trend, magnifying glass',
    'carl-icahn': ' activist investor, chess piece strategy, corporate shakeup',
    'stocks': ' stock chart, upward trend, financial growth',
    'dividends': ' money flowing, passive income, wealth building',
    'compound-interest': ' exponential growth curve, time and money concept',
    'risk': ' balanced scale, risk vs reward visualization',
    'diversification': ' pie chart, portfolio balance, multiple assets',
    'market-crash': ' market dip, recovery, resilience concept'
  };
  
  // Find matching keyword in tags
  let specific = '';
  for (const [keyword, description] of Object.entries(topicSpecific)) {
    if (topic.tags.includes(keyword)) {
      specific = description;
      break;
    }
  }
  
  return `${basePrompt}${specific}`;
}

// ---------------------------------------------------------------------------
// Model calls
//
// Two separate completions per article instead of one mega-request. The first gated run made this
// obvious: asked for an article AND a trailing JSON quiz in a single 6,000-character prompt, the model
// returned the article every time and the quiz never -- all three rejected completions ended on the
// disclaimer line, and none used the injected slug list. Long briefs get partially obeyed. Asking for
// the quiz alone, over the finished text, gets it in one shot and produces better questions because
// the writer can see what the article actually argues.
// ---------------------------------------------------------------------------

const SYSTEM_CONTRACT = `You write financial education for unkiethestockjunkie.com, read mostly by 16- and
17-year-olds in the US who have a part-time job, a licence and money doing nothing in a savings account.
They are not a demographic to flatter; they are readers who quit the second something sounds like school.

Hard output rules, which the publisher enforces mechanically:
- Emit exactly what is asked for and nothing else. No preamble, no meta-commentary, no sign-off to the reader.
- Never write YAML, "---" fences, a "# Title" heading, or restate a title/description/difficulty/tags.
  Code assembles front matter; any copy of it in your prose gets published as garbage.
- Internal links must be copied character-for-character from the list you are given. Never invent,
  shorten, guess or modify a URL. If the list has nothing relevant, include no links.
- Do not reuse example sentences from these instructions as your own sentences.`;

async function callNemotron(userContent, systemText, maxTokens) {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set');
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await apiPost({
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: maxTokens || 8192,
        stream: false,
        // Free-tier Nemotron reasoning spends most of its budget writing reasoning_content we discard:
        // full-length requests exceeded the 300s timeout without ever returning prose (verified live).
        // Thinking off returns in seconds and graded quality on our output was unchanged.
        chat_template_kwargs: { enable_thinking: false }
      });
      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content;
      }
      throw new Error('Unexpected response format from NVIDIA API');
    } catch (error) {
      const status = error.response && error.response.status;
      // Throttling is routine here, not exceptional -- the free tier reports "Worker local total request
      // limit reached (56/16)" under load. A 30s give-up meant busy days published nothing at all.
      if ((status === 503 || status === 429) && attempt < 3) {
        const waitSec = [60, 120, 180][attempt] + Math.floor(Math.random() * 20);
        console.log(`\u26a0\ufe0f ${status} (worker exhausted), backing off ${waitSec}s...`);
        await delay(waitSec * 1000);
        continue;
      }
      // Throws rather than process.exit(): an earlier version called process.exit(1) from inside this
      // helper on the final 503, which killed the script mid-loop, skipped candidate cleanup, and let
      // the workflow commit an orphan illustration for an article that was never written (d1fde08).
      throw error;
    }
  }
}

async function generateArticleContent(topic, repairNote) {
  const brief = generateArticlePrompt(topic, linkPoolFor(topic));
  const user = repairNote
    ? `${brief}\n\nPUBLISHER REMINDER (a previous attempt was rejected):\n${repairNote}`
    : brief;
  return callNemotron(user, SYSTEM_CONTRACT);
}

// One short focused request for the quiz. Returns a validated array or null -- callers fall back to the
// hand-written bank in scripts/quiz-content.json before ever publishing a page without questions.
async function generateQuizDraft(topic, bodyText) {
  const excerpt = String(bodyText || '').slice(0, 5200);
  const user = `Write the end-of-article quiz for the article below.

Return ONE JSON array and nothing else -- no prose, no code fences, no explanation. Exactly 2 or 3 objects, each shaped:
{"question":"...","options":["...","...","..."],"answer":0,"why":"..."}

Rules that get checked mechanically:
- "answer" is the zero-based index of the correct option.
- Every question tests a mechanism or a consequence stated in the article, not trivia like a year or a name.
- Wrong options must be believable to someone who half-read it. Never "all of the above" or "none of the above".
- No option may promise safety, guarantees, tax benefits or insurance against losses.
- "why" is one plain sentence saying why that option is right.

ARTICLE:
${topic.title}

${excerpt}`;
  let lastError = null;
  // Ask twice. A small model returning one question instead of two or three is a formatting miss, not a
  // verdict on the article, and re-asking costs seconds while discarding the topic costs the day.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ask = attempt === 1 ? user : `${user}

Your previous answer was rejected (${lastError}). Return exactly 2 or 3 objects in the array.`;
    let raw;
    try {
      raw = await callNemotron(ask, 'You output a single valid JSON array and nothing else.', 1200);
    } catch (err) {
      lastError = err.message;
      continue;
    }
    const parsed = parseQuizJson(raw);
    if (parsed.quiz && parsed.quiz.length >= MIN_QUESTIONS) return parsed.quiz;
    lastError = parsed.error || `only ${parsed.quiz ? parsed.quiz.length : 0} question(s); need at least ${MIN_QUESTIONS}`;
    // Print what actually came back. "no quiz found" with no evidence turned this into a guessing game
    // across two deploys; the edges are usually enough to see whether the model wrote YAML, prose, or one item.
    console.log(`   quiz attempt ${attempt} rejected (${lastError}); raw: ${JSON.stringify(String(raw).slice(0, 160))}`);
  }
  return null;
}

// Single place that talks to the API, so headers and timeouts cannot drift between calls.
async function apiPost(payload) {
  return axios.post('https://integrate.api.nvidia.com/v1/chat/completions', payload, {
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    timeout: 300000
  });
}

// Parse a completion that is supposed to be just a JSON array. Tolerates code fences and a sentence of
// chit-chat around it, because models add those; stays strict about the array itself.
function parseQuizJson(text) {
  const found = findQuizArray(String(text || ''));
  if (!found) return { quiz: null, error: 'no JSON question array found in response' };
  const v = validateQuiz(found.quiz);
  if (!v.ok) return { quiz: null, error: v.errors.join('; ') };
  return { quiz: found.quiz, error: null };
}

// Utility: Generate article prompt
//
// Why this brief is this specific: audited against the published corpus (101 articles), the
// old prompt produced text no teenager would read to the end - 74% opened "As a teenager,
// you...", 73% said "it's essential to", 40% announced "in this article, we'll explore",
// 26 reused the same lemonade-stand analogy, and TikTok/YouTube each appeared in 1% of
// articles despite being where this audience actually spends time. Every opening was
// "Imagine you're at a [concert|football game|rollercoaster]". The bans below are those
// exact findings; the examples are written, not described.
//
// It also previously contradicted itself: it banned "Why Should Teens Care" as a heading and
// then told the model to use "Why Teens Should Care" as an example heading. That kind of
// conflict is how scaffolding ended up published 95% of the time.
function generateArticlePrompt(topic, linkPoolText) {
  const difficultyNote = {
    'beginner': 'Assume zero finance vocabulary. Define a term the first time it appears, in passing, without stopping to lecture.',
    'intermediate': 'The reader knows what a stock, an index and a dividend are. Do not re-explain those. Add real numbers and tradeoffs.',
    'advanced': 'The reader can follow a formula. Show the math, name the failure modes, and say honestly when this gets complicated.'
  }[topic.difficulty] || 'Use appropriate level of detail.';

  const investorContext = topic.tags.includes('warren-buffett')
    ? ' Include Warren Buffett\'s perspective and examples from his investment philosophy.'
    : topic.tags.includes('benjamin-graham')
    ? ' Include Benjamin Graham\'s teachings and margin of safety principles.'
    : topic.tags.includes('peter-lynch')
    ? ' Include Peter Lynch\'s growth investing approach and "invest in what you know" philosophy.'
    : topic.tags.includes('carl-icahn')
    ? ' Include Carl Icahn\'s activist investing strategies.'
    : '';

  return `Write one finished educational article titled "${topic.title}".

WHO IS READING
A 15-year-old in the US who has money sitting in a savings account doing nothing, or who just
watched someone post about a stock on TikTok and wants to understand what they were talking
about. They are smart and completely allergic to being talked down to. They will bounce off
this in about ten seconds if it sounds like homework, a school assembly, or a bank ad.

They are NOT a demographic to be addressed. Do not describe them. Never write "as a teenager",
"as a teen", "at your age", "when you get older", or "you might not think this is relevant
yet". If a sentence only makes sense because the reader is young, cut the sentence.

VOICE
You are an older friend who genuinely finds this interesting and is explaining it over food.
Curious, direct, slightly funny. Concrete nouns and verbs. Short sentences that earn the long
ones. Contractions always. You may say "honestly", "kind of absurd", "genuinely", "wild".
Never say "fantastic", "exciting journey", "unlock", "superpower", "game-changer", "delve",
"essential", "crucial", "it's important to note", "trust us", or "let's dive in".

DO THIS
- Open with the actual thing. A number, a weird fact, a small scene, a stake. First line must
  be something a person said out loud, not a setup for the paragraph.
    Good in shape: a specific figure, an odd fact, or something a person would actually say.
    Bad:  "Imagine you're at a concert, and the energy is electric..."
    These show the SHAPE only. Never reuse an example sentence from this prompt as your opener;
    two published articles began with the identical borrowed line and it reads like a template.
- Use ONE analogy and make it specific enough to picture. Pick from the reader's real life:
  the resale app they check daily, dropping a battle pass, their data plan, sneaker drops,
  a group project where one person does everything, a game's ranked tiers, the price of
  McDonald's going up, a creator they watch. One good analogy beats three vague ones.
- Name real companies, tickers and dollar amounts. "$10 a month since 15" lands; "a
  meaningful sum" does not.
- Say what goes wrong. Risk is not a footer formality here - mention the realistic bad
  outcome near the advice that causes it.
- Give one thing to actually do today, sized for someone with no income and no broker account
  yet (paper trading, reading an earnings call, comparing two funds' fees).

DO NOT DO THIS
- No meta-writing. Never announce the article: "in this article", "we'll explore", "by the
  end you'll understand", "let's break down", "first we need to understand". Just start.
- No rhetorical-question hooks. No "Sound familiar?", "Sounds too good to be true, right?",
  "But what if...?", "So, what does this all mean?"
- No headings named after writing instructions. Forbidden words anywhere in a heading:
  Introduction, Conclusion, Summary, Key Takeaways, Key Concepts, Further Reading, Resources,
  Additional Resources, Recommended Reading, Try It Yourself, Hands-On Activity, Real-World
  Examples, Why Should Teens Care, Why You Should Care, Why This Matters To You, Hook the
  Reader, Clear Definition, What Is It, Overview, Bullet Points.
  Headings are earned by the content underneath and phrased like that content, e.g.
  "The math that makes 15 beat 30", not "Understanding Compounding".
- No emoji, no exclamation marks, no ALL-CAPS emphasis, no "Hey there!".
- Nothing invented. No fabricated statistics, quotes, studies, surveys or percentages. If you
  don't know a figure, describe the relationship instead of making one up. Never cite
  "studies show".
- No fabricated social proof: never "thousands of teens", "most students", "join our community".

SUBSTANCE AND SAFETY (these are checked mechanically before anything is published)
- At least 3 links to pages that really exist, copied EXACTLY from this list. Never invent,
  modify, shorten or guess a URL, and never link to this article's own slug. Choose links a
  reader would actually want next; do not stuff irrelevant ones in to satisfy the count.
  Available: ${linkPoolText || '(none supplied - omit links rather than inventing URLs)'}
- Every number you state about the real world must either name its source inside the same
  sentence (SEC, IRS, Federal Reserve, BLS, the company's own filings, S&P Dow Jones Indices,
  a named news outlet) or be plainly illustrative arithmetic built on stated assumptions
  ("if $10 a month earned 7% for 30 years, that is about ..."). If you cannot place a source,
  describe the relationship instead of printing a figure. Large round dollar amounts with no
  source are the single most common way this pipeline has published false information.
- End with one short plain paragraph that includes the phrase "not financial advice" AND says
  plainly that money can be lost. One sentence each is fine. No heading for it.
- 2-5 headings, only where the thought actually changes. Paragraphs 1-4 sentences. At least 750
  words of actual prose, which is roughly six or seven substantial paragraphs plus your headings --
  the publication floor is enforced mechanically and thin pages are discarded, so err long.
  No emoji, no exclamation marks.

OUTPUT FORMAT (strict -- code adds the front matter for you)
Line 1 onward: the article body only. Do NOT write a YAML block, "---" fences, a "# Title" line,
or restate the title/description/difficulty/tags; those are added by code and any copy of them in
your prose is published as garbage. When you are finished, stop. Do not add a sign-off, a summary of what you wrote, or anything addressed
to the publisher.

TECHNICAL
Difficulty: ${topic.difficulty}. ${difficultyNote}${investorContext}`;
}

// Strip AI prompt leakage from generated content.
//
// Delegates to scripts/clean-article-bodies.js, the single tested implementation. The
// previous version here guarded every pattern with a "##" heading prefix, but the model
// emits BOLD headings ("**Introduction**", "**Key Concepts**"), so nothing matched and
// 95% of published articles shipped visible writing instructions. Keep the rules in one
// place; do not re-add regexes here.
function cleanArticleContent(content, title) {
  // Pass the title so a restated "# Title" line is removed too. The layout renders front-matter
  // title itself; verified live that the model emits its own H1, which previously shipped as a
  // duplicate heading directly under the real one.
  return stripScaffolding(content, title).text;
}

// Utility: Parse AI response into structured article
function parseArticleContent(content, topic) {
  // Extract sections
  const sections = {
    introduction: '',
    whatIsIt: '',
    whyCare: '',
    keyConcepts: '',
    realWorld: '',
    tryIt: '',
    takeaways: [],
    furtherReading: []
  };

  // Simple parsing - you may need to adjust based on actual AI output
  const lines = content.split('\n');
  let currentSection = 'introduction';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.match(/^(#{1,3}\s*)?(What Is|What is)/i)) {
      currentSection = 'whatIsIt';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Why|Why Should|Why do)/i)) {
      currentSection = 'whyCare';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Key|Concepts|Main|Understanding)/i)) {
      currentSection = 'keyConcepts';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Real[- ]?World|Examples|Case)/i)) {
      currentSection = 'realWorld';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Try|Activity|Exercise|Hands)/i)) {
      currentSection = 'tryIt';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Takeaway|Summary|Key Points)/i)) {
      currentSection = 'takeaways';
      continue;
    }
    if (trimmed.match(/^(#{1,3}\s*)?(Further|Resources|Read|Learn)/i)) {
      currentSection = 'furtherReading';
      continue;
    }
    
    if (trimmed) {
      if (currentSection === 'takeaways') {
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          sections.takeaways.push(trimmed.replace(/^[-*]\s*/, ''));
        } else {
          sections.takeaways += line + '\n';
        }
      } else if (currentSection === 'furtherReading') {
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          sections.furtherReading.push(trimmed.replace(/^[-*]\s*/, ''));
        } else {
          sections.furtherReading += line + '\n';
        }
      } else {
        sections[currentSection] += line + '\n';
      }
    }
  }

  return sections;
}

// Batch-clean existing articles: strip leaked meta-commentary headings
// (e.g. "## 1. Introduction – Hook the Reader") from already-generated files.
function cleanExistingArticles() {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md'));
  let cleaned = 0;
  for (const file of files) {
    const filePath = path.join(ARTICLES_DIR, file);
    const md = fs.readFileSync(filePath, 'utf8');
    const parts = md.split('---');
    const bodyIndex = parts.length > 2 ? 2 : 1;
    const body = parts[bodyIndex];
    const cleanBody = cleanArticleContent(body);
    if (cleanBody !== body) {
      parts[bodyIndex] = cleanBody;
      fs.writeFileSync(filePath, parts.join('---'));
      cleaned++;
    }
  }
  console.log(`\n✅ Cleaned ${cleaned}/${files.length} existing articles`);
}


// --- pre-publication plumbing -------------------------------------------------
//
// The generator used to trust its own model output: whatever came back was written to
// _articles/, committed and deployed, with a continue-on-error log line as the only review.
// That is how "$5 billion in carbon credits" reached a site read by teenagers. These helpers
// make publication conditional on the same checks a reviewer applies, so a bad completion costs
// a retry instead of going live.

const ROOT_DIR = path.join(__dirname, '..');
const GUIDE_DIR = path.join(ROOT_DIR, '_guides');
const ASSET_IMG_DIR = path.join(ROOT_DIR, 'assets', 'images');

function readSlugs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, ''));
}

// Deterministic pseudo-random order seeded by topic title, so a rerun of the same topic yields the
// same prompt (reproducible debugging) while different topics surface different pages to link.
function linkPoolFor(topic) {
  const own = generateSlug(topic.title);
  const arts = readSlugs(ARTICLES_DIR).filter((s) => s !== own);
  const shuffled = arts
    .map((s, i) => ({ s, k: ((i + 7) * 2654435761 ^ topic.title.length * 40503) % 1e9 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 40)
    .map((x) => `/articles/${x.s}/`);
  const guides = readSlugs(GUIDE_DIR).slice(0, 4).map((s) => `/guides/${s}/`);
  return [...shuffled, ...guides].join(', ');
}

// Word metric must match scripts/lib/candidate-gate.js exactly: the generator decides whether to spend
// another API call on a draft, and the gate decides whether it may be published. When these two counted
// words differently, short drafts passed one and died at the other -- after costing an illustration.
function countProseWords(text) {
  return String(text || '').split(/\s+/).filter((x) => /[A-Za-z]{3,}/.test(x)).length;
}

/**
 * Decide what to do with one completion. Pure and exported because the bug this guards against was a
 * control-flow mistake, not a parsing one: the length check used to sit behind `if (!error)`, and since
 * the model never returns the quiz inline any more, `error` was always set and the check became dead code.
 * Every third-party failure since then looked like "the model writes short articles" when it was really
 * "we stopped measuring".
 */
function evaluateDraft({ words, minWords }) {
  if (!Number.isFinite(minWords)) throw new Error('evaluateDraft requires minWords');
  if (words < minWords) {
    return { action: 'retry', reason: `only ${words} words; the page floor is ${minWords}`, minWords };
  }
  return { action: 'accept', reason: `${words} words meets the ${minWords}-word floor`, minWords };
}

// Locate the JSON quiz the model appends after the article.
//
// The first version required a literal `===QUIZ===` delimiter line and it discarded every candidate in
// the first real production run that merely punctuated a separator differently ("## Quiz", bolded,
// trailing colon). Throwing away good prose over a delimiter is a bad trade, so the marker is now
// optional: what is required is a structurally valid question array, validated strictly regardless of
// how the model chose to label it.
function findQuizArray(text) {
  const MAX_SPAN = 9000;
  let best = null;
  for (let s = 0; s < text.length; s++) {
    if (text[s] !== '[') continue;
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = s; i < Math.min(text.length, s + MAX_SPAN); i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const slice = text.slice(s, end + 1);
    if (!slice.includes('"question"')) continue;
    let parsed;
    try { parsed = JSON.parse(slice); } catch (e) { continue; }
    if (!Array.isArray(parsed) || !parsed.length) continue;
    // Keep the LAST structurally plausible array: the quiz belongs at the end, and an earlier match
    // typically means the model echoed the example shape from the prompt instructions.
    if (parsed.every((o) => o && typeof o === 'object' && o.question && Array.isArray(o.options))) best = { quiz: parsed, at: s };
  }
  return best;
}

function stripTrailingFence(b) {
  return String(b).replace(/\s*```[a-zA-Z]*\s*$/g, '').replace(/[ \t]*={2,}[ \t]*$/, '').trim();
}

// Pull the JSON quiz out of a raw completion, returning the body without it.
function splitQuiz(raw) {
  const text = String(raw || '');
  const found = findQuizArray(text);
  if (!found) return { body: stripTrailingFence(text), quiz: null, error: 'no structurally valid quiz JSON array found' };
  const v = validateQuiz(found.quiz);
  if (!v.ok) return { body: stripTrailingFence(text.slice(0, found.at)), quiz: null, error: `quiz invalid: ${v.errors.join('; ')}` };
  const head = stripTrailingFence(text.slice(0, found.at));
  // Drop the label line ("## Quiz", "===QUIZ===:", "**Quiz:**") if still attached to the body.
  const body = head.replace(/(^|\n)[ \t]*[=#*_~-]{0,8}\s*quiz\b[^\n]*$/i, '$1').trimEnd();
  return { body, quiz: found.quiz };
}

function yamlQuote(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function quizToYaml(quiz) {
  let out = 'quiz:\n';
  for (const q of quiz) {
    out += `  - question: "${yamlQuote(q.question)}"\n`;
    out += `    options: [${q.options.map((o) => `"${yamlQuote(o)}"`).join(', ')}]\n`;
    out += `    answer: ${q.answer}\n`;
    out += `    why: "${yamlQuote(q.why)}"\n`;
  }
  return out;
}

// Utility: Generate markdown file
function generateMarkdownFile(topic, content, imagePath, date, quiz) {
  const sections = parseArticleContent(content, topic);
  const slug = generateSlug(topic.title);
  const formattedDate = formatDate(date);
  
  // Build markdown content
  let markdown = `---
layout: article
title: "${topic.title}"
description: "${topic.description}"
date: ${formattedDate}
difficulty: ${topic.difficulty}
tags: [${topic.tags.map(t => `"${t}"`).join(', ')}]
`;

  if (imagePath) {
    markdown += `image: "${imagePath}"
image_credit: "Generated by NVIDIA FLUX.3 Image Klein"
image_credit_url: "https://build.nvidia.com/black-forest-labs/flux-3-image-klein"
`;
  }

  // Related articles, or the "Continue Learning" block silently disappears from the page
  // (_layouts/article.html gates it on this key existing). Scored by the same shared ranking
  // the backfill uses. The new article is not yet on disk, so it is added to the corpus
  // in-memory and excluded from its own results by slug.
  try {
    const corpus = loadArticleIndex();
    const host = {
      slug,
      title: topic.title,
      description: topic.description || '',
      difficulty: topic.difficulty,
      tags: topic.tags || [],
      file: `${formattedDate}-${slug}.md`
    };
    const related = rankRelated(host, [...corpus, host]);
    if (related.length) {
      // toFrontMatter emits its own "related_articles:" key (it was written for the backfill,
      // which replaces a whole block). Prefixing it here produced a duplicate key and Psych
      // would then keep only one - caught by test-prompt.js assembling real front matter.
      markdown += toFrontMatter(related);
    } else {
      console.warn(`⚠️  No related articles scored for "${topic.title}"; Continue Learning will be absent.`);
    }
  } catch (err) {
    // Do not fail generation over this, but say so loudly - a missing block is invisible in
    // the generated file itself and only shows up as an empty section on the built page.
    console.warn(`⚠️  Could not compute related_articles: ${err.message}`);
  }

  if (quiz && quiz.length) {
    markdown += quizToYaml(quiz);
  }

  markdown += `---

`;

  // Build content
  markdown += content;

  return markdown;
}

// Main function
async function main() {
  console.log('🚀 Unkie The Stock Junkie - Article Generator');
  console.log('=============================================\n');

  // Check API key
  if (!NVIDIA_API_KEY) {
    console.error('❌ Error: NVIDIA_API_KEY environment variable not set!');
    console.error('\nTo get a free API key:');
    console.error('1. Visit https://build.nvidia.com/');
    console.error('2. Sign in or create a free account');
    console.error('3. Navigate to "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"');
    console.error('4. Click "Get API Key" and copy it');
    console.error('\nThen run: export NVIDIA_API_KEY=your-key-here');
    process.exit(1);
  }

  // Load data
  console.log('📚 Loading topics...');
  const topics = loadTopics();
  const generatedData = loadGeneratedTopics();
  
  // Select topic
  console.log('🎲 Selecting topic...');
  const { topic, reset } = selectUnusedTopic(topics, generatedData.generated);
  
  if (reset) {
    generatedData.generated = [];
    generatedData.lastReset = new Date().toISOString();
  }
  
  console.log(`✅ Selected: "${topic.title}" (${topic.difficulty})`);
  console.log(`   Tags: ${topic.tags.join(', ')}\n`);

  // GATED GENERATION
  // Each candidate must pass scripts/lib/candidate-gate.js before it survives this script. Failures
  // are deleted from disk, so the workflow's "commit whatever changed" step can never publish them,
  // and another topic is tried. Previously one unreviewed completion per run went straight to main and
  // triggered a Pages build -- which is exactly how fabricated figures and leaked metadata appeared on
  // a site read by minors twice in a row.
  const MAX_ATTEMPTS = Number(process.env.GENERATE_ATTEMPTS || 3);
  // Bounded wall clock. With per-topic regeneration, two quiz attempts and 60/120/180s throttling backoff,
  // the theoretical worst case is hours for one article -- unacceptable for a daily job whose output is a
  // single page. Past the budget we stop and report honestly instead of grinding against a busy worker pool.
  const DEADLINE_MS = Number(process.env.GENERATE_DEADLINE_MINUTES || 15) * 60000;
  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);
  const outOfBudget = () => Date.now() - startedAt > DEADLINE_MS;
  const tried = new Set(generatedData.generated);
  let usedTopic = false;
  let published = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !published; attempt++) {
    if (outOfBudget()) {
      console.log(`\u23f1\ufe0f stopping after ${elapsed()}s: generation budget of ${Math.round(DEADLINE_MS / 60000)} min exhausted (throttling?)`);
      break;
    }
    let candidate;
    if (attempt === 1 && topic && !usedTopic) {
      // The log already announced this selection; honouring it avoids the confusing "Selected: X"
      // followed by attempts on entirely unrelated topics.
      candidate = topic;
      usedTopic = true;
    } else {
      const candidates = topics.filter((tp) => !tried.has(tp.title) && !articleExists(tp));
      if (!candidates.length) {
        console.log('⚠️ No unused topics remain to try.');
        break;
      }
      candidate = candidates[Math.floor(Math.random() * candidates.length)];
    }
    tried.add(candidate.title);
    console.log(`\n🎲 Attempt ${attempt}/${MAX_ATTEMPTS}: "${candidate.title}" (${candidate.difficulty})`);

    // Text first, illustration last. Images used to be generated before a single word was validated, so
    // every rejected candidate left a 60KB orphan behind -- one reached main as a committed file with no
    // article at all (d1fde08). Cost and cleanup both get simpler when nothing exists until the prose passes.
    let accepted = null;
    let repairNote = null;
    for (let sub = 1; sub <= 2 && !accepted; sub++) {
      let raw;
      try {
        raw = await generateArticleContent(candidate, repairNote || undefined);
      } catch (err) {
        console.log(`\u274c generation failed: ${err.message}`);
        break;
      }

      const { body, quiz: inlineQuiz, error } = splitQuiz(cleanArticleContent(raw, candidate.title));
      const draftText = body || String(raw || '');
      const words = countProseWords(draftText);

      // Measured unconditionally. An absent inline quiz is expected (it comes from its own call now) and
      // must not skip the substance check that sits next to it.
      const verdictDraft = evaluateDraft({ words, minWords: MIN_WORDS });
      if (verdictDraft.action === 'retry') {
        console.log(`\u26a0\ufe0f ${verdictDraft.reason} -- retrying this topic`);
        repairNote = `Your previous response produced roughly ${words} usable words of prose, below the site minimum of ${MIN_WORDS}. Expand the SAME article with real mechanism -- how things work, what breaks, what to do -- rather than restating points you already made. Aim for 6-8 substantial paragraphs.`;
        continue;
      }
      if (error) {
        // Informational only now: no quiz means the dedicated call below handles it, but keeping the
        // evidence in the log is what let us tell "model ignored instructions" from "parser too strict".
        console.log(`   (no inline quiz; raw starts: ${JSON.stringify(String(raw).slice(0, 140))})`);
      }
      accepted = { body: draftText, quiz: inlineQuiz };
    }

    if (!accepted || accepted.body.trim().length < 200) {
      console.log('\u274c no usable completion for this topic; moving on');
      continue;
    }

    // Quiz sourcing is graded: hand-written bank entry for this slug (human-authored, safest), else the
    // question set the article prompt happened to return, else one focused model call about the finished
    // text. Only if all three fail does the candidate die -- and it dies on a stated reason, not a mystery.
    let quiz = accepted.quiz;
    if (!quiz) {
      const slug = generateSlug(candidate.title);
      const bank = readQuizBank()[slug];
      if (bank && validateQuiz(bank).ok) {
        quiz = bank;
        console.log('   used hand-written quiz from scripts/quiz-content.json');
      }
    }
    if (!quiz) {
      try {
        quiz = await generateQuizDraft(candidate, accepted.body);
        if (quiz) console.log(`   generated quiz separately (${quiz.length} questions)`);
      } catch (err) {
        console.log(`   quiz call failed: ${err.message}`);
      }
    }
    if (!quiz) {
      console.log('\u274c no quiz available from bank, inline output, or the dedicated call; skipping topic');
      continue;
    }

    // Cheap checks first, expensive call second. Illustrations were being generated for drafts that then
    // died on word count or an unsourced figure, so three FLUX calls today bought nothing.
    const dryRunMarkdown = generateMarkdownFile(candidate, accepted.body, null, new Date(), quiz);
    const proseVerdict = checkCandidate(dryRunMarkdown, {
      articleSlugs: new Set(readSlugs(ARTICLES_DIR).filter((s) => s !== generateSlug(candidate.title))),
      guideSlugs: new Set(readSlugs(GUIDE_DIR)),
      imageExists: () => true, // illustration deliberately absent at this stage
    });
    if (!proseVerdict.ok) {
      console.log(`\u274c rejected on prose before requesting an illustration:`);
      for (const pr of proseVerdict.problems) console.log(`      - ${pr}`);
      continue;
    }

    const imagePath = await generateImage(candidate);
    const removeImage = () => {
      if (!imagePath) return;
      const abs = path.join(ROOT_DIR, imagePath.replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    };

    const date = new Date();
    const markdown = generateMarkdownFile(candidate, accepted.body, imagePath, date, quiz);
    const filename = `${formatDate(date)}-${generateSlug(candidate.title)}.md`;
    const filepath = path.join(ARTICLES_DIR, filename);
    fs.writeFileSync(filepath, markdown);

    const verdict = checkCandidate(markdown, {
      articleSlugs: new Set(readSlugs(ARTICLES_DIR).filter((s) => s !== generateSlug(candidate.title))),
      guideSlugs: new Set(readSlugs(GUIDE_DIR)),
      imageExists: (rel) => fs.existsSync(path.join(ROOT_DIR, rel.replace(/^\//, ''))),
    });

    if (!verdict.ok) {
      console.log('\u274c gate rejected ' + filename + ' -- deleted, will not be committed');
      for (const pr of verdict.problems) console.log('      - ' + pr);
      fs.unlinkSync(filepath);
      removeImage();
      continue;
    }
    console.log(`\n✅ Article saved and gated: ${filename} (${verdict.stats.words} words, ${verdict.stats.internalLinks} internal links)`);
    for (const w of verdict.warnings) console.log(`   ! verify before trusting: ${w}`);
    if (imagePath) console.log(`🎨 Image: ${imagePath}`);

    generatedData.generated.push(candidate.title);
    saveGeneratedTopics(generatedData);
    published = { filename, filepath, imagePath, warnings: verdict.warnings };
    // Machine-readable record of what was actually produced. The workflow commits these paths and only
    // these paths; "git add -A" after a half-finished run is what put a stray image on main.
    fs.writeFileSync(PUBLISH_RESULT_FILE, JSON.stringify({
      published: true, title: candidate.title, slug: generateSlug(candidate.title),
      file: `_articles/${filename}`, image: imagePath || null,
      words: verdict.stats.words, internalLinks: verdict.stats.internalLinks,
      warnings: verdict.warnings, at: new Date().toISOString()
    }, null, 2));
  }

  if (!published) {
    console.error('\n❌ No candidate passed the pre-publication gate. Nothing was written or published.');
    // Distinct from a crash. Publishing nothing because the work was not good enough is the gate
    // functioning, and the workflow renders it as a warning rather than a broken scheduled job.
    process.exit(2);
  }
  
  console.log('\nArticle generation complete.');
  console.log('File: ' + published.filepath);
  if (published.imagePath) console.log('Image: ' + published.imagePath);
  console.log(`\nNext steps:`);
  console.log(`1. Read ${published.filename} -- the gate blocks structural failures, it does not confirm taste`);
  console.log(`2. Check any figure flagged above against a real source`);
  console.log(`3. Commit and push to trigger GitHub Pages deployment`);
}

// Run main only when invoked directly.
//
// This used to run unconditionally on require(), which made the generator impossible to
// unit-test: importing generateArticlePrompt() would start hitting the NVIDIA API and then
// exit the test process. The prompt is arguably the highest-leverage file in this repo (it
// produces every future article), so it must be importable by scripts/test-prompt.js.
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  generateArticlePrompt,
  // Pre-publication plumbing, exported so scripts/test-candidate-gate.js can exercise the parse/emit
  // path without an API key -- the same reason generateMarkdownFile is exported.
  splitQuiz,
  parseQuizJson,
  evaluateDraft,
  countProseWords,
  generateQuizDraft,
  readQuizBank,
  SYSTEM_CONTRACT,
  quizToYaml,
  linkPoolFor,
  readSlugs,
  generateArticleContent,
  cleanArticleContent,
  generateSlug,
  // Exported so scripts/test-prompt.js can assert the assembled front matter without an API
  // key. Missing bindings here were previously only reachable by running the generator with a
  // live key, which is why two regressions (a lost require, an omitted related_articles block)
  // sat undetected.
  generateMarkdownFile
};