// Registrasi plugin anotasi Chart.js (garis BEP & batas tahap)
if (window.Chart && window['chartjs-plugin-annotation']) {
  Chart.register(window['chartjs-plugin-annotation']);
}

// ─── State ───
let state = {
  steps: [
    { months: 36, rate: 3, payment: 0 },
    { months: 36, rate: 6.5, payment: 0 },
    { months: 108, rate: 9.35, payment: 0 },
  ],
  toEnabled: false,
  feeMode: 'nominal',
  result: null,
  takeover: null,
};
let balanceChartInstance = null;
let toChartInstance = null;

// ─── Math ───
function standardPayment(balance, monthlyRate, n) {
  if (n <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-9) return balance / n;
  const f = Math.pow(1 + monthlyRate, n);
  return (balance * monthlyRate * f) / (f - 1);
}

function simulateFull(principal, steps) {
  let balance = principal;
  const rows = [];
  const stepSummaries = [];
  let monthCounter = 0;

  steps.forEach((s, stepIdx) => {
    const r = (s.rate || 0) / 100 / 12;
    const startBal = balance;
    let stepInt = 0, stepPrinc = 0;
    for (let m = 0; m < s.months; m++) {
      monthCounter++;
      const begin = balance;
      const interest = begin * r;
      const princPaid = s.payment - interest;
      balance = begin - princPaid;
      stepInt += interest;
      stepPrinc += princPaid;
      rows.push({ month: monthCounter, step: stepIdx + 1, beginBalance: begin, interest, payment: s.payment, principal: princPaid, endBalance: balance });
    }
    stepSummaries.push({ step: stepIdx + 1, months: s.months, rate: s.rate, payment: s.payment, startBalance: startBal, interest: stepInt, principal: stepPrinc, endBalance: balance });
  });

  return {
    rows, stepSummaries,
    totalInterest: rows.reduce((a, r) => a + r.interest, 0),
    totalPayments: rows.reduce((a, r) => a + r.payment, 0),
    endingBalance: balance,
    totalMonths: monthCounter,
  };
}

function solveMonthlyIRR(cashflows) {
  const npv = (rate) => cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);
  let lo = -0.99, hi = 3;
  let npvLo = npv(lo), npvHi = npv(hi);
  if (npvLo * npvHi > 0) { hi = 20; npvHi = npv(hi); if (npvLo * npvHi > 0) return null; }
  let mid = 0;
  for (let i = 0; i < 200; i++) {
    mid = (lo + hi) / 2;
    const m = npv(mid);
    if (Math.abs(m) < 1e-8) break;
    if (npvLo * m < 0) hi = mid; else { lo = mid; npvLo = m; }
  }
  return mid;
}

// ─── Formatting ───
function sym() { return document.getElementById('currency').value; }

function fmtMoney(v) {
  if (v == null || !isFinite(v)) return '—';
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${neg ? '-' : ''}${sym()} ${s}`;
}

function fmtMoneyFull(v) {
  if (v == null || !isFinite(v)) return '—';
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}${sym()} ${s}`;
}

function fmtCompact(v) {
  const a = Math.abs(v);
  let n = v, u = '';
  if (a >= 1e12) { n = v/1e12; u = ' T'; }
  else if (a >= 1e9) { n = v/1e9; u = ' M'; }
  else if (a >= 1e6) { n = v/1e6; u = ' jt'; }
  else if (a >= 1e3) { n = v/1e3; u = ' rb'; }
  return sym() + ' ' + n.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + u.replace(' ', ' ');
}

function fmtPct(v, d) { return v == null || !isFinite(v) ? '—' : v.toFixed(d || 2) + '%'; }

function parseNum(str) {
  const d = String(str).replace(/[^0-9]/g, '');
  return d === '' ? 0 : Number(d);
}

function formatThousands(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  return isFinite(v) ? Math.round(v).toLocaleString('id-ID') : '';
}

function formatPrincipal(el) {
  const pos = el.selectionStart;
  const before = el.value.slice(0, pos).replace(/[^0-9]/g, '').length;
  const num = parseNum(el.value);
  const fmt = formatThousands(num);
  el.value = fmt;
  // restore cursor
  let seen = 0, np = fmt.length;
  for (let i = 0; i < fmt.length; i++) { if (/[0-9]/.test(fmt[i])) seen++; if (seen === before) { np = i + 1; break; } }
  if (before === 0) np = 0;
  el.setSelectionRange(np, np);
  updatePrincipalWords();
}

