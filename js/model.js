/*
 * 일별 원자료(js/channel-data.js)를 일·주·월 기간으로 묶고 값과 변화율을 계산한다.
 * - 주는 월~일, 월은 달력 월. merge_channel_data.py의 주간·월간 CSV와 같은 정의다.
 * - 변화율(%) = (이번 - 이전) / 이전 * 100, 소수 첫째 자리 반올림(5는 올림), 이전 값이 0이면 없음.
 *   정수 연산으로 계산하므로 CSV 값과 자릿수까지 같다.
 * - 진행 중인 기간의 값은 그날까지의 누계이고, 직전 기간의 같은 경과 일수와 비교한다.
 *   기간의 마지막 날에는 직전 기간 전체와 비교하므로 CSV 값과 같아진다.
 * - 구독자는 누적값의 캔들이다. 시가 = 직전 기간 종가, 종가 = 그날 누적, 고가·저가 = 기간 중 최고·최저.
 */
(function (root) {
  "use strict";

  const DAY_MS = 86400000;
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function prefixSums(values) {
    const out = new Float64Array(values.length + 1);
    for (let i = 0; i < values.length; i++) out[i + 1] = out[i] + values[i];
    return out;
  }

  /** (cur - prev) / prev * 100 을 0.1% 단위 정수로 (57 → 5.7%). 비교할 수 없으면 null. */
  function rateTenths(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    const n = (cur - prev) * 1000;
    const q = Math.floor((2 * Math.abs(n) + prev) / (2 * prev));
    return n < 0 ? -q : q;
  }

  function createModel(raw) {
    const n = raw.subs.length;
    const [y0, m0, d0] = raw.start.split("-").map(Number);
    const t0 = Date.UTC(y0, m0 - 1, d0);

    function dateOf(i) {
      const dt = new Date(t0 + i * DAY_MS);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
    }
    const calendar = Array.from({ length: n }, (_, i) => dateOf(i));
    const cal = (i) => (i >= 0 && i < n ? calendar[i] : dateOf(i));
    const indexOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - t0) / DAY_MS);

    const cum = new Array(n);
    for (let i = 0, c = 0; i < n; i++) cum[i] = c += raw.subs[i];
    const sums = { valid: prefixSums(raw.valid), views: prefixSums(raw.views), hours: prefixSums(raw.hoursE4) };
    const total = (key, a, b) => sums[key][b + 1] - sums[key][a];
    /** 평균 시청 지속 시간(초) = 시청 시간 / 유효 조회수, 초 단위 버림. hoursE4 기준이라 3600/10000 = 36/100. */
    const averageOf = (a, b) => {
      const valid = total("valid", a, b);
      return valid ? Math.floor((total("hours", a, b) * 36) / (100 * valid)) : null;
    };

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
      p.first = new Array(p.count); // 기간 k에 속한 첫 데이터 일자
      p.last = new Array(p.count); //  기간 k에 속한 마지막 데이터 일자
      for (let i = 0; i < n; i++) {
        const k = p.of(i);
        if (p.first[k] === undefined) p.first[k] = i;
        p.last[k] = i;
      }
      return p;
    }

    /** 기간 k의 구독자 캔들, d일까지. */
    function candle(per, k, d) {
      const a = per.first[k];
      const b = Math.min(per.last[k], d);
      const open = a > 0 ? cum[a - 1] : 0;
      let high = open;
      let low = open;
      for (let i = a; i <= b; i++) {
        if (cum[i] > high) high = cum[i];
        if (cum[i] < low) low = cum[i];
      }
      return { open, high, low, close: cum[b] };
    }

    /** 기간 k의 d일까지 값. subs: 누적 구독자, avg: 초(없으면 null), hours: 시간 x 10000. */
    function value(metric, per, k, d) {
      const a = per.first[k];
      const b = Math.min(per.last[k], d);
      if (metric === "subs") return cum[b];
      if (metric === "avg") return per.kind === "day" ? raw.avgSec[a] : averageOf(a, b);
      return total(metric, a, b);
    }

    /** 비교 구간: 진행 중이면 직전 기간의 같은 경과 일수, 기간 마지막 날이면 직전 기간 전체. */
    function previousRange(per, k, d) {
      const a = per.first[k - 1];
      const b = per.last[k - 1];
      return d >= per.last[k] ? [a, b] : [a, Math.min(b, a + (d - per.first[k]))];
    }

    /** 헤더·툴팁에 쓰는 기간 k의 d일 기준 요약. */
    function snapshot(metric, per, k, d) {
      const done = d >= per.last[k];
      const current = value(metric, per, k, d);
      let previous = null;
      let bar = null;
      if (metric === "subs") {
        bar = candle(per, k, d);
        previous = per.first[k] > 0 ? bar.open : null;
      } else if (k > 0) {
        if (metric === "avg" && per.kind === "day") {
          previous = raw.avgSec[per.first[k - 1]];
        } else {
          const [a, b] = previousRange(per, k, d);
          previous = metric === "avg" ? averageOf(a, b) : total(metric, a, b);
        }
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
    signed: (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toLocaleString(locale),
    /** 시간 x 10000 → 시간. 10시간 미만은 소수 둘째 자리까지. */
    hours(e4) {
      const h = e4 / 10000;
      const digits = h < 10 ? 2 : 1;
      return h.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },
    duration(sec) {
      if (sec == null) return "—";
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = String(sec % 60).padStart(2, "0");
      return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
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
