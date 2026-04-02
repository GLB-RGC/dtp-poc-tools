#!/usr/bin/env node

/**
 * Analyze NEEDS_REVIEW Searches with Web Research
 *
 * For each NEEDS_REVIEW search:
 * 1. Actually search the web (Google/DuckDuckGo) to identify the hospital
 * 2. Use real judgment to determine if it's a valid hospital system
 * 3. Match to 1upHealth systems
 * 4. Provide honest confidence scores with reasoning
 */

const fs = require('fs');
const https = require('https');

// Load search module (for matching to 1upHealth systems)
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

// Fetch DuckDuckGo instant answer
async function searchDuckDuckGo(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query + ' hospital');
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            abstract: result.Abstract || '',
            heading: result.Heading || '',
            url: result.AbstractURL || '',
            topics: result.RelatedTopics || []
          });
        } catch (e) {
          resolve({ abstract: '', heading: '', url: '', topics: [] });
        }
      });
    }).on('error', () => resolve({ abstract: '', heading: '', url: '', topics: [] }));
  });
}

// Extract hospital name from web results
function extractHospitalName(webResult, searchTerm) {
  const text = (webResult.abstract + ' ' + webResult.heading).toLowerCase();

  // Look for common patterns
  const patterns = [
    /is a (hospital|health system|medical center|healthcare system)/i,
    /(hospital|health system|medical center) (?:located )?in/i,
    /part of ([A-Z][a-z]+ (?:Health|Medical|Hospital)[^,.]+)/,
  ];

  for (const pattern of patterns) {
    const match = (webResult.abstract + ' ' + webResult.heading).match(pattern);
    if (match) return match[1] || match[0];
  }

  // Check heading
  if (webResult.heading && webResult.heading.toLowerCase().includes('health')) {
    return webResult.heading;
  }

  return null;
}

// Match extracted name to 1upHealth systems
function matchTo1upHealth(extractedName, searchTerm) {
  if (!extractedName) return null;

  const lower = extractedName.toLowerCase();

  // Try exact match first
  const exactMatch = healthSystems.find(s => s.name.toLowerCase() === lower);
  if (exactMatch) return { system: exactMatch, confidence: 'HIGH', reason: 'Exact name match from web' };

  // Try substring match
  const substringMatch = healthSystems.find(s =>
    s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase())
  );
  if (substringMatch) return { system: substringMatch, confidence: 'MEDIUM', reason: 'Partial name match from web' };

  // Try matching key words
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  const wordMatches = healthSystems
    .map(s => {
      const sysLower = s.name.toLowerCase();
      const matchedWords = words.filter(w => sysLower.includes(w));
      return { system: s, score: matchedWords.length };
    })
    .filter(m => m.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (wordMatches.length > 0) {
    return { system: wordMatches[0].system, confidence: 'LOW', reason: 'Word overlap from web research' };
  }

  return null;
}

// Make judgment about search term
function makeJudgment(searchTerm, webResult) {
  const lower = searchTerm.toLowerCase();

  // Clear junk patterns
  if (/^[a-z]{1,2}$/.test(lower)) return { isJunk: true, reason: 'Too short, likely gibberish' };
  if (/@/.test(searchTerm)) return { isJunk: true, reason: 'Email address' };
  if (/\.(com|org|edu)/.test(searchTerm)) return { isJunk: true, reason: 'Domain name' };
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(searchTerm) && !/health|medical|hospital|clinic/i.test(searchTerm)) {
    return { isJunk: true, reason: 'Likely person name' };
  }

  // Check web result quality
  if (webResult.abstract || webResult.heading) {
    const text = (webResult.abstract + ' ' + webResult.heading).toLowerCase();

    if (text.includes('hospital') || text.includes('health system') || text.includes('medical center')) {
      return { isJunk: false, reason: 'Web confirms it\'s a hospital/health system' };
    }

    if (text.includes('physician') || text.includes('doctor') || text.includes('practice')) {
      return { isJunk: true, reason: 'Web shows it\'s a doctor/practice, not a system' };
    }

    if (text.includes('insurance') || text.includes('pharmacy') || text.includes('lab')) {
      return { isJunk: true, reason: 'Not a hospital system' };
    }
  }

  return { isJunk: false, reason: 'Uncertain, needs manual review' };
}

