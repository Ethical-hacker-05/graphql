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
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#2f3a61"/>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#2f3a61"/>
    ${axisLabel(6, pad + 4, `${max} XP`)}
    ${axisLabel(6, height - pad, "0 XP")}
    ${axisLabel(width - 86, height - 8, "Time ->")}
    <polyline points="${linePoints}" fill="none" stroke="#77a8ff" stroke-width="2" />
    ${circles}
  `;

  container.innerHTML = createSvg(width, height, content);
}

export function renderPassFail(container, passCount, failCount) {
  const total = passCount + failCount;
  if (!total) {
    container.innerHTML = "<p class='muted'>No result data found.</p>";
    return;
  }

  const width = 340;
  const height = 220;
  const cx = 95;
  const cy = 110;
  const radius = 66;
  const passAngle = (passCount / total) * Math.PI * 2;

  const passX = cx + radius * Math.cos(passAngle - Math.PI / 2);
  const passY = cy + radius * Math.sin(passAngle - Math.PI / 2);
  const largeArc = passCount / total > 0.5 ? 1 : 0;

  const passPath = `M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${passX} ${passY} L ${cx} ${cy} Z`;
  const failPath = `M ${passX} ${passY} A ${radius} ${radius} 0 ${largeArc ? 0 : 1} 1 ${cx} ${cy - radius} L ${cx} ${cy} Z`;

  const content = `
    <path d="${passPath}" fill="#50d890"><title>Pass: ${passCount}</title></path>
    <path d="${failPath}" fill="#ff6b7f"><title>Fail: ${failCount}</title></path>
    <circle cx="${cx}" cy="${cy}" r="32" fill="#161d33"></circle>
    <text x="${188}" y="${86}" fill="#ecf0ff" font-size="14">Pass: ${passCount}</text>
    <text x="${188}" y="${116}" fill="#ecf0ff" font-size="14">Fail: ${failCount}</text>
    <text x="${188}" y="${146}" fill="#a7b0cc" font-size="12">${Math.round((passCount / total) * 100)}% pass rate</text>
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
