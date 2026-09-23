/* Landing page for India State Budget Data.

   The dataset statistics come from the Karnataka package files that ship
   with the site (index.json, quality.json). The explorer reuses the portal's
   own engine, store, model, and search modules instead of a second copy of
   the data. window.PORTAL points at ./public-finance/, so Store resolves to
   ./public-finance/data/. */

const STATE = "ka";
const TABLE_FILES = [
  ["budget_<year>.csv", "Document-shaped budget rows with account codes, financial amounts, and source page references."],
  ["checks_<year>.csv", "One arithmetic comparison per account key and financial column."],
  ["validation_findings.csv", "Failed comparisons with their checked total or summary-row page references."],
  ["data_dictionary.csv", "Definitions for package columns and controlled values."],
  ["known_caveats.md", "Limits on amount units, financial-column mapping, summation, and check scope."],
  ["guide.html", "Reference guide for the account hierarchy, additive-row filter, and check IDs."]
];

const CHECKS = [
  ["Within-table reconciliation", "Printed totals only", "Lower-level extracted rows are summed and compared with the corresponding printed total in the same table."],
  ["Across-table reconciliation", "Matching summaries only", "Extracted totals from one table are compared with the corresponding extracted row in a minor-head or sub-major-head summary table."],
  ["Pass threshold", "Each financial column", "A comparison passes when its absolute difference is less than 0.01 in the package's stated INR-lakh unit."]
];

const SQL_RECIPE = `-- One year of Karnataka budget rows, safe detail rows only.
CREATE TABLE ka_budget_2024_25 AS
SELECT *
FROM read_csv_auto(
  'karnataka-state-finance/years/2024-25/csv/budget_2024-25.csv'
);

SELECT
  demand_number,
  SUM(TRY_CAST(REPLACE(budget_estimate_2024_25_amount::VARCHAR, ',', '') AS DOUBLE)) AS amount_in_inr_lakh
FROM ka_budget_2024_25
WHERE type_of_table = 'object_head'
  AND row_type = 'Data'
  AND row_level = 'Object-Head'
GROUP BY 1
ORDER BY amount_in_inr_lakh DESC;`;

const $ = (s) => document.querySelector(s);
const crore = (v) => v == null ? null : v / IX.crore_div;

let IX = null;                 // the Karnataka index
let DY = null;                 // selected document year
let STATE_META = null;         // Karnataka entry from states.json
let QUALITY = null;            // per-year reconciliation summary
const models = new Map();      // major code -> wrapped shard
const open = new Set();        // expanded row keys
let filterQuery = "";
let renderToken = 0;

const key = (mj, trail) => mj + ":" + trail.join(">");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* --------------------------------------------------------------- static */
function renderMetrics() {
  const latestYear = IX.doc_years[IX.doc_years.length - 1];
  const latestPass = QUALITY?.years?.[latestYear]?.pp ?? STATE_META?.pass?.pct;
  const leafRows = STATE_META?.leaf_rows ?? IX.n_leaf_rows;
  const metrics = [
    [Engine.nfIN(IX.doc_years.length), "document years in the explorer"],
    [Engine.nfIN(leafRows), "detail rows in the explorer index"],
    [latestPass == null ? Engine.nfIN(IX.majors.length) : `${Number(latestPass).toFixed(2)}%`,
      latestPass == null ? "major heads in the explorer" : `checks passed in ${latestYear}`]
  ];
  $("#metrics").innerHTML = metrics
    .map(([value, label]) => `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`)
    .join("");
}

function renderTables() {
  $("#tableList").innerHTML = TABLE_FILES
    .map(([name, detail]) => `<div class="table-item"><strong>${esc(name)}</strong><span>${esc(detail)}</span></div>`)
    .join("");
}

function renderChecks() {
  $("#validationList").innerHTML = CHECKS
    .map(([check, status, detail]) => `<div class="validation-row"><strong>${esc(check)}</strong><span>${esc(status)}</span><span>${esc(detail)}</span></div>`)
    .join("");
}

