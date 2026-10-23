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
          stream: false
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
function generateArticlePrompt(topic) {
  const difficultyNote = {
    'beginner': 'Keep it simple with basic concepts and definitions. Use analogies teens can relate to.',
    'intermediate': 'Build on basic knowledge with more detail and real-world examples.',
    'advanced': 'Go deeper with technical concepts, metrics, and sophisticated strategies.'
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

  return `Write a single, polished educational article titled "${topic.title}".

Target audience: Teenagers aged 13-18 who are learning about investing.
Difficulty level: ${topic.difficulty}
${difficultyNote}${investorContext}

Write the article as flowing, engaging prose. Use friendly, encouraging language — like a cool uncle explaining things.

CRITICAL WRITING RULES:
- Write ONLY the finished article. Do NOT include any headings, lists, or outlines that describe HOW you should structure the article.
- DO NOT use numbered headings like "1. Introduction", "2. What Is It?", or any heading followed by a tagline in parentheses (e.g. never write "Introduction – Hook the reader").
- Use natural section headings written as plain phrases (e.g. "What Is It?", "Why Teens Should Care") WITHOUT numbers and WITHOUT parenthetical taglines.
- DO NOT write the words "Introduction", "Conclusion", "Key Takeaways", "Summary", "Further Reading", "Try It Yourself", "Key Concepts", "Why Should Teens Care", "Clear Definition", "Hook the Reader" as section headings.
- DO NOT include any meta-commentary, instructions, or reminders about structure.
- Include at least one teen-relatable analogy or example.
- Emphasize that investing involves risk.
- End the article with a brief "Not financial advice" disclaimer.
- Include "difficulty: ${topic.difficulty}" and the tags: ${topic.tags.join(', ')} in the front matter.
- Write 800-1200 words.
- Use markdown formatting with headers.
- Keep paragraphs short (2-4 sentences).`;
}

// Utility: Strip AI prompt leakage from generated content
// Removes leaked meta-commentary headings ("## 1. Introduction – Hook the Reader")
// and stray instruction phrases that the model echoes from the prompt.
function cleanArticleContent(content) {
  let text = content;

  // Remove numbered section headings with taglines: "## 1. Introduction – Hook the Reader"
  text = text.replace(/^\s*(#+\s+)?(?:\d+[.)]\s+)?(#+\s+)?(?:Introduction|What Is|What is|Why|Why Should|Why do|Key Concepts|Key Takeaways|Key Points|Summary|Further Reading|Resources|Read|Learn|Try It Yourself|Hands-On|Not Financial|Clear Definition|Hook the Reader|Connect to Their|Break Down the Main|Bullet Points)\b[^\n]*\n/gmi, '');

  // Remove any heading line that is a number + title + parenthetical tagline
  text = text.replace(/^(\s*)(?:\d+\.?\s+)?(#+\s+[A-Z][^\n]*?\s*[-–]|#+\s+\d+\.?\s+[A-Z][^\n]*?\s*[-–])[^\n]*\(([A-Z][^)]*)\)\s*\n/gm, '');

  // Remove standalone instruction-phrase headings (e.g. "Key Takeaways – Bullet Points")
  text = text.replace(/^(\s{1,6}(#+\s+)[^\n]*?\s*[-–]\s+\w+)\s*\n/gm, '');

  // Remove any remaining heading line whose text matches a known prompt phrase
  const promptPhrases = [
    'Hook the Reader', 'Clear Definition', 'Why Should Teens Care', 'Try It Yourself',
    'Key Takeaways', 'Key Concepts', 'Further Reading', 'Why Should You Care',
    'Connect to Their Life', 'Hands-On Activity', 'Break Down the Main Ideas',
    'Bullet Points', 'Not Financial Advice', 'Real-World Examples', 'Introduction'
  ];
  const headingRe = /^(\s{1,6}(?:\d+\.\s+)?#+\s+)[^\n]+\s*[-–]\s+[^\n]+\s*\n/;
  for (const phrase of promptPhrases) {
    text = text.replace(headingRe, (match, indent, heading) => {
      if (heading.toLowerCase().includes(phrase.toLowerCase())) {
        return '';
      }
      return match;
    });
  }

  // Remove leftover instruction lines like "Structure the article with these sections:" or "Important guidelines:"
  const instructionPhrases = [
    'Structure the article with these sections', 'Important guidelines',
    'Guidelines', 'Write the article', 'CRITICAL WRITING RULES', 'WRITING RULES',
    'Target audience', 'Difficulty level', 'Difficulty:'
  ];
  const instructionRe = new RegExp('^(\s{1,6}(?:' + instructionPhrases.join('|') + ')[^\n]*\n)', 'gm');
  text = text.replace(instructionRe, '');

  return text;
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
  const content = cleanArticleContent(rawContent);
  
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

// Run main
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});