function formatField(el) {
  const pos = el.selectionStart;
  const before = el.value.slice(0, pos).replace(/[^0-9]/g, '').length;
  const num = parseNum(el.value);
  const fmt = formatThousands(num);
  el.value = fmt;
  let seen = 0, np = fmt.length;
  for (let i = 0; i < fmt.length; i++) { if (/[0-9]/.test(fmt[i])) seen++; if (seen === before) { np = i + 1; break; } }
  if (before === 0) np = 0;
  el.setSelectionRange(np, np);
}

function terbilang(n) {
  if (n >= 1e12) return (n/1e12).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' triliun';
  if (n >= 1e9) return (n/1e9).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' miliar';
  if (n >= 1e6) return (n/1e6).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' juta';
  if (n >= 1e3) return (n/1e3).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' ribu';
  return n.toLocaleString('id-ID');
}

function updatePrincipalWords() {
  const n = parseNum(document.getElementById('principal').value);
  document.getElementById('principalWords').textContent = n > 0 ? '≈ ' + terbilang(n) + ' rupiah' : '';
}

function monthsToText(m) {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  let s = '';
  if (y > 0) s += y + ' tahun';
  if (mo > 0) s += (s ? ' ' : '') + mo + ' bulan';
  return s || '0 bulan';
}

// ─── KPR Type Presets ───
const KPR_PRESETS = {
  'fix-float': [
    { months: 36, rate: 3.88 },
    { months: 24, rate: 6.5 },
    { months: 120, rate: 9.35 },
  ],
  'fix-all': [
    { months: 180, rate: 8.25 },
  ],
  'jenjang': [
    { months: 12, rate: 2.75 },
    { months: 12, rate: 4.5 },
    { months: 12, rate: 6.25 },
    { months: 12, rate: 8.0 },
    { months: 132, rate: 9.35 },
  ],
  'promo-3-tahun': [
    { months: 36, rate: 3.0 },
    { months: 144, rate: 9.35 },
  ],
  'promo-5-tahun': [
    { months: 60, rate: 5.25 },
    { months: 120, rate: 9.35 },
  ],
};

function onKprTypeChange() {
  const type = document.getElementById('kprType').value;
  if (type === 'custom') return;
  const preset = KPR_PRESETS[type];
  if (!preset) return;
  state.steps = preset.map(p => ({ months: p.months, rate: p.rate, payment: 0 }));
  renderSteps();
  recalcAll();
}

// ─── Steps UI ───
function renderSteps() {
  const c = document.getElementById('stepsContainer');
  c.innerHTML = '';
  state.steps.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'step-card';
    div.innerHTML = `
      <div class="step-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="step-badge">${i + 1}</span>
          <span style="font-size:13px;font-weight:600;">Tahap ${i + 1}</span>
        </div>
        ${state.steps.length > 1 ? `<button class="btn-icon" onclick="removeStep(${i})" title="Hapus tahap">✕</button>` : ''}
      </div>
      <div class="step-fields">
        <div>
          <label style="font-size:11px;">Jangka (bulan)</label>
          <div class="input-wrap">
            <input type="number" value="${s.months}" min="1" step="1" onchange="updateStep(${i},'months',this.value)">
          </div>
        </div>
        <div>
          <label style="font-size:11px;">Bunga (%/tahun)</label>
          <div class="input-wrap">
            <input type="number" value="${s.rate}" min="0" step="0.01" onchange="updateStep(${i},'rate',this.value)">
          </div>
        </div>
        <div>
          <label style="font-size:11px;">Angsuran/bulan</label>
          <div class="input-wrap">
            <span class="input-prefix" style="font-size:12px;">${sym()}</span>
            <input type="text" value="${formatThousands(s.payment)}" inputmode="numeric"
              oninput="formatField(this); updateStep(${i},'payment',parseNum(this.value))">
          </div>
        </div>
      </div>
    `;
    c.appendChild(div);
  });
}

