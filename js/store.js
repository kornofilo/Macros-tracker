// ---------------------------------------------------------------------------
// Persistent state.  Everything lives client-side in localStorage so the app
// works offline and needs no server.  Use the Settings tab to export/import a
// JSON backup (localStorage is per-device and can be cleared by the browser).
// ---------------------------------------------------------------------------
import { STRAVA_SEED } from './seed.js';

const KEY = 'macrotrack:v1';

export function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    onboarded: false,
    profile: {
      name: STRAVA_SEED.athlete.name,
      sex: STRAVA_SEED.athlete.sex, // 'male' | 'female'
      heightCm: 178,
      age: 34,
      initialWeightKg: STRAVA_SEED.athlete.weightKg,
    },
    program: {
      goal: 'recomp', // recomp | cut | maintain | bulk
      ratePctPerWeek: -0.25, // % bodyweight / week (negative = fat loss)
      proteinPerKg: 2.0, // g protein per kg bodyweight
      fatPct: 27, // % of calories from fat
      // Seeded from 4 months of Strava: avg exercise kcal spread over all days.
      activityKcalPerDay: STRAVA_SEED.totals.avgKcalPerCalendarDay,
    },
    weights: [], // [{date:'YYYY-MM-DD', kg}]
    food: {}, // { 'YYYY-MM-DD': [entry] }  entry: {id,name,kcal,p,c,f,qty}
    foodsLibrary: [], // [{id,name,kcal,p,c,f}] reusable per-serving foods
    importedActivities: [], // [{date,kcal,name,source}] from FIT/TCX/CSV/Apple Health imports
    settings: {
      units: 'metric',
      energyBalanceKcalPerKg: 7700,
      trendAlpha: 0.1,
      tdeeWindowDays: 14,
    },
    strava: STRAVA_SEED,
  };
}

let state = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = migrate({ ...defaultState(), ...JSON.parse(raw) });
    } else {
      state = defaultState();
    }
  } catch (e) {
    console.warn('Failed to load state, starting fresh', e);
    state = defaultState();
  }
  return state;
}

function migrate(s) {
  // Keep nested defaults present even if an older/partial blob was stored.
  const d = defaultState();
  s.profile = { ...d.profile, ...s.profile };
  s.program = { ...d.program, ...s.program };
  s.settings = { ...d.settings, ...s.settings };
  s.strava = s.strava || d.strava;
  s.weights = s.weights || [];
  s.food = s.food || {};
  s.foodsLibrary = s.foodsLibrary || [];
  s.importedActivities = s.importedActivities || [];
  return s;
}

export function get() {
  return state || load();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state', e);
  }
  return state;
}

// Mutate then persist in one call.
export function update(fn) {
  fn(state);
  return save();
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  state = migrate({ ...defaultState(), ...parsed });
  return save();
}

export function resetAll() {
  state = defaultState();
  return save();
}

export const uid = () => Math.random().toString(36).slice(2, 10);
