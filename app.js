// ── Supabase 클라이언트 ──
const sb = (() => {
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

  async function query(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers });
    return res.json();
  }
  async function insert(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  async function remove(table, params) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { method: 'DELETE', headers });
  }
  return { query, insert, remove };
})();

// ── 상태 ──
let currentUser = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let myFriends = []; // 수락된 친구 목록
const COLORS = ['#534AB7','#1D9E75','#D85A30','#D4537E','#BA7517','#378ADD'];

// ── 로그인 ──
async function login() {
  const name = document.getElementById('login-name').value.trim();
  if (!name) { alert('닉네임을 입력해주세요!'); return; }
  currentUser = name;
  localStorage.setItem('lastUser', name);

  // 유저 등록 (없으면 새로 생성)
  const existing = await sb.query('users', `?id=eq.${encodeURIComponent(name)}`);
  if (!existing.length) await sb.insert('users', { id: name });

  // 공유링크로 들어온 경우 자동 친구 요청
  const params = new URLSearchParams(location.search);
  const viewUser = params.get('view');
  if (viewUser && viewUser !== currentUser) {
    await sendFriendRequestTo(viewUser);
    history.replaceState({}, '', location.pathname);
  }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('header-username').textContent = '👤 ' + name;
  document.getElementById('my-badge').textContent = '📅 ' + name;

  await loadFriends();
  renderCalendar();
}

function logout() {
  currentUser = null;
  myFriends = [];
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ── 친구 관계 로드 ──
async function loadFriends() {
  // 수락된 친구 (양방향 모두 있는 경우)
  const sent = await sb.query('friendships', `?from_user=eq.${encodeURIComponent(currentUser)}&status=eq.accepted`);
  const received = await sb.query('friendships', `?to_user=eq.${encodeURIComponent(currentUser)}&status=eq.accepted`);

  const friendNames = new Set();
  sent.forEach(r => friendNames.add(r.to_user));
  received.forEach(r => friendNames.add(r.from_user));
  myFriends = [...friendNames].map((name, i) => ({ name, color: COLORS[i % COLORS.length] }));

  renderFriendList();
  await loadFriendRequests();
}

function renderFriendList() {
  const el = document.getElementById('friend-list');
  if (!myFriends.length) {
    el.innerHTML = '<p class="empty-msg">아직 친구가 없어요</p>';
    return;
  }
  el.innerHTML = myFriends.map(f =>
    `<div class="friend-item">
      <div class="friend-dot" style="background:${f.color}"></div>
      <span>${f.name}</span>
      <button class="friend-remove" onclick="removeFriend('${f.name}')">✕</button>
    </div>`
  ).join('');
}

// ── 친구 요청 ──
async function sendFriendRequest() {
  const name = document.getElementById('friend-input').value.trim();
  if (!name) return;
  if (name === currentUser) { alert('자기 자신은 추가할 수 없어요!'); return; }
  await sendFriendRequestTo(name);
  document.getElementById('friend-input').value = '';
}

async function sendFriendRequestTo(toUser) {
  // 이미 요청했거나 친구인지 확인
  const existing = await sb.query('friendships',
    `?from_user=eq.${encodeURIComponent(currentUser)}&to_user=eq.${encodeURIComponent(toUser)}`);
  if (existing.length) { alert(toUser + ' 님에게 이미 요청을 보냈어요!'); return; }

  const reverse = await sb.query('friendships',
    `?from_user=eq.${encodeURIComponent(toUser)}&to_user=eq.${encodeURIComponent(currentUser)}`);

  if (reverse.length && reverse[0].status === 'pending') {
    // 상대방이 이미 나한테 요청 보냈으면 바로 수락
    await fetch(`${SUPABASE_URL}/rest/v1/friendships?id=eq.${reverse[0].id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ status: 'accepted' })
    });
    await sb.insert('friendships', { id: Date.now() + 'x', from_user: currentUser, to_user: toUser, status: 'accepted' });
    alert('✅ ' + toUser + ' 님과 친구가 됐어요!');
  } else if (reverse.length && reverse[0].status === 'accepted') {
    alert(toUser + ' 님은 이미 친구예요!');
    return;
  } else {
    await sb.insert('friendships', { id: Date.now().toString(), from_user: currentUser, to_user: toUser, status: 'pending' });
    alert('📨 ' + toUser + ' 님에게 친구 요청을 보냈어요!\n상대방이 앱에 접속하면 요청이 보입니다.');
  }
  await loadFriends();
  renderCalendar();
}

async function loadFriendRequests() {
  const requests = await sb.query('friendships',
    `?to_user=eq.${encodeURIComponent(currentUser)}&status=eq.pending`);
  const el = document.getElementById('request-list');
  if (!requests.length) {
    el.innerHTML = '<p class="empty-msg">없음</p>';
    return;
  }
  el.innerHTML = requests.map(r =>
    `<div class="friend-item">
      <span>👤 ${r.from_user}</span>
      <button onclick="acceptFriend('${r.id}', '${r.from_user}')" style="font-size:12px;padding:4px 8px;background:#534AB7;color:white;border:none;border-radius:6px;margin-left:auto;">수락</button>
      <button onclick="rejectFriend('${r.id}')" style="font-size:12px;padding:4px 8px;margin-left:4px;">거절</button>
    </div>`
  ).join('');
}

async function acceptFriend(id, fromUser) {
  await fetch(`${SUPABASE_URL}/rest/v1/friendships?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    body: JSON.stringify({ status: 'accepted' })
  });
  await sb.insert('friendships', { id: Date.now().toString(), from_user: currentUser, to_user: fromUser, status: 'accepted' });
  alert('✅ ' + fromUser + ' 님과 친구가 됐어요!');
  await loadFriends();
  renderCalendar();
}

async function rejectFriend(id) {
  await sb.remove('friendships', `?id=eq.${id}`);
  await loadFriendRequests();
}

async function removeFriend(name) {
  if (!confirm(name + ' 님을 친구 목록에서 삭제할까요?')) return;
  await sb.remove('friendships', `?from_user=eq.${encodeURIComponent(currentUser)}&to_user=eq.${encodeURIComponent(name)}`);
  await sb.remove('friendships', `?from_user=eq.${encodeURIComponent(name)}&to_user=eq.${encodeURIComponent(currentUser)}`);
  await loadFriends();
  renderCalendar();
}

// ── 달력 ──
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
}

