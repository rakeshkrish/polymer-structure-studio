const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { units: 'real', system: 'polymer' };
const colors = ['#326b4c', '#d69a3b', '#4e7cb4', '#b26378', '#805ea8', '#54a0a0', '#bd7045', '#65727d'];
let polymerAssignmentsValid = true;
let particleCountsValid = true;
let hybridPolymerAssignmentsValid = true;
let hybridCountsValid = true;
let tetherValid = true;

function renderCountRows(container, count, total, attr, massAttr, preserve = false) {
  const box = $(container);
  const old = preserve ? [...box.querySelectorAll(`[${attr}]`)].map((input) => ({
    count: Number(input.value),
    mass: Number(box.querySelector(`[${massAttr}="${Number(input.dataset.index) + 1}"]`)?.value) || 1,
  })) : [];
  const isHybridLJ = attr === 'data-hybrid-lj-count';
  box.innerHTML = Array.from({ length: count }, (_, i) => {
    const evenlySplit = Math.floor(total / count) + (i < total % count ? 1 : 0);
    const atomType = isHybridLJ ? Number($('#hybridPolymerTypeCount').value) + i + 1 : i + 1;
    return `<div class="type-row">
      <span class="type-name"><i style="--type-color:${colors[i]}"></i>${isHybridLJ ? 'LJ type' : 'Type'} ${i + 1}${isHybridLJ ? `<small class="global-type-id">LAMMPS type ${atomType}</small>` : ''}</span>
      <span class="type-count-wrap"><input ${attr}="${i}" data-index="${i}" type="number" min="0" value="${old[i]?.count ?? evenlySplit}" aria-label="Number of beads in type ${i + 1}"><small>beads</small></span>
      <label class="mass-wrap">Mass<input class="mass-input" ${massAttr}="${i + 1}" type="number" min="0.001" step="0.1" value="${old[i]?.mass ?? 1}" aria-label="Mass for type ${i + 1}"></label>
    </div>`;
  }).join('');
}

function renderRangeRows(container, select, indexAttr, massAttr, preserve = false) {
  const box = $(container);
  const count = Number($(select).value);
  const old = preserve ? [...box.querySelectorAll(`[${indexAttr}]`)].map((input) => ({
    indices: input.value,
    mass: box.querySelector(`[${massAttr}="${input.dataset.type}"]`)?.value || 1,
  })) : [];
  const rows = [`<div class="type-row">
    <span class="type-name"><i style="--type-color:${colors[0]}"></i>Type 1 <small class="default-tag">default</small></span>
    <label class="mass-wrap">Mass<input class="mass-input" ${massAttr}="1" data-type="1" type="number" min="0.001" step="0.1" value="${box.querySelector(`[${massAttr}="1"]`)?.value || 1}" aria-label="Mass for type 1"></label>
  </div>`];
  for (let type = 2; type <= count; type++) {
    const prior = old[type - 2];
    rows.push(`<div class="range-row">
      <span class="type-name"><i style="--type-color:${colors[type - 1]}"></i>Type ${type}</span>
      <input class="range-input" ${indexAttr}="${type}" data-type="${type}" type="text" value="${prior?.indices ?? (type === 2 ? '40-46' : '')}" placeholder="e.g. 1, 100, 15-20" aria-label="Bead indices for type ${type}">
      <label class="mass-wrap">Mass<input class="mass-input" ${massAttr}="${type}" data-type="${type}" type="number" min="0.001" step="0.1" value="${prior?.mass ?? 1}" aria-label="Mass for type ${type}"></label>
    </div>`);
  }
  box.innerHTML = rows.join('');
}

function parseIndices(value, beadCount) {
  const result = new Set();
  const invalid = [];
  if (!value.trim()) return { result, invalid };
  for (const entry of value.split(',')) {
    const token = entry.trim();
    const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) { invalid.push(token || '(empty entry)'); continue; }
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > beadCount) { invalid.push(token); continue; }
    for (let index = first; index <= last; index++) result.add(index);
  }
  return { result, invalid };
}

function parseTypeAssignments(beadCount, typeCount, inputs) {
  const assigned = Array.from({ length: typeCount + 1 }, () => new Set());
  for (const input of inputs) {
    const type = Number(input.dataset.type);
    const parsed = parseIndices(input.value, beadCount);
    if (parsed.invalid.length) throw new Error(`Type ${type} has invalid bead indices: ${parsed.invalid.join(', ')}`);
    for (const bead of parsed.result) {
      for (let other = 2; other <= typeCount; other++) {
        if (other !== type && assigned[other].has(bead)) throw new Error(`Bead ${bead} is assigned to multiple types.`);
      }
      assigned[type].add(bead);
    }
  }
  return assigned;
}

function readTypeAssignments(beadCount, typeCount, inputs) {
  const assigned = Array.from({ length: typeCount + 1 }, () => new Set());
  const errors = [];
  for (const input of inputs) {
    const type = Number(input.dataset.type);
    const parsed = parseIndices(input.value, beadCount);
    parsed.invalid.forEach(token => errors.push(`Type ${type}: ${token}`));
    for (const bead of parsed.result) {
      for (let other = 2; other <= typeCount; other++) {
        if (other !== type && assigned[other].has(bead)) errors.push(`Bead ${bead} is assigned to multiple types`);
      }
      assigned[type].add(bead);
    }
  }
  return { assigned, errors: [...new Set(errors)] };
}

function getPolymerTypeCounts(beadCount, assignments, typeCount) {
  const counts = Array(typeCount).fill(0);
  counts[0] = beadCount;
  for (let type = 2; type <= typeCount; type++) {
    counts[0] -= assignments[type].size;
    counts[type - 1] = assignments[type].size;
  }
  return counts;
}

function composition(counts, startType = 1) {
  return counts.map((count, i) => `Type ${startType + i} · ${count.toLocaleString()}`).join(' / ');
}

