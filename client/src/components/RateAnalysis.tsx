import React from 'react';
import type { RateRow } from '../types';
import { Btn } from './Btn';
import { BankLogoName } from './BankLogoName';

type RateGroup = {
  bank: string;
  minRate: number;
  maxRate: number;
  avgRate: number;
  products: {
    [key: string]: {
      minRate: number;
      maxRate: number;
      avgRate: number;
      rows: RateRow[];
    };
  };
};

function parseRate(rateStr: string | undefined): number | null {
  if (!rateStr) return null;
  const match = rateStr.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null;
}

function getEffectiveRate(row: RateRow): number | null {
  // Try different rate fields in order of preference
  const fields = [
    'rateWithSalaryCreditCardInternetBanking',
    'rateWithSalary',
    'rateWithoutSalary',
    'rateWithSalaryAbove700kCreditCardInternetBanking',
    'rateWithSalaryAbove700k',
    'rateWithSalaryBelow700kCreditCardInternetBanking',
    'rateWithSalaryBelow700k',
    'rateWithoutSalaryWithCreditCardInternetBanking',
    'rateWithoutSalary',
    'rateEduSecuredWithCreditCardInternetBanking',
    'rateEduSecuredWithoutCreditCardInternetBanking',
    'rateEduUnsecuredWithCreditCardInternetBanking',
    'rateEduUnsecuredWithoutCreditCardInternetBanking'
  ];

  for (const field of fields) {
    const rate = parseRate(row[field as keyof RateRow] as string);
    if (rate !== null) return rate;
  }

  return null;
}

function groupRates(rates: RateRow[]): RateGroup[] {
  const bankGroups = new Map<string, RateGroup>();

  for (const row of rates) {
    const effectiveRate = getEffectiveRate(row);
    if (effectiveRate === null) continue;

    let bankGroup = bankGroups.get(row.bank);
    if (!bankGroup) {
      bankGroup = {
        bank: row.bank,
        minRate: Infinity,
        maxRate: -Infinity,
        avgRate: 0,
        products: {}
      };
      bankGroups.set(row.bank, bankGroup);
    }

    // Update bank level stats
    bankGroup.minRate = Math.min(bankGroup.minRate, effectiveRate);
    bankGroup.maxRate = Math.max(bankGroup.maxRate, effectiveRate);

    // Update product level stats
    let productStats = bankGroup.products[row.product];
    if (!productStats) {
      productStats = {
        minRate: Infinity,
        maxRate: -Infinity,
        avgRate: 0,
        rows: []
      };
      bankGroup.products[row.product] = productStats;
    }

    productStats.minRate = Math.min(productStats.minRate, effectiveRate);
    productStats.maxRate = Math.max(productStats.maxRate, effectiveRate);
    productStats.rows.push(row);
  }

  // Calculate averages
  for (const group of bankGroups.values()) {
    let totalRate = 0;
    let count = 0;

    for (const product of Object.values(group.products)) {
      let productTotal = 0;
      for (const row of product.rows) {
        const rate = getEffectiveRate(row);
        if (rate !== null) {
          productTotal += rate;
          totalRate += rate;
          count++;
        }
      }
      product.avgRate = productTotal / product.rows.length;
    }

    group.avgRate = totalRate / count;
  }

  return Array.from(bankGroups.values()).sort((a, b) => a.avgRate - b.avgRate);
}

function formatRate(rate: number): string {
  return rate.toFixed(2) + '%';
}

type Props = {
  rates: RateRow[];
};

export function RateAnalysis({ rates }: Props) {
  const [selectedProduct, setSelectedProduct] = React.useState<string | null>(null);
  const groupedRates = React.useMemo(() => groupRates(rates), [rates]);
  
  const products = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of rates) {
      set.add(row.product);
    }
    return Array.from(set).sort();
  }, [rates]);

  const filteredGroups = selectedProduct 
    ? groupedRates.filter(group => selectedProduct in group.products)
    : groupedRates;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        <Btn
          variant={selectedProduct === null ? 'primary' : 'secondary'}
          onClick={() => setSelectedProduct(null)}
        >
          All Products
        </Btn>
        {products.map(product => (
          <Btn
            key={product}
            variant={selectedProduct === product ? 'primary' : 'secondary'}
            onClick={() => setSelectedProduct(product)}
          >
            {product}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGroups.map(group => (
          <div key={group.bank} className="bg-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <BankLogoName bank={group.bank} />
              <div className="text-2xl font-bold text-orange-500">
                {formatRate(group.avgRate)}
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-400">
              Range: {formatRate(group.minRate)} - {formatRate(group.maxRate)}
            </div>

            {selectedProduct && group.products[selectedProduct] && (
              <div className="mt-4 border-t border-slate-700 pt-4">
                <div className="font-medium mb-2">{selectedProduct}</div>
                <div className="text-sm text-slate-400">
                  Average: {formatRate(group.products[selectedProduct].avgRate)}
                  <br />
                  Range: {formatRate(group.products[selectedProduct].minRate)} - {formatRate(group.products[selectedProduct].maxRate)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {group.products[selectedProduct].rows.map((row, i) => (
                    <div key={i} className="mt-1">
                      {row.type && <span className="text-slate-400">{row.type}</span>}
                      {row.tenureLabel && (
                        <span className="text-slate-400"> • {row.tenureLabel}</span>
                      )}
                      {row.notes && (
                        <span className="block text-slate-500">{row.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}