function addStep() {
  if (state.steps.length >= 7) return;
  const lastRate = state.steps.length ? state.steps[state.steps.length - 1].rate : 0;
  state.steps.push({ months: 12, rate: lastRate, payment: 0 });
  renderSteps();
}

function removeStep(i) {
  if (state.steps.length <= 1) return;
  state.steps.splice(i, 1);
  renderSteps();
}

function updateStep(i, key, val) {
  if (key === 'months') state.steps[i].months = Math.max(1, Math.round(Number(val) || 1));
  else if (key === 'rate') state.steps[i].rate = Number(val) || 0;
  else if (key === 'payment') state.steps[i].payment = Number(val) || 0;
}

function recalcAll() {
  const principal = parseNum(document.getElementById('principal').value);
  if (principal <= 0) return;
  let balance = principal;
  for (let i = 0; i < state.steps.length; i++) {
    const monthsOwn = Math.max(1, state.steps[i].months);
    const remaining = state.steps.slice(i).reduce((a, s) => a + Math.max(1, s.months), 0);
    const r = (state.steps[i].rate || 0) / 100 / 12;
    const pmt = Math.round(standardPayment(balance, r, remaining));
    state.steps[i].payment = pmt;
    for (let m = 0; m < monthsOwn; m++) {
      const interest = balance * r;
      balance -= pmt - interest;
    }
  }
  renderSteps();
}

// ─── Take Over ───
function toggleTO() {
  state.toEnabled = !state.toEnabled;
  document.getElementById('toTrack').classList.toggle('active', state.toEnabled);
  document.getElementById('toFields').style.display = state.toEnabled ? 'block' : 'none';
}

function toggleCustomPlafon() {
  const checked = document.getElementById('customPlafon').checked;
  document.getElementById('plafonField').style.display = checked ? 'block' : 'none';
}

function setFeeMode(mode) {
  state.feeMode = mode;
  document.getElementById('feeNominal').classList.toggle('active', mode === 'nominal');
  document.getElementById('feePersen').classList.toggle('active', mode === 'persen');
  document.getElementById('feeNominalWrap').style.display = mode === 'nominal' ? 'flex' : 'none';
  document.getElementById('feePersenWrap').style.display = mode === 'persen' ? 'block' : 'none';
  updateFeePctLabel();
}

function updateFeePctLabel() {
  const principal = parseNum(document.getElementById('principal').value);
  const pct = Number(document.getElementById('toFeePct').value) || 0;
  const val = Math.round(principal * pct / 100);
  document.getElementById('feePctValue').textContent = '= ' + fmtMoney(val);
}

// ─── Collapsible sections ───
function toggleSection(sectionId, arrowId) {
  const s = document.getElementById(sectionId);
  const a = document.getElementById(arrowId);
  if (s.style.display === 'none') {
    s.style.display = 'block';
    a.style.transform = 'rotate(0deg)';
  } else {
    s.style.display = 'none';
    a.style.transform = 'rotate(-90deg)';
  }
}

