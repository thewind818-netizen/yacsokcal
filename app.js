// ── 상태 ──
let currentUser = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let selectedEventId = null;

const FRIEND_COLORS = ['#534AB7','#1D9E75','#D85A30','#D4537E','#BA7517','#378ADD'];

// ── 스토리지 유틸 ──
function getData(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── 사용자 이벤트 저장/조회 ──
function getUserEvents(username) {
  return getData('events_' + username) || [];
}
function saveUserEvents(username, events) {
  setData('events_' + username, events);
}

// ── 친구 목록 저장/조회 ──
function getMyFriends() {
  return getData('friends_' + currentUser) || [];
}
function saveMyFriends(friends) {
  setData('friends_' + currentUser, friends);
}

// ── 로그인 ──
function login() {
  const name = document.getElementById('login-name').value.trim();
  if (!name) { alert('닉네임을 입력해주세요!'); return; }
  currentUser = name;
  setData('lastUser', name);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('header-username').textContent = '👤 ' + name;
  document.getElementById('my-badge').textContent = '📅 ' + name;

  // 공유 링크로 들어온 경우 자동으로 친구 추가
  const params = new URLSearchParams(location.search);
  const viewUser = params.get('view');
  if (viewUser && viewUser !== currentUser) {
    let friends = getMyFriends();
    if (!friends.find(f => f.name === viewUser)) {
      const color = FRIEND_COLORS[friends.length % FRIEND_COLORS.length];
      friends.push({ name: viewUser, color });
      saveMyFriends(friends);
      alert('✅ ' + viewUser + ' 님이 친구로 자동 추가됐어요!');
    }
    // URL에서 파라미터 제거 (뒤로가기 혼란 방지)
    history.replaceState({}, '', location.pathname);
  }

  renderFriendList();
  renderCalendar();
}

function logout() {
  currentUser = null;
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-name').value = '';
}

// ── 달력 렌더 ──
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
}

function renderCalendar() {
  const title = currentYear + '년 ' + (currentMonth + 1) + '월';
  document.getElementById('cal-title').textContent = title;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLast = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();

  // 내 이벤트 수집
  const myEvents = getUserEvents(currentUser);
  // 친구 이벤트 수집
  const friends = getMyFriends();
  const friendEventsMap = {};
  friends.forEach(f => {
    const fevs = getUserEvents(f.name).filter(e => e.privacy !== 'private');
    fevs.forEach(ev => {
      const key = ev.date;
      if (!friendEventsMap[key]) friendEventsMap[key] = [];
      friendEventsMap[key].push({ ...ev, friendName: f.name });
    });
  });

  const grid = document.getElementById('days-grid');
  let html = '';

  for (let i = 0; i < 42; i++) {
    let day, monthOffset = 0;
    if (i < firstDay) {
      day = prevLast - firstDay + i + 1;
      monthOffset = -1;
    } else if (i - firstDay + 1 > lastDate) {
      day = i - firstDay - lastDate + 1;
      monthOffset = 1;
    } else {
      day = i - firstDay + 1;
    }

    const isOther = monthOffset !== 0;
    const dateStr = formatDate(currentYear, currentMonth + monthOffset, day);
    const isToday = !isOther &&
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth &&
      today.getDate() === day;
    const isSelected = dateStr === selectedDate;

    const dow = i % 7;
    let numClass = '';
    if (dow === 0) numClass = 'sun-num';
    if (dow === 6) numClass = 'sat-num';

    // 이벤트 칩
    let chips = '';
    if (!isOther) {
      const dayMyEvs = myEvents.filter(e => e.date === dateStr);
      const dayFriendEvs = friendEventsMap[dateStr] || [];

      dayMyEvs.slice(0, 2).forEach(ev => {
        const cls = ev.privacy === 'private' ? 'chip-private' : 'chip-mine';
        chips += `<div class="event-chip ${cls}">${ev.title}</div>`;
      });
      dayFriendEvs.slice(0, 2).forEach(ev => {
        if (ev.privacy === 'public') {
          chips += `<div class="event-chip chip-busy">${ev.friendName}: 약속있음</div>`;
        } else {
          chips += `<div class="event-chip chip-friend">${ev.friendName}: ${ev.title}</div>`;
        }
      });
    }

    html += `<div class="day-cell${isOther ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}"
      onclick="selectDay('${dateStr}', ${isOther})">
      <div class="day-num ${numClass}">${day}</div>
      ${chips}
    </div>`;
  }

  grid.innerHTML = html;
}

