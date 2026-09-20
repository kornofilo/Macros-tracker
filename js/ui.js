// ---------------------------------------------------------------------------
// UI layer: rendering + interactions. Vanilla JS, event delegation, inline SVG
// charts. No framework, no build step.
// ---------------------------------------------------------------------------
import * as store from './store.js';
import * as M from './model.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

let view = (location.hash || '#today').slice(1);
let currentDate = M.todayISO();

// =========================================================================
// SVG chart helpers
// =========================================================================
function lineChart({ series, width = 320, height = 140, pad = 24 }) {
  // series: [{points:[{x,y}], color, area, dashed}], all share x/y scale
  const all = series.flatMap((s) => s.points);
  if (!all.length) return `<div class="empty">No data yet</div>`;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const sx = (x) => pad + (maxX === minX ? 0 : (x - minX) / (maxX - minX)) * (width - pad * 2);
  const sy = (y) => height - pad - ((y - minY) / (maxY - minY)) * (height - pad * 2);
  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="none" role="img">`;
  // horizontal gridlines + y labels
  for (let i = 0; i <= 2; i++) {
    const y = minY + (maxY - minY) * (i / 2);
    const yy = sy(y);
    out += `<line x1="${pad}" y1="${yy}" x2="${width - pad}" y2="${yy}" class="grid"/>`;
    out += `<text x="2" y="${yy + 3}" class="axis">${Math.round(y)}</text>`;
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    if (s.area) {
      const a = `M${sx(s.points[0].x).toFixed(1)},${(height - pad).toFixed(1)} ` +
        s.points.map((p) => `L${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ') +
        ` L${sx(s.points[s.points.length - 1].x).toFixed(1)},${(height - pad).toFixed(1)} Z`;
      out += `<path d="${a}" fill="${s.color}" opacity="0.12"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
    if (s.dots) for (const p of s.points) out += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.4" fill="${s.color}"/>`;
  }
  return out + '</svg>';
}

function barChart(items, { color = 'var(--carb)', height = 130, fmt = (v) => v } = {}) {
  if (!items.length) return `<div class="empty">No data</div>`;
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return `<div class="bars" style="height:${height}px">` + items.map((i) =>
    `<div class="bar-col"><div class="bar-val">${fmt(i.value)}</div>` +
    `<div class="bar" style="height:${Math.max(2, (i.value / max) * (height - 34))}px;background:${i.color || color}"></div>` +
    `<div class="bar-lbl">${esc(i.label)}</div></div>`).join('') + '</div>';
}

function ring(consumed, target) {
  const pct = target > 0 ? Math.min(1.3, consumed / target) : 0;
  const R = 52, C = 2 * Math.PI * R;
  const over = consumed > target;
  const dash = Math.min(1, pct) * C;
  return `<svg viewBox="0 0 130 130" class="ring">
    <circle cx="65" cy="65" r="${R}" class="ring-track"/>
    <circle cx="65" cy="65" r="${R}" class="ring-fill" stroke="${over ? 'var(--danger)' : 'var(--protein)'}"
      stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 65 65)"/>
    <text x="65" y="60" class="ring-num">${Math.round(consumed)}</text>
    <text x="65" y="80" class="ring-sub">of ${Math.round(target)}</text>
  </svg>`;
}

function macroBar(label, val, target, color) {
  const pct = target > 0 ? Math.min(1, val / target) * 100 : 0;
  const over = val > target * 1.02;
  return `<div class="mrow"><div class="mtop"><span>${label}</span><span>${Math.round(val)} / ${Math.round(target)} g</span></div>
    <div class="mtrack"><div class="mfill" style="width:${pct}%;background:${over ? 'var(--danger)' : color}"></div></div></div>`;
}

