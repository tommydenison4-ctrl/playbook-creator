const canvas = document.getElementById('playCanvas');
const ctx = canvas.getContext('2d');
const toolButtons = document.querySelectorAll('.tool-btn');
const presetButtons = document.querySelectorAll('.preset-btn');
const lineWidthInput = document.getElementById('lineWidth');
const autoSmoothInput = document.getElementById('autoSmooth');
const snapToGridInput = document.getElementById('snapToGrid');
const strokeStyleInput = document.getElementById('strokeStyle');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toggleFieldBtn = document.getElementById('toggleFieldBtn');

let currentTool = 'draw';
let isDrawing = false;
let currentPoints = [];
let showField = true;

const history = [];
let historyIndex = -1;
const objects = [];

function resizeCanvasForDPR() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width;
  const cssHeight = rect.width * (850 / 1400);
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  redraw();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  let x = event.clientX - rect.left;
  let y = event.clientY - rect.top;

  if (snapToGridInput.checked) {
    const grid = 20;
    x = Math.round(x / grid) * grid;
    y = Math.round(y / grid) * grid;
  }

  return { x, y };
}

function drawField() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1d6b3a';
  ctx.fillRect(0, 0, width, height);

  if (!showField) return;

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += height / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.beginPath();
  ctx.moveTo(width / 2, 8);
  ctx.lineTo(width / 2, height - 8);
  ctx.stroke();
}

function setLineDash() {
  const style = strokeStyleInput.value;
  if (style === 'dash') ctx.setLineDash([12, 8]);
  else if (style === 'dot') ctx.setLineDash([2, 10]);
  else ctx.setLineDash([]);
}

