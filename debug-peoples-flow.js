// Debug script to trace People's Bank data processing through the app
const fs = require('fs');

// Load People's Bank data
const peoplesData = JSON.parse(fs.readFileSync('./output/peoples.json', 'utf-8'));

console.log('=== ORIGINAL PEOPLE\'S BANK DATA ===');
console.log(`Total rows: ${peoplesData.length}`);
peoplesData.forEach((row, i) => {
  console.log(`${i}: ${row.bank} | ${row.product} | ${row.tenureLabel} | ${row.rateWithSalary}`);
});

// Simulate the mergeRates function with the NEW keyOf logic that includes tenureLabel
function simulateMergeRates(existing, incoming) {
  const keyOf = (row) => [
    row.bank ?? "",
    row.product ?? "",
    row.type ?? "",
    row.fixedYears ?? "",
    row.notes ?? "",
    row.tenureLabel ?? "",  // This should be included now
  ].join("||");

  const map = new Map();
  
  // Process existing (should be empty for this test)
  for (const row of existing) {
    const key = keyOf(row);
    console.log(`Existing key: ${key}`);
    map.set(key, row);
  }
  
  // Process incoming (People's Bank data)
  for (const row of incoming) {
    const key = keyOf(row);
    console.log(`Incoming key: ${key}`);
    map.set(key, row);
  }
  
  return Array.from(map.values());
}

// Test merge logic
console.log('\n=== TESTING MERGE LOGIC ===');
const merged = simulateMergeRates([], peoplesData);
console.log(`After merge: ${merged.length} rows`);
merged.forEach((row, i) => {
  console.log(`${i}: ${row.bank} | ${row.product} | ${row.tenureLabel} | ${row.rateWithSalary}`);
});

// Simulate readNumber function
function readNumber(x) {
  if (x == null) return undefined;
  if (typeof x === "number" && isFinite(x)) return x;
  const m = String(x).match(/([0-9]+(?:\.[0-9]+)?)/);
  const n = m ? parseFloat(m[1]) : NaN;
  return isFinite(n) ? n : undefined;
}

// Simulate prepareRateRows function
function simulatePrepareRateRows(rows) {
  return rows
    .filter((r) => r && typeof r.bank === "string" && r.bank.trim().length > 0)
    .map((r) => {
      const raw = r;
      let rate = r.rate;
      let product = r.product;
      
      // Normalize product names
      if (typeof product === "string") {
        const productLower = product.toLowerCase();
        if (productLower === "home loan" || productLower === "housing loan") product = "HL";
        else if (productLower === "personal loan" || productLower === "personal loans") product = "PL";
        else if (productLower === "education loan" || productLower === "education loans") product = "EDU";
        else if (productLower === "lap" || productLower === "loan against property") product = "LAP";
      }
      
      // Extract fallback rate from raw fields
      if (!Number.isFinite(rate)) {
        const rateFields = [];
        for (const key of Object.keys(raw)) {
          if (/^rate/i.test(key)) {
            const val = raw[key];
            if (val != null) {
              rateFields.push({ key, value: val });
            }
          }
        }
        
        const parsedRates = [];
        for (const field of rateFields) {
          const numRate = readNumber(field.value);
          if (numRate != null && Number.isFinite(numRate)) {
            parsedRates.push(numRate);
          }
        }
        
        if (parsedRates.length > 0) {
          rate = Math.min(...parsedRates);
        }
      }
      
      return {
        ...r,
        rate,
        product,
        bank: r.bank.trim(),
        notes: typeof r.notes === "string" ? r.notes.trim() : r.notes,
        raw,
      };
    });
}

console.log('\n=== TESTING PREPARE RATE ROWS ===');
const prepared = simulatePrepareRateRows(merged);
console.log(`After prepare: ${prepared.length} rows`);
prepared.forEach((row, i) => {
  console.log(`${i}: ${row.bank} | ${row.product} | ${row.tenureLabel} | rate=${row.rate}`);
});

console.log('\n=== FINAL CHECK ===');
const minRateRows = prepared.filter(row => row.tenureLabel && row.tenureLabel.includes('Min Rate'));
const maxRateRows = prepared.filter(row => row.tenureLabel && row.tenureLabel.includes('Max Rate'));
console.log(`Min Rate rows: ${minRateRows.length}`);
console.log(`Max Rate rows: ${maxRateRows.length}`);

minRateRows.forEach(row => {
  console.log(`MIN: ${row.product} | ${row.tenureLabel} | ${row.rate}`);
});

maxRateRows.forEach(row => {
  console.log(`MAX: ${row.product} | ${row.tenureLabel} | ${row.rate}`);
});