// Debug script to check People's Bank data processing
const fs = require('fs');

// Load People's Bank data
const peoplesData = JSON.parse(fs.readFileSync('./output/peoples.json', 'utf-8'));

console.log('People\'s Bank raw data:');
console.log(JSON.stringify(peoplesData[0], null, 2));

// Simulate the readNumber function
function readNumber(x) {
  if (x == null) return undefined;
  if (typeof x === "number" && isFinite(x)) return x;
  const m = String(x).match(/([0-9]+(?:\.[0-9]+)?)/);
  const n = m ? parseFloat(m[1]) : NaN;
  return isFinite(n) ? n : undefined;
}

// Simulate the prepareRateRows logic for one People's Bank row
function processRow(row) {
  const raw = row;
  let rate = row.rate; // This will be undefined for People's Bank data
  
  console.log('\nProcessing row:', row.bank, row.product, row.tenureLabel);
  console.log('Initial rate:', rate);
  console.log('rate is finite?', Number.isFinite(rate));
  
  if (!Number.isFinite(rate)) {
    console.log('Rate is not finite, looking for rate fields...');
    
    const rateFields = [];
    for (const key of Object.keys(raw)) {
      if (/^rate/i.test(key)) {
        const val = raw[key];
        if (val != null) {
          rateFields.push({ key, value: val });
        }
      }
    }
    
    console.log('Found rate fields:', rateFields);
    
    const parsedRates = [];
    for (const field of rateFields) {
      const numRate = readNumber(field.value);
      console.log(`  ${field.key}: "${field.value}" -> ${numRate}`);
      if (numRate != null && Number.isFinite(numRate)) {
        parsedRates.push(numRate);
      }
    }
    
    console.log('Parsed rates:', parsedRates);
    
    if (parsedRates.length > 0) {
      rate = Math.min(...parsedRates);
      console.log('Final rate (min):', rate);
    }
  }
  
  return rate;
}

// Test with first few rows
console.log('\n=== PROCESSING PEOPLE\'S BANK ROWS ===');
for (let i = 0; i < Math.min(3, peoplesData.length); i++) {
  processRow(peoplesData[i]);
  console.log('---');
}