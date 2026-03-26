const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRK1dytJ7DNbo6JN0bPRRIGTa1WT25SXnoFgRttur1y7W_0NFBu7kO7  11i39Q8hmY5tDTq5V78Mjg8RP/pub?output=csv'.replace(/\s+/g,'');

/* Robust CSV splitter that handles quoted fields */
function splitCSVRow(row) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      // handle escaped quotes ("")
      if (inQuotes && row[i+1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
  if (lines.length === 0) return [];
  const headers = splitCSVRow(lines.shift());
  return lines.map(line => {
    const values = splitCSVRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

/* helpers to detect numeric columns */
function detectNumericColumns(rows) {
  const keys = Object.keys(rows[0] || {});
  const numeric = [];
  keys.forEach(k => {
    let count = 0, total = 0;
    for (const r of rows) {
      const v = r[k].replace(/[$,]/g, '');
      if (v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      count++;
      total++;
    }
    // if many rows parse as numbers, consider numeric
    if (count / Math.max(1, rows.length) > 0.4) numeric.push(k);
  });
  return numeric;
}

/* render table preview */
function renderTable(container, rows, maxRows = 10) {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.marginTop = '12px';
  const headers = Object.keys(rows[0] || {});
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.textAlign = 'left';
    th.style.borderBottom = '1px solid #ddd';
    th.style.padding = '6px 4px';
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.slice(0, maxRows).forEach(r => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = r[h];
      td.style.padding = '6px 4px';
      td.style.borderBottom = '1px solid #fafafa';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

/* simple bar chart for first numeric column */
function renderBarChart(container, rows, numericKey) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.maxHeight = '240px';
  canvas.width = 800;
  canvas.height = 240;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const values = rows.map(r => {
    const v = r[numericKey].replace(/[$,]/g, '');
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  });

  // aggregate by label if there is a meaningful label column
  const labelCandidates = Object.keys(rows[0] || {}).filter(k => k !== numericKey);
  const labelKey = labelCandidates[0] || null;
  let labels = [];
  let data = [];

  if (labelKey) {
    const map = new Map();
    rows.forEach((r, i) => {
      const label = (r[labelKey] || `row ${i+1}`).toString();
      const v = parseFloat(r[numericKey].replace(/[$,]/g,'')) || 0;
      map.set(label, (map.get(label) || 0) + v);
    });
    labels = Array.from(map.keys()).slice(0, 12);
    data = Array.from(map.values()).slice(0, 12);
  } else {
    labels = values.map((_, i) => `#${i+1}`).slice(0, 12);
    data = values.slice(0, 12);
  }

  const padding = 32;
  const chartW = canvas.width - padding * 2;
  const chartH = canvas.height - padding * 2;
  const max = Math.max(1, ...data);
  const barW = chartW / data.length * 0.7;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(padding, padding, chartW, chartH);

  data.forEach((v, i) => {
    const x = padding + i * (chartW / data.length) + ((chartW / data.length) - barW) / 2;
    const h = (v / max) * (chartH - 20);
    const y = padding + chartH - h;
    ctx.fillStyle = '#4A7856';
    ctx.fillRect(x, y, barW, h);
    ctx.fillStyle = '#222';
    ctx.font = '11px sans-serif';
    ctx.fillText(labels[i], x, padding + chartH + 12);
    // value label
    ctx.fillText(String(Math.round(v*100)/100), x, y - 6);
  });

  // title
  ctx.fillStyle = '#111';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Metric: ${numericKey} (by ${labelKey || 'row'})`, padding, 16);
}

/* main render */
function render(rows) {
  // create or clear container
  let container = document.getElementById('viz-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'viz-container';
    container.style.padding = '20px';
    container.style.maxWidth = '980px';
    container.style.margin = '18px auto';
    container.style.borderTop = '1px solid #eee';
    document.body.appendChild(container);
  } else {
    container.innerHTML = '';
  }

  const title = document.createElement('h2');
  title.textContent = 'Live Responses (preview)';
  title.style.margin = '0 0 8px 0';
  container.appendChild(title);

  if (!rows.length) {
    const msg = document.createElement('p');
    msg.textContent = 'No data available.';
    container.appendChild(msg);
    return;
  }

  renderTable(container, rows, 15);

  const numeric = detectNumericColumns(rows);
  if (numeric.length) {
    const chartTitle = document.createElement('h3');
    chartTitle.textContent = 'Simple chart';
    chartTitle.style.marginTop = '12px';
    container.appendChild(chartTitle);
    renderBarChart(container, rows, numeric[0]);
  } else {
    const note = document.createElement('p');
    note.textContent = 'No numeric column detected for charting. Inspect table for values.';
    container.appendChild(note);
  }

  // reload button
  const reload = document.createElement('button');
  reload.textContent = 'Reload data';
  reload.style.marginTop = '12px';
  reload.onclick = loadAndRender;
  container.appendChild(reload);
}

/* fetch and render */
async function loadAndRender() {
  // show loader
  let container = document.getElementById('viz-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'viz-container';
    container.style.padding = '20px';
    container.style.maxWidth = '980px';
    container.style.margin = '18px auto';
    document.body.appendChild(container);
  }
  container.innerHTML = '<p>Loading live responses…</p>';

  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    const rows = parseCSV(text);
    render(rows);
  } catch (err) {
    container.innerHTML = `<p>Error loading data: ${err.message}</p>`;
    console.error('CSV fetch error', err);
  }
}

document.addEventListener('DOMContentLoaded', loadAndRender);