function drawParticles(counts) {
  let markup = '';
  const total = Math.max(1, counts.reduce((sum, count) => sum + count, 0));
  const shown = Math.min(168, total);
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / 21), col = i % 21;
    const x = 24 + col * 17 + (row % 2 ? 7 : 0), y = 29 + row * 21;
    const position = i / shown * total;
    let cumulative = 0, type = 0;
    for (let t = 0; t < counts.length; t++) {
      cumulative += counts[t];
      if (position < cumulative) { type = t; break; }
    }
    markup += `<circle cx="${x}" cy="${y}" r="5.1" fill="${colors[type]}"/>`;
  }
  $('#structureSvg').innerHTML = markup;
}

function drawPolymer(beadCount, assignments, hybrid = false, freeTypes = 1) {
  const points = [];
  const count = Math.min(35, beadCount);
  const tether = readTether();
  const hasCurve = tether.mode === 'two' && tether.beadA !== tether.beadB;
  const lowerAnchor = hasCurve ? Math.min(tether.beadA, tether.beadB) : 0;
  const upperAnchor = hasCurve ? Math.max(tether.beadA, tether.beadB) : 0;
  let markup = '';
  const beadAt = i => Math.round(i / (count - 1) * (beadCount - 1)) + 1;
  for (let i = 0; i < count; i++) {
    const bead = beadAt(i);
    const curve = hasCurve && bead >= lowerAnchor && bead <= upperAnchor ? Math.sin(2 * Math.PI * (bead - lowerAnchor) / (upperAnchor - lowerAnchor)) : 0;
    points.push([20 + i * 360 / (count - 1), 120 - 42 * curve]);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [x, y] = points[i], [nextX, nextY] = points[i + 1];
    markup += `<path d="M${x} ${y} L${nextX} ${nextY}" fill="none" stroke="#d6e1d9" stroke-width="3"/>`;
  }
  points.forEach(([x, y], i) => {
    const bead = beadAt(i);
    let type = 1;
    for (let t = 2; t < assignments.length; t++) if (assignments[t].has(bead)) { type = t; break; }
    markup += `<circle cx="${x}" cy="${y}" r="5.4" fill="${colors[type - 1]}" stroke="white" stroke-width="1.5"/>`;
  });
  if (hybrid) for (let i = 0; i < 8; i++) markup += `<circle cx="${40 + i * 40}" cy="${31 + (i % 3) * 22}" r="4.5" fill="${colors[Math.min(assignments.length - 1 + (i % freeTypes), colors.length - 1)]}"/>`;
  $('#structureSvg').innerHTML = markup;
}

function readTether() {
  const mode = $('#tetherMode').value;
  if (mode === 'one') return { mode, bead: Number($('#tetherBead').value) };
  if (mode === 'two') return { mode, beadA: Number($('#tetherBeadA').value), beadB: Number($('#tetherBeadB').value), length: Number($('#tetherLength').value) };
  return { mode: 'none' };
}

function validateTether(beadCount, bondLength, beadSize) {
  const tether = readTether();
  let message = 'Anchor bead numbers refer to beads along each polymer. Two anchors create a sine-shaped curve between them; LAMMPS fixes are needed to hold anchors during a run.';
  let valid = true;
  if (tether.mode === 'one') {
    valid = Number.isInteger(tether.bead) && tether.bead >= 1 && tether.bead <= beadCount;
    if (!valid) message = `Choose one anchor bead from 1 to ${beadCount}.`;
  } else if (tether.mode === 'two') {
    const separation = Math.abs(tether.beadB - tether.beadA);
    valid = Number.isInteger(tether.beadA) && Number.isInteger(tether.beadB) && tether.beadA >= 1 && tether.beadA <= beadCount && tether.beadB >= 1 && tether.beadB <= beadCount && tether.beadA !== tether.beadB && Number.isFinite(tether.length) && tether.length >= beadSize && tether.length <= separation * bondLength;
    if (!valid) message = `Choose two different beads; separation must be at least the bead size and no longer than the contour length (${(separation * bondLength).toFixed(2)} ${state.units === 'real' ? 'Å' : 'σ'}). A wavy chain will connect them.`;
    if (valid && separation === 1 && Math.abs(tether.length - bondLength) > 1e-6) {
      valid = false;
      message = 'Adjacent tether beads must be separated by one bond length.';
    }
  }
  tetherValid = valid;
  $('#tetherHelp').textContent = message;
  $('#tetherHelp').classList.toggle('error', !valid);
  return tether;
}

