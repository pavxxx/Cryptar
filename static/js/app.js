/* ═══════════════════════════════════════════════════════════
   CryptArithmetic Front-end — app.js
═══════════════════════════════════════════════════════════ */

"use strict";

// ── Global state ──────────────────────────────────────────
const state = {
  // Play tab
  puzzle:     null,   // {words, result, letters, text}
  solution:   null,   // {LETTER: digit}
  mapping:    {},     // user's current mapping
  history:    [],     // undo stack
  hintsUsed:  0,
  score:      1000,
  timerSec:   0,
  timerHandle:null,
  solved:     false,
  difficulty: 'easy',

  // Session stats
  totalSolved: 0,
  streak:      0,
  bestStreak:  0,

  // AI tab
  aiSteps:       [],
  aiNodeMap:     {},   // node_id -> node obj (for tree)
  aiAnimHandle:  null,
  aiPaused:      false,
  aiStepIdx:     0,
  aiSpeed:       5,
  aiPuzzle:      null,
  aiSolution:    null,

  // Analytics
  solveHistory: [],    // persisted in localStorage
  totalAttempts: 0,
  correctMoves: 0,
  wrongMoves:   0,
};

// ── Load persisted stats ──────────────────────────────────
function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem('cryptarithm_stats') || '{}');
    state.totalSolved  = saved.totalSolved  || 0;
    state.bestStreak   = saved.bestStreak   || 0;
    state.solveHistory = saved.solveHistory || [];
    state.totalAttempts = saved.totalAttempts || 0;
    state.correctMoves  = saved.correctMoves || 0;
    state.wrongMoves    = saved.wrongMoves   || 0;
    $('h-solved').textContent = state.totalSolved;
  } catch(e) {}
}

function saveStats() {
  try {
    localStorage.setItem('cryptarithm_stats', JSON.stringify({
      totalSolved:  state.totalSolved,
      bestStreak:   state.bestStreak,
      solveHistory: state.solveHistory.slice(-50), // keep last 50 only
      totalAttempts: state.totalAttempts,
      correctMoves:  state.correctMoves,
      wrongMoves:    state.wrongMoves,
    }));
  } catch(e) {}
}

// ── DOM refs ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utility ───────────────────────────────────────────────
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}

function setMessage(msg, type = '') {
  const bar = $('message-bar');
  bar.textContent = msg;
  bar.className = `message-bar ${type}`;
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function api(endpoint, opts = {}) {
  const res = await fetch(endpoint, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'ai') initAiTab();
    if (btn.dataset.tab === 'compare') initCompareTab();
    if (btn.dataset.tab === 'stats') renderStatsTab();
  });
});

// ── Difficulty selection ──────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.difficulty = btn.dataset.diff;
    $('play-difficulty').textContent = btn.dataset.diff.charAt(0).toUpperCase() + btn.dataset.diff.slice(1);
    loadPuzzle();
  });
});

// ═══════════════════════════════════════════════════════════
//  PLAY TAB
// ═══════════════════════════════════════════════════════════

async function loadPuzzle(data) {
  // If data not given, fetch from API
  if (!data) data = await api(`/api/puzzle?difficulty=${state.difficulty}`);
  if (data.error) { toast('Failed to load puzzle', 'error'); return; }

  state.puzzle   = data;
  state.solution = null;
  state.mapping  = {};
  state.history  = [];
  state.hintsUsed = 0;
  state.score    = 1000;
  state.solved   = false;

  // Fetch solution separately (so we can validate)
  const solRes = await api('/api/solution', {
    method: 'POST',
    body: JSON.stringify({ words: data.words, result: data.result }),
  });
  state.solution = solRes.solution;

  renderPuzzle();
  startTimer();
  setMessage('Game started — assign digits to each letter!');
  $('play-hints').textContent  = 0;
  $('play-score').textContent  = 1000;
  $('play-letters').textContent = data.letters.length;
  updateMappingPreview();
}

function renderPuzzle() {
  const { puzzle } = state;
  $('equation-display').textContent = puzzle.text;

  const grid = $('letter-grid');
  grid.innerHTML = '';

  puzzle.letters.forEach(letter => {
    const card = document.createElement('div');
    card.className = 'letter-card';
    card.id = `lc-${letter}`;

    const lbl = document.createElement('div');
    lbl.className = 'letter-label';
    lbl.textContent = letter;

    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 0; inp.max = 9;
    inp.className = 'letter-input';
    inp.id = `li-${letter}`;
    inp.placeholder = '?';
    inp.addEventListener('change', () => handleMove(letter, inp.value));
    inp.addEventListener('input',  () => {
      if (inp.value.length > 1) inp.value = inp.value.slice(-1);
    });

    const status = document.createElement('div');
    status.className = 'letter-status';
    status.id = `ls-${letter}`;

    card.append(lbl, inp, status);
    grid.appendChild(card);
  });
}

