#!/usr/bin/env node
/**
 * Interactive tool to add new topics to topics.json
 */

const fs = require('fs');
const path = require('path');

// Try to load inquirer, fall back to simple prompts if not available
let inquirer;
try {
  inquirer = require('inquirer');
} catch (e) {
  console.log('Note: inquirer not installed. Using basic prompts.\n');
}

const TOPICS_FILE = path.join(__dirname, '..', 'topics.json');

// Available tags
const AVAILABLE_TAGS = [
  'stocks', 'stock-market', 'exchanges', 'beginner', 'intermediate', 'advanced',
  'warren-buffett', 'benjamin-graham', 'peter-lynch', 'carl-icahn', 'value-investing',
  'growth-investing', 'dividends', 'etfs', 'index-funds', 'sp500', 'dow-jones',
  'nasdaq', 'compound-interest', 'risk-management', 'diversification', 'technical-analysis',
  'fundamentals', 'financial-statements', 'pe-ratio', 'pb-ratio', 'valuation', 'charts',
  'history', 'biography', 'psychology', 'behavioral-finance', 'screeners', 'brokers',
  'paper-trading', 'crypto', 'esg', 'international', 'retirement', 'taxes',
  'options', 'short-selling', 'margin', 'day-trading', 'swing-trading', 'ipo',
  'earnings', 'revenue', 'profit', 'loss', 'market-cap', 'blue-chip', 'small-cap',
  'mid-cap', 'large-cap', 'growth', 'value', 'income', 'portfolio', 'asset-allocation',
  'rebalancing', 'dca', 'dollar-cost-averaging', 'roi', 'return', 'yield',
  'volatility', 'beta', 'alpha', 'sharpe-ratio', 'risk', 'debt', 'equity',
  'balance-sheet', 'income-statement', 'cash-flow', 'annual-reports', '10-k',
  'sec-filings', 'insider-trading', 'regulations', 'ethics', 'myths', 'lessons',
  'education', 'terminology', 'tools', 'research', 'analysis', 'simulation',
  'math', 'calculators', 'visualization', 'news', 'media-literacy', 'fomo',
  'loss-aversion', 'confirmation-bias', 'emotions', 'market-timing', 'strategy',
  'competitive-advantage', 'moat', 'competence', 'multibaggers', 'tenbaggers',
  'activist', 'corporate-actions', 'stock-splits', 'mergers', 'acquisitions',
  'bankruptcy', 'reits', 'real-estate', 'bonds', 'fixed-income', 'commodities',
  'forex', 'international-markets', 'emerging-markets', 'developed-markets',
  'sector-rotation', 'industry-analysis', 'macro-economics', 'inflation',
  'interest-rates', 'gdp', 'unemployment', 'federal-reserve', 'monetary-policy',
  'fiscal-policy', 'trade', 'tariffs', 'supply-chain', 'innovation', 'technology',
  'biotech', 'energy', 'finance', 'healthcare', 'consumer', 'industrial',
  'materials', 'utilities', 'telecommunications', 'defensive-stocks', 'cyclical'
];

async function main() {
  console.log('📝 Add New Topic');
  console.log('================\n');

  // Load existing topics
  let topics = [];
  try {
    const data = fs.readFileSync(TOPICS_FILE, 'utf8');
    topics = JSON.parse(data);
    console.log(`Loaded ${topics.length} existing topics.\n`);
  } catch (error) {
    console.log('Creating new topics file.\n');
  }

  let title, difficulty, description;
  let selectedTags = [];

  if (inquirer) {
    // Use inquirer for interactive prompts
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Topic title:',
        validate: (input) => input.trim() ? true : 'Title is required'
      },
      {
        type: 'list',
        name: 'difficulty',
        message: 'Difficulty level:',
        choices: ['beginner', 'intermediate', 'advanced']
      },
      {
        type: 'input',
        name: 'description',
        message: 'Brief description:',
        validate: (input) => input.trim() ? true : 'Description is required'
      },
      {
        type: 'checkbox',
        name: 'tags',
        message: 'Select tags (use space to select, enter when done):',
        choices: AVAILABLE_TAGS.sort(),
        validate: (input) => input.length > 0 ? true : 'Select at least one tag'
      }
    ]);

    title = answers.title.trim();
    difficulty = answers.difficulty;
    description = answers.description.trim();
    selectedTags = answers.tags;
  } else {
    // Use readline for basic prompts
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    title = (await question('Topic title: ')).trim();
    if (!title) {
      console.log('Title is required!');
      rl.close();
      process.exit(1);
    }

    const diffInput = (await question('Difficulty (beginner/intermediate/advanced): ')).trim().toLowerCase();
    difficulty = ['beginner', 'intermediate', 'advanced'].includes(diffInput) ? diffInput : 'beginner';

    description = (await question('Brief description: ')).trim();
    if (!description) {
      console.log('Description is required!');
      rl.close();
      process.exit(1);
    }

    console.log('\nAvailable tags:');
    AVAILABLE_TAGS.sort().forEach((tag, i) => {
      process.stdout.write(`${tag} `);
      if ((i + 1) % 5 === 0) console.log();
    });
    console.log('\n');

    const tagsInput = (await question('Enter tags (comma-separated): ')).trim();
    selectedTags = tagsInput.split(',').map(t => t.trim()).filter(t => t);

    rl.close();
  }

  // Create new topic
  const newTopic = {
    title,
    difficulty,
    description,
    tags: selectedTags
  };

  // Check for duplicates
  const existing = topics.find(t => t.title.toLowerCase() === title.toLowerCase());
  if (existing) {
    console.log(`\n⚠️  A topic with this title already exists!`);
    console.log('Do you want to update it? (y/n)');
    process.exit(0);
  }

  // Add to topics
  topics.push(newTopic);

  // Sort by difficulty then title
  const difficultyOrder = { 'beginner': 0, 'intermediate': 1, 'advanced': 2 };
  topics.sort((a, b) => {
    if (difficultyOrder[a.difficulty] !== difficultyOrder[b.difficulty]) {
      return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    }
    return a.title.localeCompare(b.title);
  });

  // Save
  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2));

  console.log('\n✅ Topic added successfully!');
  console.log(`\nTotal topics: ${topics.length}`);
  console.log(`\nNew topic:`);
  console.log(JSON.stringify(newTopic, null, 2));
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});