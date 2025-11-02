import { useEffect, useState } from 'react';
import type { PanelState, ScrapeStatus } from '../types';
import { getPanelState, subscribePanelState, updatePanelState } from '../utils';
import { BANK_LOGOS } from '../assets';
import { BankLogoName } from './BankLogoName';
import { Btn } from './Btn';

const BANKS = [
  { key: 'boc', label: 'BOC', url: 'https://www.boc.lk' },
  { key: 'peoples', label: "People's Bank", url: 'https://www.peoplesbank.lk' },
  { key: 'nsb', label: 'NSB', url: 'https://www.nsb.lk' },
  { key: 'combank', label: 'Commercial', url: 'https://www.combank.lk' },
  { key: 'hnb', label: 'HNB', url: 'https://www.hnb.net' },
  { key: 'sampath', label: 'Sampath', url: 'https://www.sampath.lk' },
  { key: 'dfcc', label: 'DFCC', url: 'https://www.dfcc.lk' },
  { key: 'ndb', label: 'NDB', url: 'https://www.ndb.lk' },
  { key: 'seylan', label: 'Seylan', url: 'https://www.seylan.lk' },
  { key: 'unionbank', label: 'Union Bank', url: 'https://www.unionb.com' },
  { key: 'cargills', label: 'Cargills', url: 'https://www.cargillsbank.com' },
  { key: 'amana', label: 'Amana', url: 'https://www.amanabank.lk' },
];

async function runScraper(bankKey: string) {
  const response = await fetch(`/api/scrape/${bankKey}`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to start scraper: ${response.statusText}`);
  }
  
  return response.json();
}

export function ScraperPanel() {
  const [state, setState] = useState<PanelState>(getPanelState());

  useEffect(() => {
    return subscribePanelState(setState);
  }, []);

  async function handleRun(bankKey: string) {
    updatePanelState(prev => ({
      ...prev,
      status: { ...prev.status, [bankKey]: 'running' },
      errors: { ...prev.errors, [bankKey]: undefined }
    }));

    try {
      await runScraper(bankKey);
      updatePanelState(prev => ({
        ...prev,
        status: { ...prev.status, [bankKey]: 'done' },
        lastRun: { ...prev.lastRun, [bankKey]: new Date().toISOString() }
      }));
    } catch (err) {
      updatePanelState(prev => ({
        ...prev,
        status: { ...prev.status, [bankKey]: 'error' },
        errors: { ...prev.errors, [bankKey]: err instanceof Error ? err.message : 'Unknown error' }
      }));
    }
  }

  function getStatus(bankKey: string): ScrapeStatus {
    return state.status[bankKey] || 'idle';
  }

  function getError(bankKey: string): string | undefined {
    return state.errors[bankKey];
  }

  function getLastRun(bankKey: string): string | undefined {
    return state.lastRun[bankKey];
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {BANKS.map(bank => (
          <div 
            key={bank.key}
            className="bg-slate-800 rounded-lg p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <BankLogoName bank={bank.key} />
              <a 
                href={bank.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-auto text-slate-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <div className="mt-2">
              {getStatus(bank.key) === 'running' ? (
                <div className="flex items-center gap-2 text-orange-500">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Running...
                </div>
              ) : (
                <Btn
                  onClick={() => handleRun(bank.key)}
                  disabled={getStatus(bank.key) === 'running'}
                >
                  Run Scraper
                </Btn>
              )}
            </div>

            {getError(bank.key) && (
              <div className="mt-2 text-sm text-red-500">
                {getError(bank.key)}
              </div>
            )}

            {getLastRun(bank.key) && (
              <div className="mt-2 text-xs text-slate-400">
                Last run: {new Date(getLastRun(bank.key)!).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}