function update() {
  const particle = state.system === 'particles';
  const polymer = state.system === 'polymer';
  const hybrid = state.system === 'hybrid';
  const chainSystem = polymer || hybrid;
  const unit = state.units === 'real' ? 'Å' : 'σ';
  $('#particleFields').hidden = !particle;
  $('#polymerFields').hidden = !polymer;
  $('#hybridFields').hidden = !hybrid;
  $('#tetherSection').hidden = !chainSystem;
  $('#singleTetherFields').hidden = $('#tetherMode').value !== 'one';
  $('#doubleTetherFields').hidden = $('#tetherMode').value !== 'two';
  $('#baseDimensions').hidden = hybrid;
  $('#hybridDimensions').hidden = !hybrid;
  $('#bondLengthLabel').hidden = !chainSystem;
  $('#bondLength').hidden = !chainSystem;
  $('#baseDimensions').classList.toggle('particles-only', !chainSystem);
  $('#dimensionHint').textContent = chainSystem ? 'Bond length is the distance between bonded bead centers.' : 'Bead size sets the diameter of each LJ particle.';
  $('#beadSizeUnit').textContent = `(${unit})`;
  $('#bondLengthUnit').textContent = `(${unit})`;
  $('#tetherLengthUnit').textContent = `(${unit})`;
  $('#hybridPolymerBeadSizeUnit').textContent = $('#hybridBondLengthUnit').textContent = $('#hybridLJBeadSizeUnit').textContent = `(${unit})`;
  $('#boxUnit').textContent = `(${unit})`;
  $('#unitBadge').textContent = state.units.toUpperCase();
  $('#summaryUnits').textContent = state.units === 'real' ? 'Real' : 'Reduced (LJ)';
  let total, typeCount, summary;

  if (particle) {
    total = Math.max(1, Number($('#particleTotal').value) || 1);
    const counts = $$('[data-count]').map(x => Math.max(0, Number(x.value) || 0));
    typeCount = counts.length;
    const sum = counts.reduce((a, b) => a + b, 0);
    particleCountsValid = Number.isInteger(total) && counts.every(Number.isInteger) && sum === total;
    summary = composition(counts);
    $('#particleCountHelp').textContent = particleCountsValid ? 'Type counts match the total number of beads.' : `Type counts add up to ${sum.toLocaleString()} (total is ${total.toLocaleString()}).`;
    $('#particleCountHelp').classList.toggle('error', !particleCountsValid);
    $('#previewTitle').textContent = 'Beads only';
    $('#summarySystem').textContent = 'Beads only · LJ particles';
    drawParticles(counts);
  } else if (polymer) {
    const beadCount = Math.max(2, Number($('#beadsPerPolymer').value) || 2);
    const chainCount = Math.max(1, Number($('#polymerCount').value) || 1);
    $('#tetherBead').max = $('#tetherBeadA').max = $('#tetherBeadB').max = beadCount;
    validateTether(beadCount, Number($('#bondLength').value), Number($('#beadSize').value));
    typeCount = Number($('#polymerTypeCount').value);
    const assignmentResult = readTypeAssignments(beadCount, typeCount, $$('[data-poly-indices]'));
    const assignments = assignmentResult.assigned;
    const counts = getPolymerTypeCounts(beadCount, assignments, typeCount);
    summary = composition(counts.map(n => n * chainCount));
    total = beadCount * chainCount;
    polymerAssignmentsValid = assignmentResult.errors.length === 0;
    $('#polymerRangeHelp').textContent = assignmentResult.errors.length ? assignmentResult.errors.join('. ') : 'All unlisted beads are assigned to type 1.';
    $('#polymerRangeHelp').classList.toggle('error', !polymerAssignmentsValid);
    $('#previewTitle').textContent = $('#tetherMode').value === 'two' ? 'Wavy tethered polymer' : 'Linear polymer';
    $('#summarySystem').textContent = `Bead–spring · ${chainCount} polymer${chainCount === 1 ? '' : 's'}`;
    drawPolymer(beadCount, assignments);
  } else {
    const beadCount = Math.max(2, Number($('#hybridBeadsPerPolymer').value) || 2);
    const chainCount = Math.max(1, Number($('#hybridPolymerCount').value) || 1);
    $('#tetherBead').max = $('#tetherBeadA').max = $('#tetherBeadB').max = beadCount;
    validateTether(beadCount, Number($('#hybridBondLength').value), Number($('#hybridPolymerBeadSize').value));
    const polymerTypeCount = Number($('#hybridPolymerTypeCount').value);
    const ljTypeCount = Number($('#hybridLJTypeCount').value);
    $('#hybridLJAtomRange').textContent = `LAMMPS atom types ${polymerTypeCount + 1}–${polymerTypeCount + ljTypeCount}`;
    $$('[data-hybrid-lj-count]').forEach(input => { const badge = input.closest('.type-row').querySelector('.global-type-id'); if (badge) badge.textContent = `LAMMPS type ${polymerTypeCount + Number(input.dataset.index) + 1}`; });
    const freeCount = Math.max(0, Number($('#freeBeadCount').value) || 0);
    const assignmentResult = readTypeAssignments(beadCount, polymerTypeCount, $$('[data-hybrid-poly-indices]'));
    const assignments = assignmentResult.assigned;
    const freeCounts = $$('[data-hybrid-lj-count]').map(x => Math.max(0, Number(x.value) || 0));
    const freeSum = freeCounts.reduce((a, b) => a + b, 0);
    hybridCountsValid = Number.isInteger(freeCount) && freeCounts.every(Number.isInteger) && freeSum === freeCount;
    hybridPolymerAssignmentsValid = assignmentResult.errors.length === 0;
    const help = $('#hybridLJCountHelp');
    help.textContent = hybridCountsValid ? 'LJ type counts match the total number of free particles.' : `LJ type counts add up to ${freeSum.toLocaleString()} (total is ${freeCount.toLocaleString()}).`;
    help.classList.toggle('error', !hybridCountsValid);
    const chainTypeCounts = getPolymerTypeCounts(beadCount, assignments, polymerTypeCount).map(n => n * chainCount);
    summary = `${composition(chainTypeCounts)} / ${composition(freeCounts, polymerTypeCount + 1)}`;
    total = beadCount * chainCount + freeCount;
    typeCount = polymerTypeCount + ljTypeCount;
    $('#hybridPolymerRangeHelp').textContent = assignmentResult.errors.length ? assignmentResult.errors.join('. ') : 'All unlisted polymer beads are assigned to polymer type 1.';
    $('#hybridPolymerRangeHelp').classList.toggle('error', !hybridPolymerAssignmentsValid);
    $('#previewTitle').textContent = $('#tetherMode').value === 'two' ? 'Beads + wavy polymer' : 'Beads + linear polymer';
    $('#summarySystem').textContent = `${chainCount} polymers + free LJ particles`;
    drawPolymer(beadCount, assignments, true, ljTypeCount);
  }
  $('#summaryTypes').textContent = typeCount;
  $('#summaryComposition').textContent = summary;
  $('#summaryTotal').textContent = total.toLocaleString();
}

