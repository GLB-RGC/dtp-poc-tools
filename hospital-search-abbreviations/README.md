# Hospital Search Abbreviations - Analysis Tools

Tools for analyzing failed hospital search logs and identifying which search terms need abbreviation mappings.

## Purpose

Users search for hospitals using brand names, abbreviations, or nicknames that don't match official EHR system names. This causes zero-result searches.

**Example:**
- User searches: "msk"
- Database has: "Memorial Sloan Kettering Cancer Center"
- Without abbreviation: ❌ 0 results
- With abbreviation: ✅ Match

## Quick Start

### 1. Analyze Failed Searches

```bash
node tools/comprehensive_search_analysis.js /path/to/ehr_search_feedback_YYYY-MM-DD.csv
```

**Output:** `test-results/comprehensive_analysis.csv` with actions:
- **WORKS** - Search already returns results (fuzzy matching handles it)
- **ADD** - Verified abbreviation ready to add (from ADDITIONS_FINAL.js)
- **SKIP** - Needs manual research
- **JUNK** - Email, insurance, typo, etc.

### 2. Test Unknown Searches

```bash
node tools/system_lookup.js
```

Interactive tool to test if fuzzy matching handles a search term before adding an abbreviation.

### 3. Verify Before Adding

```bash
node tools/verify_additions.js
```

Tests all entries in ADDITIONS_FINAL.js to ensure they truly need abbreviations (return 0 results).

## Files

- **WORKFLOW.md** - Complete step-by-step process
- **CLAUDE.md** - Context for AI assistants
- **ABBREVIATIONS_CLEANED.js** - Production abbreviations (461 entries)
- **ADDITIONS_FINAL.js** - Verified additions ready for next deployment
- **tools/** - Analysis scripts

## Key Principle

**Only add abbreviations that return 0 results.** If fuzzy matching works, don't add it.

## Current Status

- **461 abbreviations** deployed to production
- Last updated: 2026-04-02
- Production file: `dtp-api/api/lambda/lambda/ehr/search/ehr_search_abbreviations.testdata.json`

## Requirements

- Node.js
- Access to dtp-api repository (uses actual search code for testing)
- CSV export of failed searches from database

## Documentation

See [WORKFLOW.md](./WORKFLOW.md) for complete process documentation.