async function handleMove(letter, rawVal) {
  if (rawVal === '' || rawVal === null) {
    delete state.mapping[letter];
    const card = $(`lc-${letter}`);
    if (card) {
      card.classList.remove('correct', 'wrong', 'warn');
      $(`ls-${letter}`).textContent = '';
    }
    updateMappingPreview();
    return;
  }
  const digit = parseInt(rawVal, 10);
  if (isNaN(digit) || digit < 0 || digit > 9) return;

  state.history.push({ ...state.mapping });
  state.totalAttempts++;

  const res = await api('/api/validate', {
    method: 'POST',
    body: JSON.stringify({
      words: state.puzzle.words, result: state.puzzle.result,
      mapping: state.mapping, solution: state.solution,
      letter, digit,
    }),
  });

  const card   = $(`lc-${letter}`);
  const status = $(`ls-${letter}`);
  card.classList.remove('correct', 'wrong', 'warn');

  if (res.status === 'error') {
    card.classList.add('wrong');
    status.textContent = '✗';
    setMessage(res.message, 'error');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
    // revert input
    $(`li-${letter}`).value = state.mapping[letter] ?? '';
    state.wrongMoves++;
    saveStats();
    return;
  }

  state.mapping[letter] = digit;

  if (res.status === 'correct') {
    card.classList.add('correct'); status.textContent = '✓';
    setMessage(res.message, 'success');
    state.correctMoves++;
  } else if (res.status === 'wrong') {
    card.classList.add('warn'); status.textContent = '?';
    setMessage(res.message, 'warn');
    state.score = Math.max(0, state.score - 50);
    $('play-score').textContent = state.score;
    state.wrongMoves++;
  } else {
    status.textContent = '…';
    setMessage(res.message);
  }

  saveStats();
  updateMappingPreview();
  checkPuzzleComplete();
}

function checkPuzzleComplete() {
  const { puzzle, mapping, solution } = state;
  if (!solution) return;
  if (puzzle.letters.every(l => mapping[l] !== undefined && mapping[l] === solution[l])) {
    celebrateSolve();
  }
}

function celebrateSolve() {
  state.solved = true;
  stopTimer();
  state.totalSolved++;
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  $('h-solved').textContent = state.totalSolved;
  $('h-streak').textContent = state.streak;
  setMessage('🎉 Puzzle Solved! Congratulations!', 'success');
  toast('🎉 Excellent! Puzzle solved!', 'success');
  spawnConfetti();

  // Record to history
  state.solveHistory.push({
    puzzle: state.puzzle.text,
    time: state.timerSec,
    score: state.score,
    hints: state.hintsUsed,
    difficulty: state.difficulty,
    date: new Date().toISOString(),
  });
  saveStats();
}

function updateMappingPreview() {
  const prev = $('mapping-preview');
  prev.innerHTML = '';
  Object.entries(state.mapping).forEach(([l, d]) => {
    const chip = document.createElement('div');
    const sol = state.solution;
    const correct = sol && sol[l] === d;
    chip.className = `mp-chip ${correct ? 'correct' : ''}`;
    chip.textContent = `${l}=${d}`;
    prev.appendChild(chip);
  });
}

// Timer
function startTimer() {
  stopTimer();
  state.timerSec = 0;
  $('play-timer').textContent = '00:00';
  state.timerHandle = setInterval(() => {
    if (state.solved) return;
    state.timerSec++;
    $('play-timer').textContent = formatTime(state.timerSec);
  }, 1000);
}
function stopTimer() { clearInterval(state.timerHandle); }

// Hint
$('btn-hint').addEventListener('click', async () => {
  if (!state.puzzle || state.solved) return;
  const res = await api('/api/hint', {
    method: 'POST',
    body: JSON.stringify({
      solution: state.solution, mapping: state.mapping,
      letters: state.puzzle.letters,
    }),
  });
  if (res.letter !== undefined) {
    state.history.push({ ...state.mapping });
    state.mapping[res.letter] = res.digit;
    const inp = $(`li-${res.letter}`);
    if (inp) { inp.value = res.digit; }
    const card = $(`lc-${res.letter}`);
    if (card) {
      card.classList.remove('wrong','warn');
      card.classList.add('correct');
      $(`ls-${res.letter}`).textContent = '✓';
    }
    state.hintsUsed++;
    state.score = Math.max(0, state.score - 100);
    $('play-hints').textContent = state.hintsUsed;
    $('play-score').textContent = state.score;
    setMessage(res.message, 'success');
    updateMappingPreview();
    checkPuzzleComplete();
  }
  toast(res.message || 'No more hints available!');
});

// Undo
$('btn-undo').addEventListener('click', () => {
  if (!state.history.length) { toast('Nothing to undo'); return; }
  state.mapping = state.history.pop();
  // Re-render inputs from mapping
  state.puzzle.letters.forEach(l => {
    const inp  = $(`li-${l}`);
    const card = $(`lc-${l}`);
    const st   = $(`ls-${l}`);
    if (!inp) return;
    const d = state.mapping[l];
    inp.value = d !== undefined ? d : '';
    card.classList.remove('correct','wrong','warn');
    if (d !== undefined && state.solution && state.solution[l] === d) {
      card.classList.add('correct'); st.textContent = '✓';
    } else { st.textContent = ''; }
  });
  setMessage('↩ Move undone');
  updateMappingPreview();
});

