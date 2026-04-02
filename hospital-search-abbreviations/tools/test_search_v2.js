#!/usr/bin/env node

/**
 * Test Search V2 with Fallbacks
 *
 * Interactive tool to test the v2 search functionality
 * Shows both available and unavailable results
 *
 * REQUIREMENTS:
 * - dtp-api repo must be checked out to RGC-5677-fallback-systems-support branch
 *   (or any branch with ehr-healthsystem-search-v2.js)
 *
 * USAGE:
 *   cd /Users/jonathan.ross1/Projects/dtp-api
 *   git checkout RGC-5677-fallback-systems-support
 *   cd /Users/jonathan.ross1/Projects/hospital-search-abbreviations
 *   node tools/test_search_v2.js
 *
 * COMMANDS:
 *   Search > <query>          - Search for a system
 *   Search > /available-only  - Toggle v1/v2 mode
 *   Search > /exit            - Quit
 */

const fs = require('fs');
const readline = require('readline');
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search-v2.js');

// Load 1upHealth data
console.log('Loading 1upHealth data...');
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

const abbrRaw = fs.readFileSync('ABBREVIATIONS_CLEANED.js', 'utf8');
const ABBREVIATIONS = {};
const matches = abbrRaw.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
for (const match of matches) {
  ABBREVIATIONS[match[1].toLowerCase()] = match[2];
}

// Build 1upHealth search index
console.log('Building 1upHealth search index...');
const hospitalMap = searchModule.getHospitalMap(hospitalsCsvRaw);
const searchList = searchModule.addHospitalSearchItems(hospitalMap, healthSystems);
const abbreviationsByName = searchModule.buildAbbreviationsByName(ABBREVIATIONS);
const miniSearch = searchModule.getSearchIndex(searchList, abbreviationsByName);

console.log(`✓ Loaded ${healthSystems.length} systems, ${Object.keys(ABBREVIATIONS).length} abbreviations`);

// Load fallback systems
console.log('Loading fallback systems...');
const fallbackData = JSON.parse(fs.readFileSync('fallback_systems_verified.json', 'utf8'));
const fallbackList = Object.values(fallbackData.facilities);

// Build fallback search index
console.log('Building fallback search index...');
const fallbackSearch = searchModule.getFallbackSearchIndex(fallbackList);

console.log(`✓ Loaded ${fallbackList.length} fallback facilities\n`);

console.log('='.repeat(70));
console.log('SEARCH V2 TESTER - With Fallback Support');
console.log('='.repeat(70));
console.log('Type a hospital/system name to search');
console.log('Commands: /available-only (toggle), /exit\n');

let availableOnlyMode = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Search > '
});

rl.prompt();

rl.on('line', (line) => {
  const input = line.trim();

  if (input === '/exit') {
    console.log('\nGoodbye!');
    process.exit(0);
  }

  if (input === '/available-only') {
    availableOnlyMode = !availableOnlyMode;
    console.log(`Mode: ${availableOnlyMode ? 'Available only (v1 behavior)' : 'Available + Fallbacks (v2 behavior)'}\n`);
    rl.prompt();
    return;
  }

  if (!input) {
    rl.prompt();
    return;
  }

  console.log('');

  if (availableOnlyMode) {
    // V1 behavior - available only
    const results = searchModule.searchAvailableOnly(miniSearch, input);

    console.log(`V1 MODE: Found ${results.length} available systems\n`);

    results.slice(0, 10).forEach((result, i) => {
      console.log(`${i + 1}. ${result.name}`);
      console.log(`   EHR: ${result.ehr} | Score: ${Math.round(result.score)}`);
      if (result.healthSystem) {
        console.log(`   Health System: ${result.healthSystem}`);
      }
    });
  } else {
    // V2 behavior - available + fallbacks
    const result = searchModule.search(miniSearch, input, fallbackSearch);

    console.log(`V2 MODE: Found ${result.available.length} available + ${result.unavailable.length} unavailable\n`);

    if (result.available.length > 0) {
      console.log('✅ AVAILABLE SYSTEMS (can connect):');
      console.log('-'.repeat(70));
      result.available.slice(0, 10).forEach((system, i) => {
        console.log(`${i + 1}. ${system.name}`);
        console.log(`   EHR: ${system.ehr} | Score: ${Math.round(system.score)}`);
        if (system.healthSystem) {
          console.log(`   Health System: ${system.healthSystem}`);
        }
      });
      if (result.available.length > 10) {
        console.log(`   ... and ${result.available.length - 10} more`);
      }
      console.log('');
    }

    if (result.unavailable.length > 0) {
      console.log('⚠️  UNAVAILABLE SYSTEMS (not in network):');
      console.log('-'.repeat(70));
      result.unavailable.slice(0, 10).forEach((system, i) => {
        console.log(`${i + 1}. ${system.name}`);
        console.log(`   Location: ${system.city}, ${system.state} | Providers: ${system.provider_count.toLocaleString()}`);
        console.log(`   Score: ${Math.round(system.score)} | Reason: ${system.reason}`);
      });
      if (result.unavailable.length > 10) {
        console.log(`   ... and ${result.unavailable.length - 10} more`);
      }
      console.log('');
    }

    if (result.available.length === 0 && result.unavailable.length === 0) {
      console.log('❌ No results found (available or unavailable)\n');
    }
  }

  console.log('='.repeat(70));
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});
