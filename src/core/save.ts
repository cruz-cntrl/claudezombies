/** Persistent settings, high scores, lore collection and flags (localStorage, failure-tolerant). */
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  lookSens: number;      // 0.2 .. 3
  adsSens: number;       // 0.2 .. 3 (multiplier relative to look)
  invertY: boolean;
  aimAssist: boolean;
  aimAssistStrength: number; // 0..1
  adsMode: 'hold' | 'toggle';
  buttonSize: 'S' | 'M' | 'L';
  buttonOpacity: number; // 0.2..1
  leftHanded: boolean;
  quality: Quality;
  showFps: boolean;
  master: number;
  music: number;
  sfx: number;
  voice: number;
  tutorialDone: boolean;
}

export const defaultSettings: Settings = {
  lookSens: 1,
  adsSens: 0.7,
  invertY: false,
  aimAssist: true,
  aimAssistStrength: 0.6,
  adsMode: 'hold',
  buttonSize: 'M',
  buttonOpacity: 0.7,
  leftHanded: false,
  quality: 'medium',
  showFps: false,
  master: 0.9,
  music: 0.6,
  sfx: 0.9,
  voice: 0.8,
  tutorialDone: false,
};

const KEY = 'tethered.v1';

interface SaveData {
  settings: Settings;
  scores: Record<string, { round: number; kills: number }>; // key `${map}:${difficulty}`
  notes: string[];
  eeDone: string[];
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return {
        settings: { ...defaultSettings, ...(d.settings ?? {}) },
        scores: d.scores ?? {},
        notes: d.notes ?? [],
        eeDone: d.eeDone ?? [],
      };
    }
  } catch { /* private mode / corrupted */ }
  return { settings: { ...defaultSettings }, scores: {}, notes: [], eeDone: [] };
}

export const save: SaveData = load();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

export function recordScore(map: string, difficulty: string, round: number, kills: number): boolean {
  const k = `${map}:${difficulty}`;
  const prev = save.scores[k];
  const better = !prev || round > prev.round || (round === prev.round && kills > prev.kills);
  if (better) { save.scores[k] = { round, kills }; persist(); }
  return better;
}

export function addNote(id: string): boolean {
  if (save.notes.includes(id)) return false;
  save.notes.push(id);
  persist();
  return true;
}
