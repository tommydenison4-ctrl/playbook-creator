const state = {
  tool: 'route',
  forceFreehand: false,
  pendingInsert: null,
  pendingLabel: 'A',
  pendingLabel: 'A',
  selectedId: null,
  drawings: [],
  objects: [],
  tags: [],
  history: [],
  lineStart: null,
  previewPoint: null,
  isDrawing: false,
  draftPoints: [],
  draggingObjectId: null,
  draggingDrawId: null,
  dragSnapshot: null,
  dragOffset: null,
  draggingAnchor: null,
  suppressNextClick: false
};

const surface = document.getElementById('surface');
const svg = document.getElementById('svg');
const objectLayer = document.getElementById('objectLayer');
const rowsSelect = document.getElementById('rowsSelect');
const tagInput = document.getElementById('tagInput');
const tagList = document.getElementById('tagList');
const searchInput = document.getElementById('librarySearch');
const searchResults = document.getElementById('searchResults');
const hint = document.getElementById('hint');
const labelModal = document.getElementById('labelModal');
const labelModalInput = document.getElementById('labelModalInput');
const labelModalOk = document.getElementById('labelModalOk');
const labelModalCancel = document.getElementById('labelModalCancel');

function openLabelModal(initial='A'){
  return new Promise(resolve => {
    labelModal.classList.remove('hidden');
    labelModal.setAttribute('aria-hidden','false');
    labelModalInput.value = initial || 'A';
    setTimeout(()=>labelModalInput.focus(), 0);
    const cleanup = (value) => {
      labelModal.classList.add('hidden');
      labelModal.setAttribute('aria-hidden','true');
      labelModalOk.onclick = null;
      labelModalCancel.onclick = null;
      labelModalInput.onkeydown = null;
      document.querySelectorAll('[data-label-preset]').forEach(btn => btn.onclick = null);
      resolve(value);
    };
    labelModalOk.onclick = () => cleanup((labelModalInput.value || '').trim().toUpperCase().slice(0,3) || initial || 'A');
    labelModalCancel.onclick = () => cleanup(null);
    labelModalInput.onkeydown = (e) => {
      if(e.key === 'Enter') cleanup((labelModalInput.value || '').trim().toUpperCase().slice(0,3) || initial || 'A');
      if(e.key === 'Escape') cleanup(null);
    };
    document.querySelectorAll('[data-label-preset]').forEach(btn => {
      btn.onclick = () => {
        labelModalInput.value = btn.dataset.labelPreset;
        labelModalInput.focus();
      };
    });
  });
}


