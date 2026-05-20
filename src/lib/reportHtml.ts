import type { EvaluatorResult } from "./evaluator.js";

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderReportHtml(data: EvaluatorResult): string {
  if (!data.ok || !data.summary || !data.limits || !data.top) {
    return `<!DOCTYPE html><html><body><p>Error: ${esc(data.error ?? "Invalid data")}</p></body></html>`;
  }

  const s = data.summary;
  const lim = data.limits;
  const ranges = data.violationRanges ?? [];
  const t = data.top;

  const violationsTable =
    ranges.length === 0
      ? `
    <div class="card" style="padding:14px; border-radius:16px;">
      <span class="okdot"></span>
      <strong>Všechny kontroly prošly.</strong>
      <div class="subtitle" style="margin-top:6px;">
        Ve zvoleném 24hodinovém okně nebylo zjištěno žádné porušení mezních hodnot.
      </div>
    </div>`
      : `
    <div class="viol-wrapper">
      <table class="viol-table">
        <thead>
          <tr>
            <th style="width:190px;">Čas (Od – Do)</th>
            <th style="width:150px;">Veličina</th>
            <th style="width:92px;">Trvání</th>
            <th style="width:160px;">Extrém</th>
            <th>Pravidlo / detaily</th>
          </tr>
        </thead>
        <tbody>
          ${ranges
            .map(
              (v) => `
            <tr>
              <td>
                <code>${esc(v.startTime)}</code><br/>
                <code>${esc(v.endTime)}</code>
                ${v.openEnded ? `<div class="mutedline">(neukončeno v okně)</div>` : ""}
              </td>
              <td>
                <div><span class="viol-pill">${esc(v.metric)}</span></div>
                <div style="margin-top:4px;"><span class="viol-pill">${esc(v.type)}</span></div>
              </td>
              <td><code>${esc(v.duration || "")}</code></td>
              <td>
                <div class="viol-strong"><code>${esc(v.worstText)}</code></div>
                <div class="mutedline">
                  min: <code>${esc(v.minText)}</code> · max: <code>${esc(v.maxText)}</code>
                </div>
              </td>
              <td class="wrap">
                <div class="mutedline"><span class="muted">limit:</span> <code>${esc(v.ruleText)}</code></div>
                ${v.detailsText ? `<div class="mutedline"><span class="muted">detaily:</span> <code>${esc(v.detailsText)}</code></div>` : ""}
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  const stateLabel = s.counts.totalViolations === 0 ? "VYHOVUJÍCÍ" : "NEVYHOVUJÍCÍ";
  const stateClass = s.counts.totalViolations === 0 ? "okdot" : "baddot";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>24h zpráva o limitech BESS</title>

  <style>
    :root{
      --bg:#ffffff;
      --card:#ffffff;
      --muted:#4b5563;
      --text:#0b1220;
      --line:rgba(2,6,23,.15);
      --good:#16a34a;
      --bad:#dc2626;
      --warn:#f59e0b;
      --pill:#f3f4f6;
      --sans: Arial, Helvetica, "Liberation Sans", sans-serif;
      --mono: "Courier New", Courier, monospace;
    }

    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:var(--sans);
      color:var(--text);
      background: linear-gradient(180deg, #ffffff, #f8fafc 40%, #ffffff);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* IMPORTANT: don't constrain PDF width */
    .page{
      width: 100%;
      max-width: none;
      margin: 0 auto;
      padding: 28px 22px 40px;
    }

    .header{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:16px;
      margin-bottom:18px;
    }

    .title h1{
      margin:0;
      font-size:22px;
      letter-spacing:.2px;
    }

    .subtitle{
      margin-top:6px;
      color:var(--muted);
      font-size:12.5px;
      line-height:1.35;
    }

    .badge{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:10px 12px;
      border-radius:14px;
      background: #ffffff;
      border:1px solid var(--line);
      min-width: 260px;
      justify-content:space-between;
      box-shadow: 0 8px 22px rgba(2,6,23,.06);
    }

    .badge .state{
      font-weight:700;
      letter-spacing:.3px;
      font-size:12px;
      text-transform:uppercase;
    }

    .pill{
      font-family:var(--mono);
      font-size:11px;
      padding:1px 5px;
      border-radius:999px;
      background: var(--pill);
      border:1px solid var(--line);
      color:var(--text);
      white-space:nowrap;
    }

    .grid{
      display:grid;
      grid-template-columns: repeat(12, 1fr);
      gap:12px;
      margin-top:14px;
    }

    .card{
      grid-column: span 6;
      background: #ffffff;
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px 14px 12px;
      box-shadow: 0 10px 26px rgba(2,6,23,.06);
      backdrop-filter: none;
    }

    .card h2{
      margin:0 0 10px;
      font-size:13px;
      letter-spacing:.2px;
      color: var(--text);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }

    .kpis{
      display:grid;
      grid-template-columns: repeat(12, 1fr);
      gap:10px;
    }

    .kpi{
      grid-column: span 6;
      padding:10px 10px 9px;
      border-radius:14px;
      border:1px solid var(--line);
      background: #f8fafc;
    }

    .kpi .label{
      font-size:11px;
      color:var(--muted);
      margin-bottom:6px;
    }

    .kpi .value{
      font-family:var(--mono);
      font-size:13px;
      line-height:1.35;
      display:flex;
      justify-content:space-between;
      gap:10px;
    }

    .muted{ color: var(--muted); }
    .small{ font-size:11px; }
    .right{ text-align:right; }

    /* generic tables */
    table{
      width:100%;
      border-collapse: separate;
      border-spacing: 0;
      overflow:hidden;
      border-radius:14px;
      border:1px solid var(--line);
      background: #ffffff;
      table-layout: fixed; /* PDF stability */
    }

    th, td{
      padding:10px 10px;
      font-size:12px;
      border-bottom:1px solid var(--line);
      vertical-align:top;
      overflow-wrap:anywhere;
      word-break: break-word;
    }

    th{
      text-align:left;
      color:var(--text);
      font-weight:700;
      background: #f8fafc;
    }

    tr:last-child td{ border-bottom:none; }

    td code{
      font-family:var(--mono);
      font-size:11.5px;
      color:var(--text);
      white-space: nowrap;
    }

    .section{
      margin-top:16px;
    }

    .section-title{
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin: 0 0 10px;
      gap:10px;
    }

    .section-title h3{
      margin:0;
      font-size:13px;
      color:var(--text);
      letter-spacing:.2px;
    }

    .okdot, .baddot, .warndot{
      width:10px;height:10px;border-radius:999px;display:inline-block;
      margin-right:8px;
    }
    .okdot{ background: var(--good); box-shadow: 0 0 0 3px rgba(22,163,74,.15); }
    .baddot{ background: var(--bad); box-shadow: 0 0 0 3px rgba(220,38,38,.15); }
    .warndot{ background: var(--warn); box-shadow: 0 0 0 3px rgba(245,158,11,.15); }

    .row2{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:12px;
    }

    .footer{
      margin-top:18px;
      padding-top:12px;
      border-top:1px dashed var(--line);
      color:var(--muted);
      font-size:11px;
      display:flex;
      justify-content:space-between;
      gap:12px;
      flex-wrap:wrap;
    }

    /* ===== VIOLATIONS TABLE (PDF-safe) ===== */
    .viol-table{ table-layout: fixed; }
    .viol-table th, .viol-table td{
      padding: 8px 10px;
      line-height: 1.25;
      font-size: 12px;
      vertical-align: top;
    }
    .viol-table td code{
      font-size: 11px;
      white-space: nowrap;
    }
    .viol-table .wrap code{
      white-space: normal; /* allow wrap for details */
    }
    .viol-table .mutedline{
      margin-top: 3px;
      font-size: 11px;
      line-height: 1.2;
      color: var(--muted);
    }
    .viol-pill{
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      border:1px solid var(--line);
      background: var(--pill);
      font-family: var(--mono);
      font-size: 10.5px;
      white-space: nowrap;
    }
    .viol-strong{ font-weight: 700; }

    /* Print / pagination rules: ONLY prevent splitting rows & table header repeats */
    thead{ display: table-header-group; }
    tfoot{ display: table-footer-group; }
    tr{ break-inside: avoid; page-break-inside: avoid; }

    @page {
      size: A4;
      margin: 22mm 14mm 18mm 14mm;
    }

    @media print{
      body{ background:#fff; color:#0b1220; }
      .page{ padding: 0; }
      .card{ background:#fff; box-shadow:none; }
      table{ background:#fff; }
      .badge{ background:#fff; box-shadow:none; }

      /* stabilize layout for printing: stack cards */
      .grid, .row2{ display:block; }
      .card{ margin-bottom:12mm; }

      /* slightly smaller timestamps to fit */
      td:nth-child(1) code,
      td:nth-child(2) code{ font-size: 10.5px; }
    }

    /* Keep section title with the content right after it */
    .section-title{
      break-after: avoid;
      page-break-after: avoid;
    }

    /* Extra safety: don't allow a page break right after the title wrapper */
    .section-title + *{
      break-before: avoid;
      page-break-before: avoid;
    }
    /* Annex tables: keep whole card + table together (no splits) */
    .annex-card,
    .annex-card table{
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    /* If your PDF engine ignores table break rules, force wrapper as the unit */
    .annex-card{
      display: block;
    }
    /* Rounded wrapper for violations */
    .viol-wrapper{
      border:1px solid var(--line);
      border-radius:14px;
      overflow:hidden;          /* IMPORTANT */
      background:#fff;
    }

    /* Remove outer border from table itself */
    .viol-table{
      border:none;
      border-radius:0;
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- HLAVIČKA -->
    <div class="header">
      <div class="title">
        <h1>24h zpráva o limitech BESS</h1>
        <div class="subtitle">
          Okno hodnocení:
          <span class="pill">${esc(s.window.start)}</span>
          ->
          <span class="pill">${esc(s.window.end)}</span>
          <br/>
          Počet časových okamžiků s porušením: <span class="pill">${esc(s.counts.violatedTimestamps)}</span>
        </div>
      </div>

      <!-- STAVOVÝ ŠTÍTEK -->
      <div class="badge">
        <div>
          <div class="state">${stateLabel}</div>
          <div class="subtitle" style="margin:6px 0 0;">
            Celkový počet porušení: <span class="pill">${esc(s.counts.totalViolations)}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="${stateClass}"></span>
          <span class="pill">${data.ok ? "OK" : "CHYBA"}</span>
        </div>
      </div>
    </div>

    <!-- KPI -->
    <div class="grid">
      <div class="card" style="grid-column: span 7;">
        <h2>Provozní rozsah <span class="pill">Souhrn</span></h2>

        <div class="kpis">
          <div class="kpi">
            <div class="label">Napětí článků (${esc(s.cell_voltage.unit)})</div>
            <div class="value">
              <span><code>min</code> ${esc(s.cell_voltage.min)}</span>
              <span class="muted">-></span>
              <span><code>max</code> ${esc(s.cell_voltage.max)}</span>
            </div>
          </div>

          <div class="kpi">
            <div class="label">Napětí modulů (${esc(s.module_voltage.unit)})</div>
            <div class="value">
              <span><code>min</code> ${esc(s.module_voltage.min)}</span>
              <span class="muted">-></span>
              <span><code>max</code> ${esc(s.module_voltage.max)}</span>
            </div>
          </div>

          <div class="kpi">
            <div class="label">Teplota článků (${esc(s.cell_temp.unit)})</div>
            <div class="value">
              <span><code>min</code> ${esc(s.cell_temp.min)}</span>
              <span class="muted">-></span>
              <span><code>max</code> ${esc(s.cell_temp.max)}</span>
            </div>
          </div>

          <div class="kpi">
            <div class="label">Teplota modulů (${esc(s.module_temp.unit)})</div>
            <div class="value">
              <span><code>min</code> ${esc(s.module_temp.min)}</span>
              <span class="muted">-></span>
              <span><code>max</code> ${esc(s.module_temp.max)}</span>
            </div>
          </div>

          <div class="kpi" style="grid-column: span 12;">
            <div class="label">SOC (${esc(s.soc.unit)})</div>
            <div class="value">
              <span><code>min</code> ${esc(s.soc.min)}</span>
              <span class="muted">-></span>
              <span><code>max</code> ${esc(s.soc.max)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- LIMITY -->
      <div class="card" style="grid-column: span 5;">
        <h2>Použité limity</h2>
        <table>
          <thead>
            <tr>
              <th>Veličina</th>
              <th class="right">Limit</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Teplota článků</td><td class="right"><code>${esc(lim.cellTemp.min)}–${esc(lim.cellTemp.max)}</code> ${esc(lim.cellTemp.unit)}</td></tr>
            <tr><td>Teplota modulů</td><td class="right"><code>${esc(lim.modTemp.min)}–${esc(lim.modTemp.max)}</code> ${esc(lim.modTemp.unit)}</td></tr>
            <tr><td>SOC</td><td class="right"><code>${esc(lim.soc.min)}–${esc(lim.soc.max)}</code> ${esc(lim.soc.unit)}</td></tr>
            <tr><td>Bezpečné napětí článků</td><td class="right"><code>${esc(lim.cellVolt.min)}–${esc(lim.cellVolt.max)}</code> ${esc(lim.cellVolt.unit)}</td></tr>
            <tr><td>Rozdíl teplot článků</td><td class="right"><code>≤ ${esc(lim.cellTempSpreadMax)}</code> °C</td></tr>
            <tr><td>Rozdíl teplot modulů</td><td class="right"><code>≤ ${esc(lim.modTempSpreadMax)}</code> °C</td></tr>
            <tr><td>Rozdíl napětí článků</td><td class="right"><code>≤ ${esc(lim.cellVoltSpreadMax)}</code> V</td></tr>
            <tr><td>Rozdíl napětí modulů</td><td class="right"><code>≤ ${esc(lim.moduleVoltSpreadMax)}</code> V</td></tr>
          </tbody>
        </table>
      </div>
    </div>

<!-- PORUŠENÍ (intervaly) -->
<div class="section">
  <div class="section-title">
    <h3>Porušení limitů (intervaly)</h3>
        <span class="pill">${ranges.length} intervalů</span>
      </div>
      ${violationsTable}
</div>
    <!-- DOMINANCE -->
    <div class="section">
      <div class="section-title">
        <h3>Dominance (články a moduly s největšími a nejmenšími hodnotami)</h3>
      </div>

      <div class="row2">
        <!-- TEPLOTA -->
        <div class="card">
          <h2>Teplotní statistiky</h2>
          <table>
            <thead><tr><th>Kategorie</th><th class="right">Sériové číslo</th><th class="right">Podíl</th></tr></thead>
            <tbody>
              <tr><td>Článek s max. teplotou</td><td class="right"><code>${esc(t.cell_max_temp.topId)}</code></td><td class="right"><code>${esc(t.cell_max_temp.topPct)}%</code></td></tr>
              <tr><td>Článek s min. teplotou</td><td class="right"><code>${esc(t.cell_min_temp.topId)}</code></td><td class="right"><code>${esc(t.cell_min_temp.topPct)}%</code></td></tr>
              <tr><td>Modul s max. teplotou</td><td class="right"><code>${esc(t.mod_max_temp.topId)}</code></td><td class="right"><code>${esc(t.mod_max_temp.topPct)}%</code></td></tr>
              <tr><td>Modul s min. teplotou</td><td class="right"><code>${esc(t.mod_min_temp.topId)}</code></td><td class="right"><code>${esc(t.mod_min_temp.topPct)}%</code></td></tr>
            </tbody>
          </table>
        </div>

        <!-- NAPĚTÍ -->
        <div class="card">
          <h2>Napěťová statistiky</h2>
          <table>
            <thead><tr><th>Kategorie</th><th class="right">Sériové číslo</th><th class="right">Podíl</th></tr></thead>
            <tbody>
              <tr><td>Článek s max. napětím</td><td class="right"><code>${esc(t.cell_max_volt.topId)}</code></td><td class="right"><code>${esc(t.cell_max_volt.topPct)}%</code></td></tr>
              <tr><td>Článek s min. napětím</td><td class="right"><code>${esc(t.cell_min_volt.topId)}</code></td><td class="right"><code>${esc(t.cell_min_volt.topPct)}%</code></td></tr>
              <tr><td>Modul s max. napětím</td><td class="right"><code>${esc(t.mod_max_volt.topId)}</code></td><td class="right"><code>${esc(t.mod_max_volt.topPct)}%</code></td></tr>
              <tr><td>Modul s min. napětím</td><td class="right"><code>${esc(t.mod_min_volt.topId)}</code></td><td class="right"><code>${esc(t.mod_min_volt.topPct)}%</code></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PŘÍLOHA: ROZPADY -->
    <div class="section">
      <div class="section-title">
        <h3>Příloha: Statistiky podle provozní doby na okrajových hodnotách</h3>
      </div>
      <div class="row2">
        <div class="card annex-card">
          <h2>Rozdělení max. napětí článků</h2>
          <table>
            <thead><tr><th>Sériové číslo</th><th class="right">Počet bodů</th><th class="right">Podíl</th></tr></thead>
            <tbody>${(t.cell_max_volt.breakdown || []).map((x) => `<tr><td><code>${esc(x.id)}</code></td><td class="right"><code>${esc(x.count)}</code></td><td class="right"><code>${esc(x.pct)}%</code></td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="card annex-card">
          <h2>Rozdělení min. napětí modulů</h2>
          <table>
            <thead><tr><th>Sériové číslo</th><th class="right">Počet bodů</th><th class="right">Podíl</th></tr></thead>
            <tbody>${(t.mod_min_volt.breakdown || []).map((x) => `<tr><td><code>${esc(x.id)}</code></td><td class="right"><code>${esc(x.count)}</code></td><td class="right"><code>${esc(x.pct)}%</code></td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="row2" style="margin-top:12px;">
        <div class="card annex-card">
          <h2>Rozdělení min. napětí článků</h2>
          <table>
            <thead><tr><th>Sériové číslo</th><th class="right">Počet bodů</th><th class="right">Podíl</th></tr></thead>
            <tbody>${(t.cell_min_volt.breakdown || []).map((x) => `<tr><td><code>${esc(x.id)}</code></td><td class="right"><code>${esc(x.count)}</code></td><td class="right"><code>${esc(x.pct)}%</code></td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="card annex-card">
          <h2>Rozdělení max. napětí modulů</h2>
          <table>
            <thead><tr><th>Sériové číslo</th><th class="right">Počet bodů</th><th class="right">Podíl</th></tr></thead>
            <tbody>${(t.mod_max_volt.breakdown || []).map((x) => `<tr><td><code>${esc(x.id)}</code></td><td class="right"><code>${esc(x.count)}</code></td><td class="right"><code>${esc(x.pct)}%</code></td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PATIČKA -->
    <div class="footer">
      <div>Generováno v Cursor</div>
      <div class="right">ID zprávy: <span class="pill">${new Date().toISOString()}</span></div>
    </div>
  </div>
</body>
</html>`;
}
