/* 12 END CARD — "그리고 지금, / 3,387명." (6 beats)
   b1–b2 the whole cumulative curve draws from 2017-11-26 to today and meets the 3,387 label
   that flew in from the montage · b3 headline · b4 subcopy · b5 title + data date with the
   final hit · b6 micro-motion only. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const TT = D.totals;

  const X0 = 160;
  const X1 = 1760;
  const BASE = 930;
  const KY = 540 / TT.subs;
  const xOf = (d) => X0 + (d / cal.last) * (X1 - X0);
  const yOf = (v) => BASE - v * KY;
  SX.L.endLabel = { x: 1680, y: 334, size: 56 };

  /** Draw head (day index): fast through the early years, slow into the 2026 surge */
  const headAt = (lt) => cal.last * E.outCubic(U.prog(lt, 0, 1.0));

  const PTS = D.cum.map((v, d) => [xOf(d), yOf(v)]);
  // dy: label above (−) or below (+) its point; the 2025 label sits below so the 2026 surge clears it
  const MARKS = [
    { d: cal.idx(D.plateau.from), dy: -18, text: `${D.seed[3].value} · ${D.plateau.from.slice(0, 4)}` },
    { d: cal.idx(D.burst.to), dy: -18, text: `${U.fmtInt(D.burst.endCum)} · ${D.burst.to.slice(0, 4)}` },
    { d: cal.idx(D.steady.to), dy: 36, text: `${U.fmtInt(D.steady.endCum)} · ${D.steady.to.slice(0, 4)}` },
  ];

  SX.defineScene({
    id: 12,
    role: 'END CARD',
    bg: 'dark',
    src: 'DAILY SUBSCRIBERS',
    ruler: (lt) => {
      const d = headAt(lt);
      return { from: 0, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.glow = ui.glow(cam, X1, yOf(TT.subs), C.green, 0.16);

      const svg = U.svgFull();
      const axis = U.s('g', { stroke: C.paper, fill: C.paper });
      axis.appendChild(U.s('line', { x1: X0, x2: X1, y1: BASE, y2: BASE, 'stroke-width': 1.5, opacity: 0.6 }));
      for (let y = Number(D.start.slice(0, 4)) + 1; y <= Number(D.asOf.slice(0, 4)); y++) {
        const x = xOf(cal.idx(`${y}-01-01`));
        axis.appendChild(U.s('line', { x1: x, x2: x, y1: BASE, y2: BASE + 8, 'stroke-width': 1.5, opacity: 0.6 }));
        if (y % 2 === 0) axis.appendChild(U.s('text', { x, y: BASE + 28, 'text-anchor': 'middle', stroke: 'none', 'font-size': 15, style: 'font-family:var(--f-mono)', opacity: 0.75, text: String(y) }));
      }
      st.area = U.s('path', { fill: C.green, opacity: 0.16 });
      st.line = U.s('path', { fill: 'none', stroke: C.green, 'stroke-width': 4, 'stroke-linejoin': 'round' });
      st.pulse = U.s('circle', { r: 10, fill: 'none', stroke: C.green, 'stroke-width': 3 });
      st.dot = U.s('circle', { r: 9, fill: C.green });
      st.marks = MARKS.map((m) => {
        const g = U.s('g', { transform: `translate(${xOf(m.d).toFixed(1)} ${yOf(cal.cum(m.d)).toFixed(1)})` });
        g.append(
          U.s('circle', { r: 6, fill: C.night, stroke: C.paper, 'stroke-width': 2.5 }),
          U.s('text', { x: 0, y: m.dy, 'text-anchor': 'middle', fill: C.paper, 'font-size': 18, style: 'font-family:var(--f-mono);letter-spacing:.06em', text: m.text }));
        return { ...m, g };
      });
      svg.append(axis, st.area, st.line, ...st.marks.map((m) => m.g), st.pulse, st.dot);
      cam.appendChild(svg);

      const L = SX.L.endLabel;
      st.endLbl = ui.counter(cam, { x: L.x, y: L.y - L.size / 2, size: L.size, align: 'center' });
      st.endLbl.set(U.fmtInt(TT.subs));

      st.cap = ui.caption(cam, { x: 120, y: 172, text: `${D.start} → ${D.asOf}` });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 130, lines: ['그리고 지금,', `${U.fmtInt(TT.subs)}명.`], lineDelay: [1.0, 1.08] });
      st.sub = ui.headline(cam, {
        x: 122, y: 540, size: 34, stagger: 0.008,
        lines: [`${U.fmtInt(TT.days)}일 · 조회수 ${U.fmtInt(TT.views)}회 · 시청 ${U.fmtInt(TT.hoursInt)}시간`],
      });
      st.sub.el.classList.add('subcopy');
      st.title = ui.headline(cam, { x: 116, y: 630, size: 96, stagger: 0.028, lines: [`채널 성장 기록 ${D.start.slice(0, 4)}—${D.asOf.slice(0, 4)}`] });
      st.title.el.classList.add('title');
      st.date = ui.caption(cam, { x: 122, y: 756, text: `DATA AS OF ${D.asOf}` });
      return st;
    },

    update(st, lt) {
      ui.breathe(st.glow, lt, 0.06);
      st.cap.update(lt, 0);
      st.head.update(lt, 0);
      st.sub.update(lt, 1.5);
      st.title.update(lt, 2.0);
      st.date.update(lt, 2.12);

      const h = headAt(lt);
      const hi = Math.floor(h);
      const pts = PTS.slice(0, hi + 1);
      const hx = xOf(h);
      const hy = yOf(cal.cum(hi));
      pts.push([hx, hy]);
      st.line.setAttribute('d', U.pathD(pts));
      st.area.setAttribute('d', `${U.pathD(pts)}L${hx.toFixed(1)} ${BASE}L${X0} ${BASE}Z`);
      st.dot.setAttribute('cx', hx.toFixed(1));
      st.dot.setAttribute('cy', hy.toFixed(1));
      const bp = U.mod(lt, T.SPB) / T.SPB;
      st.pulse.setAttribute('cx', hx.toFixed(1));
      st.pulse.setAttribute('cy', hy.toFixed(1));
      st.pulse.setAttribute('r', (10 + 30 * E.outCubic(bp)).toFixed(1));
      st.pulse.setAttribute('opacity', (0.8 * (1 - bp)).toFixed(3));

      st.marks.forEach((m) => {
        const p = U.prog(h, m.d, m.d + 60);
        m.g.setAttribute('opacity', U.clamp(p * 2).toFixed(3));
      });

      // End label: arrives from the montage, locks with a pop when the curve reaches it
      const lock = U.prog(lt, 1.0, 1.25);
      const s = lt < 1.0 ? 1 : 1 + 0.18 * Math.sin(Math.PI * lock);
      st.endLbl.el.style.transformOrigin = '50% 50%';
      st.endLbl.el.style.transform = `scale(${(s * (1 + 0.015 * Math.sin(lt * 4))).toFixed(4)})`;
      st.endLbl.el.style.color = lt >= 1.0 ? C.green : C.paper;
    },
  });
})((window.SX = window.SX || {}));
