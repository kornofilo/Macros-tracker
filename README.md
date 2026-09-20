# MacroTrack — Adaptive Macro Tracker

A [MacroFactor](https://macrofactorapp.com/)-style macro tracker for **body
recomposition**, built as an installable **Progressive Web App**. No app store,
no backend, no account — it runs entirely in your phone's browser and works
offline once installed.

Instead of a fixed calorie formula, MacroTrack **learns your real energy
expenditure** from the relationship between what you eat and how your smoothed
body-weight trend moves, then keeps your macro targets honest as your weight
changes.

Seeded with **4 months of Strava activity** (May–Sep 2026: 79 activities,
~383 kcal/day of exercise) to give a realistic expenditure estimate on day one.

## 📲 Install on your phone

Once GitHub Pages is enabled (see below), open the site URL on your phone:

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app / Add to Home screen**

It then launches full-screen like a native app and works without a connection.

**Live URL:** `https://<your-github-username>.github.io/macros-tracker/`

## How the adaptive TDEE works

1. **Trend weight** — every weigh-in feeds an exponentially-weighted moving
   average, smoothing out day-to-day water/food noise.
2. **Energy balance** — over a rolling 14–28 day window:

   ```
   TDEE ≈ average intake − (Δ trend weight × 7700 kcal/kg) ÷ days
   ```

   If your trend weight is flat, your expenditure equals your intake. If you're
   losing weight, you're eating below expenditure — so expenditure is higher
   than your intake, and vice-versa.
3. **Blending** — before you have ~2 weeks of data, MacroTrack uses a formula
   estimate (Mifflin–St Jeor BMR + your Strava activity baseline). As you log,
   it shifts weight onto the data-driven estimate.
4. **Targets** — calories = expenditure ± your goal adjustment. Protein is
   anchored to body weight (default 2.0 g/kg for recomp), fat is a % of
   calories, carbs fill the rest.

## Features

- **Today** — calorie ring + protein/carb/fat bars, food log with quick-add and
  a reusable foods library, auto-calorie-from-macros.
- **Weight** — daily weigh-ins, smoothed trend chart, 7-day trend change.
- **Trends** — adaptive expenditure with confidence, weekly check-in, 21-day
  intake-vs-target chart, weight trend, and your Strava activity summary.
- **Program** — goal presets (Recomp / Cut / Maintain / Lean bulk), adjustable
  rate, protein g/kg and fat %, profile, and JSON export/import backup.

## Your data

Everything is stored in your browser's `localStorage` on the device you use —
nothing is uploaded anywhere. **Use Program → Export JSON to back up**, since
clearing your browser data will erase it.

## Tech

Plain HTML/CSS/JS (ES modules), no build step, no dependencies. A service worker
precaches the app shell for offline use.

```
index.html            app shell + tab bar
css/styles.css        mobile-first dark theme
js/model.js           adaptive TDEE + macro math (pure functions)
js/store.js           localStorage state, export/import
js/ui.js              views, charts, interactions
js/seed.js            Strava-derived activity seed
sw.js                 offline service worker
manifest.webmanifest  PWA manifest
```

## Enabling GitHub Pages (one time)

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **`claude/macro-tracker-app-rmprf9`**, folder: **`/ (root)`** → **Save**.
4. Wait ~1 minute. Your app goes live at:

   ```
   https://kornofilo.github.io/Macros-tracker/
   ```

Open that URL on your phone and **Add to Home Screen** to install it.

---

## About the Strava & Google Fit data

The activity baseline was pulled from the last ~4 months of **Strava** activity
via its connector and baked into `js/seed.js`. **Google Fit** could not be
included automatically — Google retired the Fit API (in favor of Health
Connect) and no Fit connector was available in this environment. You can still
fold in Google Fit numbers manually by adjusting the **Activity baseline** in
the Program tab, or by relying on the adaptive engine, which captures all of
your expenditure (Fit-tracked or not) from your weight-trend + intake data.

_Educational tool, not medical advice._