// ─── Calculate ───
function calculate() {
  const principal = parseNum(document.getElementById('principal').value);
  if (principal <= 0) { alert('Masukkan jumlah pinjaman'); return; }

  // Update currency symbols
  const s = sym();
  document.querySelectorAll('#currSymbol,#currSymbol2,#currSymbol3').forEach(el => el.textContent = s);

  const cleanSteps = state.steps.map(st => ({
    months: Math.max(1, Math.round(st.months)),
    rate: st.rate || 0,
    payment: st.payment || 0,
  }));

  const sim = simulateFull(principal, cleanSteps);

  // IRR
  const cashflows = [-principal];
  sim.rows.forEach((row, i) => {
    const isLast = i === sim.rows.length - 1;
    cashflows.push(row.payment + (isLast ? sim.endingBalance : 0));
  });
  const monthlyIRR = solveMonthlyIRR(cashflows);
  const nominalAnnual = monthlyIRR !== null ? monthlyIRR * 12 * 100 : null;
  const effectiveAnnual = monthlyIRR !== null ? (Math.pow(1 + monthlyIRR, 12) - 1) * 100 : null;

  state.result = { ...sim, nominalAnnual, effectiveAnnual };

  // Show results
  document.getElementById('results').style.display = 'block';

  // Stats
  const grid = document.getElementById('statGrid');
  const hasBalloon = Math.abs(sim.endingBalance) > 1;
  grid.innerHTML = `
    <div class="stat-box"><div class="stat-label">IRR Tahunan (Nominal)</div><div class="stat-value">${fmtPct(nominalAnnual)}</div><div class="stat-sub">Efektif: ${fmtPct(effectiveAnnual)}</div></div>
    <div class="stat-box"><div class="stat-label">Total Jangka Waktu</div><div class="stat-value">${sim.totalMonths} bulan</div><div class="stat-sub">${monthsToText(sim.totalMonths)}</div></div>
    <div class="stat-box"><div class="stat-label">Total Pembayaran</div><div class="stat-value">${fmtCompact(sim.totalPayments)}</div><div class="stat-sub">${fmtMoney(sim.totalPayments)}</div></div>
    <div class="stat-box"><div class="stat-label">Total Bunga</div><div class="stat-value">${fmtCompact(sim.totalInterest)}</div><div class="stat-sub">${fmtPct(sim.totalInterest / principal * 100, 1)} dari pokok</div></div>
    <div class="stat-box"><div class="stat-label">Sisa Saldo Akhir</div><div class="stat-value" style="color:${hasBalloon ? 'var(--orange)' : 'var(--green)'};">${hasBalloon ? fmtCompact(sim.endingBalance) : sym() + ' 0'}</div>${hasBalloon ? '<div class="stat-sub" style="color:var(--orange);">⚠ Balloon payment</div>' : '<div class="stat-sub" style="color:var(--green);">✓ Lunas</div>'}</div>
  `;

  // Balance chart
  renderBalanceChart(sim);

  // Step summary table
  renderStepTable(sim);

  // Full amortization table
  renderAmortTable(sim);

  // Take over comparison
  if (state.toEnabled) {
    computeTakeover(principal, sim);
  } else {
    document.getElementById('toResults').style.display = 'none';
  }

  // Scroll to results
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Charts ───
function getChartColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue('--fg-soft').trim() || '#5A5F6B',
    grid: cs.getPropertyValue('--border').trim() || '#E2E5EA',
    bg: cs.getPropertyValue('--bg-card').trim() || '#FFFFFF',
  };
}

function renderBalanceChart(sim) {
  const step = Math.max(1, Math.ceil(sim.rows.length / 200));
  const data = [];
  sim.rows.forEach((r, i) => {
    if (i % step === 0 || i === sim.rows.length - 1) {
      data.push({ x: r.month, y: Math.max(0, r.endBalance) });
    }
  });

  const cc = getChartColors();
  const ctx = document.getElementById('balanceChart').getContext('2d');
  if (balanceChartInstance) balanceChartInstance.destroy();

  // Step boundary annotations
  const annotations = {};
  let cum = 0;
  sim.stepSummaries.forEach((s, i) => {
    cum += s.months;
    if (i < sim.stepSummaries.length - 1) {
      annotations['step' + i] = {
        type: 'line', xMin: cum, xMax: cum,
        borderColor: 'rgba(90,95,107,0.3)', borderWidth: 1, borderDash: [4, 4],
      };
    }
  });

  balanceChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        data: data,
        borderColor: '#2a78d6',
        backgroundColor: 'rgba(42,120,214,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cc.bg,
          titleColor: cc.text,
          bodyColor: cc.text,
          borderColor: cc.grid,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => 'Bulan ' + items[0].parsed.x,
            label: (item) => 'Saldo: ' + fmtMoney(item.parsed.y),
          },
        },
        annotation: { annotations },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Bulan', color: cc.text, font: { size: 12 } },
          ticks: { color: cc.text, font: { size: 11 } },
          grid: { color: cc.grid, lineWidth: 0.5 },
        },
        y: {
          title: { display: true, text: 'Saldo (' + sym() + ')', color: cc.text, font: { size: 12 } },
          ticks: { color: cc.text, font: { size: 11 }, callback: (v) => fmtCompact(v) },
          grid: { color: cc.grid, lineWidth: 0.5 },
        },
      },
      interaction: { mode: 'index', intersect: false },
    },
  });
}

