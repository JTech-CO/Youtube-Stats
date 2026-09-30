/* 11 MONTAGE — numbers only. Eight hard cuts on 8th notes, 5-color rotation.
   Repeated data changes form: 1,147 (flatline counter → big number), 28 days (race bar → big
   number), 3,387 (rewind counter / candle tag → big number). The first cut is the paper of the
   card that filled scene 10; the last number flies into the end card as its curve label. */
(function (SX) {
  'use strict';
  const { U, E, T, ui, cal } = SX;
  const D = SX.DATA;
  const TT = D.totals;
  const P = D.plateau;
  const R = D.race;

  const zeroPct = Math.round((TT.zeroViewDays / TT.days) * 1000);
  const CUTS = [
    { bg: 'paper', big: U.fmtInt(TT.days), size: 330, label: `DAYS · ${D.start} → ${D.asOf}`, span: [0, cal.last] },
    { bg: 'dark', big: U.fmtInt(TT.views), size: 300, label: 'TOTAL VIEWS', span: [0, cal.last] },
    { bg: 'red', big: U.fmtInt(TT.valid), size: 300, label: 'TOTAL ENGAGED VIEWS', span: [0, cal.last] },
    { bg: 'green', big: U.fmtInt(TT.hoursInt), size: 330, label: `HOURS WATCHED · ${U.fmtFixed(Number(TT.hours), 2)} H`, span: [0, cal.last] },
    { bg: 'yellow', big: U.fmtInt(TT.zeroViewDays), size: 360, label: 'DAYS WITH ZERO VIEWS', kind: 'zero', span: [0, cal.last] },
    { bg: 'red', big: U.fmtInt(P.days), size: 360, label: `DAYS STUCK AT ${P.min}–${P.max} SUBSCRIBERS`, span: [cal.idx(P.from), cal.idx(P.to)] },
    { bg: 'green', big: String(R[2].days), size: 420, top: 250, label: `DAYS · ${U.fmtInt(R[1].to)} → ${U.fmtInt(R[2].to)} SUBSCRIBERS`, span: [cal.idx(R[1].date), cal.idx(R[2].date)] },
    { bg: 'dark', big: U.fmtInt(TT.subs), size: 360, label: `SUBSCRIBERS · ${D.asOf}`, span: [0, cal.last], fly: true },
  ];
  const cutAt = (lt) => U.clamp(Math.floor(lt / T.E8), 0, CUTS.length - 1);
  const FLY = 1.78;

  SX.defineScene({
    id: 11,
    role: 'MONTAGE',
    bg: 'dark',
    src: 'TOTALS',
    bgAt: (lt) => CUTS[cutAt(lt)].bg,
    ruler: (lt) => {
      const c = CUTS[cutAt(lt)];
      return { from: c.span[0], to: c.span[1], mark: c.span[1] };
    },

    build(cam) {
      const st = { cuts: [] };
      CUTS.forEach((c, k) => {
        const el = U.h('div', { class: `cut bg-${c.bg}` });
        cam.appendChild(el);
        const o = { el, c };
        el.appendChild(U.box(120, 172, 'mono cut-idx', `${U.pad(k + 1)} / ${U.pad(CUTS.length)}`));
        const top = c.top ?? 290;
        o.big = ui.counter(el, { x: 960, y: top, size: c.size, align: 'center' });
        o.big.set(c.big);
        o.big.el.style.transformOrigin = '50% 50%';
        const ly = top + c.size * 1.16 + 22;
        o.lbl = U.box(0, ly, 'mono cut-label', c.label);
        el.appendChild(o.lbl);
        if (c.kind === 'zero') {
          const f = TT.zeroViewDays / TT.days;
          o.bar = U.h('div', { class: 'segbar abs', style: `left:560px;top:${ly + 58}px;width:800px;transform-origin:0 50%` },
            U.h('i', { style: `width:${(f * 100).toFixed(2)}%;background:var(--ink)` }),
            U.h('i', { style: `width:${((1 - f) * 100).toFixed(2)}%;background:var(--ink);opacity:.18` }));
          o.sub = U.box(0, ly + 100, 'mono cut-label', `${U.fmtFixed(zeroPct / 10, 1)}% OF ALL ${U.fmtInt(TT.days)} DAYS`);
          o.sub.style.fontSize = '20px';
          el.append(o.bar, o.sub);
        }
        st.cuts.push(o);
      });
      return st;
    },

    update(st, lt) {
      const k = cutAt(lt);
      st.cuts.forEach((o, i) => {
        o.el.style.display = i === k ? '' : 'none';
        if (i !== k) return;
        const c = lt - i * T.E8;
        let s = U.lerp(1.16, 1, E.outExpo(U.prog(c, 0, 0.2)));
        let dx = -18 * (c / T.E8);
        let dy = 0;
        if (o.c.fly && lt >= FLY) {
          // 3,387 shrinks into the end card's curve label
          const L = SX.L.endLabel;
          const f = E.inOutCubic(U.prog(lt, FLY, 2.0));
          const top = o.c.top ?? 290;
          const cy = top + o.c.size / 2;
          dx = U.lerp(dx, L.x - 960, f);
          dy = U.lerp(0, L.y - cy, f);
          s = U.lerp(s, L.size / o.c.size, f);
        }
        o.big.el.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
        const wipe = E.outExpo(U.prog(c, 0.02, 0.15));
        const fade = o.c.fly ? 1 - U.prog(lt, FLY, FLY + 0.08) : 1;
        [o.lbl, o.sub].forEach((el) => {
          if (!el) return;
          el.style.clipPath = `inset(0 ${((1 - wipe) * 100).toFixed(1)}% 0 0)`;
          el.style.opacity = fade.toFixed(3);
        });
        if (o.bar) o.bar.style.transform = `scaleX(${E.outExpo(U.prog(c, 0.03, 0.18)).toFixed(4)})`;
      });
    },
  });
})((window.SX = window.SX || {}));