async function renderCalendar() {
  document.getElementById('cal-title').textContent = currentYear + '년 ' + (currentMonth + 1) + '월';

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLast = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();

  // 내 이벤트
  const myEvents = await sb.query('events', `?owner=eq.${encodeURIComponent(currentUser)}&date=gte.${currentYear}-${String(currentMonth+1).padStart(2,'0')}-01&date=lte.${currentYear}-${String(currentMonth+1).padStart(2,'0')}-31`);

  // 친구 이벤트
  const friendEventsMap = {};
  for (const f of myFriends) {
    const fevs = await sb.query('events', `?owner=eq.${encodeURIComponent(f.name)}&privacy=neq.private&date=gte.${currentYear}-${String(currentMonth+1).padStart(2,'0')}-01`);
    for (const ev of fevs) {
      // selected 공개인 경우 내가 포함됐는지 확인
      if (ev.privacy === 'selected') {
        const check = await sb.query('event_friends', `?event_id=eq.${ev.id}&friend_name=eq.${encodeURIComponent(currentUser)}`);
        if (!check.length) continue;
      }
      if (!friendEventsMap[ev.date]) friendEventsMap[ev.date] = [];
      friendEventsMap[ev.date].push({ ...ev, friendName: f.name, color: f.color });
    }
  }

  const grid = document.getElementById('days-grid');
  let html = '';

  for (let i = 0; i < 42; i++) {
    let day, monthOffset = 0;
    if (i < firstDay) { day = prevLast - firstDay + i + 1; monthOffset = -1; }
    else if (i - firstDay + 1 > lastDate) { day = i - firstDay - lastDate + 1; monthOffset = 1; }
    else { day = i - firstDay + 1; }

    const isOther = monthOffset !== 0;
    const dateStr = formatDate(currentYear, currentMonth + monthOffset, day);
    const isToday = !isOther && today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
    const isSelected = dateStr === selectedDate;
    const dow = i % 7;
    let numClass = dow === 0 ? 'sun-num' : dow === 6 ? 'sat-num' : '';

    let chips = '';
    if (!isOther) {
      myEvents.filter(e => e.date === dateStr).slice(0, 2).forEach(ev => {
        const cls = ev.privacy === 'private' ? 'chip-private' : 'chip-mine';
        chips += `<div class="event-chip ${cls}">${ev.title}</div>`;
      });
      (friendEventsMap[dateStr] || []).slice(0, 2).forEach(ev => {
        if (ev.privacy === 'public') {
          chips += `<div class="event-chip chip-busy">${ev.friendName}: 약속있음</div>`;
        } else {
          chips += `<div class="event-chip chip-friend">${ev.friendName}: ${ev.title}</div>`;
        }
      });
    }

    html += `<div class="day-cell${isOther?' other-month':''}${isToday?' today':''}${isSelected?' selected':''}" onclick="selectDay('${dateStr}', ${isOther})">
      <div class="day-num ${numClass}">${day}</div>${chips}
    </div>`;
  }
  grid.innerHTML = html;
}

