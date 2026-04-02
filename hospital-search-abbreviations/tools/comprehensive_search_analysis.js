#!/usr/bin/env node

/**
 * Comprehensive Search Analysis - WITH CLAUDE SUGGESTIONS
 *
 * Step 1: Use ACTUAL search code to test each term
 * Step 2: For failed searches (0 results), Claude suggests action
 *
 * Actions:
 * - WORKS: Search returns results (no action needed)
 * - ADD: Ready to add abbreviation (with confidence HIGH/MEDIUM)
 * - SKIP: Real system, not in 1upHealth
 * - JUNK: Ignore (email, doctor name, insurance, etc.)
 */

const fs = require('fs');

// Load search module - USE ACTUAL SEARCH LOGIC
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search.js');

// Load 1upHealth data
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

// Load current abbreviations
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

// Load known mappings from ADDITIONS_FINAL.js (our verified suggestions)
const KNOWN_MAPPINGS = {};
if (fs.existsSync('ADDITIONS_FINAL.js')) {
  const additionsRaw = fs.readFileSync('ADDITIONS_FINAL.js', 'utf8');
  const addMatches = additionsRaw.matchAll(/^"([^"]+)":\s*"([^"]+)",?\s*$/gm);
  for (const match of addMatches) {
    KNOWN_MAPPINGS[match[1].toLowerCase()] = match[2];
  }
  console.log(`Loaded ${Object.keys(KNOWN_MAPPINGS).length} known mappings from ADDITIONS_FINAL.js\n`);
}

// Junk detection
function analyzeFailedSearch(searchTerm, searchResults) {
  const lower = searchTerm.toLowerCase().trim();

  // If search works, no analysis needed
  if (searchResults.length > 0) {
    return {
      action: 'WORKS',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: `Returns ${searchResults.length} results`
    };
  }

  // JUNK detection - obvious non-hospitals

  // Emails
  if (/@|<|>/.test(searchTerm)) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Email address or HTML tag'
    };
  }

  // URLs
  if (/\.(com|org|net|gov|edu)($|\s)/.test(lower)) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Website URL'
    };
  }

  // Labs/diagnostics
  const labs = ['labcorp', 'quest diagnostics', 'quest', 'biorestoration', 'natera', 'genesight'];
  if (labs.some(lab => lower === lab || lower.includes(lab))) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Lab/diagnostic company'
    };
  }

  // Insurance
  if (lower.includes('blue cross') || lower.includes('blue shield') || lower.includes('bcbs')) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Insurance provider'
    };
  }
  const insurance = ['aetna', 'cigna', 'united healthcare', 'humana', 'healthnet', 'excellus', 'partnership health plan'];
  if (insurance.some(ins => lower === ins || lower.includes(ins))) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Insurance provider'
    };
  }

  // EHR vendors / Portal software
  const ehrVendors = ['athenahealth', 'althena', 'elation', 'followmyhealth', 'myhealthone', 'myhealthvet', 'healthevet'];
  if (ehrVendors.some(ehr => lower === ehr || lower.includes(ehr))) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'EHR/portal software'
    };
  }

  // Retail clinics
  if (lower.includes('minuteclinic') || lower === 'onemedical' || lower.includes('minute cl')) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Retail clinic'
    };
  }

  // Pharmacy
  if (lower === 'cvs' || lower.includes('pharmacy')) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Pharmacy'
    };
  }

  // Doctor names (First Last format)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(searchTerm) && !/health|hospital|medical|clinic/i.test(searchTerm)) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Likely person name'
    };
  }

  // Too short/gibberish
  if (searchTerm.length <= 2 || /^(boobl|boobs)$/i.test(searchTerm)) {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Too short or gibberish'
    };
  }

  // Government/non-healthcare
  if (lower.includes('government') || lower.includes('idph') || lower === 'vet' || lower === 'veteran') {
    return {
      action: 'JUNK',
      confidence: 'NONE',
      suggested_abbreviation: '',
      suggested_target_system: '',
      reasoning: 'Government agency or too generic'
    };
  }

  // Check if we have a known mapping (from ADDITIONS_FINAL.js)
  if (KNOWN_MAPPINGS[lower]) {
    const targetSystem = KNOWN_MAPPINGS[lower];
    return {
      action: 'ADD',
      confidence: 'HIGH',
      suggested_abbreviation: lower,
      suggested_target_system: targetSystem,
      reasoning: 'Verified mapping from analysis'
    };
  }

  // Unknown - needs manual review
  return {
    action: 'SKIP',
    confidence: 'NONE',
    suggested_abbreviation: '',
    suggested_target_system: '',
    reasoning: 'Unknown - manual research needed'
  };
}

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