$$('[data-unit]').forEach(button => button.addEventListener('click', () => {
  state.units = button.dataset.unit;
  $$('[data-unit]').forEach(x => { x.classList.toggle('selected', x === button); x.setAttribute('aria-pressed', String(x === button)); });
  update();
}));
$$('[data-system]').forEach(button => button.addEventListener('click', () => {
  state.system = button.dataset.system;
  $$('[data-system]').forEach(x => { x.classList.toggle('selected', x === button); x.setAttribute('aria-pressed', String(x === button)); });
  update();
}));
$('#particleTypeCount').addEventListener('change', () => { renderCountRows('#particleTypeRows', Number($('#particleTypeCount').value), Number($('#particleTotal').value), 'data-count', 'data-mass'); update(); });
$('#particleTotal').addEventListener('input', update);
$('#particleTypeRows').addEventListener('input', update);
$('#polymerTypeCount').addEventListener('change', () => { renderRangeRows('#polymerTypeRows', '#polymerTypeCount', 'data-poly-indices', 'data-mass'); update(); });
$('#polymerTypeRows').addEventListener('input', update);
$('#hybridPolymerTypeCount').addEventListener('change', () => { renderRangeRows('#hybridPolymerTypeRows', '#hybridPolymerTypeCount', 'data-hybrid-poly-indices', 'data-hybrid-poly-mass'); update(); });
$('#hybridPolymerTypeRows').addEventListener('input', update);
$('#hybridLJTypeCount').addEventListener('change', () => { renderCountRows('#hybridLJTypeRows', Number($('#hybridLJTypeCount').value), Number($('#freeBeadCount').value), 'data-hybrid-lj-count', 'data-hybrid-lj-mass'); update(); });
$('#hybridLJTypeRows').addEventListener('input', update);
$('#tetherMode').addEventListener('change', update);
['tetherBead', 'tetherBeadA', 'tetherBeadB', 'tetherLength'].forEach(id => $(`#${id}`).addEventListener('input', update));
['polymerCount', 'beadsPerPolymer', 'hybridPolymerCount', 'hybridBeadsPerPolymer', 'freeBeadCount', 'beadSize', 'bondLength', 'hybridPolymerBeadSize', 'hybridBondLength', 'hybridLJBeadSize', 'boxX', 'boxY', 'boxZ', 'randomSeed'].forEach(id => $(`#${id}`).addEventListener('input', update));

