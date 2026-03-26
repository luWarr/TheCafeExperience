const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRK1dytJ7DNbo6JN0bPRRIGTa1WT25SXnoFgRttur1y7W_0NFBu7kO11i39Q8hmY5tDTq5V78Mjg8RP/pub?output=csv';
console.log('Fetching CSV from:', CSV_URL);

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

/* ---------- NEW: render each response as a card ---------- */
function renderResponses(container, rows) {
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = 'repeat(5, 270px)';
  list.style.gap = '16px';
  list.style.marginTop = '12px';
  list.style.justifyContent = 'center';
  list.style.justifyItems = 'center';

  const headers = Object.keys(rows[0] || {});
  const tsKey = headers.find(h => /timestamp/i.test(h));

  // more robust target-header detection (frequency question)
  const findHeaderByKeywords = (keys) => {
    return headers.find(h => {
      const low = (h || '').toLowerCase();
      return keys.every(k => low.includes(k));
    });
  };
  const targetKey = findHeaderByKeywords(['go', 'cafe']) ||
                    findHeaderByKeywords(['cafe', 'often']) ||
                    findHeaderByKeywords(['visit', 'cafe']) ||
                    headers.find(h => /do you (go|visit).*cafe/i.test(h)) ||
                    null;

  // detect study-mode header (work alone / work with friends / both)
  const studyKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return (low.includes('work') || low.includes('study')) && (low.includes('alone') || low.includes('friend') || low.includes('both'));
  }) || headers.find(h => /alone|friend|both/i.test(h)) || null;

  console.log('Detected targetKey for frequency question:', targetKey, 'studyKey:', studyKey);

  rows.forEach((row, i) => {
    const card = document.createElement('article');

    // fixed card size 270x420, same padding, add 5px margin
    card.style.width = '270px';
    card.style.height = '420px';
    card.style.boxSizing = 'border-box';
    card.style.border = '1px solid #e8e8e8';
    card.style.borderRadius = '8px';
    card.style.padding = '12px';             // keep same padding
    card.style.margin = '5px';               // requested margin
    card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
    card.style.fontSize = '14px';
    card.style.overflow = 'hidden';

    // change card layout to a grid with 5 rows and 2 columns
    card.style.display = 'grid';
    card.style.gridTemplateColumns = '1fr 1fr';             // 2 columns
    card.style.gridTemplateRows = 'auto 120px 1fr 1fr 1fr'; // 5 rows (adjust sizes)
    card.style.gap = '8px';

    // determine bg color from the detected answer (robust matching)
    let bg = '#ffffff';
    if (targetKey) {
      const raw = String(row[targetKey] || '').trim();
      const ans = raw.toLowerCase();
      if (ans === 'yes' || ans.startsWith('y')) bg = '#5293A3';
      else if (ans === 'no' || ans.startsWith('n')) bg = '#EDEBD7';
      else if (ans.includes('depend')) bg = '#F5A4A3';
      if (i < 2) console.log(`row ${i+1} "${targetKey}" =>`, raw, 'mapped bg', bg);
    } else {
      if (i === 0) console.warn('Frequency question header not found; card coloring skipped.');
    }
    card.style.background = bg;

    // numeric title like "01", "02" placed in row 1 spanning both columns
    const num = String(i + 1).padStart(2, '0');
    const title = document.createElement('h4');
    title.style.margin = '0';
    title.style.fontSize = '28px';
    title.style.color = '#252422';
    title.textContent = num;
    title.style.gridColumn = '1 / -1'; // span both columns
    title.style.gridRow = '1 / 2';
    card.appendChild(title);

    // Insert study-mode image (if detected) into row 2 spanning both columns
    if (studyKey) {
      const rawStudy = String(row[studyKey] || '').trim().toLowerCase();
      let imgSrc = null;
      if (rawStudy.includes('alone')) imgSrc = 'images/workAlone.svg';
      else if (rawStudy.includes('both')) imgSrc = 'images/both.svg';
      else if (rawStudy.includes('friend') || rawStudy.includes('with')) imgSrc = 'images/workWithfriends.svg';

      if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = rawStudy || 'study mode';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.margin = '0';
        img.style.gridColumn = '1 / -1';
        img.style.gridRow = '2 / 3';
        card.appendChild(img);
      }
    }

    // details container occupies rows 3-5 and spans both columns
    const details = document.createElement('div');
    details.style.display = 'flex';
    details.style.flexDirection = 'column';
    details.style.gap = '6px';
    details.style.overflowY = 'auto';
    details.style.paddingRight = '6px';
    details.style.gridColumn = '1 / -1';
    details.style.gridRow = '3 / 6'; // rows 3,4,5
    details.style.paddingTop = '6px';
    card.appendChild(details);

    // omit the timestamp, the frequency question (targetKey), and the study question (studyKey) from visible fields
    headers.forEach(h => {
      if (tsKey && h === tsKey) return;
      if (targetKey && h === targetKey) return;
      if (studyKey && h === studyKey) return;
      const val = row[h];
      if