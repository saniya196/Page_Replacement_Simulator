/* ===================== CORE LOGIC ===================== */
function pageReplace(refs, frameCount, algo) {
  const slots = Array(frameCount).fill(null);   // fixed frame positions
  const loaded = Array(frameCount).fill(-1);    // time page was loaded (FIFO)
  const last = Array(frameCount).fill(-1);      // time page was last used (LRU)
  const steps = [];
  let faults = 0;

  for (let i = 0; i < refs.length; i++) {
    const page = refs[i];
    const idx = slots.indexOf(page);
    let hit = idx !== -1;
    let placed = -1;

    if (hit) {
      last[idx] = i;
    } else {
      faults++;
      let v = slots.indexOf(null);              // free frame first
      if (v === -1) {
        if (algo === 'FIFO') {
          v = 0;
          for (let j = 1; j < frameCount; j++) if (loaded[j] < loaded[v]) v = j;
        } else if (algo === 'LRU') {
          v = 0;
          for (let j = 1; j < frameCount; j++) if (last[j] < last[v]) v = j;
        } else {                                // OPT
          v = 0;
          let far = -1;
          for (let j = 0; j < frameCount; j++) {
            let next = refs.indexOf(slots[j], i + 1);
            if (next === -1) next = Infinity;   // never used again
            if (next > far) { far = next; v = j; }
          }
        }
      }
      slots[v] = page; loaded[v] = i; last[v] = i; placed = v;
    }
    steps.push({ page, frames: [...slots], hit, placed });
  }

  const hits = refs.length - faults;
  return {
    steps, faults, hits,
    hitRatio: refs.length ? (hits / refs.length) * 100 : 0
  };
}

/* ===================== DATA ===================== */
const ALGO_NAMES = { FIFO: 'FIFO', LRU: 'LRU', OPT: 'Optimal' };

const algoInfo = [
  {
    name: 'FIFO (First-In, First-Out)',
    rule: 'Replace the page that has been in memory the longest.',
    pros: 'Very simple, needs only a queue.',
    cons: "Can remove a heavily used page. Suffers from Belady's anomaly.",
    complexity: 'O(1) per replacement with a queue'
  },
  {
    name: 'LRU (Least Recently Used)',
    rule: 'Replace the page that has not been used for the longest time.',
    pros: "Good approximation of OPT. No Belady's anomaly.",
    cons: 'Needs tracking of last-use time (counter or stack).',
    complexity: 'O(f) per replacement with a counter'
  },
  {
    name: 'Optimal (OPT)',
    rule: 'Replace the page that will not be used for the longest time in the future.',
    pros: 'Lowest possible page faults. Used as a benchmark.',
    cons: 'Impossible in real systems, since it needs future knowledge.',
    complexity: 'O(f × n) per replacement'
  }
];

const PRESETS = {
  classic:  { refs: '7 0 1 2 0 3 0 4 2 3 0 3 2', frames: 3 },
  belady:   { refs: '1 2 3 4 1 2 5 1 2 3 4 5',   frames: 3 },
  locality: { refs: '1 2 1 2 1 3 1 2 3 1 2 3 4 1 2', frames: 3 }
};