function massValues(count, attr, container) { return Array.from({ length: count }, (_, i) => Number($(`${container} [${attr}="${i + 1}"]`).value)); }
function collect() {
  const common = { units: state.units, system: state.system, beadSize: Number($('#beadSize').value), box: [Number($('#boxX').value), Number($('#boxY').value), Number($('#boxZ').value)], seed: Number($('#randomSeed').value) };
  if (state.system === 'particles') return { ...common, totalBeads: Number($('#particleTotal').value), typeCounts: $$('[data-count]').map(x => Number(x.value)), masses: massValues(Number($('#particleTypeCount').value), 'data-mass', '#particleTypeRows') };
  if (state.system === 'polymer') return { ...common, polymerCount: Number($('#polymerCount').value), beadsPerPolymer: Number($('#beadsPerPolymer').value), typeCount: Number($('#polymerTypeCount').value), indices: Object.fromEntries($$('[data-poly-indices]').map(x => [x.dataset.type, x.value])), masses: massValues(Number($('#polymerTypeCount').value), 'data-mass', '#polymerTypeRows'), bondLength: Number($('#bondLength').value), tether: readTether() };
  return { ...common, polymerCount: Number($('#hybridPolymerCount').value), beadsPerPolymer: Number($('#hybridBeadsPerPolymer').value), polymerTypeCount: Number($('#hybridPolymerTypeCount').value), polymerIndices: Object.fromEntries($$('[data-hybrid-poly-indices]').map(x => [x.dataset.type, x.value])), polymerMasses: massValues(Number($('#hybridPolymerTypeCount').value), 'data-hybrid-poly-mass', '#hybridPolymerTypeRows'), polymerBeadSize: Number($('#hybridPolymerBeadSize').value), bondLength: Number($('#hybridBondLength').value), freeBeads: Number($('#freeBeadCount').value), ljTypeCounts: $$('[data-hybrid-lj-count]').map(x => Number(x.value)), ljMasses: massValues(Number($('#hybridLJTypeCount').value), 'data-hybrid-lj-mass', '#hybridLJTypeRows'), ljBeadSize: Number($('#hybridLJBeadSize').value), tether: readTether() };
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function spatialGrid(cutoff) {
  const cellSize = Math.max(cutoff, .001), cells = new Map();
  const key = (x, y, z) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
  function overlaps(point, radius) {
    const gx = Math.floor(point[0] / cellSize), gy = Math.floor(point[1] / cellSize), gz = Math.floor(point[2] / cellSize);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (let z = gz - 1; z <= gz + 1; z++) {
      for (const q of cells.get(`${x},${y},${z}`) || []) { const dx = point[0] - q.point[0], dy = point[1] - q.point[1], dz = point[2] - q.point[2], minimum = radius + q.radius; if (dx * dx + dy * dy + dz * dz < minimum * minimum) return true; }
    }
    return false;
  }
  function add(point, radius) { const k = key(...point); if (!cells.has(k)) cells.set(k, []); cells.get(k).push({ point, radius }); }
  return { overlaps, add };
}
function randomDirection(random) {
  const z = 2 * random() - 1, phi = 2 * Math.PI * random(), radial = Math.sqrt(1 - z * z);
  return [radial * Math.cos(phi), radial * Math.sin(phi), z];
}
function buildLinearChain(count, bondLength, box, radius, random, grid) {
  // Try axis-aligned placements regularly so a narrow box dimension does not
  // cause random orientations to miss a valid placement.
  const axisDirections = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let restart = 0; restart < 6000; restart++) {
    const direction = restart % 4 === 0
      ? axisDirections[Math.floor(restart / 4) % axisDirections.length]
      : randomDirection(random);
    const halfLength = (count - 1) * bondLength / 2;
    const extents = direction.map(v => Math.abs(v) * halfLength + radius);
    if (extents.some((extent, axis) => 2 * extent > box[axis])) continue;
    const center = box.map((length, axis) => extents[axis] + random() * (length - 2 * extents[axis]));
    const points = Array.from({ length: count }, (_, index) => center.map((value, axis) => value + (index - (count - 1) / 2) * bondLength * direction[axis]));
    if (points.some(point => grid.overlaps(point, radius))) continue;
    return points;
  }
  throw new Error('Could not place a straight polymer without overlap. Increase the box size or reduce the polymer count or length.');
}
function buildCurvedChain(count, bondLength, box, radius, random, grid, tether) {
  let a = tether.beadA - 1, b = tether.beadB - 1;
  if (a > b) [a, b] = [b, a];
  const segments = b - a, distance = tether.length;
  if (segments === 1 || Math.abs(distance - segments * bondLength) < 1e-8) return buildLinearChain(count, bondLength, box, radius, random, grid);

  // A sinusoidal/helical bridge: every step has length bondLength and the
  // integer number of turns makes the wave close at the second anchor.
  const axialStep = distance / segments;
  const waveStep = Math.sqrt(Math.max(0, bondLength * bondLength - axialStep * axialStep));
  const makeLocal = offsets => {
    const local = Array.from({ length: count }, (_, i) => {
      if (i < a) return [-(a - i) * bondLength, 0, 0];
      if (i <= b) return offsets[i - a];
      return [distance + (i - b) * bondLength, 0, 0];
    });
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    local.forEach(point => point.forEach((v, axis) => { mins[axis] = Math.min(mins[axis], v); maxs[axis] = Math.max(maxs[axis], v); }));
    return { local, spans: maxs.map((v, axis) => v - mins[axis] + 2 * radius) };
  };
  const makeConformation = turns => {
    const offsets = [[0, 0, 0]];
    let waveY = 0, waveZ = 0;
    for (let i = 0; i < segments; i++) {
      const phase = 2 * Math.PI * turns * i / segments;
      waveY += waveStep * Math.cos(phase);
      waveZ += waveStep * Math.sin(phase);
      offsets.push([axialStep * (i + 1), waveY, waveZ]);
    }
    // Remove accumulated floating point drift so the anchors close exactly.
    const driftY = offsets[segments][1], driftZ = offsets[segments][2];
    offsets.forEach((point, i) => { point[1] -= driftY * i / segments; point[2] -= driftZ * i / segments; });
    return makeLocal(offsets);
  };
  const makeZigzagConformation = () => {
    const transverse = [];
    const pairs = segments % 2 === 0 ? segments / 2 : (segments - 3) / 2;
    for (let pair = 0; pair < pairs; pair++) transverse.push([waveStep, 0], [-waveStep, 0]);
    if (segments % 2) {
      transverse.push([waveStep, 0], [waveStep * Math.cos(2 * Math.PI / 3), waveStep * Math.sin(2 * Math.PI / 3)], [waveStep * Math.cos(4 * Math.PI / 3), waveStep * Math.sin(4 * Math.PI / 3)]);
    }
    const offsets = [[0, 0, 0]];
    transverse.forEach(([y, z], i) => offsets.push([axialStep * (i + 1), offsets[i][1] + y, offsets[i][2] + z]));
    const driftY = offsets[segments][1], driftZ = offsets[segments][2];
    offsets.forEach((point, i) => { point[1] -= driftY * i / segments; point[2] -= driftZ * i / segments; });
    return makeLocal(offsets);
  };

  const fitsAxisAligned = spans => {
    const sortedSpans = [...spans].sort((x, y) => x - y);
    const sortedBox = [...box].sort((x, y) => x - y);
    return sortedSpans.every((span, axis) => span <= sortedBox[axis]);
  };
  const maxTurns = Math.max(1, Math.floor(segments / 2));
  const conformations = [makeZigzagConformation(), ...Array.from({ length: maxTurns }, (_, i) => makeConformation(i + 1))];
  // Prefer the compact bead-by-bead zigzag. Multi-wave curves are fallbacks
  // when that zigzag would overlap itself or does not fit the box.
  const fittingConformations = conformations.filter(shape => fitsAxisAligned(shape.spans));
  const candidates = (fittingConformations.length ? fittingConformations : conformations
    .sort((left, right) => Math.max(...left.spans) - Math.max(...right.spans)))
    .slice(0, 24);

  // Keep candidate waves that do not fold back through their own beads.
  const diameter = radius * 2;
  const hasSelfOverlap = points => {
    for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
      const dx = points[i][0] - points[j][0], dy = points[i][1] - points[j][1], dz = points[i][2] - points[j][2];
      if (dx * dx + dy * dy + dz * dz < diameter * diameter - 1e-10) return true;
    }
    return false;
  };

  // Axis-aligned placements are especially useful in long, narrow boxes.
  const axisDirections = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const { local } of candidates) {
    if (hasSelfOverlap(local)) continue;
    for (let restart = 0; restart < 3000; restart++) {
      const direction = restart % 4 === 0
        ? axisDirections[Math.floor(restart / 4) % axisDirections.length]
        : randomDirection(random);
      const helper = Math.abs(direction[2]) < .85 ? [0, 0, 1] : [0, 1, 0];
      let sideways = [direction[1] * helper[2] - direction[2] * helper[1], direction[2] * helper[0] - direction[0] * helper[2], direction[0] * helper[1] - direction[1] * helper[0]];
      const norm = Math.hypot(...sideways); sideways = sideways.map(v => v / norm);
      const secondSideways = [direction[1] * sideways[2] - direction[2] * sideways[1], direction[2] * sideways[0] - direction[0] * sideways[2], direction[0] * sideways[1] - direction[1] * sideways[0]];
      const points = local.map(([x, y, z]) => direction.map((v, axis) => v * x + sideways[axis] * y + secondSideways[axis] * z));
      const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
      points.forEach(point => point.forEach((v, axis) => { mins[axis] = Math.min(mins[axis], v); maxs[axis] = Math.max(maxs[axis], v); }));
      const spans = maxs.map((v, axis) => v - mins[axis] + 2 * radius);
      if (spans.some((span, axis) => span > box[axis])) continue;
      const shift = box.map((length, axis) => radius - mins[axis] + random() * (length - spans[axis]));
      const placed = points.map(point => point.map((v, axis) => v + shift[axis]));
      if (placed.some(point => grid.overlaps(point, radius))) continue;
      return placed;
    }
  }
  throw new Error('Could not place a non-overlapping wavy tethered polymer. Try a different anchor separation or a larger box.');
}
function assignTypes(beadCount, typeCount, inputMap) {
  const assigned = Array.from({ length: typeCount + 1 }, () => new Set());
  for (let type = 2; type <= typeCount; type++) {
    const parsed = parseIndices(inputMap[type] || '', beadCount);
    if (parsed.invalid.length) throw new Error(`Type ${type} has invalid bead indices: ${parsed.invalid.join(', ')}`);
    for (const bead of parsed.result) {
      for (let other = 2; other <= typeCount; other++) if (other !== type && assigned[other].has(bead)) throw new Error(`Bead ${bead} is assigned to multiple types.`);
      assigned[type].add(bead);
    }
  }
  return assigned;
}
function addRandomParticles(counts, typeOffset, box, radius, random, grid, atoms) {
  const typeIds = [];
  counts.forEach((count, i) => { for (let j = 0; j < count; j++) typeIds.push(typeOffset + i + 1); });
  for (let i = typeIds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [typeIds[i], typeIds[j]] = [typeIds[j], typeIds[i]]; }
  for (const type of typeIds) {
    let point = null;
    for (let attempt = 0; attempt < 5000; attempt++) { const candidate = [radius + random() * (box[0] - 2 * radius), radius + random() * (box[1] - 2 * radius), radius + random() * (box[2] - 2 * radius)]; if (!grid.overlaps(candidate, radius)) { point = candidate; break; } }
    if (!point) throw new Error('Could not place all free beads without overlap. Increase the box size or reduce particle count.');
    atoms.push({ mol: 0, type, charge: 0, point }); grid.add(point, radius);
  }
}
function generateData(d) {
  const box = d.box;
  const polymerBeadSize = d.system === 'hybrid' ? d.polymerBeadSize : d.beadSize;
  const freeBeadSize = d.system === 'hybrid' ? d.ljBeadSize : d.beadSize;
  const maxBeadSize = Math.max(polymerBeadSize || 0, freeBeadSize || 0);
  if (!(polymerBeadSize > 0) || !(freeBeadSize > 0)) throw new Error('Bead sizes must be greater than zero.');
  if (!box.every(x => Number.isFinite(x) && x >= maxBeadSize)) throw new Error('Each box dimension must be at least the largest bead size.');
  const random = mulberry32(Math.floor(d.seed) || 1), grid = spatialGrid(maxBeadSize), atoms = [], bonds = [], angles = [];
  let atomTypeCount, massList;
  if (d.system === 'particles') {
    atomTypeCount = d.typeCounts.length; massList = d.masses;
    if (!Number.isInteger(d.totalBeads) || d.totalBeads < 1 || d.typeCounts.some(x => !Number.isInteger(x) || x < 0) || d.typeCounts.reduce((a, b) => a + b, 0) !== d.totalBeads) throw new Error('Use whole-number bead counts that add up to the total.');
    addRandomParticles(d.typeCounts, 0, box, d.beadSize / 2, random, grid, atoms);
  } else {
    const chains = d.polymerCount, beadsPerChain = d.beadsPerPolymer;
    if (!Number.isInteger(chains) || chains < 1 || !Number.isInteger(beadsPerChain) || beadsPerChain < 2) throw new Error('Enter a positive polymer count and at least two beads per polymer.');
    if (!(d.bondLength >= polymerBeadSize)) throw new Error('Polymer bond length must be at least the polymer bead size to prevent overlaps between bonded beads.');
    let polymerTypes, polymerMasses, particleCounts = [];
    if (d.system === 'polymer') { polymerTypes = d.typeCount; polymerMasses = d.masses; }
    else {
      polymerTypes = d.polymerTypeCount; polymerMasses = d.polymerMasses; particleCounts = d.ljTypeCounts;
      if (!Number.isInteger(d.freeBeads) || d.freeBeads < 0 || particleCounts.some(x => !Number.isInteger(x) || x < 0) || particleCounts.reduce((a, b) => a + b, 0) !== d.freeBeads) throw new Error('LJ particle type counts must be whole numbers that add up to the free-particle total.');
    }
    const assignments = assignTypes(beadsPerChain, polymerTypes, d.indices || d.polymerIndices || {});
    atomTypeCount = polymerTypes + particleCounts.length;
    massList = polymerMasses.concat(d.system === 'hybrid' ? d.ljMasses : []);
    for (let chainId = 0; chainId < chains; chainId++) {
      const polymerRadius = polymerBeadSize / 2;
      const coordinates = d.tether?.mode === 'two' ? buildCurvedChain(beadsPerChain, d.bondLength, box, polymerRadius, random, grid, d.tether) : buildLinearChain(beadsPerChain, d.bondLength, box, polymerRadius, random, grid);
      const firstAtom = atoms.length + 1;
      coordinates.forEach((point, index) => {
        let type = 1;
        for (let t = 2; t <= polymerTypes; t++) if (assignments[t].has(index + 1)) { type = t; break; }
        atoms.push({ mol: chainId + 1, type, charge: 0, point }); grid.add(point, polymerRadius);
      });
      for (let i = 0; i < beadsPerChain - 1; i++) bonds.push([1, firstAtom + i, firstAtom + i + 1]);
      for (let i = 0; i < beadsPerChain - 2; i++) angles.push([1, firstAtom + i, firstAtom + i + 1, firstAtom + i + 2]);
    }
    if (d.system === 'hybrid') addRandomParticles(particleCounts, polymerTypes, box, freeBeadSize / 2, random, grid, atoms);
  }
  const f = n => Number(n).toFixed(6);
  const tetherNote = d.tether?.mode === 'one' ? `; initial tether bead ${d.tether.bead}` : d.tether?.mode === 'two' ? `; initial wavy tether beads ${d.tether.beadA},${d.tether.beadB} at separation ${d.tether.length}` : '';
  const lines = [`LAMMPS Description - generated by Structure${tetherNote}`, '', `${atoms.length} atoms`, `${bonds.length} bonds`, `${angles.length} angles`, '0 dihedrals', '0 impropers', '', `${atomTypeCount} atom types`, `${bonds.length ? 1 : 0} bond types`, `${angles.length ? 1 : 0} angle types`, '0 dihedral types', '0 improper types', '', `0 ${f(box[0])} xlo xhi`, `0 ${f(box[1])} ylo yhi`, `0 ${f(box[2])} zlo zhi`, '', 'Masses', ''];
  massList.forEach((mass, i) => lines.push(`${i + 1} ${Number(mass).toFixed(6)}`));
  lines.push('', 'Atoms # full', '');
  atoms.forEach((atom, i) => lines.push(`${i + 1} ${atom.mol} ${atom.type} ${atom.charge} ${f(atom.point[0])} ${f(atom.point[1])} ${f(atom.point[2])}`));
  if (bonds.length) { lines.push('', 'Bonds', ''); bonds.forEach((b, i) => lines.push(`${i + 1} ${b[0]} ${b[1]} ${b[2]}`)); }
  if (angles.length) { lines.push('', 'Angles', ''); angles.forEach((a, i) => lines.push(`${i + 1} ${a[0]} ${a[1]} ${a[2]} ${a[3]}`)); }
  return lines.join('\n') + '\n';
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); }
$('#saveBtn').addEventListener('click', () => { localStorage.setItem('structureDraft', JSON.stringify(collect())); toast('Draft saved in this browser.'); });
$('#generateBtn').addEventListener('click', () => {
  const status = $('#generationStatus');
  try {
    const data = collect();
    if (data.system === 'particles' && !particleCountsValid) throw new Error('Set bead type counts to match the total.');
    if (data.system === 'polymer' && !polymerAssignmentsValid) throw new Error('Fix overlapping or invalid polymer bead type assignments.');
    if (data.system === 'hybrid' && !hybridPolymerAssignmentsValid) throw new Error('Fix polymer bead type assignments.');
    if (data.system === 'hybrid' && !hybridCountsValid) throw new Error('Set LJ type counts to match the total free-particle count.');
    if (data.system !== 'particles' && !tetherValid) throw new Error('Fix the tether bead numbers or separation before generating.');
    const text = generateData(data), url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), link = document.createElement('a');
    link.href = url; link.download = 'system.data'; link.click();
    const atomCount = data.system === 'particles' ? data.totalBeads : data.polymerCount * data.beadsPerPolymer + (data.system === 'hybrid' ? data.freeBeads : 0);
    const typeCount = data.system === 'particles' ? data.typeCounts.length : data.system === 'polymer' ? data.typeCount : data.polymerTypeCount + data.ljTypeCounts.length;
    status.className = 'preview-note success';
    status.innerHTML = `Generated ${atomCount.toLocaleString()} atoms with ${typeCount} atom types. <a class="generated-link" href="${url}" download="system.data">Download system.data</a>`;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { status.className = 'preview-note error'; status.textContent = error.message; }
});