function formatDate(y, m, d) {
  const mm = ((m % 12) + 12) % 12;
  let yr = y;
  if (m < 0) yr--;
  if (m > 11) yr++;
  return yr + '-' + String(mm + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

// ── 날짜 선택 ──
function selectDay(dateStr, isOther) {
  if (isOther) return;
  selectedDate = dateStr;
  const [y, m, d] = dateStr.split('-');
  document.getElementById('selected-date-title').textContent = m + '월 ' + parseInt(d) + '일 일정';
  document.getElementById('m-date').value = dateStr;
  renderDayDetail(dateStr);
  renderCalendar();
}

function renderDayDetail(dateStr) {
  const myEvents = getUserEvents(currentUser).filter(e => e.date === dateStr);
  const friends = getMyFriends();
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

  friends.forEach(f => {
    const fevs = getUserEvents(f.name).filter(e => e.date === dateStr && e.privacy !== 'private');
    fevs.forEach(ev => {
      if (ev.privacy === 'public') {
        html += `<div class="event-detail-card friend-event">
          <div class="evt-title">🟡 ${f.name} — 약속 있음</div>
          <div class="evt-meta">⏰ ${ev.time || '시간 미정'}<br>내용은 비공개예요</div>
        </div>`;
      } else {
        html += `<div class="event-detail-card friend-event">
          <div class="evt-title">🟢 ${f.name} — ${ev.title}</div>
          <div class="evt-meta">
            ⏰ ${ev.time || '시간 미정'}<br>
            ${ev.place ? '📍 ' + ev.place + '<br>' : ''}
          </div>
        </div>`;
      }
    });
  });

  if (!html) html = '<p class="empty-msg">이 날은 약속이 없어요</p>';
  document.getElementById('event-detail-list').innerHTML = html;
}

function privacyLabel(p) {
  if (p === 'public') return '🌐 전체공개';
  if (p === 'friends') return '👥 친구만';
  return '🔒 나만보기';
}

// ── 약속 추가 ──
function openModal() {
  if (!selectedDate) {
    const today = new Date();
    document.getElementById('m-date').value = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  }
  // 기본 공개 설정 반영
  const defaultPrivacy = document.querySelector('input[name="default-privacy"]:checked').value;
  document.getElementById('m-privacy').value = defaultPrivacy;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('m-title').value = '';
  document.getElementById('m-place').value = '';
  document.getElementById('m-memo').value = '';
}

function closeModalOutside(e) {
  if (e.target.id === 'modal-overlay') closeModal();
}

function saveEvent() {
  const title = document.getElementById('m-title').value.trim();
  const date = document.getElementById('m-date').value;
  if (!title) { alert('약속 이름을 입력해주세요!'); return; }
  if (!date) { alert('날짜를 선택해주세요!'); return; }

  const ev = {
    id: Date.now().toString(),
    title,
    date,
    time: document.getElementById('m-time').value,
    place: document.getElementById('m-place').value.trim(),
    memo: document.getElementById('m-memo').value.trim(),
    privacy: document.getElementById('m-privacy').value,
  };

  const events = getUserEvents(currentUser);
  events.push(ev);
  saveUserEvents(currentUser, events);
  closeModal();
  if (selectedDate === date) renderDayDetail(date);
  renderCalendar();
}

function deleteEventById(id) {
  if (!confirm('이 약속을 삭제할까요?')) return;
  let events = getUserEvents(currentUser).filter(e => e.id !== id);
  saveUserEvents(currentUser, events);
  if (selectedDate) renderDayDetail(selectedDate);
  renderCalendar();
}

// ── 친구 관리 ──
function addFriend() {
  const name = document.getElementById('friend-input').value.trim();
  if (!name) return;
  if (name === currentUser) { alert('자기 자신은 추가할 수 없어요!'); return; }
  let friends = getMyFriends();
  if (friends.find(f => f.name === name)) { alert('이미 추가된 친구예요!'); return; }
  const color = FRIEND_COLORS[friends.length % FRIEND_COLORS.length];
  friends.push({ name, color });
  saveMyFriends(friends);
  document.getElementById('friend-input').value = '';
  renderFriendList();
  renderCalendar();
}

function removeFriend(name) {
  let friends = getMyFriends().filter(f => f.name !== name);
  saveMyFriends(friends);
  renderFriendList();
  renderCalendar();
}

function renderFriendList() {
  const friends = getMyFriends();
  const el = document.getElementById('friend-list');
  if (!friends.length) {
    el.innerHTML = '<p class="empty-msg">친구를 추가하면<br>일정이 함께 보여요</p>';
    return;
  }
  el.innerHTML = friends.map(f =>
    `<div class="friend-item">
      <div class="friend-dot" style="background:${f.color}"></div>
      <span>${f.name}</span>
      <button class="friend-remove" onclick="removeFriend('${f.name}')">✕</button>
    </div>`
  ).join('');
}

// ── 공유 링크 ──
function copyShareLink() {
  const url = location.href.split('?')[0] + '?view=' + encodeURIComponent(currentUser);
  navigator.clipboard.writeText(url).then(() => {
    alert('공유 링크가 복사됐어요! 친구에게 보내면,\n친구가 앱에서 내 닉네임(' + currentUser + ')을 추가할 수 있어요 😊');
  });
}

// ── 자동 로그인 ──
window.onload = function() {
  const last = getData('lastUser');
  if (last) document.getElementById('login-name').value = last;

  // URL 파라미터로 공유 링크 진입 감지
  const params = new URLSearchParams(location.search);
  const viewUser = params.get('view');
  if (viewUser) {
    // 이미 로그인된 경우 바로 친구 추가
    if (last) {
      // 로그인 후 처리되도록 힌트 배너 표시
      const hint = document.createElement('p');
      hint.style.cssText = 'background:#eeedfe;color:#3C3489;padding:10px 16px;border-radius:8px;font-size:13px;margin-top:12px;text-align:center;';
      hint.innerHTML = '📅 <b>' + viewUser + '</b> 님의 공유 링크예요!<br>로그인하면 자동으로 친구 추가됩니다.';
      document.querySelector('.login-box').appendChild(hint);
    } else {
      const hint = document.createElement('p');
      hint.style.cssText = 'background:#eeedfe;color:#3C3489;padding:10px 16px;border-radius:8px;font-size:13px;margin-top:12px;text-align:center;';
      hint.innerHTML = '📅 <b>' + viewUser + '</b> 님의 공유 링크예요!<br>닉네임을 입력하고 시작하면 자동으로 친구 추가됩니다.';
      document.querySelector('.login-box').appendChild(hint);
    }
  }
};
