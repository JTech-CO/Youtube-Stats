/* 패널 하나의 캔버스 그래프. app.js가 매 프레임 넘겨 주는 재생 상태로 다시 그린다. */
(function (root) {
  "use strict";

  const G = root.Growth;
  const EASE_SEC = 0.22; // y축 범위·축 너비가 새 목표를 따라가는 시간 상수(초)
  const BAR_MAX = 24;
  const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  const ROUND_RECT = typeof Path2D !== "undefined" && typeof Path2D.prototype.roundRect === "function";

  function niceStep(raw, integer) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 && !integer ? 2.5 : f <= 5 ? 5 : 10;
    return integer ? Math.max(1, m * p) : m * p;
  }

  function decimalsOf(step) {
    return Math.min(4, (String(+step.toPrecision(3)).split(".")[1] || "").length);
  }

  function rgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function alpha(hex, a) {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function lighten(hex, t) {
    const [r, g, b] = rgb(hex).map((c) => Math.round(c + (255 - c) * t));
    return `rgb(${r},${g},${b})`;
  }

  class Chart {
    /**
     * spec: 지표 설정 + { color, scale, axis: "int"|"decimal"|"percent"|"duration", tagText(v) }
     * theme: CSS 토큰 값 (app.js가 :root에서 읽음)
     */
    constructor(canvas, spec, theme) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.spec = spec;
      this.theme = theme;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.lo = null;
      this.hi = null;
      this.axisW = 52;
      this.geom = null;
    }

    resize(w, h) {
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      if (w === this.w && h === this.h && dpr === this.dpr) return false;
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      return true;
    }

    /** 캔버스 x좌표 → 기간 번호. 그래프 밖이거나 아직 오지 않은 기간이면 null. */
    periodAt(x) {
      const g = this.geom;
      if (!g || x < g.left || x > g.left + g.width) return null;
      const k = Math.floor(g.viewL + (x - g.left) / g.scale);
      return k >= 0 && k <= g.kNow ? k : null;
    }

    /**
     * f: { model, per, d, kNow, viewL, viewR, dt, snap, hoverK }
     * 반환값: y축 범위가 아직 움직이는 중이면 true (다음 프레임도 그려야 함)
     */
    render(f) {
      const { ctx, w, h, spec, theme } = this;
      if (w < 20 || h < 20) return false;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const compact = w < 240 || h < 120;
      const left = compact ? 6 : 12;
      const top = compact ? 6 : 12;
      const bottom = compact ? 6 : 26;
      const right = compact ? 6 : this.axisW;
      const pw = w - left - right;
      const ph = h - top - bottom;
      if (pw < 20 || ph < 16) return false;
      const scale = pw / (f.viewR - f.viewL);
      const X = (p) => left + (p - f.viewL) * scale;
      this.geom = { left, width: pw, viewL: f.viewL, scale, kNow: f.kNow };

      const k0 = Math.max(0, Math.floor(f.viewL));
      const k1 = Math.min(f.kNow, Math.ceil(f.viewR) - 1);
      const items = [];
      for (let k = k0; k <= k1; k++) items.push(this.datum(f, k));
      const current = items.length && items[items.length - 1].k === f.kNow ? items[items.length - 1] : null;

      const ease = f.snap ? 1 : 1 - Math.exp(-f.dt / EASE_SEC);
      const [tLo, tHi] = this.targetRange(items);
      let moving = false;
      if (this.lo === null) {
        this.lo = tLo;
        this.hi = tHi;
      } else {
        this.lo += (tLo - this.lo) * ease;
        this.hi += (tHi - this.hi) * ease;
        const eps = (tHi - tLo) * 0.001;
        if (Math.abs(tLo - this.lo) < eps && Math.abs(tHi - this.hi) < eps) {
          this.lo = tLo;
          this.hi = tHi;
        } else {
          moving = true;
        }
      }
      const { lo, hi } = this;
      const Y = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;
      const tagValue = current ? (spec.kind === "candle" ? current.c : current.v) : null;
      const tagY = tagValue == null ? null : Math.min(Math.max(Y(tagValue), top + 10), top + ph - 10);

      if (!compact) {
        moving = this.drawValueAxis(tagValue, tagY, lo, hi, left, pw, top, ph, Y, ease) || moving;
        this.drawTimeAxis(f, left, pw, top, ph, X);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, pw, ph);
      ctx.clip();
      if (f.hoverK != null && f.hoverK >= k0 && f.hoverK <= k1) {
        ctx.fillStyle = theme.hover;
        ctx.fillRect(X(f.hoverK), top, scale, ph);
      }
      if (spec.kind === "candle") this.drawCandles(items, X, Y, scale, current, left, pw);
      else if (spec.kind === "bar") this.drawBars(items, X, Y, scale, f, top);
      else this.drawLine(items, X, Y, f);
      ctx.restore();

      if (!compact && tagY != null) this.drawTag(current, tagValue, tagY, left + pw);
      return moving;
    }

    /** 기간 k의 값을 표시 단위로 (저장 단위 ÷ scale). */
    datum(f, k) {
      const s = this.spec.scale;
      if (this.spec.kind === "candle") {
        const c = f.model.candle(this.spec, f.per, k, f.d);
        return { k, o: c.open / s, h: c.high / s, l: c.low / s, c: c.close / s };
      }
      const v = f.model.value(this.spec, f.per, k, f.d);
      return { k, v: v == null ? null : v / s };
    }

    targetRange(items) {
      const unit = this.spec.axis === "int" ? 1 : this.spec.axis === "duration" ? 30 : 0.05; // 값이 없을 때 최소 폭
      if (this.spec.kind === "candle") {
        let lo = Infinity;
        let hi = -Infinity;
        for (const it of items) {
          if (it.l < lo) lo = it.l;
          if (it.h > hi) hi = it.h;
        }
        if (!items.length) lo = hi = 0;
        const pad = Math.max((hi - lo) * 0.12, unit);
        return [lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad];
      }
      let max = 0;
      let min = 0;
      for (const it of items) {
        if (it.v == null) continue;
        if (it.v > max) max = it.v;
        if (it.v < min) min = it.v;
      }
      const head = this.spec.kind === "line" ? 1.15 : 1.16; // 막대는 최고치 글자 자리
      return [min * head, Math.max(max * head, min < 0 ? 0 : unit * (this.spec.axis === "int" ? 5 : 1))];
    }

    drawValueAxis(tagValue, tagY, lo, hi, left, pw, top, ph, Y, ease) {
      const { ctx, spec, theme } = this;
      const maxTicks = Math.max(2, Math.floor(ph / 44));
      const range = hi - lo;
      const step =
        spec.axis === "duration"
          ? TIME_STEPS.find((s) => s >= range / maxTicks) || TIME_STEPS[TIME_STEPS.length - 1]
          : niceStep(range / maxTicks, spec.axis === "int");
      const decimals = spec.axis === "int" || spec.axis === "duration" ? 0 : decimalsOf(step);
      const label = (v) =>
        spec.axis === "duration"
          ? G.format.duration(Math.round(v))
          : G.format.fixed(v, decimals) + (spec.axis === "percent" ? "%" : "");

      ctx.font = `12px ${theme.font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;
      let widest = 0;
      for (let i = Math.ceil(lo / step); i * step <= hi; i++) {
        const v = i * step + 0; // -0 → 0 (눈금에 '-0'이 찍히지 않게)
        const y = Math.round(Y(v)) + 0.5;
        if (y < top || y > top + ph) continue;
        ctx.strokeStyle = v === 0 ? theme.axis : theme.grid;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + pw, y);
        ctx.stroke();
        const text = label(v);
        widest = Math.max(widest, ctx.measureText(text).width);
        if (tagY != null && Math.abs(y - tagY) < 16) continue; // 현재 값 태그에 가려지는 눈금 글자는 생략
        ctx.fillStyle = theme.muted;
        ctx.fillText(text, left + pw + 8, y);
      }
      if (tagValue != null) {
        ctx.font = `600 12px ${theme.font}`;
        widest = Math.max(widest, ctx.measureText(spec.tagText(tagValue)).width + 4);
      }
      const target = Math.min(120, Math.max(44, Math.ceil(widest) + 20));
      this.axisW += (target - this.axisW) * ease;
      if (Math.abs(target - this.axisW) < 0.5) {
        this.axisW = target;
        return false;
      }
      return true;
    }

    /** 월·분기·연 경계에 날짜 눈금. 간격은 픽셀 밀도로 고른다. */
    drawTimeAxis(f, left, pw, top, ph, X) {
      const { ctx, theme } = this;
      const { per, model } = f;
      const daysPerPeriod = per.kind === "day" ? 1 : per.kind === "week" ? 7 : 30.44;
      const pxPerMonth = (pw / (f.viewR - f.viewL)) * (30.44 / daysPerPeriod);
      const every = pxPerMonth >= 54 ? 1 : pxPerMonth * 3 >= 54 ? 3 : pxPerMonth * 12 >= 44 ? 12 : 24;

      const from = model.cal(per.dayAt(f.viewL));
      const to = per.dayAt(f.viewR);
      let y = from.y;
      let m = from.m;
      let lastEnd = -Infinity;
      const base = top + ph;
      ctx.font = `12px ${theme.font}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.lineWidth = 1;
      for (;;) {
        const i = model.indexOf(y, m, 1);
        if (i > to) break;
        if ((y * 12 + m - 1) % every === 0) {
          const x = Math.round(X(per.pos(i))) + 0.5;
          if (x >= left && x <= left + pw) {
            if (m === 1) {
              ctx.strokeStyle = theme.grid;
              ctx.beginPath();
              ctx.moveTo(x, top);
              ctx.lineTo(x, base);
              ctx.stroke();
            }
            ctx.strokeStyle = theme.axis;
            ctx.beginPath();
            ctx.moveTo(x, base);
            ctx.lineTo(x, base + 4);
            ctx.stroke();
            const text = m === 1 || every >= 12 ? String(y) : `${m}월`;
            const tw = ctx.measureText(text).width;
            if (x + 3 > lastEnd + 8 && x + 3 + tw <= left + pw) {
              ctx.fillStyle = m === 1 ? theme.ink2 : theme.muted;
              ctx.fillText(text, x + 3, base + 6);
              lastEnd = x + 3 + tw;
            }
          }
        }
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    drawCandles(items, X, Y, scale, current, left, pw) {
      const { ctx, theme } = this;
      const color = { up: theme.up, down: theme.down, flat: theme.flat };
      const dirOf = (it) => (it.c > it.o ? "up" : it.c < it.o ? "down" : "flat");

      if (current) {
        const y = Math.round(Y(current.c)) + 0.5;
        ctx.strokeStyle = alpha(color[dirOf(current)], 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + pw, y);
        ctx.stroke();
      }

      const body = Math.min(BAR_MAX, Math.max(1, scale * 0.62));
      const dense = scale < 3;
      const fills = { up: new Path2D(), down: new Path2D(), flat: new Path2D() };
      const wicks = { up: new Path2D(), down: new Path2D(), flat: new Path2D() };
      const hollow = new Path2D(); // 하락 캔들은 속이 빈 몸통: 색 외의 두 번째 구분 수단
      for (const it of items) {
        const dir = dirOf(it);
        const cx = X(it.k + 0.5);
        const yo = Y(it.o);
        const yc = Y(it.c);
        const yh = Y(it.h);
        const yl = Y(it.l);
        const top = Math.min(yo, yc);
        const height = Math.max(1, Math.abs(yo - yc));
        if (dense) {
          fills[dir].rect(cx - scale / 2, Math.min(yh, top), Math.max(scale, 0.75), Math.max(1, yl - yh, height));
          continue;
        }
        const wx = Math.round(cx) + 0.5;
        wicks[dir].moveTo(wx, yh);
        wicks[dir].lineTo(wx, top);
        wicks[dir].moveTo(wx, top + height);
        wicks[dir].lineTo(wx, yl);
        const bx = cx - body / 2;
        if (dir === "down" && body >= 4 && height >= 3) hollow.rect(bx + 0.75, top + 0.75, body - 1.5, height - 1.5);
        else fills[dir].rect(bx, top, body, height);
      }
      ctx.lineWidth = 1;
      for (const dir of ["flat", "down", "up"]) {
        ctx.strokeStyle = color[dir];
        ctx.stroke(wicks[dir]);
        ctx.fillStyle = color[dir];
        ctx.fill(fills[dir]);
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.down;
      ctx.stroke(hollow);
    }

    drawBars(items, X, Y, scale, f, top) {
      const { ctx, spec, theme } = this;
      const base = Y(0);
      const width = scale >= 4 ? Math.min(BAR_MAX, scale - 2) : Math.max(0.75, scale * 0.9);
      const rounded = ROUND_RECT && width >= 8;
      // 막대는 0 기준선에서 자라고 값 쪽 끝만 둥글다 (음수면 아래로)
      const shape = (path, it) => {
        const x = X(it.k + 0.5) - width / 2;
        const y = Y(it.v);
        const top = Math.min(y, base);
        const height = Math.abs(base - y);
        if (rounded && height >= 4) path.roundRect(x, top, width, height, it.v > 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]);
        else path.rect(x, top, width, Math.max(height, 0.75));
      };
      const path = new Path2D();
      let peak = null;
      for (const it of items) {
        if (!it.v) continue;
        shape(path, it);
        if (!peak || it.v > peak.v) peak = it;
      }
      ctx.fillStyle = spec.color;
      ctx.fill(path);

      const hovered = items.find((it) => it.k === f.hoverK && it.v);
      if (hovered) {
        const lift = new Path2D();
        shape(lift, hovered);
        ctx.fillStyle = lighten(spec.color, 0.35);
        ctx.fill(lift);
      }

      // 보이는 구간의 최고치 하나만 직접 표시 (현재 값은 오른쪽 태그가 보여 줌)
      if (peak && peak.v > 0 && peak.k !== f.kNow) {
        const y = Y(peak.v) - 6;
        if (y - 14 >= top) {
          ctx.font = `600 12px ${theme.font}`;
          ctx.textBaseline = "bottom";
          ctx.textAlign = "center";
          const text = spec.tagText(peak.v);
          const half = ctx.measureText(text).width / 2;
          const g = this.geom;
          const x = Math.min(Math.max(X(peak.k + 0.5), g.left + half + 2), g.left + g.width - half - 2);
          ctx.fillStyle = theme.ink2;
          ctx.fillText(text, x, y);
        }
      }
    }

    drawLine(items, X, Y, f) {
      const { ctx, spec, theme } = this;
      const base = Y(0);
      const segments = [];
      let seg = null;
      for (const it of items) {
        if (it.v == null) {
          seg = null;
          continue;
        }
        if (!seg) segments.push((seg = []));
        seg.push([X(it.k + 0.5), Y(it.v)]);
      }

      ctx.fillStyle = alpha(spec.color, 0.12);
      for (const s of segments) {
        if (s.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(s[0][0], base);
        for (const [x, y] of s) ctx.lineTo(x, y);
        ctx.lineTo(s[s.length - 1][0], base);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = spec.color;
      ctx.fillStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const s of segments) {
        if (s.length === 1) {
          ctx.beginPath();
          ctx.arc(s[0][0], s[0][1], 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }

      const dot = (it) => {
        if (!it || it.v == null) return;
        const x = X(it.k + 0.5);
        const y = Y(it.v);
        ctx.fillStyle = theme.surface;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      };
      dot(items.find((it) => it.k === f.hoverK));
      dot(items.find((it) => it.k === f.kNow));
    }

    /** 오른쪽 축의 현재 값 태그 (주식 차트의 현재가 표시). */
    drawTag(current, v, y, axisX) {
      const { ctx, spec, theme } = this;
      const fill =
        spec.kind !== "candle" ? spec.color : current.c > current.o ? theme.up : current.c < current.o ? theme.down : theme.flat;
      const text = spec.tagText(v);
      ctx.font = `600 12px ${theme.font}`;
      const width = Math.min(ctx.measureText(text).width + 12, this.w - axisX - 4);
      const x = axisX + 3;
      ctx.fillStyle = fill;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y - 10, width, 20, 4);
      else ctx.rect(x, y - 10, width, 20);
      ctx.fill();
      ctx.fillStyle = contrast(fill, theme.page) >= contrast(fill, "#ffffff") ? theme.page : "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 6, y + 0.5);
    }
  }

  root.Growth = Object.assign(root.Growth || {}, { Chart });
})(window);
