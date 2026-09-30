/* Global textures: halftone dot field (dark scenes), film grain, stamp ink mask.
   All seeded and driven by t — no timers, no Math.random. */
(function (SX) {
  'use strict';
  const { U, T } = SX;

  // Field drift (px/s) per scene. Dark scenes only; others are covered by opaque backgrounds.
  const DRIFT = [[-36, 0], null, null, [0, -70], null, null, null, [-48, 0], null, null, null, [0, 24]];
  const PITCH = 30;
  const COLS = Math.ceil(T.W / PITCH) + 2;
  const ROWS = Math.ceil(T.H / PITCH) + 2;

  let ctx = null;
  let grainEl = null;

  function driftOffset(t) {
    let ox = 0;
    let oy = 0;
    T.SLOTS.forEach((slot, i) => {
      const v = DRIFT[i];
      if (!v) return;
      const dt = U.clamp(t, slot.start, slot.end) - slot.start;
      ox += v[0] * dt;
      oy += v[1] * dt;
    });
    return [ox, oy];
  }

  /** Smooth 2D value noise → [0, 1) */
  function noise2(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => U.hash(a * 7919 + b * 104729, seed);
    return U.lerp(U.lerp(h(xi, yi), h(xi + 1, yi), ux), U.lerp(h(xi, yi + 1), h(xi + 1, yi + 1), ux), uy);
  }

  function noiseDataURL(size, seed, fn) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const r = U.rng(seed);
    for (let i = 0; i < size * size; i++) fn(img.data, i * 4, r);
    g.putImageData(img, 0, 0);
    return { canvas: c, g, url: () => c.toDataURL('image/png') };
  }

  SX.fx = {
    build(stage) {
      ctx = stage.querySelector('#field').getContext('2d');

      // Film grain tile
      const grain = noiseDataURL(256, 1126, (d, o, rnd) => {
        const v = Math.floor(rnd() * 255);
        d[o] = d[o + 1] = d[o + 2] = v;
        d[o + 3] = 255;
      });
      grainEl = stage.querySelector('#grain');
      grainEl.style.backgroundImage = `url(${grain.url()})`;

      // Stamp ink mask: mostly opaque with speckle voids and a few worn patches
      const mask = noiseDataURL(220, 2017, (d, o, rnd) => {
        const v = rnd();
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = v < 0.07 ? 0 : v < 0.16 ? 150 : 255;
      });
      const mr = U.rng(77);
      mask.g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 16; i++) {
        mask.g.fillStyle = `rgba(0,0,0,${0.25 + mr() * 0.45})`;
        mask.g.beginPath();
        mask.g.arc(mr() * 220, mr() * 220, 3 + mr() * 11, 0, Math.PI * 2);
        mask.g.fill();
      }
      document.documentElement.style.setProperty('--stamp-mask', `url(${mask.url()})`);
    },

    update(t) {
      const [ox, oy] = driftOffset(t);
      ctx.clearRect(0, 0, T.W, T.H);
      ctx.fillStyle = SX.C.paper;
      // Halftone: dot radius follows a slow noise field that scrolls with the drift
      const sx = U.mod(ox, PITCH);
      const sy = U.mod(oy, PITCH);
      const cx = Math.floor(ox / PITCH);
      const cy = Math.floor(oy / PITCH);
      const beat = U.pulse(t, T.SPB, 0.14);
      ctx.globalAlpha = 0.12 + 0.03 * beat;
      ctx.beginPath();
      for (let r = -1; r < ROWS; r++) {
        for (let c = -1; c < COLS; c++) {
          const n = noise2((c - cx) * 0.11, (r - cy) * 0.11 + t * 0.05, 5);
          const rad = 0.4 + 3.1 * n * n;
          const x = c * PITCH + sx;
          const y = r * PITCH + sy;
          ctx.moveTo(x + rad, y);
          ctx.arc(x, y, rad, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      const f = Math.round(t * T.FPS);
      grainEl.style.backgroundPosition = `${Math.floor(U.hash(f, 3) * 256)}px ${Math.floor(U.hash(f, 9) * 256)}px`;
    },
  };
})((window.SX = window.SX || {}));
