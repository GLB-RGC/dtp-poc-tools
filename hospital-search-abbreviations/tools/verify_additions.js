#!/usr/bin/env node

/**
 * Verify ADDITIONS_FINAL.js Entries
 *
 * Tests each entry to ensure it actually needs an abbreviation.
 * If fuzzy matching already works, it should be removed.
 */

const fs = require('fs');
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search.js');

// Load data
console.log('Loading data...');
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

const abbrRaw = fs.readFileSync('ABBREVIATIONS_CLEANED.js', 'utf8');
const ABBREVIATIONS = {};
const matches = abbrRaw.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
for (const match of matches) {
  ABBREVIATIONS[match[1].toLowerCase()] = match[2];
}

// Build search index
const hospitalMap = searchModule.getHospitalMap(hospitalsCsvRaw);
const searchList = searchModule.addHospitalSearchItems(hospitalMap, healthSystems);
const abbreviationsByName = searchModule.buildAbbreviationsByName(ABBREVIATIONS);
const miniSearch = searchModule.getSearchIndex(searchList, abbreviationsByName);

console.log(`Loaded ${healthSystems.length} systems, ${Object.keys(ABBREVIATIONS).length} abbreviations\n`);

// Load ADDITIONS_FINAL.js
if (!fs.existsSync('ADDITIONS_FINAL.js')) {
  console.error('ERROR: ADDITIONS_FINAL.js not found');
  process.exit(1);
}

const additionsRaw = fs.readFileSync('ADDITIONS_FINAL.js', 'utf8');
const addMatches = additionsRaw.matchAll(/^"([^"]+)":\s*"([^"]+)",?\s*$/gm);

const results = [];
for (const match of addMatches) {
  const searchTerm = match[1];
  const targetSystem = match[2];

  const searchResults = searchModule.search(miniSearch, searchTerm);

  results.push({
    term: searchTerm,
    target: targetSystem,
    works: searchResults.length > 0,
    count: searchResults.length,
    topResult: searchResults.length > 0 ? searchResults[0].name : '',
    score: searchResults.length > 0 ? Math.round(searchResults[0].score) : 0
  });
}

const needsAbbr = results.filter(r => !r.works);
const alreadyWorks = results.filter(r => r.works);

console.log('='.repeat(70));
console.log('TESTING ALL ENTRIES IN ADDITIONS_FINAL.js');
console.log('='.repeat(70));
console.log(`Total entries: ${results.length}\n`);

if (alreadyWorks.length > 0) {
  console.log('⚠️  ALREADY WORKS (REMOVE THESE FROM ADDITIONS_FINAL.js):');
  console.log('='.repeat(70));
  alreadyWorks.forEach(r => {
    console.log(`\n"${r.term}": "${r.target}"`);
    console.log(`  ✓ Returns ${r.count} results (score: ${r.score})`);
    console.log(`  Top result: ${r.topResult}`);
    console.log(`  ACTION: Remove from ADDITIONS_FINAL.js - fuzzy already handles it`);
  });
  console.log('\n');
}

console.log('✅ NEEDS ABBREVIATION (KEEP THESE):');
console.log('='.repeat(70));
needsAbbr.forEach(r => {
  console.log(`"${r.term}": "${r.target}"`);
});

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Total entries tested: ${results.length}`);
console.log(`✅ Needs abbreviation: ${needsAbbr.length} (correct - keep these)`);
console.log(`⚠️  Already works: ${alreadyWorks.length} (REMOVE from ADDITIONS_FINAL.js)`);

if (alreadyWorks.length > 0) {
  console.log('\n' + '!'.repeat(70));
  console.log('⚠️  WARNING: Found entries that already work with fuzzy matching!');
  console.log('!'.repeat(70));
  console.log('\nACTION REQUIRED:');
  console.log('1. Remove the entries marked "ALREADY WORKS" from ADDITIONS_FINAL.js');
  console.log('2. Re-run this script to verify');
  console.log('3. Then copy to ABBREVIATIONS_CLEANED.js');
  process.exit(1);
} else {
  console.log('\n' + '✓'.repeat(70));
  console.log('✅ ALL ENTRIES VERIFIED - Ready to add to ABBREVIATIONS_CLEANED.js');
  console.log('✓'.repeat(70));
  console.log('\nNext steps:');
  console.log('1. Copy entries from ADDITIONS_FINAL.js to ABBREVIATIONS_CLEANED.js');
  console.log('2. Update header count in ABBREVIATIONS_CLEANED.js');
  console.log('3. Run: node test-scripts/test_abbreviation_impact.js');
}
