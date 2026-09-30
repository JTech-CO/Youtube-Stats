/* 04 REVEAL — "2023년 여름, / 처음 터졌다."
   The tip of scene 03's line explodes into 479 points (the net new subscribers of Jul–Sep 2023).
   They fly home into a 540-cell grid in the order the subscribers arrived, next to the 61 grey
   cells that were already there: b1 burst · b2 July · b3 Aug–Sep · b4 540, ▲ 785.2%.
   Tail: the grid implodes to one point, the ring burst of the next transition starts there. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const B = D.burst;

  const COLS = 30;
  const ROWS = 18;
  const PITCH = 20;
  const CELL = 14;
  const CX = 1340;
  const CY = 540;
  const GX = CX - ((COLS - 1) * PITCH) / 2;
  const GY = CY - ((ROWS - 1) * PITCH) / 2;
  const OUT = 1.7;
  SX.L.dialCenter = { x: CX, y: CY };

  const dFrom = cal.idx(B.from);
  const cellXY = (k) => [GX + (k % COLS) * PITCH, GY + Math.floor(k / COLS) * PITCH];

  // New subscriber n (0-based) = subscriber #startCum+1+n; its day = first day the count reached it
  const P = [];
  for (let n = 0; n < B.net; n++) {
    const target = B.startCum + 1 + n;
    const day = B.daily.findIndex((v) => v >= target);
    const hs = 0.45 + (day / (B.days - 1)) * 0.72;
    const a = U.hash(n, 41) * Math.PI * 2;
    const dist = 160 + Math.pow(U.hash(n, 42), 0.7) * 620;
    P.push({ n, day, hs, a, dist, cell: B.startCum + n });
  }
  const HOME = 0.28;

  SX.defineScene({
    id: 4,
    role: 'REVEAL',
    bg: 'dark',
    src: 'DAILY SUBSCRIBERS',
    ruler: (lt) => {
      const d = dFrom + dayShown(lt);
      return { from: dFrom, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.world = U.h('div', { class: 'full world' });
      cam.appendChild(st.world);
      st.glow = ui.glow(st.world, CX, CY, C.green, 0.14);

      st.cap = ui.caption(st.world, { x: 120, y: 172, text: 'SUMMER 2023 / BREAKOUT' });
      st.head = ui.headline(st.world, { x: 120, y: 212, size: 140, lines: [`${B.from.slice(0, 4)}년 여름,`, '처음 터졌다.'] });

      const svg = U.svgFull();
      st.shock = U.s('circle', { cx: SX.L.flatTip.x, cy: SX.L.flatTip.y, fill: 'none', stroke: C.paper, 'stroke-width': 6 });
      st.old = [];
      for (let k = 0; k < B.startCum; k++) {
        const [x, y] = cellXY(k);
        const r = U.s('rect', { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, rx: 3, fill: C.paper });
        svg.appendChild(r);
        st.old.push({ k, x, y, r });
      }
      st.pts = P.map((p) => {
        const r = U.s('rect', { width: CELL, height: CELL, rx: 3, fill: C.green });
        svg.appendChild(r);
        return r;
      });
      svg.appendChild(st.shock);
      st.world.appendChild(svg);

      st.lbl = U.box(124, 612, 'mono', 'SUBSCRIBERS');
      st.count = ui.counter(st.world, { x: 112, y: 646, size: 200 });
      st.date = U.box(124, 866, 'mono', '');
      st.date.style.fontSize = '22px';
      st.rate = U.box(560, 690, 'chip up', ui.rate(B.pctTenths));
      st.rate.style.fontSize = '30px';
      st.net = U.box(560, 770, 'chip', `${ui.signed(B.net)} · ${B.days} DAYS`);
      st.net.style.fontSize = '22px';
      st.world.append(st.lbl, st.date, st.rate, st.net);
      return st;
    },

    update(st, lt) {
      ui.breathe(st.glow, lt, 0.07);
      // impact shake, decays over b1
      const sh = (1 - U.prog(lt, 0, 0.3)) * 14;
      const f = Math.floor(lt * T.FPS);
      st.world.style.transform = lt < 0.3
        ? `translate3d(${((U.hash(f, 3) - 0.5) * sh).toFixed(1)}px,${((U.hash(f, 4) - 0.5) * sh).toFixed(1)}px,0)`
        : '';
      st.cap.update(lt, 0.08, OUT);
      st.head.update(lt, 0.1, OUT);

      const sp = U.prog(lt, 0, 0.36);
      st.shock.setAttribute('r', (20 + 900 * E.outCubic(sp)).toFixed(1));
      st.shock.setAttribute('opacity', (1 - sp).toFixed(3));
      st.shock.setAttribute('stroke-width', (10 * (1 - sp) + 1).toFixed(2));

      const implode = E.inExpo(U.prog(lt, OUT, OUT + 0.16));
      const O = SX.L.flatTip;
      const scat = E.outExpo(U.prog(lt, 0, 0.4));

      st.old.forEach((o) => {
        const e = ui.enter(lt, 0.05 + o.k * 0.004, 0.3);
        const x = U.lerp(o.x, CX, implode);
        const y = U.lerp(o.y, CY, implode);
        o.r.setAttribute('x', (x - CELL / 2).toFixed(1));
        o.r.setAttribute('y', (y - CELL / 2).toFixed(1));
        o.r.setAttribute('opacity', (0.4 * e.o).toFixed(3));
      });

      let arrived = 0;
      let lastDay = 0;
      P.forEach((p, i) => {
        const [gx, gy] = cellXY(p.cell);
        const wob = 10 * Math.sin(lt * 7 + p.n);
        const sx = O.x + Math.cos(p.a) * p.dist * scat + wob * (1 - scat * 0.5);
        const sy = O.y + Math.sin(p.a) * p.dist * scat + wob * 0.6;
        const hp = E.inOutCubic(U.prog(lt, p.hs, p.hs + HOME));
        if (lt >= p.hs + HOME) {
          arrived++;
          lastDay = Math.max(lastDay, p.day);
        }
        let x = U.lerp(sx, gx, hp);
        let y = U.lerp(sy, gy, hp);
        x = U.lerp(x, CX, implode);
        y = U.lerp(y, CY, implode);
        const land = U.prog(lt, p.hs + HOME, p.hs + HOME + 0.2);
        const s = hp < 1 ? U.lerp(0.7, 1, hp) : 1 + 0.5 * (1 - E.outCubic(land)) * (land > 0 ? 1 : 0);
        const w = CELL * s;
        const r = st.pts[i];
        r.setAttribute('x', (x - w / 2).toFixed(1));
        r.setAttribute('y', (y - w / 2).toFixed(1));
        r.setAttribute('width', w.toFixed(2));
        r.setAttribute('height', w.toFixed(2));
        r.setAttribute('fill', hp < 1 ? C.paper : C.green);
      });

      const out = ui.exit(lt, OUT, 0.2);
      st.count.set(U.fmtInt(B.startCum + arrived));
      U.setText(st.date, cal.iso(arrived ? dFrom + lastDay : dFrom - 1));
      const ce = ui.enter(lt, 0.12, 0.45);
      [st.lbl, st.count.el, st.date].forEach((el) => {
        el.style.opacity = (ce.o * (1 - out)).toFixed(3);
        el.style.transform = `translate3d(0,${((1 - ce.e) * 30 - out * 50).toFixed(1)}px,0)`;
      });
      [st.rate, st.net].forEach((el, i) => ui.pop(el, lt, 1.5 + i * 0.06, { base: `translate3d(0,${(-out * 50).toFixed(1)}px,0)` }));
      if (out > 0) [st.rate, st.net].forEach((el) => (el.style.opacity = (1 - out).toFixed(3)));
    },
  });

  /** Latest arrival day (0-based within the window) at scene time lt — used by the ruler */
  function dayShown(lt) {
    let d = 0;
    for (const p of P) if (lt >= p.hs + HOME && p.day > d) d = p.day;
    return d;
  }
})((window.SX = window.SX || {}));
