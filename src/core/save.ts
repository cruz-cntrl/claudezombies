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
  /** Upper part of the movement side: drag to look, tap to toggle ADS */
  leftLookPad: boolean;
  /** Touch: aimed in with the reticle on a target → the gun fires by itself */
  autoFireAds: boolean;
  /** Story cutscenes (prologue, room unlocks, boss reveals) */
  cutscenes: boolean;
  /** Player-arranged positions of touch buttons / HUD pieces: id → centre as screen fractions */
  hudLayout: Record<string, [number, number]>;
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
  adsSens: 1.25,
  invertY: false,
  aimAssist: true,
  aimAssistStrength: 0.6,
  adsMode: 'hold',
  buttonSize: 'M',
  buttonOpacity: 0.7,
  leftHanded: false,
  leftLookPad: true,
  autoFireAds: true,
  cutscenes: true,
  hudLayout: {},
  quality: 'medium',
  showFps: false,
  master: 0.9,
  music: 0.6,
  sfx: 0.9,
  voice: 0.8,
  tutorialDone: false,
};

const KEY = 'tethered.v1';
const SETTINGS_VERSION = 2;

interface SaveData {
  settings: Settings;
  scores: Record<string, { round: number; kills: number }>; // key `${map}:${difficulty}`
  notes: string[];
  eeDone: string[];
  /** one-time story beats already shown (e.g. 'prologue:ravenmoor') */
  seen: string[];
  /** bumped when a default changes in a way existing saves should pick up */
  settingsVersion?: number;
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      const settings = { ...defaultSettings, ...(d.settings ?? {}) };
      // v2: aiming got faster by default (old default was 0.7)
      if ((d.settingsVersion ?? 1) < 2) settings.adsSens = Math.max(settings.adsSens, defaultSettings.adsSens);
      return {
        settings,
        scores: d.scores ?? {},
        notes: d.notes ?? [],
        eeDone: d.eeDone ?? [],
        seen: d.seen ?? [],
        settingsVersion: SETTINGS_VERSION,
      };
    }
  } catch { /* private mode / corrupted */ }
  return { settings: { ...defaultSettings }, scores: {}, notes: [], eeDone: [], seen: [], settingsVersion: SETTINGS_VERSION };
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

/** Map unlocks: a map with `unlock` opens once its gate round was reached on the gate map. */
export function isUnlocked(def: { id: string; unlock?: { map: string; round: number } }): boolean {
  if (!def.unlock) return true;
  if (save.seen.includes('unlock:' + def.id)) return true;
  // anyone who already played this map before the gate existed keeps it
  if (Object.keys(save.scores).some((k) => k.startsWith(def.id + ':'))) return true;
  return Object.entries(save.scores).some(([k, v]) => k.startsWith(def.unlock!.map + ':') && v.round >= def.unlock!.round);
}

export function markUnlocked(id: string): boolean {
  if (save.seen.includes('unlock:' + id)) return false;
  save.seen.push('unlock:' + id);
  persist();
  return true;
}

export function addNote(id: string): boolean {
  if (save.notes.includes(id)) return false;
  save.notes.push(id);
  persist();
  return true;
}
