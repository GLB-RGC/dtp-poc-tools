#!/usr/bin/env node

/**
 * Build Fallback Systems List
 *
 * Extracts facility names from CMS DAC file that aren't in 1upHealth
 * Creates a fallback list for "Not available to connect" messaging
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream');
const csv = require('csv-parser');

const CMS_METASTORE_API = 'https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items';
const DAC_DATASET_ID = 'mj5m-pzi6';

console.log('Building fallback systems list...\n');

async function fetchDACUrl() {
  console.log('Step 1: Fetching CMS DAC download URL...');

  return new Promise((resolve, reject) => {
    https.get(`${CMS_METASTORE_API}/${DAC_DATASET_ID}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const meta = JSON.parse(data);
        const url = meta.distribution?.[0]?.downloadURL;
        if (!url) reject(new Error('No download URL found'));
        console.log(`  ✓ Found: ${url}\n`);
        resolve(url);
      });
    }).on('error', reject);
  });
}

async function streamAndParseDACFile(url, oneUpHealthNames) {
  console.log('Step 2: Streaming and parsing DAC file...');
  console.log('  (This may take 2-5 minutes - file is ~500MB)\n');

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const facilities = new Map();
    let rowCount = 0;
    let bytesReceived = 0;

    const req = protocol.get(url, (res) => {
      const totalBytes = parseInt(res.headers['content-length'], 10);

      res.on('data', chunk => {
        bytesReceived += chunk.length;

        // Progress indicator every 50MB
        if (bytesReceived % (50 * 1024 * 1024) < chunk.length) {
          const percent = ((bytesReceived / totalBytes) * 100).toFixed(1);
          process.stdout.write(`  Progress: ${percent}% (${rowCount.toLocaleString()} rows)\r`);
        }
      });

      res
        .pipe(csv())
        .on('data', (row) => {
          rowCount++;

          const facilityName = row['Facility Name']?.trim();
          const city = row['City/Town']?.trim();
          const state = row['State']?.trim();

          if (!facilityName || facilityName === '') return;

          const key = facilityName.toLowerCase();

          // Skip if already in 1upHealth
          if (oneUpHealthNames.has(key)) return;

          // Filter out noise
          if (facilityName.length < 5) return;
          if (/\b(md|dds|do|dpm|phd|pa|np|crnp|fnp)\b/i.test(facilityName)) return;
          if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(facilityName)) return;

          const skipTerms = ['pharmacy', 'laboratory', 'lab corp', 'quest diagnostics',
                            'urgent care', 'rehab', 'physical therapy', 'imaging center',
                            'dialysis', 'home health'];
          if (skipTerms.some(term => key.includes(term))) return;

          if (!facilities.has(key)) {
            facilities.set(key, {
              name: facilityName,
              city: city || '',
              state: state || '',
              count: 1
            });
          } else {
            facilities.get(key).count++;
          }
        })
        .on('end', () => {
          console.log(`\n  ✓ Processed ${rowCount.toLocaleString()} rows`);
          console.log(`  ✓ Found ${facilities.size.toLocaleString()} unique fallback facilities\n`);
          resolve(facilities);
        })
        .on('error', reject);
    });

    req.on('error', reject);
  });
}

async function main() {
  try {
    // Load 1upHealth data
    console.log('Loading 1upHealth systems...');
    const oneUpHealthRaw = fs.readFileSync(
      '/Users/jonathan.ross1/Projects/dtp-api/api/lambda/lambda/ehr/search/1uphealth_healthsystem_list.testdata.json',
      'utf8'
    );
    const oneUpHealthSystems = JSON.parse(oneUpHealthRaw);
    const oneUpHealthNames = new Set(
      oneUpHealthSystems.map(s => s.name.toLowerCase())
    );
    console.log(`  ✓ Loaded ${oneUpHealthSystems.length.toLocaleString()} systems\n`);

    // Get DAC file URL
    const dacUrl = await fetchDACUrl();

    // Stream and parse (filtering in-stream)
    const facilities = await streamAndParseDACFile(dacUrl, oneUpHealthNames);

    // Convert to array and sort by count
    const facilityArray = Array.from(facilities.values());
    facilityArray.sort((a, b) => b.count - a.count);

    // Save results
    console.log('Step 3: Saving results...');

    // Full list as JSON (top 5000)
    const outputData = {
      generated: new Date().toISOString(),
      source: 'CMS DAC National Downloadable File',
      total_facilities: facilityArray.length,
      facilities: facilityArray.slice(0, 5000).reduce((acc, f) => {
        acc[f.name.toLowerCase()] = {
          name: f.name,
          city: f.city,
          state: f.state,
          provider_count: f.count
        };
        return acc;
      }, {})
    };

    fs.writeFileSync(
      'fallback_systems.json',
      JSON.stringify(outputData, null, 2)
    );
    console.log(`  ✓ Saved fallback_systems.json (top 5,000 facilities)`);

    // Summary CSV for review
    const csvLines = ['name,city,state,provider_count'];
    facilityArray.slice(0, 1000).forEach(f => {
      csvLines.push(`"${f.name}","${f.city}","${f.state}",${f.count}`);
    });
    fs.writeFileSync('test-results/fallback_systems_top1000.csv', csvLines.join('\n'));
    console.log(`  ✓ Saved test-results/fallback_systems_top1000.csv (top 1,000 for review)\n`);

    // Show top 20 examples
    console.log('='.repeat(70));
    console.log('TOP 20 FALLBACK FACILITIES:');
    console.log('='.repeat(70));
    facilityArray.slice(0, 20).forEach((f, i) => {
      console.log(`${i + 1}. ${f.name}`);
      console.log(`   Location: ${f.city}, ${f.state}`);
      console.log(`   Providers: ${f.count.toLocaleString()}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('✅ COMPLETE');
    console.log('='.repeat(70));
    console.log(`\nGenerated ${facilityArray.length.toLocaleString()} fallback facilities`);
    console.log('\nNext steps:');
    console.log('  1. Review test-results/fallback_systems_top1000.csv');
    console.log('  2. Search for "adelante" to verify it\'s in the list');
    console.log('  3. Use fallback_systems.json in search endpoint');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
