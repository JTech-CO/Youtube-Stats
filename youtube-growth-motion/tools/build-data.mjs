#!/usr/bin/env node
/**
 * dataset/채널데이터_전체기간_병합.csv → js/data.js
 * Every number shown on screen is derived here from the daily CSV, so the scenes never
 * hard-code a value. Run again whenever the dataset changes:
 *
 *   node tools/build-data.mjs            # writes js/data.js and prints a summary
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'dataset', '채널데이터_전체기간_병합.csv');
const OUT = path.join(ROOT, 'js', 'data.js');

// ---------- read ----------
const text = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const head = lines[0].split(',');
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column not found: ${name}`);
  return i;
};
const C = {
  date: col('날짜'),
  net: col('구독자'),
  cum: col('누적 구독자'),
  valid: col('유효 조회수'),
  views: col('조회수'),
  hours: col('시청 시간(단위: 시간)'),
};

/** "150.8201" → 1508201 (hours × 10^4, exact integer) */
const e4 = (s) => {
  if (!s) return 0;
  const [a, b = ''] = s.split('.');
  if (b.length > 4) throw new Error(`more than 4 decimals: ${s}`);
  return Number(a) * 10000 + Number((b + '0000').slice(0, 4));
};

const rows = lines.slice(1).map((l) => {
  const c = l.split(',');
  return {
    date: c[C.date],
    net: Number(c[C.net]),
    cum: Number(c[C.cum]),
    valid: Number(c[C.valid]),
    views: Number(c[C.views]),
    hE4: e4(c[C.hours]),
  };
});

// ---------- date helpers (UTC, no DST) ----------
const DAY = 86400000;
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const T0 = ms(rows[0].date);
rows.forEach((r, i) => {
  if (ms(r.date) !== T0 + i * DAY) throw new Error(`date gap at ${r.date}`);
  const prev = i ? rows[i - 1].cum : 0;
  if (r.cum !== prev + r.net) throw new Error(`cumulative mismatch at ${r.date}`);
});
const N = rows.length;
const idx = (d) => (ms(d) - T0) / DAY;
const at = (d) => rows[idx(d)];
const dayBefore = (d) => iso(ms(d) - DAY);
const firstAtLeast = (v) => rows.findIndex((r) => r.cum >= v);
const sum = (a, b, f) => {
  let s = 0;
  for (let i = idx(a); i <= idx(b); i++) s += f(rows[i]);
  return s;
};
const lastOfMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return iso(Date.UTC(y, m, 0));
};
const fmtHours = (hE4) => {
  const s = String(hE4).padStart(5, '0');
  return `${s.slice(0, -4)}.${s.slice(-4)}`.replace(/\.?0+$/, '');
};
/** avg view duration for a range, as the CSV computes it: floor(hours × 3600 / engaged views) */
const avgDur = (hE4, valid) => {
  const sec = Math.floor((hE4 * 3600) / 10000 / valid);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const last = rows[N - 1];
const milestone = (v) => {
  const i = firstAtLeast(v);
  return { value: v, date: rows[i].date, day: i };
};

// ---------- 02 seed: first subscribers up to 60 ----------
const seed = [1, 10, 50, 60].map(milestone);

// ---------- 03 plateau: stuck in a narrow band after reaching 60 ----------
// Rule: band = [lowest, highest] count between the first day at 60 and the summer 2023 run
// (2023-07-01); the plateau lasts until the first day the count leaves the band upward.
const p0 = firstAtLeast(60);
const bandEnd = idx('2023-07-01');
let lo = Infinity;
let hi = -Infinity;
for (let i = p0; i < bandEnd; i++) {
  lo = Math.min(lo, rows[i].cum);
  hi = Math.max(hi, rows[i].cum);
}
const p1 = rows.findIndex((r, i) => i >= p0 && r.cum > hi) - 1; // last day inside the band
const plateau = {
  from: rows[p0].date,
  to: rows[p1].date,
  days: p1 - p0 + 1,
  min: lo,
  max: hi,
  exitDate: rows[p1 + 1].date,
  views2021: sum('2021-01-01', '2021-12-31', (r) => r.views),
  net2022: sum('2022-01-01', '2022-12-31', (r) => r.net),
  zeroViewDaysInBand: rows.slice(p0, p1 + 1).filter((r) => r.views === 0).length,
};

// ---------- 04 burst: summer 2023 ----------
const burst = {
  from: '2023-07-01',
  to: '2023-09-30',
  startCum: at(dayBefore('2023-07-01')).cum,
  endCum: at('2023-09-30').cum,
  days: idx('2023-09-30') - idx('2023-07-01') + 1,
};
burst.net = burst.endCum - burst.startCum;
burst.pctTenths = Math.round((burst.net / burst.startCum) * 1000);
burst.daily = rows.slice(idx(burst.from), idx(burst.to) + 1).map((r) => r.cum);

// ---------- 05 watch time: August 2023 ----------
const W_FROM = '2023-08-01';
const W_TO = '2023-08-31';
const wDaily = rows.slice(idx(W_FROM), idx(W_TO) + 1).map((r) => r.hE4);
const wBest = rows.slice(idx(W_FROM), idx(W_TO) + 1).reduce((a, r) => (r.hE4 > a.hE4 ? r : a));
const wTotal = wDaily.reduce((a, b) => a + b, 0);
const watch = {
  month: '2023-08',
  hoursE4: wTotal,
  hours: fmtHours(wTotal),
  dailyE4: wDaily,
  best: { date: wBest.date, hours: fmtHours(wBest.hE4) },
  valid: sum(W_FROM, W_TO, (r) => r.valid),
};
watch.avgDuration = avgDur(wTotal, watch.valid);

// ---------- 06 steady: 2024–2025 month by month ----------
const months = [];
for (let y = 2024; y <= 2025; y++) {
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    months.push({ ym, net: sum(`${ym}-01`, lastOfMonth(ym), (r) => r.net) });
  }
}
const steady = {
  from: '2024-01-01',
  to: '2025-12-31',
  startCum: at('2023-12-31').cum,
  endCum: at('2025-12-31').cum,
  months,
};