function setupSql() {
  $("#sqlRecipe code").textContent = SQL_RECIPE;
  $("#copySql").addEventListener("click", async () => {
    const status = $("#copyStatus");
    try {
      await navigator.clipboard.writeText(SQL_RECIPE);
      status.textContent = "Copied";
    } catch {
      status.textContent = "Select the SQL text to copy";
    }
  });
  const citation = $("#projectCitation")?.textContent || "";
  $("#copyCitation")?.addEventListener("click", async () => {
    const status = $("#citationStatus");
    try {
      await navigator.clipboard.writeText(citation);
      status.textContent = "Citation copied";
    } catch {
      status.textContent = "Select the citation text to copy";
    }
  });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportVisibleAccounts() {
  if (!IX) return;
  const query = filterQuery.trim().toLowerCase();
  const specs = cols();
  const rows = IX.majors
    .filter((m) => !query || m.c.includes(query) || (m.n || "").toLowerCase().includes(query))
    .sort((a, b) => Model.mval(b, specs[3]) - Model.mval(a, specs[3]));
  const header = ["state", "document_year", "account_code", "account_name", ...specs.map((c) => c.label)];
  const body = rows.map((m) => [STATE, DY, m.c, m.n || "", ...specs.map((c) => {
    if (!Model.colExists(IX, c)) return "";
    const raw = Model.mval(m, c);
    return Number.isFinite(raw) ? raw / 100 : "";
  })]);
  const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `india-public-finance-${STATE}-${DY}-filtered-heads.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  const status = $("#exportStatus");
  if (status) status.textContent = `${rows.length} filtered heads prepared as CSV`;
}

/* --------------------------------------------------------------- data */
function renderHeatmap(qualityError = false) {
  if (!$("#coverageHeatmap")) return;
  const cells = [];
  for (const year of IX.doc_years) {
    const rec = QUALITY?.years?.[year];
    const pp = Number.isFinite(rec?.pp) ? rec.pp : null;
    const title = pp == null
      ? `${year}: reconciliation quality unavailable`
      : `${year}: ${pp.toFixed(2)}% of ${Engine.nfIN(rec.n)} printed-total checks passed`;
    cells.push(`<div class="heat-cell quality${pp == null ? " unavailable" : ""}"${pp == null ? "" : ` style="--quality:${pp}%"`} title="${esc(title)}">
      <span>${esc(year)}</span><strong>${pp == null ? "–" : `${pp.toFixed(1)}%`}</strong>
    </div>`);
  }
  $("#coverageHeatmap").innerHTML = cells.join("");
  const subtitle = document.querySelector(".heatmap-shell .section-heading small");
  if (subtitle) subtitle.textContent = "printed-total checks by document year";
  const legend = document.querySelector(".heatmap-shell .legend");
  if (legend) {
    legend.innerHTML = `<span>${qualityError
      ? "Quality data is unavailable. Document years come from the explorer index."
      : "Each percentage is the share of printed-total checks that passed."}</span>`;
  }
}

function renderCoverageList(qualityError = false) {
  const rows = IX.doc_years.map((year) => {
    const rec = QUALITY?.years?.[year];
    const pass = Number.isFinite(rec?.pp) ? `${rec.pp.toFixed(2)}%` : "–";
    const agreement = Number.isFinite(rec?.mu) ? `${rec.mu.toFixed(2)}%` : "–";
    const count = Number.isFinite(rec?.n) ? Engine.nfIN(rec.n) : "–";
    return `<tr><th scope="row">${esc(year)}</th><td>${count}</td><td>${pass}</td><td>${agreement}</td></tr>`;
  }).join("");
  const host = $("#coverageTable");
  host.innerHTML = `<table class="coverage-data">
    <thead><tr><th scope="col">Document year</th><th scope="col">Comparisons</th><th scope="col">Checks passed</th><th scope="col">Mean amount agreement</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  let note = host.querySelector(".coverage-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "coverage-note";
    host.append(note);
  }
  note.textContent = qualityError
    ? "Per-year quality data could not be loaded. The explorer and its document-year index remain available."
    : "Checks passed is the share of comparisons within tolerance. Each comparison also scores 100% minus its percentage difference from the extracted total, with a minimum score of zero. Mean amount agreement averages these scores. Source-page accuracy requires a separate check.";
}

/* ------------------------------------------------------------- helper */
const fmt = (v) => v == null ? "–" : Engine.money(v);

function cols() {
  return Model.docCols(IX, DY);
}

async function ensureModel(mj) {
  let model = models.get(mj);
  if (model) return model;
  const shard = await Store.shard(STATE, mj);
  model = Model.wrap(shard);
  models.set(mj, model);
  return model;
}

function findNode(model, lv, code, name) {
  let id = model.nodes.findIndex((n) => n.lv === lv && n.code === code && n.name === name);
  if (id < 0) id = model.nodes.findIndex((n) => n.lv === lv && n.code === code);
  return id;
}

/* ------------------------------------------------------------ explorer */
function rowCells(values) {
  return values.map((v) => {
    const cr = crore(v);
    return `<td class="pf-num${cr == null ? " nil" : ""}">${fmt(cr)}</td>`;
  }).join("");
}

function rowHtml({ mj, trail, code, name, depth, values, hasKids }) {
  const isOpen = open.has(key(mj, trail));
  const caret = hasKids
    ? `<button class="pf-care" type="button" aria-expanded="${isOpen}" aria-label="${isOpen ? "Collapse" : "Expand"} ${esc(name)}">${isOpen ? "▾" : "▸"}</button>`
    : '<span class="pf-care pf-care-empty" aria-hidden="true"></span>';
  return `<tr class="pf-row${hasKids ? " pf-can" : ""}${isOpen ? " pf-open" : ""}" data-key="${esc(key(mj, trail))}" data-mj="${esc(mj)}" data-trail="${esc(trail.join(","))}">
    <td class="l pf-name"><span class="pf-indent" style="padding-left:${depth * 18}px"></span>${caret}<span class="pf-code">${esc(code)}</span><span class="pf-label">${esc(name || "(name not printed)")}</span></td>
    ${rowCells(values)}
  </tr>`;
}

function walk(mj, model, trail, depth, colSpecs, out) {
  const children = Model.childrenOf(model, trail, colSpecs, DY);
  const items = [...children.entries()].sort((a, b) => b[1].v[3] - a[1].v[3] || a[1].v[0] - b[1].v[0]);
  for (const [id, rec] of items) {
    const node = model.nodes[id];
    const childTrail = trail.concat(id);
    out.push(rowHtml({
      mj, trail: childTrail, code: node.code, name: node.name, depth,
      values: rec.v.map((v) => v), hasKids: rec.kids.size > 0
    }));
    if (open.has(key(mj, childTrail))) walk(mj, model, childTrail, depth + 1, colSpecs, out);
  }
}

async function renderTree() {
  const token = ++renderToken;
  const colSpecs = cols();
  const body = $("#pfRows");
  const note = $("#pfNote");
  const q = filterQuery.trim().toLowerCase();

  const majors = IX.majors
    .filter((m) => !q || m.c.includes(q) || (m.n || "").toLowerCase().includes(q))
    .sort((a, b) => Model.mval(b, colSpecs[3]) - Model.mval(a, colSpecs[3]));

  const out = [];
  for (const m of majors) {
    const values = colSpecs.map((c) => Model.colExists(IX, c) ? Model.mval(m, c) : null);
    out.push(rowHtml({ mj: m.c, trail: [], code: m.c, name: m.n, depth: 0, values, hasKids: true }));
    if (open.has(key(m.c, []))) {
      const model = await ensureModel(m.c);
      walk(m.c, model, [], 1, colSpecs, out);
    }
  }
  if (token !== renderToken) return;

  const total = IX.majors.length;
  const shown = majors.length;
  note.textContent = q
    ? `${shown} of ${total} major heads match "${filterQuery.trim()}".`
    : `${total} major heads. Open one to see the levels beneath it.`;
  body.innerHTML = out.join("") || '<tr><td class="l pf-empty" colspan="5">No account head matches that.</td></tr>';
}

function setHeaders(colSpecs) {
  const head = document.getElementById("pfHeadRow");
  if (!head) return;
  head.innerHTML = '<th class="l">Account head</th>'
    + colSpecs.map((c) => `<th class="pf-num">${esc(c.label)}</th>`).join("");
}

function toggleRow(tr) {
  const mj = tr.dataset.mj;
  const trail = tr.dataset.trail ? tr.dataset.trail.split(",").filter((s) => s !== "").map(Number) : [];
  const rowKey = key(mj, trail);
  if (open.has(rowKey)) open.delete(rowKey); else open.add(rowKey);
  renderTree();
}

async function pickSearchEntry(entry) {
  const mj = entry.lv === "mj" ? entry.code : (entry.majors && entry.majors[0]);
  if (!mj) return;
  if (entry.lv === "mj") {
    filterQuery = "";
    $("#pfSearch").querySelector("input").value = "";
    open.add(key(mj, []));
    await renderTree();
    document.querySelector(`[data-key="${CSS.escape(key(mj, []))}"]`)?.scrollIntoView({ block: "center" });
    return;
  }
  const model = await ensureModel(mj);
  const id = findNode(model, entry.lv, entry.code, entry.name);
  if (id < 0) return;
  for (const chain of model.chains) {
    const at = chain.indexOf(id);
    if (at < 0) continue;
    filterQuery = "";
    $("#pfSearch").querySelector("input").value = "";
    open.add(key(mj, []));
    for (let a = 0; a < at; a++) open.add(key(mj, chain.slice(0, a + 1)));
    const trail = chain.slice(0, at + 1);
    open.add(key(mj, trail));
    await renderTree();
    document.querySelector(`[data-key="${CSS.escape(key(mj, trail))}"]`)?.scrollIntoView({ block: "center" });
    return;
  }
}

function setupExplorer() {
  const select = $("#pfYear");
  select.innerHTML = IX.doc_years.map((y) => `<option value="${y}">${y}</option>`).join("");
  DY = IX.doc_years[IX.doc_years.length - 1];
  select.value = DY;
  select.addEventListener("change", () => {
    DY = select.value;
    open.clear();
    setHeaders(cols());
    renderTree();
  });

  $("#pfRows").addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr.pf-can");
    if (tr) toggleRow(tr);
  });

  setHeaders(cols());
  renderTree();
  const exportButton = $("#exportAccounts");
  if (exportButton) {
    exportButton.disabled = false;
    exportButton.addEventListener("click", exportVisibleAccounts);
  }

  const index = Search.makeIndex(STATE);
  Search.attach($("#pfSearch"), index, {
    global: () => true,
    onPick: pickSearchEntry
  });

  const input = $("#pfSearch").querySelector("input");
  input.addEventListener("input", () => {
    filterQuery = input.value;
    open.clear();
    renderTree();
  });

  document.querySelectorAll("[data-explore-head]").forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", async () => {
      const code = button.dataset.exploreHead;
      filterQuery = code;
      input.value = code;
      open.clear();
      open.add(key(code, []));
      try {
        await renderTree();
        $("#pfSearchInput").focus({ preventScroll: true });
        $("#explore").scrollIntoView({ block: "start", behavior: "smooth" });
      } catch {
        $("#pfNote").textContent = "This account could not be loaded. Select another account or reload the page.";
      }
    });
  });
}