// Check all
$('btn-check').addEventListener('click', () => {
  if (!state.puzzle) return;
  
  let allFilled = true;
  let allCorrect = true;

  state.puzzle.letters.forEach(l => {
    const val = $(`li-${l}`).value;
    if (val === '') {
      allFilled = false;
    } else if (state.solution && parseInt(val, 10) !== state.solution[l]) {
      allCorrect = false;
    }
  });

  if (!allFilled) { 
    toast('⚠ Fill in all letters first!', 'error'); 
    return; 
  }

  if (allCorrect) {
    if (!state.solved) celebrateSolve();
  } else {
    toast('Some assignments are incorrect. Keep trying!', 'error');
    setMessage('Puzzle is not solved yet. Look for red/yellow warnings.', 'error');
    const btn = $('btn-check');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
  }
});

// New puzzle
$('btn-new').addEventListener('click', () => { state.streak = 0; $('h-streak').textContent = 0; loadPuzzle(); });

// Custom puzzle
$('btn-custom').addEventListener('click', () => {
  $('modal-custom').classList.add('open');
  $('custom-input').focus();
});
$('modal-close').addEventListener('click', closeModal);
$('btn-modal-cancel').addEventListener('click', closeModal);
$('modal-custom').addEventListener('click', e => { if (e.target === $('modal-custom')) closeModal(); });
function closeModal() { $('modal-custom').classList.remove('open'); }

$('btn-modal-load').addEventListener('click', () => {
  const raw   = $('custom-input').value.trim().toUpperCase();
  const errEl = $('custom-error');
  errEl.textContent = '';
  if (!raw.includes('=') || !raw.includes('+')) {
    errEl.textContent = 'Invalid format. Use WORD1 + WORD2 = RESULT'; return;
  }
  const [lhs, result] = raw.split('=').map(s => s.trim());
  const words = lhs.split('+').map(s => s.trim());
  if (words.some(w => !w) || !result) { errEl.textContent = 'Incomplete puzzle'; return; }
  const letters = [...new Set((words.join('') + result).split(''))];
  if (letters.length > 10) { errEl.textContent = 'Too many unique letters (max 10)'; return; }
  if (!/^[A-Z]+$/.test(words.join('') + result)) { errEl.textContent = 'Use uppercase letters only'; return; }
  closeModal();
  loadPuzzle({ words, result, letters, text: `${words.join(' + ')} = ${result}`, name: raw });
});

// ═══════════════════════════════════════════════════════════
//  AI LEARNER TAB
// ═══════════════════════════════════════════════════════════

let presetsLoaded = false;
async function initAiTab() {
  if (presetsLoaded) return;
  presetsLoaded = true;
  const presets = await api('/api/presets');
  const sel = $('ai-puzzle-select');
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    const diffTag = p.difficulty ? ` [${p.difficulty.toUpperCase()}]` : '';
    opt.textContent = p.name + diffTag;
    sel.appendChild(opt);
  });
  sel._presets = presets;
  
  if (presets.length > 0) {
    state.aiPuzzle = presets[0];
    $('ai-equation-display').textContent = presets[0].text;
  }
}

$('btn-ai-random').addEventListener('click', async () => {
  const data = await api('/api/puzzle');
  if (data.error) { toast('Could not generate puzzle', 'error'); return; }
  state.aiPuzzle = data;
  $('ai-equation-display').textContent = data.text;
  clearAiState();
});

$('ai-puzzle-select').addEventListener('change', function () {
  const presets = this._presets;
  if (!presets) return;
  const p = presets[+this.value];
  state.aiPuzzle = p;
  $('ai-equation-display').textContent = p.text;
  clearAiState();
});

function clearAiState() {
  stopAi();
  state.aiSteps   = [];
  state.aiStepIdx = 0;
  state.aiNodeMap = {};
  $('ai-step-cur').textContent   = 0;
  $('ai-step-total').textContent = 0;
  $('ai-step-msg').textContent   = '—';
  $('ai-progress-fill').style.width = '0%';
  $('ai-mapping-table').innerHTML  = '';
  $('step-log').innerHTML          = '';
  $('tree-placeholder').style.display = 'flex';
  $('ai-concept-badge').innerHTML = '';
  $('concept-explain').textContent = 'Select a puzzle and press Start to see AI concepts explained step by step.';
  $('btn-ai-step').disabled = true;
  treeRenderer.clear();
}

