#!/usr/bin/env node

/**
 * Hospital System Lookup Tool
 *
 * Uses ACTUAL search logic (MiniSearch + abbreviations) to show what users see
 * Find official system names and IDs to use when adding abbreviations
 */

const fs = require('fs');
const readline = require('readline');

// Load search module - USE ACTUAL SEARCH LOGIC
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search.js');

// Load 1upHealth data
console.log('Loading hospital systems...');
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

// Load abbreviations
const abbrRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/ABBREVIATIONS_CLEANED.js', 'utf8');
const ABBREVIATIONS = {};
const matches = abbrRaw.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
for (const match of matches) {
  ABBREVIATIONS[match[1].toLowerCase()] = match[2];
}

// Build search index with ACTUAL search code
const hospitalMap = searchModule.getHospitalMap(hospitalsCsvRaw);
const searchList = searchModule.addHospitalSearchItems(hospitalMap, healthSystems);
const abbreviationsByName = searchModule.buildAbbreviationsByName(ABBREVIATIONS);
const miniSearch = searchModule.getSearchIndex(searchList, abbreviationsByName);

console.log(`Loaded ${healthSystems.length.toLocaleString()} hospital systems`);
console.log(`Loaded ${Object.keys(ABBREVIATIONS).length} abbreviations`);
console.log('Built MiniSearch index with fuzzy matching\n');

// Create interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('='.repeat(70));
console.log('HOSPITAL SYSTEM LOOKUP TOOL');
console.log('='.repeat(70));
console.log('\nHow to use:');
console.log('  1. Type what you know (e.g., "University of Colorado", "Anschutz")');
console.log('  2. See ACTUAL search results (same as users see)');
console.log('  3. Copy the system name and ID for abbreviation mapping');
console.log('\nExample:');
console.log('  Search: university of colorado');
console.log('  Find:   UCHealth (ID: 1234)');
console.log('  Add:    "university of colorado": "UCHealth"\n');
console.log('Type "exit" to quit\n');
console.log('='.repeat(70));

function displayResults(results, query) {
  console.log('\n' + '='.repeat(70));
  console.log(`Search: "${query}"`);
  console.log(`Results: ${results.length} system${results.length !== 1 ? 's' : ''} found`);
  console.log('='.repeat(70));

  if (results.length === 0) {
    console.log('\n❌ No results found');
    console.log('   This search would return zero results for users');
    console.log('   You may need to add an abbreviation for this term\n');
    return;
  }

  results.slice(0, 10).forEach((result, idx) => {
    console.log(`\n[${idx + 1}] ${result.name}`);
    console.log(`    ID: ${result.id}`);
    console.log(`    Score: ${Math.round(result.score)}`);
    if (result.ehr) {
      console.log(`    EHR: ${result.ehr}`);
    }
    if (result.healthSystem && result.healthSystem !== result.name) {
      console.log(`    Parent: ${result.healthSystem}`);
    }
  });

  if (results.length > 10) {
    console.log(`\n... and ${results.length - 10} more results`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log('💡 To add as abbreviation:');
  console.log(`   "${query.toLowerCase()}": "${results[0].name}"`);
  console.log('-'.repeat(70) + '\n');
}

function prompt() {
  rl.question('Search > ', (query) => {
    query = query.trim();

    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      return;
    }

    if (query.length < 2) {
      console.log('⚠️  Please enter at least 2 characters\n');
      prompt();
      return;
    }

    // Use ACTUAL search logic
    const results = searchModule.search(miniSearch, query);
    displayResults(results, query);
    prompt();
  });
}

// Start prompting
prompt();