const C_CODE = String.raw`#include <stdio.h>

int search(int frames[], int n, int page) {
    for (int i = 0; i < n; i++)
        if (frames[i] == page) return i;
    return -1;
}

int fifo(int refs[], int n, int f) {
    int frames[10], front = 0, count = 0, faults = 0;
    for (int i = 0; i < n; i++) {
        if (search(frames, count, refs[i]) == -1) {
            faults++;
            if (count < f) frames[count++] = refs[i];
            else { frames[front] = refs[i]; front = (front + 1) % f; }
        }
    }
    return faults;
}

int lru(int refs[], int n, int f) {
    int frames[10], last[10], count = 0, faults = 0;
    for (int i = 0; i < n; i++) {
        int idx = search(frames, count, refs[i]);
        if (idx != -1) { last[idx] = i; continue; }   // hit
        faults++;
        if (count < f) { frames[count] = refs[i]; last[count++] = i; }
        else {
            int v = 0;
            for (int j = 1; j < f; j++)
                if (last[j] < last[v]) v = j;          // oldest last-use
            frames[v] = refs[i]; last[v] = i;
        }
    }
    return faults;
}

int optimal(int refs[], int n, int f) {
    int frames[10], count = 0, faults = 0;
    for (int i = 0; i < n; i++) {
        if (search(frames, count, refs[i]) != -1) continue;  // hit
        faults++;
        if (count < f) { frames[count++] = refs[i]; continue; }
        int v = 0, far = -1;
        for (int j = 0; j < f; j++) {
            int k;
            for (k = i + 1; k < n; k++)
                if (refs[k] == frames[j]) break;       // next use
            if (k > far) { far = k; v = j; }           // k == n means never used again
        }
        frames[v] = refs[i];
    }
    return faults;
}

int main() {
    int refs[] = {7,0,1,2,0,3,0,4,2,3,0,3,2};
    int n = sizeof(refs) / sizeof(refs[0]);
    int f = 3;

    printf("FIFO faults: %d\n", fifo(refs, n, f));
    printf("LRU  faults: %d\n", lru(refs, n, f));
    printf("OPT  faults: %d\n", optimal(refs, n, f));
    return 0;
}
`;

/* ===================== HELPERS ===================== */
const $ = id => document.getElementById(id);

function readInput() {
  const refs = $('refInput').value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const frames = parseInt($('frameInput').value, 10);
  const err = $('error');
  err.hidden = true;

  if (!refs.length || refs.some(n => !Number.isInteger(n) || n < 0)) {
    err.textContent = 'Reference string must contain whole numbers 0 or higher, like: 7 0 1 2 0 3';
    err.hidden = false; return null;
  }
  if (refs.length > 60) {
    err.textContent = 'Use at most 60 references so the table stays readable.';
    err.hidden = false; return null;
  }
  if (!Number.isInteger(frames) || frames < 1 || frames > 10) {
    err.textContent = 'Frames must be a number from 1 to 10.';
    err.hidden = false; return null;
  }
  return { refs, frames };
}

/* ===================== SIMULATION TAB ===================== */
function simulate() {
  const input = readInput();
  if (!input) { $('results').hidden = true; return; }
  const r = pageReplace(input.refs, input.frames, $('algoSelect').value);

  $('sTotal').textContent = input.refs.length;
  $('sFaults').textContent = r.faults;
  $('sHits').textContent = r.hits;
  $('sRatio').textContent = r.hitRatio.toFixed(1) + '%';

  let html = '<tr><th>Page</th>' + r.steps.map(s => `<td class="page">${s.page}</td>`).join('') + '</tr>';
  for (let f = 0; f < input.frames; f++) {
    html += `<tr><th>Frame ${f + 1}</th>`;
    html += r.steps.map(s => {
      const v = s.frames[f];
      if (v === null) return '<td class="empty">–</td>';
      const cls = (s.placed === f) ? 'new' : '';
      return `<td class="${cls}">${v}</td>`;
    }).join('');
    html += '</tr>';
  }
  html += '<tr><th>Result</th>' + r.steps.map(s =>
    `<td class="status ${s.hit ? 'hit' : 'fault'}">${s.hit ? 'Hit' : 'Fault'}</td>`).join('') + '</tr>';

  $('stepTable').innerHTML = html;
  $('results').hidden = false;
}

function randomize() {
  const len = 10 + Math.floor(Math.random() * 8);
  const range = 4 + Math.floor(Math.random() * 6);
  $('refInput').value = Array.from({ length: len }, () => Math.floor(Math.random() * range)).join(' ');
  $('frameInput').value = 3 + Math.floor(Math.random() * 2);
  $('presetSelect').value = '';
  simulate();
}