$('btn-ai-start').addEventListener('click', async () => {
  if (!state.aiPuzzle) { toast('Select a puzzle first', 'error'); return; }
  if (state.aiSteps.length === 0) {
    // Fetch steps
    toast('Loading AI solver…');
    const res = await api('/api/solve', {
      method: 'POST',
      body: JSON.stringify({
        words:     state.aiPuzzle.words,
        result:    state.aiPuzzle.result,
        max_steps: 15000,
      }),
    });
    if (!res.steps || !res.steps.length) { toast('Could not solve puzzle', 'error'); return; }
    state.aiSteps   = res.steps;
    state.aiSolution = res.solution;
    state.aiStepIdx = 0;
    $('ai-step-total').textContent = res.total_steps;
    // Pre-build tree layout
    treeRenderer.build(res.steps);
    $('tree-placeholder').style.display = 'none';
    $('btn-ai-step').disabled = false;
    if (res.truncated) toast(`Showing first 15000 steps of a longer search`);
  }
  state.aiPaused = false;
  $('btn-ai-pause').disabled = false;
  $('btn-ai-start').disabled = true;
  runAiAnimation();
});

$('btn-ai-pause').addEventListener('click', () => {
  if (!state.aiPaused) {
    state.aiPaused = true;
    clearTimeout(state.aiAnimHandle);
    $('btn-ai-pause').textContent = '▶ Resume';
    $('btn-ai-step').disabled = false;
  } else {
    state.aiPaused = false;
    $('btn-ai-pause').textContent = '⏸ Pause';
    $('btn-ai-step').disabled = true;
    runAiAnimation();
  }
});

// ── Manual step forward ───────────────────────────────────
$('btn-ai-step').addEventListener('click', () => {
  if (state.aiStepIdx >= state.aiSteps.length) return;
  const step = state.aiSteps[state.aiStepIdx];
  processAiStep(step, state.aiStepIdx);
  state.aiStepIdx++;
  if (state.aiStepIdx >= state.aiSteps.length) {
    toast('AI solver finished!', 'success');
    $('btn-ai-start').disabled  = false;
    $('btn-ai-pause').disabled  = true;
    $('btn-ai-step').disabled   = true;
  }
});

$('btn-ai-reset').addEventListener('click', () => {
  if (!state.aiPuzzle) return;
  clearAiState();
  $('btn-ai-start').disabled  = false;
  $('btn-ai-pause').disabled  = true;
  $('btn-ai-pause').textContent = '⏸ Pause';
});

$('speed-slider').addEventListener('input', function () {
  state.aiSpeed = +this.value;
});

function stopAi() {
  state.aiPaused = true;
  clearTimeout(state.aiAnimHandle);
}

function runAiAnimation() {
  if (state.aiPaused) return;
  if (state.aiStepIdx >= state.aiSteps.length) {
    $('btn-ai-start').disabled  = false;
    $('btn-ai-pause').disabled  = true;
    $('btn-ai-step').disabled   = true;
    toast('AI solver finished!', 'success');
    // Auto-fit the whole tree when animation is done
    treeRenderer.fitViewAll();
    return;
  }

  const step = state.aiSteps[state.aiStepIdx];
  processAiStep(step, state.aiStepIdx);
  state.aiStepIdx++;

  // Exponentional speed scale: 1=Slowest (800ms) to 10=Fastest (0ms/Instant)
  const delays = [800, 500, 300, 180, 100, 50, 25, 10, 2, 0];
  const delay = delays[state.aiSpeed - 1] ?? 100;
  
  state.aiAnimHandle = setTimeout(runAiAnimation, delay);
}

function processAiStep(step, idx) {
  const total = state.aiSteps.length;
  $('ai-step-cur').textContent      = idx + 1;
  $('ai-step-msg').textContent      = step.message;
  $('ai-progress-fill').style.width = `${((idx + 1) / total * 100).toFixed(1)}%`;

  // Mapping table
  renderAiMapping(step.mapping, step.letter, step.type);

  // Step log
  addLogEntry(step, idx);

  // Concept badge + explanation
  updateConceptDisplay(step);

  // Highlight node in tree
  treeRenderer.highlightStep(idx);
}

// ── AI Concept Display ────────────────────────────────────
const CONCEPT_INFO = {
  csp_start: {
    badge: 'CSP Initialization',
    badgeClass: 'badge-csp',
    explain: `<strong>Constraint Satisfaction Problem (CSP)</strong> — The solver begins by identifying all unique letters as <strong>variables</strong>, each with a domain of {0-9}. It will try to find an assignment satisfying all constraints: arithmetic correctness, unique digits, no leading zeros.`
  },
  constraint_assignment: {
    badge: 'Variable Assignment',
    badgeClass: 'badge-assign',
    explain: `<strong>Assigning a value</strong> — The solver picks the next unassigned variable and tries a digit from its domain. It uses a <strong>systematic, column-wise ordering</strong> (right to left) so column constraints can be checked early.`
  },
  pruning: {
    badge: 'Constraint Pruning ✂',
    badgeClass: 'badge-prune',
    explain: `<strong>Pruning</strong> — This assignment violates a column constraint! The solver detects this immediately without exploring deeper, eliminating the entire subtree. This is what makes backtracking efficient — entire branches are cut.`
  },
  backtracking: {
    badge: 'Backtracking ↩',
    badgeClass: 'badge-backtrack',
    explain: `<strong>Backtracking</strong> — All values for this variable have been tried and failed. The solver undoes the current assignment and goes back to the previous variable to try its next possible value. This is a depth-first search strategy.`
  },
  success: {
    badge: 'Solution Found ✓',
    badgeClass: 'badge-success',
    explain: `<strong>Solution Found!</strong> — All variables have been assigned valid digits that satisfy every constraint. The arithmetic equation is correct, all digits are unique, and no leading letter is zero.`
  }
};