function makeId(){ return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function translateDrawing(draw, dxPct, dyPct){
  const dx = dxPct * 12;   // 1200 viewBox width / 100
  const dy = dyPct * 7.2;  // 720 viewBox height / 100
  draw.points = draw.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
}


function colors(){
  return {
    route: document.getElementById('routeColor').value,
    motion: document.getElementById('motionColor').value,
    option: document.getElementById('optionColor').value,
    pull: document.getElementById('pullColor').value,
    block: document.getElementById('blockColor').value,
    text: document.getElementById('textColor').value
  };
}
function routeColor(mode){ return colors()[mode] || colors().route; }

function getCanvasPct(ev){
  const r = surface.getBoundingClientRect();
  return { xPct: ((ev.clientX-r.left)/r.width)*100, yPct: ((ev.clientY-r.top)/r.height)*100 };
}
function svgPoint(ev){
  const r = svg.getBoundingClientRect();
  return { x: (ev.clientX-r.left)*(1200/r.width), y: (ev.clientY-r.top)*(720/r.height) };
}

function syncPrintLabels(){
  document.getElementById('printFormation').textContent = document.getElementById('formationName').value || 'Formation';
  document.getElementById('printMotion').textContent = document.getElementById('motionTag').value || 'Motion';
  document.getElementById('printPlay').textContent = document.getElementById('playName').value || 'Play';
  document.getElementById('printTags').textContent = state.tags.length ? state.tags.join(' • ') : 'Tags';
}
['formationName','motionTag','playName'].forEach(id => document.getElementById(id).addEventListener('input', syncPrintLabels));

document.getElementById('formationName').addEventListener('input', ()=>{
  const key = (document.getElementById('formationName').value || '').trim().toLowerCase();
  const store = getStore();
  document.getElementById('formationStatus').textContent = key && store.formations[key] ? 'Saved found' : 'New';
});
document.getElementById('playName').addEventListener('input', ()=>{
  const key = (document.getElementById('playName').value || '').trim().toLowerCase();
  const store = getStore();
  document.getElementById('playStatus').textContent = key && store.plays[key] ? 'Saved found' : 'New';
});

function pushHistory(){
  state.history.push(JSON.stringify({
    drawings: state.drawings,
    objects: state.objects,
    tags: state.tags,
    rowsCount: Number(rowsSelect.value),
    assignments: getAssignmentValues()
  }));
  if(state.history.length > 60) state.history.shift();
}
function undo(){
  const last = state.history.pop();
  if(!last) return;
  const d = JSON.parse(last);
  state.drawings = d.drawings || [];
  state.objects = d.objects || [];
  state.tags = d.tags || [];
  setAssignmentValues(d.assignments || [], d.rowsCount || 10);
  state.selectedId = null;
  render();
}
document.getElementById('undoBtn').addEventListener('click', undo);

function clearPendingInsert(){
  state.pendingInsert = null;
  document.querySelectorAll('[data-insert]').forEach(b => b.classList.remove('pending'));
}

function setTool(tool){
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
  clearPendingInsert();
  state.lineStart = null;
  state.previewPoint = null;
  state.isDrawing = false;
  state.draftPoints = [];
  if(tool === 'cursor'){
    hint.textContent = 'Cursor tool: click an object, hold, and drag it.';
  } else if(tool === 'anchors'){
    hint.textContent = 'Edit tool: click a route to show anchors and drag them.';
  } else if(state.forceFreehand){
    hint.textContent = 'Freehand: click-drag-release to draw a curve.';
  } else {
    hint.textContent = 'Hybrid: click once, click again for a straight line.';
  }
  render();
}
document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

document.getElementById('hybridBtn').addEventListener('click', ()=>{
  document.getElementById('hybridBtn').classList.add('active');
  document.getElementById('freehandBtn').classList.remove('active');
  state.forceFreehand = false;
  state.lineStart = null; state.previewPoint = null; state.isDrawing = false; state.draftPoints = [];
  clearPendingInsert();
  if(state.tool === 'block'){
    hint.textContent = 'Block tool: click once, click again to place a capped blocking line.';
  } else {
    hint.textContent = 'Hybrid: click once, click again for a straight line.';
  }
  render();
});
document.getElementById('freehandBtn').addEventListener('click', ()=>{
  document.getElementById('freehandBtn').classList.add('active');
  document.getElementById('hybridBtn').classList.remove('active');
  state.forceFreehand = true;
  state.lineStart = null; state.previewPoint = null; state.isDrawing = false; state.draftPoints = [];
  clearPendingInsert();
  if(state.tool === 'block'){
    hint.textContent = 'Block tool: click-drag-release for a capped blocking curve.';
  } else {
    hint.textContent = 'Freehand: click-drag-release to draw a curve.';
  }
  render();
});

document.querySelectorAll('[data-insert]').forEach(btn => btn.addEventListener('click', async ()=>{
  document.querySelectorAll('[data-insert]').forEach(b => b.classList.remove('pending'));
  btn.classList.add('pending');
  state.pendingInsert = btn.dataset.insert;
  if(state.pendingInsert === 'label'){
    const v = await openLabelModal(state.pendingLabel || 'A');
    if(v === null){
      clearPendingInsert();
      render();
      return;
    }
    state.pendingLabel = v;
  }
  state.selectedId = null;
  state.lineStart = null; state.previewPoint = null; state.isDrawing = false; state.draftPoints = [];
  hint.textContent = 'Click the field to place the selected player/object.';
  render();
}));

function reducePoints(points, minDist=8){
  if(points.length < 3) return points;
  const out = [points[0]];
  for(let i=1;i<points.length-1;i++){
    const prev = out[out.length-1], curr = points[i];
    if(Math.hypot(curr.x-prev.x, curr.y-prev.y) > minDist) out.push(curr);
  }
  out.push(points[points.length-1]);
  return out;
}
function pointToSegmentDistance(p,a,b){
  const l2 = (b.x-a.x)*(b.x-a.x) + (b.y-a.y)*(b.y-a.y);
  if(l2 === 0) return Math.hypot(p.x-a.x,p.y-a.y);
  let t = ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t*(b.x-a.x), y: a.y + t*(b.y-a.y) };
  return Math.hypot(p.x-proj.x, p.y-proj.y);
}
function shouldSnapStraight(points){
  if(points.length < 2) return false;
  const a = points[0], b = points[points.length-1];
  const len = Math.hypot(b.x-a.x,b.y-a.y);
  if(len < 28) return true;
  let maxDist = 0;
  for(const p of points){
    const d = pointToSegmentDistance(p,a,b);
    if(d > maxDist) maxDist = d;
  }
  return maxDist <= 7;
}
function simplifyPolyline(points){
  let p = reducePoints(points, 9);
  if(p.length <= 4) return p;
  const out = [p[0]];
  for(let i=1;i<p.length-1;i++){
    const a = out[out.length-1], b = p[i], c = p[i+1];
    const ab = Math.atan2(b.y-a.y,b.x-a.x), bc = Math.atan2(c.y-b.y,c.x-b.x);
    const diff = Math.abs(ab-bc);
    if(diff > 0.24 || i % 2 === 0) out.push(b);
  }
  out.push(p[p.length-1]);
  return out;
}
function normalizePoints(points, mode, freehand){
  let p = clone(points);
  if(!freehand) return [p[0], p[p.length-1] || p[0]];
  if(mode === 'motion') return [p[0], p[p.length-1] || p[0]];
  if(shouldSnapStraight(p)) return [p[0], p[p.length-1] || p[0]];
  return simplifyPolyline(p);
}
function smoothPath(points, mode){
  if(!points.length) return '';
  if(mode === 'motion'){
    const a = points[0], b = points[points.length-1];
    const segs = 10, dx = (b.x-a.x)/segs, dy = (b.y-a.y)/segs;
    let d = `M ${a.x} ${a.y}`;
    for(let i=1;i<=segs;i++){
      const x = a.x + dx*i, y = a.y + dy*i + (i%2 ? -3.6 : 3.6);
      d += ` L ${x} ${y}`;
    }
    return d;
  }
  if(points.length < 3){
    const a = points[0], b = points[points.length-1] || points[0];
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-2;i++){
    const xc = (points[i].x + points[i+1].x)/2, yc = (points[i].y + points[i+1].y)/2;
    d += ` Q ${points[i].x} ${points[i].y} ${xc} ${yc}`;
  }
  const pen = points[points.length-2], last = points[points.length-1];
  d += ` Q ${pen.x} ${pen.y} ${last.x} ${last.y}`;
  return d;
}
function makeArrowHead(defs, id, color){
  const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id', id);
  marker.setAttribute('markerWidth','4.6');
  marker.setAttribute('markerHeight','4.6');
  marker.setAttribute('refX','3.9');
  marker.setAttribute('refY','2.3');
  marker.setAttribute('orient','auto-start-reverse');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M 0 0 L 4.6 2.3 L 0 4.6 z');
  path.setAttribute('fill', color);
  marker.appendChild(path);
  defs.appendChild(marker);
}

