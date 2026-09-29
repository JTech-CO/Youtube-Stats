/* 재생, 레이아웃(기본 5분할 ↔ 한 그래프 포커스), 헤더 값, 툴팁, 조작을 담당한다. */
(function () {
  "use strict";

  const G = window.Growth;
  const stage = document.getElementById("stage");
  if (!G || !G.Chart || !window.CHANNEL_DATA) {
    stage.textContent = "데이터 파일(js/channel-data.js)을 불러오지 못했습니다.";
    return;
  }

  const model = G.createModel(window.CHANNEL_DATA);
  const fmt = G.format;
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim().replace(/\s+/g, " ");
  const theme = {
    font: token("--font"),
    page: token("--page"),
    surface: token("--surface"),
    ink2: token("--ink-2"),
    muted: token("--muted"),
    grid: token("--grid"),
    axis: token("--axis"),
    hover: token("--hover"),
    up: token("--up"),
    down: token("--down"),
    flat: token("--flat"),
  };

  const PERIOD = { day: "일간", week: "주간", month: "월간" };
  const CANDLE = { day: "일봉", week: "주봉", month: "월봉" };
  const PREVIOUS = { day: "전일", week: "전주", month: "전월" };
  const WINDOW = { day: 90, week: 52, month: 36 }; // '최근' 범위와 '전체' 범위 초반의 최소 폭(기간 수)

  // text: 모델 값(시청 시간은 x10000 정수) → 표시 문자열, tagText: 그래프 값(시청 시간은 시간) → 축 태그
  const SPECS = [
    { id: "subs", title: "구독자", unit: "명", kind: "candle", axis: "int", color: theme.up, text: fmt.int, tagText: fmt.int },
    { id: "valid", title: "유효 조회수", unit: "회", kind: "bar", axis: "int", color: token("--s-valid"), text: fmt.int, tagText: fmt.int },
    { id: "views", title: "조회수", unit: "회", kind: "bar", axis: "int", color: token("--s-views"), text: fmt.int, tagText: fmt.int },
    {
      id: "hours",
      title: "시청 시간",
      unit: "시간",
      kind: "bar",
      axis: "hours",
      scale: 10000,
      color: token("--s-hours"),
      text: fmt.hours,
      tagText: (h) => fmt.hours(Math.round(h * 10000)),
    },
    { id: "avg", title: "평균 시청 지속 시간", unit: "", kind: "line", axis: "duration", color: token("--s-avg"), text: fmt.duration, tagText: fmt.duration },
  ];

  const state = {
    t: 0, // 재생 위치(일 단위, 소수부는 다음 날로 넘어가는 중간)
    playing: false,
    dragging: false,
    speed: 30, // 초당 일수
    interval: "week",
    range: "all",
    focus: null,
    hover: null,
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  // ---------- 패널 ----------
  const template = $("panelTemplate");
  const panels = SPECS.map((spec) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const ref = {};
    node.querySelectorAll("[data-ref]").forEach((n) => (ref[n.dataset.ref] = n));
    node.dataset.metric = spec.id;
    node.dataset.kind = spec.kind;
    node.style.setProperty("--key", spec.color);
    ref.title.textContent = spec.title;
    ref.unit.textContent = spec.unit;
    ref.legend.hidden = spec.kind !== "candle";
    stage.appendChild(node);
    const plot = node.querySelector(".plot");
    return { spec, el: node, ref, plot, chart: new G.Chart(plot.querySelector("canvas"), spec, theme), shown: {}, liftTimer: 0 };
  });
  const panelOf = Object.fromEntries(panels.map((p) => [p.spec.id, p]));

  function computeLayout(W, H) {
    const gap = W < 760 ? 8 : 12;
    const ids = SPECS.map((s) => s.id);
    const rects = {};
    const row = (list, y, h) => {
      const w = (W - gap * (list.length - 1)) / list.length;
      list.forEach((id, i) => (rects[id] = { x: i * (w + gap), y, w, h }));
    };
    if (state.focus) {
      const strip = Math.round(Math.min(150, Math.max(84, H * 0.2)));
      rects[state.focus] = { x: 0, y: 0, w: W, h: H - strip - gap };
      row(ids.filter((id) => id !== state.focus), H - strip, strip);
    } else if (W >= 1100) {
      const top = Math.round((H - gap) * 0.5);
      rects.subs = { x: 0, y: 0, w: W, h: top };
      row(ids.slice(1), top + gap, H - top - gap);
    } else {
      const top = Math.round((H - 2 * gap) * 0.38);
      const h = (H - top - 2 * gap) / 2;
      rects.subs = { x: 0, y: 0, w: W, h: top };
      row(ids.slice(1, 3), top + gap, h);
      row(ids.slice(3), top + gap + h + gap, h);
    }
    return rects;
  }

  function applyLayout(animate) {
    const rects = computeLayout(stage.clientWidth, stage.clientHeight);
    if (!animate) stage.classList.add("no-anim");
    for (const p of panels) {
      const r = rects[p.spec.id];
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      Object.assign(p.el.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${Math.round(r.x + r.w) - x}px`,
        height: `${Math.round(r.y + r.h) - y}px`,
      });
      const focused = state.focus === p.spec.id;
      p.el.classList.toggle("is-focus", focused);
      p.el.classList.toggle("is-dim", state.focus !== null && !focused);
      p.el.setAttribute("aria-pressed", String(focused));
    }
    if (!animate) {
      void stage.offsetWidth; // 위치를 즉시 반영한 뒤 전환 효과를 되살린다
      stage.classList.remove("no-anim");
    }
  }

  /** 같은 그래프를 다시 누르면 기본 보기로, 다른 그래프를 누르면 그 그래프로 포커스를 옮긴다. */
  function setFocus(id) {
    const previous = state.focus;
    state.focus = previous === id ? null : id;
    if (previous && previous !== state.focus) {
      const p = panelOf[previous];
      p.el.classList.add("is-lifted"); // 제자리로 돌아가는 동안 다른 패널 아래로 숨지 않게
      clearTimeout(p.liftTimer);
      p.liftTimer = setTimeout(() => p.el.classList.remove("is-lifted"), 480);
    }
    state.hover = null;
    applyLayout(true);
    requestDraw();
  }

  for (const p of panels) {
    p.el.addEventListener("click", () => setFocus(p.spec.id));
    p.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setFocus(p.spec.id);
      }
    });
    p.plot.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || (state.focus && state.focus !== p.spec.id)) return;
      const r = p.plot.getBoundingClientRect();
      state.hover = { panel: p, x: e.clientX - r.left, clientX: e.clientX, clientY: e.clientY };
      requestDraw();
    });
    p.plot.addEventListener("pointerleave", () => {
      state.hover = null;
      requestDraw();
    });
  }

  // ---------- 그리기 ----------
  let needsDraw = true;
  let easing = false;
  let lastTime = performance.now();
  let lastFrame = null;
  let headerKey = "";
  const requestDraw = () => (needsDraw = true);

  function frame(dt) {
    const per = model.periods[state.interval];
    const d = Math.min(model.n - 1, Math.floor(state.t));
    const kNow = per.of(d);
    const now = per.pos(d) + (state.t - d) / per.length(kNow); // 기간 좌표로 본 현재 시각
    const size = WINDOW[state.interval];
    const viewR = Math.max(now + 1, size);
    const viewL = state.range === "all" ? 0 : viewR - size;
    const hoverK = state.hover ? state.hover.panel.chart.periodAt(state.hover.x) : null;
    return { model, per, d, kNow, viewL, viewR, dt, snap: false, hoverK };
  }

  function draw(dt) {
    needsDraw = false;
    const f = frame(dt);
    lastFrame = f;
    easing = false;
    for (const p of panels) if (p.chart.render(f)) easing = true;
    const key = `${state.interval}:${f.d}`;
    if (key !== headerKey) {
      headerKey = key;
      updateHeaders(f);
      updateClock(f.d);
    }
    if (!state.dragging && Number(scrubber.value) !== f.d) scrubber.value = String(f.d);
    updateTooltip(f);
  }

  function tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (state.playing && !state.dragging) {
      state.t = Math.min(model.n - 1, state.t + state.speed * dt);
      if (state.t >= model.n - 1) setPlaying(false);
      needsDraw = true;
    }
    if (needsDraw || easing) draw(dt);
    requestAnimationFrame(tick);
  }

  // 캔버스 크기가 바뀌면(포커스 전환 중 매 프레임) 같은 프레임 안에서 다시 그려 깜빡임을 막는다
  const plotObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const p = panels.find((x) => x.plot === entry.target);
      const { width, height } = entry.contentRect;
      if (p.chart.resize(Math.round(width), Math.round(height)) && lastFrame) p.chart.render({ ...lastFrame, dt: 0 });
    }
  });
  panels.forEach((p) => plotObserver.observe(p.plot));
  new ResizeObserver(() => applyLayout(false)).observe(stage);

  // ---------- 헤더·시계 ----------
  const shortDate = (i) => {
    const c = model.cal(i);
    return `${c.m}.${c.d}`;
  };
  const fullDate = (i) => {
    const c = model.cal(i);
    return `${c.y}.${fmt.pad2(c.m)}.${fmt.pad2(c.d)}`;
  };

  function periodLabel(per, k) {
    if (per.kind === "day") return `${fullDate(k)} (${model.weekday(k)})`;
    if (per.kind === "week") {
      const a = per.startDay(k);
      const end = model.cal(a + 6);
      return `${fullDate(a)} – ${fmt.pad2(end.m)}.${fmt.pad2(end.d)} 주`;
    }
    const c = model.cal(per.startDay(k));
    return `${c.y}년 ${c.m}월`;
  }

  function subText(spec, per, k, d) {
    if (spec.kind === "candle") return `누적 · ${CANDLE[per.kind]}`;
    const name = `${PERIOD[per.kind]} ${spec.kind === "line" ? "평균" : "합계"}`;
    return per.kind === "day" ? name : `${name} · ${shortDate(per.first[k])}–${shortDate(d)}`;
  }

  function show(p, key, text) {
    if (p.shown[key] !== text) {
      p.shown[key] = text;
      p.ref[key].textContent = text;
    }
  }

  function updateHeaders(f) {
    const { per, d, kNow } = f;
    for (const p of panels) {
      const { spec } = p;
      const s = model.snapshot(spec.id, per, kNow, d);
      const rate = fmt.rate(s.rate);
      let dir = rate.dir;
      let change = "";
      if (spec.kind === "candle") {
        const diff = s.candle.close - s.candle.open;
        dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
        change = fmt.signed(diff);
      }
      const basis = `${PREVIOUS[per.kind]} ${spec.kind === "candle" || s.done ? "" : "동기 "}대비`;
      const value = s.value == null ? "—" : spec.text(s.value);
      show(p, "value", value);
      show(p, "unit", s.value == null ? "" : spec.unit);
      show(p, "rate", rate.text);
      show(p, "change", change);
      show(p, "basis", basis);
      show(p, "sub", subText(spec, per, kNow, d));
      const cls = `delta is-${dir}`;
      if (p.ref.delta.className !== cls) p.ref.delta.className = cls;
      p.el.setAttribute("aria-label", `${spec.title} ${value}${s.value == null ? "" : spec.unit}, ${basis} ${rate.text}`);
    }
  }

  const clockDate = $("clockDate");
  const clockWeekday = $("clockWeekday");
  const clockDays = $("clockDays");
  function updateClock(d) {
    clockDate.textContent = fullDate(d);
    clockWeekday.textContent = `${model.weekday(d)}요일`;
    clockDays.textContent = `개설 ${fmt.int(d + 1)}일째`;
  }

  // ---------- 툴팁: 가리킨 기간의 다섯 지표를 한 번에 ----------
  const tooltip = $("tooltip");
  const ttTitle = el("span", "");
  const ttBasis = el("span", "tt-basis");
  const ttHead = el("div", "tt-title");
  ttHead.append(ttTitle, ttBasis);
  const ttGrid = el("div", "tt-grid");
  tooltip.append(ttHead, ttGrid);
  const ttRows = SPECS.map((spec) => {
    const row = el("div", "tt-row");
    const key = el("span", "tt-key");
    key.style.setProperty("--key", spec.color);
    const value = el("span", "tt-value");
    const rate = el("span", "tt-rate");
    row.append(key, el("span", "tt-label", spec.title), value, rate);
    const note = spec.kind === "candle" ? el("span", "tt-note") : null;
    if (note) row.append(note);
    ttGrid.append(row);
    return { spec, key, value, rate, note };
  });
  let tooltipKey = "";

  function updateTooltip(f) {
    const h = state.hover;
    const k = f.hoverK;
    if (!h || k == null || k > f.kNow) {
      tooltip.hidden = true;
      tooltipKey = "";
      return;
    }
    const d = Math.min(f.d, f.per.last[k]);
    const key = `${state.interval}:${k}:${d}`;
    if (key !== tooltipKey) {
      tooltipKey = key;
      const partial = d < f.per.last[k];
      ttTitle.textContent = periodLabel(f.per, k) + (partial ? ` · ${shortDate(d)}까지` : "");
      ttBasis.textContent = `${PREVIOUS[f.per.kind]} ${partial ? "동기 " : ""}대비`;
      for (const r of ttRows) {
        const s = model.snapshot(r.spec.id, f.per, k, d);
        const rate = fmt.rate(s.rate);
        r.value.textContent = s.value == null ? "—" : r.spec.text(s.value) + r.spec.unit;
        r.rate.textContent = rate.text;
        r.rate.className = `tt-rate is-${rate.dir}`;
        if (r.note) {
          const c = s.candle;
          r.key.style.setProperty("--key", c.close > c.open ? theme.up : c.close < c.open ? theme.down : theme.flat);
          r.note.textContent = `시가 ${fmt.int(c.open)} · 고가 ${fmt.int(c.high)} · 저가 ${fmt.int(c.low)} · 증감 ${fmt.signed(c.close - c.open)}`;
        }
      }
    }
    tooltip.hidden = false;
    const box = stage.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let x = h.clientX - box.left + 16;
    let y = h.clientY - box.top + 16;
    if (x + tw > box.width - 4) x = h.clientX - box.left - tw - 16;
    if (y + th > box.height - 4) y = box.height - th - 4;
    tooltip.style.transform = `translate(${Math.round(Math.max(4, x))}px, ${Math.round(Math.max(4, y))}px)`;
  }

  // ---------- 재생 제어 ----------
  const playBtn = $("playBtn");
  const scrubber = $("scrubber");

  function setPlaying(on) {
    if (on && state.t >= model.n - 1) state.t = 0;
    state.playing = on;
    playBtn.classList.toggle("is-playing", on);
    playBtn.setAttribute("aria-label", on ? "일시정지" : "재생");
    lastTime = performance.now();
    requestDraw();
  }

  function seek(day) {
    state.t = Math.min(model.n - 1, Math.max(0, day));
    requestDraw();
  }

  playBtn.addEventListener("click", () => setPlaying(!state.playing));
  $("restartBtn").addEventListener("click", () => {
    seek(0);
    setPlaying(true);
  });

  scrubber.max = String(model.n - 1);
  scrubber.addEventListener("input", () => seek(Number(scrubber.value)));
  scrubber.addEventListener("pointerdown", () => (state.dragging = true));
  window.addEventListener("pointerup", () => (state.dragging = false));
  window.addEventListener("pointercancel", () => (state.dragging = false));

  const scale = $("scrubScale");
  for (let y = model.cal(0).y + 1; y <= model.cal(model.n - 1).y; y++) {
    const span = el("span", "", String(y));
    span.style.left = `${(model.indexOf(y, 1, 1) / (model.n - 1)) * 100}%`;
    scale.append(span);
  }

  // 간격·범위·속도: 라디오 그룹 (클릭, 방향키)
  const segmentSyncs = [];
  for (const group of document.querySelectorAll(".seg")) {
    const setting = group.dataset.setting;
    const buttons = [...group.querySelectorAll("button")];
    const sync = () =>
      buttons.forEach((b) => {
        const on = b.dataset.value === String(state[setting]);
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      });
    const choose = (b) => {
      state[setting] = setting === "speed" ? Number(b.dataset.value) : b.dataset.value;
      sync();
      state.hover = null;
      requestDraw();
    };
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) choose(b);
    });
    group.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const next = buttons[(i + step + buttons.length) % buttons.length];
      choose(next);
      next.focus();
    });
    segmentSyncs.push(sync);
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    const onControl = target.closest("button, input, [role='button'], [role='radio']");
    const onInput = target.closest("input");
    if ((e.key === " " || e.key === "k" || e.key === "K") && !onControl) {
      e.preventDefault();
      setPlaying(!state.playing);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !onInput) {
      e.preventDefault();
      seek(Math.floor(state.t) + (e.shiftKey ? 7 : 1) * (e.key === "ArrowLeft" ? -1 : 1));
    } else if (e.key === "Home" && !onInput) {
      seek(0);
    } else if (e.key === "End" && !onInput) {
      seek(model.n - 1);
    } else if (e.key === "Escape" && state.focus) {
      setFocus(state.focus);
    } else if (/^[1-5]$/.test(e.key) && !onInput) {
      setFocus(SPECS[Number(e.key) - 1].id);
    }
  });

  // ---------- 시작 ----------
  // 주소의 #date=2025-07-04&interval=day&range=recent&focus=views 로 특정 장면을 바로 연다(이때는 자동 재생 안 함)
  const params = new URLSearchParams(location.hash.slice(1));
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : null);
  state.interval = pick("interval", Object.keys(PERIOD)) || state.interval;
  state.range = pick("range", ["all", "recent"]) || state.range;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get("date") || "");
  if (date) seek(model.indexOf(Number(date[1]), Number(date[2]), Number(date[3])));
  state.focus = pick("focus", SPECS.map((s) => s.id));
  segmentSyncs.forEach((sync) => sync());

  applyLayout(false);
  draw(0);
  requestAnimationFrame(tick);
  if (!date && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setTimeout(() => {
      if (!state.playing && state.t === 0) setPlaying(true);
    }, 800);
  }
})();