function updateConceptDisplay(step) {
  const concept = step.concept || (step.type === 'success' ? 'success' : 'constraint_assignment');
  const info = CONCEPT_INFO[concept];
  if (!info) return;

  const badgeEl = $('ai-concept-badge');
  badgeEl.innerHTML = `<span class="badge ${info.badgeClass}">${info.badge}</span>`;

  const explainEl = $('concept-explain');
  explainEl.innerHTML = info.explain;
}

function renderAiMapping(mapping, activeLetter, type) {
  if (!state.aiPuzzle) return;
  const table = $('ai-mapping-table');
  table.innerHTML = '';
  const allLetters = state.aiPuzzle.letters || Object.keys(mapping);
  allLetters.forEach(l => {
    const chip = document.createElement('div');
    const assigned = mapping[l] !== undefined;
    let cls = 'am-chip';
    if (l === activeLetter) cls += type === 'backtrack' ? ' bt' : ' active';
    else if (assigned) cls += ' done';
    chip.className = cls;

    const lDiv = document.createElement('div'); lDiv.className = 'am-letter'; lDiv.textContent = l;
    const dDiv = document.createElement('div'); dDiv.className = 'am-digit';
    dDiv.textContent = assigned ? mapping[l] : '?';

    chip.append(lDiv, dDiv);
    table.appendChild(chip);
  });
}

