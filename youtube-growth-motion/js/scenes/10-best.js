/* 10 FEATURE — "하루 최고 / +76명,"
   Hard cut in (one ink flash frame). The five best days arrive as a stacked deck of stubs
   (b1), fan out (b2), the best one lifts (b3) and takes a BEST DAY stamp (b4).
   Tail: that card swings to the center and grows until its paper fills the frame —
   the first montage cut is the same paper (match cut). */
(function (SX) {
  'use strict';
  const { U, E, T, ui, C, cal } = SX;
  const D = SX.DATA;
  const BEST = D.best;

  const DX = 1300;
  const DY = 590;
  const FAN = [0, -9, 9, -18, 18];
  const FX = [0, -70, 70, -140, 140];
  const OUT = 1.72;
  const ZOOM = 5;
  const ZOOM_Y = 830; // card pivots on its bottom edge: at ×5 it covers the frame from here
  const sameMonth = BEST.every((b) => b.date.slice(0, 7) === BEST[0].date.slice(0, 7));
  const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

  function barcode(seed) {
    const svg = U.s('svg', { class: 'cd-bar', viewBox: '0 0 360 46', preserveAspectRatio: 'none' });
    let x = 0;
    for (let i = 0; x < 360; i++) {
      const w = 1 + Math.floor(U.hash(i, seed) * 4);
      if (i % 2 === 0) svg.appendChild(U.s('rect', { x, y: 0, width: w, height: 46, fill: C.ink }));
      x += w + 1;
    }
    return svg;
  }

  SX.defineScene({
    id: 10,
    role: 'FEATURE',
    bg: 'yellow',
    src: 'DAILY NET SUBSCRIBERS',
    ruler: (lt) => {
      const d = cal.idx(BEST[0].date);
      const a = Math.min(...BEST.map((b) => cal.idx(b.date)));
      const z = Math.max(...BEST.map((b) => cal.idx(b.date)));
      return { from: a, to: z, mark: SX.hud.hop(lt, [a, a, d]) };
    },

    build(cam) {
      const st = {};
      st.tex = U.h('div', { class: 'halftone' });
      cam.appendChild(st.tex);
      st.cap = ui.caption(cam, { x: 120, y: 172, text: `TOP ${BEST.length} DAYS / ${BEST[0].date.slice(0, 4)}` });
      st.head = ui.headline(cam, { x: 120, y: 212, size: 150, lines: ['하루 최고', `${ui.signed(BEST[0].net)}명,`] });
      st.note = U.box(124, 580, 'mono', sameMonth ? `ALL ${BEST.length} IN ${monthName(BEST[0].date)}` : `TOP ${BEST.length} DAYS`);
      st.month = U.box(124, 624, 'chip solid', `BEST MONTH · ${D.bestMonth.ym} · ${ui.signed(D.bestMonth.net)}`);
      st.month.style.fontSize = '20px';
      cam.append(st.note, st.month);

      st.deck = U.h('div', { class: 'deck' });
      cam.appendChild(st.deck);
      st.cards = BEST.map((b, j) => {
        const big = U.h('div', { class: 'cd-big' }, U.h('span', { class: 'cd-up', text: ui.signed(b.net) }));
        const body = U.h('div', { class: 'cd-body' },
          U.h('div', { class: 'cd-top' }, U.h('span', { text: `${U.pad(j + 1)} / ${U.pad(BEST.length)}` }), U.h('span', { text: 'SUBSCRIBERS' })),
          U.h('div', { class: 'cd-date', text: b.date }),
          big,
          U.h('div', { class: 'cd-sub', text: `TOTAL ${U.fmtInt(b.cum)}` }),
          barcode(97 + j));
        const el = U.h('div', { class: 'card' }, body);
        el.style.zIndex = String(10 - j);
        st.deck.appendChild(el);
        return { el, body, j };
      });
      st.stamp = ui.stamp(st.cards[0].el, { x: 210, y: 462, main: 'BEST DAY', sub: `${BEST[0].date} · #1 OF ${U.fmtInt(D.days)}`, rot: -12, color: C.red });
      st.stamp.el.style.zIndex = 3;

      st.flash = U.h('div', { style: `left:0;top:0;width:${T.W}px;height:${T.H}px;background:${C.ink}` });
      cam.appendChild(st.flash);
      return st;
    },

    update(st, lt) {
      st.flash.style.display = lt >= 0 && lt < 1 / T.FPS ? '' : 'none';
      st.tex.style.transform = `translate3d(${(lt * 10).toFixed(1)}px,${(-lt * 6).toFixed(1)}px,0)`;
      st.cap.update(lt, 0.04, OUT);
      st.head.update(lt, 0.06, OUT);
      const out = ui.exit(lt, OUT, 0.2);
      [st.note, st.month].forEach((el, i) => {
        const p = U.prog(lt, 1.0 + i * 0.5, 1.3 + i * 0.5);
        el.style.opacity = (U.clamp(p * 3) * (1 - out)).toFixed(3);
        el.style.transform = `translate3d(${((1 - E.outCubic(p)) * -40).toFixed(1)}px,${(-out * 40).toFixed(1)}px,0)`;
      });

      const zoom = E.inCubic(U.prog(lt, OUT, 2.0));
      st.cards.forEach((c) => {
        const { j } = c;
        const inP = E.outCubic(U.prog(lt, 0.02 + j * 0.04, 0.4 + j * 0.04));
        const fan = E.outBack(U.prog(lt, 0.5 + j * 0.03, 0.85 + j * 0.03), 1.6);
        let x = U.lerp(2500, DX, inP) + FX[j] * fan;
        let y = DY + j * 6 * (1 - fan);
        let rot = U.lerp(8, 0, inP) + FAN[j] * fan + 0.4 * Math.sin(lt * 3 + j);
        let sc = 1;
        let op = 1;
        if (j === 0) {
          const lift = E.outBack(U.prog(lt, 1.0, 1.3), 2);
          y -= 36 * lift;
          sc += 0.07 * lift;
          // tail: swing to center and grow past the frame
          x = U.lerp(x, T.W / 2, zoom);
          y = U.lerp(y, ZOOM_Y, zoom);
          rot = U.lerp(rot, 0, zoom);
          sc = U.lerp(sc, ZOOM, zoom);
          c.body.style.opacity = (1 - U.prog(lt, OUT, OUT + 0.12)).toFixed(3);
        } else {
          sc -= 0.04 * E.outCubic(U.prog(lt, 1.0, 1.3));
          op = 1 - out;
        }
        c.el.style.left = `${x.toFixed(1)}px`;
        c.el.style.top = `${y.toFixed(1)}px`;
        c.el.style.opacity = op.toFixed(3);
        c.el.style.transform = `rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
      });
      st.stamp.update(lt, 1.5);
      if (lt >= OUT) st.stamp.el.style.opacity = (1 - U.prog(lt, OUT, OUT + 0.1)).toFixed(3);
    },
  });
})((window.SX = window.SX || {}));
