/* 08 REVEAL — "2026년, / 다시 터졌다."
   Homage to the candle page: weekly candles of cumulative subscribers for 2026 slam in on a
   32nd-note grid (up = filled green, down = hollow red, same rules as the candle page) while a
   price tag rides the latest close with its change since 2025-12-31.
   b1 Jan–Mar · b2 Apr–May · b3 Jun–Sep · b4 3,387 ▲ 335.9% holds. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const Wv = D.wave;

  const X0 = 960;
  const X1 = 1590;
  const BASE = 900;
  const KY = (BASE - 240) / 3500;
  const N = Wv.weeks.length;
  const PITCH = (X1 - X0) / N;
  const BW = Math.max(6, PITCH * 0.68);
  const TAG_X = 1606;
  const OUT = 1.74;
  const yOf = (v) => BASE - v * KY;
  const appear = (k) => 0.06 + (k * 1.36) / (N - 1);
  const MON = 'JFMAMJJASOND';

  /** Tag value/position: eases from the previous close to each new close as candles land */
  function tagAt(lt) {
    let v = Wv.startCum;
    for (let k = 0; k < N; k++) {
      const t0 = appear(k);
      if (lt < t0) break;
      const w = Wv.weeks[k];
      v = U.lerp(w.open, w.close, E.outCubic(U.prog(lt, t0, t0 + 0.1)));
    }
    return v;
  }

  SX.defineScene({
    id: 8,
    role: 'REVEAL',
    bg: 'dark',
    src: 'WEEKLY CANDLES · MON–SUN',
    ruler: (lt) => {
      let k = -1;
      while (k + 1 < N && lt >= appear(k + 1)) k++;
      const d0 = cal.idx(Wv.from);
      const d = k < 0 ? d0 : Math.min(cal.last, cal.idx(Wv.weeks[k].start) + 6);
      return { from: d0, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.glow = ui.glow(cam, 1500, 360, C.green, 0.12);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: 'WEEKLY CANDLES / 2026' });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 140, lines: [`${Wv.from.slice(0, 4)}년,`, '다시 터졌다.'] });

      const svg = U.svgFull();
      st.axis = U.s('g', { fill: C.paper, stroke: C.paper });
      [1000, 2000, 3000].forEach((v) => {
        st.axis.append(
          U.s('line', { x1: X0 - 6, x2: X1, y1: yOf(v), y2: yOf(v), 'stroke-width': 1, 'stroke-dasharray': '3 7', opacity: 0.4 }),
          U.s('text', { x: X0 - 16, y: yOf(v) + 6, 'text-anchor': 'end', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono)', text: U.fmtInt(v) }));
      });
      st.axis.append(
        U.s('line', { x1: X0 - 6, x2: X1, y1: BASE, y2: BASE, 'stroke-width': 2 }),
        U.s('text', { x: X0 - 16, y: BASE + 6, 'text-anchor': 'end', stroke: 'none', 'font-size': 17, style: 'font-family:var(--f-mono)', text: '0' }));
      let lastMonth = -1;
      Wv.weeks.forEach((w, k) => {
        const m = Number(w.start.slice(5, 7)) - 1;
        if (m === lastMonth) return;
        lastMonth = m;
        const x = X0 + k * PITCH + PITCH / 2;
        st.axis.appendChild(U.s('text', { x, y: BASE + 30, 'text-anchor': 'middle', stroke: 'none', 'font-size': 16, style: 'font-family:var(--f-mono)', opacity: 0.8, text: MON[m] }));
      });
      svg.appendChild(st.axis);

      st.candles = Wv.weeks.map((w, k) => {
        const dir = Math.sign(w.close - w.open);
        const col = dir > 0 ? C.green : dir < 0 ? C.red : '#8A8A86';
        const x = X0 + k * PITCH + PITCH / 2;
        const g = U.s('g');
        const wick = U.s('line', { x1: x, x2: x, y1: yOf(w.high), y2: yOf(w.low), stroke: col, 'stroke-width': 1.5 });
        const top = Math.min(yOf(w.open), yOf(w.close));
        const h = Math.max(2, Math.abs(yOf(w.open) - yOf(w.close)));
        const body = U.s('rect', {
          x: x - BW / 2, y: top, width: BW, height: h,
          fill: dir > 0 ? C.green : 'none', stroke: col, 'stroke-width': dir > 0 ? 0 : 1.5,
        });
        g.append(wick, body);
        svg.appendChild(g);
        return { g, body, w, x, dir };
      });
      st.lead = U.s('line', { x2: TAG_X, stroke: C.green, 'stroke-width': 1.5, 'stroke-dasharray': '4 5' });
      st.dot = U.s('circle', { r: 6, fill: C.green });
      svg.append(st.lead, st.dot);
      cam.appendChild(svg);

      st.tag = U.h('div', { class: 'ticker' });
      st.tagV = ui.digits();
      const v = U.h('div', { class: 'tk-v' }, st.tagV.el);
      st.tagR = U.h('div', { class: 'tk-r' });
      st.tag.append(v, st.tagR);
      cam.appendChild(st.tag);
      return st;
    },

    update(st, lt) {
      ui.breathe(st.glow, lt, 0.08);
      st.cap.update(lt, 0, OUT);
      st.head.update(lt, 0.02, OUT);
      const out = E.inExpo(U.prog(lt, OUT, OUT + 0.2));
      st.axis.setAttribute('opacity', (U.clamp(lt * 5) * (1 - out)).toFixed(3));

      let lastX = X0;
      st.candles.forEach((c, k) => {
        const t0 = appear(k);
        if (lt < t0) {
          c.g.setAttribute('opacity', 0);
          return;
        }
        lastX = c.x;
        const p = U.prog(lt, t0, t0 + 0.16);
        const dy = -70 * (1 - E.outBack(p, 2));
        c.g.setAttribute('opacity', (1 - out).toFixed(3));
        c.g.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`);
        const flash = lt - t0 < 2 / T.FPS;
        c.body.setAttribute('fill', flash ? C.paper : c.dir > 0 ? C.green : 'none');
      });

      const v = tagAt(lt);
      const ty = yOf(v);
      st.tagV.set(U.fmtInt(v));
      const tenths = Math.round(((Math.round(v) - Wv.startCum) / Wv.startCum) * 1000);
      U.setText(st.tagR, ui.rate(tenths));
      st.tagR.style.color = tenths < 0 ? C.red : tenths > 0 ? C.green : C.paper;
      const te = ui.enter(lt, 0.04, 0.4);
      const land = lt >= 1.5 ? U.pulse(lt - 1.5, 10, 0.14) : 0;
      st.tag.style.left = `${TAG_X}px`;
      st.tag.style.top = `${(ty - 34).toFixed(1)}px`;
      st.tag.style.opacity = (te.o * (1 - out)).toFixed(3);
      st.tag.style.transform = `scale(${(U.lerp(0.7, 1, te.e) * (1 + 0.1 * land)).toFixed(4)})`;
      st.lead.setAttribute('x1', lastX.toFixed(1));
      st.lead.setAttribute('y1', ty.toFixed(1));
      st.lead.setAttribute('y2', ty.toFixed(1));
      st.lead.setAttribute('opacity', (te.o * (1 - out)).toFixed(3));
      st.dot.setAttribute('cx', lastX.toFixed(1));
      st.dot.setAttribute('cy', ty.toFixed(1));
      st.dot.setAttribute('opacity', (te.o * (1 - out)).toFixed(3));
    },
  });
})((window.SX = window.SX || {}));