function addLogEntry(step, idx) {
  const log  = $('step-log');
  const entry = document.createElement('div');
  // Only keep last 80 entries for performance
  while (log.children.length > 79) log.removeChild(log.firstChild);

  // Remove previous 'current' class
  log.querySelectorAll('.current').forEach(e => e.classList.remove('current'));

  entry.className = `log-entry ${step.type} current`;
  entry.textContent = `[${String(idx + 1).padStart(3,' ')}] ${step.message}`;
  log.appendChild(entry);
  entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Tree fit / reset view
$('btn-tree-fit').addEventListener('click', () => treeRenderer.fitViewAll());
$('btn-tree-reset-view').addEventListener('click', () => treeRenderer.resetView());

// ═══════════════════════════════════════════════════════════
//  TREE RENDERER
// ═══════════════════════════════════════════════════════════

class TreeRenderer {
  constructor() {
    this.canvas = $('tree-canvas');
    this.ctx    = this.canvas.getContext('2d');
    this.nodes  = [];          // ordered list
    this.nodeMap = {};         // id → node
    this.currentIdx = -1;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.isDragging = false;
    this.dragStart  = { x: 0, y: 0 };
    this._setupEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const wrap = $('tree-canvas-wrap');
    this.canvas.width  = wrap.clientWidth  || 600;
    this.canvas.height = wrap.clientHeight || 420;
    this.render();
  }

  _setupEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
    });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.transform.x = e.clientX - this.dragStart.x;
      this.transform.y = e.clientY - this.dragStart.y;
      this.render();
    });
    c.addEventListener('mouseup',  () => { this.isDragging = false; });
    c.addEventListener('mouseleave', () => { this.isDragging = false; });

    // FIXED: Only prevent default scroll on the canvas itself,
    // and stop propagation so the rest of the page can scroll
    c.addEventListener('wheel', e => {
      // Only prevent/handle scroll when hovering over the tree canvas
      e.stopPropagation();
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.transform.x = mx - (mx - this.transform.x) * factor;
      this.transform.y = my - (my - this.transform.y) * factor;
      this.transform.scale *= factor;
      this.render();
    }, { passive: false });
  }

  build(steps) {
    this.nodes  = [];
    this.nodeMap = {};
    this.currentIdx = -1;

    // Create node objects
    steps.forEach(step => {
      const node = {
        id: step.node_id, parentId: step.parent_id,
        type: step.type, letter: step.letter, digit: step.digit,
        depth: step.depth, message: step.message,
        children: [], parent: null,
        x: 0, y: 0, visible: false, isCurrent: false,
      };
      this.nodeMap[node.id] = node;
      this.nodes.push(node);
    });

    // Link parents
    this.nodes.forEach(node => {
      if (node.parentId && this.nodeMap[node.parentId]) {
        const par = this.nodeMap[node.parentId];
        par.children.push(node);
        node.parent = par;
      }
    });

    // Layout
    const root = this.nodes.find(n => !n.parent);
    if (root) {
      const xOff = [0];
      this._layout(root, xOff);
      // Don't center to canvas — fitViewAll will handle positioning
    }

    // Fit the ENTIRE tree (all nodes) inside the canvas from the start
    this._resize();             // ensure canvas dimensions are up to date
    this.fitViewAll();
  }

  _layout(node, xOff) {
    const H = 100, W = 72;
    if (node.children.length === 0) {
      node.x = xOff[0] * W; xOff[0]++;
    } else {
      node.children.forEach(c => this._layout(c, xOff));
      const first = node.children[0];
      const last  = node.children[node.children.length - 1];
      node.x = (first.x + last.x) / 2;
    }
    node.y = node.depth * H + 50;
  }

  _centerTree() {
    if (!this.nodes.length) return;
    const xs = this.nodes.map(n => n.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cw  = this.canvas.width / 2;
    this.nodes.forEach(n => { n.x = n.x - mid + cw; });
  }

  // Fit to VISIBLE nodes only
  fitView() {
    const pool = this.nodes.filter(n => n.visible);
    this._fitToNodes(pool.length > 0 ? pool : this.nodes);
  }

  // Fit to ALL nodes (entire tree), regardless of visibility
  fitViewAll() {
    this._fitToNodes(this.nodes);
  }

  _fitToNodes(src) {
    if (!src.length) return;
    const pad  = 60;
    const xs   = src.map(n => n.x);
    const ys   = src.map(n => n.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const tw   = maxX - minX, th = maxY - minY;
    const scale = Math.min(
      this.canvas.width  / tw,
      this.canvas.height / th,
      1.8
    );
    this.transform.scale = scale;
    this.transform.x = -minX * scale + (this.canvas.width  - tw * scale) / 2;
    this.transform.y = -minY * scale + (this.canvas.height - th * scale) / 2;
    this.render();
  }

  resetView() {
    this.transform = { x: 0, y: 0, scale: 1 };
    this.render();
  }

  highlightStep(idx) {
    if (idx < 0 || idx >= this.nodes.length) return;
    this.nodes.forEach(n => { n.isCurrent = false; });
    const node = this.nodes[idx];
    if (node) {
      node.visible = true;
      node.isCurrent = true;
      this.currentIdx = idx;
      let cur = node.parent;
      while (cur) { cur.visible = true; cur = cur.parent; }

      // Auto-pan so the current node stays visible in the canvas
      const sx = node.x * this.transform.scale + this.transform.x;
      const sy = node.y * this.transform.scale + this.transform.y;
      const margin = 80;
      let dx = 0, dy = 0;
      if (sx < margin)                      dx = margin - sx;
      if (sx > this.canvas.width  - margin) dx = (this.canvas.width  - margin) - sx;
      if (sy < margin)                      dy = margin - sy;
      if (sy > this.canvas.height - margin) dy = (this.canvas.height - margin) - sy;
      if (dx !== 0 || dy !== 0) {
        this.transform.x += dx;
        this.transform.y += dy;
      }
    }
    this.render();
  }

  clear() {
    this.nodes   = [];
    this.nodeMap = {};
    this.currentIdx = -1;
    this.render();
  }

  _color(type) {
    switch (type) {
      case 'start':     return '#c084fc';
      case 'assign':    return '#00c9a7';
      case 'pruned':    return '#fbbf24';
      case 'backtrack': return '#f43f5e';
      case 'success':   return '#4ade80';
      default:          return '#64748b';
    }
  }

  render() {
    const { ctx, canvas, transform: t } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.nodes.length) return;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);

    const R_BASE    = 26;
    const R_CURRENT = 33;

    // ── Edges ──────────────────────────────────────────────
    this.nodes.forEach(node => {
      if (!node.visible || !node.parent || !node.parent.visible) return;
      const p = node.parent;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(node.x, node.y);
      if (node.isCurrent) {
        ctx.strokeStyle = this._color(node.type);
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = this._color(node.type);
        ctx.shadowBlur  = 8;
      } else {
        ctx.strokeStyle = 'rgba(180,195,220,0.18)';
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // ── Nodes ───────────────────────────────────────────────
    this.nodes.forEach(node => {
      if (!node.visible) return;
      const r     = node.isCurrent ? R_CURRENT : R_BASE;
      const color = this._color(node.type);

      // Outer glow for current node
      if (node.isCurrent) {
        const glowR = r + 18;
        const g = ctx.createRadialGradient(node.x, node.y, r - 4, node.x, node.y, glowR);
        g.addColorStop(0, color + '66');
        g.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Node fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (node.isCurrent) {
        const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, r * 0.1,
                                              node.x,              node.y,              r);
        grad.addColorStop(0, color + 'ff');
        grad.addColorStop(1, color + 'bb');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = color + '99';
      }
      ctx.fill();

      // Border ring
      ctx.strokeStyle = node.isCurrent ? '#ffffff55' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = node.isCurrent ? 2 : 1.2;
      ctx.stroke();

      // ── Digit / symbol label ────────────────────────────
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(r * 0.62)}px "JetBrains Mono",monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      let label = '';
      if (node.type === 'start')          label = 'S';
      else if (node.type === 'success')   label = '✓';
      else label = (node.digit !== null && node.digit !== undefined) ? String(node.digit) : '?';
      ctx.shadowColor = node.isCurrent ? color : 'transparent';
      ctx.shadowBlur  = node.isCurrent ? 6 : 0;
      ctx.fillText(label, node.x, node.y);
      ctx.shadowBlur = 0;

      // ── Letter above node ──────────────────────────────
      if (node.letter) {
        ctx.fillStyle = node.isCurrent ? '#fff' : 'rgba(240,244,255,0.6)';
        ctx.font      = `bold ${node.isCurrent ? 13 : 11}px "Space Grotesk",sans-serif`;
        ctx.fillText(node.letter, node.x, node.y - r - 9);
      }
    });

    ctx.restore();
  }
}

const treeRenderer = new TreeRenderer();

// ═══════════════════════════════════════════════════════════
//  ALGORITHM COMPARE TAB
// ═══════════════════════════════════════════════════════════

let comparePresetsLoaded = false;

async function initCompareTab() {
  if (comparePresetsLoaded) return;
  comparePresetsLoaded = true;
  const presets = await api('/api/presets');
  const sel = $('compare-puzzle-select');
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    const diffTag = p.difficulty ? ` [${p.difficulty.toUpperCase()}]` : '';
    opt.textContent = p.name + diffTag;
    sel.appendChild(opt);
  });
  sel._presets = presets;
}

