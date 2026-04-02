# Hospital Search Abbreviations - Analysis Workflow

**Complete guide to processing failed search logs and adding verified abbreviations**

---

## Overview

This workflow analyzes failed hospital searches and identifies which need abbreviations vs. which already work with fuzzy matching.

**Key Principle:** Only add abbreviations that return 0 results. If fuzzy matching works, don't add it.

---

## Step 1: Run Comprehensive Analysis

### What You Need
- CSV export of failed searches with `search_term` column
- Save to: `/Users/jonathan.ross1/Downloads/ehr_search_feedback_YYYY-MM-DD.csv`

### Command
```bash
cd /Users/jonathan.ross1/Projects/hospital-search-abbreviations
node tools/comprehensive_search_analysis.js "/Users/jonathan.ross1/Downloads/ehr_search_feedback_YYYY-MM-DD.csv"
```

### What It Does
1. Uses **actual search code** from `ehr-healthsystem-search.js` to test each term
2. For searches that return results → marks as `WORKS`
3. For searches that return 0 results → Claude analyzes:
   - Checks if it's in `ADDITIONS_FINAL.js` (verified suggestions) → marks as `ADD`
   - Detects junk (emails, insurance, EHR vendors, doctor names) → marks as `JUNK`
   - Everything else → marks as `SKIP` (needs manual research)

### Output
**File:** `test-results/comprehensive_analysis.csv`

**Columns:**
- `search_term` - What the user searched for
- `action` - **WORKS** | **ADD** | **SKIP** | **JUNK**
- `confidence` - HIGH | MEDIUM | LOW | NONE
- `suggested_abbreviation` - What to add (if action=ADD)
- `suggested_target_system` - What it maps to (if action=ADD)
- `reasoning` - Why this action was chosen
- `current_results_count` - How many results the search returns
- `top_result` - First result (if any)

**Actions Explained:**
- **WORKS** - Search returns results, no abbreviation needed
- **ADD** - Returns 0 results, verified mapping exists in ADDITIONS_FINAL.js
- **SKIP** - Returns 0 results, needs manual research
- **JUNK** - Email, doctor name, insurance, retail clinic, etc.

---

## Step 2: Review SKIP Items (Manual Research)

For each `action=SKIP` search, you need to determine if it's a real hospital and if it exists in 1upHealth.

### Use the Lookup Tool
```bash
node tools/system_lookup.js
```

**Interactive CLI that uses actual search code:**
- Type the search term or variations
- See exactly what users would see
- Check if fuzzy matching already handles it
- Find the official system name and ID

### Decision Tree

```
Search term with action=SKIP
    |
    ├─> Test with system_lookup.js → Returns results?
    |   └─> YES: Fuzzy already works, don't add abbreviation
    |
    ├─> Try variations (with "health", "medical", etc.) → Returns results?
    |   └─> YES: Fuzzy works with slight variation, don't add
    |
    ├─> Is it junk? (email, person name, insurance, typo)
    |   └─> YES: Ignore, don't add
    |
    ├─> Is it a real hospital system?
    |   ├─> NO: Ignore, don't add
    |   └─> YES: Continue
    |
    ├─> Does it exist in 1upHealth database?
    |   ├─> NO: Add to fallback systems list, not abbreviations
    |   └─> YES: Add to ADDITIONS_FINAL.js
    |
    └─> Why does fuzzy fail?
        - Initialism (msk, ihc, chs, wvu, mcv)
        - Compound word (henryford, kansashealthsystem, mymercy)
        - Different words (baylor college → Baylor)
        - Specific facility (upmc magee → UPMC)
```

### Adding to ADDITIONS_FINAL.js

**Format:**
```javascript
"search term": "Official System Name",
```

**Rules:**
1. Search term MUST be lowercase
2. System name MUST match 1upHealth exactly (use system_lookup.js to verify)
3. Add comment explaining WHY fuzzy fails
4. Test it returns 0 results BEFORE adding

**Example:**
```javascript
// Memorial Sloan Kettering (MSK initialism only)
// WHY: "msk" is 3-char initialism with no word overlap
"msk": "Memorial Sloan Kettering Cancer Center",
```

---

## Step 3: Verify All Entries in ADDITIONS_FINAL.js

**CRITICAL:** Before adding to ABBREVIATIONS_CLEANED.js, verify each entry actually needs an abbreviation.

### Test All Entries
```bash
node tools/verify_additions.js
```

**What it does:**
- Tests each entry in ADDITIONS_FINAL.js with actual search code
- Shows which ones return 0 results (need abbreviation)
- Shows which ones return results (fuzzy already works - REMOVE)