// =========================================================================
// Views
// =========================================================================
function today() {
  const s = store.get();
  const t = M.targets(s);
  const entries = s.food[currentDate] || [];
  const tot = M.roundTotals(M.dayTotals(entries));
  const isToday = currentDate === M.todayISO();
  const remaining = t.kcal - tot.kcal;

  return `
  <section class="stack">
    <div class="datenav">
      <button class="ghost" data-act="date" data-d="-1">‹</button>
      <div class="datelabel">${M.fmtDate(currentDate)}${isToday ? ' · Today' : ''}</div>
      <button class="ghost" data-act="date" data-d="1" ${isToday ? 'disabled' : ''}>›</button>
    </div>

    <div class="card center">
      ${ring(tot.kcal, t.kcal)}
      <div class="remain ${remaining < 0 ? 'neg' : ''}">${remaining >= 0 ? remaining + ' kcal left' : Math.abs(remaining) + ' kcal over'}</div>
      <div class="macros">
        ${macroBar('Protein', tot.p, t.protein, 'var(--protein)')}
        ${macroBar('Carbs', tot.c, t.carbs, 'var(--carb)')}
        ${macroBar('Fat', tot.f, t.fat, 'var(--fat)')}
      </div>
      <div class="tinytdee">Target ${t.kcal} kcal · Expenditure ≈ ${t.tdee} kcal/day (${t.expenditure.source})</div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Food log</h2><button class="primary sm" data-act="add-food">+ Add</button></div>
      ${entries.length ? `<ul class="list">${entries.map(entryRow).join('')}</ul>`
        : `<div class="empty">Nothing logged yet. Tap <b>+ Add</b> to log a meal.</div>`}
    </div>
  </section>`;
}

function entryRow(e) {
  const q = e.qty ?? 1;
  const k = Math.round((e.kcal || 0) * q);
  return `<li class="litem">
    <div><div class="lname">${esc(e.name)}${q !== 1 ? ` <span class="qty">×${q}</span>` : ''}</div>
    <div class="lmeta">${k} kcal · P${Math.round((e.p||0)*q)} C${Math.round((e.c||0)*q)} F${Math.round((e.f||0)*q)}</div></div>
    <button class="ghost del" data-act="del-food" data-id="${e.id}">✕</button>
  </li>`;
}

function weight() {
  const s = store.get();
  const series = M.trendSeries(s.weights, s.settings.trendAlpha, M.todayISO());
  const trendNow = series.length ? series[series.length - 1].trend : null;
  const wkAgo = series.find((p) => p.date === M.addDays(M.todayISO(), -7))?.trend;
  const delta = trendNow != null && wkAgo != null ? (trendNow - wkAgo) : null;
  const chart = lineChart({
    series: [
      { points: series.map((p, i) => ({ x: i, y: p.trend })), color: 'var(--protein)', area: true },
      { points: series.filter((p) => p.scale != null).map((p) => ({ x: series.indexOf(p), y: p.scale })), color: 'var(--muted)', dots: true, area: false },
    ],
  });
  const recent = [...s.weights].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  return `
  <section class="stack">
    <div class="card">
      <div class="cardhead"><h2>Log weight</h2></div>
      <div class="inline">
        <input type="number" step="0.1" inputmode="decimal" id="wkg" placeholder="kg" value="${trendNow ?? s.profile.initialWeightKg}"/>
        <input type="date" id="wdate" value="${M.todayISO()}" max="${M.todayISO()}"/>
        <button class="primary" data-act="log-weight">Save</button>
      </div>
      <div class="statrow">
        <div class="stat"><div class="statnum">${trendNow != null ? trendNow.toFixed(1) : '—'}</div><div class="statlbl">Trend weight (kg)</div></div>
        <div class="stat"><div class="statnum ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) : '—'}</div><div class="statlbl">7-day change (kg)</div></div>
      </div>
    </div>
    <div class="card">
      <div class="cardhead"><h2>Trend</h2><span class="hint">line = smoothed trend · dots = weigh-ins</span></div>
      ${chart}
    </div>
    <div class="card">
      <div class="cardhead"><h2>History</h2></div>
      ${recent.length ? `<ul class="list">${recent.map((w) =>
        `<li class="litem"><div><div class="lname">${w.kg.toFixed(1)} kg</div><div class="lmeta">${M.fmtDate(w.date)}</div></div>
         <button class="ghost del" data-act="del-weight" data-id="${w.date}">✕</button></li>`).join('')}</ul>`
        : `<div class="empty">No weigh-ins yet.</div>`}
    </div>
  </section>`;
}

