// Quick test to verify 10M Housing Loan calculation
import { calculateTariff } from './src/tariff-calculator.js';

const result = calculateTariff({
  loanAmount: 10_000_000,
  product: 'HousingLoan',
  propertyValue: 12_000_000,
  usePanelLawyer: false,
  tripartite: 'Standard',
  includeTitleClearance: true,
  deductApplicationFeeAtDisbursement: true,
});

console.log('\n📊 10M Housing Loan with 12M Property Value');
console.log('═'.repeat(60));
console.log('\n✓ Fee Breakdown:');
result.rows.forEach(row => {
  const amount = row.amount.toLocaleString('en-LK');
  console.log(`  • ${row.label.padEnd(35)} LKR ${amount.padStart(10)}`);
  if (row.note) {
    console.log(`    ${row.note}`);
  }
});

console.log('\n' + '─'.repeat(60));
console.log(`📌 Total Upfront (paid at application):      LKR ${result.applicationFeePaidUpfront.toLocaleString('en-LK').padStart(10)}`);
console.log(`📌 Total at Disbursement:                    LKR ${result.grandTotalDueAtDisbursement.toLocaleString('en-LK').padStart(10)}`);
console.log(`📌 Grand Total Cash Outflow:                 LKR ${result.grandTotalCashOutflow.toLocaleString('en-LK').padStart(10)}`);
console.log('═'.repeat(60) + '\n');