function computeTakeover(principal, sim) {
  const oldPrincipal = document.getElementById('customPlafon').checked ? parseNum(document.getElementById('oldPlafon').value) : principal;
  const oldR = (Number(document.getElementById('oldRate').value) || 0) / 100 / 12;
  const oldMonths = Math.max(1, Math.round(Number(document.getElementById('oldTerm').value) || 1));
  const oldPmt = standardPayment(oldPrincipal, oldR, oldMonths);

  let fee;
  if (state.feeMode === 'persen') {
    fee = Math.round(principal * (Number(document.getElementById('toFeePct').value) || 0) / 100);
  } else {
    fee = parseNum(document.getElementById('toFee').value);
  }

  const horizon = Math.max(oldMonths, sim.totalMonths);
  const cumOld = [0], cumNew = [fee];
  let runOld = 0, runNew = fee;

  for (let t = 1; t <= horizon; t++) {
    if (t <= oldMonths) runOld += oldPmt;
    cumOld.push(runOld);
    if (t <= sim.totalMonths) {
      runNew += sim.rows[t - 1].payment;
      if (t === sim.totalMonths && Math.abs(sim.endingBalance) > 1) runNew += sim.endingBalance;
    }
    cumNew.push(runNew);
  }

  // Find crossings
  const crossings = [];
  for (let t = 1; t <= horizon; t++) {
    const dP = cumNew[t-1] - cumOld[t-1];
    const dC = cumNew[t] - cumOld[t];
    if (Math.abs(dP) < 1e-6) crossings.push(t-1);
    else if (dP * dC < 0) crossings.push(t - 1 + dP / (dP - dC));
  }
  crossings.sort((a, b) => a - b);
  const meets = crossings.filter((m, i) => i === 0 || Math.abs(m - crossings[i-1]) > 1e-4);

  const oldTotal = cumOld[oldMonths];
  const newTotal = cumNew[sim.totalMonths];
  const selisih = newTotal - oldTotal;

  // Old interest
  const oldTotalInterest = oldPmt * oldMonths - oldPrincipal;

  // Show TO results
  document.getElementById('toResults').style.display = 'block';

  // Banner
  const banner = document.getElementById('toBanner');
  if (selisih < 0) {
    banner.innerHTML = `<div class="info-banner green">✅ <div><strong>Take over lebih hemat!</strong> Anda menghemat <strong>${fmtMoney(Math.abs(selisih))}</strong> dibandingkan skema lama.</div></div>`;
  } else if (selisih > 0) {
    banner.innerHTML = `<div class="info-banner orange">⚠️ <div><strong>Take over lebih mahal</strong> sebesar <strong>${fmtMoney(selisih)}</strong>. Pertimbangkan manfaat lainnya (bunga rendah di awal, fleksibilitas).</div></div>`;
  } else {
    banner.innerHTML = `<div class="info-banner" style="background:var(--accent-light);color:var(--accent);">ℹ️ <div>Total pembayaran skema lama dan baru hampir sama.</div></div>`;
  }

  if (meets.length > 0) {
    banner.innerHTML += `<div class="info-banner" style="background:var(--accent-light);color:var(--accent);margin-top:8px;">📍 <div>Titik impas (BEP): bulan ke-<strong>${Math.round(meets[0])}</strong> (${monthsToText(Math.round(meets[0]))})</div></div>`;
  }

  // Comparison boxes
  const comp = document.getElementById('compareRow');
  comp.innerHTML = `
    <div class="compare-box" style="background:var(--bg-input);">
      <div style="font-size:13px;font-weight:700;color:var(--fg-soft);margin-bottom:12px;">📜 SKEMA LAMA</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><div class="stat-label">Plafon</div><div style="font-weight:600;font-family:'DM Mono',monospace;">${fmtMoney(oldPrincipal)}</div></div>
        <div><div class="stat-label">Bunga</div><div style="font-weight:600;">${fmtPct((Number(document.getElementById('oldRate').value) || 0))} flat</div></div>
        <div><div class="stat-label">Tenor</div><div style="font-weight:600;">${oldMonths} bulan (${monthsToText(oldMonths)})</div></div>
        <div><div class="stat-label">Angsuran/bulan</div><div style="font-weight:600;font-family:'DM Mono',monospace;">${fmtMoney(Math.round(oldPmt))}</div></div>
        <div class="divider"></div>
        <div><div class="stat-label">Total Pokok + Bunga</div><div style="font-weight:700;font-size:16px;font-family:'DM Mono',monospace;">${fmtMoney(Math.round(oldTotal))}</div></div>
        <div><div class="stat-label">Total Bunga</div><div style="font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmtMoney(Math.round(oldTotalInterest))}</div></div>
      </div>
    </div>
    <div class="compare-vs">VS</div>
    <div class="compare-box" style="background:var(--accent-light);border-color:var(--accent);">
      <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:12px;">🆕 SKEMA BARU (TO)</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><div class="stat-label">Plafon</div><div style="font-weight:600;font-family:'DM Mono',monospace;">${fmtMoney(principal)}</div></div>
        <div><div class="stat-label">Bunga</div><div style="font-weight:600;">Bertahap (${state.steps.length} tahap)</div></div>
        <div><div class="stat-label">Tenor</div><div style="font-weight:600;">${sim.totalMonths} bulan (${monthsToText(sim.totalMonths)})</div></div>
        <div><div class="stat-label">Biaya TO</div><div style="font-weight:600;font-family:'DM Mono',monospace;">${fmtMoney(fee)}</div></div>
        <div class="divider"></div>
        <div><div class="stat-label">Total Pokok + Bunga + Biaya TO</div><div style="font-weight:700;font-size:16px;font-family:'DM Mono',monospace;">${fmtMoney(Math.round(newTotal))}</div></div>
        <div><div class="stat-label">Total Bunga</div><div style="font-weight:600;font-family:'DM Mono',monospace;color:var(--red);">${fmtMoney(Math.round(sim.totalInterest))}</div></div>
      </div>
    </div>
  `;

  // TO chart
  renderTOChart(cumOld, cumNew, horizon, meets);
}

