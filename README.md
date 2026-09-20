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
  rate, protein g/kg and fat %, profile, **health-data import** (FIT / TCX / CSV
  / Apple Health), and JSON export/import backup.

## Connecting Google Health / Suunto / Apple Health

Short version: a **static, no-backend web app cannot pull these live**, so the
app imports **exported files** instead (Program → **Connect health data**). Why:

| Source | Live sync from a hosted web page? | How to get data in |
|---|---|---|
| **Google Fit / Health** | ❌ Fit REST API is [being shut down (end of 2026)](https://sahha.ai/blog/google-fit-api-sunset-migration/) and Health Connect is an **on-device Android API with no web endpoint** | [Google Takeout](https://takeout.google.com/) → Fit → "Daily activity metrics" **.csv** |
| **Suunto** | ❌ Cloud API is OAuth2 **authorization-code** with a server-side secret + registered app | Export a workout as **.fit** (or GPX); or let Suunto **auto-sync to Strava**, which this app already reads live |
| **Garmin / Coros / Wahoo** | ❌ (same server-secret problem) | Export activity as **.fit** or **.tcx** |
| **Apple Health** | ❌ (no web API at all) | Health app → Export All Health Data → unzip → **export.xml** |

The importer parses **`.fit`** (binary — the same format Suunto's own API serves),
**`.tcx`**, **`.csv`** (Takeout or generic `date,calories`), and Apple Health
**`.xml`**, turns them into per-day activity calories, and uses the average to
drive your **activity baseline**. Note the adaptive TDEE engine ultimately learns
your *true* expenditure from weight-trend + intake regardless of source, so this
mainly improves the day-one estimate.

**The one live path:** point your watch (Suunto/Garmin/Coros) at **Strava** —
the app already reads 4 months of it, updated as you train.

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

## About the Strava seed

The initial activity baseline was pulled from the last ~4 months of **Strava**
activity via its connector and baked into `js/seed.js`. For Google Health,
Suunto, Apple Health and other watches, see
[Connecting Google Health / Suunto / Apple Health](#connecting-google-health--suunto--apple-health)
above — those import from exported files because none can be synced live from a
static web app.

_Educational tool, not medical advice._