function renderObjects(){
  objectLayer.innerHTML = '';
  state.objects.forEach(obj => {
    if(obj.kind === 'text'){
      const wrap = document.createElement('div');
      wrap.className = 'textObj' + (state.selectedId === obj.id ? ' selected' : '');
      wrap.style.left = `${obj.x}%`;
      wrap.style.top = `${obj.y}%`;
      wrap.style.color = obj.color;
      wrap.dataset.id = obj.id;
      wrap.style.zIndex = state.selectedId === obj.id ? '5' : '2';
      const ta = document.createElement('textarea');
      ta.value = obj.text;
      ta.readOnly = state.tool !== 'text';
      ta.addEventListener('input', ()=> obj.text = ta.value);
      wrap.appendChild(ta);
      wrap.addEventListener('pointerdown', e => {
        e.stopPropagation();
        beginObjectDrag(obj.id, e);
      });
      objectLayer.appendChild(wrap);
    } else {
      const el = document.createElement('div');
      el.className = `obj ${obj.kind}` + (state.selectedId === obj.id ? ' selected' : '');
      el.style.left = `${obj.x}%`;
      el.style.top = `${obj.y}%`;
      el.dataset.id = obj.id;
      if(obj.kind === 'circle' || obj.kind === 'square' || obj.kind === 'label') el.textContent = obj.label || '';
      if(obj.kind === 'triangle') el.dataset.label = obj.label || '';
      el.addEventListener('dblclick', ()=> {
        const v = prompt('Label', obj.label || '');
        if(v !== null){ obj.label = v; render(); }
      });
      el.addEventListener('pointerdown', e => {
        e.stopPropagation();
        beginObjectDrag(obj.id, e);
      });
      objectLayer.appendChild(el);
    }
  });
}

