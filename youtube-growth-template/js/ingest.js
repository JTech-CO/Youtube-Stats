/*
 * CSV·ZIP 파일을 읽어 날짜별 데이터셋 하나로 합친다. 모든 처리는 브라우저 안에서만 이뤄진다.
 *
 * - YouTube 스튜디오 내보내기(ZIP, 총계.csv, 표 데이터.csv, 영문 Totals/Table data)와 직접 만든 CSV를 받는다.
 * - 날짜 열을 찾고, 숫자 열마다 지표 하나를 만든다. 동영상 제목 같은 글자 열은 무시한다.
 * - 여러 파일의 같은 이름 열은 날짜로 합친다. 같은 날짜 값이 파일마다 다르면 먼저 읽은 값을 쓰고 경고한다.
 * - '합계' 행처럼 날짜가 아닌 행은 건너뛴다. 한 파일에 같은 날짜가 여러 번 나오면(동영상별 차트 데이터)
 *   채널 전체 값이 아니므로 그 파일은 건너뛴다.
 * - 숫자는 소수 자릿수만큼 10^n 배 한 정수로 저장해 합계와 변화율을 정확히 계산한다. 시간 형식(H:MM:SS)은 초.
 */
(function (root) {
  "use strict";

  const DAY_MS = 86400000;
  const MAX_BYTES = 50 * 1024 * 1024; // 한 번에 읽는 파일(압축 해제 후 포함) 합계 상한
  const MAX_DAYS = 40000; // 약 110년
  const MAX_DECIMALS = 6;
  const MAX_VISIBLE = 9; // 기본으로 켜 두는 그래프 수 상한
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  // ---------- 파일 읽기 ----------

  function decodeText(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("euc-kr").decode(bytes); // 엑셀에서 저장한 한글 CSV
    }
  }

  const isZip = (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

  async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("이 브라우저는 ZIP을 풀 수 없습니다. 압축을 풀어 CSV 파일을 넣어 주세요.");
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** ZIP 안의 .csv 파일만 꺼낸다 (저장·deflate 방식, 중앙 디렉터리 기준). */
  async function unzipCsv(bytes, zipName) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`${zipName}: ZIP 파일을 읽을 수 없습니다.`);
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const out = [];
    let unpacked = 0;
    for (let e = 0; e < count && p + 46 <= bytes.length && view.getUint32(p, true) === 0x02014b50; e++) {
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const packed = view.getUint32(p + 20, true);
      const size = view.getUint32(p + 24, true);
      const nameLength = view.getUint16(p + 28, true);
      const local = view.getUint32(p + 42, true);
      const nameBytes = bytes.subarray(p + 46, p + 46 + nameLength);
      const name = flags & 0x800 ? new TextDecoder().decode(nameBytes) : decodeText(nameBytes);
      p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
      if (!/\.csv$/i.test(name) || name.includes("__MACOSX")) continue;
      if (flags & 1) throw new Error(`${zipName}: 암호가 걸린 ZIP은 열 수 없습니다.`);
      unpacked += size;
      if (unpacked > MAX_BYTES) throw new Error(`${zipName}: 압축을 푼 크기가 너무 큽니다(50MB 초과).`);
      const at = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(at, at + packed);
      const raw = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
      if (!raw) throw new Error(`${zipName}: ${name}의 압축 방식은 지원하지 않습니다.`);
      unpacked += raw.length - size; // 적힌 크기가 아니라 실제로 풀린 크기로 다시 확인
      if (unpacked > MAX_BYTES) throw new Error(`${zipName}: 압축을 푼 크기가 너무 큽니다(50MB 초과).`);
      out.push({ name: `${zipName.replace(/\.zip$/i, "")}/${name.split("/").pop()}`, text: decodeText(raw) });
    }
    return out;
  }

  /** File 목록 → [{ name, text }]. ZIP은 안의 CSV를 꺼낸다. */
  async function readFiles(list) {
    const files = [];
    const warnings = [];
    let total = 0;
    for (const file of list) {
      total += file.size || 0;
      if (total > MAX_BYTES) throw new Error("파일이 너무 큽니다. 한 번에 50MB까지 읽을 수 있습니다.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZip(bytes)) {
        const inner = await unzipCsv(bytes, file.name);
        if (!inner.length) warnings.push(`${file.name}: 안에 CSV 파일이 없어 건너뜀`);
        files.push(...inner);
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        files.push({ name: file.name, text: decodeText(bytes) });
      } else {
        warnings.push(`${file.name}: CSV나 ZIP 파일이 아니어서 건너뜀`);
      }
    }
    return { files, warnings };
  }

  // ---------- CSV 해석 ----------

  function parseCSV(text) {
    const firstLine = text.slice(0, (text.indexOf("\n") + 1 || text.length + 1) - 1);
    const count = (ch) => firstLine.split(ch).length - 1;
    const delimiter = [",", "\t", ";"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c !== '"') field += c;
        else if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else if (c === '"' && field === "") {
        quoted = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  function dayNumber(y, m, d) {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, m - 1, d);
    return new Date(t).getUTCDate() === d ? Math.round(t / DAY_MS) : null;
  }

  /** '2017-11-26', '2017.11.26', '2017. 11. 26.', '2017년 11월 26일', 'Nov 26, 2017', '2025-07'(월) → 1970-01-01 기준 일 번호 */
  function parseDate(raw) {
    const s = raw
      .trim()
      .replace(/(?:T|\s+)\d{1,2}:\d{2}(?::\d{2})?.*$/, "")
      .replace(/\.$/, "");
    let m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(s);
    if (m) return dayNumber(+m[1], +m[2], +m[3]);
    m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*월?$/.exec(s);
    if (m) return dayNumber(+m[1], +m[2], 1);
    m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
    if (m && MONTHS[m[1].toLowerCase()]) return dayNumber(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return null;
  }

  /** 셀 → { num, dec, duration, percent } | null(빈칸) | undefined(숫자가 아닌 글자) */
  function parseCell(raw) {
    const s = raw.trim();
    if (!s || s === "-" || s === "—") return null;
    let m = /^(-)?(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
    if (m) {
      const sec = m[4] === undefined ? +m[2] * 60 + +m[3] : +m[2] * 3600 + +m[3] * 60 + +m[4];
      return { num: m[1] ? -sec : sec, dec: 0, duration: true, percent: false };
    }
    const percent = s.endsWith("%");
    const t = s.replace(/%$/, "").replace(/[\s,₩$€£¥]/g, "");
    m = /^[-+]?(\d*)(?:\.(\d+))?$/.exec(t);
    if (!m || (!m[1] && !m[2])) return undefined;
    return { num: Number(t), dec: m[2] ? m[2].length : 0, duration: false, percent };
  }

  const DATE_HEADER = /^(날짜|일자|일|기간|연월|date|day|week|month)$|시작일/i;

  function readTable(file) {
    const rows = parseCSV(file.text);
    if (rows.length < 2) return { skip: "내용이 없음" };
    const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
    const body = rows.slice(1);
    let dateCol = header.findIndex((h) => DATE_HEADER.test(h));
    if (dateCol < 0) {
      dateCol = header.findIndex((_, c) => {
        const cells = body.slice(0, 60).map((r) => r[c] || "").filter((v) => v.trim());
        return cells.length > 0 && cells.filter((v) => parseDate(v) != null).length >= cells.length * 0.8;
      });
    }
    if (dateCol < 0) return { skip: "날짜 열을 찾지 못함" };

    const records = [];
    const seen = new Set();
    for (const r of body) {
      const day = parseDate(r[dateCol] || "");
      if (day == null) continue; // '합계' 행 등
      if (seen.has(day)) return { skip: "같은 날짜가 여러 행에 있음(동영상별 데이터로 보임)" };
      seen.add(day);
      records.push([day, r]);
    }
    if (!records.length) return { skip: "날짜가 들어 있는 행이 없음" };

    const columns = [];
    header.forEach((name, c) => {
      if (c === dateCol || !name) return;
      const values = new Map();
      let numeric = 0;
      let text = 0;
      const col = { name, values, dec: 0, duration: false, percent: false };
      for (const [day, r] of records) {
        const cell = parseCell(r[c] || "");
        if (cell === undefined) text++;
        else if (cell !== null) {
          numeric++;
          values.set(day, cell.num);
          col.dec = Math.max(col.dec, cell.dec);
          col.duration = col.duration || cell.duration;
          col.percent = col.percent || cell.percent;
        }
      }
      if (numeric > 0 && text <= numeric * 0.05) columns.push(col);
    });
    return { days: records.map((r) => r[0]), columns };
  }

  const isoOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

  /** 여러 파일 → { start, n, granularity, columns, files, warnings } */
  function buildDataset(files, readWarnings) {
    const warnings = [...(readWarnings || [])];
    const used = [];
    const merged = new Map();
    const allDays = new Set();
    let conflicts = 0;
    const conflictNames = new Set();

    for (const file of files) {
      const table = readTable(file);
      if (table.skip) {
        warnings.push(`${file.name}: ${table.skip} — 건너뜀`);
        continue;
      }
      let first = Infinity;
      let last = -Infinity;
      for (const d of table.days) {
        allDays.add(d);
        first = Math.min(first, d);
        last = Math.max(last, d);
      }
      used.push({ name: file.name, rows: table.days.length, first: isoOf(first), last: isoOf(last), columns: table.columns.map((c) => c.name) });
      for (const col of table.columns) {
        const key = col.name.replace(/\s+/g, " ").toLowerCase();
        let target = merged.get(key);
        if (!target) merged.set(key, (target = { name: col.name, values: new Map(), dec: 0, duration: false, percent: false }));
        for (const [day, num] of col.values) {
          const prev = target.values.get(day);
          if (prev === undefined) target.values.set(day, num);
          else if (Math.abs(prev - num) > 1e-9) {
            conflicts++;
            conflictNames.add(target.name);
          }
        }
        target.dec = Math.max(target.dec, col.dec);
        target.duration = target.duration || col.duration;
        target.percent = target.percent || col.percent;
      }
    }

    if (!used.length) throw new Error(`불러올 수 있는 표가 없습니다.${warnings.length ? ` (${warnings.join(" / ")})` : ""}`);
    if (!merged.size) throw new Error("숫자로 된 열이 없습니다. 날짜 열과 숫자 열이 있는 CSV를 넣어 주세요.");
    if (conflicts) warnings.push(`같은 날짜의 값이 파일마다 다른 경우 ${conflicts}건(${[...conflictNames].join(", ")}): 먼저 읽은 파일의 값을 사용`);

    const days = [...allDays].sort((a, b) => a - b);
    const first = days[0];
    const n = days[days.length - 1] - first + 1;
    if (n < 2) throw new Error("날짜가 이틀 이상 있어야 재생할 수 있습니다.");
    if (n > MAX_DAYS) throw new Error("날짜 범위가 너무 넓습니다.");
    const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
    const gap = gaps[Math.floor(gaps.length / 2)];
    const granularity = gap >= 27 ? "month" : gap >= 6 ? "week" : "day";

    const columns = [...merged.values()].map((col) => {
      const decimals = col.duration ? 0 : Math.min(col.dec, MAX_DECIMALS);
      const scale = 10 ** decimals;
      const values = new Array(n).fill(null);
      for (const [day, num] of col.values) values[day - first] = Math.round(num * scale);
      return { name: col.name, values, scale, decimals, duration: col.duration, percent: col.percent };
    });
    return { start: isoOf(first), n, granularity, columns, files: used, warnings };
  }

  // ---------- 지표 해석 ----------

  // 이름으로 알아보는 YouTube 지표 (한국어·영어 내보내기). 앞의 규칙이 우선한다.
  const KNOWN = [
    [/변화율|대비|증감률|\bchange\b/i, { kind: "line", hidden: true }], // 다른 열에서 계산한 파생 값
    [/^(누적|총)\s*구독자|^구독자\s*수$|^(total|cumulative) subscribers|^subscriber count/i, { role: "level", kind: "candle", unit: "명" }],
    [/^구독자$|^subscribers$/i, { role: "net", kind: "candle", unit: "명" }], // 스튜디오의 '구독자'는 일별 증감
    [/^구독자\s*(증가|감소|획득|손실|취소)|^subscribers (gained|lost)/i, { kind: "bar", unit: "명" }],
    [/^유효\s*조회수$|^engaged views$/i, { role: "engaged", kind: "bar", unit: "회" }],
    [/^조회수$|^views$/i, { role: "views", kind: "bar", unit: "회" }],
    [/^시청\s*시간|^watch time/i, { role: "hours", kind: "bar" }],
    [/^평균\s*시청\s*지속\s*시간|^average view duration/i, { role: "avgDuration", kind: "line", weight: "views" }],
    [/^평균\s*조회율|^average percentage viewed/i, { kind: "line", weight: "views" }],
    [/^노출수$|^impressions$/i, { role: "impressions", kind: "bar", unit: "회" }],
    [/클릭률|click-through rate|\bctr\b/i, { kind: "line", weight: "impressions" }],
    [/^(좋아요|싫어요|댓글|공유|likes|dislikes|comments|shares)(\s*수)?$/i, { kind: "bar", unit: "개" }],
  ];

  /** 데이터셋의 열마다 그래프 기본값을 정한다. 사용자는 표시 여부와 그래프 형태를 바꿀 수 있다. */
  function describe(dataset, options) {
    const startSubscribers = (options && options.startSubscribers) || 0;
    const metrics = dataset.columns.map((col, index) => {
      const known = (KNOWN.find(([re]) => re.test(col.name.trim())) || [null, {}])[1];
      const unitMatch = /^(.*?)\s*\((?:단위\s*[:：]\s*)?([^()]+)\)\s*$/.exec(col.name.trim());
      const label = (unitMatch ? unitMatch[1] : col.name).trim() || col.name;
      let unit = known.unit || (unitMatch ? unitMatch[2].trim() : "");
      const format = col.duration ? "duration" : col.percent || unit === "%" ? "percent" : col.decimals > 0 ? "decimal" : "int";
      if (format === "percent" || format === "duration") unit = "";
      const averageLike = /평균|average|률|율|rate|비율|\bper\b/i.test(col.name);
      const kind = known.kind || (format === "duration" || format === "percent" || averageLike ? "line" : "bar");
      return {
        id: `m${index}`,
        column: col,
        label,
        unit,
        format,
        role: known.role || null,
        weightRole: known.weight || null,
        defaultKind: kind,
        kind,
        visible: !known.hidden,
        startLevel: known.role === "net" ? startSubscribers : 0,
      };
    });

    const byRole = (role) => metrics.find((m) => m.role === role);
    const views = byRole("engaged") || byRole("views");
    const weights = { views, impressions: byRole("impressions") };
    for (const m of metrics) {
      m.weight = m.weightRole && weights[m.weightRole] && weights[m.weightRole] !== m ? weights[m.weightRole].column : null;
      m.derive = m.role === "avgDuration" && byRole("hours") && views ? { hours: byRole("hours").column, views: views.column } : null;
    }
    const level = byRole("level");
    if (level && byRole("net")) level.visible = false; // '구독자'(일별 증감)로 같은 캔들을 그린다
    let shown = 0;
    for (const m of metrics) if (m.visible && ++shown > MAX_VISIBLE) m.visible = false;

    // 색은 지표에 붙인다(켜고 끄거나 형태를 바꿔도 다른 그래프 색이 바뀌지 않게).
    // 처음 보이는 막대·선 지표가 앞 색을 받고, 꺼 둔 지표와 캔들 기본값은 그 뒤.
    const lineOrBar = metrics.filter((m) => m.defaultKind !== "candle");
    const order = [...lineOrBar.filter((m) => m.visible), ...lineOrBar.filter((m) => !m.visible), ...metrics.filter((m) => m.defaultKind === "candle")];
    order.forEach((m, slot) => (m.colorSlot = slot));
    return metrics;
  }

  root.Growth = Object.assign(root.Growth || {}, {
    ingest: { readFiles, buildDataset, describe, parseCSV, parseDate, parseCell, MAX_VISIBLE },
  });
})(typeof window !== "undefined" ? window : globalThis);
