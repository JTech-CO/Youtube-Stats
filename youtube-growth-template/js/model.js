/*
 * 데이터셋(js/ingest.js)을 일·주·월 기간으로 묶고 지표마다 값과 변화율을 계산한다.
 * - 주는 월~일, 월은 달력 월.
 * - 그래프 형태별 기간 값
 *   candle: 누적값의 캔들. 일별 증감이면 날마다 더하고(시작값 포함), 누적 열이면 그대로 쓴다.
 *           시가 = 직전 기간 종가, 종가 = 그날 누적, 고가·저가 = 기간 중 최고·최저.
 *   bar:    기간 합계 (빈 날은 0).
 *   line:   기간 평균. 가중치 열(조회수·노출수)이 있으면 가중 평균. 평균 시청 지속 시간은
 *           시청 시간과 조회수가 있으면 '시청 시간 / 조회수'(초 단위 버림)로 다시 계산한다.
 * - 변화율(%) = (이번 - 이전) / 이전 * 100, 소수 첫째 자리 반올림(5는 올림), 이전 값이 0이면 없음.
 * - 진행 중인 기간은 그날까지의 값이고, 직전 기간의 같은 경과 일수와 비교한다.
 *   기간의 마지막 날에는 직전 기간 전체와 비교한다.
 */
