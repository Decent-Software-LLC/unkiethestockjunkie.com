#!/usr/bin/env node
/**
 * Check all external links in generated articles
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ARTICLES_DIR = path.join(__dirname, '..', '_articles');
const GUIDES_DIR = path.join(__dirname, '..', '_guides');

const URL_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;

async function checkLink(url) {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400
    });
    return { valid: true, status: response.status };
  } catch (error) {
    return { 
      valid: false, 
      status: error.response?.status || 'ERROR',
      error: error.message 
    };
  }
}

async function checkFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const links = [];
  let match;
  
  while ((match = URL_REGEX.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
      line: content.substring(0, match.index).split('\n').length
    });
  }
  
  return links;
}

async function main() {
  console.log('🔗 Link Checker');
  console.log('===============\n');

  const files = [];
  
  // Collect all markdown files
  if (fs.existsSync(ARTICLES_DIR)) {
    fs.readdirSync(ARTICLES_DIR)
      .filter(f => f.endsWith('.md'))
      .forEach(f => files.push(path.join(ARTICLES_DIR, f)));
  }
  
  if (fs.existsSync(GUIDES_DIR)) {
    fs.readdirSync(GUIDES_DIR)
      .filter(f => f.endsWith('.md'))
      .forEach(f => files.push(path.join(GUIDES_DIR, f)));
  }

  console.log(`Found ${files.length} files to check\n`);

  const allLinks = [];
  
  for (const file of files) {
    const links = await checkFile(file);
    if (links.length > 0) {
      allLinks.push(...links.map(l => ({ ...l, file: path.basename(file) })));
    }
  }

  if (allLinks.length === 0) {
    console.log('✅ No external links found');
    return;
  }

  console.log(`Checking ${allLinks.length} unique links...\n`);

  const results = {
    valid: 0,
    invalid: [],
    checked: 0
  };

  // Check links with rate limiting
  for (const link of allLinks) {
    process.stdout.write(`Checking: ${link.url.substring(0, 60)}... `);
    
    const result = await checkLink(link.url);
    results.checked++;
    
    if (result.valid) {
      console.log(`✅ ${result.status}`);
      results.valid++;
    } else {
      console.log(`❌ ${result.status}`);
      results.invalid.push({ ...link, ...result });
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n📊 Results');
  console.log('==========');
  console.log(`Total links checked: ${results.checked}`);
  console.log(`Valid: ${results.valid} ✅`);
  console.log(`Invalid: ${results.invalid.length} ❌`);

  if (results.invalid.length > 0) {
    console.log('\n❌ Invalid Links:');
    results.invalid.forEach(link => {
      console.log(`\n  File: ${link.file}`);
      console.log(`  Line: ${link.line}`);
      console.log(`  Text: ${link.text}`);
      console.log(`  URL: ${link.url}`);
      console.log(`  Status: ${link.status}`);
      if (link.error) console.log(`  Error: ${link.error}`);
    });
    
    process.exit(1);
  } else {
    console.log('\n✅ All links are valid!');
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});