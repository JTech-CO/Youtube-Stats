/*
 * 템플릿 앱: CSV·ZIP 불러오기, 지표 설정, 재생, 레이아웃(지표 수에 맞춘 패널 배치 ↔ 한 그래프 포커스),
 * 헤더 값, 툴팁, 조작. 데이터는 브라우저 안에서만 처리한다.
 */
(function () {
  "use strict";

  const G = window.Growth;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const app = document.querySelector(".app");
  const stage = $("stage");
  if (!G || !G.Chart || !G.ingest || !G.createModel) {
    $("landingError").textContent = "스크립트를 불러오지 못했습니다. js 폴더가 index.html 옆에 있는지 확인해 주세요.";
    $("landingError").hidden = false;
    return;
  }

  const fmt = G.format;
  const MAX_PANELS = G.ingest.MAX_VISIBLE;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const config = readConfig(window.GROWTH_CONFIG);

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
  const SERIES = ["--s-1", "--s-2", "--s-3", "--s-4", "--s-5"].map(token);
  const OTHER = token("--s-other");

  const PERIOD = { day: "일간", week: "주간", month: "월간" };
  const CANDLE = { day: "일봉", week: "주봉", month: "월봉" };
  const PREVIOUS = { day: "전일", week: "전주", month: "전월" };
  const GRANULARITY = { day: "일별", week: "주별", month: "월별" };
  const KIND_LABEL = { candle: "캔들 · 누적", bar: "막대 · 합계", line: "선 · 평균" };
  // 화면에 보이는 폭(기간 수): 어느 간격이든 약 1년. '전체' 범위에서는 첫 1년 동안의 최소 폭.
  const WINDOW = { day: 365, week: 52, month: 12 };

  const state = {
    t: 0, // 재생 위치(일 단위, 소수부는 다음 날로 넘어가는 중간)
    playing: false,
    dragging: false,
    speed: 30, // 초당 일수
    interval: "week",
    range: "year", // year: 최근 1년 창이 재생 위치를 따라 이동, all: 처음부터 전체
    focus: null,
    hover: null,
  };

  let source = null; // { files: [{ name, text }], warnings }
  let dataset = null;
  let metrics = [];
  let model = null;
  let panels = [];
  let panelOf = {};
  let channelName = config.channelName;
  let autoplayTimer = 0;

  /** config.js 값 검사: 이름 길이, 이 폴더 안의 상대 경로만, 시작값 범위. */
  function readConfig(raw) {
    const c = raw && typeof raw === "object" ? raw : {};
    const safePath = (p) => typeof p === "string" && p.trim() !== "" && !/^[a-z][a-z0-9+.-]*:|^[/\\]|\.\./i.test(p.trim());
    const start = Number(c.startSubscribers);
    return {
      channelName: typeof c.channelName === "string" ? c.channelName.trim().slice(0, 40) : "",
      files: Array.isArray(c.files) ? c.files.filter(safePath).map((p) => p.trim()).slice(0, 100) : [],
      startSubscribers: Number.isFinite(start) && start >= 0 && start < 1e12 ? start : 0,
    };
  }

  // ---------- 지표 → 그래프 설정 ----------
  const colorOf = (m) => (m.kind === "candle" ? theme.up : SERIES[m.colorSlot] || OTHER);

  function specOf(m) {
    const scale = m.column.scale;
    const show = (x) => {
      if (x == null || Number.isNaN(x)) return "—";
      if (m.format === "duration") return fmt.duration(x);
      if (m.format === "percent") return fmt.fixed(x, Math.min(2, Math.max(1, m.column.decimals))) + "%";
      if (m.format === "decimal") return fmt.fixed(x, Math.min(m.column.decimals, Math.abs(x) >= 10 ? 1 : 2));
      return Number.isInteger(x) ? fmt.int(x) : fmt.fixed(x, 1); // 정수 지표의 평균
    };
    return {
      id: m.id,
      kind: m.kind,
      title: m.label,
      unit: m.unit,
      axis: m.format,
      scale,
      color: colorOf(m),
      text: (raw) => show(raw == null ? null : raw / scale),
      tagText: show,
    };
  }

  function rebuild() {
    const visible = metrics.filter((m) => m.visible);
    const hero = visible.find((m) => m.kind === "candle") || visible[0];
    const ordered = hero ? [hero, ...visible.filter((m) => m !== hero)] : [];
    model = G.createModel(dataset, ordered);
    buildPanels(ordered.map(specOf));
  }

  // ---------- 패널 ----------
  const template = $("panelTemplate");
  const tooltip = $("tooltip");

  function createPanel(spec) {
    const node = template.content.firstElementChild.cloneNode(true);
    const ref = {};
    node.querySelectorAll("[data-ref]").forEach((n) => (ref[n.dataset.ref] = n));
    node.dataset.kind = spec.kind;
    node.style.setProperty("--key", spec.color);
    ref.title.textContent = spec.title;
    ref.legend.hidden = spec.kind !== "candle";
    stage.insertBefore(node, tooltip);
    const plot = node.querySelector(".plot");
    const p = { spec, el: node, ref, plot, chart: new G.Chart(plot.querySelector("canvas"), spec, theme), shown: {}, liftTimer: 0 };
    node.addEventListener("click", () => setFocus(spec.id));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setFocus(spec.id);
      }
    });
    plot.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || (state.focus && state.focus !== spec.id)) return;
      const r = plot.getBoundingClientRect();
      state.hover = { panel: p, x: e.clientX - r.left, clientX: e.clientX, clientY: e.clientY };
      requestDraw();
    });
    plot.addEventListener("pointerleave", () => {
      state.hover = null;
      requestDraw();
    });
    plotObserver.observe(plot);
    return p;
  }

  function buildPanels(specs) {
    for (const p of panels) {
      plotObserver.unobserve(p.plot);
      p.el.remove();
    }
    panels = specs.map(createPanel);
    panelOf = Object.fromEntries(panels.map((p) => [p.spec.id, p]));
    if (!panelOf[state.focus] || panels.length < 2) state.focus = null;
    state.hover = null;
    buildTooltip();
    headerKey = "";
    applyLayout(false);
    requestDraw();
  }

  /** 기본 보기: 첫 그래프(캔들 우선)를 위에 크게, 나머지는 격자. 포커스: 선택한 그래프를 크게, 나머지는 아래 줄. */
  function computeLayout(W, H) {
    const gap = W < 760 ? 8 : 12;
    const ids = panels.map((p) => p.spec.id);
    const rects = {};
    const row = (list, y, h) => {
      const w = (W - gap * (list.length - 1)) / list.length;
      list.forEach((id, i) => (rects[id] = { x: i * (w + gap), y, w, h }));
    };
    // maxCols 이하로 줄을 나누되 줄마다 개수를 고르게 (5개 → 3+2)
    const grid = (list, y, h, maxCols) => {
      const rows = Math.ceil(list.length / maxCols);
      const cols = Math.ceil(list.length / rows);
      const rh = (h - gap * (rows - 1)) / rows;
      for (let r = 0; r < rows; r++) row(list.slice(r * cols, (r + 1) * cols), y + r * (rh + gap), rh);
    };
    if (ids.length === 1) {
      rects[ids[0]] = { x: 0, y: 0, w: W, h: H };
    } else if (state.focus) {
      const others = ids.filter((id) => id !== state.focus);
      const cols = Math.min(others.length, W >= 760 ? 6 : 4);
      const rows = Math.ceil(others.length / cols);
      const rowH = Math.min(150, Math.max(84, H * 0.2), (H * 0.4 - gap * (rows - 1)) / rows);
      const strip = rows * rowH + gap * (rows - 1);
      rects[state.focus] = { x: 0, y: 0, w: W, h: H - strip - gap };
      grid(others, H - strip, strip, cols);
    } else {
      const rest = ids.slice(1);
      const wide = W >= 1100;
      const cols = Math.min(rest.length, wide ? 4 : 2);
      const rows = Math.min(3, Math.ceil(rest.length / cols));
      const share = (wide ? [0, 0.5, 0.42, 0.36] : [0, 0.5, 0.38, 0.32])[rows];
      const top = Math.round((H - gap) * share);
      rects[ids[0]] = { x: 0, y: 0, w: W, h: top };
      grid(rest, top + gap, H - top - gap, cols);
    }
    return rects;
  }

  function applyLayout(animate) {
    if (!panels.length) return;
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
    if (panels.length < 2) return;
    const previous = state.focus;
    state.focus = previous === id ? null : id;
    if (previous && previous !== state.focus && panelOf[previous]) {
      const p = panelOf[previous];
      p.el.classList.add("is-lifted"); // 제자리로 돌아가는 동안 다른 패널 아래로 숨지 않게
      clearTimeout(p.liftTimer);
      p.liftTimer = setTimeout(() => p.el.classList.remove("is-lifted"), 480);
    }
    state.hover = null;
    applyLayout(true);
    requestDraw();
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
    if (!model || !panels.length) return;
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
    if (state.playing && !state.dragging && model) {
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
      if (!p) continue;
      const { width, height } = entry.contentRect;
      if (p.chart.resize(Math.round(width), Math.round(height)) && lastFrame) p.chart.render({ ...lastFrame, dt: 0 });
    }
  });
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
      const s = model.snapshot(spec, per, kNow, d);
      const rate = fmt.rate(s.rate);
      let dir = rate.dir;
      let change = "";
      if (spec.kind === "candle") {
        const diff = s.candle.close - s.candle.open;
        dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
        change = fmt.signed(diff, spec.text);
      }
      const basis = `${PREVIOUS[per.kind]} ${spec.kind === "candle" || s.done ? "" : "동기 "}대비`;
      const value = spec.text(s.value);
      const unit = s.value == null ? "" : spec.unit;
      show(p, "value", value);
      show(p, "unit", unit);
      show(p, "rate", rate.text);
      show(p, "change", change);
      show(p, "basis", basis);
      show(p, "sub", subText(spec, per, kNow, d));
      const cls = `delta is-${dir}`;
      if (p.ref.delta.className !== cls) p.ref.delta.className = cls;
      p.el.setAttribute("aria-label", `${spec.title} ${value}${unit}, ${basis} ${rate.text}`);
    }
  }

  function updateClock(d) {
    $("clockDate").textContent = fullDate(d);
    $("clockWeekday").textContent = `${model.weekday(d)}요일`;
    $("clockDays").textContent = `${fmt.int(d + 1)}일째`;
  }

  // ---------- 툴팁: 가리킨 기간의 모든 지표를 한 번에 ----------
  let ttTitle;
  let ttBasis;
  let ttRows = [];
  let tooltipKey = "";

  function buildTooltip() {
    ttTitle = el("span");
    ttBasis = el("span", "tt-basis");
    const head = el("div", "tt-title");
    head.append(ttTitle, ttBasis);
    const grid = el("div", "tt-grid");
    ttRows = panels.map(({ spec }) => {
      const row = el("div", "tt-row");
      const key = el("span", "tt-key");
      key.style.setProperty("--key", spec.color);
      const value = el("span", "tt-value");
      const rate = el("span", "tt-rate");
      row.append(key, el("span", "tt-label", spec.title), value, rate);
      const note = spec.kind === "candle" ? el("span", "tt-note") : null;
      if (note) row.append(note);
      grid.append(row);
      return { spec, key, value, rate, note };
    });
    tooltip.replaceChildren(head, grid);
    tooltip.hidden = true;
    tooltipKey = "";
  }

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
        const s = model.snapshot(r.spec, f.per, k, d);
        const rate = fmt.rate(s.rate);
        r.value.textContent = s.value == null ? "—" : r.spec.text(s.value) + r.spec.unit;
        r.rate.textContent = rate.text;
        r.rate.className = `tt-rate is-${rate.dir}`;
        if (r.note) {
          const c = s.candle;
          const t = r.spec.text;
          r.key.style.setProperty("--key", c.close > c.open ? theme.up : c.close < c.open ? theme.down : theme.flat);
          r.note.textContent = `시가 ${t(c.open)} · 고가 ${t(c.high)} · 저가 ${t(c.low)} · 증감 ${fmt.signed(c.close - c.open, t)}`;
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
    clearTimeout(autoplayTimer);
    if (!model) on = false;
    if (on && state.t >= model.n - 1) state.t = 0;
    state.playing = on;
    playBtn.classList.toggle("is-playing", on);
    playBtn.setAttribute("aria-label", on ? "일시정지" : "재생");
    lastTime = performance.now();
    requestDraw();
  }

  function seek(day) {
    if (!model) return;
    state.t = Math.min(model.n - 1, Math.max(0, day));
    requestDraw();
  }

  playBtn.addEventListener("click", () => setPlaying(!state.playing));
  $("restartBtn").addEventListener("click", () => {
    seek(0);
    setPlaying(true);
  });
  scrubber.addEventListener("input", () => seek(Number(scrubber.value)));
  scrubber.addEventListener("pointerdown", () => (state.dragging = true));
  window.addEventListener("pointerup", () => (state.dragging = false));
  window.addEventListener("pointercancel", () => (state.dragging = false));

  function buildScale() {
    const scale = $("scrubScale");
    scale.replaceChildren();
    const first = model.cal(0).y;
    const last = model.cal(model.n - 1).y;
    const every = Math.max(1, Math.ceil((last - first) / 12));
    for (let y = first + 1; y <= last; y += every) {
      const span = el("span", "", String(y));
      span.style.left = `${(model.indexOf(y, 1, 1) / (model.n - 1)) * 100}%`;
      scale.append(span);
    }
  }

  // 간격·범위·속도: 라디오 그룹 (클릭, 방향키). 데이터가 주별·월별이면 더 짧은 간격은 끈다.
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
      if (b.disabled) return;
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
      const enabled = buttons.filter((b) => !b.disabled);
      const i = enabled.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const next = enabled[(i + step + enabled.length) % enabled.length];
      choose(next);
      next.focus();
    });
    segmentSyncs.push(sync);
  }

  function syncIntervals() {
    const allowed = { day: ["day", "week", "month"], week: ["week", "month"], month: ["month"] }[dataset.granularity];
    for (const b of document.querySelectorAll('[data-setting="interval"] button')) {
      b.disabled = !allowed.includes(b.dataset.value);
      b.title = b.disabled ? `${GRANULARITY[dataset.granularity]} 데이터라 이 간격은 쓸 수 없습니다` : "";
    }
    if (!allowed.includes(state.interval)) state.interval = allowed.includes("week") ? "week" : allowed[0];
    segmentSyncs.forEach((sync) => sync());
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !model || dialog.open) return;
    const target = e.target instanceof Element ? e.target : document.body;
    const onControl = target.closest("button, input, select, [role='button'], [role='radio']");
    const onInput = target.closest("input, select");
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
    } else if (/^[1-9]$/.test(e.key) && !onInput && panels[Number(e.key) - 1]) {
      setFocus(panels[Number(e.key) - 1].spec.id);
    }
  });

  // ---------- 불러오기 ----------
  const hashParams = new URLSearchParams(location.hash.slice(1));
  let hashPending = true; // 주소의 #date=…&interval=…&range=…&focus=2 는 처음 불러온 데이터에만 적용

  function updateTitle() {
    const title = channelName ? `${channelName} 성장 기록` : "채널 성장 기록";
    $("appTitle").textContent = title;
    document.title = title;
  }

  function enterData() {
    app.classList.remove("is-empty");
    $("dataBtn").hidden = false;
    $("landingError").hidden = true;
    setPlaying(false);
    state.t = 0;
    state.focus = null;
    let date = null;
    let focusIndex = null;
    if (hashPending) {
      hashPending = false;
      const pick = (name, allowed) => (allowed.includes(hashParams.get(name)) ? hashParams.get(name) : null);
      state.interval = pick("interval", ["day", "week", "month"]) || state.interval;
      state.range = pick("range", ["year", "all"]) || state.range;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hashParams.get("date") || "");
      if (m) date = [Number(m[1]), Number(m[2]), Number(m[3])];
      const fi = Number(hashParams.get("focus"));
      if (Number.isInteger(fi) && fi >= 1) focusIndex = fi - 1;
    }
    syncIntervals();
    rebuild();
    if (focusIndex != null && panels[focusIndex]) setFocus(panels[focusIndex].spec.id);
    scrubber.max = String(model.n - 1);
    buildScale();
    $("appSub").textContent = `${fullDate(0)} – ${fullDate(model.n - 1)} · ${fmt.int(model.n)}일`;
    updateTitle();
    if (dialog.open) renderDialog();
    if (date) seek(model.indexOf(...date));
    else if (!reduceMotion) autoplayTimer = setTimeout(() => setPlaying(true), 700);
  }

  /** 읽어 둔 파일 목록으로 데이터셋을 다시 만든다. 실패하면 이전 화면을 그대로 둔다. */
  function useFiles(files, warnings, name) {
    const next = G.ingest.buildDataset(files, warnings);
    source = { files, warnings };
    dataset = next;
    metrics = G.ingest.describe(next, { startSubscribers: config.startSubscribers });
    if (name !== undefined) channelName = name;
    enterData();
    const shown = metrics.filter((m) => m.visible).length;
    const notes = next.warnings.length ? ` · 확인할 점 ${next.warnings.length}건(데이터 설정)` : "";
    toast(`${next.files.length}개 파일 · ${fullDate(0)} – ${fullDate(model.n - 1)} · 그래프 ${shown}개${notes}`);
  }

  let loading = false;
  async function loadFiles(list, append) {
    if (loading || !list.length) return;
    loading = true;
    try {
      const read = await G.ingest.readFiles(list);
      const keep = append && source;
      useFiles(
        keep ? source.files.concat(read.files) : read.files,
        keep ? source.warnings.concat(read.warnings) : read.warnings,
        keep ? undefined : config.channelName,
      );
    } catch (err) {
      report(err);
    } finally {
      loading = false;
    }
  }

  async function loadConfigured() {
    if (!config.files.length) return;
    if (location.protocol === "file:") {
      report(new Error("index.html을 파일로 직접 열면 config.js의 자동 불러오기가 동작하지 않습니다. 파일을 끌어다 놓아 주세요."));
      return;
    }
    try {
      const list = [];
      for (const path of config.files) {
        const res = await fetch(encodeURI(path));
        if (!res.ok) throw new Error(`${path}: 불러오지 못했습니다(HTTP ${res.status}).`);
        list.push(new File([await res.blob()], path.split("/").pop()));
      }
      await loadFiles(list, false);
    } catch (err) {
      report(err);
    }
  }

  $("sampleBtn").addEventListener("click", () => {
    const run = () => {
      try {
        const s = window.GROWTH_SAMPLE;
        useFiles(s.files, [], `${s.name}(${s.note})`);
      } catch (err) {
        report(err);
      }
    };
    if (window.GROWTH_SAMPLE) return run();
    const script = document.createElement("script");
    script.src = "sample/sample-data.js";
    script.onload = run;
    script.onerror = () => report(new Error("예시 데이터 파일(sample/sample-data.js)을 찾지 못했습니다."));
    document.head.append(script);
  });

  const fileInput = $("fileInput");
  let pickMode = "replace";
  document.addEventListener("click", (e) => {
    const b = e.target instanceof Element && e.target.closest("[data-pick]");
    if (!b) return;
    pickMode = b.dataset.pick;
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", () => loadFiles([...fileInput.files], pickMode === "append"));

  // 끌어다 놓기: 페이지 어디에 놓아도 된다
  const overlay = $("dropOverlay");
  let dragDepth = 0;
  const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.hidden = true;
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    if (dialog.open) dialog.close();
    loadFiles([...e.dataTransfer.files], false);
  });

  // ---------- 알림 ----------
  let toastTimer = 0;
  function toast(message, isError) {
    const box = $("toast");
    box.textContent = message;
    box.classList.toggle("is-error", !!isError);
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), isError ? 7000 : 4500);
  }

  function report(err) {
    const message = err && err.message ? err.message : String(err);
    if (dataset) return toast(message, true);
    $("landingError").textContent = message;
    $("landingError").hidden = false;
  }

  // ---------- 데이터 설정 ----------
  const dialog = $("dataDialog");
  $("dataBtn").addEventListener("click", () => {
    renderDialog();
    dialog.showModal();
  });
  $("channelName").addEventListener("input", (e) => {
    channelName = e.target.value.trim().slice(0, 40);
    updateTitle();
  });

  function renderDialog() {
    if (!dataset) return;
    $("channelName").value = channelName;
    const summary = $("fileSummary");
    summary.textContent = `${dataset.files.length}개 파일 · ${fullDate(0)} – ${fullDate(model.n - 1)} (${fmt.int(dataset.n)}일, ${GRANULARITY[dataset.granularity]} 데이터)`;
    summary.title = dataset.files.map((f) => `${f.name}: ${f.first} ~ ${f.last}, ${f.rows}행`).join("\n");
    $("warnList").replaceChildren(...dataset.warnings.map((w) => el("li", "", w)));
    $("metricList").replaceChildren(...metrics.map(metricRow));
    updateMetricCount();
  }

  function updateMetricCount() {
    $("metricCount").textContent = `${metrics.filter((m) => m.visible).length} / 최대 ${MAX_PANELS}개 표시`;
  }

  function metricRow(m) {
    const row = el("div", "metric-row");
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = m.visible;
    const swatch = el("span", "swatch");
    swatch.style.setProperty("--key", colorOf(m));
    label.append(box, swatch, el("span", "", m.unit ? `${m.label} (${m.unit})` : m.label));

    const select = el("select");
    select.setAttribute("aria-label", `${m.label} 그래프 형태`);
    for (const kind of ["candle", "bar", "line"]) {
      const option = el("option", "", KIND_LABEL[kind]);
      option.value = kind;
      option.selected = m.kind === kind;
      select.append(option);
    }

    const start = el("input");
    start.type = "number";
    start.min = "0";
    start.step = "any";
    start.placeholder = "시작값";
    start.value = m.startLevel ? String(m.startLevel) : "";
    start.setAttribute("aria-label", `${m.label} 누적 시작값`);
    start.title = "데이터 첫날 이전까지의 누적 값";
    const syncStart = () => start.classList.toggle("is-unused", !(m.kind === "candle" && m.role !== "level"));
    syncStart();

    box.addEventListener("change", () => {
      const visible = metrics.filter((x) => x.visible).length;
      if (box.checked && visible >= MAX_PANELS) {
        box.checked = false;
        toast(`그래프는 ${MAX_PANELS}개까지 켤 수 있습니다.`, true);
        return;
      }
      if (!box.checked && visible <= 1) {
        box.checked = true;
        toast("그래프를 하나 이상 켜 두어야 합니다.", true);
        return;
      }
      m.visible = box.checked;
      rebuild();
      updateMetricCount();
    });
    select.addEventListener("change", () => {
      m.kind = select.value;
      swatch.style.setProperty("--key", colorOf(m));
      syncStart();
      rebuild();
    });
    start.addEventListener("change", () => {
      const v = Number(start.value);
      m.startLevel = Number.isFinite(v) && v >= 0 && v < 1e15 ? v : 0;
      start.value = m.startLevel ? String(m.startLevel) : "";
      rebuild();
    });
    row.append(label, select, start);
    return row;
  }

  // ---------- 시작 ----------
  updateTitle();
  requestAnimationFrame(tick);
  loadConfigured();
})();