// ---------- 07 spike: daily views around the single biggest day ----------
const peak = rows.reduce((a, r) => (r.views > a.views ? r : a));
const S_FROM = '2025-06-01';
const S_TO = '2025-07-31';
const spike = {
  from: S_FROM,
  to: S_TO,
  views: rows.slice(idx(S_FROM), idx(S_TO) + 1).map((r) => r.views),
  peak: { date: peak.date, views: peak.views, valid: peak.valid },
  medianBefore: (() => {
    const v = rows.slice(idx(S_FROM), idx(peak.date)).map((r) => r.views).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  })(),
};

// ---------- 08 wave: weekly candles for 2026 (Mon–Sun; the first one is Jan 1–4) ----------
const weeks = [];
const Y0 = ms('2026-01-01');
const firstMonday = Y0 + ((8 - new Date(Y0).getUTCDay()) % 7) * DAY;
for (let t = Y0; t <= ms(last.date); t = t === Y0 ? firstMonday : t + 7 * DAY) {
  const a = iso(t);
  const b = iso(Math.min((t === Y0 ? firstMonday : t + 7 * DAY) - DAY, ms(last.date)));
  const open = at(dayBefore(a)).cum;
  let h = open;
  let l = open;
  for (let i = idx(a); i <= idx(b); i++) {
    h = Math.max(h, rows[i].cum);
    l = Math.min(l, rows[i].cum);
  }
  weeks.push({ start: a, open, close: at(b).cum, high: h, low: l });
}
const wave = {
  from: '2026-01-01',
  startCum: at('2025-12-31').cum,
  endCum: last.cum,
  weeks,
};
wave.pctTenths = Math.round(((wave.endCum - wave.startCum) / wave.startCum) * 1000);

