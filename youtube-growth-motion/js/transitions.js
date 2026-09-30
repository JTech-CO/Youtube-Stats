/* Scene-to-scene transitions. Index k = transition from scene k+1 to k+2.
   lead = seconds before the beat when the transition starts (3–5 frames).
   Transitions with lead 0 are match cuts / hard cuts handled inside the scenes.
   Each of the eight template techniques is used exactly once:
   iris, explode→converge (scene 02), ring burst, strip shutter, motion-blur slide,
   slice glitch, RGB split, hard cut (09 → 10). */
(function (SX) {
  'use strict';
  const { U, E, T } = SX;
  const W = T.W;
  const H = T.H;
  let layer = null;
  let burstSvg = null;
  let burstRings = [];
  let blurNode = null;
  let rgbR = null;
  let rgbB = null;

  const cut = { lead: 0 };

  // 01 → 02: the dot left by the 0 opens as an iris onto the paper scene
  const iris = {
    lead: T.LEAD,
    apply(p, out, inn) {
      const c = SX.L.hookDot;
      const r = U.lerp(20, 2250, E.inCubic(p));
      inn.root.style.zIndex = 2;
      inn.root.style.clipPath = `circle(${r.toFixed(1)}px at ${c.x.toFixed(1)}px ${c.y.toFixed(1)}px)`;
    },
  };

  // 04 → 05: the imploded grid bursts as a ring; yellow inside it, the ring lands as the dial
  const burst = {
    lead: 5 / T.FPS,
    apply(p, out, inn) {
      const c = SX.L.dialCenter;
      const r = 2000 * E.inCubic(p) + 10;
      inn.root.style.zIndex = 2;
      inn.root.style.clipPath = `circle(${r.toFixed(1)}px at ${c.x}px ${c.y}px)`;
      burstSvg.style.display = '';
      burstRings.forEach((ring, i) => {
        ring.setAttribute('cx', c.x);
        ring.setAttribute('cy', c.y);
        ring.setAttribute('r', Math.max(0, r * (i ? 0.84 : 1) + (i ? 0 : 10)).toFixed(1));
        ring.setAttribute('opacity', p >= 1 ? 0 : 1);
      });
    },
    idle() {
      if (burstSvg) burstSvg.style.display = 'none';
    },
  };

  // 05 → 06: twelve strips shoot up from the bottom on a stagger (green behind them)
  const shutter = {
    lead: 5 / T.FPS,
    apply(p, out, inn) {
      const K = 12;
      const sw = W / K;
      const pts = [`0px ${H}px`];
      for (let k = 0; k < K; k++) {
        const q = E.inCubic(U.prog(p, (k % 2 ? 0.18 : 0) + k * 0.012, 1));
        const top = H * (1 - q);
        pts.push(`${(k * sw).toFixed(1)}px ${top.toFixed(1)}px`, `${((k + 1) * sw).toFixed(1)}px ${top.toFixed(1)}px`);
      }
      pts.push(`${W}px ${H}px`);
      inn.root.style.zIndex = 2;
      inn.root.style.clipPath = `polygon(${pts.join(',')})`;
    },
  };

  // 06 → 07: the green scene whips up and out, the red one follows from below, blurred vertically
  const mblur = {
    lead: 5 / T.FPS,
    apply(p, out, inn) {
      const e = E.inCubic(p);
      blurNode.setAttribute('stdDeviation', `0 ${(40 * Math.sin(Math.PI * Math.min(1, p * 1.1))).toFixed(1)}`);
      out.root.style.transform = `translate3d(0,${(-H * e).toFixed(1)}px,0)`;
      inn.root.style.transform = `translate3d(0,${(H * (1 - e)).toFixed(1)}px,0)`;
      out.root.style.filter = inn.root.style.filter = 'url(#sx-mblur)';
    },
  };

  // 07 → 08: horizontal slices of scene 07 tear off in alternating directions
  const slice = {
    lead: T.LEAD,
    apply(p, out, inn, ctx) {
      layer.textContent = '';
      out.root.style.visibility = 'hidden';
      const K = 12;
      const bh = H / K;
      for (let k = 0; k < K; k++) {
        const clone = out.root.cloneNode(true);
        clone.style.visibility = 'visible';
        clone.style.display = '';
        clone.style.clipPath = `inset(${(k * bh).toFixed(1)}px 0px ${(H - (k + 1) * bh).toFixed(1)}px 0px)`;
        const dir = k % 2 ? 1 : -1;
        const delay = U.hash(k, 31) * 0.4;
        const q = E.inCubic(U.prog(p, delay, 1));
        const jit = (U.hash(ctx.frame * 16 + k, 7) - 0.5) * 70 * (1 - q);
        clone.style.transform = `translate3d(${(dir * W * 1.05 * q + jit).toFixed(1)}px,0,0)`;
        layer.appendChild(clone);
      }
      [SX.C.green, SX.C.yellow, SX.C.paper].forEach((col, i) => {
        const y = U.hash(ctx.frame * 3 + i, 41) * H;
        const bar = U.h('div', { style: `position:absolute;left:0;width:${W}px;top:${y.toFixed(0)}px;height:${(4 + U.hash(ctx.frame, i) * 12).toFixed(0)}px;background:${col}` });
        bar.style.transform = `translateX(${((U.hash(ctx.frame + i, 43) - 0.5) * 400).toFixed(0)}px)`;
        layer.appendChild(bar);
      });
    },
    idle() {
      if (layer && layer.firstChild) layer.textContent = '';
    },
  };

  // 08 → 09: red and blue channels of the candle scene tear apart and jitter; scene 09 settles
  // out of the same split in its first frames
  const rgb = {
    lead: 5 / T.FPS,
    apply(p, out, inn, ctx) {
      const e = E.inCubic(p);
      out.root.style.zIndex = 2;
      inn.root.style.visibility = 'hidden'; // the dark scene is transparent over the field: keep 09 out until the beat
      SX.transitions.rgb(out.root, 8 + 70 * e);
      const jx = (U.hash(ctx.frame, 17) - 0.5) * 60 * e;
      out.root.style.transform = `translate3d(${jx.toFixed(1)}px,0,0) scale(${(1 + 0.06 * e).toFixed(4)})`;
    },
  };

  SX.transitions = {
    list: [
      iris, //    01 → 02
      cut, //     02 → 03 scatter → converge into the flat line (drawn by scene 02)
      cut, //     03 → 04 the line's tip explodes (match cut)
      burst, //   04 → 05
      shutter, // 05 → 06
      mblur, //   06 → 07
      slice, //   07 → 08
      rgb, //     08 → 09
      cut, //     09 → 10 hard cut + one flash frame (scene 10)
      cut, //     10 → 11 card fills the frame (match cut)
      cut, //     11 → 12 3,387 flies into the curve label (match cut)
    ],

    /** Apply the shared RGB-split filter to an element (dx in px) */
    rgb(el, dx) {
      rgbR.setAttribute('dx', (-dx).toFixed(1));
      rgbB.setAttribute('dx', dx.toFixed(1));
      el.style.filter = 'url(#sx-rgb)';
    },

    init(layerEl) {
      layer = layerEl;
      const stage = layer.parentNode;
      burstSvg = U.svgFull();
      burstSvg.style.position = 'absolute';
      burstSvg.style.zIndex = 2;
      burstSvg.style.display = 'none';
      burstRings = [
        U.s('circle', { fill: 'none', stroke: SX.C.yellow, 'stroke-width': 18 }),
        U.s('circle', { fill: 'none', stroke: SX.C.paper, 'stroke-width': 4 }),
      ];
      burstSvg.append(...burstRings);
      stage.appendChild(burstSvg);

      // Shared SVG filters (motion blur, RGB split)
      const defs = U.s('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
      blurNode = U.s('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0 0' });
      const mb = U.s('filter', { id: 'sx-mblur', x: '0', y: '-20%', width: '100%', height: '140%', 'color-interpolation-filters': 'sRGB' }, blurNode);
      const cm = (vals, result) => U.s('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: vals, result });
      rgbR = U.s('feOffset', { in: 'r', dx: 0, dy: 0, result: 'ro' });
      rgbB = U.s('feOffset', { in: 'b', dx: 0, dy: 0, result: 'bo' });
      const rf = U.s('filter', { id: 'sx-rgb', x: '-10%', y: '0', width: '120%', height: '100%', 'color-interpolation-filters': 'sRGB' },
        cm('1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r'),
        cm('0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g'),
        cm('0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b'),
        rgbR, rgbB,
        U.s('feBlend', { in: 'ro', in2: 'g', mode: 'screen', result: 'rg' }),
        U.s('feBlend', { in: 'rg', in2: 'bo', mode: 'screen' }));
      defs.append(mb, rf);
      stage.appendChild(defs);
    },
  };
})((window.SX = window.SX || {}));