function renderTOChart(cumOld, cumNew, horizon, meets) {
  const step = Math.max(1, Math.ceil(horizon / 200));
  const dataOld = [], dataNew = [];
  for (let t = 0; t <= horizon; t++) {
    if (t % step === 0 || t === horizon) {
      dataOld.push({ x: t, y: cumOld[t] });
      dataNew.push({ x: t, y: cumNew[t] });
    }
  }

  const cc = getChartColors();
  const ctx = document.getElementById('toChart').getContext('2d');
  if (toChartInstance) toChartInstance.destroy();

  const annotations = {};
  meets.forEach((m, i) => {
    annotations['meet' + i] = {
      type: 'line', xMin: Math.round(m), xMax: Math.round(m),
      borderColor: 'rgba(90,95,107,0.5)', borderWidth: 1.5, borderDash: [6, 4],
      label: { display: true, content: 'BEP', position: 'start', backgroundColor: 'rgba(90,95,107,0.8)', font: { size: 11 } },
    };
  });

  toChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Skema Baru (TO)',
          data: dataNew,
          borderColor: '#2a78d6',
          backgroundColor: 'rgba(42,120,214,0.06)',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.1,
        },
        {
          label: 'Skema Lama',
          data: dataOld,
          borderColor: '#eb6834',
          backgroundColor: 'rgba(235,104,52,0.06)',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'line', padding: 16, color: cc.text, font: { size: 12 } } },
        tooltip: {
          backgroundColor: cc.bg, titleColor: cc.text, bodyColor: cc.text, borderColor: cc.grid, borderWidth: 1, padding: 10,
          callbacks: {
            title: (items) => 'Bulan ' + items[0].parsed.x,
            label: (item) => item.dataset.label + ': ' + fmtMoney(item.parsed.y),
          },
        },
        annotation: { annotations },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Bulan', color: cc.text, font: { size: 12 } },
          ticks: { color: cc.text, font: { size: 11 } },
          grid: { color: cc.grid, lineWidth: 0.5 },
        },
        y: {
          title: { display: true, text: 'Kumulatif Pembayaran (' + sym() + ')', color: cc.text, font: { size: 12 } },
          ticks: { color: cc.text, font: { size: 11 }, callback: (v) => fmtCompact(v) },
          grid: { color: cc.grid, lineWidth: 0.5 },
        },
      },
      interaction: { mode: 'index', intersect: false },
    },
  });
}

