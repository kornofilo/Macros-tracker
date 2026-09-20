// ---------------------------------------------------------------------------
// Health-data importers.
//
// A static, no-backend PWA cannot call Google Health (the Fit REST API is being
// retired and Health Connect has no web API) or the Suunto cloud API (needs a
// server-side OAuth secret). But every one of those platforms lets you EXPORT
// your data, and Suunto/Garmin/Coros watches export the same FIT files the
// Suunto API itself serves. So we parse files instead:
//
//   .fit  — Suunto / Garmin / Coros / Wahoo watch export  (binary)
//   .tcx  — Training Center XML, calories per activity
//   .csv  — Google Takeout "Daily activity metrics", or generic date,calories
//   .xml  — Apple Health export.xml (ActiveEnergyBurned)
//
// Every parser returns { activities: [{date,'YYYY-MM-DD', kcal, name, source}],
// warnings: [] }. Pure functions; parsers take a string or ArrayBuffer so they
// run the same in the browser and in Node tests.
// ---------------------------------------------------------------------------

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function normDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // Plain YYYY-MM-DD (optionally with time) → take the date part as-is.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d) ? null : iso(d);
}

// ---- CSV (Google Takeout daily metrics, or generic) ----
export function parseCSV(text) {
  const warnings = [];
  const rows = text.split(/\r?\n/).filter((r) => r.trim().length);
  if (rows.length < 2) return { activities: [], warnings: ['CSV had no data rows.'] };
  const split = (line) => {
    // minimal quoted-CSV splitter
    const out = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const header = split(rows[0]).map((h) => h.toLowerCase());
  const find = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const di = find('date', 'day', 'fecha', 'start time', 'start');
  const ci = find('calorie', 'kcal', 'energy');
  const si = find('step');
  if (di < 0 || ci < 0) {
    warnings.push('Could not find date and calories columns in the CSV header.');
    return { activities: [], warnings };
  }
  const activities = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = split(rows[i]);
    const date = normDate(cols[di]);
    const kcal = parseFloat(cols[ci]);
    if (!date || !Number.isFinite(kcal) || kcal <= 0) continue;
    activities.push({ date, kcal: Math.round(kcal), name: 'Daily activity', source: 'CSV / Google Fit', steps: si >= 0 ? parseInt(cols[si], 10) || undefined : undefined });
  }
  return { activities, warnings };
}

// ---- TCX (calories per <Activity>) ----
export function parseTCX(text) {
  const activities = [];
  const blocks = text.split(/<Activity[\s>]/i).slice(1);
  for (const b of blocks) {
    const idm = b.match(/<Id>\s*([^<]+)\s*<\/Id>/i);
    const date = normDate(idm ? idm[1] : (b.match(/StartTime="([^"]+)"/i) || [])[1]);
    if (!date) continue;
    let kcal = 0;
    const cals = b.matchAll(/<Calories>\s*(\d+(?:\.\d+)?)\s*<\/Calories>/gi);
    for (const c of cals) kcal += parseFloat(c[1]);
    if (kcal > 0) activities.push({ date, kcal: Math.round(kcal), name: 'Workout', source: 'TCX' });
  }
  return { activities, warnings: activities.length ? [] : ['No <Calories> found in TCX.'] };
}

// ---- Apple Health export.xml (ActiveEnergyBurned) ----
export function parseAppleHealth(text) {
  const perDay = new Map();
  const re = /<Record[^>]*type="HKQuantityTypeIdentifierActiveEnergyBurned"[^>]*startDate="([^"]+)"[^>]*value="([\d.]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const date = normDate(m[1]);
    const v = parseFloat(m[2]);
    if (!date || !Number.isFinite(v)) continue;
    perDay.set(date, (perDay.get(date) || 0) + v);
  }
  const activities = [...perDay.entries()].map(([date, kcal]) => ({ date, kcal: Math.round(kcal), name: 'Active energy', source: 'Apple Health' }));
  return { activities, warnings: activities.length ? [] : ['No ActiveEnergyBurned records found. Make sure this is the unzipped export.xml.'] };
}

