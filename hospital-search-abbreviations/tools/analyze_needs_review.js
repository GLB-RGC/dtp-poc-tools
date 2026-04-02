#!/usr/bin/env node

/**
 * Analyze NEEDS_REVIEW Searches
 *
 * For each NEEDS_REVIEW search:
 * 1. Use system_lookup (actual search) to see if fuzzy variants work
 * 2. Search Google to identify if it's a real hospital system
 * 3. Try to match to 1upHealth systems
 * 4. Suggest abbreviation with confidence score
 */

const fs = require('fs');
const https = require('https');

// Load search module
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search.js');

// Load 1upHealth data
console.log('Loading data...');
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

// Load current abbreviations
const abbrRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/ABBREVIATIONS_CLEANED.js', 'utf8');
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

// Parse CSV line
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Try various search strategies
function trySearchVariations(searchTerm) {
  const variations = [
    searchTerm,
    searchTerm.toLowerCase(),
    searchTerm + ' hospital',
    searchTerm + ' health',
    searchTerm + ' medical center',
    searchTerm.replace(/\s+/g, ''), // remove spaces
    searchTerm.replace(/([a-z])([A-Z])/g, '$1 $2'), // add space before capitals
  ];

  for (const variant of variations) {
    const results = searchModule.search(miniSearch, variant);
    if (results.length > 0) {
      return {
        found: true,
        variant: variant,
        results: results.slice(0, 3),
        strategy: variant === searchTerm ? 'direct' : 'variant'
      };
    }
  }

  return { found: false };
}

// Simple Google search (construct URL)
function googleSearch(searchTerm) {
  const query = encodeURIComponent(searchTerm + ' hospital health system');
  return `https://www.google.com/search?q=${query}`;
}

// Fuzzy match search term against 1upHealth system names
function fuzzyMatchToSystems(searchTerm) {
  const lower = searchTerm.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 2);

  const matches = healthSystems
    .map(sys => {
      const sysLower = sys.name.toLowerCase();
      let score = 0;

      // Exact substring match
      if (sysLower.includes(lower)) score += 50;

      // All words present
      const allWordsMatch = words.every(w => sysLower.includes(w));
      if (allWordsMatch) score += 30;

      // Word count bonus (prefer shorter/simpler names)
      if (allWordsMatch && words.length > 0) {
        score += words.length * 5;
      }

      // Partial word matches
      words.forEach(w => {
        if (sysLower.includes(w)) score += 10;
      });

      return { system: sys, score };
    })
    .filter(m => m.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return matches;
}

// Determine confidence level
function determineConfidence(searchResult, fuzzyMatches) {
  if (searchResult.found && searchResult.strategy === 'direct') {
    return { level: 'HIGH', reason: 'Direct search match' };
  }

  if (searchResult.found && searchResult.strategy === 'variant') {
    return { level: 'MEDIUM', reason: `Found via variant: ${searchResult.variant}` };
  }

  if (fuzzyMatches.length > 0 && fuzzyMatches[0].score >= 50) {
    return { level: 'MEDIUM', reason: `Strong fuzzy match (score: ${fuzzyMatches[0].score})` };
  }

  if (fuzzyMatches.length > 0 && fuzzyMatches[0].score >= 30) {
    return { level: 'LOW', reason: `Weak fuzzy match (score: ${fuzzyMatches[0].score})` };
  }

  return { level: 'NONE', reason: 'No matches found' };
}

async function analyzeSearch(searchTerm) {
  // Step 1: Try search variations
  const searchResult = trySearchVariations(searchTerm);

  // Step 2: Fuzzy match against system names
  const fuzzyMatches = fuzzyMatchToSystems(searchTerm);

  // Step 3: Determine confidence and suggestion
  const confidence = determineConfidence(searchResult, fuzzyMatches);

  let suggestedAbbreviation = '';
  let suggestedSystem = '';
  let method = '';

  if (searchResult.found) {
    suggestedAbbreviation = searchTerm.toLowerCase();
    suggestedSystem = searchResult.results[0].name;
    method = 'search_variant';
  } else if (fuzzyMatches.length > 0) {
    suggestedAbbreviation = searchTerm.toLowerCase();
    suggestedSystem = fuzzyMatches[0].system.name;
    method = 'fuzzy_match';
  }

  return {
    search_term: searchTerm,
    confidence: confidence.level,
    confidence_reason: confidence.reason,
    suggested_abbreviation: suggestedAbbreviation,
    suggested_system: suggestedSystem,
    system_id: suggestedSystem ? (searchResult.found ? searchResult.results[0].id : fuzzyMatches[0].system.id) : '',
    system_ehr: suggestedSystem ? (searchResult.found ? searchResult.results[0].ehr : fuzzyMatches[0].system.ehr) : '',
    method: method,
    alternative_1: fuzzyMatches[1] ? fuzzyMatches[1].system.name : '',
    alternative_2: fuzzyMatches[2] ? fuzzyMatches[2].system.name : '',
    google_url: googleSearch(searchTerm)
  };
}