// ---------- 09 race: days per 1,000 ----------
const race = [];
let prevDay = 0;
let prevDate = rows[0].date;
for (const v of [1000, 2000, 3000]) {
  const m = milestone(v);
  race.push({ to: v, fromDate: prevDate, date: m.date, days: m.day - prevDay });
  prevDay = m.day;
  prevDate = m.date;
}
const r1000 = milestone(1000);
const r3000 = milestone(3000);
const raceMeta = {
  daysTo1000: r1000.day,
  yearsTo1000: (() => {
    // whole years + months from channel start to the 1,000th subscriber
    const a = new Date(T0);
    const b = new Date(ms(r1000.date));
    let mo = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) mo--;
    return { years: Math.floor(mo / 12), months: mo % 12 };
  })(),
  days1000to3000: r3000.day - r1000.day,
};

// ---------- 10 best days ----------
const best = [...rows]
  .sort((a, b) => b.net - a.net || (a.date < b.date ? -1 : 1))
  .slice(0, 5)
  .map((r) => ({ date: r.date, net: r.net, cum: r.cum }));
const bestMonth = (() => {
  let top = null;
  for (let t = ms('2017-11-01'); t <= ms(last.date); ) {
    const d = new Date(t);
    const ym = iso(t).slice(0, 7);
    const a = ym === '2017-11' ? rows[0].date : `${ym}-01`;
    const b = lastOfMonth(ym) > last.date ? last.date : lastOfMonth(ym);
    const net = sum(a, b, (r) => r.net);
    if (!top || net > top.net) top = { ym, net };
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return top;
})();

// ---------- totals ----------
const hoursTotalE4 = rows.reduce((a, r) => a + r.hE4, 0);
const totals = {
  days: N,
  views: rows.reduce((a, r) => a + r.views, 0),
  valid: rows.reduce((a, r) => a + r.valid, 0),
  hours: fmtHours(hoursTotalE4),
  hoursInt: Math.round(hoursTotalE4 / 10000),
  zeroViewDays: rows.filter((r) => r.views === 0).length,
  subs: last.cum,
};

// ---------- year-end values (01 rewind + 12 labels) ----------
const yearEnds = [];
for (let y = 2017; y <= 2025; y++) yearEnds.push({ year: y, cum: at(`${y}-12-31`).cum });

const DATA = {
  source: 'dataset/채널데이터_전체기간_병합.csv',
  start: rows[0].date,
  asOf: last.date,
  days: N,
  cum: rows.map((r) => r.cum),
  yearEnds,
  seed,
  plateau,
  burst,
  watch,
  steady,
  spike,
  wave,
  race,
  raceMeta,
  best,
  bestMonth,
  totals,
};

const banner = `/* GENERATED by tools/build-data.mjs from ${DATA.source}. Do not edit by hand:
   change the dataset and run \`node tools/build-data.mjs\`. Scenes read numbers only from here. */\n`;
const body = Object.entries(DATA)
  .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
  .join(',\n');
fs.writeFileSync(OUT, `${banner}(function (SX) {\n  'use strict';\n  SX.DATA = {\n${body},\n  };\n})((window.SX = window.SX || {}));\n`);

// ---------- summary ----------
const show = { ...DATA };
delete show.cum;
show.burst = { ...burst, daily: `[${burst.daily.length}]` };
show.watch = { ...watch, dailyE4: `[${watch.dailyE4.length}]` };
show.spike = { ...spike, views: `[${spike.views.length}]` };
show.wave = { ...wave, weeks: `[${weeks.length}] first ${JSON.stringify(weeks[0])} last ${JSON.stringify(weeks[weeks.length - 1])}` };
show.steady = { ...steady, months: months.map((m) => `${m.ym}:${m.net}`).join(' ') };
console.log(JSON.stringify(show, null, 1));
console.log(`→ ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