function trends() {
  const s = store.get();
  const t = M.targets(s);
  const exp = t.expenditure;
  const rev = M.weeklyReview(s);

  // 21-day intake vs target
  const days = [];
  for (let i = 20; i >= 0; i--) {
    const iso = M.addDays(M.todayISO(), -i);
    const e = s.food[iso];
    days.push({ iso, kcal: e && e.length ? M.dayTotals(e).kcal : null });
  }
  const intakePts = days.map((d, i) => ({ x: i, y: d.kcal })).filter((p) => p.y != null);
  const intakeChart = lineChart({
    series: [
      { points: intakePts, color: 'var(--carb)', dots: true, area: true },
      { points: days.map((d, i) => ({ x: i, y: t.kcal })), color: 'var(--muted)', dashed: true },
    ],
  });

  const wseries = M.trendSeries(s.weights, s.settings.trendAlpha, M.todayISO());
  const weightChart = lineChart({ series: [{ points: wseries.map((p, i) => ({ x: i, y: p.trend })), color: 'var(--protein)', area: true }] });

  const conf = Math.round(exp.confidence * 100);
  return `
  <section class="stack">
    <div class="card">
      <div class="cardhead"><h2>Expenditure (adaptive TDEE)</h2></div>
      <div class="bigtdee">${exp.tdee}<span> kcal/day</span></div>
      <div class="pill ${exp.source}">${exp.source === 'adaptive' ? 'Learned from your data' : exp.source === 'learning' ? 'Learning — keep logging' : 'Estimated (needs data)'} · ${conf}% confidence</div>
      <div class="explain">
        ${exp.adaptive
          ? `Over the last ${exp.adaptive.windowDays} days you averaged <b>${exp.adaptive.avgIntake} kcal</b> and your trend weight moved <b>${exp.adaptive.trendDeltaKg > 0 ? '+' : ''}${exp.adaptive.trendDeltaKg} kg</b>, implying a true expenditure of ~${exp.adaptive.tdee} kcal/day. Blended with the ${exp.seed}-kcal formula estimate as data builds.`
          : `Not enough logged data yet. Using a formula estimate (BMR + your Strava activity of ${s.program.activityKcalPerDay} kcal/day). Log weight daily and food most days for ~2 weeks and the app will learn your real expenditure.`}
      </div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Weekly check-in</h2></div>
      <div class="statrow">
        <div class="stat"><div class="statnum">${rev.thisWeek.avg ?? '—'}</div><div class="statlbl">Avg intake this wk (${rev.thisWeek.days}d)</div></div>
        <div class="stat"><div class="statnum">${rev.lastWeek.avg ?? '—'}</div><div class="statlbl">Last wk (${rev.lastWeek.days}d)</div></div>
        <div class="stat"><div class="statnum ${rev.trendDeltaKg > 0 ? 'up' : rev.trendDeltaKg < 0 ? 'down' : ''}">${rev.trendDeltaKg != null ? (rev.trendDeltaKg > 0 ? '+' : '') + rev.trendDeltaKg : '—'}</div><div class="statlbl">Trend Δ (kg/wk)</div></div>
      </div>
      <div class="explain">${checkinAdvice(s, t, rev)}</div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Intake vs target · 21 days</h2></div>
      ${intakeChart}
    </div>
    <div class="card">
      <div class="cardhead"><h2>Weight trend</h2></div>
      ${weightChart}
    </div>

    <div class="card">
      <div class="cardhead"><h2>Strava · last 4 months</h2><span class="hint">seed data</span></div>
      <div class="statrow">
        <div class="stat"><div class="statnum">${s.strava.totals.activities}</div><div class="statlbl">activities</div></div>
        <div class="stat"><div class="statnum">${s.strava.totals.activitiesPerWeek}</div><div class="statlbl">per week</div></div>
        <div class="stat"><div class="statnum">${s.strava.totals.avgKcalPerCalendarDay}</div><div class="statlbl">kcal/day avg</div></div>
      </div>
      ${barChart(s.strava.byMonth.map((m) => ({ label: m.month, value: m.kcal })), { color: 'var(--fat)', fmt: (v) => (v / 1000).toFixed(1) + 'k' })}
      <ul class="list tight">${s.strava.byCategory.map((c) =>
        `<li class="litem"><div><div class="lname">${esc(c.label)}</div><div class="lmeta">${c.sessions} sessions</div></div><div class="lmeta">${(c.kcal/1000).toFixed(1)}k kcal</div></li>`).join('')}</ul>
    </div>
  </section>`;
}