function loadPreset(key) {
  if (!PRESETS[key]) return;
  $('refInput').value = PRESETS[key].refs;
  $('frameInput').value = PRESETS[key].frames;
  simulate();
}

/* ===================== COMPARE TAB ===================== */
function compare() {
  const input = readInput();
  if (!input) {
    $('compareInfo').textContent = 'Fix the input on the Simulation tab first.';
    return;
  }
  const algos = ['FIFO', 'LRU', 'OPT'];
  const res = algos.map(a => ({ a, ...pageReplace(input.refs, input.frames, a) }));
  const best = Math.min(...res.map(r => r.faults));
  const max = Math.max(...res.map(r => r.faults), 1);

  $('compareInfo').textContent =
    `Reference string: ${input.refs.join(' ')}  |  Frames: ${input.frames}`;

  $('compareBars').innerHTML = res.map(r => `
    <div class="bar-row">
      <span>${ALGO_NAMES[r.a]}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.faults / max) * 100}%"></div></div>
      <span>${r.faults} faults</span>
    </div>`).join('');

  $('compareTable').innerHTML =
    '<tr><th>Algorithm</th><th>Faults</th><th>Hits</th><th>Hit ratio</th></tr>' +
    res.map(r => `<tr class="${r.faults === best ? 'best' : ''}">
      <td>${ALGO_NAMES[r.a]}${r.faults === best ? ' (fewest faults)' : ''}</td>
      <td>${r.faults}</td><td>${r.hits}</td><td>${r.hitRatio.toFixed(1)}%</td></tr>`).join('');

  // Faults vs frames sweep
  let head = '<tr><th>Frames</th>' + algos.map(a => `<th>${ALGO_NAMES[a]}</th>`).join('') + '</tr>';
  let prevFifo = null, rows = '';
  for (let f = 1; f <= 7; f++) {
    const cells = algos.map(a => pageReplace(input.refs, f, a).faults);
    const up = prevFifo !== null && cells[0] > prevFifo;
    rows += `<tr><td>${f}</td>` +
      cells.map((c, i) => `<td class="${i === 0 && up ? 'up' : ''}">${c}${i === 0 && up ? ' ▲ Belady' : ''}</td>`).join('') + '</tr>';
    prevFifo = cells[0];
  }
  $('sweepTable').innerHTML = head + rows;
}

/* ===================== ALGORITHMS + CODE TABS ===================== */
function renderAlgoCards() {
  $('algoCards').innerHTML = algoInfo.map(a => `
    <div class="card algo-card">
      <h3>${a.name}</h3>
      <p><b>Rule:</b> ${a.rule}</p>
      <p><b>Pros:</b> ${a.pros}</p>
      <p><b>Cons:</b> ${a.cons}</p>
      <p><b>Cost:</b> ${a.complexity}</p>
    </div>`).join('');
}

function setupCode() {
  $('cCode').textContent = C_CODE;
  $('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(C_CODE);
      $('copyBtn').textContent = 'Copied';
    } catch {
      $('copyBtn').textContent = 'Press Ctrl+C to copy';
    }
    setTimeout(() => ($('copyBtn').textContent = 'Copy code'), 1800);
  };
}

/* ===================== TABS + INIT ===================== */
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => (p.hidden = true));
    btn.classList.add('active');
    $(btn.dataset.tab).hidden = false;
    if (btn.dataset.tab === 'compare') compare();
  };
});

$('simBtn').onclick = simulate;
$('randomBtn').onclick = randomize;
$('compareBtn').onclick = compare;
$('presetSelect').onchange = e => loadPreset(e.target.value);
$('algoSelect').onchange = simulate;

renderAlgoCards();
setupCode();
simulate();

// Allow Node-based testing without breaking the browser
if (typeof module !== 'undefined') module.exports = { pageReplace };