function drawOne(defs, draw, preview=false){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  const p = document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d', smoothPath(draw.points, draw.mode));
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', draw.color);
  p.setAttribute('stroke-width', draw.mode === 'pull' ? '2.35' : (draw.mode === 'block' ? '2.4' : '1.8'));
  p.setAttribute('stroke-linecap', draw.mode === 'block' ? 'square' : 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if(draw.mode === 'pull') p.setAttribute('stroke-dasharray', '4.5 3.5');
  if(draw.mode === 'block') p.classList.add('blockLine');
  if(draw.mode !== 'motion' && draw.mode !== 'block') p.setAttribute('marker-end', `url(#arrow-${draw.mode})`);
  if(preview) p.classList.add('preview');
  if(state.selectedId === draw.id) p.classList.add('routeSelected');
  p.setAttribute('data-route-id', draw.id);
  p.style.cursor = state.tool === 'cursor' ? 'grab' : 'pointer';
  g.appendChild(p);

  if(draw.mode === 'block'){
    const last = draw.points[draw.points.length-1], prev = draw.points[Math.max(draw.points.length-2,0)];
    const ang = Math.atan2(last.y-prev.y,last.x-prev.x);
    const half = 14;
    const px = Math.cos(ang + Math.PI/2) * half;
    const py = Math.sin(ang + Math.PI/2) * half;
    const cap = document.createElementNS('http://www.w3.org/2000/svg','path');
    cap.setAttribute('d', `M ${last.x-px} ${last.y-py} L ${last.x+px} ${last.y+py}`);
    cap.setAttribute('class','blockCap' + (preview ? ' preview' : ''));
    cap.setAttribute('stroke', draw.color);
    cap.setAttribute('data-route-id', draw.id);
    cap.style.cursor = state.tool === 'cursor' ? 'grab' : 'pointer';
    g.appendChild(cap);
  }
  if(draw.mode === 'option'){
    const last = draw.points[draw.points.length-1], prev = draw.points[Math.max(draw.points.length-2,0)];
    const ang = Math.atan2(last.y-prev.y,last.x-prev.x), length = 11;
    const branch = document.createElementNS('http://www.w3.org/2000/svg','path');
    const x2 = last.x - Math.cos(ang-0.6)*length, y2 = last.y - Math.sin(ang-0.6)*length;
    branch.setAttribute('d', `M ${last.x} ${last.y} L ${x2} ${y2}`);
    branch.setAttribute('stroke', draw.color);
    branch.setAttribute('stroke-width', '1.5');
    branch.setAttribute('fill', 'none');
    branch.setAttribute('stroke-linecap', 'round');
    if(preview) branch.classList.add('preview');
    g.appendChild(branch);
  }

  if(!preview){
    const hit = document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d', smoothPath(draw.points, draw.mode));
    hit.setAttribute('class','routeHit');
    hit.setAttribute('data-route-id', draw.id);
    hit.style.cursor = state.tool === 'cursor' ? 'grab' : 'pointer';
    g.appendChild(hit);
  }

  if(state.tool === 'anchors' && state.selectedId === draw.id && !preview){
    draw.points.forEach((pt, idx) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx', pt.x);
      c.setAttribute('cy', pt.y);
      c.setAttribute('r','4');
      c.setAttribute('class','anchor' + (state.draggingAnchor && state.draggingAnchor.index === idx ? ' active' : ''));
      c.addEventListener('pointerdown', e => {
        e.stopPropagation();
        state.draggingAnchor = { id: draw.id, index: idx };
        render();
      });
      g.appendChild(c);
    });
  }

  return g;
}

function renderDrawings(){
  svg.innerHTML = '';
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  ['route','motion','option','pull','block'].forEach(mode => makeArrowHead(defs, `arrow-${mode}`, routeColor(mode)));
  svg.appendChild(defs);

  state.drawings.forEach(draw => svg.appendChild(drawOne(defs, draw, false)));

  if(state.isDrawing && state.draftPoints.length > 1){
    svg.appendChild(drawOne(defs, {
      id: 'preview',
      mode: state.tool,
      color: routeColor(state.tool),
      points: normalizePoints(state.draftPoints, state.tool, true)
    }, true));
  }

  if(state.lineStart && state.previewPoint && !state.forceFreehand){
    svg.appendChild(drawOne(defs, {
      id: 'preview-straight',
      mode: state.tool,
      color: routeColor(state.tool),
      points: [state.lineStart, state.previewPoint]
    }, true));
  }
}