**Output:**
```
NEEDS ABBREVIATION (keep):
  "msk": "Memorial Sloan Kettering..."
  ✗ Returns 0 results

ALREADY WORKS (remove):
  "robert wood johnson": "RWJBarnabas Health"
  ✓ Returns 17 results
```

**Action:** Remove any entries that show "ALREADY WORKS" from ADDITIONS_FINAL.js

---

## Step 4: Generate Output Files

```bash
node tools/generate_output.js
```

### Creates
```
output/
├── comprehensive_analysis_YYYY-MM-DD.csv   (full analysis)
├── to_add_YYYY-MM-DD.csv                    (action=ADD only)
├── needs_research_YYYY-MM-DD.csv            (action=SKIP only)
└── add_to_abbreviations_YYYY-MM-DD.js       (ready-to-paste code)
```

---

## Step 5: Add to ABBREVIATIONS_CLEANED.js

### Copy Verified Entries
```bash
# Review the file
cat output/add_to_abbreviations_YYYY-MM-DD.js

# Or just copy from ADDITIONS_FINAL.js directly
```

**Where to add:**
- Option A: At bottom with date comment (cleaner git diff)
- Option B: Alphabetically (cleaner long-term)

**Format:**
```javascript
// Added 2026-04-02 - Verified from ehr_search_feedback_2026-03-30.csv
"ihc": "Intermountain Health",
"msk": "Memorial Sloan Kettering Cancer Center",
"wvu": "West Virginia University Medicine",
// ... etc
```

**Update header:**
```javascript
// Final: 460 abbreviations  <- update this count
```

---

## Step 6: Test the Changes

### Test specific abbreviations
```bash
node test-scripts/test_abbreviation_impact.js "ihc:Intermountain Health" "msk:Memorial Sloan Kettering Cancer Center"
```

**Check output:**
- **Improvements:** Should match number of abbreviations added
- **Regressions:** Should be 0

---

## Tools Reference

### comprehensive_search_analysis.js
Main analysis script that uses actual search code to categorize searches.

**Usage:**
```bash
node tools/comprehensive_search_analysis.js /path/to/log.csv
```

**Output:** `test-results/comprehensive_analysis.csv`

**What it does:**
1. Tests each search with actual search module
2. Marks WORKS if returns results
3. For 0 results: checks ADDITIONS_FINAL.js for verified mapping
4. Detects junk patterns
5. Marks remaining as SKIP (needs research)

### system_lookup.js
Interactive search testing tool - uses actual search code.

**Usage:**
```bash
node tools/system_lookup.js
```

**Purpose:**
- Test if fuzzy matching handles a search
- Find official system names
- Verify abbreviation mappings
- See exactly what users see

### verify_additions.js
Tests all entries in ADDITIONS_FINAL.js to ensure they need abbreviations.

**Usage:**
```bash
node tools/verify_additions.js
```

**Output:** Lists which entries work vs. need abbreviations

**IMPORTANT:** Run this before copying to ABBREVIATIONS_CLEANED.js

### generate_output.js
Creates organized, dated output files.

**Usage:**
```bash
node tools/generate_output.js
```

**Output:** `output/` folder with dated CSV and JS files

---

## Common Scenarios

### Scenario 1: Initialism
**Search:** "msk"
**Test:** Returns 0 results
**Action:** Add abbreviation
```javascript
"msk": "Memorial Sloan Kettering Cancer Center",
```

### Scenario 2: Fuzzy Already Works
**Search:** "robert wood johnson"
**Test:** Returns 17 results
**Action:** Don't add - fuzzy handles it

### Scenario 3: Compound Word
**Search:** "henryford"
**Test:** Returns 0 results (but "henry ford" returns 7)
**Action:** Add abbreviation
```javascript
"henryford": "Henry Ford Health",
```

### Scenario 4: Different Words
**Search:** "medical college of wisconsin"
**Test:** Returns 0 results
**Actual system:** Froedtert
**Action:** Add abbreviation
```javascript
"medical college of wisconsin": "Froedtert",
```

### Scenario 5: Not in 1upHealth
**Search:** "phoebe putney"
**Test:** system_lookup.js finds nothing
**Research:** Real hospital, not in 1upHealth
**Action:** Skip abbreviation, add to fallback systems list

### Scenario 6: Junk
**Search:** "john.smith@hospital.org"
**Action:** Ignore - marked as JUNK automatically

---

## Quality Checks

### Before Adding to ADDITIONS_FINAL.js
- [ ] Tested with system_lookup.js - returns 0 results
- [ ] Verified system exists in 1upHealth
- [ ] System name matches exactly as shown in lookup tool
- [ ] Added comment explaining WHY fuzzy fails
- [ ] Not too generic (no standalone "mercy", "baptist", "memorial")