function main() {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error('Usage: node comprehensive_search_analysis.js <input_csv>');
    process.exit(1);
  }

  console.log(`Analyzing: ${inputFile}\n`);

  const csvData = fs.readFileSync(inputFile, 'utf8');
  const lines = csvData.split('\n');

  // Parse header
  const header = parseCSVLine(lines[0]);
  const searchTermIndex = header.findIndex(h => h.toLowerCase().includes('search'));

  if (searchTermIndex === -1) {
    console.error('ERROR: Could not find search_term column');
    process.exit(1);
  }

  const results = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const cols = parseCSVLine(lines[i]);
    const searchTerm = cols[searchTermIndex];

    if (!searchTerm || seen.has(searchTerm.toLowerCase())) continue;
    seen.add(searchTerm.toLowerCase());

    // Step 1: Run ACTUAL search
    const searchResults = searchModule.search(miniSearch, searchTerm);

    // Step 2: For failed searches, Claude analyzes
    const analysis = analyzeFailedSearch(searchTerm, searchResults);

    results.push({
      search_term: searchTerm,
      action: analysis.action,
      confidence: analysis.confidence,
      suggested_abbreviation: analysis.suggested_abbreviation,
      suggested_target_system: analysis.suggested_target_system,
      reasoning: analysis.reasoning,
      current_results_count: searchResults.length,
      top_result: searchResults.length > 0 ? searchResults[0].name : ''
    });

    if (i % 10 === 0) process.stdout.write('.');
  }

  console.log('\n\nAnalysis complete!\n');

  // Sort: ADD > SKIP > JUNK > WORKS
  const actionOrder = { 'ADD': 1, 'SKIP': 2, 'JUNK': 3, 'WORKS': 4 };
  results.sort((a, b) => {
    const orderDiff = actionOrder[a.action] - actionOrder[b.action];
    if (orderDiff !== 0) return orderDiff;
    // Within same action, sort by confidence
    const confOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3, 'NONE': 4 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return a.search_term.localeCompare(b.search_term);
  });

  // Write CSV
  const outputLines = [
    'search_term,action,confidence,suggested_abbreviation,suggested_target_system,reasoning,current_results_count,top_result'
  ];

  results.forEach(r => {
    const line = [
      `"${r.search_term.replace(/"/g, '""')}"`,
      r.action,
      r.confidence,
      `"${r.suggested_abbreviation.replace(/"/g, '""')}"`,
      `"${r.suggested_target_system.replace(/"/g, '""')}"`,
      `"${r.reasoning.replace(/"/g, '""')}"`,
      r.current_results_count,
      `"${r.top_result.replace(/"/g, '""')}"`
    ].join(',');
    outputLines.push(line);
  });

  const outputFile = 'test-results/comprehensive_analysis.csv';
  fs.writeFileSync(outputFile, outputLines.join('\n'));

  // Print summary
  const summary = {
    ADD: results.filter(r => r.action === 'ADD').length,
    SKIP: results.filter(r => r.action === 'SKIP').length,
    JUNK: results.filter(r => r.action === 'JUNK').length,
    WORKS: results.filter(r => r.action === 'WORKS').length
  };

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total analyzed: ${results.length}`);
  console.log(`  ADD: ${summary.ADD} (ready to add to abbreviations)`);
  console.log(`    HIGH confidence: ${results.filter(r => r.action === 'ADD' && r.confidence === 'HIGH').length}`);
  console.log(`  SKIP: ${summary.SKIP} (unknown - needs manual research)`);
  console.log(`  JUNK: ${summary.JUNK} (ignore - emails, insurance, etc.)`);
  console.log(`  WORKS: ${summary.WORKS} (search already returns results)`);

  console.log(`\nOutput: ${outputFile}`);
  console.log('\nNext step: Review SKIP items and update ADDITIONS_FINAL.js with verified mappings');
}

main();
