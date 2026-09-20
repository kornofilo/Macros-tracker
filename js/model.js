// ---------------------------------------------------------------------------
// Adaptive TDEE + macro model  (MacroFactor-style energy-balance engine)
// Pure functions, no DOM. All energy in kcal, weight in kg.
// ---------------------------------------------------------------------------

// ---- date helpers (local-time ISO YYYY-MM-DD) ----
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseISO(iso).toLocaleDateString(undefined, opts);
}

// ---- basal metabolic rate (Mifflin–St Jeor) ----
export function mifflinBMR({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

// ---- trend weight: exponentially-weighted moving average of scale weight ----
// Returns a per-calendar-day series [{date, trend, scale|null}] from first
// weigh-in to `throughISO` (defaults to last weigh-in). Missing days carry the
// trend forward, which is exactly how a smoothed body-weight trend behaves.
export function trendSeries(weights, alpha = 0.1, throughISO = null) {
  if (!weights.length) return [];
  const byDate = new Map(weights.map((w) => [w.date, w.kg]));
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = sorted[0].date;
  const end = throughISO && throughISO > sorted[sorted.length - 1].date
    ? throughISO
    : sorted[sorted.length - 1].date;
  const out = [];
  let trend = sorted[0].kg;
  for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
    const scale = byDate.has(iso) ? byDate.get(iso) : null;
    if (scale != null) trend = trend + alpha * (scale - trend);
    out.push({ date: iso, trend: Math.round(trend * 100) / 100, scale });
  }
  return out;
}

export function latestTrendWeight(state) {
  const s = trendSeries(state.weights, state.settings.trendAlpha, todayISO());
  if (s.length) return s[s.length - 1].trend;
  return state.profile.initialWeightKg;
}

// ---- daily intake totals from the food log ----
export function dayTotals(entries = []) {
  return entries.reduce(
    (t, e) => {
      const q = e.qty ?? 1;
      t.kcal += (e.kcal || 0) * q;
      t.p += (e.p || 0) * q;
      t.c += (e.c || 0) * q;
      t.f += (e.f || 0) * q;
      return t;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}
export function roundTotals(t) {
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
}

// ---- formula-based expenditure seed (used before enough data exists) ----
// BMR * baseline non-exercise multiplier + average logged exercise kcal/day.
export function seedTDEE(state) {
  const wt = latestTrendWeight(state);
  const bmr = mifflinBMR({
    sex: state.profile.sex,
    weightKg: wt,
    heightCm: state.profile.heightCm,
    age: state.profile.age,
  });
  const NON_EXERCISE_MULT = 1.2; // TEF + baseline NEAT
  return Math.round(bmr * NON_EXERCISE_MULT + (state.program.activityKcalPerDay || 0));
}

// ---- adaptive TDEE from the energy-balance identity ----
// TDEE ≈ avgIntake − (ΔtrendWeight × kcalPerKg) / days
// Uses the most recent window that has trend weight at both ends and enough
// logged-intake days in between.
export function adaptiveTDEE(state) {
  const { tdeeWindowDays, energyBalanceKcalPerKg, trendAlpha } = state.settings;
  const today = todayISO();
  const series = trendSeries(state.weights, trendAlpha, today);
  if (series.length < 8) return null;

  const trendByDate = new Map(series.map((p) => [p.date, p.trend]));
  // Expand the window up to 28 days to get a more stable read when available.
  for (const win of [tdeeWindowDays, 21, 28]) {
    const endISO = series[series.length - 1].date;
    const startISO = addDays(endISO, -(win - 1));
    if (!trendByDate.has(startISO)) continue;

    const intakeDays = [];
    for (let iso = startISO; iso <= endISO; iso = addDays(iso, 1)) {
      const entries = state.food[iso];
      if (entries && entries.length) intakeDays.push(dayTotals(entries).kcal);
    }
    if (intakeDays.length < Math.max(6, Math.floor(win * 0.5))) continue;

    const avgIntake = intakeDays.reduce((a, b) => a + b, 0) / intakeDays.length;
    const span = daysBetween(startISO, endISO);
    const trendDelta = trendByDate.get(endISO) - trendByDate.get(startISO); // kg
    const tdee = avgIntake - (trendDelta * energyBalanceKcalPerKg) / span;
    return {
      tdee: Math.round(tdee),
      loggedDays: intakeDays.length,
      windowDays: win,
      avgIntake: Math.round(avgIntake),
      trendDeltaKg: Math.round(trendDelta * 100) / 100,
    };
  }
  return null;
}

// ---- the expenditure the app actually uses (blend of seed + adaptive) ----
export function expenditure(state) {
  const seed = seedTDEE(state);
  const adaptive = adaptiveTDEE(state);
  if (!adaptive) {
    return { tdee: seed, source: 'estimate', confidence: 0, seed, adaptive: null };
  }
  // Weight the adaptive value more as logged days accumulate.
  const w = Math.min(0.85, adaptive.loggedDays / (adaptive.loggedDays + 8));
  const tdee = Math.round(seed * (1 - w) + adaptive.tdee * w);
  const confidence = Math.min(1, adaptive.loggedDays / 14);
  return { tdee, source: w >= 0.6 ? 'adaptive' : 'learning', confidence, seed, adaptive, blend: w };
}

// ---- program → calorie + macro targets ----
export function targets(state) {
  const wt = latestTrendWeight(state);
  const exp = expenditure(state);
  const { ratePctPerWeek, proteinPerKg, fatPct } = state.program;

  // Desired weekly change → daily energy adjustment.
  const kgPerWeek = (ratePctPerWeek / 100) * wt;
  const dailyAdj = (kgPerWeek * state.settings.energyBalanceKcalPerKg) / 7;
  let kcal = Math.round(exp.tdee + dailyAdj);

  // Never program below a sane floor.
  const floor = Math.max(1200, Math.round(mifflinBMR({
    sex: state.profile.sex, weightKg: wt,
    heightCm: state.profile.heightCm, age: state.profile.age,
  }) * 1.05));
  if (kcal < floor) kcal = floor;

  // Protein anchored to body weight; fat as a % of calories with a floor.
  let protein = Math.round(proteinPerKg * wt);
  let fat = Math.round((fatPct / 100 * kcal) / 9);
  const fatFloor = Math.round(0.5 * wt);
  if (fat < fatFloor) fat = fatFloor;

  let carbsKcal = kcal - protein * 4 - fat * 9;
  if (carbsKcal < 0) {
    // Trim fat first, then protein, to keep carbs non-negative.
    fat = Math.max(fatFloor, Math.floor((kcal - protein * 4) / 9));
    carbsKcal = kcal - protein * 4 - fat * 9;
    if (carbsKcal < 0) { protein = Math.floor(kcal / 4); carbsKcal = 0; }
  }
  const carbs = Math.max(0, Math.round(carbsKcal / 4));

  return {
    kcal, protein, carbs, fat,
    weightKg: wt,
    kgPerWeek: Math.round(kgPerWeek * 1000) / 1000,
    tdee: exp.tdee,
    expenditure: exp,
  };
}

// ---- weekly check-in comparison (this week vs last) ----
export function weeklyReview(state) {
  const today = todayISO();
  const window = (startOffset, len) => {
    const start = addDays(today, startOffset);
    let kcalSum = 0, days = 0;
    for (let i = 0; i < len; i++) {
      const iso = addDays(start, i);
      const e = state.food[iso];
      if (e && e.length) { kcalSum += dayTotals(e).kcal; days++; }
    }
    return { avg: days ? Math.round(kcalSum / days) : null, days };
  };
  const thisWeek = window(-6, 7);
  const lastWeek = window(-13, 7);
  const series = trendSeries(state.weights, state.settings.trendAlpha, today);
  const trendNow = series.length ? series[series.length - 1].trend : null;
  const wkAgoISO = addDays(today, -7);
  const trendWk = series.find((p) => p.date === wkAgoISO)?.trend ?? null;
  return {
    thisWeek, lastWeek,
    trendNow,
    trendDeltaKg: trendNow != null && trendWk != null ? Math.round((trendNow - trendWk) * 100) / 100 : null,
  };
}