function renderTags(){
  tagList.innerHTML = '';
  state.tags.forEach(tag => {
    const pill = document.createElement('div');
    pill.className = 'tag';
    pill.innerHTML = `${tag}<button title="Remove">×</button>`;
    pill.querySelector('button').addEventListener('click', ()=>{
      pushHistory();
      state.tags = state.tags.filter(t => t !== tag);
      renderTags();
      renderSearchResults(searchInput.value);
      syncPrintLabels();
    });
    tagList.appendChild(pill);
  });
}
function renderSearchResults(query=''){
  const q = query.trim().toLowerCase();
  const plays = getStore().plays || {};
  searchResults.innerHTML = '';
  const matches = Object.values(plays).filter(play => {
    if(!q) return false;
    const hay = [play.playName||'', play.formationName||'', ...(play.tags||[])].join(' ').toLowerCase();
    return hay.includes(q);
  }).slice(0,18);
  if(!q){ searchResults.innerHTML = '<div class="result">No search entered</div>'; return; }
  if(!matches.length){ searchResults.innerHTML = '<div class="result">No matches</div>'; return; }
  matches.forEach(play => {
    const pill = document.createElement('div');
    pill.className = 'result';
    pill.textContent = `${play.playName || 'Untitled'} • ${play.formationName || 'No formation'}`;
    pill.addEventListener('click', ()=>{
      applyData(play);
      document.getElementById('playStatus').textContent = 'Loaded';
      hint.textContent = `Loaded ${play.playName || 'play'}`;
    });
    searchResults.appendChild(pill);
  });
}

function render(){
  renderObjects();
  renderDrawings();
  renderTags();
  syncPrintLabels();
}

function getAssignmentValues(){
  return Array.from(document.querySelectorAll('#assignmentRows .assignment')).map(row => ({
    pos: row.querySelector('.pos')?.textContent || '',
    line1: row.querySelectorAll('input')[0]?.value || '',
    line2: row.querySelectorAll('input')[1]?.value || ''
  }));
}
function buildAssignments(){
  const existing = getAssignmentValues ? getAssignmentValues() : [];
  const wrap = document.getElementById('assignmentRows');
  wrap.innerHTML = '';
  const positions = ['QB','RB','LT','LG','C','RG','RT','H','Y','X','Z','F'];
  const count = Number(rowsSelect.value);
  for(let i=0;i<count;i++){
    const row = document.createElement('div');
    row.className = 'assignment';
    row.innerHTML = `<div class="pos">${existing[i]?.pos || positions[i] || 'POS'}</div>
      <input placeholder="Responsibility line 1" maxlength="100" value="${(existing[i]?.line1||'').replace(/"/g,'&quot;')}">
      <input placeholder="Responsibility line 2" maxlength="100" value="${(existing[i]?.line2||'').replace(/"/g,'&quot;')}">`;
    wrap.appendChild(row);
  }
}
function setAssignmentValues(items=[], countOverride=null){
  rowsSelect.value = String(countOverride || Math.max(items.length || 0, Number(rowsSelect.value) || 10));
  buildAssignments();
  const rows = Array.from(document.querySelectorAll('#assignmentRows .assignment'));
  rows.forEach((row, i) => {
    const item = items[i] || {};
    const posEl = row.querySelector('.pos');
    const inputs = row.querySelectorAll('input');
    if(item.pos && posEl) posEl.textContent = item.pos;
    if(inputs[0]) inputs[0].value = item.line1 || '';
    if(inputs[1]) inputs[1].value = item.line2 || '';
  });
}
rowsSelect.addEventListener('change', buildAssignments);


const STORAGE_KEY = 'pb_v50_store';