function checkinAdvice(s, t, rev) {
  if (rev.thisWeek.days < 3) return 'Log at least a few days this week to get a check-in read.';
  const goalLoss = s.program.ratePctPerWeek < -0.02;
  const goalGain = s.program.ratePctPerWeek > 0.02;
  const d = rev.trendDeltaKg;
  if (d == null) return 'Add daily weigh-ins to track your trend against your goal.';
  const targetKgWk = t.kgPerWeek;
  const diff = d - targetKgWk;
  if (goalLoss) {
    if (d >= 0) return `Trend is flat/up but you're aiming to lose ${Math.abs(targetKgWk).toFixed(2)} kg/wk. Expenditure is being re-learned from this — your target will drift down automatically. Stay consistent for another week before manual changes.`;
    return `On track: losing ${Math.abs(d).toFixed(2)} kg/wk vs a ${Math.abs(targetKgWk).toFixed(2)} kg/wk goal. Adaptive TDEE keeps your target honest as weight changes.`;
  }
  if (goalGain) return `Aiming to gain ${targetKgWk.toFixed(2)} kg/wk; actual trend ${d > 0 ? '+' : ''}${d} kg/wk. ${diff < -0.1 ? 'Slightly under — target will nudge up.' : 'Looking good.'}`;
  return `Maintenance goal — trend moved ${d > 0 ? '+' : ''}${d} kg/wk. High protein (${s.program.proteinPerKg} g/kg) + training is the recomposition driver here.`;
}

