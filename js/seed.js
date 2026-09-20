// Strava-derived activity seed.
// Pulled from the athlete's last ~4 months of Strava activity
// (2026-05-20 → 2026-09-20) at the time the app was generated.
// Used to initialise the adaptive TDEE engine before you have logged
// enough weight + intake data for the app to learn your true expenditure.
export const STRAVA_SEED = {
  athlete: {
    name: 'Ricardo Rubio',
    sex: 'male',
    weightKg: 85,
    location: 'Volcán, Chiriquí, Panama',
    focus: '50 km trail race',
  },
  window: {
    start: '2026-05-20',
    end: '2026-09-20',
    days: 124,
  },
  totals: {
    activities: 79,
    totalKcal: 47473,
    activeDays: 65,
    activeDayPct: 52,
    activitiesPerWeek: 4.5,
    // Average exercise kcal spread across EVERY calendar day in the window.
    avgKcalPerCalendarDay: 383,
    // Average exercise kcal on days you actually trained.
    avgKcalPerActiveDay: 730,
  },
  byCategory: [
    { label: 'Running', sessions: 19, kcal: 22791 },
    { label: 'Walking / Hiking', sessions: 21, kcal: 9679 },
    { label: 'Cycling', sessions: 24, kcal: 8646 },
    { label: 'Strength / CrossFit', sessions: 10, kcal: 5113 },
    { label: 'Yoga / Pilates', sessions: 4, kcal: 855 },
    { label: 'Cardio (other)', sessions: 1, kcal: 389 },
  ],
  byMonth: [
    { month: 'May', kcal: 2913 },
    { month: 'Jun', kcal: 5986 },
    { month: 'Jul', kcal: 16310 },
    { month: 'Aug', kcal: 15449 },
    { month: 'Sep', kcal: 6815 },
  ],
};
