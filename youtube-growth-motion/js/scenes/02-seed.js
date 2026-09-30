/* 02 PROCESS — "한 명씩 / 60명까지,"
   60 cells light up one by one as the date scrubs through the real daily totals:
   b1 first subscribers (2017-12-29) · b2 10 · b3 50 · b4 60 (2020-05-27), held.
   A subscriber lost later shows as a red ring until the count recovers.
   Tail: the cells scatter, then converge into the flat line of scene 03. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;

  const COLS = 10;
  const ROWS = 6;
  const PITCH = 74;
  const R = 25;
  const GX = 1070;
  const GY = 318;
  const N = COLS * ROWS;
  const MARK = [0, 9, 49, 59]; // cells labelled with their ordinal
  const OUT = 1.62; // tail start
  const MERGE = 1.78;

  const ANCH = D.seed.map((s) => s.day); // days of 1, 10, 50, 60
  /** Day index at scene time: scrubs between the milestone days, one milestone per beat */
  const dayAt = (lt) => {
    const k = U.clamp(Math.floor(lt / T.SPB), 0, ANCH.length - 1); // lt < 0 during the iris window
    if (k >= ANCH.length - 1) return ANCH[ANCH.length - 1];
    return U.lerp(ANCH[k], ANCH[k + 1], E.inOutSine(U.prog(lt, k * T.SPB, (k + 1) * T.SPB)));
  };

  // Pop time of each cell = first scene time its subscriber is counted
  const popT = new Array(N).fill(Infinity);
  for (let f = 0; f <= 1.5 * 240; f++) {
    const lt = f / 240;
    const c = cal.cum(dayAt(lt));
    for (let k = 0; k < Math.min(c, N); k++) if (popT[k] === Infinity) popT[k] = lt;
  }
  // Highest count reached up to each day (to show lost subscribers)
  const peak = [];
  D.cum.reduce((m, v, i) => (peak[i] = Math.max(m, v)), 0);

  const cellXY = (k) => [GX + (k % COLS) * PITCH, GY + Math.floor(k / COLS) * PITCH];
  SX.L.seedLine = { x0: 200, x1: 1720, y: 740 };

  SX.defineScene({
    id: 2,
    role: 'PROCESS',
    bg: 'paper',
    src: 'DAILY SUBSCRIBERS',
    ruler: (lt) => {
      const d = dayAt(lt);
      return { from: ANCH[0], to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.grid = U.h('div', { class: 'blueprint' });
      cam.appendChild(st.grid);

      st.cap = ui.caption(cam, { x: 120, y: 172, text: 'SUBSCRIBERS / ONE BY ONE' });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 150, lines: ['한 명씩', `${D.seed[3].value}명까지,`] });

      const svg = U.svgFull();
      st.ripples = U.s('g');
      st.cells = [];
      for (let k = 0; k < N; k++) {
        const [x, y] = cellXY(k);
        const g = U.s('g', { transform: `translate(${x} ${y})` });
        const ring = U.s('circle', { r: R, fill: 'none', stroke: C.ink, 'stroke-width': 2, opacity: 0.18 });
        const dot = U.s('circle', { r: R, fill: C.ink });
        g.append(ring, dot);
        let lbl = null;
        if (MARK.includes(k)) {
          lbl = U.s('text', {
            'text-anchor': 'middle', y: 6, fill: C.paper, 'font-size': 17,
            style: 'font-family:var(--f-mono);letter-spacing:.04em', text: U.pad(k + 1),
          });
          g.appendChild(lbl);
        }
        const rip = U.s('circle', { cx: x, cy: y, r: R, fill: 'none', stroke: C.ink, 'stroke-width': 2 });
        st.ripples.appendChild(rip);
        svg.appendChild(g);
        st.cells.push({ k, x, y, g, ring, dot, lbl, rip });
      }
      svg.appendChild(st.ripples);
      st.line = U.s('line', { x1: SX.L.seedLine.x0, y1: SX.L.seedLine.y, x2: SX.L.seedLine.x1, y2: SX.L.seedLine.y, stroke: C.ink, 'stroke-width': 4 });
      svg.appendChild(st.line);
      cam.appendChild(svg);

      const ry = GY + (ROWS - 1) * PITCH + 70;
      st.lbl = U.box(GX - R, ry, 'mono', 'SUBSCRIBERS');
      st.count = ui.counter(cam, { x: GX - R - 6, y: ry + 30, size: 96 });
      st.date = U.box(GX + 220, ry + 64, 'mono', '');
      st.date.style.fontSize = '28px';
      cam.append(st.lbl, st.date);
      return st;
    },

    update(st, lt) {
      st.grid.style.transform = `translate3d(${(-lt * 14).toFixed(1)}px,${(lt * 6).toFixed(1)}px,0)`;
      st.cap.update(lt, 0, OUT);
      st.head.update(lt, 0.02, OUT);

      const d = dayAt(lt);
      const c = cal.cum(d);
      const pk = peak[U.clamp(Math.floor(d), 0, cal.last)];
      st.count.set(String(c));
      U.setText(st.date, cal.iso(d));
      const out = ui.exit(lt, OUT, 0.22);
      const ie = ui.enter(lt, 0, 0.4);
      [st.lbl, st.count.el, st.date].forEach((el) => {
        el.style.opacity = (ie.o * (1 - out)).toFixed(3);
        el.style.transform = `translate3d(0,${((1 - ie.e) * 24 - out * 40).toFixed(1)}px,0)`;
      });

      // Tail geometry: scatter outward, then converge into a straight line
      const sc = E.outCubic(U.prog(lt, OUT, MERGE));
      const mg = E.inOutCubic(U.prog(lt, MERGE, 2.0));
      const L = SX.L.seedLine;

      st.cells.forEach((o) => {
        const { k } = o;
        const p = U.prog(lt, popT[k], popT[k] + 0.3);
        const on = k < c;
        const lost = !on && k < pk;
        let s = lt < popT[k] ? 0 : U.lerp(0.2, 1, E.outBack(p, 2.6));
        s *= 1 + 0.03 * Math.sin(lt * 5 + k); // never fully still
        o.dot.setAttribute('r', (R * s * (on ? 1 : 0)).toFixed(2));
        o.ring.setAttribute('stroke', lost ? C.red : C.ink);
        o.ring.setAttribute('stroke-width', lost ? 5 : 2);
        o.ring.setAttribute('opacity', lost ? 1 : (0.18 * ie.o).toFixed(3));
        if (o.lbl) o.lbl.setAttribute('opacity', on && p > 0.5 ? 1 : 0);

        // ripple on pop
        const rp = U.prog(lt, popT[k], popT[k] + 0.38);
        o.rip.setAttribute('r', (R + 34 * E.outCubic(rp)).toFixed(1));
        o.rip.setAttribute('opacity', rp > 0 && rp < 1 ? (0.55 * (1 - rp)).toFixed(3) : 0);

        // tail
        const ang = U.hash(k, 21) * Math.PI * 2;
        const dist = 60 + U.hash(k, 22) * 150;
        const tx = L.x0 + ((L.x1 - L.x0) * k) / (N - 1);
        const sx = o.x + Math.cos(ang) * dist * sc;
        const sy = o.y + Math.sin(ang) * dist * sc;
        const x = U.lerp(sx, tx, mg);
        const y = U.lerp(sy, L.y, mg);
        const shrink = U.lerp(1, 0.14, mg);
        o.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${shrink.toFixed(4)})`);
        if (lt >= OUT) {
          o.dot.setAttribute('r', R);
          o.ring.setAttribute('opacity', 0);
        }
      });

      const lp = U.prog(lt, 1.9, 2.0);
      st.line.setAttribute('opacity', lp.toFixed(3));
      st.line.setAttribute('stroke-width', (4 * lp).toFixed(2));
    },
  });
})((window.SX = window.SX || {}));