async function setupHealthExample() {
  const host = $("#healthChart");
  const select = $("#healthYear");
  if (!host || !select) return;
  try {
    const response = await fetch("./resources/health-example.json");
    if (!response.ok) throw new Error("Example unavailable");
    const data = await response.json();
    const rows = (data.rows || []).filter((r) =>
      typeof r.fiscal_year === "string" && [r.be, r.re, r.actuals].every(Number.isFinite) && r.be > 0);
    if (!rows.length) throw new Error("No example years");
    select.innerHTML = rows.map((r) => `<option value="${esc(r.fiscal_year)}">${esc(r.fiscal_year)}</option>`).join("");
    select.value = rows[rows.length - 1].fiscal_year;
    select.disabled = false;
    const render = () => {
      const row = rows.find((r) => r.fiscal_year === select.value);
      if (!row) return;
      const max = Math.max(row.be, row.re, row.actuals);
      const bars = [["Budget estimate", "budget", row.be], ["Revised estimate", "revised", row.re], ["Actual expenditure", "actuals", row.actuals]];
      host.innerHTML = bars.map(([label, type, value]) => `<div class="health-bar ${type}"><span>${label}</span><div class="health-track" aria-hidden="true"><div class="health-fill" style="--bar-width:${100 * value / max}%"></div></div><strong>${value.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></div>`).join("") + '<p class="chart-unit">₹ crore at current prices</p>';
      $("#healthInsight").textContent = `Actual expenditure was ${(row.actuals / row.be * 100).toFixed(1)}% of the budget estimate in ${row.fiscal_year}.`;
    };
    select.addEventListener("change", render);
    render();
  } catch {
    select.disabled = true;
    select.innerHTML = '<option>Unavailable</option>';
    host.innerHTML = '<p>The example could not be loaded. The analysis is available through the Python link below.</p>';
  }
}

