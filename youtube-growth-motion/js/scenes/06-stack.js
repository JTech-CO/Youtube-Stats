/* 06 PROCESS — "2년을 / 천천히 쌓고,"
   24 bricks, one per month of 2024–2025, drop on a 16th-note grid and stack into a tower;
   brick height = net new subscribers that month (zero months stay as a thin slab).
   The count climbs 552 → 777 and holds from b4 with "+225 · 24 MONTHS". */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const S = D.steady;

  const TX = 1150;
  const TW = 440;
  const BASE = 900;
  const KPX = 2.7; // px per subscriber
  const GAP = 3;
  const MIN_H = 4;
  const OUT = 1.72;
  const dFrom = cal.idx(S.from);

  // Brick geometry (bottom-up)
  let y = BASE;
  const BR = S.months.map((m, i) => {
    const h = Math.max(MIN_H, m.net * KPX);
    y -= h;
    const o = { ...m, i, h, y, land: 0.08 + i * 0.0585 };
    y -= GAP;
    return o;
  });
  const top = [...BR].sort((a, b) => b.net - a.net).slice(0, 2).map((b) => b.i);
  const yearNet = (yr) => S.months.filter((m) => m.ym.startsWith(yr)).reduce((a, m) => a + m.net, 0);

  SX.defineScene({
    id: 6,
    role: 'PROCESS',
    bg: 'green',
    src: 'MONTHLY NET SUBSCRIBERS',
    ruler: (lt) => {
      const k = BR.filter((b) => lt >= b.land).length;
      const d = k ? cal.idx(`${BR[k - 1].ym}-01`) + 27 : dFrom;
      return { from: dFrom, to: Math.min(d, cal.idx(S.to)), mark: Math.min(d, cal.idx(S.to)) };
    },

    build(cam) {
      const st = {};
      st.grid = U.h('div', { class: 'blueprint' });
      cam.appendChild(st.grid);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: '2024—2025 / MONTH BY MONTH' });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 150, lines: [`${S.months.length / 12}년을`, '천천히 쌓고,'] });

      const svg = U.svgFull();
      st.floor = U.s('line', { x1: TX - 80, y1: BASE + 2, x2: TX + TW + 80, y2: BASE + 2, stroke: C.ink, 'stroke-width': 3 });
      svg.appendChild(st.floor);
      st.bricks = BR.map((b) => {
        const g = U.s('g');
        const r = U.s('rect', { x: TX, y: b.y, width: TW, height: b.h, fill: b.net ? C.ink : 'none', stroke: C.ink, 'stroke-width': b.net ? 0 : 2 });
        g.appendChild(r);
        svg.appendChild(g);
        return { b, g, r };
      });
      // Year brackets on the left, the two biggest months labelled on the right
      st.years = ['2024', '2025'].map((yr) => {
        const bs = BR.filter((b) => b.ym.startsWith(yr));
        const y0 = bs[bs.length - 1].y;
        const y1 = bs[0].y + bs[0].h;
        const g = U.s('g', { stroke: C.ink, fill: C.ink });
        g.append(
          U.s('polyline', { points: `${TX - 18},${y0} ${TX - 30},${y0} ${TX - 30},${y1} ${TX - 18},${y1}`, fill: 'none', 'stroke-width': 2 }),
          U.s('text', { x: TX - 44, y: (y0 + y1) / 2 - 4, 'text-anchor': 'end', stroke: 'none', 'font-size': 20, style: 'font-family:var(--f-mono);letter-spacing:.1em', text: yr }),
          U.s('text', { x: TX - 44, y: (y0 + y1) / 2 + 22, 'text-anchor': 'end', stroke: 'none', 'font-size': 20, style: 'font-family:var(--f-mono);letter-spacing:.06em', text: ui.signed(yearNet(yr)) }));
        svg.appendChild(g);
        return { g, bs };
      });
      st.tags = top.map((i) => {
        const b = BR[i];
        const t = U.s('text', { x: TX + TW + 18, y: b.y + b.h / 2 + 7, fill: C.ink, 'font-size': 20, style: 'font-family:var(--f-mono);letter-spacing:.08em', text: `${b.ym} · ${ui.signed(b.net)}` });
        svg.appendChild(t);
        return { t, b };
      });
      cam.appendChild(svg);

      st.lbl = U.box(124, 620, 'mono', `SUBSCRIBERS · ${S.from.slice(0, 7)} → ${S.to.slice(0, 7)}`);
      st.count = ui.counter(cam, { x: 112, y: 654, size: 190 });
      st.chip = U.box(124, 866, 'chip solid', `${ui.signed(S.endCum - S.startCum)} · ${S.months.length} MONTHS`);
      st.chip.style.fontSize = '22px';
      cam.append(st.lbl, st.chip);
      return st;
    },

    update(st, lt) {
      st.grid.style.transform = `translate3d(0,${(lt * 16).toFixed(1)}px,0)`;
      st.cap.update(lt, 0, OUT);
      st.head.update(lt, 0.02, OUT);
      const out = E.inExpo(U.prog(lt, OUT, OUT + 0.2));

      let total = S.startCum;
      let impact = 0;
      st.bricks.forEach(({ b, g }) => {
        const fall = U.prog(lt, b.land - 0.2, b.land);
        const dy = lt < b.land ? -560 * (1 - E.inQuad(fall)) : 0;
        const q = U.prog(lt, b.land, b.land + 0.22);
        const squash = lt < b.land ? 1 : 1 - 0.18 * Math.sin(q * Math.PI) * (1 - q);
        if (lt >= b.land) total += b.net;
        if (lt >= b.land && lt < b.land + 0.08) impact = Math.max(impact, 1 - (lt - b.land) / 0.08);
        g.setAttribute('opacity', lt < b.land - 0.2 ? 0 : 1);
        const cy = b.y + b.h;
        g.setAttribute('transform', `translate(0 ${dy.toFixed(1)}) translate(0 ${cy}) scale(1 ${squash.toFixed(4)}) translate(0 ${-cy})`);
      });
      st.floor.setAttribute('transform', `translate(0 ${(impact * 3).toFixed(2)})`);

      st.years.forEach((yr) => {
        const last = yr.bs[yr.bs.length - 1];
        const p = U.prog(lt, last.land, last.land + 0.25);
        yr.g.setAttribute('opacity', (U.clamp(p * 3) * (1 - out)).toFixed(3));
      });
      st.tags.forEach(({ t, b }) => {
        const p = U.prog(lt, b.land, b.land + 0.2);
        t.setAttribute('opacity', (U.clamp(p * 3) * (1 - out)).toFixed(3));
      });

      st.count.set(U.fmtInt(total));
      const ce = ui.enter(lt, 0.06, 0.45);
      [st.lbl, st.count.el].forEach((el) => {
        el.style.opacity = (ce.o * (1 - out)).toFixed(3);
        el.style.transform = `translate3d(0,${((1 - ce.e) * 30 - out * 40).toFixed(1)}px,0)`;
      });
      ui.pop(st.chip, lt, 1.5, { from: 0.5 });
      if (out > 0) st.chip.style.opacity = (1 - out).toFixed(3);
    },
  });
})((window.SX = window.SX || {}));