function program() {
  const s = store.get();
  const t = M.targets(s);
  return `
  <section class="stack">
    <div class="card">
      <div class="cardhead"><h2>Goal</h2></div>
      <div class="chips">
        ${['recomp', 'cut', 'maintain', 'bulk'].map((g) =>
          `<button class="chip ${s.program.goal === g ? 'on' : ''}" data-act="goal" data-g="${g}">${goalLabel(g)}</button>`).join('')}
      </div>
      <label class="field"><span>Rate: <b>${s.program.ratePctPerWeek}%</b> body-weight / week <small>(${t.kgPerWeek > 0 ? '+' : ''}${t.kgPerWeek} kg/wk)</small></span>
        <input type="range" min="-1" max="0.5" step="0.05" value="${s.program.ratePctPerWeek}" data-act="rate"/>
      </label>
      <label class="field"><span>Protein: <b>${s.program.proteinPerKg}</b> g / kg</span>
        <input type="range" min="1.4" max="2.6" step="0.1" value="${s.program.proteinPerKg}" data-act="protein"/>
      </label>
      <label class="field"><span>Fat: <b>${s.program.fatPct}%</b> of calories</span>
        <input type="range" min="15" max="45" step="1" value="${s.program.fatPct}" data-act="fat"/>
      </label>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Your daily targets</h2></div>
      <div class="targets">
        <div class="tgt"><div class="tnum">${t.kcal}</div><div class="tlbl">kcal</div></div>
        <div class="tgt"><div class="tnum" style="color:var(--protein)">${t.protein}</div><div class="tlbl">protein g</div></div>
        <div class="tgt"><div class="tnum" style="color:var(--carb)">${t.carbs}</div><div class="tlbl">carbs g</div></div>
        <div class="tgt"><div class="tnum" style="color:var(--fat)">${t.fat}</div><div class="tlbl">fat g</div></div>
      </div>
      <div class="explain">Target = expenditure (${t.tdee} kcal) ${t.kcal - t.tdee >= 0 ? '+' : '−'} ${Math.abs(t.kcal - t.tdee)} kcal for your goal. Protein anchored to ${t.weightKg} kg trend weight.</div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Profile</h2></div>
      <div class="grid2">
        <label class="field"><span>Sex</span>
          <select data-act="sex"><option value="male" ${s.profile.sex==='male'?'selected':''}>Male</option><option value="female" ${s.profile.sex==='female'?'selected':''}>Female</option></select></label>
        <label class="field"><span>Age</span><input type="number" value="${s.profile.age}" data-act="age" inputmode="numeric"/></label>
        <label class="field"><span>Height (cm)</span><input type="number" value="${s.profile.heightCm}" data-act="height" inputmode="numeric"/></label>
        <label class="field"><span>Activity baseline (kcal/day)</span><input type="number" value="${s.program.activityKcalPerDay}" data-act="activity" inputmode="numeric"/></label>
      </div>
      <div class="explain">Activity baseline was seeded from 4 months of Strava (${s.strava.totals.avgKcalPerCalendarDay} kcal/day avg). It only affects the estimate until the adaptive engine takes over.</div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Data & backup</h2></div>
      <div class="chips">
        <button class="chip" data-act="export">⬇ Export JSON</button>
        <button class="chip" data-act="import">⬆ Import JSON</button>
        <button class="chip danger" data-act="reset">Reset all</button>
      </div>
      <div class="explain">Data is stored only on this device. Export regularly to back up. <span id="iomsg"></span></div>
    </div>

    <div class="card about">
      <div class="cardhead"><h2>About</h2></div>
      <p>An adaptive macro tracker for body recomposition, in the spirit of MacroFactor. Expenditure is learned from the relationship between your calorie intake and your smoothed weight trend — no static formulas once it has data.</p>
      <p class="hint">Activity data seeded from Strava. Educational tool, not medical advice.</p>
    </div>
  </section>`;
}

const goalLabel = (g) => ({ recomp: 'Recomp', cut: 'Cut', maintain: 'Maintain', bulk: 'Lean bulk' }[g]);

// =========================================================================
// Onboarding
// =========================================================================
function onboarding() {
  const s = store.get();
  return `<div class="modal-wrap"><div class="modal onb">
    <h2>Welcome, ${esc(s.profile.name.split(' ')[0])} 👋</h2>
    <p class="hint">Set a few basics. Everything is editable later in Program.</p>
    <div class="grid2">
      <label class="field"><span>Sex</span><select id="o-sex"><option value="male" ${s.profile.sex==='male'?'selected':''}>Male</option><option value="female">Female</option></select></label>
      <label class="field"><span>Age</span><input id="o-age" type="number" value="${s.profile.age}" inputmode="numeric"/></label>
      <label class="field"><span>Height (cm)</span><input id="o-height" type="number" value="${s.profile.heightCm}" inputmode="numeric"/></label>
      <label class="field"><span>Current weight (kg)</span><input id="o-weight" type="number" step="0.1" value="${s.profile.initialWeightKg}" inputmode="decimal"/></label>
    </div>
    <div class="field"><span>Goal</span>
      <div class="chips" id="o-goals">${['recomp','cut','maintain','bulk'].map((g)=>`<button type="button" class="chip ${g==='recomp'?'on':''}" data-g="${g}">${goalLabel(g)}</button>`).join('')}</div>
    </div>
    <button class="primary block" data-act="finish-onb">Start tracking</button>
  </div></div>`;
}

