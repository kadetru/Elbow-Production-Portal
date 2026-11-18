/* Elbow Hourly Report — core logic (no DOM). Shared by the page and the tests. */
const KEY = {
  dia: { "3/4": "07", "1": "10", "1-1/4": "12", "1-1/2": "15", "2": "20", "2-1/2": "25", "3": "30",
         "3-1/2": "35", "4": "40", "5": "50", "6": "60", "8": "80", "10": "100", "12": "120" },
  deg: { "11-1/4": "5", "22-1/2": "6", "30": "7", "45": "8", "90": "9" },
  rad: { "12": "0", "24": "1", "36": "2", "48": "3", "60": "4", "72": "5", "84": "6", "96": "7",
         "108": "8", "120": "9", "9.5": "SR" },
  std: { IPS: "C", ID: "D", PHENOLICIPS: "E", PHENOLICID: "F", PHENOLIC: "F" },   // pipe type -> letter in the part number
  walls: ["SW", "MW", "HW", "CW", "EW", "XW"],
  suffix: "P",
};
const HOURS = ["5 to 6", "6 to 7", "7 to 8", "8 to 9", "9 to 10", "10 to 11",
               "11 to 12", "12 to 1", "1 to 2", "2 to 3", "3 to 4", "4 to 5"];
const SPEC = ["dia", "wall", "rad", "deg", "order"];
const SRC = { dia: "diameter", wall: "wall", rad: "radius", deg: "degree", order: "order" };
const FIELD_NAME = { part: "Item", dia: "Diameter", std: "Type", wall: "Wall", deg: "Degree", rad: "Radius",
                     pcs: "Pieces", rej: "Rejects", order: "SO #" };

