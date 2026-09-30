/* 01 HOOK — "2017년 11월, / 구독자 0명에서"
   b1 "구독자 3,387명" springs in · b2 the number rewinds through the real daily totals
   (RGB split + jitter, the dial reel spins backward) · b3 lands on 0 and "2017년 11월," rises ·
   b4 holds, then the 0 shrinks into a dot that opens the iris into scene 02. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;

  const HX = 120;
  const HY = 318;
  const DIAL = { x: 1480, y: 520 };
  const RW0 = 0.5; // rewind window (b2)
  const RW1 = 0.96;
  const SHRINK = 1.7;
  SX.L.hookDot = { x: 700, y: 600 };

  /** Day index shown at scene time lt: today on b1, rewinding on b2, day 0 from b3 */
  const dayAt = (lt) => cal.last * (1 - E.inOutCubic(U.prog(lt, RW0, RW1)));

  SX.defineScene({
    id: 1,
    role: 'HOOK',
    bg: 'dark',
    src: 'DAILY SUBSCRIBERS',
    ruler: (lt) => {
      const d = dayAt(lt);
      return { from: 0, to: d, mark: d };
    },

    build(cam) {
      const st = {};
      st.glow = ui.glow(cam, DIAL.x, DIAL.y, C.green, 0.13);

      // Tape-reel dial: dashed rings + 90 ticks, spins backward while the count rewinds
      const svg = U.svgFull();
      st.reel = U.s('g');
      [150, 232, 318].forEach((r, i) =>
        st.reel.appendChild(U.s('circle', {
          cx: DIAL.x, cy: DIAL.y, r, fill: 'none', stroke: C.paper,
          'stroke-width': i === 2 ? 2 : 1.2, opacity: 0.22 + i * 0.08, 'stroke-dasharray': i % 2 ? '2 12' : '14 8',
        })));
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * Math.PI * 2;
        const r0 = k % 15 === 0 ? 372 : 386;
        st.reel.appendChild(U.s('line', {
          x1: DIAL.x + Math.cos(a) * r0, y1: DIAL.y + Math.sin(a) * r0,
          x2: DIAL.x + Math.cos(a) * 400, y2: DIAL.y + Math.sin(a) * 400,
          stroke: C.paper, 'stroke-width': k % 15 === 0 ? 3 : 1.5, opacity: 0.5,
        }));
      }
      svg.appendChild(st.reel);
      cam.appendChild(svg);

      // Dial center: year + month-day of the day being shown
      st.year = ui.counter(cam, { x: DIAL.x, y: DIAL.y - 70, size: 116, align: 'center' });
      st.md = U.h('div', { class: 'mono', style: `left:${DIAL.x - 200}px;width:400px;text-align:center;top:${DIAL.y + 58}px;font-size:22px` });
      cam.appendChild(st.md);

      st.capNow = ui.caption(cam, { x: HX, y: HY - 46, text: `TODAY / ${D.asOf}` });
      st.capEst = ui.caption(cam, { x: HX, y: HY - 46, text: `EST. ${D.start} / CHANNEL OPEN` });

      // "구독자 [3,387]명[에서]" — number plus two chroma ghosts for the rewind glitch
      const wrap = U.h('span', { style: 'position:relative;display:inline-block' });
      st.ghostA = ui.digits('hook-ghost');
      st.ghostB = ui.digits('hook-ghost');
      st.ghostA.el.style.color = C.red;
      st.ghostB.el.style.color = C.green;
      st.num = ui.digits();
      st.num.el.style.position = 'relative';
      wrap.append(st.ghostA.el, st.ghostB.el, st.num.el);
      st.wrap = wrap;
      st.sfx = U.h('span', { text: '에서' });
      st.head = ui.headline(cam, {
        x: HX, y: HY, size: 168,
        lines: [`${D.start.slice(0, 4)}년 ${Number(D.start.slice(5, 7))}월,`, ['구독자 ', wrap, '명', st.sfx]],
        lineDelay: [1.0, 0],
      });

      st.dot = U.h('div', { style: `width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:${C.paper}` });
      cam.appendChild(st.dot);
      return st;
    },

    update(st, lt) {
      ui.breathe(st.glow, lt, 0.06);
      const d = dayAt(lt);
      const rw = E.inOutCubic(U.prog(lt, RW0, RW1));
      st.reel.setAttribute('transform', `rotate(${(lt * 14 - 900 * rw).toFixed(2)} ${DIAL.x} ${DIAL.y})`);

      const iso = cal.iso(d);
      st.year.set(iso.slice(0, 4));
      U.setText(st.md, iso.slice(5).replace('-', ' · '));
      // the dial readout scrubs with the rewind, then steps back once the headline carries the date
      const de = ui.enter(lt, 0.04, 0.45);
      const dq = 1 - 0.8 * E.outCubic(U.prog(lt, 1.0, 1.3));
      st.year.el.style.opacity = st.md.style.opacity = (de.o * dq).toFixed(3);
      st.year.el.style.transform = `scale(${U.lerp(0.8, 1, de.e).toFixed(4)})`;

      st.capNow.update(lt, 0, 0.9);
      st.capEst.update(lt, 1.0);
      st.head.update(lt, 0, SHRINK);

      // Number: today's total, then the real cumulative count at each rewound day
      const str = U.fmtInt(cal.cum(d));
      [st.num, st.ghostA, st.ghostB].forEach((n) => n.set(str));
      const glitch = lt >= RW0 && lt < RW1 + 0.04;
      const step = Math.floor(lt / T.E32);
      const jx = glitch ? (U.hash(step, 11) - 0.5) * 34 : 0;
      st.num.el.style.transform = `translate3d(${jx.toFixed(1)}px,0,0)`;
      [[st.ghostA, -1], [st.ghostB, 1]].forEach(([g, side]) => {
        g.el.style.opacity = glitch ? 0.9 : 0;
        const off = side * (8 + U.hash(step, side > 0 ? 5 : 6) * 16);
        g.el.style.transform = `translate3d(${(jx + off).toFixed(1)}px,${(side * U.hash(step, 8) * 6).toFixed(1)}px,0)`;
      });
      st.wrap.style.filter = glitch ? `blur(${(1.5 * Math.sin(Math.PI * U.prog(lt, RW0, RW1))).toFixed(2)}px)` : 'none';

      // "에서" joins on b3 with the year line
      const se = ui.enter(lt, 1.08, 0.45);
      const sq = ui.exit(lt, SHRINK, 0.24);
      st.sfx.style.opacity = lt < 1.08 ? 0 : (se.o * (1 - sq)).toFixed(3);
      st.sfx.style.transform = `translate3d(0,${((1 - se.e) * 0.5 - sq * 0.9).toFixed(4)}em,0)`;

      // b4 tail: the 0 stays while the headline leaves, then collapses into a dot (iris origin)
      const cx = HX + st.wrap.offsetLeft + st.wrap.offsetWidth / 2;
      const cy = HY + st.wrap.offsetTop + st.wrap.offsetHeight * 0.52;
      SX.L.hookDot = { x: cx, y: cy };
      if (lt >= SHRINK) {
        st.wrap.style.opacity = 1;
        st.wrap.style.transform = `scale(${U.lerp(1, 0.2, E.inCubic(U.prog(lt, SHRINK, SHRINK + 0.1))).toFixed(4)})`;
        st.wrap.style.visibility = lt >= SHRINK + 0.1 ? 'hidden' : '';
      } else {
        st.wrap.style.visibility = '';
      }
      const dp = U.prog(lt, SHRINK + 0.08, SHRINK + 0.16);
      st.dot.style.display = lt >= SHRINK + 0.08 ? '' : 'none';
      st.dot.style.left = `${cx.toFixed(1)}px`;
      st.dot.style.top = `${cy.toFixed(1)}px`;
      st.dot.style.transform = `scale(${U.lerp(1.8, 0.6, E.outCubic(dp)).toFixed(4)})`;
    },
  });
})((window.SX = window.SX || {}));
