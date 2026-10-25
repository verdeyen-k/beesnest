// Bees Nest: take turns filling hex cells. Any empty cell touching 3 or more filled cells fills itself, and
// those can set off more. Cells that fill themselves belong to whoever's click set them off.
// Points = cells you auto-filled minus cells you clicked. When the board is full, the most points wins.
// Falling hive: each time the turn goes from the last player back to the first, the outer ring falls off,
// along with any points on it.
(() => {
  // ── Board ────────────────────────────────────────────────────────────────
  // A hexagon with N cells per side, pointy-top cells, axial (q, r) coordinates.
  const N = 10, R = N - 1, SIZE = 22, SQ3 = Math.sqrt(3);
  const cells = [], idx = new Map();
  for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
    idx.set(q + ',' + r, cells.length); cells.push({ q, r });
  }
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // Which ring each cell is in: 0 is the middle, R is the outside.
  const ring = cells.map(c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)));
  const nbrs = cells.map(c => DIRS.map(([dq, dr]) => idx.get((c.q + dq) + ',' + (c.r + dr))).filter(i => i !== undefined));

  // Each player clicks in their first color, and their auto-fills come out in the second.
  const PLAYERS = [
    { label: 'Player 1', seed: '#2f5fd0', auto: '#f08a24', seedName: 'blue',   autoName: 'orange' },
    { label: 'Player 2', seed: '#d23a3a', auto: '#3fae4a', seedName: 'red',    autoName: 'green' },
    { label: 'Player 3', seed: '#7b4bc4', auto: '#f2c81e', seedName: 'purple', autoName: 'yellow' },
    { label: 'Player 4', seed: '#e85aa8', auto: '#1f6b3a', seedName: 'pink',   autoName: 'dark green' },
  ];
  const MAX_PLAYERS = PLAYERS.length;
  // Gray cells are scattered at the start. They belong to nobody, but count as filled for the 3-neighbor rule.
  const GRAY = PLAYERS.length, GRAY_COLOR = '#8e948f', MAX_GRAYS = 100;
  // Cells that fell off in a falling hive: gone, so they're neither empty nor filled.
  const FALLEN = -2;
  function scatter(n) {
    const pool = cells.map((_, i) => i), out = [];
    for (let k = 0; k < Math.min(n, MAX_GRAYS); k++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }

  // Fill every empty cell with 3+ filled neighbors, wave by wave, giving them to player p.
  // owner[i] is the player who owns cell i, -1 if it's empty, or FALLEN. Calls onFill(i, wave) for each new cell.
  function spread(owner, p, onFill) {
    let wave = 0;
    for (;;) {
      const add = [];
      for (let i = 0; i < cells.length; i++) {
        if (owner[i] !== -1) continue;
        let k = 0; for (const j of nbrs[i]) if (owner[j] >= 0) k++;
        if (k >= 3) add.push(i);
      }
      if (!add.length) return wave;
      wave++;
      for (const i of add) { owner[i] = p; if (onFill) onFill(i, wave); }
    }
  }

  // Rebuild the board from the gray cells and the list of moves. Every device does this, so they all agree.
  // A move is { p, c } (player p filled cell c), or { f: 1 } when the outer ring falls.
  function replay(moves, grays = []) {
    const owner = new Array(cells.length).fill(-1), seed = new Array(cells.length).fill(false);
    const wave = new Array(cells.length).fill(0), move = new Array(cells.length).fill(-1);
    let last = -1, outer = R;
    // Grays can set off their own chain before anyone plays; those cells are gray too.
    for (const i of grays) owner[i] = GRAY;
    spread(owner, GRAY);
    moves.forEach((m, k) => {
      if (m.f) {
        cells.forEach((_, i) => { if (ring[i] === outer) { owner[i] = FALLEN; move[i] = k; } });
        outer--;
        return;
      }
      last = k;
      owner[m.c] = m.p; seed[m.c] = true; move[m.c] = k;
      spread(owner, m.p, (i, w) => { wave[i] = w; move[i] = k; });
    });
    const score = PLAYERS.map(() => ({ seeds: 0, autos: 0, points: 0 }));
    owner.forEach((p, i) => { if (p >= 0 && p !== GRAY) seed[i] ? score[p].seeds++ : score[p].autos++; });
    for (const s of score) s.points = s.autos - s.seeds;
    return { owner, seed, wave, move, last, outer, score, full: owner.every(p => p !== -1) };
  }

  // ── Online rooms ─────────────────────────────────────────────────────────
  // Bump with the ?v= on the script in index.html whenever what goes in the room changes.
  const VERSION = 4;
  const OUTDATED = 'That room is using a different version of Bees Nest. Everyone needs to refresh the page.';
  const ROOMS = 'beesnest/rooms';

  const db = window.firebase ? (firebase.initializeApp({
    apiKey:            'AIzaSyAsJboNGVuESMhkivllUD0o8MUB5LUCMRQ',
    authDomain:        'kvgames.firebaseapp.com',
    databaseURL:       'https://kvgames-default-rtdb.firebaseio.com',
    projectId:         'kvgames',
    storageBucket:     'kvgames.firebasestorage.app',
    messagingSenderId: '463308384695',
    appId:             '1:463308384695:web:5d57623ebd52101ad26032',
  }), firebase.database()) : null;

  const $ = id => document.getElementById(id);
  const show = id => {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    if (id !== 'game') $('over').hidden = true;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const myId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  let room = null;  // online: { code, ref, st, listener, joining }; on this device: { local: true, st }

  // Firebase hands arrays back as objects ({0: x, 1: y}) and drops empty ones.
  const toArr = v => !v ? [] : Array.isArray(v) ? v.filter(x => x != null) : Object.keys(v).sort((a, b) => a - b).map(k => v[k]);
  const playerList = st => Object.entries((st && st.players) || {}).filter(([, p]) => p && p.name)
    .map(([id, p]) => ({ id, ...p })).sort((a, b) => a.slot - b.slot);
  // The next player in turn order after index t who is still in the room.
  function nextTurn(st, t) {
    const order = toArr(st.order), players = st.players || {};
    for (let k = 1; k <= order.length; k++) {
      const i = (t + k) % order.length;
      if (players[order[i]]) return i;
    }
    return t;
  }

  function genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  function busy(on) { for (const b of document.querySelectorAll('#menu button')) b.disabled = on; }
  function myName() {
    const name = $('name').value.trim().slice(0, 16);
    if (!name) { $('menu-error').textContent = 'Type your name first.'; $('name').focus(); return null; }
    store.set('beesnest-name', name);
    return name;
  }
  const NO_SERVER = "Can't reach the game server. Check the internet connection.";

  async function createRoom(name) {
    if (!db) { $('menu-error').textContent = NO_SERVER; return; }
    busy(true);
    $('menu-error').textContent = '';
    try {
      let code, ref;
      for (let i = 0; i < 10; i++) {
        code = genCode();
        ref = db.ref(`${ROOMS}/${code}`);
        if (!(await ref.get()).exists()) break;
      }
      await ref.set({
        host: myId, v: VERSION, created: firebase.database.ServerValue.TIMESTAMP, phase: 'lobby',
        grayCount: Math.max(0, Math.min(MAX_GRAYS, Number(store.get('beesnest-grays')) || 0)),
        falling: store.get('beesnest-falling') === '1',
        players: { [myId]: { name, slot: 0 } },
      });
      ref.onDisconnect().remove();
      await enterRoom(code, ref);
    } catch (e) {
      $('menu-error').textContent = "Couldn't create a room. Check the internet connection.";
    }
    busy(false);
  }

  async function joinRoom(code, name) {
    if (!db) { $('menu-error').textContent = NO_SERVER; return; }
    busy(true);
    $('menu-error').textContent = '';
    const ref = db.ref(`${ROOMS}/${code}`);
    try {
      const st = await enterRoom(code, ref, true);
      const problem = !st || !st.host ? `There's no room ${code}.` : st.v !== VERSION ? OUTDATED
        : st.phase !== 'lobby' ? 'That game has already started.'
        : playerList(st).length >= MAX_PLAYERS ? `That room is full (${MAX_PLAYERS} players).` : null;
      if (problem) throw new Error(problem);
      // A transaction, so two people joining at once can't take the same seat.
      const res = await ref.child('players').transaction(cur => {
        if (!cur) return;
        const taken = new Set(Object.values(cur).filter(p => p && p.name).map(p => p.slot));
        const slot = PLAYERS.findIndex((_, i) => !taken.has(i));
        if (slot < 0) return;
        cur[myId] = { name, slot };
        return cur;
      });
      if (!res.committed) throw new Error(`That room is full (${MAX_PLAYERS} players).`);
      ref.child(`players/${myId}`).onDisconnect().remove();
      room.joining = false;
      render();
    } catch (e) {
      leaveRoom();
      show('menu');
      $('menu-error').textContent = e.message && !/^FIREBASE|permission/i.test(e.message) ? e.message
        : "Couldn't join. Check the code and the internet connection.";
    }
    busy(false);
  }

  // Start listening to the room. Resolves with its first data, so a join can check it before taking a seat.
  function enterRoom(code, ref, joining = false) {
    leaveRoom();
    room = { code, ref, st: null, joining };
    const r = room;
    resetBoard();
    return new Promise(resolve => {
      r.listener = ref.on('value', snap => {
        if (room !== r) return;
        r.st = snap.val();
        if (resolve) { const f = resolve; resolve = null; f(r.st); if (joining) return; }
        if (!r.joining) render();
      }, () => { if (resolve) { const f = resolve; resolve = null; f(null); } });
    });
  }
  function leaveRoom() {
    const r = room;
    if (!r) return;
    room = null;
    if (r.local) return;
    r.ref.off('value', r.listener);
    if (r.st && r.st.host === myId) { r.ref.onDisconnect().cancel(); r.ref.remove(); }
    else if (!r.joining) {
      const c = r.ref.child(`players/${myId}`);
      c.onDisconnect().cancel();
      c.remove();
    }
  }

  function startGame() {
    const st = room && room.st;
    if (!st || st.host !== myId) return;
    room.ref.update({ phase: 'play', order: playerList(st).map(p => p.id), turn: 0, moves: null, grays: scatter(st.grayCount || 0) });
  }
  function playAgain() {
    if (room && room.local) { startLocal(playerList(room.st).map(p => p.name), room.st.grayCount, room.st.falling); return; }
    if (room && room.st && room.st.host === myId) room.ref.update({ phase: 'lobby', order: null, turn: null, moves: null, grays: null });
  }

  // Player `id` places cell c in room state `cur`. Returns false if it's not their turn or the cell is taken.
  function applyMove(cur, id, c) {
    if (!cur || cur.phase !== 'play') return false;
    const order = toArr(cur.order);
    if (order[cur.turn] !== id || !cur.players || !cur.players[id]) return false;
    const moves = toArr(cur.moves);
    const grays = toArr(cur.grays);
    if (replay(moves, grays).owner[c] !== -1) return false;
    moves.push({ p: cur.players[id].slot, c });
    if (!replay(moves, grays).full) {
      const next = nextTurn(cur, cur.turn);
      // Back to the top of the list: in a falling hive, the outer ring falls.
      if (cur.falling && next <= cur.turn) moves.push({ f: 1 });
      cur.turn = next;
    }
    cur.moves = moves;
    if (replay(moves, grays).full) cur.phase = 'over';
    return true;
  }

  // Place a cell. Online it's a transaction, so it only goes through if it's still my turn and the cell is still empty.
  function place(c) {
    if (!room) return;
    if (room.local) { if (applyMove(room.st, meId(), c)) render(); return; }
    room.ref.transaction(cur => applyMove(cur, myId, c) ? cur : undefined);
  }

  // Everyone on one device: the same room state, kept here instead of online, and whoever's turn it is plays.
  function startLocal(names, grayCount, falling) {
    leaveRoom();
    const players = {};
    names.forEach((name, slot) => { players['p' + slot] = { name, slot }; });
    room = { local: true, st: { phase: 'play', players, order: names.map((_, slot) => 'p' + slot), turn: 0, moves: [],
      grayCount, grays: scatter(grayCount), falling } };
    resetBoard();
    render();
  }

  // ── Board drawing ────────────────────────────────────────────────────────
  const svg = $('svg'), NS = 'http://www.w3.org/2000/svg';
  const W = SQ3 * SIZE * (2 * R + 1) + 8, H = SIZE * (1.5 * (2 * R) + 2) + 8;
  svg.setAttribute('viewBox', `${-W / 2} ${-H / 2} ${W} ${H}`);
  const pts = [...Array(6)].map((_, k) => { const a = Math.PI / 180 * (60 * k - 30); return [SIZE * 0.95 * Math.cos(a), SIZE * 0.95 * Math.sin(a)]; });
  const polys = [], dots = [];
  cells.forEach((c, i) => {
    const x = SIZE * SQ3 * (c.q + c.r / 2), y = SIZE * 1.5 * c.r;
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('points', pts.map(([a, b]) => `${(x + a).toFixed(2)},${(y + b).toFixed(2)}`).join(' '));
    p.setAttribute('class', 'cell'); p.setAttribute('tabindex', '0'); p.setAttribute('role', 'gridcell');
    p.addEventListener('pointerup', e => tap(i, e.pointerType));
    p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(i, 'key'); } });
    p.addEventListener('mouseenter', () => { if (selected === null) preview(i); });
    p.addEventListener('mouseleave', () => { if (selected === null) clearPreview(); });
    svg.appendChild(p); polys.push(p);
    // A small dot marks cells someone clicked, so clicked and auto-filled cells differ by more than color.
    const d = document.createElementNS(NS, 'circle');
    d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', SIZE * 0.22); d.setAttribute('class', 'dot');
    svg.appendChild(d); dots.push(d);
  });

  let board = replay([]), shownMoves = 0, selected = null;

  function resetBoard() { board = replay([]); shownMoves = 0; selected = null; drawBoard(); }

  // On one device, "me" is whoever's turn it is.
  const meId = () => room && room.local ? toArr(room.st.order)[room.st.turn] : myId;
  const myTurn = () => {
    const st = room && room.st;
    return !!st && st.phase === 'play' && toArr(st.order)[st.turn] === meId();
  };
  const mySlot = () => { const p = room && room.st && room.st.players && room.st.players[meId()]; return p ? p.slot : 0; };

  // Mouse: hover shows what a click would set off, and a click places. Touch: the first tap shows it, the second places.
  function tap(i, type) {
    if (board.owner[i] !== -1 || !myTurn()) { nope(i); return; }
    if (type === 'mouse' || selected === i) { selected = null; clearPreview(); place(i); return; }
    selected = i;
    preview(i);
  }
  function nope(i) { polys[i].classList.remove('nope'); void polys[i].getBBox(); polys[i].classList.add('nope'); }

  function preview(i) {
    clearPreview();
    if (board.owner[i] !== -1 || !myTurn()) return;
    const owner = board.owner.slice(); owner[i] = mySlot();
    const color = PLAYERS[mySlot()].auto;
    let n = 0;
    spread(owner, mySlot(), j => { polys[j].classList.add('hint'); polys[j].style.setProperty('--hint', color); n++; });
    polys[i].classList.add('picked'); polys[i].style.setProperty('--hint', PLAYERS[mySlot()].seed);
    // Clicking costs 1 point and each cell it sets off earns 1.
    const gain = n - 1;
    $('hint').textContent = `Sets off ${n} cell${n === 1 ? '' : 's'}: ${gain >= 0 ? '+' : '−'}${Math.abs(gain)} point${Math.abs(gain) === 1 ? '' : 's'} for you.`
      + (selected === i ? ' Tap again to place.' : '');
  }
  function clearPreview() {
    for (const p of polys) p.classList.remove('hint', 'picked');
    $('hint').textContent = '';
  }

  const colorOf = (b, i) => { const o = b.owner[i]; return o < 0 ? '' : o === GRAY ? GRAY_COLOR : b.seed[i] ? PLAYERS[o].seed : PLAYERS[o].auto; };
  function drawBoard() {
    cells.forEach((c, i) => {
      const p = polys[i], o = board.owner[i];
      const color = colorOf(board, i);
      p.style.fill = color; p.style.stroke = color;
      p.classList.toggle('filled', o >= 0);
      p.classList.toggle('fallen', o === FALLEN);
      p.classList.toggle('last', board.move[i] === board.last && board.seed[i] && o >= 0);
      dots[i].style.display = o >= 0 && board.seed[i] ? '' : 'none';
      p.setAttribute('aria-label', `Cell ${c.q},${c.r}: ${o === FALLEN ? 'fallen' : o < 0 ? 'empty' : o === GRAY ? 'gray' : `${PLAYERS[o].label} ${board.seed[i] ? 'clicked' : 'auto-filled'}`}`);
    });
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  const swatches = slot => `<span class="sw" style="background:${PLAYERS[slot].seed}"></span><span class="sw" style="background:${PLAYERS[slot].auto}"></span>`;

  function render() {
    const st = room && room.st;
    if (!room) { show('menu'); return; }
    const local = !!room.local;
    if (!local && (!st || !st.host)) { leaveRoom(); show('menu'); $('menu-error').textContent = 'The host left, so the room closed.'; return; }
    if (!local && (!st.players || !st.players[myId])) { leaveRoom(); show('menu'); $('menu-error').textContent = 'You left the room.'; return; }
    const players = playerList(st), host = local || st.host === myId;

    if (st.phase === 'lobby') {
      if (shownMoves) resetBoard();
      show('lobby');
      $('code').textContent = room.code;
      $('lobby-players').innerHTML = players.map(p => `<li>${swatches(p.slot)}<span class="pname">${esc(p.name)}</span>
        <span class="muted">${PLAYERS[p.slot].label}${p.id === st.host ? ' · host' : ''}${p.id === myId ? ' · you' : ''}</span></li>`).join('');
      $('start').hidden = !host;
      $('start').textContent = players.length > 1 ? `Start (${players.length} players)` : 'Start (just you)';
      $('lobby-wait').hidden = host;
      const g = $('grays');
      g.disabled = !host;
      if (document.activeElement !== g) g.value = st.grayCount || 0;
      $('falling').disabled = !host;
      $('falling').checked = !!st.falling;
      return;
    }

    // Playing or finished: rebuild the board from the moves, and pop in whatever changed since last time.
    const moves = toArr(st.moves);
    const before = board;
    board = replay(moves, toArr(st.grays));
    if (moves.length < shownMoves) shownMoves = 0;
    const fresh = shownMoves;
    shownMoves = moves.length;
    if (selected !== null && board.owner[selected] !== -1) selected = null;
    drawBoard();
    const lastWave = Math.max(0, ...board.wave.filter((_, i) => board.move[i] >= fresh));
    cells.forEach((_, i) => {
      const p = polys[i];
      if (board.owner[i] === FALLEN && before.owner[i] !== FALLEN) {
        // Falls once the cascade that came before it has popped in.
        p.classList.remove('pop', 'drop'); void p.getBBox();
        p.style.fill = p.style.stroke = colorOf(before, i);
        p.style.animationDelay = (lastWave * 90 + 350 + ((i * 37) % 9) * 40) + 'ms';
        p.classList.add('drop');
        dots[i].style.display = 'none';
      } else if (before.owner[i] === -1 && board.owner[i] >= 0 && board.move[i] >= fresh) {
        p.classList.remove('pop'); void p.getBBox();
        p.style.animationDelay = (board.wave[i] * 90) + 'ms';
        p.classList.add('pop');
      }
    });
    if (selected !== null) preview(selected); else clearPreview();

    show('game');
    $('game-room').hidden = local;
    $('game-code').textContent = room.code || '';
    const order = toArr(st.order), turnId = order[st.turn];
    const turnP = st.players[turnId];
    const banner = $('turn');
    if (st.phase === 'over') {
      banner.textContent = st.falling ? 'Game over!' : 'Board full!';
      banner.style.background = '';
    } else if (turnId === myId && !local) {
      banner.textContent = 'Your turn';
      banner.style.background = PLAYERS[turnP.slot].seed;
    } else {
      banner.textContent = turnP ? `${turnP.name}'s turn` : 'Waiting…';
      banner.style.background = turnP ? PLAYERS[turnP.slot].seed : '';
    }
    banner.classList.toggle('mine', (local || turnId === myId) && st.phase === 'play');

    // Everyone who played this game, even if they've since left, so their cells still add up.
    const inGame = [...new Set(moves.filter(m => !m.f).map(m => m.p).concat(players.map(p => p.slot)))].sort();
    const nameOf = slot => { const p = players.find(p => p.slot === slot); return p ? p.name : `${PLAYERS[slot].label} (left)`; };
    const rows = inGame.map(slot => ({ slot, name: nameOf(slot), ...board.score[slot] }));
    $('scores').innerHTML = rows.map(r => `<tr class="${turnP && turnP.slot === r.slot && st.phase === 'play' ? 'now' : ''}">
      <td>${swatches(r.slot)}<span class="pname">${esc(r.name)}</span>${!local && players.find(p => p.slot === r.slot && p.id === myId) ? ' <span class="muted">(you)</span>' : ''}</td>
      <td class="num">${r.autos}</td><td class="num">${r.seeds ? '−' + r.seeds : 0}</td><td class="num pts">${r.points}</td></tr>`).join('');
    const empty = board.owner.filter(o => o === -1).length;
    $('left').textContent = `${empty} empty cell${empty === 1 ? '' : 's'} left`;
    // In a falling hive, say whose turn ends the round and drops the outer ring.
    if (st.falling && st.phase === 'play' && board.outer >= 0) {
      const lastId = order.slice().reverse().find(id => st.players[id]);
      const lastP = lastId && st.players[lastId];
      if (lastP) $('left').textContent += ` · 🍂 outer ring falls after ${lastId === myId && !local ? 'your' : `${lastP.name}'s`} turn`;
    }

    // Final results.
    $('over').hidden = st.phase !== 'over';
    if (st.phase === 'over') {
      const ranked = rows.slice().sort((a, b) => b.points - a.points);
      const best = ranked[0].points, winners = ranked.filter(r => r.points === best);
      $('winner').textContent = winners.length > 1 ? `Tie: ${winners.map(w => w.name).join(' & ')}!` : `${winners[0].name} wins!`;
      $('final').innerHTML = ranked.map(r => `<li>${swatches(r.slot)}<span class="pname">${esc(r.name)}</span>
        <span class="muted">${r.autos} auto − ${r.seeds} clicked =</span> <b>${r.points}</b></li>`).join('');
      $('again').hidden = !host;
      $('again-wait').hidden = host;
    }

    // If whoever's turn it is has left, the host passes the turn on.
    if (host && !local && st.phase === 'play' && !turnP) {
      room.ref.transaction(cur => {
        if (!cur || cur.phase !== 'play' || (cur.players || {})[toArr(cur.order)[cur.turn]]) return;
        cur.turn = nextTurn(cur, cur.turn);
        return cur;
      });
    }
  }

  // ── Buttons ──────────────────────────────────────────────────────────────
  $('name').value = store.get('beesnest-name') || '';
  $('create').onclick = () => { const n = myName(); if (n) createRoom(n); };
  $('join').onclick = () => {
    const n = myName(); if (!n) return;
    const code = $('join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { $('menu-error').textContent = 'Room codes are 4 letters.'; return; }
    joinRoom(code, n);
  };
  $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
  $('start').onclick = startGame;

  // How many gray cells to scatter: one number for this device, and one the host sets for an online room.
  const grayInput = el => Math.max(0, Math.min(MAX_GRAYS, Math.round(Number(el.value)) || 0));
  for (const id of ['local-grays', 'grays']) $(id).max = MAX_GRAYS;
  $('local-grays').value = Number(store.get('beesnest-grays')) || 0;
  // Falling hive: the same two places.
  $('local-falling').checked = store.get('beesnest-falling') === '1';
  $('local-falling').onchange = () => store.set('beesnest-falling', $('local-falling').checked ? '1' : '0');
  $('falling').onchange = () => {
    store.set('beesnest-falling', $('falling').checked ? '1' : '0');
    if (room && !room.local && room.st && room.st.host === myId) room.ref.update({ falling: $('falling').checked });
  };
  $('grays').onchange = () => {
    const n = grayInput($('grays'));
    $('grays').value = n;
    store.set('beesnest-grays', n);
    if (room && !room.local && room.st && room.st.host === myId) room.ref.update({ grayCount: n });
  };

  // Same-device setup: pick how many players, and optionally name them.
  let localCount = Math.min(MAX_PLAYERS, Math.max(1, Number(store.get('beesnest-local-count')) || 2));
  const savedNames = (() => { try { return JSON.parse(store.get('beesnest-local-names')) || []; } catch { return []; } })();
  $('local-names').innerHTML = PLAYERS.map((p, i) => `<div class="row local-name" data-i="${i}">
    <span class="sw" style="background:${p.seed}"></span><span class="sw" style="background:${p.auto}"></span>
    <input type="text" maxlength="16" placeholder="${p.label}" aria-label="${p.label} name" value="${esc(savedNames[i] || '')}"></div>`).join('');
  function drawLocalCount() {
    for (const b of document.querySelectorAll('#local-count button')) b.setAttribute('aria-pressed', Number(b.dataset.n) === localCount);
    for (const row of document.querySelectorAll('.local-name')) row.hidden = Number(row.dataset.i) >= localCount;
  }
  $('local-count').innerHTML = PLAYERS.map((_, i) => `<button type="button" data-n="${i + 1}">${i + 1}</button>`).join('');
  for (const b of document.querySelectorAll('#local-count button')) b.onclick = () => { localCount = Number(b.dataset.n); store.set('beesnest-local-count', localCount); drawLocalCount(); };
  drawLocalCount();
  $('local-start').onclick = () => {
    const inputs = [...document.querySelectorAll('.local-name input')];
    store.set('beesnest-local-names', JSON.stringify(inputs.map(x => x.value.trim())));
    const grays = grayInput($('local-grays'));
    $('local-grays').value = grays;
    store.set('beesnest-grays', grays);
    startLocal(inputs.slice(0, localCount).map((x, i) => x.value.trim().slice(0, 16) || PLAYERS[i].label), grays, $('local-falling').checked);
  };
  $('again').onclick = playAgain;
  for (const id of ['lobby-leave', 'game-leave', 'over-leave']) $(id).onclick = () => { leaveRoom(); show('menu'); };
  window.addEventListener('pagehide', leaveRoom);

  // The color pairs on the menu.
  $('pairs').innerHTML = PLAYERS.map(p => `<li><span class="sw" style="background:${p.seed}"></span><span class="sw" style="background:${p.auto}"></span>
    ${p.label}: <b>${p.seedName}</b> when you click, <b>${p.autoName}</b> when it fills itself</li>`).join('');

  if (!db) $('menu-error').textContent = NO_SERVER;
  show('menu');
})();
