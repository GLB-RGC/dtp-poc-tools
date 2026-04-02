# Test Search V2 Tool

Interactive CLI tool to test the v2 search functionality with fallback support.

## Requirements

**dtp-api must be on the v2 branch:**
```bash
cd /Users/jonathan.ross1/Projects/dtp-api
git checkout RGC-5677-fallback-systems-support
```

The tool requires `ehr-healthsystem-search-v2.js` which is only in the v2 branch.

## Usage

```bash
cd /Users/jonathan.ross1/Projects/hospital-search-abbreviations
node tools/test_search_v2.js
```

## Commands

- **Type a search query** - Search for a hospital/system
- **/available-only** - Toggle between v1 (available only) and v2 (available + fallbacks) modes
- **/exit** - Quit

## Test Scenarios

### 1. Test Abbreviations Work
```
Search > msk
# Should find: Memorial Sloan Kettering Cancer Center
```

### 2. Test Fallbacks Appear
```
Search > university of michigan
# Should show:
# - Available: (if any 1upHealth matches)
# - Unavailable: REGENTS OF THE UNIVERSITY OF MICHIGAN (fallback)
```

### 3. Test Both Available + Fallbacks
```
Search > sutter
# Should show:
# - Available: Sutter Health systems
# - Unavailable: Any Sutter fallback facilities
```

### 4. Test V1 vs V2 Behavior
```
Search > /available-only
Search > university of michigan
# V1 mode: Shows only available (likely zero results)

Search > /available-only
Search > university of michigan
# V2 mode: Shows available + unavailable fallbacks
```

## Output Format

### V2 Mode (Default)
```
V2 MODE: Found 5 available + 2 unavailable

✅ AVAILABLE SYSTEMS (can connect):
----------------------------------------------------------------------
1. System Name
   EHR: Epic | Score: 250
   Health System: Parent System

⚠️  UNAVAILABLE SYSTEMS (not in network):
----------------------------------------------------------------------
1. FACILITY NAME
   Location: CITY, STATE | Providers: 24,321
   Score: 180 | Reason: not_in_network
```

### V1 Mode (Backward Compatible)
```
V1 MODE: Found 5 available systems

1. System Name
   EHR: Epic | Score: 250
   Health System: Parent System
```

## What It Tests

✅ Abbreviations still work (indexed at build time)
✅ Fallbacks appear when matches exist
✅ V2 always searches fallbacks (not just on zero results)
✅ Backward compatibility (v1 mode)
✅ Search retry logic (portal stripping, word reduction)
✅ Both available and unavailable results returned correctly

## Troubleshooting

**Error: Cannot find module 'ehr-healthsystem-search-v2.js'**
- Make sure dtp-api is checked out to RGC-5677-fallback-systems-support branch
- Path in test_search_v2.js line 12 must match your dtp-api location

**No fallback results:**
- Make sure fallback_systems_verified.json exists in the hospital-search-abbreviations folder
- Check that it has 38,855 facilities

**Search returns nothing:**
- Verify ABBREVIATIONS_CLEANED.js exists with 461 entries
- Verify 1upHealth data files exist in dtp-api