function getStore(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"plays":{},"formations":{}}');
  }catch(err){
    return {plays:{}, formations:{}};
  }
}
function setStore(store){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function setNotice(msg){
  const el = document.getElementById('saveNotice');
  if(el) el.textContent = msg;
}

function payload(){
  return {
    formationName: document.getElementById('formationName').value || '',
    motionTag: document.getElementById('motionTag').value || '',
    playName: document.getElementById('playName').value || '',
    rowsCount: Number(rowsSelect.value),
    assignments: getAssignmentValues(),
    colors: colors(),
    drawings: state.drawings,
    objects: state.objects,
    tags: state.tags,
    savedAt: new Date().toISOString()
  };
}
function saveFormation(){
  const name = (document.getElementById('formationName').value || '').trim();
  if(!name){
    alert('Add a formation name first.');
    return false;
  }
  const store = getStore();
  store.formations[name.toLowerCase()] = { ...payload(), playName: '' };
  setStore(store);
  document.getElementById('formationStatus').textContent = 'Saved';
  setNotice(`Formation saved: ${name}`);
  return true;
}
function savePlay(){
  const name = (document.getElementById('playName').value || '').trim();
  if(!name){
    alert('Add a play name first.');
    return false;
  }
  const store = getStore();
  store.plays[name.toLowerCase()] = payload();
  setStore(store);
  document.getElementById('playStatus').textContent = 'Saved';
  renderSearchResults(searchInput.value);
  setNotice(`Play saved: ${name}`);
  return true;
}
function applyData(data){
  document.getElementById('formationName').value = data.formationName || '';
  document.getElementById('motionTag').value = data.motionTag || '';
  document.getElementById('playName').value = data.playName || '';
  if(data.colors){
    document.getElementById('routeColor').value = data.colors.route || '#111111';
    document.getElementById('motionColor').value = data.colors.motion || '#2952ff';
    document.getElementById('optionColor').value = data.colors.option || '#16a34a';
    document.getElementById('pullColor').value = data.colors.pull || '#dc2626';
    const blockColor = document.getElementById('blockColor');
    if(blockColor) blockColor.value = data.colors.block || data.colors.route || '#111111';
    document.getElementById('textColor').value = data.colors.text || '#7c3aed';
  }
  state.drawings = data.drawings || [];
  state.objects = data.objects || [];
  state.tags = data.tags || [];
  setAssignmentValues(data.assignments || [], data.rowsCount || Number(rowsSelect.value));
  state.selectedId = null;
  state.lineStart = null;
  state.previewPoint = null;
  state.pendingInsert = null;
  state.isDrawing = false;
  state.draftPoints = [];
  state.draggingObjectId = null;
  state.draggingDrawId = null;
  state.dragOffset = null;
  state.dragSnapshot = null;
  state.draggingAnchor = null;
  clearPendingInsert();
  render();
}
function loadSaved(){
  const playName = (document.getElementById('playName').value || '').trim().toLowerCase();
  const formationName = (document.getElementById('formationName').value || '').trim().toLowerCase();
  const store = getStore();
  if(playName && store.plays[playName]){
    applyData(store.plays[playName]);
    document.getElementById('playStatus').textContent = 'Loaded';
    setNotice(`Play loaded: ${playName}`);
    return;
  }
  if(formationName && store.formations[formationName]){
    applyData(store.formations[formationName]);
    document.getElementById('formationStatus').textContent = 'Loaded';
    setNotice(`Formation loaded: ${formationName}`);
    return;
  }
  alert('No saved play or formation with that name.');
}
document.getElementById('saveFormationBtn').addEventListener('click', ()=>{ saveFormation(); });
document.getElementById('savePlayBtn').addEventListener('click', ()=>{ savePlay(); });
document.getElementById('loadBtn').addEventListener('click', loadSaved);
document.getElementById('pdfBtn').addEventListener('click', ()=>window.print());


tagInput.addEventListener('keydown', e => {
  if(e.key !== 'Enter') return;
  e.preventDefault();
  const value = tagInput.value.trim();
  if(!value) return;
  if(state.tags.includes(value)){ tagInput.value = ''; return; }
  pushHistory();
  state.tags.push(value);
  tagInput.value = '';
  render();
  renderSearchResults(searchInput.value);
});
document.getElementById('clearTagsBtn').addEventListener('click', ()=>{
  pushHistory();
  state.tags = [];
  render();
  renderSearchResults(searchInput.value);
});
searchInput.addEventListener('input', e => renderSearchResults(e.target.value));


function beginObjectDrag(id, e){
  state.selectedId = id;
  state.draggingObjectId = null;
  state.dragOffset = null;
  state.suppressNextClick = true;
  if(state.tool === 'cursor'){
    const obj = state.objects.find(o => o.id === id);
    if(obj){
      const pct = getCanvasPct(e);
      state.draggingObjectId = id;
      state.dragOffset = { x: pct.xPct - obj.x, y: pct.yPct - obj.y };
    }
    try{
      if(e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    }catch(err){}
  }
}

objectLayer.addEventListener('pointerdown', e => {
  const objEl = e.target.closest('.obj,.textObj');
  if(!objEl) return;
  const id = objEl.dataset.id;
  if(!id) return;
  e.preventDefault();
  e.stopPropagation();
  beginObjectDrag(id, e);
  render();
});

surface.addEventListener('pointerdown', e => {
  if(state.pendingInsert) return;

  if(e.target.closest('.obj,.textObj')) return;

  if(state.tool === 'text') return;
  if(!['route','motion','option','pull','block'].includes(state.tool)) return;

  const pt = svgPoint(e);

  if(state.forceFreehand){
    e.preventDefault();
    state.isDrawing = true;
    state.draftPoints = [pt];
    state.lineStart = pt;
    state.previewPoint = pt;
    render();
    return;
  }
});

surface.addEventListener('pointermove', e => {
  if(state.draggingAnchor){
    const draw = state.drawings.find(d => d.id === state.draggingAnchor.id);
    if(draw){
      draw.points[state.draggingAnchor.index] = svgPoint(e);
      render();
    }
    return;
  }

  if(state.draggingObjectId){
    const obj = state.objects.find(o => o.id === state.draggingObjectId);
    if(obj){
      const pct = getCanvasPct(e);
      const ox = state.dragOffset ? state.dragOffset.x : 0;
      const oy = state.dragOffset ? state.dragOffset.y : 0;
      obj.x = Math.max(2, Math.min(98, pct.xPct - ox));
      obj.y = Math.max(2, Math.min(98, pct.yPct - oy));
      render();
    }
    return;
  }

  if(state.isDrawing && state.forceFreehand){
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    events.forEach(ev => state.draftPoints.push(svgPoint(ev)));
    render();
    return;
  }
});

window.addEventListener('pointermove', e => {
  if(state.draggingObjectId){
    const obj = state.objects.find(o => o.id === state.draggingObjectId);
    if(obj){
      const pct = getCanvasPct(e);
      const ox = state.dragOffset ? state.dragOffset.x : 0;
      const oy = state.dragOffset ? state.dragOffset.y : 0;
      obj.x = Math.max(2, Math.min(98, pct.xPct - ox));
      obj.y = Math.max(2, Math.min(98, pct.yPct - oy));
      render();
    }
    return;
  }
  if(state.draggingDrawId){
    const draw = state.drawings.find(d => d.id === state.draggingDrawId);
    if(draw && state.dragSnapshot){
      const pct = getCanvasPct(e);
      const dxPct = pct.xPct - state.dragSnapshot.xPct;
      const dyPct = pct.yPct - state.dragSnapshot.yPct;
      translateDrawing(draw, dxPct, dyPct);
      state.dragSnapshot = pct;
      render();
    }
    return;
  }
});

window.addEventListener('pointerup', () => {
  if(state.draggingAnchor){
    state.draggingAnchor = null;
    render();
    return;
  }
  if(state.draggingObjectId){
    state.draggingObjectId = null;
    state.dragOffset = null;
    render();
    return;
  }
  if(state.draggingDrawId){
    state.draggingDrawId = null;
    state.dragSnapshot = null;
    render();
    return;
  }
  if(state.draggingDrawId){
    state.draggingDrawId = null;
    state.dragSnapshot = null;
    render();
    return;
  }
  if(state.isDrawing && state.forceFreehand){
    pushHistory();
    const pts = normalizePoints(state.draftPoints, state.tool, true);
    if(pts.length > 1){
      state.drawings.push({ id: makeId(), mode: state.tool, color: routeColor(state.tool), points: pts });
    }
    state.isDrawing = false;
    state.draftPoints = [];
    state.lineStart = null;
    state.previewPoint = null;
    state.suppressNextClick = true;
    render();
  }
});

surface.addEventListener('click', e => {
  if(state.suppressNextClick){
    state.suppressNextClick = false;
    return;
  }

  const pct = getCanvasPct(e);

  if(state.pendingInsert){
    pushHistory();
    const map = {
      circle: { kind: 'circle', label: '' },
      square: { kind: 'square', label: '' },
      triangle: { kind: 'triangle', label: '' },
      label: { kind: 'label', label: (state.pendingLabel || 'A') }
    };
    const conf = map[state.pendingInsert];
    state.objects.push({ id: makeId(), ...conf, x: pct.xPct, y: pct.yPct });
    state.selectedId = state.objects[state.objects.length-1].id;
    hint.textContent = 'Placed. Click field again to place another, or switch tools.';
    render();
    return;
  }

  const objEl = e.target.closest('.obj,.textObj');
  if(objEl){
    state.selectedId = objEl.dataset.id;
    render();
    return;
  }

  if(state.tool === 'text'){
    pushHistory();
    state.objects.push({ id: makeId(), kind: 'text', text: '', color: colors().text, x: pct.xPct, y: pct.yPct });
    state.selectedId = state.objects[state.objects.length-1].id;
    render();
    const ta = objectLayer.querySelector('.textObj:last-child textarea');
    if(ta) ta.focus();
    return;
  }

  if(!['route','motion','option','pull','block'].includes(state.tool)) return;
  if(state.forceFreehand) return;

  const pt = svgPoint(e);
  if(!state.lineStart){
    state.lineStart = pt;
    state.previewPoint = pt;
    render();
    return;
  }

  pushHistory();
  state.drawings.push({
    id: makeId(),
    mode: state.tool,
    color: routeColor(state.tool),
    points: [state.lineStart, pt]
  });
  state.lineStart = null;
  state.previewPoint = null;
  render();
});

svg.addEventListener('pointerdown', e => {
  const hit = e.target.closest('.routeHit');
  if(hit){
    const id = hit.dataset.id;
    state.selectedId = id;
    render();
  }
});

function renderDrawingsWithIds(){
  svg.innerHTML = '';
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  ['route','motion','option','pull','block'].forEach(mode => makeArrowHead(defs, `arrow-${mode}`, routeColor(mode)));
  svg.appendChild(defs);

  state.drawings.forEach(draw => {
    const g = drawOne(defs, draw, false);
    const hit = g.querySelector('.routeHit');
    if(hit){
      hit.dataset.id = draw.id;
      hit.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        state.selectedId = draw.id;
        if(state.tool === 'cursor'){
          state.draggingDrawId = draw.id;
          state.dragSnapshot = getCanvasPct(e);
        }
        render();
      });
    }
    const anchors = g.querySelectorAll('.anchor');
    anchors.forEach((a, idx) => {
      a.addEventListener('pointerdown', ev => {
        ev.stopPropagation();
        state.draggingAnchor = { id: draw.id, index: idx };
        render();
      });
    });
    svg.appendChild(g);
  });

  if(state.isDrawing && state.draftPoints.length > 1){
    svg.appendChild(drawOne(defs, {
      id:'preview',
      mode: state.tool,
      color: routeColor(state.tool),
      points: normalizePoints(state.draftPoints, state.tool, true)
    }, true));
  }

  if(state.lineStart && state.previewPoint && !state.forceFreehand){
    svg.appendChild(drawOne(defs, {
      id:'preview-straight',
      mode: state.tool,
      color: routeColor(state.tool),
      points:[state.lineStart, state.previewPoint]
    }, true));
  }
}
renderDrawings = renderDrawingsWithIds;


function findRouteTarget(el){
  let node = el;
  while(node){
    if(node.getAttribute){
      const id = node.getAttribute('data-route-id');
      if(id) return { node, id };
    }
    node = node.parentNode;
  }
  return null;
}

svg.addEventListener('pointerdown', e => {
  const found = findRouteTarget(e.target);
  if(!found) return;
  const routeId = found.id;
  e.preventDefault();
  e.stopPropagation();
  state.selectedId = routeId;
  if(state.tool === 'cursor'){
    state.draggingDrawId = routeId;
    state.dragSnapshot = getCanvasPct(e);
    try{
      if(found.node.setPointerCapture) found.node.setPointerCapture(e.pointerId);
    }catch(err){}
  }
  render();
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  if(!state.selectedId) return;
  pushHistory();
  state.drawings = state.drawings.filter(d => d.id !== state.selectedId);
  state.objects = state.objects.filter(o => o.id !== state.selectedId);
  state.selectedId = null;
  render();
});

buildAssignments();
render();
syncPrintLabels();
renderSearchResults('');
setNotice('Ready');
window.addEventListener('beforeprint', syncPrintLabels);