function smoothPath(points) {
  if (points.length < 3 || !autoSmoothInput.checked) return points;
  const smoothed = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    smoothed.push({
      x: (prev.x + curr.x + next.x) / 3,
      y: (prev.y + curr.y + next.y) / 3,
    });
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function renderRoute(points, width = Number(lineWidthInput.value), preview = false, style = strokeStyleInput.value) {
  if (points.length < 2) return;
  const usable = smoothPath(points);

  ctx.save();
  ctx.strokeStyle = preview ? 'rgba(245,197,66,0.8)' : '#f5f7fa';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style === 'dash') ctx.setLineDash([12, 8]);
  else if (style === 'dot') ctx.setLineDash([2, 10]);
  else ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(usable[0].x, usable[0].y);
  for (let i = 1; i < usable.length - 1; i++) {
    const midX = (usable[i].x + usable[i + 1].x) / 2;
    const midY = (usable[i].y + usable[i + 1].y) / 2;
    ctx.quadraticCurveTo(usable[i].x, usable[i].y, midX, midY);
  }
  const last = usable[usable.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  const end = usable[usable.length - 1];
  const prev = usable[usable.length - 2];
  const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
  const size = 12 + width;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
  ctx.restore();
}

function renderPlayer(x, y, label = 'X', fill = '#0f1720', stroke = '#ffffff') {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
  ctx.restore();
}

function renderBall(x, y) {
  ctx.save();
  ctx.fillStyle = '#7a3d18';
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.stroke();
  ctx.restore();
}

function renderText(x, y, text = 'TEXT') {
  ctx.save();
  ctx.font = '600 18px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function redraw() {
  drawField();

  for (const obj of objects) {
    if (obj.type === 'route') renderRoute(obj.points, obj.width, false, obj.style);
    if (obj.type === 'player') renderPlayer(obj.x, obj.y, obj.label, obj.fill, obj.stroke);
    if (obj.type === 'ball') renderBall(obj.x, obj.y);
    if (obj.type === 'text') renderText(obj.x, obj.y, obj.text);
  }

  if (isDrawing && currentTool === 'draw') {
    renderRoute(currentPoints, Number(lineWidthInput.value), true, strokeStyleInput.value);
  }
}

function commitHistory() {
  history.splice(historyIndex + 1);
  history.push(JSON.stringify(objects));
  historyIndex = history.length - 1;
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  objects.length = 0;
  JSON.parse(history[historyIndex]).forEach(item => objects.push(item));
  redraw();
}

function addPreset(type) {
  objects.length = 0;
  if (type === 'offense') {
    const y = canvas.clientHeight * 0.62;
    const startX = canvas.clientWidth * 0.25;
    ['X','LT','LG','C','RG','RT','Y','Z','H','Q'].forEach((label, idx) => {
      const rowOffset = idx < 6 ? 0 : idx === 9 ? 60 : -60;
      const x = idx < 6 ? startX + idx * 60 : startX + (idx - 6) * 120;
      const px = idx === 9 ? startX + 170 : x;
      objects.push({ type: 'player', x: px, y: y + rowOffset, label, fill: '#102034', stroke: '#ffffff' });
    });
    objects.push({ type: 'ball', x: startX + 120, y });
  }
  if (type === 'defense') {
    const y = canvas.clientHeight * 0.42;
    const startX = canvas.clientWidth * 0.24;
    ['E','T','N','T','E','M','W','S','C','F'].forEach((label, idx) => {
      const rowOffset = idx < 5 ? 0 : 70;
      const x = idx < 5 ? startX + idx * 75 : startX + (idx - 5) * 120;
      objects.push({ type: 'player', x, y: y + rowOffset, label, fill: '#4a1010', stroke: '#ffffff' });
    });
  }
  commitHistory();
  redraw();
}

canvas.addEventListener('pointerdown', (event) => {
  const point = getCanvasPoint(event);
  canvas.setPointerCapture(event.pointerId);

  if (currentTool === 'draw') {
    isDrawing = true;
    currentPoints = [point];
    redraw();
    return;
  }

  if (currentTool === 'player') {
    const label = prompt('Player label', 'X');
    if (label !== null) {
      objects.push({ type: 'player', x: point.x, y: point.y, label: label.toUpperCase().slice(0, 4), fill: '#102034', stroke: '#ffffff' });
      commitHistory();
      redraw();
    }
    return;
  }

  if (currentTool === 'ball') {
    objects.push({ type: 'ball', x: point.x, y: point.y });
    commitHistory();
    redraw();
    return;
  }

  if (currentTool === 'text') {
    const text = prompt('Add note', 'MOTION');
    if (text !== null) {
      objects.push({ type: 'text', x: point.x, y: point.y, text: text.slice(0, 24) });
      commitHistory();
      redraw();
    }
    return;
  }

  if (currentTool === 'erase') {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const hit = obj.x ? Math.hypot(obj.x - point.x, obj.y - point.y) < 28 : false;
      if (hit) {
        objects.splice(i, 1);
        commitHistory();
        redraw();
        break;
      }
    }
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing || currentTool !== 'draw') return;
  const batch = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  for (const e of batch) {
    currentPoints.push(getCanvasPoint(e));
  }
  redraw();
});

canvas.addEventListener('pointerup', () => {
  if (!isDrawing || currentTool !== 'draw') return;
  isDrawing = false;
  if (currentPoints.length > 1) {
    objects.push({
      type: 'route',
      points: [...currentPoints],
      width: Number(lineWidthInput.value),
      style: strokeStyleInput.value,
    });
    commitHistory();
  }
  currentPoints = [];
  redraw();
});

window.addEventListener('resize', resizeCanvasForDPR);

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    toolButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
  });
});

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => addPreset(btn.dataset.preset));
});

undoBtn.addEventListener('click', () => restoreHistory(historyIndex - 1));
redoBtn.addEventListener('click', () => restoreHistory(historyIndex + 1));
clearBtn.addEventListener('click', () => {
  objects.length = 0;
  commitHistory();
  redraw();
});
downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'playbook-diagram.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});
toggleFieldBtn.addEventListener('click', () => {
  showField = !showField;
  redraw();
});

commitHistory();
resizeCanvasForDPR();
