import type { PanelState } from './types';

export const LS_PANEL = 'panel';
export const BRAND = {
  card: '#1e293b',
  orange: '#ff6b00',
  orangeSoft: '#ffaa61'
};

export function loadJSON<T>(key: string, defaultValue: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

export function saveJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

let panelStoreState: PanelState | null = null;
export const panelStoreListeners = new Set<(state: PanelState) => void>();

export function makeEmptyPanelState(): PanelState {
  return { 
    status: {},
    counts: {},
    errors: {},
    lastRun: {}
  };
}

export function getPanelState(): PanelState {
  if (panelStoreState == null) {
    panelStoreState = loadJSON<PanelState>(LS_PANEL, makeEmptyPanelState());
  }
  return panelStoreState;
}

export function setPanelState(next: PanelState): PanelState {
  panelStoreState = next;
  saveJSON(LS_PANEL, next);
  panelStoreListeners.forEach(listener => {
    listener(next);
  });
  return next;
}

export function updatePanelState(updater: (prev: PanelState) => PanelState): PanelState {
  const prev = getPanelState();
  const next = updater(prev);
  return setPanelState(next);
}

export function subscribePanelState(listener: (state: PanelState) => void): () => void {
  panelStoreListeners.add(listener);
  return () => {
    panelStoreListeners.delete(listener);
  };
}