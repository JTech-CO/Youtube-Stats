/* 09 PROOF — "첫 1,000명에 8년 넘게, / 다음 2,000명은 100일."
   Race bars on one day scale: 0 → 1,000 grows through the years on b1–b2 (3,079 days,
   year notches pass inside the bar), then 1,000 → 2,000 (72) and 2,000 → 3,000 (28) snap in
   on b3 — barely visible next to it. b4: a bracket joins the two short bars: 100 DAYS.
   Enters with the tail of the RGB split; leaves on a hard cut. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const R = D.race;
  const M = D.raceMeta;

  const LX = 120;
  const BX = 340;
  const BW_MAX = 1400;
  const KX = BW_MAX / R[0].days;
  const ROWS_Y = [620, 736, 852];
  const BH = 54;
  const G1 = [0.04, 0.98]; // bar 1 growth (b1–b2)
  const SNAP = [1.0, 1.08];

  const ym = M.yearsTo1000;
  const line1 = `첫 ${U.fmtInt(R[0].to)}명에 ${ym.years}년${ym.months ? ' 넘게' : ''},`;
  const line2 = `다음 ${U.fmtInt(R[2].to - R[0].to)}명은 ${M.days1000to3000}일.`;

  SX.defineScene({
    id: 9,
    role: 'PROOF',
    bg: 'paper',
    src: 'DAYS BETWEEN MILESTONES',
    ruler: (lt) => {
      const g = E.inOutSine(U.prog(lt, G1[0], G1[1]));
      const d = lt < SNAP[0] ? g * R[0].days : cal.idx(lt < SNAP[1] ? R[1].date : R[2].date);
      return { from: 0, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.grid = U.h('div', { class: 'blueprint' });
      cam.appendChild(st.grid);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: 'DAYS PER 1,000 / RACE' });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 120, stagger: 0.022, lines: [line1, line2] });

      const svg = U.svgFull();
      st.rows = R.map((r, i) => {
        const y = ROWS_Y[i];
        const from = i ? R[i - 1].to : 0;
        const g = U.s('g');
        const lbl = U.s('text', { x: LX, y: y + BH / 2 + 7, fill: C.ink, 'font-size': 21, style: 'font-family:var(--f-mono);letter-spacing:.08em', text: `${U.fmtInt(from)} → ${U.fmtInt(r.to)}` });
        const track = U.s('line', { x1: BX, x2: BX + BW_MAX, y1: y + BH / 2, y2: y + BH / 2, stroke: C.ink, 'stroke-width': 1, 'stroke-dasharray': '2 8', opacity: 0.35 });
        const bar = U.s('rect', { x: BX, y, height: BH, width: 0, fill: i ? C.red : C.ink });
        const val = U.s('text', { y: y + BH / 2 + 8, fill: C.ink, 'font-size': 22, style: 'font-family:var(--f-mono);letter-spacing:.06em', text: `${r.days} DAYS · → ${r.date}` });
        g.append(track, lbl, bar, val);
        svg.appendChild(g);
        return { r, i, y, g, lbl, bar, val };
      });

      // Year notches inside bar 1
      st.notches = [];
      for (let y = Number(D.start.slice(0, 4)) + 1; y <= Number(R[0].date.slice(0, 4)); y++) {
        const d = cal.idx(`${y}-01-01`);
        const x = BX + d * KX;
        const g = U.s('g');
        g.append(
          U.s('line', { x1: x, x2: x, y1: ROWS_Y[0], y2: ROWS_Y[0] + 12, stroke: C.paper, 'stroke-width': 2 }),
          U.s('text', { x: x + 6, y: ROWS_Y[0] + BH - 12, fill: C.paper, 'font-size': 15, style: 'font-family:var(--f-mono)', text: String(y) }));
        svg.appendChild(g);
        st.notches.push({ d, g });
      }
      st.inLbl = U.s('text', { y: ROWS_Y[0] + BH / 2 + 8, 'text-anchor': 'end', fill: C.paper, 'font-size': 24, style: 'font-family:var(--f-mono);font-weight:700;letter-spacing:.04em' });
      svg.appendChild(st.inLbl);

      // b4 bracket over rows 2–3
      const bx = 900;
      st.bracket = U.s('g', { stroke: C.ink, fill: C.ink });
      st.bracket.append(
        U.s('polyline', { points: `${bx - 14},${ROWS_Y[1]} ${bx},${ROWS_Y[1]} ${bx},${ROWS_Y[2] + BH} ${bx - 14},${ROWS_Y[2] + BH}`, fill: 'none', 'stroke-width': 3 }),
        U.s('line', { x1: bx, x2: bx + 22, y1: (ROWS_Y[1] + ROWS_Y[2] + BH) / 2, y2: (ROWS_Y[1] + ROWS_Y[2] + BH) / 2, 'stroke-width': 3 }));
      svg.appendChild(st.bracket);
      cam.appendChild(svg);
      st.hundred = ui.counter(cam, { x: bx + 40, y: (ROWS_Y[1] + ROWS_Y[2] + BH) / 2 - 50, size: 100 });
      st.hundred.set(`${M.days1000to3000} DAYS`);
      return st;
    },

    update(st, lt) {
      st.grid.style.transform = `translate3d(${(-lt * 12).toFixed(1)}px,0,0)`;
      // tail of the RGB split from scene 08 (first 5 frames), on the content only so the paper stays flat
      const cam = st.grid.parentNode;
      const rg = lt >= 0 ? 1 - U.prog(lt, 0, 5 / T.FPS) : 0;
      if (rg > 0) SX.transitions.rgb(cam, 36 * rg);
      else cam.style.filter = '';

      st.cap.update(lt, 0);
      st.head.update(lt, 0.02);

      const g = E.inOutSine(U.prog(lt, G1[0], G1[1]));
      st.rows.forEach((o) => {
        const e = ui.enter(lt, o.i * 0.05, 0.4);
        o.lbl.setAttribute('opacity', e.o.toFixed(3));
        let w;
        let vo;
        if (o.i === 0) {
          w = g * o.r.days * KX;
          vo = 0;
        } else {
          const t0 = SNAP[o.i - 1];
          const p = U.prog(lt, t0, t0 + 0.12);
          w = lt < t0 ? 0 : o.r.days * KX * E.outBack(p, 3);
          vo = lt < t0 ? 0 : U.clamp(p * 3);
          const wp = E.outExpo(U.prog(lt, t0 + 0.04, t0 + 0.2));
          o.val.style.clipPath = `inset(0 ${((1 - wp) * 100).toFixed(1)}% 0 0)`;
        }
        o.bar.setAttribute('width', Math.max(0, w).toFixed(2));
        o.val.setAttribute('x', (BX + Math.max(w, 0) + 18).toFixed(1));
        o.val.setAttribute('opacity', vo.toFixed(3));
        o.g.setAttribute('transform', `translate(${((1 - e.e) * -40).toFixed(1)} 0)`);
      });

      const w1 = g * R[0].days * KX;
      // notches show once the bar has passed them, except under the day label at the bar's end
      const lblW = w1 > 420 ? (lt >= G1[1] ? 380 : 190) : 0;
      st.notches.forEach((n) => n.g.setAttribute('opacity', n.d * KX < w1 - 8 - lblW ? 1 : 0));
      const days = Math.round(g * R[0].days);
      const landed = lt >= G1[1];
      st.inLbl.textContent = landed ? `${U.fmtInt(R[0].days)} DAYS · ${ym.years}Y ${ym.months}M` : `${U.fmtInt(days)} DAYS`;
      st.inLbl.setAttribute('x', (BX + w1 - 16).toFixed(1));
      st.inLbl.setAttribute('opacity', w1 > 420 ? 1 : 0);

      const bp = U.prog(lt, 1.5, 1.62);
      st.bracket.setAttribute('opacity', U.clamp(bp * 3).toFixed(3));
      st.bracket.setAttribute('transform', `translate(${((1 - E.outBack(bp, 2)) * -30).toFixed(1)} 0)`);
      ui.pop(st.hundred.el, lt, 1.52, { from: 0.4 });
      if (lt >= 1.52) st.hundred.el.style.transform += ` translate3d(0,${(2 * Math.sin(lt * 6)).toFixed(2)}px,0)`;
    },
  });
})((window.SX = window.SX || {}));
