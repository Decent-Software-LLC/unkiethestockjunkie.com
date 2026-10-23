#!/usr/bin/env node
/**
 * Show most frequently used tags in topics.json
 */

const fs = require('fs');
const path = require('path');

const TOPICS_FILE = path.join(__dirname, '..', 'topics.json');

function main() {
  // Load topics
  let topics = [];
  try {
    const data = fs.readFileSync(TOPICS_FILE, 'utf8');
    topics = JSON.parse(data);
  } catch (error) {
    console.error('Error loading topics:', error.message);
    process.exit(1);
  }

  // Count tags
  const tagCounts = {};
  const difficultyCounts = { beginner: 0, intermediate: 0, advanced: 0 };

  topics.forEach(topic => {
    // Count difficulty
    if (difficultyCounts[topic.difficulty] !== undefined) {
      difficultyCounts[topic.difficulty]++;
    }

    // Count tags
    if (topic.tags) {
      topic.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  // Display stats
  console.log('📊 Topics Statistics');
  console.log('===================\n');
  
  console.log(`Total Topics: ${topics.length}\n`);
  
  console.log('By Difficulty:');
  Object.entries(difficultyCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([difficulty, count]) => {
      const percentage = ((count / topics.length) * 100).toFixed(1);
      console.log(`  ${difficulty.padEnd(12)} ${count.toString().padStart(3)} (${percentage}%)`);
    });
  
  console.log('\nTop 30 Tags:');
  Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([tag, count], index) => {
      console.log(`  ${(index + 1).toString().padStart(2)}. ${tag.padEnd(25)} ${count}`);
    });

  // Show tags with only 1 usage
  const rareTags = Object.entries(tagCounts)
    .filter(([tag, count]) => count === 1)
    .map(([tag]) => tag)
    .sort();
  
  if (rareTags.length > 0) {
    console.log(`\nRare Tags (used only once):`);
    console.log(`  ${rareTags.join(', ')}`);
  }

  // Show beginner-friendly tags
  const beginnerTopics = topics.filter(t => t.difficulty === 'beginner');
  const beginnerTagCounts = {};
  beginnerTopics.forEach(topic => {
    if (topic.tags) {
      topic.tags.forEach(tag => {
        beginnerTagCounts[tag] = (beginnerTagCounts[tag] || 0) + 1;
      });
    }
  });

  console.log('\nTop 15 Tags in Beginner Topics:');
  Object.entries(beginnerTagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([tag, count], index) => {
      console.log(`  ${(index + 1).toString().padStart(2)}. ${tag.padEnd(25)} ${count}`);
    });
}

main();