/* Daftar hadir publik, dua sesi. Data dari /api/public/hadir (nama sudah disingkat di server, tanpa nomor). */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SESSIONS = [
  { id: 'ses1', count: 'nS1', keys: ['panitia', 'buyer', 'kol', 'plus', 'rekan'] }, // 15.10
  { id: 'ses2', count: 'nS2', keys: ['guest'] },                           // 18.00
];
const ALL = SESSIONS.flatMap((s) => s.keys);
let rows = Object.fromEntries(ALL.map((k) => [k, []]));

async function load() {
  let failed = false;
  try {
    const r = await fetch('/api/event/hadir', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    rows = { ...rows, ...(await r.json()) };
  } catch {
    failed = true; // keep whatever was loaded before; the notice only shows while there is nothing to show
  }
  render();
  const empty = failed && !ALL.some((k) => rows[k].length);
  $('#err').hidden = !empty;
  if (empty) $('#none').hidden = true;
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  let shown = 0, total = 0, totalIn = 0;
  for (const s of SESSIONS) {
    let sessionTotal = 0, sessionShown = 0, sessionIn = 0;
    for (const key of s.keys) {
      const all = (rows[key] ?? []).map((x) => (typeof x === 'string' ? { n: x, in: false } : x));
      const list = all.filter((x) => x.n.toLowerCase().includes(q));
      sessionIn += all.filter((x) => x.in).length;
      sessionTotal += all.length; sessionShown += list.length;
      $('#' + key).innerHTML = list.map((x) => `<li class="${x.in ? 'in' : ''}"><span class="nm">${esc(x.n)}</span>${x.in ? '<span class="ck" title="Sudah check-in">✓ hadir</span>' : ''}</li>`).join('');
      $('#n' + key[0].toUpperCase() + key.slice(1)).textContent = q ? `${list.length}/${all.length}` : all.length;
      $('#sec-' + key).hidden = !list.length;
    }
    $('#' + s.count).textContent = q ? `${sessionShown}/${sessionTotal}` : sessionTotal;
    $('#' + s.id).hidden = !sessionShown;
    const inEl = $('#i' + s.count.slice(1));
    if (inEl) { inEl.hidden = !sessionIn; inEl.textContent = `${sessionIn} sudah check-in`; }
    totalIn += sessionIn;
    shown += sessionShown; total += sessionTotal;
  }
  $('#total').textContent = total;
  $('#checked').hidden = !totalIn;
  $('#checked').textContent = `${totalIn} orang sudah check-in`;
  $('#none').hidden = shown > 0;
}
$('#q').addEventListener('input', render);
load();
setInterval(load, 8000); // status check-in ikut berubah hampir langsung