/* ---------------------------------------------------------------- boot */
setupHealthExample();
const stateRequest = Store.states()
  .then((stateList) => ({ stateList }))
  .catch((error) => ({ error }));
const qualityRequest = Store.quality(STATE)
  .then((quality) => ({ quality }))
  .catch((error) => ({ error }));

Store.index(STATE)
  .then((index) => {
    IX = index;
    renderMetrics();
    renderHeatmap();
    renderTables();
    renderCoverageList();
    renderChecks();
    setupSql();
    setupExplorer();
    $("#pfMeta").textContent = `${IX.name}: ${Engine.nfIN(IX.n_leaf_rows)} detail rows across ${IX.doc_years.length} document years, with ${Engine.nfIN(IX.majors.length)} major heads in the explorer.`;

    stateRequest.then(({ stateList }) => {
      if (!stateList) return;
      STATE_META = (stateList.states || []).find((s) => s.st === STATE || s.code === "KA") || null;
      renderMetrics();
    });

    qualityRequest.then(({ quality, error }) => {
      if (quality) QUALITY = quality;
      renderMetrics();
      renderHeatmap(Boolean(error));
      renderCoverageList(Boolean(error));
    });
  })
  .catch((err) => {
    const note = $("#pfNote");
    if (note) note.textContent = "Could not load the explorer index: " + err.message;
  });
