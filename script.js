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
    let count = 0;
    for (const r of rows) {
      const raw = (r[k] ?? '').toString().replace(/[$,]/g, '');
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      count++;
    }
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
    const v = (r[numericKey] ?? '').toString().replace(/[$,]/g, '');
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  });

  const labelCandidates = Object.keys(rows[0] || {}).filter(k => k !== numericKey);
  const labelKey = labelCandidates[0] || null;
  let labels = [];
  let data = [];

  if (labelKey) {
    const map = new Map();
    rows.forEach((r, i) => {
      const label = (r[labelKey] || `row ${i+1}`).toString();
      const v = parseFloat((r[numericKey] ?? '').toString().replace(/[$,]/g,'')) || 0;
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
    ctx.fillText(String(Math.round(v*100)/100), x, y - 6);
  });

  ctx.fillStyle = '#111';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Metric: ${numericKey} (by ${labelKey || 'row'})`, padding, 16);
}

/* ---------- NEW: render each response as a card (fixed & completed) ---------- */
function renderResponses(container, rows) {
  // if caller didn't pass a container, fall back to body so we don't throw
  if (!container) container = document.body;
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = 'repeat(5, 270px)';
  list.style.gap = '16px';
  list.style.marginTop = '12px';
  list.style.justifyContent = 'center';
  list.style.justifyItems = 'center';

  const headers = Object.keys(rows[0] || {});
  const tsKey = headers.find(h => /timestamp/i.test(h));

  // robust frequency header detection
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
    return (low.includes('work') || low.includes('study') || low.includes('alone') || low.includes('friend') || low.includes('both'));
  }) || null;

  // detect time-on-cafe header (how long)
  const timeKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /how long|normally work|regular day|work in a cafe|how many hours/.test(low);
  }) || null;

  // detect preferred time-of-day header (the question to remove and replace with image)
  const timePrefKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /specific time of day|time of day|prefer studying|prefer.*studying|time.*prefer/i.test(low) ||
           /mornings|afternoons|nights|morning|afternoon|night/i.test(low);
  }) || null;

  // detect drink preference question to hide it from the cards
  const drinkKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /when ordering drinks|what kind of drink|drink do you buy|type of drink/i.test(low);
  }) || null;

  console.log('Detected keys -> freq:', targetKey, 'study:', studyKey, 'timeLen:', timeKey, 'timePref:', timePrefKey, 'drinkKey:', drinkKey);

  rows.forEach((row, i) => {
    const card = document.createElement('article');

    // card size, padding and margin
    card.style.width = '270px';
    card.style.height = '420px';
    card.style.boxSizing = 'border-box';
    card.style.border = '1px solid #e8e8e8';
    card.style.borderRadius = '8px';
    card.style.padding = '12px';
    card.style.margin = '5px';
    card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
    card.style.fontSize = '14px';
    card.style.overflow = 'hidden';

    // 5 rows x 2 columns grid inside the card
    card.style.display = 'grid';
    card.style.gridTemplateColumns = '1fr 1fr';
    card.style.gridTemplateRows = 'auto 50px 1fr 1fr 1fr';
    // card.style.gap = '8px';

    // background color based on frequency answer
    let bg = '#ffffff';
    if (targetKey) {
      const raw = String(row[targetKey] || '').trim();
      const ans = raw.toLowerCase();
      if (ans === 'yes' || ans.startsWith('y')) bg = '#5293A3';
      else if (ans === 'no' || ans.startsWith('n')) bg = '#EDEBD7';
      else if (ans.includes('depend')) bg = '#F5A4A3';
      if (i < 3) console.log(`row ${i+1} "${targetKey}" =>`, raw, 'mapped bg', bg);
    }
    card.style.background = bg;

    // numeric title placed in first row, first column
    const num = String(i + 1).padStart(2, '0');
    const title = document.createElement('h4');
    title.style.margin = '0';
    title.style.fontSize = '50px';
    title.style.color = '#252422';
    title.textContent = num;
    title.style.gridColumn = '1 / 2';
    title.style.gridRow = '1 / 2';
    card.appendChild(title);

    // move the time length response into row 2 column 1 (omit label)
    if (timeKey) {
      const timeVal = String(row[timeKey] || '').trim();
      if (timeVal) {
        const timeEl = document.createElement('div');
        timeEl.textContent = timeVal;
        timeEl.style.gridColumn = '1 / 2';
        timeEl.style.gridRow = '2 / 3';
        timeEl.style.alignSelf = 'center';
        timeEl.style.justifySelf = 'center';
        timeEl.style.fontSize = '14px';
        timeEl.style.fontWeight = '600';
        timeEl.style.padding = '4px 6px';
        timeEl.style.background = 'transparent';
        timeEl.style.borderRadius = '4px';
        card.appendChild(timeEl);
      }
    }

    // study-mode image in first row, second column (unchanged)
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
        img.style.gridColumn = '2 / 3';
        img.style.gridRow = '1 / 2';
        card.appendChild(img);
      }
    }

    // preferred time-of-day: replace text with image in row 2 column 2, omit the question text from details
    if (timePrefKey) {
      const rawPref = String(row[timePrefKey] || '').trim().toLowerCase();
      let prefImg = null;
      if (rawPref.includes('morn')) prefImg = 'images/morning.svg';
      else if (rawPref.includes('afternoon') || rawPref.includes('midday')) prefImg = 'images/midday.svg';
      else if (rawPref.includes('night') || rawPref.includes('evening')) prefImg = 'images/night.svg';

//Images for preffered time of day
      if (prefImg) {
        const pImg = document.createElement('img');
        pImg.src = prefImg;
        pImg.alt = rawPref || 'preferred time';
        // fixed size 40x40 and centered within the grid cell
        pImg.style.width = '40px';
        pImg.style.height = '40px';
        pImg.style.objectFit = 'contain';
        pImg.style.margin = '0';
        pImg.style.gridColumn = '2 / 3';
        pImg.style.gridRow = '2 / 3';
        pImg.style.justifySelf = 'start';
        pImg.style.alignSelf = 'center';
        card.appendChild(pImg);
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
    details.style.gridRow = '3 / 6';
    details.style.paddingTop = '6px';
    card.appendChild(details);

    // If the drink preference question exists, parse the response into a list and show it
    if (drinkKey) {
      const rawDrink = String(row[drinkKey] || '').trim();
      if (rawDrink) {
        const items = rawDrink
          .split(/\s*(?:,|;|\/|\||&|\band\b|\n)\s*/i)
          .map(s => s.trim())
          .filter(Boolean);
        if (items.length) {
          const listEl = document.createElement('ul');
          listEl.style.margin = '6px 0';
          listEl.style.paddingLeft = '18px';
          listEl.style.gridColumn = '1 / -1';
          listEl.style.listStyle = 'disc';
          items.forEach(it => {
            const li = document.createElement('li');
            li.textContent = it;
            li.style.fontSize = '13px';
            li.style.marginBottom = '4px';
            listEl.appendChild(li);
          });
          details.appendChild(listEl);
        }
      }
    }

    // omit timestamp, frequency question, study question, time length question, and preferred-time question from visible fields
    // Replace long "How much work..." question label with "productivity:" and map answers to
    const productivityRe = /how much work do you normally get done/i;
    headers.forEach(h => {
      if (tsKey && h === tsKey) return;
      if (targetKey && h === targetKey) return;
      if (studyKey && h === studyKey) return;
      if (timeKey && h === timeKey) return;
      if (timePrefKey && h === timePrefKey) return;
      if (drinkKey && h === drinkKey) return; // hide the drink preference question
      const val = row[h];
      if (val === undefined || val === '') return;

      const keyText = productivityRe.test(h) ? 'productivity:' : h;

      // map productivity responses to percentages
      let displayVal = String(val);
      if (productivityRe.test(h)) {
        const low = displayVal.toLowerCase();
        if (low.includes('lots')) displayVal = '100%';
        else if (low.includes('decent')) displayVal = '75%';
        else if (low.includes('got some') || low.includes('not a lot')) displayVal = '25%';
        else if (low.includes('barely')) displayVal = '5%';
      }

      // display each field as two-column row inside details
      const line = document.createElement('div');
      line.style.display = 'grid';
      line.style.gridTemplateColumns = '1fr 1fr';
      line.style.gap = '8px';
      line.style.alignItems = 'start';

      const keyEl = document.createElement('div');
      keyEl.style.fontWeight = '600';
      keyEl.style.fontSize = '13px';
      keyEl.textContent = keyText;

      const valEl = document.createElement('div');
      valEl.style.fontWeight = '400';
      valEl.style.opacity = '0.95';
      valEl.style.whiteSpace = 'pre-wrap';
      valEl.textContent = displayVal;

      line.appendChild(keyEl);
      line.appendChild(valEl);
      details.appendChild(line);
    });

    list.appendChild(card);
  });
  container.appendChild(list);
}

// main entry point: fetch CSV, parse, render table + chart + cards
fetch(CSV_URL)
  .then(res => res.text())
  .then(text => {
    const rows = parseCSV(text);
    console.log('Parsed CSV rows:', rows);
    const numeric = detectNumericColumns(rows);
    console.log('Detected numeric columns:', numeric);

    const container = document.getElementById('tableContainer');
    renderTable(container, rows);

    if (numeric.length > 0) {
      const chartContainer = document.getElementById('chartContainer');
      renderBarChart(chartContainer, rows, numeric[0]);
    }

    const responsesContainer = document.getElementById('responsesContainer');
    renderResponses(responsesContainer, rows);
  })
  .catch(err => console.error('Error fetching or parsing CSV:', err));