// =========================================================================
// Add-food modal
// =========================================================================
function foodModal() {
  const s = store.get();
  const lib = s.foodsLibrary;
  return `<div class="modal-wrap"><div class="modal">
    <div class="cardhead"><h2>Add food</h2><button class="ghost" data-act="close-modal">✕</button></div>
    ${lib.length ? `<div class="field"><span>From your foods</span>
      <div class="libgrid">${lib.map((f)=>`<button class="libitem" data-act="pick-lib" data-id="${f.id}"><b>${esc(f.name)}</b><small>${f.kcal} kcal · P${f.p} C${f.c} F${f.f}</small></button>`).join('')}</div></div>` : ''}
    <div class="field"><span>Description</span><input id="f-name" placeholder="e.g. Chicken rice bowl" autocomplete="off"/></div>
    <div class="grid2">
      <label class="field"><span>Calories</span><input id="f-kcal" type="number" inputmode="numeric"/></label>
      <label class="field"><span>Servings</span><input id="f-qty" type="number" step="0.25" value="1" inputmode="decimal"/></label>
      <label class="field"><span>Protein (g)</span><input id="f-p" type="number" inputmode="numeric"/></label>
      <label class="field"><span>Carbs (g)</span><input id="f-c" type="number" inputmode="numeric"/></label>
      <label class="field"><span>Fat (g)</span><input id="f-f" type="number" inputmode="numeric"/></label>
      <label class="field checkline"><input type="checkbox" id="f-save"/><span>Save to my foods</span></label>
    </div>
    <div class="hint" id="f-auto"></div>
    <button class="primary block" data-act="save-food">Add to log</button>
  </div></div>`;
}

// =========================================================================
// Render + mount
// =========================================================================
export function render() {
  const s = store.get();
  const app = $('#app');
  if (!s.onboarded) { app.innerHTML = onboarding(); wireOnboarding(); return; }
  const views = { today, weight, trends, program };
  app.innerHTML = (views[view] || today)();
  $$tabs();
}

function $$tabs() {
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('on', el.dataset.v === view));
}

// ---- event delegation ----
function handleClick(e) {
  const btn = e.target.closest('[data-act]');
  const tab = e.target.closest('.tab');
  if (tab) { view = tab.dataset.v; if (view === 'today') currentDate = M.todayISO(); location.hash = view; render(); return; }
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === 'date') { currentDate = M.addDays(currentDate, num(btn.dataset.d)); if (currentDate > M.todayISO()) currentDate = M.todayISO(); render(); }
  else if (act === 'add-food') openModal(foodModal, wireFoodModal);
  else if (act === 'close-modal') closeModal();
  else if (act === 'del-food') { store.update((st) => { st.food[currentDate] = (st.food[currentDate] || []).filter((x) => x.id !== btn.dataset.id); }); render(); }
  else if (act === 'log-weight') logWeight();
  else if (act === 'del-weight') { store.update((st) => { st.weights = st.weights.filter((w) => w.date !== btn.dataset.id); }); render(); }
  else if (act === 'goal') setGoal(btn.dataset.g);
  else if (act === 'export') doExport();
  else if (act === 'import') doImport();
  else if (act === 'reset') { if (confirm('Erase all data on this device and start over?')) { store.resetAll(); view = 'today'; render(); } }
  else if (act === 'finish-onb') finishOnboarding();
  else if (act === 'pick-lib') pickLib(btn.dataset.id);
  else if (act === 'save-food') saveFood();
}

function handleInput(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const map = {
    rate: (st, v) => (st.program.ratePctPerWeek = num(v)),
    protein: (st, v) => (st.program.proteinPerKg = num(v)),
    fat: (st, v) => (st.program.fatPct = num(v)),
    sex: (st, v) => (st.profile.sex = v),
    age: (st, v) => (st.profile.age = num(v, 30)),
    height: (st, v) => (st.profile.heightCm = num(v, 170)),
    activity: (st, v) => (st.program.activityKcalPerDay = num(v)),
  };
  if (map[act]) {
    store.update((st) => map[act](st, el.value));
    if (['rate', 'protein', 'fat'].includes(act)) render(); // live target refresh
  }
}