const CALC_UNIT_STYLES = {
  real: { length: 'Å', hint: 'Real: box lengths are in Å; molecule concentration is reported in µmol/L and mmol/L.' },
  lj: { length: 'σ', hint: 'LJ: box lengths are in σ. Enter the physical σ in nm to report concentration in µmol/L and mmol/L.' },
};
const AVOGADRO = 6.02214076e23;
const numberFormat = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });
function positiveNumber(id) {
  const value = Number($(`#${id}`).value);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function positiveInteger(id) {
  const value = Number($(`#${id}`).value);
  return Number.isInteger(value) && value > 0 ? value : null;
}
function updateCalculators() {
  const style = CALC_UNIT_STYLES[$('#calcUnits').value] || CALC_UNIT_STYLES.real;
  $$('.calcLengthUnit').forEach(unit => { unit.textContent = `(${style.length})`; });
  $('#calcUnitHint').textContent = style.hint;
  const realUnits = $('#calcUnits').value !== 'lj';
  $('#ljSigmaField').hidden = realUnits;

  const densityPolymers = positiveInteger('densityPolymerCount');
  const densityX = positiveNumber('densityBoxX');
  const densityY = positiveNumber('densityBoxY');
  const densityZ = positiveNumber('densityBoxZ');
  const ljSigmaNm = positiveNumber('ljSigmaNm');
  if (!densityPolymers || !densityX || !densityY || !densityZ) $('#densityResult').textContent = 'Enter a positive molecule count and X, Y, and Z lengths';
  else if (!realUnits && !ljSigmaNm) $('#densityResult').textContent = 'Enter a positive physical σ in nm to calculate molar concentration';
  else {
    const volumeLiters = realUnits
      ? densityX * densityY * densityZ * 1e-27
      : densityX * densityY * densityZ * ljSigmaNm ** 3 * 1e-24;
    const molPerLiter = densityPolymers / (AVOGADRO * volumeLiters);
    $('#densityResult').textContent = `${numberFormat.format(molPerLiter * 1e6)} µmol/L · ${numberFormat.format(molPerLiter * 1e3)} mmol/L`;
  }

}

['densityPolymerCount', 'densityBoxX', 'densityBoxY', 'densityBoxZ', 'ljSigmaNm'].forEach(id => $(`#${id}`).addEventListener('input', updateCalculators));
$('#calcUnits').addEventListener('change', updateCalculators);

function syncPageFromHash() {
  const requestedPage = window.location.hash.slice(1);
  const page = ['calculations', 'contact'].includes(requestedPage) ? requestedPage : 'structure';
  $('#structurePage').hidden = page !== 'structure';
  $('#calculationsPage').hidden = page !== 'calculations';
  $('#contactPage').hidden = page !== 'contact';
  $$('[data-page-link]').forEach(link => {
    if (link.dataset.pageLink === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', syncPageFromHash);

function init() {
  renderCountRows('#particleTypeRows', Number($('#particleTypeCount').value), Number($('#particleTotal').value), 'data-count', 'data-mass');
  renderRangeRows('#polymerTypeRows', '#polymerTypeCount', 'data-poly-indices', 'data-mass');
  renderRangeRows('#hybridPolymerTypeRows', '#hybridPolymerTypeCount', 'data-hybrid-poly-indices', 'data-hybrid-poly-mass');
  renderCountRows('#hybridLJTypeRows', Number($('#hybridLJTypeCount').value), Number($('#freeBeadCount').value), 'data-hybrid-lj-count', 'data-hybrid-lj-mass');
  const saved = localStorage.getItem('structureDraft');
  if (saved) {
    try {
      const d = JSON.parse(saved); state.units = d.units === 'lj' ? 'lj' : 'real'; state.system = ['particles', 'polymer', 'hybrid'].includes(d.system) ? d.system : 'polymer';
      if (d.totalBeads) $('#particleTotal').value = d.totalBeads;
      if (d.typeCounts) { $('#particleTypeCount').value = String(d.typeCounts.length); renderCountRows('#particleTypeRows', d.typeCounts.length, d.totalBeads, 'data-count', 'data-mass'); d.typeCounts.forEach((v, i) => { $(`[data-count="${i}"]`).value = v; }); d.masses?.forEach((v, i) => { $(`[data-mass="${i + 1}"]`).value = v; }); }
      if (d.polymerCount) { $('#polymerCount').value = d.polymerCount; $('#hybridPolymerCount').value = d.polymerCount; }
      if (d.beadsPerPolymer) { $('#beadsPerPolymer').value = d.beadsPerPolymer; $('#hybridBeadsPerPolymer').value = d.beadsPerPolymer; }
      if (d.typeCount) { $('#polymerTypeCount').value = String(d.typeCount); renderRangeRows('#polymerTypeRows', '#polymerTypeCount', 'data-poly-indices', 'data-mass'); Object.entries(d.indices || {}).forEach(([t, v]) => { $(`[data-poly-indices="${t}"]`).value = v; }); d.masses.forEach((v, i) => { $(`#polymerTypeRows [data-mass="${i + 1}"]`).value = v; }); }
      if (d.polymerTypeCount) { $('#hybridPolymerTypeCount').value = String(d.polymerTypeCount); renderRangeRows('#hybridPolymerTypeRows', '#hybridPolymerTypeCount', 'data-hybrid-poly-indices', 'data-hybrid-poly-mass'); Object.entries(d.polymerIndices || {}).forEach(([t, v]) => { $(`[data-hybrid-poly-indices="${t}"]`).value = v; }); d.polymerMasses.forEach((v, i) => { $(`[data-hybrid-poly-mass="${i + 1}"]`).value = v; }); }
      if (d.freeBeads !== undefined) $('#freeBeadCount').value = d.freeBeads;
      if (d.ljTypeCounts) { $('#hybridLJTypeCount').value = String(d.ljTypeCounts.length); renderCountRows('#hybridLJTypeRows', d.ljTypeCounts.length, d.freeBeads, 'data-hybrid-lj-count', 'data-hybrid-lj-mass'); d.ljTypeCounts.forEach((v, i) => { $(`[data-hybrid-lj-count="${i}"]`).value = v; }); d.ljMasses.forEach((v, i) => { $(`[data-hybrid-lj-mass="${i}"]`).value = v; }); }
      if (d.beadSize) $('#beadSize').value = d.beadSize; if (d.bondLength) $('#bondLength').value = d.bondLength;
      if (d.polymerBeadSize !== undefined) $('#hybridPolymerBeadSize').value = d.polymerBeadSize;
      if (d.ljBeadSize !== undefined) $('#hybridLJBeadSize').value = d.ljBeadSize;
      if (d.system === 'hybrid' && d.bondLength !== undefined) $('#hybridBondLength').value = d.bondLength;
      if (d.tether) { $('#tetherMode').value = d.tether.mode || 'none'; if (d.tether.bead !== undefined) $('#tetherBead').value = d.tether.bead; if (d.tether.beadA !== undefined) $('#tetherBeadA').value = d.tether.beadA; if (d.tether.beadB !== undefined) $('#tetherBeadB').value = d.tether.beadB; if (d.tether.length !== undefined) $('#tetherLength').value = d.tether.length; }
      if (d.box) [$('#boxX').value, $('#boxY').value, $('#boxZ').value] = d.box; if (d.seed) $('#randomSeed').value = d.seed;
      $$('[data-unit]').forEach(x => { x.classList.toggle('selected', x.dataset.unit === state.units); x.setAttribute('aria-pressed', String(x.dataset.unit === state.units)); });
      $$('[data-system]').forEach(x => { x.classList.toggle('selected', x.dataset.system === state.system); x.setAttribute('aria-pressed', String(x.dataset.system === state.system)); });
    } catch { localStorage.removeItem('structureDraft'); }
  }
  update();
  updateCalculators();
  syncPageFromHash();
}
init();