### Before Adding to ABBREVIATIONS_CLEANED.js
- [ ] Run verify_additions.js - confirms all entries need abbreviations
- [ ] Removed any "ALREADY WORKS" entries
- [ ] Updated header count
- [ ] Added date comment

### After Adding
- [ ] Run test_abbreviation_impact.js
- [ ] Improvements > 0
- [ ] Regressions = 0

---

## File Structure

```
hospital-search-abbreviations/
├── ABBREVIATIONS_CLEANED.js          (432 → add 28 → 460 entries)
├── ADDITIONS_FINAL.js                 (28 verified entries)
├── WORKFLOW.md                        (this file)
├── CLAUDE.md                          (context for Claude)
├── tools/
│   ├── comprehensive_search_analysis.js  (main analysis)
│   ├── system_lookup.js                  (interactive testing)
│   ├── verify_additions.js               (test ADDITIONS_FINAL.js)
│   └── generate_output.js                (create dated outputs)
├── test-results/
│   └── comprehensive_analysis.csv        (latest analysis)
└── output/
    ├── comprehensive_analysis_2026-04-02.csv
    ├── to_add_2026-04-02.csv
    ├── needs_research_2026-04-02.csv
    └── add_to_abbreviations_2026-04-02.js
```

---

## Current Status (2026-04-02)

**Analysis completed on:** `ehr_search_feedback_2026-03-30.csv` (405 searches)

**Results:**
- 300 WORKS (already return results)
- 18 ADD (verified in ADDITIONS_FINAL.js, appear in this log)
- 53 SKIP (need manual research)
- 34 JUNK (emails, insurance, etc.)

**ADDITIONS_FINAL.js:** 28 verified abbreviations ready to add

**Next steps:**
1. Review 53 SKIP items with system_lookup.js
2. Add verified mappings to ADDITIONS_FINAL.js
3. Run verify_additions.js
4. Copy 28 entries to ABBREVIATIONS_CLEANED.js
5. Test with test_abbreviation_impact.js

---

## Tips

**Use system_lookup.js liberally:**
- Test before adding to ADDITIONS_FINAL.js
- Test after adding to verify it works
- Test variations to see if fuzzy handles them

**Don't add if fuzzy works:**
- "robert wood johnson" finds 17 results → don't add
- "rwjhp" finds 0 results → add this variation only

**Keep ADDITIONS_FINAL.js clean:**
- Only entries that return 0 results
- Run verify_additions.js regularly
- Remove entries that start working after other abbreviations are added

**Git commits:**
```bash
git add ABBREVIATIONS_CLEANED.js
git commit -m "Add 28 verified abbreviations from 2026-03-30 log analysis

- ihc → Intermountain Health
- msk → Memorial Sloan Kettering
- wvu → West Virginia University Medicine
[... list key additions ...]

Tested: All return 0 results without abbreviation
Total: 432 → 460 abbreviations"
```

---

## Troubleshooting

**Q: comprehensive_analysis shows action=ADD but verify_additions says it works**
- The comprehensive file uses cached ADDITIONS_FINAL.js
- Re-run comprehensive_search_analysis.js after updating ADDITIONS_FINAL.js

**Q: system_lookup returns 0 results but I know the system exists**
- Try variations: "henry ford" vs "henryford"
- Try with "health", "medical", "hospital" added
- Check spelling

**Q: Should I add "hackensack" if it returns 8 results?**
- No - if it returns results, fuzzy already works
- Only add specific variations that return 0 (like "hmh")

**Q: Entry was in ADDITIONS_FINAL.js, now it works after adding other abbreviations**
- This happens - one abbreviation can make another work
- Run verify_additions.js to catch these
- Remove the now-working entry

---

## For Future Claude Sessions

**Context needed:**
1. Read `CLAUDE.md` for project overview
2. Read this `WORKFLOW.md` for process
3. Current abbreviation count in `ABBREVIATIONS_CLEANED.js` header
4. Always test with `system_lookup.js` before suggesting abbreviations
5. Only add if search returns 0 results

**Key commands:**
```bash
# Analyze new log
node tools/comprehensive_search_analysis.js /path/to/log.csv

# Test a search
node tools/system_lookup.js

# Verify ADDITIONS_FINAL.js
node tools/verify_additions.js

# Generate output files
node tools/generate_output.js
```

**Never:**
- Add abbreviations that fuzzy matching handles
- Suggest generic terms (mercy, baptist, memorial alone)
- Skip testing with actual search code
- Assume a system exists without checking