function fmtNum(s) {
  const t = String(s ?? "").replace(/"/g, "").trim();
  if (!/^\d*\.?\d+$/.test(t)) return t;
  const f = parseFloat(t);
  return String(f);
}
function normDia(v) {
  v = String(v ?? "").replace(/ips|\bid\b|(?<=\d)\s*id|\.|"|''/gi, "").trim();
  v = v.replace(/¼/g, "-1/4").replace(/½/g, "-1/2").replace(/¾/g, "3/4").replace(/--/g, "-").replace(/^-+/, "");
  return v.replace(/(\d)\s+(\d\/\d)/g, "$1-$2").replace(/\s/g, "");
}
function normOrder(v) { return String(v ?? "").replace(/\D/g, ""); }
function normWall(v) { return String(v ?? "").toUpperCase().replace(/[^A-Z]/g, ""); }
function normDeg(v) {
  let t = String(v ?? "").trim().replace(/°/g, "").replace(/\s+/g, "-");
  const map = { "11.25": "11-1/4", "22.5": "22-1/2", "111/4": "11-1/4", "221/2": "22-1/2" };
  if (map[t]) return map[t];
  return /^[\d.]+$/.test(t) ? fmtNum(t) : t;
}
function normStd(v) { return String(v ?? "").toUpperCase().replace(/[^A-Z]/g, ""); }
function parseISODate(s) {
  s = String(s ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}
function hourTime(shift, i, end) {
  const base = shift === 1 ? 5 : 17;
  const h = (base + i - 1 + (end ? 1 : 0)) % 24;
  return String(h).padStart(2, "0") + ":00";
}

/* ---- reading -> report objects ---- */
function cellOf(row, key) {
  const c = (row && row[key]) || {};
  return { mark: c.mark || "blank", value: String(c.value ?? "").trim(), unclear: !!c.unclear, note: c.note || "", how: c.how || "" };
}
function numOf(row, key) {
  const c = (row && row[key]) || {};
  const v = c.value;
  return { value: (v === null || v === undefined || v === "") ? null : parseInt(v, 10), unclear: !!c.unclear, note: c.note || "" };
}
function slotRows(rows) {
  const slots = HOURS.map(() => null); const loose = [];
  for (const r of rows || []) {
    const lab = String(r.hour || "").trim().toLowerCase().replace(/\s+/g, " ");
    const i = HOURS.indexOf(lab);
    if (i >= 0 && !slots[i]) slots[i] = r; else loose.push(r);
  }
  if (loose.length) return HOURS.map((_, i) => (rows || [])[i] || {});
  return slots.map(s => s || {});
}
function buildReports(fileKey, fileName, page, read, read2) {
  const out = [];
  for (const sec of (read.sections || [])) {
    const sec2 = read2 ? (read2.sections || []).find(s => s.shift === sec.shift) : null;
    const rows = slotRows(sec.rows), rows2 = sec2 ? slotRows(sec2.rows) : null;
    const rep = {
      id: `${fileKey}:${page}:${sec.shift}`, file: fileName, page, readShift: sec.shift,
      shift: sec.shift, bender: String(read.bender ?? "").replace(/\D/g, ""),
      readDate: parseISODate(sec.date) || parseISODate(sec.date_raw), names: sec.names || "", downtime: sec.downtime ?? null,
      repFlags: [], hours: [], sumEdits: {}, status: "open",
    };
    if (read.bender_unclear || !rep.bender) rep.repFlags.push(`Bender # is hard to read${read.bender_raw ? ` (written "${read.bender_raw}")` : ""}`);
    if (read2 && String(read2.bender ?? "").replace(/\D/g, "") !== rep.bender)
      rep.repFlags.push(`Second read says bender ${read2.bender}`);
    rows.forEach((r, i) => {
      const h = { i: i + 1, label: HOURS[i], cells: {}, std: normStd(r.standard), notes: [], edits: {} };
      for (const k of SPEC) h.cells[k] = cellOf(r, SRC[k]);
      const p = numOf(r, "pcs"), j = numOf(r, "rejects"), t = numOf(r, "total");
      h.pcs = isNaN(p.value) ? null : p.value; h.rej = isNaN(j.value) ? null : j.value; h.total = isNaN(t.value) ? null : t.value;
      for (const k of SPEC) { const c = h.cells[k]; if (c.unclear) h.notes.push([k, "hard to read" + (c.note ? ` (${c.note})` : "")]); }
      if (p.unclear) h.notes.push(["pcs", "hard to read" + (p.note ? ` (${p.note})` : "")]);
      if (j.unclear) h.notes.push(["rej", "hard to read" + (j.note ? ` (${j.note})` : "")]);
      if (rows2) {
        const r2 = rows2[i];
        for (const k of SPEC) {
          const a = h.cells[k], b = cellOf(r2, SRC[k]);
          const va = k === "dia" ? normDia(a.value) : a.value.toUpperCase();
          const vb = k === "dia" ? normDia(b.value) : b.value.toUpperCase();
          if (a.mark !== b.mark || (a.mark === "value" && va !== vb)) h.notes.push([k, `second read says ${b.value || b.mark}`]);
        }
        if (numOf(r2, "pcs").value !== h.pcs) h.notes.push(["pcs", `second read says ${numOf(r2, "pcs").value}`]);
        if (numOf(r2, "rejects").value !== h.rej) h.notes.push(["rej", `second read says ${numOf(r2, "rejects").value}`]);
      }
      rep.hours.push(h);
    });
    out.push(rep);
  }
  return out;
}

/* ---- part numbers ---- */
function partCandidates(dia, std, wall, rad, deg, items) {
  const dcode = KEY.dia[dia];
  if (!dcode) return { found: [], tried: [], problem: `diameter ${dia} isn't in the geometric key` };
  const scode = KEY.std[std || "IPS"];
  if (!scode) return { found: [], tried: [], problem: `type ${std} isn't mapped` };
  if (!KEY.walls.includes(wall)) return { found: [], tried: [], problem: `wall ${wall} isn't a known wall code` };
  const isNum = v => /^\d+(\.\d+)?$/.test(String(v));
  if (!KEY.deg[deg] && !isNum(fmtNum(deg))) return { found: [], tried: [], problem: `degree ${deg} isn't a number` };
  if (!KEY.rad[fmtNum(rad)] && !isNum(fmtNum(rad))) return { found: [], tried: [], problem: `radius ${rad} isn't a number` };
  const degs = KEY.deg[deg] ? [KEY.deg[deg]] : ["CD", "CR", "CA"].map(p => p + fmtNum(deg));
  const r = fmtNum(rad);
  const rads = KEY.rad[r] ? [KEY.rad[r]] : ["CR" + r, "CD" + r];
  const tried = [];
  for (const d of degs) for (const rc of rads) tried.push(`${dcode}${scode}${wall}${d}${rc}${KEY.suffix}`);
  return { found: tried.filter(t => items.has(t)), tried, problem: "" };
}

/* ---- resolve: carry-forward, edits, parts, flags ---- */
function resolve(rep, items, logKeys, date) {
  const HEADINGS = ["11-1/4", "22-1/2", "30", "45", "90"];
  const hrs = rep.hours;
  const isTick = c => c.mark === "value" && c.value && c.how !== "written" && HEADINGS.includes(normDeg(c.value));
  const wroteSpec = x => ["dia", "wall", "rad"].some(q => x.cells[q].mark === "value" && x.cells[q].value);

  // ---- 1. what the sheet says (check marks carry the value from above) ----
  const prev = { dia: null, wall: null, rad: null, deg: null, order: null };
  let prevStd = null, degWritten = false, lastCheckCol = null;
  for (const h of hrs) {
    const F = h.specFlags = []; const raw = h.raw = {}; h.carried = {};
    const pcs = ("pcs" in h.edits) ? h.edits.pcs : h.pcs;
    const producing = (pcs || 0) > 0;
    for (const k of SPEC) {
      const c = h.cells[k];
      if (k === "deg") {
        // A tick one row low: this hour writes new specs, but its degree tick only shows up on the next row.
        const nx = hrs[h.i];
        const mine = c.mark === "value" && c.value ? normDeg(c.value) : null;
        if (producing && wroteSpec(h) && nx && !wroteSpec(nx) && isTick(nx.cells.deg) && (c.mark === "blank" || (isTick(c) && mine === prev.deg))) {
          const below = normDeg(nx.cells.deg.value);
          if (below !== prev.deg) {
            raw.deg = below; degWritten = false; lastCheckCol = below;
            F.push(["WARN", "deg", `degree tick looks one row low; using ${below} from the row below`]);
            continue;
          }
        }
        if (c.mark === "value" && c.value) {
          // A degree written as a number stays for the ticks below it until a new one is written.
          const v = mine;
          const written = c.how === "written" || (c.how !== "check" && !HEADINGS.includes(v));
          if (written) { raw.deg = v; degWritten = true; lastCheckCol = null; }
          else if (degWritten && prev.deg) {
            raw.deg = prev.deg; h.carried.deg = true;
            if (v !== prev.deg && v !== lastCheckCol) F.push(["WARN", "deg", `check mark is in the ${v} column; keeping ${prev.deg} written above`]);
            lastCheckCol = v;
          } else { raw.deg = v; degWritten = false; lastCheckCol = v; }
          continue;
        }
      }
      if (c.mark === "value" && c.value) {
        const v = c.value;
        raw[k] = k === "dia" ? normDia(v) : k === "order" ? normOrder(v) : k === "wall" ? normWall(v) : k === "rad" ? fmtNum(v) : normDeg(v);
      } else if (c.mark === "carry") {
        raw[k] = prev[k]; h.carried[k] = true;
        if (prev[k] === null && producing) F.push(["BLOCK", k, "check mark, but nothing above it"]);
      } else {
        raw[k] = null;
        if (producing && prev[k] !== null) { raw[k] = prev[k]; h.carried[k] = true; F.push(["WARN", k, `blank on the sheet, using ${k === "order" ? "SO" : ""}${prev[k]} from above`]); }
        else if (producing) F.push(["BLOCK", k, "blank on the sheet"]);
      }
    }
    h.rawStd = h.std || prevStd || "";
    for (const k of SPEC) if (raw[k] !== null) prev[k] = raw[k];
    if (h.rawStd) prevStd = h.rawStd;
  }

  // ---- 2. your edits: a change carries down only through the rows that follow from it
  //         (its check-marked rows), stopping where the sheet starts a new part ----
  for (const h of hrs) { h.vals = { ...h.raw }; h.stdV = h.rawStd; h.followed = {}; }
  const startsNewPart = (n, above) => ["dia", "wall", "rad", "order"].some(q => n.cells[q].mark === "value" && n.cells[q].value)
                                      || (n.raw.deg !== above.raw.deg && !n.carried.deg);
  hrs.forEach((h, idx) => {
    for (const k of [...SPEC, "std"]) {
      if (!(k in h.edits)) continue;
      const put = (x, v) => { if (k === "std") x.stdV = v; else x.vals[k] = v; };
      put(h, h.edits[k]);
      for (let j = idx + 1; j < hrs.length; j++) {
        const n = hrs[j];
        if (k in n.edits || startsNewPart(n, hrs[j - 1])) break;
        const follows = k === "std" ? !n.std
          : (n.carried[k] || n.cells[k].mark !== "value" || (k === "deg" && isTick(n.cells.deg) && n.raw.deg === h.raw.deg));   // a tick in the same column as before = same as above
        if (!follows) break;
        put(n, h.edits[k]); n.followed[k] = true;
      }
    }
  });

  // ---- 3. part numbers and checks ----
  let running = 0;
  for (const h of hrs) {
    const vals = h.vals;
    const pcs = ("pcs" in h.edits) ? h.edits.pcs : h.pcs;
    const rej = ("rej" in h.edits) ? h.edits.rej : h.rej;
    const producing = (pcs || 0) > 0;
    // a value you set (here or carried down from your edit) replaces what the sheet's reading said
    const F = h.flags = h.specFlags.filter(f => !(f[1] in h.edits || h.followed[f[1]]));
    let std = h.stdV;
    if (producing && !std) { std = "IPS"; if (!("std" in h.edits)) F.push(["WARN", "std", "not written, using IPS"]); }
    h.stdV = std || ""; h.pcsV = pcs; h.rejV = rej; h.part = null; h.failCode = null;
    if (producing) {
      if (h.edits.part) {
        h.part = h.edits.part;
        if (items.size && !items.has(h.part)) F.push(["WARN", "part", `${h.part} isn't in the item list`]);
      } else if (vals.dia && vals.wall && vals.rad && vals.deg) {
        const { found, tried, problem } = partCandidates(vals.dia, std, vals.wall, vals.rad, vals.deg, items);
        if (problem) F.push(["BLOCK", "part", problem]);
        else if (found.length === 1) h.part = found[0];
        else if (!found.length) {                    // not in the item list: built from the geometric key, highlighted to check
          h.part = tried[0];
          if (items.size) F.push(["WARN", "part", `${tried[0]} isn't in the item list yet (built from the geometric key)`]);
        } else F.push(["BLOCK", "part", `more than one match: ${found.join(", ")}`]);
      }
      if (!vals.order) { if (!F.some(f => f[1] === "order")) F.push(["BLOCK", "order", "missing"]); }
      else if (vals.order.length !== 6) F.push(["WARN", "order", "isn't 6 digits"]);
      if (rej === null || rej === undefined) F.push(["WARN", "rej", "blank, using 0"]);
      else if (pcs !== null && rej > pcs) F.push(["WARN", "rej", "more than the pieces"]);
    }
    running += pcs || 0;
    if (h.total !== null && producing && !("pcs" in h.edits)) {
      if (h.total !== running) F.push(["WARN", "pcs", `Total column says ${h.total}, the hours add up to ${running}`]);
      running = h.total;
    }
    for (const [fld, why] of h.notes) if (!(fld in h.edits) && !h.followed[fld] && fld !== "part") F.push(["WARN", fld, why]);
  }
  rep.flags = [...rep.repFlags];
  if (rep.bender && !(+rep.bender >= 1 && +rep.bender <= 12)) rep.flags.push("bender number looks wrong");
  rep.duplicate = !!(date && rep.bender && logKeys && logKeys.has(`${date}|${rep.shift}|${+rep.bender}`));
  rep.runs = rollUp(rep);
  rep.rows = summaryRows(rep, date);
  return rep;
}

function rollUp(rep) {
  const runs = [];
  for (const h of rep.hours) {
    if (!((h.pcsV || 0) > 0)) continue;
    const order = "SO" + (h.vals.order || "?");
    const last = runs[runs.length - 1];
    if (last && last.item === h.part && last.orders.includes(order)) {
      if (!last.orders.includes(order)) last.orders.push(order);
      last.units += h.pcsV; last.rej += h.rejV || 0; last.end = hourTime(rep.shift, h.i, true); last.hours.push(h.i);
    } else {
      runs.push({ item: h.part, orders: [order], units: h.pcsV, rej: h.rejV || 0,
                  start: hourTime(rep.shift, h.i, false), end: hourTime(rep.shift, h.i, true), hours: [h.i] });
    }
  }
  for (const h of rep.hours) {
    if ((h.pcsV || 0) > 0 || !(h.rejV > 0) || !runs.length) continue;
    const before = runs.filter(r => r.hours[0] < h.i).pop();
    (before || runs.find(r => r.hours[0] > h.i)).rej += h.rejV;
  }
  for (const r of runs) r.so = r.orders.join("/");
  return runs;
}

/* Summary rows = runs + any manual summary edits (keyed by the run's first hour). */
function summaryRows(rep, date) {
  const live = new Set(rep.runs.map(r => String(r.hours[0])));
  for (const k of Object.keys(rep.sumEdits)) if (!live.has(k)) delete rep.sumEdits[k];   // run no longer exists
  return rep.runs.map(r => {
    const e = rep.sumEdits[String(r.hours[0])] || {};
    const row = { key: String(r.hours[0]), date, shift: rep.shift, bender: +rep.bender || null,
                  item: r.item, so: r.so, units: r.units, rej: r.rej, start: r.start, end: r.end, hours: r.hours,
                  edited: {} };
    for (const f of ["item", "so", "units", "rej", "start", "end"]) if (f in e) { row.computed = row.computed || {}; row.computed[f] = row[f]; row[f] = e[f]; row.edited[f] = true; }
    return row;
  }).filter(r => r.units > 0);
}

function blocking(rep) {
  return rep.hours.filter(h => (h.flags || []).some(f => f[0] === "BLOCK" || f[0] === "FOLLOW"));
}

/* Item typed by hand also fills the hours right below that have the same specs. */
function specKey(h) { return [h.vals.dia, h.vals.wall, h.vals.deg, h.vals.rad, h.stdV].join("|"); }
function applyItem(rep, h, item, items, logKeys, date) {
  const before = specKey(h);
  h.edits.part = item;
  const applied = [];
  for (const nxt of rep.hours.slice(h.i)) {
    if (!((nxt.pcsV || 0) > 0)) continue;
    if (specKey(nxt) !== before || nxt.edits.part) break;
    nxt.edits.part = item; applied.push(nxt.i);
  }
  resolve(rep, items, logKeys, date);
  return applied;
}

/* Validate a value typed into an hourly cell. Returns {value} or {error}. "" = back to what was read. */
function parseHourInput(field, text) {
  const t = String(text ?? "").trim();
  if (t === "") return { clear: true };
  switch (field) {
    case "dia": { const v = normDia(t); return KEY.dia[v] ? { value: v } : { error: `${t} isn't a diameter in the key` }; }
    case "std": { const v = normStd(t); return KEY.std[v] ? { value: v === "PHENOLIC" ? "PHENOLICID" : v } : { error: "type must be IPS, ID, Phenolic IPS or Phenolic ID" }; }
    case "wall": { const v = normWall(t); return KEY.walls.includes(v) ? { value: v } : { error: `wall must be ${KEY.walls.join(", ")}` }; }
    case "deg": { const v = normDeg(t); return /^[\d.]+$|^\d+-\d\/\d$/.test(v) ? { value: v } : { error: "degree like 90, 45, 22-1/2" }; }
    case "rad": { const v = fmtNum(t); return /^\d*\.?\d+$/.test(v) ? { value: v } : { error: "radius in inches, like 36 or 9.5" }; }
    case "order": { const v = normOrder(t); return v ? { value: v } : { error: "SO # is digits, like 136422" }; }
    case "pcs": case "rej": return /^\d+$/.test(t) ? { value: parseInt(t, 10) } : { error: "a whole number" };
    case "part": return { value: t.toUpperCase().replace(/\s/g, "") };
  }
  return { error: "unknown field" };
}
function parseTime(t) {
  const m = String(t ?? "").trim().toLowerCase().replace(/\s/g, "").match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = +m[1]; const mm = +(m[2] || 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h < 24 && mm < 60 ? `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
}
function parseSummaryInput(field, text) {
  const t = String(text ?? "").trim();
  if (t === "") return { clear: true };
  if (field === "item") return { value: t.toUpperCase().replace(/\s/g, "") };
  if (field === "so") { const parts = t.split("/").map(normOrder); return parts.every(Boolean) ? { value: parts.map(p => "SO" + p).join("/") } : { error: "SO # is digits, like 136422" }; }
  if (field === "units" || field === "rej") return /^\d+$/.test(t) ? { value: parseInt(t, 10) } : { error: "a whole number" };
  if (field === "start" || field === "end") { const v = parseTime(t); return v ? { value: v } : { error: "a time like 5:00, 17:00 or 5pm" }; }
  return { error: "unknown field" };
}

const ElbowLogic = {
  KEY, HOURS, SPEC, FIELD_NAME, fmtNum, normDia, normOrder, normDeg, parseISODate, fmtDate, hourTime,
  buildReports, partCandidates, resolve, rollUp, summaryRows, blocking, applyItem, specKey,
  parseHourInput, parseSummaryInput, parseTime,
};
if (typeof module !== "undefined") module.exports = ElbowLogic;
if (typeof window !== "undefined") window.ElbowLogic = ElbowLogic;