function formatDate(y, m, d) {
  const mm = ((m % 12) + 12) % 12;
  let yr = y;
  if (m < 0) yr--; if (m > 11) yr++;
  return yr + '-' + String(mm+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

// ── 날짜 선택 ──
async function selectDay(dateStr, isOther) {
  if (isOther) return;
  selectedDate = dateStr;
  const [,m,d] = dateStr.split('-');
  document.getElementById('selected-date-title').textContent = parseInt(m) + '월 ' + parseInt(d) + '일 일정';
  document.getElementById('m-date').value = dateStr;
  await renderDayDetail(dateStr);
  renderCalendar();
}

async function renderDayDetail(dateStr) {
  const myEvents = await sb.query('events', `?owner=eq.${encodeURIComponent(currentUser)}&date=eq.${dateStr}`);
  let html = '';

  myEvents.forEach(ev => {
    html += `<div class="event-detail-card">
      <div class="evt-title">${ev.title}</div>
      <div class="evt-meta">
        ⏰ ${ev.time || '시간 미정'}<br>
        ${ev.place ? '📍 ' + ev.place + '<br>' : ''}
        ${ev.memo ? '📝 ' + ev.memo + '<br>' : ''}
        ${privacyLabel(ev.privacy)}
      </div>
      <button class="evt-delete" onclick="deleteEventById('${ev.id}')">🗑 삭제</button>
    </div>`;
  });

  for (const f of myFriends) {
    const fevs = await sb.query('events', `?owner=eq.${encodeURIComponent(f.name)}&date=eq.${dateStr}&privacy=neq.private`);
    for (const ev of fevs) {
      if (ev.privacy === 'selected') {
        const check = await sb.query('event_friends', `?event_id=eq.${ev.id}&friend_name=eq.${encodeURIComponent(currentUser)}`);
        if (!check.length) continue;
      }
      if (ev.privacy === 'public') {
        html += `<div class="event-detail-card friend-event">
          <div class="evt-title">🟡 ${f.name} — 약속 있음</div>
          <div class="evt-meta">⏰ ${ev.time || '시간 미정'}<br>내용은 비공개예요</div>
        </div>`;
      } else {
        html += `<div class="event-detail-card friend-event">
          <div class="evt-title" style="color:${f.color}">● ${f.name} — ${ev.title}</div>
          <div class="evt-meta">⏰ ${ev.time || '시간 미정'}${ev.place ? '<br>📍 ' + ev.place : ''}</div>
        </div>`;
      }
    }
  }

  if (!html) html = '<p class="empty-msg">이 날은 약속이 없어요</p>';
  document.getElementById('event-detail-list').innerHTML = html;
}

function privacyLabel(p) {
  if (p === 'public') return '🌐 전체공개';
  if (p === 'friends') return '👥 친구만';
  if (p === 'selected') return '👤 특정 친구만';
  return '🔒 나만보기';
}

// ── 약속 추가 모달 ──
function openModal() {
  if (!selectedDate) {
    const t = new Date();
    document.getElementById('m-date').value = formatDate(t.getFullYear(), t.getMonth(), t.getDate());
  }
  // 친구 체크박스 렌더
  const box = document.getElementById('friend-checkboxes');
  box.innerHTML = myFriends.map(f =>
    `<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:13px;">
      <input type="checkbox" value="${f.name}" /> ${f.name}
    </label>`
  ).join('') || '<p class="empty-msg" style="font-size:12px;">친구가 없어요</p>';

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('m-privacy').onchange = toggleFriendSelect;
}

function toggleFriendSelect() {
  const val = document.getElementById('m-privacy').value;
  document.getElementById('friend-select-box').classList.toggle('hidden', val !== 'selected');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  ['m-title','m-place','m-memo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('friend-select-box').classList.add('hidden');
}
function closeModalOutside(e) { if (e.target.id === 'modal-overlay') closeModal(); }

async function saveEvent() {
  const title = document.getElementById('m-title').value.trim();
  const date = document.getElementById('m-date').value;
  if (!title) { alert('약속 이름을 입력해주세요!'); return; }
  if (!date) { alert('날짜를 선택해주세요!'); return; }

  const privacy = document.getElementById('m-privacy').value;
  const id = Date.now().toString();

  await sb.insert('events', {
    id, owner: currentUser, title, date,
    time: document.getElementById('m-time').value,
    place: document.getElementById('m-place').value.trim(),
    memo: document.getElementById('m-memo').value.trim(),
    privacy
  });

  // 특정 친구만 공개인 경우 event_friends 에 저장
  if (privacy === 'selected') {
    const checked = [...document.querySelectorAll('#friend-checkboxes input:checked')].map(el => el.value);
    for (const fname of checked) {
      await sb.insert('event_friends', { event_id: id, friend_name: fname });
    }
  }

  closeModal();
  if (selectedDate === date) await renderDayDetail(date);
  renderCalendar();
}

async function deleteEventById(id) {
  if (!confirm('이 약속을 삭제할까요?')) return;
  await sb.remove('events', `?id=eq.${id}`);
  await sb.remove('event_friends', `?event_id=eq.${id}`);
  if (selectedDate) await renderDayDetail(selectedDate);
  renderCalendar();
}

// ── 공유 링크 ──
function copyShareLink() {
  const url = location.href.split('?')[0] + '?view=' + encodeURIComponent(currentUser);
  navigator.clipboard.writeText(url).then(() => {
    alert('🔗 공유 링크가 복사됐어요!\n친구가 이 링크로 접속하면 자동으로 친구 요청이 보내집니다.');
  });
}

// ── 자동 로그인 ──
window.onload = function() {
  const last = localStorage.getItem('lastUser');
  if (last) document.getElementById('login-name').value = last;

  const params = new URLSearchParams(location.search);
  const viewUser = params.get('view');
  if (viewUser) {
    const banner = document.getElementById('login-banner');
    banner.style.cssText = 'background:#eeedfe;color:#3C3489;padding:10px;border-radius:8px;font-size:13px;margin-top:12px;text-align:center;';
    banner.innerHTML = '📅 <b>' + viewUser + '</b> 님의 공유 링크예요!<br>로그인하면 자동으로 친구 요청이 전송됩니다.';
  }
};
