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

// Configuration
const TOPICS_FILE = path.join(__dirname, '..', 'topics.json');
const GENERATED_TOPICS_FILE = path.join(__dirname, '..', 'generated-topics.json');
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

// Utility: Generate article content using NVIDIA Nemotron 3 Nano Omni 30B (reasoning)
async function generateArticleContent(topic) {
  if (!NVIDIA_API_KEY) {
    console.error('❌ NVIDIA_API_KEY not set!');
    console.error('Get a free API key at https://build.nvidia.com/');
    process.exit(1);
  }

  const prompt = generateArticlePrompt(topic);
  
  // Retry up to 3 times on 503 (worker limit) or 429 (rate limit)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`📝 Generating article content (attempt ${attempt})...`);
      
      const response = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        {
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          messages: [
            {
              role: "system",
              content: "You are an expert financial educator writing for teenagers aged 13-18. Your tone is friendly, encouraging, and educational. You explain complex investing concepts in simple terms with real-world examples. You emphasize that investing involves risk and this is educational content only, not financial advice."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 8192,
          stream: false,
          // Free-tier Nemotron reasoning spends most of its wall-clock budget writing
          // reasoning_content that we discard -- full-length article requests exceeded the
          // 300s axios timeout before returning any content (verified live). Thinking off
          // returns in seconds; the prose quality on graded output was unchanged for our
          // use case and reliability is the difference between working and not.
          chat_template_kwargs: { enable_thinking: false }
        },
        {
          headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 300000 // Reasoning models think before answering
        }
      );

      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content;
      } else {
        throw new Error('Unexpected response format from NVIDIA API');
      }
    } catch (error) {
      const status = error.response?.status;
      if ((status === 503 || status === 429) && attempt < 3) {
        const waitSec = attempt * 30; // 30s, 60s
        console.log(`⚠️ ${status} error, retrying in ${waitSec}s...`);
        await delay(waitSec * 1000);
        continue;
      }
      console.error('❌ Error generating content:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      process.exit(1);
    }
  }
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
function generateArticlePrompt(topic) {
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
    Good: "If you'd put $100 into the S&P 500 the month you were born and never touched it,
           you'd probably have more than your car by now."
    Bad:  "Imagine you're at a concert, and the energy is electric..."
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

STRUCTURE
Front matter exactly as provided; body starts immediately with prose, no repeated title,
no restating difficulty or tags (the page already shows them). 2-5 headings total, used only
where the thought actually changes. Paragraphs 1-4 sentences. 800-1100 words.
End with one short plain paragraph noting this is education, not financial advice, and that
investing involves risk. No separate disclaimer heading unless the article genuinely needs one.

TECHNICAL
Difficulty: ${topic.difficulty}. ${difficultyNote}${investorContext}
Include "difficulty: ${topic.difficulty}" and the tags: ${topic.tags.join(', ')} in front matter.
Output markdown only - the finished article and nothing else.`;
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

// Utility: Generate markdown file
function generateMarkdownFile(topic, content, imagePath, date) {
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

  // Generate image
  const imagePath = await generateImage(topic);
  
  // Wait a bit to respect rate limits
  await delay(2000);
  
  // Generate article
  const rawContent = await generateArticleContent(topic);
  const content = cleanArticleContent(rawContent, topic.title);
  
  // Create markdown
  const date = new Date();
  const markdown = generateMarkdownFile(topic, content, imagePath, date);
  
  // Save file
  const slug = generateSlug(topic.title);
  const filename = `${formatDate(date)}-${slug}.md`;
  const filepath = path.join(ARTICLES_DIR, filename);
  
  fs.writeFileSync(filepath, markdown);
  console.log(`\n✅ Article saved: ${filename}`);
  
  // Update tracking
  generatedData.generated.push(topic.title);
  saveGeneratedTopics(generatedData);
  
  console.log('\n🎉 Article generation complete!');
  console.log(`📄 File: ${filepath}`);
  if (imagePath) {
    console.log(`🎨 Image: ${imagePath}`);
  }
  console.log(`\nNext steps:`);
  console.log(`1. Review the generated article`);
  console.log(`2. Make any manual edits if needed`);
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
  generateArticleContent,
  cleanArticleContent,
  generateSlug,
  // Exported so scripts/test-prompt.js can assert the assembled front matter without an API
  // key. Missing bindings here were previously only reachable by running the generator with a
  // live key, which is why two regressions (a lost require, an omitted related_articles block)
  // sat undetected.
  generateMarkdownFile
};