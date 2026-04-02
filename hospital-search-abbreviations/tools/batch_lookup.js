#!/usr/bin/env node

/**
 * Batch System Lookup
 * Check all NEEDS_REVIEW searches against actual 1upHealth data
 */

const fs = require('fs');
const searchModule = require('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/ehr-healthsystem-search.js');

// Load data
const healthSystemsRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json', 'utf8');
const healthSystems = JSON.parse(healthSystemsRaw);

const hospitalsCsvRaw = fs.readFileSync('/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_hospitals.testdata.csv', 'utf8');

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

// All NEEDS_REVIEW searches
const searches = [
  "adelante",
  "althena",
  "Anshutz",
  "Arizona Oncology of U.S. Oncology Network",
  "Atlanticare",
  "bannerhealth",
  "Baylor College of Medicine",
  "beavercreek",
  "Blue Ridge Cancer Care",
  "Boobl",
  "Boobs",
  "Cancer and hematology centers of west michigan",
  "chs",
  "copc",
  "COPC My Chart",
  "CR Wood Cancer Center",
  "Cvs",
  "Ecva",
  "El Dorado Internal and Family Medicine",
  "Embretson",
  "Engbretson",
  "Epic My Chart Riverside Healthcare",
  "Fasanello",
  "Florie Ann gonsch",
  "Government Employees Health Association",
  "HealtheVet",
  "Henryford",
  "hmh",
  "Honorhealth",
  "IDPH",
  "ihc",
  "jack & sheryl morris cancer center",
  "Jersey Shore University Medical Center",
  "Jersey Shore University Medical Center i",
  "John  Theurer  cancer center",
  "Kaleida",
  "kansashealthsystem.com",
  "khavari",
  "Lexington Medical Cancer Center Hematology/Oncology",
  "little company of Mary hospital",
  "Lmc",
  "Malinda",
  "Manila",
  "Mclaren",
  "MCV",
  "Medical college of wisconsin",
  "MHC",
  "Minutecl8bic",
  "MSK",
  "MTNFC",
  "My Chart Riverside Healthcare",
  "myhealthone",
  "myhealthvet",
  "MyMercy",
  "New england cancer specialists",
  "Nitzkorski",
  "Nuvance",
  "Ohio State University Medical Center",
  "Onemedic",
  "OSF  little company of Mary",
  "palo alto medical foundation",
  "pamf",
  "Partnership health plan of CA",
  "PennMedicine",
  "Phoebe",
  "Providence Health and Services Oregon and California",
  "Rbn",
  "Riverside Healthcare My Chart Epic",
  "RRH",
  "rugcc.rutgers.edu",
  "rutgers",
  "RWJHP - Steeplechase Cancer Center",
  "Sarah Zanger",
  "Shirinian",
  "SLHS my chart",
  "Solis",
  "Solis Mammography",
  "Southern ocean county hospital",
  "Steeplechase",
  "tara_matise@rugcc.org",
  "The Ohio State University Medical Center",
  "timpanogos",
  "two roads wellness",
  "University of Tennessee Cancer specialist",
  "UPMC Magee Breast cancer",
  "VCI",
  "vet",
  "veteran",
  "WNY",
  "Wvu"
];

const results = [];

searches.forEach((term, idx) => {
  process.stdout.write(`\r[${idx + 1}/${searches.length}] Checking: ${term}${' '.repeat(50)}`);

  const searchResults = searchModule.search(miniSearch, term);

  results.push({
    search_term: term,
    found: searchResults.length > 0 ? 'YES' : 'NO',
    top_result: searchResults.length > 0 ? searchResults[0].name : '',
    top_score: searchResults.length > 0 ? Math.round(searchResults[0].score) : 0,
    top_id: searchResults.length > 0 ? searchResults[0].id : '',
    result_count: searchResults.length,
    top_3: searchResults.slice(0, 3).map(r => r.name).join(' | ')
  });
});

console.log('\n\nDone!\n');

// Write CSV
const lines = ['search_term,found,top_result,top_score,top_id,result_count,top_3'];
results.forEach(r => {
  lines.push([
    `"${r.search_term.replace(/"/g, '""')}"`,
    r.found,
    `"${r.top_result.replace(/"/g, '""')}"`,
    r.top_score,
    `"${r.top_id}"`,
    r.result_count,
    `"${r.top_3.replace(/"/g, '""')}"`
  ].join(','));
});

fs.writeFileSync('/Users/jonathan.ross1/Projects/hospital-search-abbreviations/test-results/actual_search_results.csv', lines.join('\n'));

console.log('Saved: test-results/actual_search_results.csv\n');

// Summary
const found = results.filter(r => r.found === 'YES').length;
const notFound = results.filter(r => r.found === 'NO').length;

console.log('SUMMARY:');
console.log(`  Found in search: ${found}`);
console.log(`  Not found: ${notFound}`);
console.log(`\nNOT FOUND (need to analyze):`);
results.filter(r => r.found === 'NO').forEach(r => {
  console.log(`  - ${r.search_term}`);
});