(function (root) {
  "use strict";

  const DAY_MS = 86400000;
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function prefixSums(n, valueAt) {
    const out = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) out[i + 1] = out[i] + valueAt(i);
    return out;
  }

  /** (cur - prev) / |prev| * 100 을 0.1% 단위 정수로 (57 → 5.7%). 정수끼리는 정확히 계산한다. */
  function rateTenths(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    if (Number.isInteger(cur) && Number.isInteger(prev) && prev > 0) {
      const n = (cur - prev) * 1000;
      const q = Math.floor((2 * Math.abs(n) + prev) / (2 * prev));
      return n < 0 ? -q : q;
    }
    const x = ((cur - prev) / Math.abs(prev)) * 1000;
    const q = Math.floor(Math.abs(x) + 0.5 + 1e-9);
    return x < 0 ? -q : q;
  }

  /**
   * metrics: [{ id, kind, role, column, weight (열|null), derive ({hours, views}|null), startLevel (표시 단위) }]
   */
  function createModel(dataset, metrics) {
    const n = dataset.n;
    const [y0, m0, d0] = dataset.start.split("-").map(Number);
    const t0 = Date.UTC(y0, m0 - 1, d0);

    function dateOf(i) {
      const dt = new Date(t0 + i * DAY_MS);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
    }
    const calendar = Array.from({ length: n }, (_, i) => dateOf(i));
    const cal = (i) => (i >= 0 && i < n ? calendar[i] : dateOf(i));
    const indexOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - t0) / DAY_MS);
    const mondayOffset = (calendar[0].wd + 6) % 7; // 첫날의 요일, 월=0 … 일=6

    /** 기간 좌표: 기간 k는 [k, k+1) 구간. 데이터 범위 밖 날짜에도 계산된다(축 눈금용). */
    function periods(kind) {
      const p = { kind };
      if (kind === "day") {
        p.of = (i) => i;
        p.startDay = (k) => k;
        p.length = () => 1;
      } else if (kind === "week") {
        p.of = (i) => Math.floor((i + mondayOffset) / 7);
        p.startDay = (k) => k * 7 - mondayOffset;
        p.length = () => 7;
      } else {
        p.of = (i) => {
          const c = cal(i);
          return (c.y - y0) * 12 + (c.m - m0);
        };
        p.startDay = (k) => {
          const mm = m0 - 1 + k;
          return indexOf(y0 + Math.floor(mm / 12), (((mm % 12) + 12) % 12) + 1, 1);
        };
        p.length = (k) => {
          const c = cal(p.startDay(k));
          return daysInMonth(c.y, c.m);
        };
      }
      p.pos = (i) => {
        const k = p.of(i);
        return k + (i - p.startDay(k)) / p.length(k);
      };
      p.dayAt = (x) => {
        const k = Math.floor(x);
        return p.startDay(k) + Math.floor((x - k) * p.length(k));
      };
      p.count = p.of(n - 1) + 1;
      p.first = new Array(p.count);
      p.last = new Array(p.count);
      for (let i = 0; i < n; i++) {
        const k = p.of(i);
        if (p.first[k] === undefined) p.first[k] = i;
        p.last[k] = i;
      }
      return p;
    }

    const range = (sums, a, b) => sums[b + 1] - sums[a];
    const prepared = new Map();
    for (const m of metrics) {
      const v = m.column.values;
      const p = { kind: m.kind };
      if (m.kind === "candle") {
        p.level = new Array(n);
        if (m.role === "level") {
          let last = v.find((x) => x != null) ?? 0; // 첫 값 이전 날은 첫 값으로
          for (let i = 0; i < n; i++) p.level[i] = last = v[i] ?? last;
          p.base = p.level[0];
        } else {
          p.base = Math.round((m.startLevel || 0) * m.column.scale);
          for (let i = 0, c = p.base; i < n; i++) p.level[i] = c += v[i] ?? 0;
        }
      } else if (m.kind === "bar") {
        p.sum = prefixSums(n, (i) => v[i] ?? 0);
      } else {
        const w = m.weight ? m.weight.values : null;
        const weighted = (i) => v[i] != null && w && w[i] != null && w[i] > 0;
        p.raw = v;
        p.vw = prefixSums(n, (i) => (weighted(i) ? v[i] * w[i] : 0));
        p.w = prefixSums(n, (i) => (weighted(i) ? w[i] : 0));
        p.vs = prefixSums(n, (i) => v[i] ?? 0);
        p.count = prefixSums(n, (i) => (v[i] != null ? 1 : 0));
        if (m.derive) {
          p.hours = prefixSums(n, (i) => m.derive.hours.values[i] ?? 0);
          p.views = prefixSums(n, (i) => m.derive.views.values[i] ?? 0);
          p.hoursScale = m.derive.hours.scale;
        }
      }
      prepared.set(m.id, p);
    }

    /** 선 그래프의 기간 평균. 일 간격에서는 원본 값을 그대로 쓴다. */
    function average(p, a, b, singleDay) {
      if (p.hours && !(singleDay && p.raw[a] != null)) {
        const views = range(p.views, a, b);
        if (views > 0) return Math.floor((range(p.hours, a, b) * 3600) / (p.hoursScale * views));
      }
      const w = range(p.w, a, b);
      if (w > 0) return range(p.vw, a, b) / w;
      const c = range(p.count, a, b);
      return c > 0 ? range(p.vs, a, b) / c : null;
    }

    function candle(metric, per, k, d) {
      const p = prepared.get(metric.id);
      const a = per.first[k];
      const b = Math.min(per.last[k], d);
      const open = a > 0 ? p.level[a - 1] : p.base;
      let high = open;
      let low = open;
      for (let i = a; i <= b; i++) {
        if (p.level[i] > high) high = p.level[i];
        if (p.level[i] < low) low = p.level[i];
      }
      return { open, high, low, close: p.level[b] };
    }

    /** 기간 k의 d일까지 값 (열의 저장 단위: 소수 자릿수만큼 10^n 배, 시간 형식은 초). */
    function value(metric, per, k, d) {
      const p = prepared.get(metric.id);
      const a = per.first[k];
      const b = Math.min(per.last[k], d);
      if (p.kind === "candle") return p.level[b];
      if (p.kind === "bar") return range(p.sum, a, b);
      return average(p, a, b, per.kind === "day");
    }

    /** 비교 구간: 진행 중이면 직전 기간의 같은 경과 일수, 기간 마지막 날이면 직전 기간 전체. */
    function previousRange(per, k, d) {
      const a = per.first[k - 1];
      const b = per.last[k - 1];
      return d >= per.last[k] ? [a, b] : [a, Math.min(b, a + (d - per.first[k]))];
    }

    /** 헤더·툴팁에 쓰는 기간 k의 d일 기준 요약. */
    function snapshot(metric, per, k, d) {
      const p = prepared.get(metric.id);
      const done = d >= per.last[k];
      const current = value(metric, per, k, d);
      let previous = null;
      let bar = null;
      if (p.kind === "candle") {
        bar = candle(metric, per, k, d);
        previous = bar.open;
      } else if (k > 0) {
        const [a, b] = previousRange(per, k, d);
        previous = p.kind === "bar" ? range(p.sum, a, b) : average(p, a, b, per.kind === "day");
      }
      return { value: current, previous, rate: rateTenths(current, previous), done, candle: bar };
    }

    return {
      n,
      cal,
      indexOf,
      weekday: (i) => WEEKDAY[cal(i).wd],
      periods: { day: periods("day"), week: periods("week"), month: periods("month") },
      candle,
      value,
      snapshot,
    };
  }

  const locale = "ko-KR";
  const format = {
    int: (v) => Math.round(v).toLocaleString(locale),
    fixed: (v, digits) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    signed: (v, text) => (v > 0 ? "+" : v < 0 ? "−" : "±") + text(Math.abs(v)),
    duration(sec) {
      if (sec == null) return "—";
      const neg = sec < 0;
      const s = Math.round(Math.abs(sec));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = String(s % 60).padStart(2, "0");
      return (neg ? "−" : "") + (h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`);
    },
    /** 0.1% 단위 정수 → 표시 문자열과 방향. 색만으로 구분하지 않도록 ▲▼를 붙인다. */
    rate(tenths) {
      if (tenths == null) return { text: "—", dir: "none" };
      const abs = (Math.abs(tenths) / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      if (tenths > 0) return { text: `▲ ${abs}%`, dir: "up" };
      if (tenths < 0) return { text: `▼ ${abs}%`, dir: "down" };
      return { text: `${abs}%`, dir: "flat" };
    },
    pad2: (v) => String(v).padStart(2, "0"),
  };

  root.Growth = Object.assign(root.Growth || {}, { createModel, rateTenths, format });
})(typeof window !== "undefined" ? window : globalThis);
