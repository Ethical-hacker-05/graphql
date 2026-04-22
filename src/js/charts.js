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

  const width = 760;
  const height = 260;
  const pad = 34;
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
      return `<circle cx="${x}" cy="${y}" r="3" fill="#77a8ff"><title>${point.value} XP</title></circle>`;
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
    <polyline points="${linePoints}" fill="none" stroke="#77a8ff" stroke-width="2" />
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

  const width = 340;
  const height = 220;
  const cx = 95;
  const cy = 110;
  const radius = 66;
  const givenAngle = (givenAudits / total) * Math.PI * 2;

  const givenX = cx + radius * Math.cos(givenAngle - Math.PI / 2);
  const givenY = cy + radius * Math.sin(givenAngle - Math.PI / 2);
  const largeArc = givenAudits / total > 0.5 ? 1 : 0;

  const givenPath = `M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${givenX} ${givenY} L ${cx} ${cy} Z`;
  const receivedPath = `M ${givenX} ${givenY} A ${radius} ${radius} 0 ${largeArc ? 0 : 1} 1 ${cx} ${cy - radius} L ${cx} ${cy} Z`;
  const ratio = receivedAudits ? (givenAudits / receivedAudits).toFixed(2) : "N/A";

  const content = `
    <path d="${givenPath}" fill="#50d890"><title>Given audits: ${givenAudits}</title></path>
    <path d="${receivedPath}" fill="#ff6b7f"><title>Received audits: ${receivedAudits}</title></path>
    <circle cx="${cx}" cy="${cy}" r="32" fill="#161d33"></circle>
    <text x="${188}" y="${76}" fill="#ecf0ff" font-size="14">Given: ${givenAudits}</text>
    <text x="${188}" y="${104}" fill="#ecf0ff" font-size="14">Received: ${receivedAudits}</text>
    <text x="${188}" y="${132}" fill="#a7b0cc" font-size="12">Given/Received: ${ratio}</text>
    <text x="${188}" y="${156}" fill="#a7b0cc" font-size="12">${Math.round((givenAudits / total) * 100)}% share given</text>
  `;

  container.innerHTML = createSvg(width, height, content);
}

export function renderXpByProject(container, projectRows) {
  if (!projectRows.length) {
    container.innerHTML = "<p class='muted'>No XP by project data found.</p>";
    return;
  }

  const rows = projectRows.slice(0, 8);
  const width = 760;
  const barHeight = 22;
  const rowGap = 10;
  const topPad = 16;
  const leftPad = 160;
  const rightPad = 28;
  const max = Math.max(...rows.map((row) => row.xp), 1);
  const height = topPad + rows.length * (barHeight + rowGap) + 12;
  const maxBarWidth = width - leftPad - rightPad;

  const bars = rows
    .map((row, index) => {
      const y = topPad + index * (barHeight + rowGap);
      const barWidth = Math.max(2, (row.xp / max) * maxBarWidth);
      return `
        <text x="8" y="${y + 15}" fill="#a7b0cc" font-size="11">${row.project}</text>
        <rect x="${leftPad}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="#77a8ff">
          <title>${row.project}: ${row.xp} XP</title>
        </rect>
        <text x="${leftPad + barWidth + 8}" y="${y + 15}" fill="#ecf0ff" font-size="11">${row.xp} XP</text>
      `;
    })
    .join("");

  container.innerHTML = createSvg(width, height, bars);
}