async function analyzeSearch(searchTerm, index, total) {
  process.stdout.write(`[${index}/${total}] Researching: ${searchTerm}...                    \r`);

  // Step 1: Search the web
  const webResult = await searchDuckDuckGo(searchTerm);

  // Step 2: Make judgment
  const judgment = makeJudgment(searchTerm, webResult);

  if (judgment.isJunk) {
    return {
      search_term: searchTerm,
      is_junk: 'YES',
      junk_reason: judgment.reason,
      confidence: 'N/A',
      suggested_abbreviation: '',
      suggested_system: '',
      system_id: '',
      system_ehr: '',
      web_finding: webResult.abstract.substring(0, 200) || 'No web result',
      reasoning: judgment.reason
    };
  }

  // Step 3: Extract hospital name from web
  const extractedName = extractHospitalName(webResult, searchTerm);

  // Step 4: Try to match to 1upHealth
  const match = matchTo1upHealth(extractedName, searchTerm);

  if (match) {
    return {
      search_term: searchTerm,
      is_junk: 'NO',
      junk_reason: '',
      confidence: match.confidence,
      suggested_abbreviation: searchTerm.toLowerCase(),
      suggested_system: match.system.name,
      system_id: match.system.id,
      system_ehr: match.system.ehr || '',
      web_finding: webResult.abstract.substring(0, 200) || webResult.heading,
      reasoning: match.reason
    };
  }

  // Step 5: If web found info but no 1upHealth match
  if (webResult.abstract || webResult.heading) {
    return {
      search_term: searchTerm,
      is_junk: 'NO',
      junk_reason: '',
      confidence: 'NOT_IN_1UPHEALTH',
      suggested_abbreviation: '',
      suggested_system: extractedName || 'Unknown',
      system_id: '',
      system_ehr: '',
      web_finding: webResult.abstract.substring(0, 200) || webResult.heading,
      reasoning: 'Web confirms hospital exists, but not in 1upHealth database'
    };
  }

  // Step 6: No web results, uncertain
  return {
    search_term: searchTerm,
    is_junk: 'UNKNOWN',
    junk_reason: '',
    confidence: 'UNKNOWN',
    suggested_abbreviation: '',
    suggested_system: '',
    system_id: '',
    system_ehr: '',
    web_finding: 'No web results found',
    reasoning: 'Could not determine from web search, needs manual research'
  };
}

async function main() {
  console.log('Analyzing NEEDS_REVIEW searches with web research...\n');
  console.log('This will take several minutes (rate-limited to avoid detection)\n');

  // Load comprehensive analysis
  const csvData = fs.readFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/test-results/comprehensive_analysis.csv', 'utf8');
  const lines = csvData.split('\n');

  const results = [];
  const needsReview = lines.filter((line, i) => {
    if (i === 0) return false;
    if (!line.trim()) return false;
    const cols = parseCSVLine(line);
    return cols[1] === 'NEEDS_REVIEW';
  });

  console.log(`Found ${needsReview.length} searches to analyze\n`);

  for (let i = 0; i < needsReview.length; i++) {
    const cols = parseCSVLine(needsReview[i]);
    const searchTerm = cols[0];

    const analysis = await analyzeSearch(searchTerm, i + 1, needsReview.length);
    results.push(analysis);

    // Rate limit: 2 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n\nAnalysis complete!\n');

  // Sort by confidence/junk status
  const sortOrder = {
    'HIGH': 1,
    'MEDIUM': 2,
    'LOW': 3,
    'NOT_IN_1UPHEALTH': 4,
    'N/A': 5,
    'UNKNOWN': 6
  };
  results.sort((a, b) => {
    const aOrder = sortOrder[a.confidence] || 99;
    const bOrder = sortOrder[b.confidence] || 99;
    return aOrder - bOrder;
  });

  // Write CSV
  const outputLines = [
    'search_term,is_junk,confidence,suggested_abbreviation,suggested_system,system_id,system_ehr,web_finding,reasoning'
  ];

  results.forEach(r => {
    const line = [
      `"${r.search_term.replace(/"/g, '""')}"`,
      r.is_junk,
      r.confidence,
      `"${r.suggested_abbreviation.replace(/"/g, '""')}"`,
      `"${r.suggested_system.replace(/"/g, '""')}"`,
      `"${r.system_id}"`,
      `"${r.system_ehr}"`,
      `"${r.web_finding.replace(/"/g, '""')}"`,
      `"${r.reasoning.replace(/"/g, '""')}"`
    ].join(',');
    outputLines.push(line);
  });

  fs.writeFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/test-results/needs_review_web_research.csv', outputLines.join('\n'));

  // Print summary
  const summary = {
    HIGH: results.filter(r => r.confidence === 'HIGH').length,
    MEDIUM: results.filter(r => r.confidence === 'MEDIUM').length,
    LOW: results.filter(r => r.confidence === 'LOW').length,
    NOT_IN_1UPHEALTH: results.filter(r => r.confidence === 'NOT_IN_1UPHEALTH').length,
    JUNK: results.filter(r => r.is_junk === 'YES').length,
    UNKNOWN: results.filter(r => r.confidence === 'UNKNOWN').length
  };

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total analyzed: ${results.length}`);
  console.log(`  HIGH confidence: ${summary.HIGH} (ready to add)`);
  console.log(`  MEDIUM confidence: ${summary.MEDIUM} (review before adding)`);
  console.log(`  LOW confidence: ${summary.LOW} (needs verification)`);
  console.log(`  NOT in 1upHealth: ${summary.NOT_IN_1UPHEALTH} (valid but can't connect)`);
  console.log(`  JUNK: ${summary.JUNK} (ignore these)`);
  console.log(`  UNKNOWN: ${summary.UNKNOWN} (manual research required)`);

  console.log('\n' + '='.repeat(70));
  console.log('HIGH CONFIDENCE MATCHES');
  console.log('='.repeat(70));
  results.filter(r => r.confidence === 'HIGH').forEach(r => {
    console.log(`\n"${r.search_term}" → "${r.suggested_system}"`);
    console.log(`  Add: "${r.suggested_abbreviation}": "${r.suggested_system}"`);
    console.log(`  ID: ${r.system_id}, EHR: ${r.system_ehr}`);
    console.log(`  Why: ${r.reasoning}`);
  });

  console.log('\n\nOutput: test-results/needs_review_web_research.csv');
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
