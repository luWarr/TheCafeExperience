const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRK1dytJ7DNbo6JN0bPRRIGTa1WT25SXnoFgRttur1y7W_0NFBu7kO11i39Q8hmY5tDTq5V78Mjg8RP/pub?output=csv';
console.log('Fetching CSV from:', CSV_URL);

// ensure Google form links don't show as purple when visited
(function normalizeLinkColors() {
  const s = document.createElement('style');
  s.textContent = `
    /* make visited Google/Docs links use the same color as unvisited links */
    a[href*="docs.google.com"] ,
    a[href*="docs.google.com"] :link,
    a[href*="docs.google.com"] :visited {
      color: inherit !important;
      text-decoration: underline !important;
    }
    /* fallback: all visited links same as unvisited */
    a:visited { color: inherit !important; }
  `;
  document.head.appendChild(s);
})();

// set page background to images/pimpingV3.png and make it cover the viewport
(function setPageBackground() {
  const css = `
    html, body { height: 100%; margin: 0; }
    body {
      background-image: url("images/pimpingV3.png");
      background-size: cover;       /* fill screen while preserving aspect ratio */
      background-position: center center;
      background-repeat: no-repeat;
      background-attachment: fixed;
      background-color: #000;       /* fallback */
    }
    /* optional: keep main containers centered without extra body padding */
    #responsesContainer, #chartContainer { margin: 0 auto; }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

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
    ctx.fillStyle = '#FFC12B';
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
  // ensure we have a container to append into
  if (!container) {
    container = document.createElement('div');
    container.id = 'responsesContainer';
    container.style.padding = '12px';
    container.style.maxWidth = '1400px';
    container.style.margin = '8px auto';
    document.body.appendChild(container);
  }

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = 'repeat(5, 270px)';
  list.style.gap = '16px';
  list.style.marginTop = '12px';
  list.style.justifyContent = 'center';
  list.style.justifyItems = 'center';

  const headers = Object.keys(rows[0] || {});
  const tsKey = headers.find(h => /timestamp/i.test(h));

  // robust key detectors (unchanged)
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

  const studyKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return (low.includes('work') || low.includes('study') || low.includes('alone') || low.includes('friend') || low.includes('both'));
  }) || null;

  const timeKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /how long|normally work|regular day|work in a cafe|how many hours/.test(low);
  }) || null;

  const timePrefKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /specific time of day|time of day|prefer studying|prefer.*studying|time.*prefer/i.test(low) ||
           /mornings|afternoons|nights|morning|afternoon|night/i.test(low);
  }) || null;

  const drinkKey = headers.find(h => {
    const low = (h || '').toLowerCase();
    return /when ordering drinks|what kind of drink|drink do you buy|type of drink/i.test(low);
  }) || null;

  rows.forEach((row, i) => {
    const card = document.createElement('article');

    // card size, padding and margin
    card.style.width = '270px';
    card.style.height = '420px';
    card.style.boxSizing = 'border-box';
    card.style.border = 'none';
    card.style.borderRadius = '0';
    card.style.padding = '12px';
    card.style.paddingTop = '50px';
    card.style.margin = '5px';
    card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
    card.style.fontSize = '14px';
    card.style.overflow = 'hidden';

    // 5 rows x 2 columns grid inside the card
    card.style.display = 'grid';
    card.style.gridTemplateColumns = '1fr 1fr';
    // make row 2 very short (10px)
    card.style.gridTemplateRows = 'auto 10px 1fr 1fr 1fr';
    // card.style.gap = '8px';

    // background image selection based on cafe answer (removed color mapping)
    let bgImg = 'images/BETTERRECIPT.png';
    if (targetKey) {
      const raw = String(row[targetKey] || '').trim();
      const ans = raw.toLowerCase();
      if (ans === 'yes' || ans.startsWith('y')) {
        bgImg = 'images/DYOYesV2.png';
      } else if (ans === 'no' || ans.startsWith('n')) {
        bgImg = 'images/DYONoV2.png';
      } else if (ans.includes('depend')) {
        bgImg = 'images/DYODependsV2.png';
      }
    }
    // use mapped image as the card background (no color fallback)
    card.style.backgroundImage = `url('${bgImg}')`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundRepeat = 'no-repeat';
    card.style.backgroundPosition = 'center';
    // ensure content renders above the background image
    card.style.position = 'relative';

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

    // place the "how long" response into column 1, row 1 (bottom-center)
    if (timeKey) {
      const timeVal = String(row[timeKey] || '').trim();
      if (timeVal) {
        const timeEl = document.createElement('div');
        timeEl.textContent = timeVal;
        timeEl.style.gridColumn = '1 / 2';
        timeEl.style.gridRow = '1 / 2';
        timeEl.style.alignSelf = 'end';     // bottom of the cell
        timeEl.style.justifySelf = 'center';// center horizontally
        timeEl.style.fontSize = '13px';
        timeEl.style.fontWeight = '600';
        timeEl.style.paddingLeft = '35px';
        timeEl.style.paddingBottom = '17px';
        timeEl.style.borderRadius = '4px';
        timeEl.style.pointerEvents = 'none';
        card.appendChild(timeEl);
      }
    }
 
    // place preferred-time image into column 1, row 1 bottom-left (replaces text)
    if (timePrefKey) {
      const rawPref = String(row[timePrefKey] || '').trim().toLowerCase();
      let prefImg = null;
      if (rawPref.includes('morn')) prefImg = 'images/morning.svg';
      else if (rawPref.includes('afternoon') || rawPref.includes('midday')) prefImg = 'images/midday.svg';
      else if (rawPref.includes('night') || rawPref.includes('evening')) prefImg = 'images/night.svg';

      if (prefImg) {
        const prefEl = document.createElement('img');
        prefEl.src = prefImg;
        prefEl.alt = rawPref || 'preferred time';
        prefEl.style.width = '40px';
        prefEl.style.height = '40px';
        prefEl.style.objectFit = 'contain';
        prefEl.style.gridColumn = '1 / 2';
        prefEl.style.gridRow = '1 / 2';
        prefEl.style.alignSelf = 'end';     // bottom of the cell
        prefEl.style.justifySelf = 'start'; // left of the cell
        prefEl.style.margin = '6px';
        prefEl.style.pointerEvents = 'none';
        card.appendChild(prefEl);
      }
    }

    // row 2 divider spanning both columns
    const divider = document.createElement('div');
    divider.textContent = '----------------------------------------------------';
    divider.style.gridColumn = '1 / -1';
    divider.style.gridRow = '2 / 3';
    divider.style.alignSelf = 'center';
    divider.style.justifySelf = 'start';
    divider.style.fontFamily = 'sans-serif';
    divider.style.opacity = '0.9';
    divider.style.pointerEvents = 'none';
    card.appendChild(divider);

    // study-mode image in first row, second column
    if (studyKey) {
      const rawStudy = String(row[studyKey] || '').trim().toLowerCase();
      let imgSrc = null;
      if (rawStudy.includes('alone')) imgSrc = 'images/workAloneV2.png';
      else if (rawStudy.includes('both')) imgSrc = 'images/dependsV2.png';
      else if (rawStudy.includes('friend') || rawStudy.includes('with')) imgSrc = 'images/workTogetherV2.png';

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

    // if the drink question exists, render response as list (top of details)
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
          listEl.style.paddingLeft = '0';     // remove default left padding
          listEl.style.gridColumn = '1 / -1';
          listEl.style.listStyle = 'none';   // remove bullets

          // show only first three answers
          const shown = items.slice(0, 3);
          shown.forEach(it => {
            const li = document.createElement('li');
            li.textContent = it;
            li.style.fontSize = '15px';
            li.style.marginBottom = '4px';
            li.style.paddingLeft = '0';
            listEl.appendChild(li);
          });

          // indicate if there are more items
          if (items.length > 3) {
            const more = document.createElement('div');
            more.textContent = `+${items.length - 3} more`;
            more.style.fontSize = '12px';
            more.style.opacity = '0.8';
            more.style.marginTop = '4px';
            listEl.appendChild(more);
          }

          details.appendChild(listEl);
        }
      }
    }

    // Replace long "How much work..." question label with "productivity:" and map answers to percentages
    const productivityRe = /how much work do you normally get done/i;
    headers.forEach(h => {
      if (tsKey && h === tsKey) return;
      if (targetKey && h === targetKey) return;
      if (studyKey && h === studyKey) return;
      if (timeKey && h === timeKey) return;
      if (timePrefKey && h === timePrefKey) return;
      if (drinkKey && h === drinkKey) return; // hide the drink preference question
      if (productivityRe.test(h)) return; // skip productivity question and its response entirely
      const val = row[h];
      if (val === undefined || val === '') return;

      const keyText = h;

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
      valEl.textContent = String(val);

      line.appendChild(keyEl);
      line.appendChild(valEl);
      details.appendChild(line);
    });

    // place barcode image on the last row (row 5) of the card grid
    (function addBarcode() {
      const barcodeSrc = 'images/barcodeass.png';
      const img = document.createElement('img');
      img.src = barcodeSrc;
      img.alt = 'barcode';
      img.style.width = '243px';
      img.style.height = '30px;';
      img.style.objectFit = 'contain';
      // place in final grid row
      img.style.gridColumn = '1 / -1';
      img.style.gridRow = '5 / 6';
      img.style.justifySelf = 'center';
      img.style.alignSelf = 'center';
      img.style.marginTop = '6px';
      card.appendChild(img);
    })();

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

    // do not render the raw table — only render charts and cards

    if (numeric.length > 0) {
      let chartContainer = document.getElementById('chartContainer');
      if (!chartContainer) {
        chartContainer = document.createElement('div');
        chartContainer.id = 'chartContainer';
        document.body.appendChild(chartContainer);
      }
      renderBarChart(chartContainer, rows, numeric[0]);
    }

    let responsesContainer = document.getElementById('responsesContainer');
    if (!responsesContainer) {
      responsesContainer = document.createElement('div');
      responsesContainer.id = 'responsesContainer';
      document.body.appendChild(responsesContainer);
    }
    renderResponses(responsesContainer, rows);
  })
  .catch(err => console.error('Error fetching or parsing CSV:', err));