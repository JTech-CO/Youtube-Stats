/* 05 PROOF — "한 달에 / 2,410시간,"
   The ring from the burst lands as a stopwatch dial. The hand sweeps August 2023 day by day
   (b2–b3) and each day's watch hours grow as a radial bar while the headline number counts.
   b4: the best day (08-05) turns red with its value; the rest step back. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const Wt = D.watch;

  const { x: CX, y: CY } = SX.L.dialCenter;
  const R_IN = 200;
  const BAR_MAX = 170;
  const BAR_W = 24;
  const N = Wt.dailyE4.length;
  const MAXE4 = Math.max(...Wt.dailyE4);
  const BEST = Wt.dailyE4.indexOf(MAXE4);
  const SW0 = 0.25; // hand sweep (from late b1 through b3)
  const SW1 = 1.2;
  const GROW = 0.22;
  const OUT = 1.74;
  const dFrom = cal.idx(`${Wt.month}-01`);

  const angOf = (k) => ((k + 0.5) / N) * 360; // degrees clockwise from 12 o'clock
  const tOf = (k) => SW0 + ((k + 0.5) / N) * (SW1 - SW0);
  const polar = (deg, r) => [CX + Math.sin(U.rad(deg)) * r, CY - Math.cos(U.rad(deg)) * r];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  SX.defineScene({
    id: 5,
    role: 'PROOF',
    bg: 'yellow',
    src: 'DAILY WATCH HOURS',
    ruler: (lt) => {
      const d = dFrom + U.clamp(Math.floor(U.prog(lt, SW0, SW1) * N), 0, N - 1);
      return { from: dFrom, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.tex = U.h('div', { class: 'halftone' });
      cam.appendChild(st.tex);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: `WATCH TIME / ${MONTHS[Number(Wt.month.slice(5)) - 1]} ${Wt.month.slice(0, 4)}` });
      st.num = ui.digits();
      st.head = ui.headline(cam, { x: 120, y: 212, size: 140, lines: ['한 달에', [st.num.el, '시간,']] });

      const svg = U.svgFull();
      st.dial = U.s('circle', { cx: CX, cy: CY, fill: 'none', stroke: C.ink, 'stroke-width': 6 });
      st.ticks = U.s('g', { stroke: C.ink });
      for (let k = 0; k < N; k++) {
        const a = angOf(k);
        const [x1, y1] = polar(a, R_IN - 26);
        const [x2, y2] = polar(a, R_IN - (k % 7 === 0 ? 8 : 14));
        st.ticks.appendChild(U.s('line', { x1, y1, x2, y2, 'stroke-width': k % 7 === 0 ? 4 : 2 }));
      }
      st.bars = Wt.dailyE4.map((v, k) => {
        const r = U.s('rect', { x: CX - BAR_W / 2, width: BAR_W, fill: C.ink, transform: `rotate(${angOf(k).toFixed(2)} ${CX} ${CY})` });
        svg.appendChild(r);
        return { r, len: (v / MAXE4) * BAR_MAX, k };
      });
      st.hand = U.s('line', { x1: CX, y1: CY, stroke: C.red, 'stroke-width': 6, 'stroke-linecap': 'round' });
      st.cap2 = U.s('circle', { cx: CX, cy: CY, r: 12, fill: C.red });
      st.lead = U.s('polyline', { fill: 'none', stroke: C.ink, 'stroke-width': 2 });
      svg.append(st.dial, st.ticks, st.hand, st.cap2, st.lead);
      cam.appendChild(svg);

      st.month = U.h('div', { class: 'mono', style: `left:${CX - 200}px;width:400px;text-align:center;top:${CY + 34}px;font-size:22px` });
      st.day = ui.counter(cam, { x: CX, y: CY - 104, size: 72, align: 'center' });
      cam.appendChild(st.month);

      const [bx, by] = polar(angOf(BEST), R_IN + Wt.dailyE4[BEST] / MAXE4 * BAR_MAX);
      st.bestXY = [bx, by];
      st.best = U.box(1540, 176, 'chip solid', `${Wt.best.date.slice(5)} · ${U.fmtFixed(Number(Wt.best.hours), 2)} H`);
      st.best.style.fontSize = '22px';
      st.l1 = U.box(124, 560, 'mono', `${U.fmtFixed(Number(Wt.hours), 2)} HOURS · ${Wt.month}`);
      st.l2 = U.box(124, 596, 'mono', `${U.fmtInt(Wt.valid)} ENGAGED VIEWS · AVG VIEW ${Wt.avgDuration}`);
      cam.append(st.best, st.l1, st.l2);
      return st;
    },

    update(st, lt) {
      st.tex.style.transform = `translate3d(${(-lt * 9).toFixed(1)}px,${(lt * 9).toFixed(1)}px,0)`;
      st.cap.update(lt, 0, OUT);
      st.head.update(lt, 0.02, OUT);
      const out = E.inExpo(U.prog(lt, OUT, OUT + 0.2));

      // Dial lands from the burst ring
      const de = E.spring(U.prog(lt, 0, 0.5), 5, 1.2);
      st.dial.setAttribute('r', U.lerp(1100, R_IN, de).toFixed(1));
      st.dial.setAttribute('stroke-width', U.lerp(26, 6, de).toFixed(2));
      st.ticks.setAttribute('opacity', U.prog(lt, 0.2, 0.45).toFixed(3));

      // Hand: one sweep over b2–b3, then keeps turning slowly
      const sp = U.prog(lt, SW0, SW1);
      const ha = 360 * sp + (lt > SW1 ? (lt - SW1) * 40 : 0);
      const [hx, hy] = polar(ha, R_IN - 30);
      st.hand.setAttribute('x2', hx.toFixed(1));
      st.hand.setAttribute('y2', hy.toFixed(1));
      st.hand.setAttribute('opacity', U.prog(lt, 0.3, 0.45).toFixed(3));

      const hi = lt >= 1.5 ? E.outCubic(U.prog(lt, 1.5, 1.62)) : 0;
      let sumE4 = 0;
      st.bars.forEach((b) => {
        const p = U.prog(lt, tOf(b.k), tOf(b.k) + GROW);
        sumE4 += Wt.dailyE4[b.k] * p;
        const len = b.len * (lt < tOf(b.k) ? 0 : E.outBack(p, 1.8)) * (1 - out);
        b.r.setAttribute('y', (CY - R_IN - len).toFixed(1));
        b.r.setAttribute('height', Math.max(0, len).toFixed(1));
        const isBest = b.k === BEST;
        b.r.setAttribute('fill', isBest && hi > 0 ? C.red : C.ink);
        b.r.setAttribute('opacity', (isBest ? 1 : 1 - 0.55 * hi).toFixed(3));
      });
      st.num.set(U.fmtInt(sumE4 / 10000));

      const day = U.clamp(Math.floor(sp * N) + 1, 1, N);
      st.day.set(U.pad(day));
      U.setText(st.month, `DAY · ${MONTHS[Number(Wt.month.slice(5)) - 1]} ${Wt.month.slice(0, 4)}`);
      const ce = ui.enter(lt, 0.3, 0.4);
      [st.day.el, st.month].forEach((el) => {
        el.style.opacity = (ce.o * (1 - out)).toFixed(3);
      });
      st.day.el.style.transform = `scale(${(1 + 0.06 * U.pulse(lt, T.E16, 0.04) * (sp > 0 && sp < 1 ? 1 : 0)).toFixed(4)})`;

      // b3 / b4 labels
      [st.l1, st.l2].forEach((el, i) => {
        const p = U.prog(lt, 1.0 + i * 0.08, 1.3 + i * 0.08);
        el.style.opacity = (U.clamp(p * 3) * (1 - out)).toFixed(3);
        el.style.transform = `translate3d(${((1 - E.outCubic(p)) * -40).toFixed(1)}px,0,0)`;
      });
      ui.pop(st.best, lt, 1.5, { from: 0.5 });
      if (lt >= 1.5) st.best.style.opacity = (U.clamp(U.prog(lt, 1.5, 1.56) * 5) * (1 - out)).toFixed(3);
      const [bx, by] = st.bestXY;
      st.lead.setAttribute('points', `${(bx + 6).toFixed(1)},${(by - 6).toFixed(1)} 1600,240 1600,228`);
      st.lead.setAttribute('opacity', (hi * (1 - out)).toFixed(3));
    },
  });
})((window.SX = window.SX || {}));
