function createSvg(width, height, content) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Statistics chart">${content}</svg>`;
}

function axisLabel(x, y, text) {
  return `<text x="${x}" y="${y}" fill="#a7b0cc" font-size="10">${text}</text>`;
}

export function renderXpOverTime(container, transactions) {
  if (!transactions.length) {
    container.innerHTML = "<p class='muted'>No XP data found.</p>";
    return;
  }

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let cumulative = 0;
  const points = sorted.map((item) => {
    cumulative += item.amount;
    return { date: new Date(item.createdAt), value: cumulative };
  });

  const width = 700;
  const height = 220;
  const pad = 32;
  const max = Math.max(...points.map((p) => p.value), 1);

  const linePoints = points
    .map((point, index) => {
      const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - (point.value / max) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const circles = points
    .map((point, index) => {
      const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - (point.value / max) * (height - pad * 2);
      return `<circle cx="${x}" cy="${y}" r="2.4" fill="#77a8ff"><title>${point.value} XP</title></circle>`;
    })
    .join("");

  const content = `
    <defs>
      <linearGradient id="xpArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#77a8ff" stop-opacity="0.30" />
        <stop offset="100%" stop-color="#77a8ff" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#2f3a61"/>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#2f3a61"/>
    ${axisLabel(6, pad + 4, `${max} XP`)}
    ${axisLabel(6, height - pad, "0 XP")}
    ${axisLabel(width - 86, height - 8, "Time ->")}
    <polygon points="${pad},${height - pad} ${linePoints} ${width - pad},${height - pad}" fill="url(#xpArea)" />
    <polyline points="${linePoints}" fill="none" stroke="#77a8ff" stroke-width="1.5" />
    ${circles}
  `;

  container.innerHTML = createSvg(width, height, content);
}

export function renderAuditRatio(container, givenAudits, receivedAudits) {
  const total = givenAudits + receivedAudits;
  if (!total) {
    container.innerHTML = "<p class='muted'>No audit ratio data found.</p>";
    return;
  }

  const width = 300;
  const height = 190;
  const cx = 72;
  const cy = 95;
  const radius = 54;
  const givenAngle = (givenAudits / total) * Math.PI * 2;

  const givenX = cx + radius * Math.cos(givenAngle - Math.PI / 2);
  const givenY = cy + radius * Math.sin(givenAngle - Math.PI / 2);
  const largeArc = givenAudits / total > 0.5 ? 1 : 0;

  const givenPath = `M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${givenX} ${givenY} L ${cx} ${cy} Z`;
  const receivedPath = `M ${givenX} ${givenY} A ${radius} ${radius} 0 ${largeArc ? 0 : 1} 1 ${cx} ${cy - radius} L ${cx} ${cy} Z`;
  const ratio = receivedAudits ? (givenAudits / receivedAudits).toFixed(1) : "N/A";

  const content = `
    <path d="${givenPath}" fill="#50d890"><title>Given audits: ${givenAudits}</title></path>
    <path d="${receivedPath}" fill="#ff6b7f"><title>Received audits: ${receivedAudits}</title></path>
    <circle cx="${cx}" cy="${cy}" r="26" fill="#161d33"></circle>
    <text x="${146}" y="${70}" fill="#ecf0ff" font-size="12">Given: ${givenAudits}</text>
    <text x="${146}" y="${93}" fill="#ecf0ff" font-size="12">Received: ${receivedAudits}</text>
    <text x="${146}" y="${116}" fill="#a7b0cc" font-size="11">Audit Ratio: ${ratio}</text>
    <text x="${146}" y="${138}" fill="#a7b0cc" font-size="11">${Math.round((givenAudits / total) * 100)}% share given</text>
  `;

  container.innerHTML = createSvg(width, height, content);
}

export function renderXpByProject(container, projectRows) {
  if (!projectRows.length) {
    container.innerHTML = "<p class='muted'>No XP by project data found.</p>";
    return;
  }

  const rows = projectRows;
  const width = 760;
  const barHeight = 20;
  const rowGap = 12;
  const topPad = 16;
  const longestNameLength = rows.reduce((maxLen, row) => {
    return Math.max(maxLen, String(row.project || "").length);
  }, 0);
  // Approximate label width using average glyph width at font-size 11
  const labelWidth = Math.min(380, Math.max(120, Math.round(longestNameLength * 6.5)));
  const gap = 10;
  const leftPad = labelWidth + gap;
  const rightPad = 100;
  const max = Math.max(...rows.map((row) => row.xp), 1);
  const rowBlock = barHeight + rowGap;
  const height = topPad + rows.length * rowBlock + 12;
  const maxBarWidth = width - leftPad - rightPad;

  const bars = rows
    .map((row, index) => {
      const y = topPad + index * rowBlock;
      const barWidth = Math.max(2, (row.xp / max) * maxBarWidth);
      const valueX = Math.min(leftPad + barWidth + 8, width - rightPad + 8);
      const labelY = y + 14;
      return `
        <text x="8" y="${labelY}" fill="#a7b0cc" font-size="10">
          <title>${row.project}</title>${row.project}
        </text>
        <rect x="${leftPad}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="#77a8ff">
          <title>${row.project}: ${row.xp} XP</title>
        </rect>
        <text x="${valueX}" y="${y + 14}" fill="#ecf0ff" font-size="10">${row.xp} XP</text>
      `;
    })
    .join("");

  container.innerHTML = createSvg(width, height, bars);
}