// ---- actions ----
function setGoal(g) {
  const presets = {
    recomp: { ratePctPerWeek: -0.25, proteinPerKg: 2.0, fatPct: 27 },
    cut: { ratePctPerWeek: -0.6, proteinPerKg: 2.2, fatPct: 25 },
    maintain: { ratePctPerWeek: 0, proteinPerKg: 1.8, fatPct: 30 },
    bulk: { ratePctPerWeek: 0.25, proteinPerKg: 1.8, fatPct: 25 },
  };
  store.update((st) => { st.program.goal = g; Object.assign(st.program, presets[g]); });
  render();
}

function logWeight() {
  const kg = num($('#wkg').value);
  const date = $('#wdate').value || M.todayISO();
  if (kg <= 0) return;
  store.update((st) => {
    st.weights = st.weights.filter((w) => w.date !== date);
    st.weights.push({ date, kg: Math.round(kg * 10) / 10 });
  });
  render();
}

function saveFood() {
  const name = $('#f-name').value.trim() || 'Food';
  const entry = {
    id: store.uid(), name,
    kcal: num($('#f-kcal').value), p: num($('#f-p').value),
    c: num($('#f-c').value), f: num($('#f-f').value),
    qty: num($('#f-qty').value, 1),
  };
  const saveLib = $('#f-save').checked;
  store.update((st) => {
    (st.food[currentDate] ||= []).push(entry);
    if (saveLib) st.foodsLibrary.unshift({ id: store.uid(), name, kcal: entry.kcal, p: entry.p, c: entry.c, f: entry.f });
  });
  closeModal(); render();
}

function pickLib(id) {
  const f = store.get().foodsLibrary.find((x) => x.id === id);
  if (!f) return;
  $('#f-name').value = f.name; $('#f-kcal').value = f.kcal;
  $('#f-p').value = f.p; $('#f-c').value = f.c; $('#f-f').value = f.f;
}

function finishOnboarding() {
  const sex = $('#o-sex').value, age = num($('#o-age').value, 30);
  const h = num($('#o-height').value, 170), w = num($('#o-weight').value, 80);
  const g = $('#o-goals .chip.on')?.dataset.g || 'recomp';
  store.update((st) => {
    st.profile.sex = sex; st.profile.age = age; st.profile.heightCm = h; st.profile.initialWeightKg = w;
    st.weights = st.weights.length ? st.weights : [{ date: M.todayISO(), kg: Math.round(w * 10) / 10 }];
    st.onboarded = true;
  });
  setGoal(g);
}

function doExport() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `macrotrack-backup-${M.todayISO()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
function doImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json';
  inp.onchange = () => {
    const file = inp.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { store.importJSON(r.result); view = 'today'; render(); } catch { alert('Invalid backup file.'); } };
    r.readAsText(file);
  };
  inp.click();
}

// ---- modal plumbing ----
function openModal(builder, wire) {
  const host = $('#modal-host');
  host.innerHTML = builder();
  host.querySelector('.modal-wrap').addEventListener('click', (e) => { if (e.target.classList.contains('modal-wrap')) closeModal(); });
  wire && wire();
}
function closeModal() { $('#modal-host').innerHTML = ''; }

function wireFoodModal() {
  // Auto-calc calories from macros if calories left blank.
  const recalc = () => {
    const p = num($('#f-p').value), c = num($('#f-c').value), f = num($('#f-f').value);
    const est = Math.round(p * 4 + c * 4 + f * 9);
    $('#f-auto').textContent = est ? `≈ ${est} kcal from macros` : '';
    if (!$('#f-kcal').value && est) $('#f-kcal').placeholder = String(est);
  };
  ['f-p', 'f-c', 'f-f'].forEach((id) => $('#' + id).addEventListener('input', recalc));
}

function wireOnboarding() {
  $('#app').addEventListener('click', (e) => {
    const chip = e.target.closest('#o-goals .chip');
    if (chip) { $('#o-goals').querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); chip.classList.add('on'); }
  });
}

export function init() {
  store.load();
  document.body.addEventListener('click', handleClick);
  document.body.addEventListener('input', handleInput);
  window.addEventListener('hashchange', () => { view = (location.hash || '#today').slice(1); render(); });
  render();
}