// ─── Tables ───
function renderStepTable(sim) {
  const s = sym();
  let html = '<table><thead><tr><th>Tahap</th><th>Bulan</th><th>Bunga (%)</th><th>Angsuran</th><th>Pokok Dibayar</th><th>Bunga Dibayar</th><th>Saldo Akhir</th></tr></thead><tbody>';
  sim.stepSummaries.forEach(r => {
    html += `<tr>
      <td style="text-align:center;"><span class="step-badge">${r.step}</span></td>
      <td>${r.months}</td>
      <td>${fmtPct(r.rate)}</td>
      <td>${fmtMoney(Math.round(r.payment))}</td>
      <td>${fmtMoney(Math.round(r.principal))}</td>
      <td>${fmtMoney(Math.round(r.interest))}</td>
      <td>${fmtMoney(Math.round(r.endBalance))}</td>
    </tr>`;
  });
  // Total row
  html += `<tr style="font-weight:700;background:var(--accent-light);">
    <td colspan="3">TOTAL</td>
    <td>${fmtMoney(Math.round(sim.totalPayments))}</td>
    <td>${fmtMoney(Math.round(sim.totalPayments - sim.totalInterest))}</td>
    <td>${fmtMoney(Math.round(sim.totalInterest))}</td>
    <td>${fmtMoney(Math.round(sim.endingBalance))}</td>
  </tr>`;
  html += '</tbody></table>';
  document.getElementById('stepTable').innerHTML = html;
}

function renderAmortTable(sim) {
  const s = sym();
  // Show first 36 months + option to expand
  const showAll = sim.rows.length <= 60;
  const rows = showAll ? sim.rows : sim.rows.slice(0, 36);

  let html = '<table><thead><tr><th>Bln</th><th>Tahap</th><th>Saldo Awal</th><th>Bunga</th><th>Pokok</th><th>Angsuran</th><th>Saldo Akhir</th></tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr>
      <td>${r.month}</td>
      <td style="text-align:center;"><span class="step-badge">${r.step}</span></td>
      <td>${fmtMoney(Math.round(r.beginBalance))}</td>
      <td>${fmtMoney(Math.round(r.interest))}</td>
      <td>${fmtMoney(Math.round(r.principal))}</td>
      <td>${fmtMoney(Math.round(r.payment))}</td>
      <td>${fmtMoney(Math.round(r.endBalance))}</td>
    </tr>`;
  });
  html += '</tbody></table>';

  if (!showAll) {
    html += `<div style="text-align:center;margin-top:12px;">
      <button class="btn btn-outline btn-sm" onclick="showFullAmort()">Tampilkan semua ${sim.rows.length} bulan</button>
    </div>`;
  }

  document.getElementById('amortTable').innerHTML = html;
}

function showFullAmort() {
  if (!state.result) return;
  const sim = state.result;
  let html = '<table><thead><tr><th>Bln</th><th>Tahap</th><th>Saldo Awal</th><th>Bunga</th><th>Pokok</th><th>Angsuran</th><th>Saldo Akhir</th></tr></thead><tbody>';
  sim.rows.forEach(r => {
    html += `<tr>
      <td>${r.month}</td>
      <td style="text-align:center;"><span class="step-badge">${r.step}</span></td>
      <td>${fmtMoney(Math.round(r.beginBalance))}</td>
      <td>${fmtMoney(Math.round(r.interest))}</td>
      <td>${fmtMoney(Math.round(r.principal))}</td>
      <td>${fmtMoney(Math.round(r.payment))}</td>
      <td>${fmtMoney(Math.round(r.endBalance))}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('amortTable').innerHTML = html;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  renderSteps();
  recalcAll();
  updatePrincipalWords();

  // Update currency symbol on change
  document.getElementById('currency').addEventListener('change', () => {
    const s = sym();
    document.querySelectorAll('#currSymbol,#currSymbol2,#currSymbol3').forEach(el => el.textContent = s);
    renderSteps();
  });

  document.getElementById('toFeePct').addEventListener('input', updateFeePctLabel);
});