$('btn-compare-random').addEventListener('click', async () => {
  const data = await api('/api/puzzle');
  if (data.error) { toast('Could not generate puzzle', 'error'); return; }
  const sel = $('compare-puzzle-select');
  
  // Add as a new option
  const opt = document.createElement('option');
  const idx = sel.options.length;
  opt.value = idx;
  opt.textContent = data.name + ' [RANDOM]';
  sel.appendChild(opt);
  sel.value = idx;
  
  if (!sel._presets) sel._presets = [];
  sel._presets.push(data);
});

$('btn-run-compare').addEventListener('click', async () => {
  const sel = $('compare-puzzle-select');
  const presets = sel._presets;
  if (!presets || !presets[+sel.value]) { toast('Select a puzzle first', 'error'); return; }
  
  const p = presets[+sel.value];
  toast('Running comparison…');
  
  const res = await api('/api/compare', {
    method: 'POST',
    body: JSON.stringify({ words: p.words, result: p.result }),
  });

  $('compare-results').style.display = 'block';

  // Backtracking results
  $('cmp-bt-steps').textContent = res.backtracking.steps.toLocaleString();
  $('cmp-bt-time').textContent  = res.backtracking.time_ms + ' ms';
  $('cmp-bt-result').textContent = res.backtracking.solution ? '✓ Solved' : '✗ Not found';

  // Brute force results
  $('cmp-bf-steps').textContent = res.brute_force.steps.toLocaleString();
  $('cmp-bf-time').textContent  = res.brute_force.time_ms + ' ms';
  $('cmp-bf-result').textContent = res.brute_force.solution ? '✓ Solved' : (res.brute_force.steps >= 50000 ? '⚠ Exceeded 50k steps' : '✗ Not found');

  // Animate bars
  const maxSteps = Math.max(res.backtracking.steps, res.brute_force.steps, 1);
  setTimeout(() => {
    $('cmp-bt-bar').style.width = `${(res.backtracking.steps / maxSteps * 100).toFixed(1)}%`;
    $('cmp-bf-bar').style.width = `${(res.brute_force.steps / maxSteps * 100).toFixed(1)}%`;
  }, 100);

  // Speedup calculation
  const speedup = res.brute_force.steps > 0 ? (res.brute_force.steps / Math.max(res.backtracking.steps, 1)) : 1;
  const timeSpeedup = res.brute_force.time_ms > 0 ? (res.brute_force.time_ms / Math.max(res.backtracking.time_ms, 0.01)) : 1;
  
  $('speedup-text').innerHTML = `Backtracking with pruning was <strong>${speedup.toFixed(1)}×</strong> more efficient in steps ` +
    `and <strong>${timeSpeedup.toFixed(1)}×</strong> faster in execution time. ` +
    `Pruning eliminated <strong>${Math.max(0, res.brute_force.steps - res.backtracking.steps).toLocaleString()}</strong> unnecessary explorations.`;
  
  toast('Comparison complete!', 'success');
});

// ═══════════════════════════════════════════════════════════
//  ANALYTICS TAB
// ═══════════════════════════════════════════════════════════

function renderStatsTab() {
  // Overview stats
  $('stats-total-solved').textContent = state.totalSolved;
  $('stats-best-streak').textContent  = state.bestStreak;

  // Avg time
  const times = state.solveHistory.map(h => h.time);
  const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  $('stats-avg-time').textContent = times.length > 0 ? formatTime(avgTime) : '--:--';

  // Accuracy
  const accuracy = state.totalAttempts > 0 
    ? Math.round((state.correctMoves / state.totalAttempts) * 100) 
    : 0;
  $('stats-accuracy').textContent = accuracy + '%';

  // History list
  renderHistoryList();

  // Chart
  renderStatsChart();
}