// ---- FIT (binary) — extract "session" messages (global msg 18) ----
// We only need start_time (field 2) or timestamp (field 253) and
// total_calories (field 11). FIT epoch is 1989-12-31 UTC.
const FIT_EPOCH = 631065600; // unix seconds
export function parseFIT(buffer) {
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const bytes = new Uint8Array(view.buffer);
  const warnings = [];
  if (bytes.length < 14) return { activities: [], warnings: ['File too small to be a FIT file.'] };
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (magic !== '.FIT') return { activities: [], warnings: ['Not a FIT file (missing .FIT signature).'] };

  const baseSize = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8 };
  const defs = {}; // localType -> {littleEndian, global, fields:[{num,size,base}]}
  let pos = headerSize;
  const end = Math.min(headerSize + dataSize, bytes.length);
  const sessions = [];

  const readInt = (p, size, le) => {
    let v = 0;
    for (let i = 0; i < size; i++) {
      const b = bytes[le ? p + i : p + size - 1 - i];
      v += b * Math.pow(256, i);
    }
    return v;
  };

  try {
    while (pos < end) {
      const rh = bytes[pos++];
      if (rh & 0x80) { // compressed timestamp header → data message, local type in bits 5-6
        const local = (rh >> 5) & 0x3;
        const def = defs[local];
        if (!def) break;
        pos = readData(def, pos);
        continue;
      }
      const isDef = rh & 0x40;
      const hasDev = rh & 0x20;
      const local = rh & 0x0f;
      if (isDef) {
        const littleEndian = bytes[pos + 1] === 0;
        const global = readInt(pos + 2, 2, littleEndian);
        const nFields = bytes[pos + 4];
        let p = pos + 5;
        const fields = [];
        for (let i = 0; i < nFields; i++) {
          fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2] & 0x1f });
          p += 3;
        }
        if (hasDev) {
          const nDev = bytes[p++];
          for (let i = 0; i < nDev; i++) { fields.push({ num: -1, size: bytes[p + 1], base: 0, dev: true }); p += 3; }
        }
        defs[local] = { littleEndian, global, fields };
        pos = p;
      } else {
        const def = defs[local];
        if (!def) break;
        pos = readData(def, pos);
      }
    }
  } catch (e) {
    warnings.push('Stopped parsing FIT early: ' + e.message);
  }

  function readData(def, p) {
    let startTime = null, timestamp = null, calories = null;
    for (const f of def.fields) {
      if (def.global === 18 && !f.dev) { // session
        const val = readInt(p, f.size, def.littleEndian);
        if (f.num === 2 && val !== 0xffffffff) startTime = val;
        else if (f.num === 253 && val !== 0xffffffff) timestamp = val;
        else if (f.num === 11 && val !== 0xffff) calories = val;
      }
      p += f.size;
    }
    if (def.global === 18) {
      const t = startTime ?? timestamp;
      if (t != null && calories != null && calories > 0) {
        sessions.push({ date: iso(new Date((t + FIT_EPOCH) * 1000)), kcal: calories });
      }
    }
    return p;
  }

  const activities = sessions.map((s) => ({ ...s, name: 'Workout', source: 'FIT (Suunto/Garmin)' }));
  if (!activities.length) warnings.push('No session calories found in FIT file.');
  return { activities, warnings };
}

// ---- dispatch by filename ----
export function parseFile(name, data) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'fit') return parseFIT(data);
  if (ext === 'tcx') return parseTCX(String(data));
  if (ext === 'csv') return parseCSV(String(data));
  if (ext === 'xml') {
    const s = String(data);
    return /HealthData|HKQuantityType/.test(s) ? parseAppleHealth(s) : parseTCX(s);
  }
  return { activities: [], warnings: [`Unsupported file type: .${ext}`] };
}

// ---- merge + summarise ----
export function mergeActivities(existing, incoming) {
  const map = new Map(existing.map((a) => [`${a.source}|${a.date}|${a.kcal}|${a.name}`, a]));
  for (const a of incoming) map.set(`${a.source}|${a.date}|${a.kcal}|${a.name}`, a);
  return [...map.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
}

export function summarize(activities) {
  if (!activities.length) return null;
  const dates = activities.map((a) => a.date).sort();
  const start = dates[0], end = dates[dates.length - 1];
  const totalKcal = activities.reduce((t, a) => t + a.kcal, 0);
  const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
  const bySource = {};
  for (const a of activities) bySource[a.source] = (bySource[a.source] || 0) + 1;
  return {
    count: activities.length,
    totalKcal,
    start, end, days,
    avgPerCalendarDay: Math.round(totalKcal / days),
    bySource,
  };
}
