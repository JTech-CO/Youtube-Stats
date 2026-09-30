/* 07 PROOF — "하루에 / 39,722회,"
   Daily views, 2025-06-01 → 07-31. b1: ordinary days at a close-up scale (median 54).
   b2: 2025-07-04 shoots straight through the top of the frame while the headline counts.
   b3: the axis collapses to 0–40,000 (ticks travel with it) so the spike fits; the rest of
   July grows in at the new scale. b4: date + engaged views on the peak, median note below. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const S = D.spike;

  const X0 = 900;
  const X1 = 1780;
  const BASE = 900;
  const TOP = 280;
  const N = S.views.length;
  const PITCH = (X1 - X0) / N;
  const BW = PITCH * 0.68;
  const PEAK_I = cal.idx(S.peak.date) - cal.idx(S.from);
  const KA = 3.0; // px per view, close-up
  const KB = (BASE - TOP) / S.peak.views;
  const TICKS_A = [50, 100, 150, 200];
  const TICKS_B = [10000, 20000, 30000, 40000];
  const OUT = 1.74;
  const dFrom = cal.idx(S.from);

  const kAt = (lt) => Math.exp(U.lerp(Math.log(KA), Math.log(KB), E.inOutCubic(U.prog(lt, 1.0, 1.38))));
  const growT = (i) => (i < PEAK_I ? 0.02 + i * 0.012 : i === PEAK_I ? 0.5 : 1.02 + (i - PEAK_I - 1) * 0.012);

  SX.defineScene({
    id: 7,
    role: 'PROOF',
    bg: 'red',
    src: 'DAILY VIEWS',
    ruler: (lt) => {
      const i = lt < 0.5 ? U.lerp(0, PEAK_I - 1, U.prog(lt, 0, 0.4)) : lt < 1.0 ? PEAK_I : U.lerp(PEAK_I, N - 1, U.prog(lt, 1.0, 1.4));
      return { from: dFrom, to: dFrom + i, mark: dFrom + i };
    },

    build(cam) {
      const st = {};
      st.world = U.h('div', { class: 'full world' });
      cam.appendChild(st.world);
      st.cap = ui.caption(st.world, { x: 120, y: 172, text: `DAILY VIEWS / ${S.peak.date}` });
      st.num = ui.digits();
      st.head = ui.headline(st.world, { x: 120, y: 212, size: 150, lines: ['하루에', [st.num.el, '회,']] });

      const svg = U.svgFull();
      const mk = (v, set) => {
        const g = U.s('g');
        g.append(
          U.s('line', { x1: X0 - 6, x2: X1, y1: 0, y2: 0, stroke: C.ink, 'stroke-width': 1.5, 'stroke-dasharray': '3 7', opacity: 0.5 }),
          U.s('text', { x: X0 - 18, y: 6, 'text-anchor': 'end', fill: C.ink, 'font-size': 18, style: 'font-family:var(--f-mono);letter-spacing:.04em', text: U.fmtInt(v) }));
        svg.appendChild(g);
        return { g, v, set };
      };
      st.ticks = [...TICKS_A.map((v) => mk(v, 'a')), ...TICKS_B.map((v) => mk(v, 'b'))];
      st.base = U.s('line', { x1: X0 - 6, x2: X1, y1: BASE, y2: BASE, stroke: C.ink, 'stroke-width': 3 });
      st.zero = U.s('text', { x: X0 - 18, y: BASE + 6, 'text-anchor': 'end', fill: C.ink, 'font-size': 18, style: 'font-family:var(--f-mono)', text: '0' });
      st.median = U.s('g');
      st.medLine = U.s('line', { x1: X0, x2: X1, stroke: C.paper, 'stroke-width': 2, 'stroke-dasharray': '10 6' });
      st.medTxt = U.s('text', { x: X1, 'text-anchor': 'end', fill: C.paper, 'font-size': 18, style: 'font-family:var(--f-mono);letter-spacing:.1em', text: `MEDIAN ${S.medianBefore}` });
      st.median.append(st.medLine, st.medTxt);
      st.bars = S.views.map((v, i) => {
        const r = U.s('rect', { x: X0 + i * PITCH + (PITCH - BW) / 2, width: BW, fill: i === PEAK_I ? C.paper : C.ink });
        svg.appendChild(r);
        return { r, v, i };
      });
      svg.append(st.base, st.zero, st.median);
      st.world.appendChild(svg);

      st.chip = U.box(0, 0, 'chip solid', `${S.peak.date} · ENGAGED ${U.fmtInt(S.peak.valid)}`);
      st.chip.style.fontSize = '20px';
      st.note = U.box(X0, 934, 'mono', `TYPICAL DAY = MEDIAN ${S.medianBefore} VIEWS (${S.from.slice(5)} → ${cal.iso(dFrom + PEAK_I - 1).slice(5)})`);
      st.note.style.fontSize = '16px';
      st.world.append(st.chip, st.note);
      return st;
    },

    update(st, lt) {
      // hit shake on b2
      const sh = lt >= 0.5 ? (1 - U.prog(lt, 0.5, 0.75)) * 16 : 0;
      const f = Math.floor(lt * T.FPS);
      st.world.style.transform = sh > 0 ? `translate3d(${((U.hash(f, 5) - 0.5) * sh).toFixed(1)}px,${((U.hash(f, 6) - 0.5) * sh).toFixed(1)}px,0)` : '';
      st.cap.update(lt, 0, OUT);
      st.head.update(lt, 0.02, OUT);
      const out = E.inExpo(U.prog(lt, OUT, OUT + 0.2));

      const k = kAt(lt);
      const n = lt < 0.5 ? S.medianBefore : Math.round(U.lerp(S.medianBefore, S.peak.views, E.outCubic(U.prog(lt, 0.5, 1.45))));
      st.num.set(U.fmtInt(n));

      st.bars.forEach(({ r, v, i }) => {
        const t0 = growT(i);
        let h;
        if (i === PEAK_I) {
          h = lt < t0 ? 0 : S.peak.views * E.outExpo(U.prog(lt, t0, t0 + 0.3)) * k;
        } else {
          h = lt < t0 ? 0 : v * k * E.outBack(U.prog(lt, t0, t0 + 0.2), 1.6);
        }
        h = Math.min(h, BASE + 200) * (1 - out);
        r.setAttribute('y', (BASE - h).toFixed(1));
        r.setAttribute('height', Math.max(0, h).toFixed(1));
      });

      st.ticks.forEach((tk) => {
        const y = BASE - tk.v * k;
        const inRange = U.clamp((y - (TOP - 60)) / 60) * U.clamp((BASE - 24 - y) / 30);
        const vis = tk.set === 'a' ? inRange * U.clamp(lt * 4) : inRange;
        tk.g.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
        tk.g.setAttribute('opacity', (vis * (1 - out)).toFixed(3));
      });
      st.zero.setAttribute('opacity', (U.clamp(lt * 4) * (1 - out)).toFixed(3));

      const my = BASE - S.medianBefore * k;
      st.medLine.setAttribute('y1', my.toFixed(1));
      st.medLine.setAttribute('y2', my.toFixed(1));
      st.medTxt.setAttribute('y', (my - 12).toFixed(1));
      st.median.setAttribute('opacity', (U.prog(lt, 0.3, 0.45) * (1 - U.prog(lt, 1.0, 1.2))).toFixed(3));

      // b4: peak label + median note
      const px = X0 + PEAK_I * PITCH + PITCH / 2;
      const py = BASE - S.peak.views * KB;
      // chip sits left of the spike top, right edge 22px from the bar
      ui.pop(st.chip, lt, 1.5, { from: 0.5, base: `translate(${(px - 22).toFixed(1)}px, ${(py - 12).toFixed(1)}px) translateX(-100%)` });
      st.chip.style.transformOrigin = '100% 50%';
      if (out > 0) st.chip.style.opacity = (1 - out).toFixed(3);
      const np = U.prog(lt, 1.56, 1.8);
      st.note.style.opacity = (U.clamp(np * 3) * (1 - out)).toFixed(3);
      st.note.style.clipPath = `inset(0 ${((1 - E.outExpo(np)) * 100).toFixed(1)}% 0 0)`;
    },
  });
})((window.SX = window.SX || {}));
