#!/usr/bin/env node
/**
 * Add images to existing articles that don't have them
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ARTICLES_DIR = path.join(__dirname, '..', '_articles');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images', 'articles');
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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
    'market-crash': ' market dip, recovery, resilience concept',
    'business': ' business handshake, partnership, entrepreneur',
    'ownership': ' equity share, pie chart division, stakeholders',
    'fundamentals': ' foundation blocks, building blocks, basics'
  };

  let specific = '';
  for (const [keyword, description] of Object.entries(topicSpecific)) {
    if (topic.tags.includes(keyword)) {
      specific = description;
      break;
    }
  }

  return `${basePrompt}${specific}`;
}

async function generateImage(topic) {
  if (!NVIDIA_API_KEY) {
    console.log('⚠️ No NVIDIA_API_KEY found. Skipping image generation.');
    return null;
  }

  const imagePrompt = generateImagePrompt(topic);

  // FLUX.3 Image Klein (fast, reliable successor to FLUX.1)
  try {
    console.log('🎨 Generating illustration with FLUX.3 Image Klein...');
    console.log(`   Prompt: ${imagePrompt.substring(0, 80)}...`);

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

    console.log(`   Response status: ${response.status}`);
    console.log(`   Response data keys: ${Object.keys(response.data || {}).join(', ')}`);

    let imageData = extractImageData(response.data);
    if (imageData) {
      return saveImage(imageData, topic);
    }

    console.log(`   ⚠️ FLUX.3 returned no image`);
  } catch (error) {
    console.error('❌ FLUX.3 Image Klein failed:', error.message);
    if (error.response) {
      console.error('     Response:', error.response.data);
    }
  }

  return null;
}

// Helper: Extract image data from various API response formats
function extractImageData(data) {
  if (data && data.image) {
    return data.image;
  } else if (data && data.artifacts && data.artifacts.length > 0) {
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

function parseArticleFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Parse frontmatter
  const lines = frontmatter.split('\n');
  const metadata = {};
  
  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      
      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/"/g, ''));
        }
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      metadata[key] = value;
    }
  });

  return { metadata, body, content };
}

async function main() {
  console.log('🚀 Adding Images to Articles');
  console.log('============================\n');

  if (!NVIDIA_API_KEY) {
    console.error('❌ Error: NVIDIA_API_KEY environment variable not set!');
    process.exit(1);
  }

  // Get all article files
  const articles = fs.readdirSync(ARTICLES_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(ARTICLES_DIR, file));

  console.log(`Found ${articles.length} article(s)\n`);

  for (const articlePath of articles) {
    const filename = path.basename(articlePath);
    const article = parseArticleFile(articlePath);
    
    if (!article) {
      console.log(`⚠️ Could not parse: ${filename}`);
      continue;
    }

    const title = article.metadata.title;
    const tags = article.metadata.tags || [];
    
    // Check if article already has an image
    if (article.metadata.image) {
      const imagePath = path.join(__dirname, '..', article.metadata.image);
      if (fs.existsSync(imagePath)) {
        console.log(`⏭️  ${filename} - already has image`);
        continue;
      } else {
        console.log(`⚠️  ${filename} - image path exists but file missing: ${article.metadata.image}`);
      }
    }

    console.log(`\n📝 Processing: ${title}`);
    console.log(`   Tags: ${Array.isArray(tags) ? tags.join(', ') : tags}`);

    const topic = { title, tags };
    const imagePath = await generateImage(topic);

    if (imagePath) {
      // Update article frontmatter
      let newContent = article.content;
      
      // Check if image field already exists
      if (newContent.includes('image:')) {
        // Replace existing image line
        newContent = newContent.replace(
          /image:.*\n/,
          `image: "${imagePath}"\nimage_credit: "Generated by NVIDIA FLUX.3 Image Klein"\nimage_credit_url: "https://build.nvidia.com/black-forest-labs/flux-3-image-klein"\n`
        );
      } else {
        // Add image field after tags
        newContent = newContent.replace(
          /(tags:.*\n)/,
          `$1image: "${imagePath}"\nimage_credit: "Generated by NVIDIA FLUX.3 Image Klein"\nimage_credit_url: "https://build.nvidia.com/black-forest-labs/flux-3-image-klein"\n`
        );
      }

      fs.writeFileSync(articlePath, newContent);
      console.log(`✅ Updated article with image`);
      
      // Wait between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🎉 Done!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
