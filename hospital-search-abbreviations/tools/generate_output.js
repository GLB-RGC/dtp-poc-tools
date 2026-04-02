#!/usr/bin/env node

/**
 * Generate Organized Output Files
 *
 * Creates dated output folder with:
 * - comprehensive_analysis.csv (full analysis with suggested abbreviations)
 * - needs_review.csv (subset requiring manual review)
 * - add_to_abbreviations.js (verified abbreviations ready to paste)
 * - already_works.csv (searches that now work)
 */

const fs = require('fs');
const path = require('path');

const DATE = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

console.log(`Generating output files for ${DATE}...\n`);

// Create output directory
const outputDir = `output`;
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Load comprehensive analysis
const comprehensivePath = 'test-results/comprehensive_analysis.csv';
if (!fs.existsSync(comprehensivePath)) {
  console.error('ERROR: test-results/comprehensive_analysis.csv not found!');
  console.error('Run: node tools/comprehensive_search_analysis.js <log_file.csv> first');
  process.exit(1);
}

const csv = fs.readFileSync(comprehensivePath, 'utf8');
const lines = csv.split('\n').filter(l => l.trim());
const header = lines[0];

console.log(`Loaded ${lines.length - 1} searches from comprehensive_analysis.csv`);

// Load ADDITIONS_FINAL.js if it exists
let abbreviationMap = {};
const additionsPath = 'ADDITIONS_FINAL.js';
if (fs.existsSync(additionsPath)) {
  const additionsRaw = fs.readFileSync(additionsPath, 'utf8');
  const matches = additionsRaw.matchAll(/^\"([^\"]+)\":\s*\"([^\"]+)\",?\s*$/gm);
  for (const match of matches) {
    abbreviationMap[match[1].toLowerCase()] = match[2];
  }
  console.log(`Loaded ${Object.keys(abbreviationMap).length} abbreviations from ADDITIONS_FINAL.js`);
} else {
  console.log('No ADDITIONS_FINAL.js found - skipping abbreviation suggestions');
}

// Parse and categorize
const needsReview = [header];
const alreadyWorks = [header];
const notHealthSystem = [header];
const comprehensiveWithAbbr = [header + ',suggested_abbreviation,suggested_target_system'];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  // Simple CSV parse (assumes search_term is first column)
  const searchTermMatch = line.match(/^"?([^",]+)"?,/);
  const searchTerm = searchTermMatch ? searchTermMatch[1].replace(/[<>&]/g, '').trim().toLowerCase() : '';

  // Get category
  const isNeedsReview = line.includes('NEEDS_REVIEW');
  const isAlreadyWorks = line.includes('ALREADY_WORKS');
  const isNotHealthSystem = line.includes('NOT_HEALTH_SYSTEM');

  // Check if we have an abbreviation suggestion
  const suggestedTarget = abbreviationMap[searchTerm] || '';
  const suggestedAbbr = suggestedTarget ? searchTerm : '';

  // Add to comprehensive with suggestions
  comprehensiveWithAbbr.push(`${line},"${suggestedAbbr}","${suggestedTarget}"`);

  // Add to filtered subsets
  if (isNeedsReview) needsReview.push(line);
  if (isAlreadyWorks) alreadyWorks.push(line);
  if (isNotHealthSystem) notHealthSystem.push(line);
}

// Write files
const files = {
  [`comprehensive_analysis_${DATE}.csv`]: comprehensiveWithAbbr,
  [`needs_review_${DATE}.csv`]: needsReview,
  [`already_works_${DATE}.csv`]: alreadyWorks,
  [`not_health_system_${DATE}.csv`]: notHealthSystem,
};

Object.entries(files).forEach(([filename, content]) => {
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, content.join('\n'));
  console.log(`✓ ${filepath} (${content.length - 1} rows)`);
});

// Copy ADDITIONS_FINAL.js if it exists
if (fs.existsSync(additionsPath)) {
  const copyPath = path.join(outputDir, `add_to_abbreviations_${DATE}.js`);
  fs.copyFileSync(additionsPath, copyPath);
  console.log(`✓ ${copyPath} (${Object.keys(abbreviationMap).length} abbreviations)`);
}

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`NEEDS_REVIEW: ${needsReview.length - 1} searches`);
console.log(`ALREADY_WORKS: ${alreadyWorks.length - 1} searches`);
console.log(`NOT_HEALTH_SYSTEM: ${notHealthSystem.length - 1} searches`);
if (Object.keys(abbreviationMap).length > 0) {
  console.log(`\nABBREVIATIONS TO ADD: ${Object.keys(abbreviationMap).length}`);
}

console.log('\n' + '='.repeat(70));
console.log('FILES GENERATED');
console.log('='.repeat(70));
console.log(`output/comprehensive_analysis_${DATE}.csv`);
console.log(`  - Full analysis with suggested abbreviations`);
console.log(`  - Use this to see which searches have ready solutions`);
console.log('');
console.log(`output/needs_review_${DATE}.csv`);
console.log(`  - ${needsReview.length - 1} searches requiring manual research`);
console.log(`  - Use tools/system_lookup.js to investigate each term`);
console.log('');
console.log(`output/already_works_${DATE}.csv`);
console.log(`  - ${alreadyWorks.length - 1} searches that now return results`);
console.log(`  - These are false positives from the log`);
if (fs.existsSync(additionsPath)) {
  console.log('');
  console.log(`output/add_to_abbreviations_${DATE}.js`);
  console.log(`  - ${Object.keys(abbreviationMap).length} abbreviations ready to paste`);
  console.log(`  - Copy to ABBREVIATIONS_CLEANED.js`);
}

console.log('\n' + '='.repeat(70));
console.log('NEXT STEPS');
console.log('='.repeat(70));
console.log('1. Review output/needs_review_' + DATE + '.csv');
console.log('2. Use tools/system_lookup.js to verify each term');
console.log('3. Add verified abbreviations to ADDITIONS_FINAL.js');
console.log('4. Re-run this script to update output files');
console.log('5. Copy output/add_to_abbreviations_' + DATE + '.js to ABBREVIATIONS_CLEANED.js');
console.log('6. Test with: node test-scripts/test_abbreviation_impact.js');
