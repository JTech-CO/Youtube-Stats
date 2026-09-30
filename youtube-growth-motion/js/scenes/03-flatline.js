/* 03 PROBLEM — "3년을 / 멈춰 있다가,"
   A scan head sweeps the cumulative line from the day it reached 60 (2020-05-27): the flat line
   from scene 02 takes its true shape behind the head, a day counter runs to 1,147 (b4).
   b2 stamp "413 VIEWS · 2021", b3 stamp "−6 · 2022". Tail: the head reaches July 2023 and the
   line shoots up; its tip is where scene 04 explodes (match cut). */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const P = D.plateau;

  const X0 = 200;
  const X1 = 1720;
  const BASE = 920;
  const K = 3; // px per subscriber (axis starts at 0)
  const d0 = cal.idx(P.from);
  const dEnd = cal.idx(P.to);
  const d1 = cal.idx('2023-07-31');
  const xOf = (d) => X0 + ((d - d0) / (d1 - d0)) * (X1 - X0);
  const yOf = (v) => BASE - v * K;
  const SPIKE0 = 1.62;
  const SPIKE1 = 1.84;
  SX.L.flatTip = { x: xOf(d1), y: yOf(cal.cum(d1)) };

  /** Scan-head day at scene time: plateau on b1–b3 (lands on b4), the breakout run in the tail */
  const headAt = (lt) => {
    if (lt < SPIKE0) return U.lerp(d0, dEnd, U.prog(lt, 0, 1.5));
    return U.lerp(dEnd, d1, E.inCubic(U.prog(lt, SPIKE0, SPIKE1)));
  };

  SX.defineScene({
    id: 3,
    role: 'PROBLEM',
    bg: 'red',
    src: 'DAILY SUBSCRIBERS · VIEWS',
    ruler: (lt) => {
      const h = headAt(lt);
      return { from: d0, to: h, mark: h };
    },

    build(cam) {
      const st = {};
      st.tex = U.h('div', { class: 'halftone' });
      cam.appendChild(st.tex);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: `${P.from} → ${P.to} / FLATLINE` });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 150, lines: [`${Math.floor(P.days / 365)}년을`, '멈춰 있다가,'] });

      const svg = U.svgFull();
      st.axes = U.s('g', { stroke: C.ink, fill: C.ink });
      st.axes.append(
        U.s('line', { x1: X0, y1: BASE, x2: X1, y2: BASE, 'stroke-width': 2 }),
        U.s('rect', { x: X0, y: yOf(P.max), width: xOf(dEnd) - X0, height: (P.max - P.min) * K, stroke: 'none', opacity: 0.14 }),
        U.s('line', { x1: X0, y1: yOf(100), x2: X1, y2: yOf(100), 'stroke-width': 1.5, 'stroke-dasharray': '4 8', opacity: 0.6 }),
        U.s('text', { x: X0 - 14, y: yOf(100) + 6, 'text-anchor': 'end', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono)', text: '100' }),
        U.s('text', { x: X0 - 14, y: yOf(60) + 6, 'text-anchor': 'end', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono)', text: '60' }),
        U.s('text', { x: X0 - 14, y: BASE + 6, 'text-anchor': 'end', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono)', text: '0' }));
      ['2021', '2022', '2023'].forEach((y) => {
        const x = xOf(cal.idx(`${y}-01-01`));
        st.axes.append(
          U.s('line', { x1: x, y1: BASE, x2: x, y2: BASE + 12, 'stroke-width': 2 }),
          U.s('text', { x, y: BASE + 34, 'text-anchor': 'middle', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono);letter-spacing:.1em', text: y }));
      });
      st.flat = U.s('line', { x1: X0, y1: yOf(60), x2: X1, y2: yOf(60), stroke: C.ink, 'stroke-width': 4 });
      st.trace = U.s('path', { fill: 'none', stroke: C.ink, 'stroke-width': 5, 'stroke-linejoin': 'round' });
      st.sweep = U.s('line', { y1: 570, y2: BASE, stroke: C.ink, 'stroke-width': 2, opacity: 0.35 });
      st.pulse = U.s('circle', { r: 12, fill: 'none', stroke: C.ink, 'stroke-width': 3 });
      st.headDot = U.s('circle', { r: 11, fill: C.paper, stroke: C.ink, 'stroke-width': 4 });
      st.burst = U.s('g', { stroke: C.paper, 'stroke-width': 5, 'stroke-linecap': 'round' });
      for (let k = 0; k < 12; k++) st.burst.appendChild(U.s('line'));
      svg.append(st.axes, st.flat, st.trace, st.sweep, st.pulse, st.headDot, st.burst);
      cam.appendChild(svg);

      // Day counter (right) — lands on b4
      st.count = ui.counter(cam, { x: 1600, y: 236, size: 150, align: 'right' });
      st.countLbl = U.h('div', { class: 'mono', style: `right:${T.W - 1600}px;top:424px;text-align:right`, text: `DAYS AT ${P.min}–${P.max} SUBSCRIBERS` });
      cam.appendChild(st.countLbl);

      // Stamps land where the head is on b2 / b3
      const sx1 = xOf(headAt(0.5));
      const sx2 = xOf(headAt(1.0));
      st.stamp1 = ui.stamp(cam, { x: sx1, y: 818, main: U.fmtInt(P.views2021), sub: 'VIEWS · 2021 TOTAL', rot: -6 });
      st.stamp2 = ui.stamp(cam, { x: sx2, y: 818, main: ui.signed(P.net2022), sub: 'SUBSCRIBERS · 2022 NET', rot: 5 });
      return st;
    },

    update(st, lt) {
      st.tex.style.transform = `translate3d(${(lt * 10).toFixed(1)}px,0,0)`;
      st.cap.update(lt, 0, SPIKE0);
      st.head.update(lt, 0.02, SPIKE0);

      const h = headAt(lt);
      const hi = Math.floor(h);
      const hx = xOf(h);

      // True line behind the head, flat line ahead (dim)
      const pts = [];
      for (let d = d0; d <= hi; d++) pts.push([xOf(d), yOf(cal.cum(d))]);
      pts.push([hx, yOf(cal.cum(hi))]);
      st.trace.setAttribute('d', U.pathD(pts));
      st.flat.setAttribute('x1', hx.toFixed(1));
      st.flat.setAttribute('opacity', (0.3 * (1 - U.prog(lt, SPIKE0, SPIKE0 + 0.1))).toFixed(3));
      const hy = yOf(cal.cum(hi));
      st.headDot.setAttribute('cx', hx.toFixed(1));
      st.headDot.setAttribute('cy', hy.toFixed(1));
      st.sweep.setAttribute('x1', hx.toFixed(1));
      st.sweep.setAttribute('x2', hx.toFixed(1));
      st.sweep.setAttribute('opacity', (0.35 * (1 - U.prog(lt, SPIKE0, SPIKE0 + 0.1))).toFixed(3));
      // monitor pulse on every beat
      const bp = U.mod(lt, T.SPB) / T.SPB;
      st.pulse.setAttribute('cx', hx.toFixed(1));
      st.pulse.setAttribute('cy', hy.toFixed(1));
      st.pulse.setAttribute('r', (12 + 38 * E.outCubic(bp)).toFixed(1));
      st.pulse.setAttribute('opacity', lt < SPIKE0 ? (0.8 * (1 - bp)).toFixed(3) : 0);

      // Tip flash as the line breaks out
      const fp = U.prog(lt, SPIKE1, 2.0);
      st.burst.style.display = lt >= SPIKE1 ? '' : 'none';
      Array.from(st.burst.children).forEach((ln, k) => {
        const a = (k / 12) * Math.PI * 2;
        const r0 = 18 + 40 * E.outCubic(fp);
        const r1 = r0 + 30 * (1 - fp) + 10;
        ln.setAttribute('x1', (hx + Math.cos(a) * r0).toFixed(1));
        ln.setAttribute('y1', (hy + Math.sin(a) * r0).toFixed(1));
        ln.setAttribute('x2', (hx + Math.cos(a) * r1).toFixed(1));
        ln.setAttribute('y2', (hy + Math.sin(a) * r1).toFixed(1));
      });

      // Day counter: days elapsed on the plateau, stops at 1,147 on b4 and holds
      const days = Math.min(P.days, Math.floor(h - d0) + 1);
      st.count.set(U.fmtInt(days));
      const ce = ui.enter(lt, 0.06, 0.45);
      st.count.el.style.opacity = ce.o.toFixed(3);
      st.count.el.style.transform = `translate3d(0,${((1 - ce.e) * 30).toFixed(1)}px,0) scale(${(1 + 0.05 * U.pulse(lt - 1.5, 10, 0.12) * (lt >= 1.5 ? 1 : 0)).toFixed(4)})`;
      st.countLbl.style.opacity = (ce.o * 0.9).toFixed(3);

      st.stamp1.update(lt, 0.5, SPIKE0);
      st.stamp2.update(lt, 1.0, SPIKE0);
    },
  });
})((window.SX = window.SX || {}));