async function main() {
  console.log('Analyzing NEEDS_REVIEW searches...\n');

  // Load comprehensive analysis (path relative to project root)
  const csvData = fs.readFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/test-results/comprehensive_analysis.csv', 'utf8');
  const lines = csvData.split('\n');

  const results = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const cols = parseCSVLine(lines[i]);
    const searchTerm = cols[0];
    const category = cols[1];

    if (category !== 'NEEDS_REVIEW') continue;

    process.stdout.write(`Analyzing ${i}/${lines.length - 1}: ${searchTerm}...\r`);

    const analysis = await analyzeSearch(searchTerm);
    results.push(analysis);

    // Rate limit (be nice to avoid detection)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n\nAnalysis complete!\n');

  // Sort by confidence
  const confidenceOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3, 'NONE': 4 };
  results.sort((a, b) => {
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return a.search_term.localeCompare(b.search_term);
  });

  // Write CSV
  const outputLines = [
    'search_term,confidence,confidence_reason,suggested_abbreviation,suggested_system,system_id,system_ehr,method,alternative_1,alternative_2,google_url'
  ];

  results.forEach(r => {
    const line = [
      `"${r.search_term.replace(/"/g, '""')}"`,
      r.confidence,
      `"${r.confidence_reason.replace(/"/g, '""')}"`,
      `"${r.suggested_abbreviation.replace(/"/g, '""')}"`,
      `"${r.suggested_system.replace(/"/g, '""')}"`,
      `"${r.system_id}"`,
      `"${r.system_ehr}"`,
      r.method,
      `"${r.alternative_1.replace(/"/g, '""')}"`,
      `"${r.alternative_2.replace(/"/g, '""')}"`,
      `"${r.google_url}"`
    ].join(',');
    outputLines.push(line);
  });

  fs.writeFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/test-results/needs_review_analysis.csv', outputLines.join('\n'));

  // Print summary
  const summary = {
    HIGH: results.filter(r => r.confidence === 'HIGH').length,
    MEDIUM: results.filter(r => r.confidence === 'MEDIUM').length,
    LOW: results.filter(r => r.confidence === 'LOW').length,
    NONE: results.filter(r => r.confidence === 'NONE').length
  };

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total analyzed: ${results.length}`);
  console.log(`  HIGH confidence: ${summary.HIGH} (ready to add)`);
  console.log(`  MEDIUM confidence: ${summary.MEDIUM} (review suggestions)`);
  console.log(`  LOW confidence: ${summary.LOW} (needs research)`);
  console.log(`  NO match: ${summary.NONE} (manual research required)`);

  console.log('\n' + '='.repeat(70));
  console.log('HIGH CONFIDENCE SUGGESTIONS (top 10)');
  console.log('='.repeat(70));
  results.filter(r => r.confidence === 'HIGH').slice(0, 10).forEach(r => {
    console.log(`\n"${r.search_term}" → "${r.suggested_system}"`);
    console.log(`  Add: "${r.suggested_abbreviation}": "${r.suggested_system}"`);
    console.log(`  ID: ${r.system_id}, EHR: ${r.system_ehr}`);
  });

  console.log('\n\nOutput: test-results/needs_review_analysis.csv');
  console.log('\nReview priority:');
  console.log('  1. HIGH confidence - add directly');
  console.log('  2. MEDIUM confidence - verify with Google link');
  console.log('  3. LOW/NONE - manual research required');
}

main().catch(err => {
  console.error('\nERROR:', err);
  process.exit(1);
});