function renderHistoryList() {
  const list = $('stats-history-list');
  list.innerHTML = '';

  if (state.solveHistory.length === 0) {
    list.innerHTML = '<div class="stats-empty">No puzzles solved yet. Start playing to see your stats!</div>';
    return;
  }

  // Show most recent first
  [...state.solveHistory].reverse().forEach(entry => {
    const el = document.createElement('div');
    el.className = 'history-entry';
    el.innerHTML = `
      <span class="he-puzzle">${entry.puzzle}</span>
      <span class="he-diff ${entry.difficulty || 'medium'}">${(entry.difficulty || 'medium').toUpperCase()}</span>
      <span class="he-time">⏱ ${formatTime(entry.time)}</span>
      <span class="he-score">⭐ ${entry.score}</span>
    `;
    list.appendChild(el);
  });
}

function renderStatsChart() {
  const canvas = $('stats-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.parentElement.clientWidth - 24;
  canvas.height = 200;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const history = state.solveHistory;
  if (history.length < 2) {
    ctx.fillStyle = '#888';
    ctx.font = '14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Solve at least 2 puzzles to see the chart', canvas.width / 2, canvas.height / 2);
    return;
  }

  const pad = { t: 20, b: 30, l: 50, r: 20 };
  const w = canvas.width - pad.l - pad.r;
  const h = canvas.height - pad.t - pad.b;

  const times = history.map(e => e.time);
  const maxTime = Math.max(...times, 1);

  // Grid lines
  ctx.strokeStyle = '#2e2e2e';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#666';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(Math.round(maxTime * (1 - i / 4))), pad.l - 8, y + 4);
  }

  // Data line
  ctx.beginPath();
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';

  times.forEach((t, i) => {
    const x = pad.l + (w / (times.length - 1)) * i;
    const y = pad.t + h - (t / maxTime) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Data points
  times.forEach((t, i) => {
    const x = pad.l + (w / (times.length - 1)) * i;
    const y = pad.t + h - (t / maxTime) * h;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b35';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X axis label
  ctx.fillStyle = '#666';
  ctx.font = '11px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Solve History (oldest → newest)', canvas.width / 2, canvas.height - 5);
}

// Clear stats
$('btn-clear-stats').addEventListener('click', () => {
  if (!confirm('Clear all stats? This cannot be undone.')) return;
  state.totalSolved  = 0;
  state.bestStreak   = 0;
  state.solveHistory = [];
  state.totalAttempts = 0;
  state.correctMoves  = 0;
  state.wrongMoves    = 0;
  state.streak = 0;
  $('h-solved').textContent = 0;
  $('h-streak').textContent = 0;
  saveStats();
  renderStatsTab();
  toast('Stats cleared!');
});

// Export stats
$('btn-export-stats').addEventListener('click', () => {
  const data = {
    totalSolved: state.totalSolved,
    bestStreak:  state.bestStreak,
    accuracy:    state.totalAttempts > 0 ? Math.round((state.correctMoves / state.totalAttempts) * 100) : 0,
    solveHistory: state.solveHistory,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cryptarithm_stats.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Stats exported!', 'success');
});

// ═══════════════════════════════════════════════════════════
//  CONFETTI
// ═══════════════════════════════════════════════════════════

function spawnConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ff6b35','#00c9a7','#4ade80','#facc15','#f43f5e','#c084fc'];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    r: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * 360,
    spin: (Math.random() - 0.5) * 6,
    alpha: 1,
  }));
  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.06;
      p.alpha -= 0.006;
      if (p.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.5);
      ctx.restore();
    });
    if (particles.some(p => p.alpha > 0)) frame = requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); cancelAnimationFrame(frame); }
  }
  draw();
}

// ═══════════════════════════════════════════════════════════
//  WELCOME SPLASH
// ═══════════════════════════════════════════════════════════

function initSplash() {
  const splash = $('welcome-splash');
  if (!splash) return;

  // ── Floating cipher particles on the canvas background ──
  const canvas = $('splash-canvas');
  if (canvas) {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+=-?';
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      char: chars[Math.floor(Math.random() * chars.length)],
      size: 12 + Math.random() * 22,
      alpha: 0.03 + Math.random() * 0.08,
      vy: -(0.2 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 0.3,
      color: ['#ff6b35','#00c9a7','#c084fc','#4ade80','#facc15'][Math.floor(Math.random() * 5)],
    }));

    let splashAlive = true;
    function drawSplash() {
      if (!splashAlive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap around
        if (p.y < -30) { p.y = canvas.height + 30; p.x = Math.random() * canvas.width; }
        if (p.x < -30) p.x = canvas.width + 30;
        if (p.x > canvas.width + 30) p.x = -30;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.font = `${Math.round(p.size)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, p.x, p.y);
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(drawSplash);
    }
    drawSplash();

    // Stop particles after splash exits
    const stopParticles = () => { splashAlive = false; };
    splash.addEventListener('transitionend', stopParticles, { once: true });
  }

  // ── Dismiss splash ─────────────────────────────────────
  function dismissSplash() {
    splash.classList.add('exit');
    setTimeout(() => { splash.style.display = 'none'; }, 900);
  }

  splash.addEventListener('click', dismissSplash);

  // Auto-dismiss after 6 seconds
  setTimeout(dismissSplash, 6000);
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  initSplash();
  loadStats();
  loadPuzzle();
});
