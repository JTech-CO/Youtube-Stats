/* Persistent HUD: crop marks, scene id + 12-part progress, BPM + 4 beat cells,
   2017–2026 date ruler with the cumulative-subscriber sparkline, data source line */
(function (SX) {
  'use strict';
  const { U, T, cal } = SX;
  const D = SX.DATA;

  const RULER_W = 1016;
  const SPARK_H = 28;
  const xOf = (i) => (U.clamp(i, 0, cal.last) / cal.last) * RULER_W;

  let root, tlTxt, prog, beats, src, crops, ticks, hl, mark, markTxt, clipRect;

  function sparkPath() {
    const max = D.cum[cal.last];
    const pts = [];
    for (let i = 0; i <= cal.last; i += 7) pts.push([xOf(i), SPARK_H - (D.cum[i] / max) * SPARK_H]);
    pts.push([xOf(cal.last), SPARK_H - SPARK_H]);
    return `${U.pathD(pts)}L${RULER_W} ${SPARK_H}L0 ${SPARK_H}Z`;
  }

  SX.hud = {
    build(stage) {
      root = stage.querySelector('#hud');
      crops = ['tl', 'tr', 'bl', 'br'].map((c) => U.h('div', { class: `crop ${c}` }));

      tlTxt = U.h('span');
      prog = T.SLOTS.map(() => U.h('i', {}, U.h('b')));
      const tl = U.h('div', { class: 'hud-tl' }, tlTxt, U.h('span', { class: 'hud-prog' }, prog));

      beats = [0, 1, 2, 3].map(() => U.h('i'));
      const tr = U.h('div', { class: 'hud-tr' },
        U.h('span', { text: `CHANNEL ${D.start.slice(0, 4)}→${D.asOf.slice(0, 4)} · ${T.BPM} BPM` }),
        U.h('span', { class: 'hud-beats' }, beats));
      src = U.h('div', { class: 'hud-src' });

      const ruler = U.h('div', { class: 'hud-ruler' });
      const svg = U.s('svg', { width: RULER_W, height: SPARK_H, viewBox: `0 0 ${RULER_W} ${SPARK_H}` });
      const clip = U.s('clipPath', { id: 'hud-spark-clip' });
      clipRect = U.s('rect', { x: 0, y: -2, width: 0, height: SPARK_H + 4 });
      clip.appendChild(clipRect);
      const d = sparkPath();
      svg.append(
        U.s('defs', {}, clip),
        U.s('path', { d, fill: 'currentColor', opacity: 0.18 }),
        U.s('path', { d, fill: 'currentColor', opacity: 0.75, 'clip-path': 'url(#hud-spark-clip)' }));
      ruler.append(svg, U.h('div', { class: 'base' }));

      ticks = [];
      const y0 = Number(D.start.slice(0, 4)) + 1;
      const y1 = Number(D.asOf.slice(0, 4));
      for (let y = y0; y <= y1; y++) {
        const i = cal.idx(`${y}-01-01`);
        const tk = U.h('div', { class: 'tick', style: `left:${xOf(i)}px` });
        ruler.appendChild(tk);
        ticks.push({ i, el: tk });
        if (y % 2 === 0) ruler.appendChild(U.h('div', { class: 'lbl', style: `left:${xOf(i)}px`, text: String(y) }));
      }
      hl = U.h('div', { class: 'hl' });
      markTxt = U.h('span');
      mark = U.h('div', { class: 'mark' }, markTxt);
      ruler.append(hl, mark);

      root.append(...crops, tl, tr, src, ruler);
    },

    /** sc: { def, lt, slot } of the scene that owns the current beat */
    update(t, sc) {
      const { def, lt, slot } = sc;
      const bg = def.bgAt ? def.bgAt(lt) : def.bg;
      root.style.setProperty('--hud-fg', SX.BG[bg].fg);

      U.setText(tlTxt, `${U.pad(def.id)} / ${T.SLOTS.length} — ${def.role}`);
      prog.forEach((p, k) => {
        const f = k < slot.index ? 1 : k > slot.index ? 0 : U.clamp(lt / slot.dur);
        p.firstChild.style.width = `${(f * 100).toFixed(1)}%`;
      });
      U.setText(src, `DATA AS OF ${D.asOf} · SRC: STUDIO CSV · ${def.src}`);

      const beat = Math.floor(lt / T.SPB + 1e-6);
      const pb = U.pulse(lt, T.SPB, 0.1);
      beats.forEach((b, i) => {
        b.classList.toggle('on', i === beat % 4);
        b.style.transform = i === beat % 4 ? `scale(${(1 + 0.25 * pb).toFixed(3)})` : '';
      });

      const arm = (28 + 5 * pb).toFixed(2) + 'px';
      crops.forEach((c) => {
        c.style.width = arm;
        c.style.height = arm;
      });

      const r = def.ruler(lt);
      const from = Math.min(r.from, r.to);
      const to = Math.max(r.from, r.to);
      hl.style.left = `${xOf(from) - 3}px`;
      hl.style.width = `${xOf(to) - xOf(from) + 6}px`;
      clipRect.setAttribute('x', xOf(from).toFixed(1));
      clipRect.setAttribute('width', Math.max(1, xOf(to) - xOf(from)).toFixed(1));
      ticks.forEach((tk) => tk.el.classList.toggle('lit', tk.i >= from - 0.5 && tk.i <= to + 0.5));
      mark.style.left = `${xOf(r.mark).toFixed(1)}px`;
      U.setText(markTxt, r.label || cal.iso(U.clamp(r.mark, 0, cal.last)));
    },
  };

  /** Ruler helper for scenes: marker hops to days[beat] on each beat (lands in 4 frames) */
  SX.hud.hop = (lt, days, step = T.SPB) => {
    let v = days[0];
    for (let i = 1; i < days.length; i++) {
      v += (days[i] - days[i - 1]) * SX.E.outCubic(U.prog(lt, i * step - T.LEAD, i * step));
    }
    return v;
  };
})((window.SX = window.SX || {}));
