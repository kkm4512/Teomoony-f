'use strict';
/* Teomoony-f — 단지 검색 / 지도 / 필지 폴리곤 */

const $ = s => document.querySelector(s);

/* ═══════════ 불러오는 중 표시 (2026-10-21, 사장님 요청) ═══════════
   "로딩 중일 때 표시가 없어서 도는 건지 안 도는 건지 헷갈린다."
   ★ fetch 가 21군데에 흩어져 있다. 한 곳씩 달면 언젠가 빠뜨린다(작업방식 10장) -
     그래서 **fetch 자체를 한 번 감싼다.** /api/ 로 가는 것은 전부 저절로 잡힌다.
   ★ 300ms 안에 끝나면 아무것도 안 띄운다. 마커(0.2초)처럼 빠른 것까지 깜박이면
     오히려 시끄럽다. 그보다 오래 걸리면 위쪽 띠 + 아래쪽 칩이 뜬다.
   ★ 칩에 **몇 초째인지** 적는다. "도는 건지 멈춘 건지" 는 숫자가 올라가는지로 안다.
   ★ 실패해도(네트워크 끊김 · 예외) finally 로 반드시 내린다 - 안 그러면 영원히 돈다. */
const 로딩 = (() => {
  const 진행 = new Map();            /* 번호 -> { 이름, 시작 } */
  let 번호 = 0, 보임 = false, 타이머 = null, 지연 = null;
  const 이름표 = [
    [/^\/api\/complexes\/markers$/,       '지도 단지'],
    [/^\/api\/complexes\/near$/,          '내 위치 주변'],
    [/^\/api\/complexes\/\d+\/points$/,   '주변 지점'],
    [/^\/api\/complexes\/\d+\/geo$/,      '단지 경계'],
    [/^\/api\/complexes\/\d+\/buildings$/,'건물 외곽선'],
    [/^\/api\/complexes\/\d+$/,           '단지 상세'],
    [/^\/api\/complexes$/,                '검색'],
    [/^\/api\/newbuilds\/[^/]+$/,         '신축 상세'],
    [/^\/api\/newbuilds$/,                '신축 단지'],
    [/^\/api\/lawds\/[^/]+\/geo$/,        '법정동 경계'],
    [/^\/api\/lawds$/,                    '법정동'],
    [/^\/api\/adms$/,                     '행정동 경계'],
    [/^\/api\/adms\/[^/]+\/geo$/,          '행정동 경계'],
    [/^\/api\/suggest$/,                  '자동완성'],
    [/^\/api\/(zones|redev)$/,            '겹쳐보기'],
    [/^\/api\/buildings$/,                '건물 외곽선'],
    [/^\/api\/parcels$/,                  '필지'],
    [/^\/api\/ho\/[^/]+$/,                '호 상세'],
    [/^\/api\/ask$/,                      'AI 검색'],
    [/^\/api\/login$/,                    '로그인'],
    [/^\/api\/usage$/,                    '이용현황'],
    [/^\/api\/(health|config|me)$/,       '상태'],
  ];
  const 이름 = 경로 => { for (const [무늬, n] of 이름표) if (무늬.test(경로)) return n; return '데이터'; };

  let 띠, 칩;
  function 만들기() {
    if (띠) return;
    띠 = document.createElement('div'); 띠.className = 'ld-bar'; 띠.hidden = true;
    칩 = document.createElement('div'); 칩.className = 'ld-chip'; 칩.hidden = true;
    칩.setAttribute('role', 'status'); 칩.setAttribute('aria-live', 'polite');
    document.body.append(띠, 칩);
  }
  function 그리기() {
    if (!진행.size) return;
    let 가장오래 = null;
    for (const v of 진행.values()) if (!가장오래 || v.시작 < 가장오래.시작) 가장오래 = v;
    const 초 = Math.floor((Date.now() - 가장오래.시작) / 1000);
    const 더 = 진행.size > 1 ? ` 외 ${진행.size - 1}건` : '';
    const 늦음 = 초 >= 10 ? '<span class="ld-late">오래 걸리고 있습니다 — 아직 기다리는 중</span>' : '';
    칩.innerHTML = `<span class="ld-dot"></span><span>${esc(가장오래.이름)}${더} 불러오는 중…</span>`
                 + `<b class="ld-sec">${초}초</b>${늦음}`;
  }
  function 켜기() {
    만들기(); 보임 = true; 띠.hidden = false; 칩.hidden = false; 그리기();
    if (!타이머) 타이머 = setInterval(그리기, 1000);
  }
  function 끄기() {
    보임 = false; clearTimeout(지연); 지연 = null;
    clearInterval(타이머); 타이머 = null;
    if (띠) { 띠.hidden = true; 칩.hidden = true; }
  }
  function 시작(경로) {
    const k = ++번호;
    진행.set(k, { 이름: 이름(경로), 시작: Date.now() });
    if (보임) 그리기();
    else if (!지연) 지연 = setTimeout(() => { 지연 = null; if (진행.size) 켜기(); }, 300);
    return k;
  }
  function 끝(k) { 진행.delete(k); if (!진행.size) 끄기(); else if (보임) 그리기(); }
  return { 시작, 끝, 진행 };
})();

/* ═══════════ 오류 카드 (2026-10-21, 사장님 요청) ═══════════
   "오류 문구가 알럿 같은 형태로 나왔으면 — 관리자에게 물어보세요, 단지코드: 123456"
   ★ 정의 — 무엇을 카드로, 무엇을 토스트로, 무엇을 아무것도 안 띄우나
     카드   : 사람이 **직접 누른 것**이 실패 — 단지·신축·법정동 열기, 검색, AI 검색, 호 상세
     토스트 : 지도를 움직일 때마다 **저절로** 나가는 것 — 마커, 필지, 겹쳐보기, 법정동 목록,
              주변 지점. 카드를 띄우면 지도를 끌 때마다 튀어나온다. 토스트의 [자세히] 로 카드를 연다.
     없음   : 404 — '없다' 는 오류가 아니라 **사실**이다. 그 자리에 지금처럼 적는다.
              401(AI 검색) — '아직 안 들어왔다' 다. 로그인 칸을 편다.
   ★ 카드에 담는 것: 무엇이 실패했나 · 쉬운 말 · [다시 시도] · 오류번호 · 단지코드 · 시각 · [복사]
   ★ **오류번호**가 핵심이다. 서버가 모든 요청에 붙이는 X-Request-Id 이고 접속 기록
     ops.req_log.요청번호 에 같은 번호가 원인(오류 원문)과 함께 들어간다.
     관리자는 /api/_reqlog?번호=XXXX-XXXX 로 그 요청 한 줄을 바로 찾는다.
     서버에 닿지도 못한 실패(인터넷 끊김)는 번호가 없다 - **지어내지 않고** '번호 없음' 이라 적는다.
   ★ 같은 카드가 겹쳐 뜨지 않는다 - 같은 실패가 또 나면 '같은 오류 N번째' 만 올린다. */
const 오류판 = { 마지막: null, 횟수: 0, 열림키: null };

function 오류말(응답, 예외) {
  const 상태 = 응답 && 응답._상태;
  const 글 = String((응답 && (응답.error || 응답.hint)) || (예외 && 예외.message) || '');
  if (예외 && !응답)
    return { 말: '서버에 닿지 못했습니다. 인터넷 연결을 확인하고 다시 해 보세요.', 종류: '연결' };
  if (/timeout|ETIMEOUT|오래 걸려/i.test(글))
    return { 말: '응답이 너무 오래 걸려 끊었습니다. 잠시 뒤 다시 해 보세요.', 종류: '시간초과' };
  if (/deadlock|교착|겹쳤습니다/i.test(글))
    return { 말: '데이터를 받는 작업과 잠시 겹쳤습니다. 잠시 뒤 다시 해 보세요.', 종류: '겹침' };
  if (상태 === 524)
    return { 말: '응답이 100초를 넘겨 중간(Cloudflare)에서 끊겼습니다. 잠시 뒤 다시 해 보세요.', 종류: '시간초과' };
  if (상태 === 502 || 상태 === 503 || 상태 === 504 || (상태 >= 520 && 상태 <= 530))
    return { 말: `서버가 잠시 응답하지 않습니다(HTTP ${상태}). 잠시 뒤 다시 해 보세요.`, 종류: '서버멈춤' };
  if (상태 === 400)
    return { 말: '요청 형식이 맞지 않습니다. 화면 쪽 문제일 수 있습니다.', 종류: '요청' };
  return { 말: '서버에서 오류가 났습니다. 잠시 뒤 다시 해 보세요.', 종류: '서버' };
}
/* 받침이 있으면 '을', 없으면 '를' — '단지 상세을(를)' 같은 말을 안 쓰려고 */
const 을를 = w => { const c = String(w).trim().slice(-1).charCodeAt(0);
  return w + (c >= 0xAC00 && c <= 0xD7A3 ? ((c - 0xAC00) % 28 ? '을' : '를') : '을(를)'); };
const 번호보기 = n => n ? String(n).replace(/^(.{4})(.+)$/, '$1-$2') : null;
function 지금시각() {
  const d = new Date(), 두 = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${두(d.getMonth() + 1)}-${두(d.getDate())} ${두(d.getHours())}:${두(d.getMinutes())}:${두(d.getSeconds())}`;
}

function 오류카드({ 무엇, 응답, 예외, 단지코드, 다시 } = {}) {
  const { 말, 종류 } = 오류말(응답, 예외);
  const 번호 = 번호보기(응답 && (응답._번호 || 응답.요청번호));
  const 시각 = 지금시각();
  const 키 = (무엇 || '') + '|' + 종류 + '|' + (단지코드 || '');
  오류판.마지막 = { 무엇, 응답, 예외, 단지코드, 다시 };

  let el = document.getElementById('errcard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'errcard'; el.className = 'ec-wrap'; el.hidden = true;
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'ec-title');
    document.body.append(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-ec-close]')) 오류카드닫기();
      else if (e.target.closest('[data-ec-ask]')) 문의펴기();
      else if (e.target.closest('[data-ec-send]')) 문의보내기();
      else if (e.target.closest('[data-ec-login]')) {
        오류카드닫기();
        if (!askMode) setMode('ask');
        로그인띄우기('', '로그인하면 오류 창에서 문의를 남길 수 있습니다.');
      } else if (e.target.closest('[data-ec-copy]')) 오류복사(e.target.closest('[data-ec-copy]'));
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !el.hidden) 오류카드닫기();
    });
  }
  /* 같은 실패가 열려 있는 카드 위에 또 오면 숫자만 올린다 */
  if (!el.hidden && 오류판.열림키 === 키) {
    오류판.횟수++;
    const c = el.querySelector('.ec-again');
    if (c) { c.hidden = false; c.textContent = `같은 오류가 ${오류판.횟수}번 났습니다`; }
    return;
  }
  오류판.열림키 = 키; 오류판.횟수 = 1; 오류판.다시 = 다시 || null;
  오류판.카드 = { 무엇: 무엇 || '요청', 말, 오류번호: 번호, 단지코드: 단지코드 != null ? String(단지코드) : null, 화면: location.href };
  오류판.복사글 = [`[터무니 오류] ${무엇 || '요청'} 실패`, 말,
    `오류번호 ${번호 || '없음(서버에 닿지 못함)'}`,
    단지코드 != null ? `단지코드 ${단지코드}` : null,
    `시각 ${시각}`, `화면 ${location.href}`].filter(Boolean).join('\n');

  const 자세히 = 개발중 && (응답 || 예외)
    ? `<details class="ec-dev"><summary>자세히 (이 컴퓨터에서만 보입니다)</summary><pre>${esc(
        JSON.stringify(응답 || { 예외: String(예외 && 예외.message) }, null, 1).slice(0, 1500))}</pre></details>` : '';
  el.innerHTML = `
    <div class="ec-box">
      <div class="ec-h"><span class="ec-ic" aria-hidden="true">!</span>
        <h3 id="ec-title">${esc(을를(무엇 || '요청'))} 불러오지 못했습니다</h3></div>
      <p class="ec-msg">${esc(말)}</p>
      <p class="ec-again" hidden></p>
      <dl class="ec-ids">
        <dt>오류번호</dt><dd>${번호 ? `<b>${esc(번호)}</b>` : '<span class="muted">없음 — 서버에 닿지 못했습니다</span>'}</dd>
        ${단지코드 != null ? `<dt>단지코드</dt><dd><b>${esc(단지코드)}</b></dd>` : ''}
        <dt>시각</dt><dd>${esc(시각)}</dd>
      </dl>
      <p class="ec-help">계속되면 <b>문의 남기기</b>로 알려 주세요 — 오류번호·시각·화면이 같이 남아 그 요청을 바로 찾을 수 있습니다.</p>
      ${자세히}
      <div class="ec-ask" hidden></div>
      <div class="ec-btns">
        <!-- 2026-10-22 사장님 "다시하기 빼고 문의남기기 · 로그인된 유저만" — 다시 시도는 같은 동작을 사용자가 다시 하면 된다 -->
        <button type="button" class="ec-b ec-pri" data-ec-ask>문의 남기기</button>
        <button type="button" class="ec-b" data-ec-copy>번호 복사</button>
        <button type="button" class="ec-b" data-ec-close>닫기</button>
      </div>
    </div>`;
  el.hidden = false;
  el.querySelector('[data-ec-ask]').focus();
}
/* 문의 남기기 — 로그인한 사용자만(서버도 토큰을 본다, 310). 오류 정보는 저절로 붙고, 글은 비워도 된다. */
function 문의펴기() {
  const el = document.getElementById('errcard'); if (!el) return;
  const box = el.querySelector('.ec-ask'); if (!box) return;
  box.hidden = false;
  { const ask = el.querySelector('.ec-btns [data-ec-ask]'); if (ask) ask.hidden = true; }   // 펼친 뒤엔 같은 단추를 또 안 보인다
  if (!토큰()) {
    box.innerHTML = `<p class="ec-help">문의는 <b>로그인한 사용자만</b> 남길 수 있습니다.</p>
      <button type="button" class="ec-b" data-ec-login>로그인하러 가기</button>`;
    return;
  }
  box.innerHTML = `<label class="ec-help" for="ec-txt">무엇을 하다가 났는지 적어 주세요(비워도 됩니다 — 오류번호·시각·화면은 저절로 같이 남습니다).</label>
    <textarea id="ec-txt" class="ec-txt" maxlength="2000" rows="3" placeholder="예) AI 검색에 '은평구 신축 아파트' 를 넣었습니다"></textarea>
    <div class="ec-btns"><button type="button" class="ec-b ec-pri" data-ec-send>보내기</button><span class="ec-sent muted"></span></div>`;
  el.querySelector('#ec-txt').focus();
}
async function 문의보내기() {
  const el = document.getElementById('errcard'); if (!el) return;
  const btn = el.querySelector('[data-ec-send]'), out = el.querySelector('.ec-sent');
  const 내용 = (el.querySelector('#ec-txt') || {}).value || '';
  if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
  try {
    const t = 토큰();
    const r = await fetch('/api/inquiry', { method: 'POST',
      headers: { 'content-type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
      body: JSON.stringify({ ...(오류판.카드 || {}), 내용 }) });
    const d = await r.json();
    if (r.status === 401) { 토큰저장(''); 문의펴기(); return; }       // 만료 — 로그인 안내로
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
    el.querySelector('.ec-ask').innerHTML = `<p class="ec-help"><b>문의를 남겼습니다</b> (문의번호 ${esc(String(d.문의번호))}). 고맙습니다.</p>`;
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '보내기'; }
    if (out) out.textContent = '보내지 못했습니다 — ' + e.message;
  }
}
function 오류카드닫기() {
  const el = document.getElementById('errcard');
  if (el) el.hidden = true;
  오류판.열림키 = null;
}
async function 오류복사(btn) {
  const 글 = 오류판.복사글 || '';
  let ok = false;
  try { await navigator.clipboard.writeText(글); ok = true; } catch {
    /* 클립보드 권한이 없는 곳(http·일부 인앱 브라우저) - 옛 방식으로 */
    try {
      const t = document.createElement('textarea'); t.value = 글;
      t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t);
      t.select(); ok = document.execCommand('copy'); t.remove();
    } catch { ok = false; }
  }
  if (btn) { const 원래 = btn.textContent; btn.textContent = ok ? '복사했습니다' : '복사 못 함 — 직접 적어 주세요';
             setTimeout(() => { btn.textContent = 원래; }, 2000); }
}
/* 저절로 나가는 요청의 실패 — 지도를 덮지 않게 토스트로, [자세히] 를 누르면 카드 */
function 오류토스트(무엇, 응답, 예외, ms = 7000) {
  오류판.토스트 = { 무엇, 응답, 예외 };
  const { 말 } = 오류말(응답, 예외);
  const 번호 = 번호보기(응답 && (응답._번호 || 응답.요청번호));
  toast(`${esc(무엇)} 조회 실패 — ${esc(말)}`
    + (번호 ? ` <span class="ec-tno">오류번호 <b>${esc(번호)}</b></span>` : '')
    + ` <button type="button" class="ec-tbtn" data-ec-open>자세히</button>`, ms);
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-ec-open]')) return;
  const t = 오류판.토스트; if (!t) return;
  toast('');
  오류카드({ 무엇: t.무엇, 응답: t.응답, 예외: t.예외 });
});

{
  const 원래fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let 경로 = '';
    try { 경로 = new URL(typeof input === 'string' ? input : input.url, location.href).pathname; }
    catch { /* 못 읽으면 표시만 건너뛴다 */ }
    if (!경로.startsWith('/api/')) return 원래fetch(input, init);
    /* ★ 2026-10-26 사장님 "이용현황의 사람 동작에서 나나 너는 제외해 줘" — 로그인해 있으면 모든 /api 요청에 토큰을 실어
       서버가 운영자(root) 요청을 이용현황에서 뺀다. 전에는 /api/me 가 답하기 전 첫 화면 요청들(지도 훑기 · 신축 단지 · 단지 목록)이
       새 IP(휴대폰 등)에서 '사람' 으로 세어졌다. 이미 Authorization 을 단 요청은 그대로 둔다. */
    try {
      const t = localStorage.getItem('tm_token');
      if (t && typeof input === 'string') {
        const h = new Headers((init && init.headers) || {});
        if (!h.has('Authorization')) { h.set('Authorization', 'Bearer ' + t); init = { ...(init || {}), headers: h }; }
      }
    } catch { /* 저장소를 못 읽으면 그냥 보낸다 */ }
    const k = 로딩.시작(경로);
    let p;
    /* ★ 2026-10-25 문의 4: 서버가 다시 뜨는 몇 초(또는 Cloudflare 와 PC 사이가 잠깐 끊긴 때) 단지 상세가 502 로 떨어졌다.
       **우리 서버까지 오지 못한** 실패(502·503·504 인데 X-Request-Id 가 없음 · 네트워크 오류)는 읽기(GET)만 두 번 더 해 본다(1초 · 3초 뒤).
       우리 서버가 답한 오류(번호가 있는 것)는 다시 하지 않는다 — 같은 답이 또 온다. */
    const 읽기 = !init || !init.method || String(init.method).toUpperCase() === 'GET';
    const 닿지못함 = r => [502, 503, 504].includes(r.status) && !r.headers.get('X-Request-Id');
    const 한번 = () => 원래fetch(input, init);
    const 다시해봄 = 읽기
      ? (n = 0) => 한번().then(r => (n < 2 && 닿지못함(r)) ? new Promise(ok => setTimeout(ok, n ? 3000 : 1000)).then(() => 다시해봄(n + 1)) : r,
                              e => { if (n < 2 && !(e && e.name === 'AbortError')) return new Promise(ok => setTimeout(ok, n ? 3000 : 1000)).then(() => 다시해봄(n + 1)); throw e; })
      : 한번;
    try { p = 다시해봄(); } catch (e) { 로딩.끝(k); throw e; }
    /* ★ 응답 머리가 왔을 때가 아니라 **본문까지 다 읽었을 때** 끝내고 싶지만,
       본문은 부르는 쪽이 .json() 으로 읽는다. 큰 응답(외곽선 수 MB)은 본문이 길다 -
       그래서 Response 의 json/text 를 감싸 거기서 끝낸다. 본문을 안 읽는 쪽을 위해
       머리 도착 후 10초 뒤에도 한 번 끝낸다(두 번 불러도 안전하다). */
    return p.then(r => {
      let 끝냄 = false;
      const 마침 = () => { if (!끝냄) { 끝냄 = true; 로딩.끝(k); } };
      for (const m of ['json', 'text', 'blob', 'arrayBuffer']) {
        const f = r[m] && r[m].bind(r);
        if (f) r[m] = () => f().finally(마침);
      }
      /* ★ 실패한 응답의 JSON 에 **오류번호와 상태**를 붙인다(2026-10-21, 오류 카드).
         부르는 쪽 21군데가 `.then(r => r.json())` 으로 몸통만 받으므로, 응답 머리의
         X-Request-Id 와 상태 번호를 거기서는 못 본다. 그래서 몸통에 실어 보낸다.
         밑줄로 시작하는 이름은 서버가 주는 칸과 안 겹치게 하려는 것이다. */
      if (!r.ok) {
        const j = r.json;
        /* ★ 2026-10-22 ('AI 검색 실패 — 서버에 닿지 못했습니다', 그 요청은 접속 기록에 없음):
           실패 응답의 몸통이 **JSON 이 아니면**(Cloudflare 의 524·502 HTML 등) .json() 이 던지고,
           부르는 쪽 catch 가 그걸 '인터넷 끊김' 으로 적었다 — **닿긴 닿았는데** 닿지 못했다고 거짓말한 것.
           그래서 몸통을 못 읽으면 상태 번호를 담은 오류 몸통을 만들어 준다(지어내지 않는다 — 상태와 '몸통이 JSON 아님' 만). */
        r.json = () => j().then(v => {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            v._번호 = r.headers.get('X-Request-Id') || v.요청번호 || null;
            v._상태 = r.status;
          }
          return v;
        }, () => ({ error: `HTTP ${r.status} — 응답 몸통이 JSON 이 아닙니다`, _상태: r.status,
                    _번호: r.headers.get('X-Request-Id') || null, _비JSON: true }));
      }
      setTimeout(마침, 10000);
      return r;
    }, e => { 로딩.끝(k); throw e; });
  };
}
/* 호 상세 닫기 — 버튼·배경·Esc 셋 다. 한 번만 단다(재렌더와 무관). */
document.addEventListener('click', e => {
  const m = document.getElementById('homodal');
  if (!m || !m.classList.contains('on')) return;
  if (e.target.closest('[data-ho-close]') || e.target === m) m.classList.remove('on');
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('homodal');
  if (m) m.classList.remove('on');
});

const fmt = n => (n == null ? '—' : Number(n).toLocaleString('ko-KR'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const eok = v => {
  if (v == null) return '—';
  const n = Number(v);
  const eo = Math.floor(n / 100000000), man = Math.round((n % 100000000) / 10000);
  return eo ? `${eo}억${man ? ' ' + fmt(man) : ''}` : `${fmt(man)}만`;
};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* 이름 없는 단지는 complex_nm 이 주소 문자열이다
   ("서울특별시 성북구 장위동 115번지"). 그대로 자르면 "서울특별시 성" 만 남는다.
   법정동까지를 떼어내고 뒤쪽(지번)만 쓴다. 진짜 단지명은 그대로 둔다. */
/* ★ 개발 중일 때만 보여줄 것들(2026-10-19). 배포 전에는 "py load_xxx.py 를
   실행하세요" 같은 안내가 나 혼자 보는 화면이라 괜찮았는데, teomoony.com 을
   연 순간부터는 **방문자에게 내부 사정과 경로를 보여주는 꼴**이 됐다.
   판정은 호스트 이름으로 한다 - 빌드 과정이 없는 프로젝트라 이게 가장 단순하다. */
const 개발중 = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

/* ★ 좁은 화면에서는 지도 범례를 **접은 채로** 연다(2026-10-20).
   휴대폰에서 이 범례가 지도를 거의 다 덮고 있었다 - 처음 보는 사람에게
   필요한 설명이지만, 매번 화면의 절반을 내줄 만큼은 아니다.
   <details> 라서 여는 건 사용자 몫이고, 한 번 열면 그 세션 동안 열려 있다.
   ★ CSS 로는 못 닫는다(open 속성이라) - 그래서 여기서 한다. */
try {
  if (window.matchMedia('(max-width: 640px)').matches) {
    const lg = document.getElementById('maplegend');
    if (lg) lg.open = false;
  }
} catch (e) {}

/* ★ 지도 크기가 바뀌면 Leaflet 에 **알려 줘야** 한다(2026-10-20).
   휴대폰에서 지도 아래가 하얗게 비어 보였다. 칸은 제대로 잡혀 있었는데
   (84 + 422 + 306 = 812) 타일을 그 넓이로 다시 안 그린 것이다.
   주소창이 숨고 나타나거나 화면을 돌리면 높이가 바뀌므로 그때마다 알린다.
   ★ 묶어서 한 번만 부른다 - resize 는 드래그 중에 수십 번 온다. */
(function () {
  let t = null;
  const 알리자 = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      /* map 은 이 파일의 모듈 스코프 변수다. window.map 이 아니다 -
         classic script 의 let 은 window 에 안 붙는다. */
      try { if (typeof map !== 'undefined' && map) map.invalidateSize(); } catch (e) {}
    }, 150);
  };
  window.addEventListener('resize', 알리자);
  window.addEventListener('orientationchange', 알리자);

  /* ★ window 의 resize 만으로는 모자란다(2026-10-20). 휴대폰에서 지도 칸은
     306px 인데 타일이 134px 만 그려져 있었다 - 창 크기는 그대로인 채
     **패널 내용이 나중에 로드되면서** 지도 칸만 커졌기 때문이다.
     그때는 resize 이벤트가 오지 않는다. 칸 자체를 지켜봐야 한다. */
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.querySelector('.mapwrap');
    if (!box || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(알리자).observe(box);
  });
})();

/* ---------------- 최근 본 단지 ----------------
   검색어 문자열이 아니라 **코드**로 저장한다. '롯데캐슬' 처럼 여러 개가 걸리는 말은
   다시 골라야 하기 때문이다. 단지코드는 complex_identity 로 재현되게 설계돼 있어
   나중에 열어도 같은 단지가 나온다(README 5장).

   localStorage 는 브라우저마다 따로이고 비워질 수 있다. 읽기·쓰기를 감싸고,
   없어도 화면이 정상으로 돈다. */
const RECENT_KEY = 'teomoony.recent';
const RECENT_MAX = 12;

function recentLoad() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter(e => e && e.k && e.id) : [];
  } catch (e) { return []; }
}

function recentPush(k, id, nm, sub) {
  try {
    const list = recentLoad().filter(e => !(e.k === k && String(e.id) === String(id)));
    list.unshift({ k, id, nm: nm || '', sub: sub || '' });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch (e) { /* 저장 못 해도 조회는 된다 */ }
  if (!$('#q').value.trim()) renderList();
}

function recentClear() {
  try { localStorage.removeItem(RECENT_KEY); } catch (e) {}
  renderList();
}

function recentRows() {
  /* 검색 중에는 띄우지 않는다. 결과를 밀어내면 방해가 된다. */
  if ($('#q').value.trim()) return '';
  const list = recentLoad();
  if (!list.length) return '';
  return `<li class="rechead">최근 본 단지
      <button type="button" class="reclear" id="reclear">지우기</button></li>` +
    list.map(e => `
    <li><button class="row recent${e.k === 'n' || e.k === 'h' || e.k === 'p' ? ' nb' : ''}"
            ${e.k === 'n' ? `data-kapt="${esc(e.id)}"` : e.k === 'h' ? `data-hpk="${esc(e.id)}"` : e.k === 'p' ? `data-pbk="${esc(e.id)}"` : `data-id="${esc(e.id)}"`}
            aria-current="${e.k === 'n' ? e.id === selectedKapt : e.k === 'h' ? e.id === 고른승인 : e.k === 'p' ? e.id === 고른공사 : Number(e.id) === selected}">
      <span class="sw ${e.k === 'n' || e.k === 'h' || e.k === 'p' ? 'nb' : 'rec'}"></span>
      <span class="mid">
        <span class="nm">${esc(e.nm || '(이름 없음)')}${
          e.k === 'n' ? ' <span class="tag">대장없음</span>' : e.k === 'h' ? ' <span class="tag">사업승인</span>' : e.k === 'p' ? ' <span class="tag">공사 중</span>' : ''}</span>
        <span class="ad">${esc(e.sub || '')}</span>
      </span>
    </button></li>`).join('');
}

/* PNU 19자리 뒤 9자리가 본번(4)+부번(4). '1290' / '542-1' 로 읽는다. */
function pnuJibun(pnu) {
  if (!pnu || pnu.length !== 19) return pnu || '—';
  const bun = parseInt(pnu.slice(11, 15), 10), ji = parseInt(pnu.slice(15, 19), 10);
  const san = pnu[10] === '2' ? '산 ' : '';
  return san + bun + (ji ? '-' + ji : '');
}

/* 거래일은 CHAR(8) YYYYMMDD 다. 계약일이 그대로 들어 있으므로 일자까지 보여준다.
   (평형 집계의 '최근' 은 MAX(deal_ymd) — 특정 한 건의 날짜라 일자가 의미 있다) */
/* ★ 2026-10-24 사장님 "일자 형태 통일 — 연도가 있으면 yyyy.mm.dd · 연도가 없으면 mm.dd · 월이 없으면 dd" — **날짜는 이 함수 하나로만** 적는다.
   받는 꼴: 'YYYYMMDD' · 'YYYY-MM-DD(…시각)' · 'YYYYMM' · 'YYYY' · Date. 원문에 있는 자리까지만 적는다(일자가 없으면 지어내지 않는다).
   연도가 없는 원문('MMDD' · 'DD')은 받은 꼴 그대로 mm.dd · dd. */
/* ★ 2026-10-24 전국으로 넓히기 1단계 — **받은 지역 말**은 /api/coverage(meta.coverage = 자료 × 시군구 실제 행 수) 하나에서 온다.
   화면에 '서울 · 안양' 을 적어 두지 않는다(받는 곳이 늘면 그 글이 거짓이 된다). 받기 전 · 못 받으면 '받은 지역' 이라고만 적는다. */
let 범위말 = '';
const 범위말로 = () => 범위말 || '받은 지역';
fetch('/api/coverage').then(r => r.json()).then(j => { if (j && j.말) 범위말 = j.말; }).catch(() => {});
function 날짜(v, 없음 = '—') {
  if (v == null || v === '') return 없음;
  if (v instanceof Date) v = v.toISOString();
  let t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) t = t.slice(0, 10);            // 시각은 버린다(날짜만)
  const d = t.replace(/[^0-9]/g, '');
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(t) && d.length < 8) {   // 2026-9-1 같은 한 자리
    const [y, m, dd] = t.split(/[-./]/); return `${y}.${String(m).padStart(2, '0')}.${String(dd).padStart(2, '0')}`;
  }
  if (d.length >= 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  if (d.length === 6) return `${d.slice(0, 4)}.${d.slice(4, 6)}`;
  if (d.length === 4 && /^(19|20)\d\d$/.test(d)) return d;              // 연도만
  if (d.length === 4) return `${d.slice(0, 2)}.${d.slice(2, 4)}`;          // 연도 없는 월일
  if (d.length <= 2 && d) return d.padStart(2, '0');                       // 일만
  return t;
}
/* 거래일은 CHAR(8) YYYYMMDD — 일자까지 */
const ymd = v => 날짜(v);

/* ★ 20:19 사장님 "저거 이름 있는 거 아냐?" — 대장에 이름이 없어 **주소가 이름 자리에** 들어간 단지는
   실거래 이름(285, PNU 로 붙은 거래가 쓴 이름)을 이름으로 보인다. 주소는 그 아래 줄에 그대로 있다.
   주소 이름 판별 = 이름이 대표 지번 주소와 같다(빌드가 ADDR 로 채울 때 그렇게 넣는다). */
const 주소이름인가 = c => !!(c && c.complex_nm && c.rep_plat_plc && c.complex_nm === c.rep_plat_plc);
const 표시이름 = c => (주소이름인가(c) && c.실거래이름) ? c.실거래이름 : (c && c.complex_nm);
const shortNm = v => {
  const t = String(v ?? '').trim();
  const m = t.match(/^.*?[가-힣]+(?:동|가|리)\s+(.+)$/);
  return (m ? m[1] : t);
};

/* 동 수 -> 색 단계. 단일 색상 명도 단계(sequential)라 크기 비교가 읽힌다. */
const stepOf = d => (d <= 1 ? 1 : d <= 2 ? 2 : d <= 3 ? 3 : d <= 5 ? 4 : d <= 8 ? 5 : 6);
const colorOf = d => css('--s' + stepOf(d));

let map, parcelLayer, buildingLayer, focusLayer, focusBldLayer, markerLayer, lawdLayer, lawdMarkerLayer, lawdFocusLayer, CFG = {};
let showBuildings = true;
let showPolys = false;          // 필지/건물 폴리곤은 기본으로 숨긴다. 단지 마커가 먼저다
/* 겹쳐보기 (2026-10-19). '' | 'zone' | 'redev'
   ★ **한 번에 하나만** 켠다. 필지·건물·단지 마커가 이미 깔린 위에 면을 두 겹
     더 얹으면 아무것도 안 읽힌다. 체크박스가 아니라 고르는 상자인 이유다. */
let overlay = '';
let zoneLayer, redevLayer;
let markerOf = new Map();       // complex_id -> L.marker (선택 표시용)
const LAWD_ZOOM = 15;           // 이 줌 미만이면 법정동, 이상이면 단지
let selected = null, items = [], lawdItems = [], selectedLawd = null, fetchSeq = 0;
let 바뀜정보 = null, 꼬리뗌정보 = null;   /* 308 (2026-10-22): 옛 행정동 → 지금 행정동 안내 — /api/complexes 의 바뀜 */
/* 내 위치 (2026-10-20). myLayer 는 내 점과 정확도 원만 담는다 — 단지 마커와
   같은 레이어에 넣으면 지도를 움직일 때 같이 지워진다. */
let myLayer = null, myPos = null, geoBusy = false;

/* ---------------- 용어 설명 (2026-10-20) ----------------
   사용자: "건폐율,용적률같은 생소한 단어는 그 단어 오른쪽에 회색 동그라미 ? 로
            마우스 드래그 하면 의미가 나오게"

   ★ 설명은 **우리 데이터가 무엇인지**를 말한다. 법 해설을 하지 않는다 —
     상한 몇 % 같은 숫자는 지자체 조례와 시기에 따라 다른데, 그걸 적으면
     화면이 틀린 말을 하게 된다(우리가 그 값을 갖고 있지 않다).
   ★ 설명 안에 **어디서 온 값인지**를 넣는다. 그게 이 화면의 약속이다.
   ★ 마우스가 없는 기기도 있다 — hover 말고 **클릭/탭/키보드 포커스**로도 열린다.
     그래서 <span title> 이 아니라 <button> 이다. */
const 용어뜻 = {
  분위:     '같은 용도지역 안에서 이 건물(또는 단지)의 용적률이 몇 번째쯤인지. '
          + '상위 10%면 "같은 용도지역에서 많이 지은 축" 이라는 뜻이다. '
          + '단지와 개별 건물은 **따로** 줄을 세운다 — 단지 대지 전체의 용적률과 '
          + '건물 하나의 용적률은 다른 말이기 때문이다. '
          + '몇 개 중 몇 번째인지도 같이 적으니 개수가 적으면 가볍게 보면 된다.',
  용적률:   '대지면적 대비, 건물 모든 층 바닥면적의 합이 얼마나 되는지(%). '
          + '지하층과 주차장은 빠진다. 같은 땅이라도 이 값이 클수록 많이 지은 것이다. '
          + '건축물대장 표제부의 값을 그대로 쓴다.',
  건폐율:   '대지면적 대비, 건물이 땅을 덮은 넓이(%). 위에서 내려다본 그림자 넓이라고 '
          + '보면 된다. 값이 작을수록 단지 안에 빈 땅이 많다. '
          + '건축물대장 표제부의 값을 그대로 쓴다.',
  전용면적: '그 집만 혼자 쓰는 면적. 복도·계단·엘리베이터 같은 공용부는 빠진다. '
          + '실거래가와 분양에서 말하는 "84㎡" 가 이것이다.',
  전용률:   '전유면적이 전체에서 차지하는 비율. 다만 "전체" 를 무엇으로 잡는지에 따라 '
          + '값이 크게 달라진다. 분양 광고의 전용률 70~80% 는 전유÷공급(분양)면적이고, '
          + '여기 적은 값은 전유÷계약면적(전유+공용 전부)이라 50% 쯤으로 더 낮게 나온다. '
          + '공급면적을 내려면 공용을 주거공용(계단·엘리베이터)과 기타공용(주차장·부대시설)으로 '
          + '갈라야 하는데 건축물대장 전유공용면적에는 그 구분 코드가 없다. '
          + '용도명으로 짐작해 나누면 추정이 숫자처럼 보이게 되므로 하지 않았다.',
  연면적:   '건물 모든 층 바닥면적의 합. 지하와 주차장도 들어간다. '
          + '용적률을 낼 때 쓰는 면적과는 다르다.',
  대지면적: '건물이 서 있는 땅의 넓이.',
  건축면적: '건물이 땅을 덮은 넓이. 위에서 내려다본 그림자 넓이라고 보면 된다. '
          + '이걸 대지면적으로 나눈 것이 건폐율이다.',
  승강기:   '건축물대장에 적힌 승강기 수. 승용과 비상용을 나눠 적는다.',
  공시지가: '국가가 매년 1월 1일 기준으로 정해 알리는 땅값(원/㎡). '
          + '세금의 기준이 되는 값이라 실제 거래가와는 다르다.',
  총괄표제부:'여러 동이 한 단지를 이룰 때, 단지 전체를 묶어 적은 건축물대장. '
          + '동마다 따로 있는 표제부 위에 하나 있다. 아파트 단지에는 보통 있고, '
          + '단독주택에는 없다.',
  표제부:   '건축물대장에서 건물 한 동의 개요를 적은 부분. 구조·용도·면적·층수 등.',
  전유부:   '건축물대장에서 집 한 채(호)를 적은 부분. 아파트 각 호가 여기 해당한다.',
  지목:     '그 땅의 공식 용도 구분(대·전·답·도로 등). 지적공부에 적힌 값이다.',
  용도지역: '국토계획법에 따라 땅마다 정해진 구역. 지을 수 있는 건물의 종류와 '
          + '크기가 여기서 정해진다. 건축물대장 지역지구의 대표 값을 쓴다.',
  사용승인: '공사가 끝나 건물을 써도 좋다고 허가된 날. 보통 이날을 준공일로 본다.',
  직거래:   '중개사 없이 당사자끼리 한 거래. 가족 간 증여성 저가 거래가 섞이는 '
          + '통로라 시세로 읽을 때 주의해야 한다.',
  지분거래: '부동산 전체가 아니라 일부 지분만 사고판 거래. 금액이 전체 값이 아니다.',
  해제:     '신고된 뒤 취소된 거래. 성사되지 않았으므로 시세 계산에서 뺀다.',
  갱신요구권:'세입자가 계약을 한 번 더 연장해 달라고 요구할 수 있는 권리. '
          + '이 권리를 써서 갱신한 계약은 보증금 인상 폭이 법으로 제한된다.',
  PNU:      '필지(땅 한 조각)마다 붙는 19자리 번호. 시군구·법정동·산여부·본번·부번을 '
          + '이어 붙인 것으로, 이 사이트가 건물과 땅을 이어 붙이는 열쇠다.',
  필지:     '등록상 구분되는 땅 한 조각. 지번 하나에 필지 하나가 대응한다.',
};

/* 말 오른쪽에 회색 ? 를 붙인다. 뜻이 없는 말은 **그냥 글자만** 돌려준다 —
   물음표만 띄워 놓고 아무 설명도 안 나오면 그게 더 나쁘다. */
/* 라벨 문자열(예 '건폐율·용적률')을 토큰으로 쪼개 **아는 말에만** ? 를 붙인다.
   ★ 라벨은 사람이 적은 짧은 글이라 ·, /, 공백으로만 쪼갠다. 모르는 토큰은 그냥 글자다. */
function 라벨용어(k) {
  return String(k).split(/([·\/ ])/).map(t => (용어뜻[t] ? 용어(t) : esc(t))).join('');
}

function 용어(말, 보일말) {
  const 글 = esc(보일말 == null ? 말 : 보일말);
  const 뜻 = 용어뜻[말];
  if (!뜻) return 글;
  return `<span class="term">${글}<button type="button" class="qm" data-tip="${esc(뜻)}"
            aria-label="${esc(말)} 뜻 보기">?</button></span>`;
}

function toast(html, ms) {
  const t = $('#toast');
  if (!html) { t.hidden = true; return; }
  t.innerHTML = html; t.hidden = false;
  if (ms) setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------------- 배경지도 ----------------
   같은 VWorld 키로 레이어 이름만 바꾼다. 좌표계가 이미 EPSG:4326 이라
   변환 단계가 없다(README 4장).

     Base       일반도      .png
     Satellite  항공사진    .jpeg   <- 확장자가 다르다
     Hybrid     도로·지명   .png    항공사진엔 라벨이 없어 위에 덮는다

   항공사진은 촬영 시점이 제각각이다. 재개발 신축지에서는 철거 전 건물이
   찍혀 있을 수 있다(CONTEXT 4-18 이 건물 외곽선에서 지적한 것과 같은 문제).
   "지금 모습" 이라고 단정하지 않는다. */
let baseLayers = [];
let baseKind   = 'base';   // 'base' | 'sat'
let vwFailed   = false;    // 타일이 안 떠서 OSM 으로 내려간 상태
let vwBad      = 0;

const osmLayer = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '&copy; OpenStreetMap' });

const vworldLayer = (name, ext) => L.tileLayer(
  `https://api.vworld.kr/req/wmts/1.0.0/${CFG.vworldKey}/${name}/{z}/{y}/{x}.${ext}`,
  { maxZoom: 19, minZoom: 7, attribution: '&copy; VWorld' });

/* VWorld WMTS 는 키 발급 시 등록한 도메인에서만 동작한다. localhost 가 등록돼
   있지 않으면 타일이 전부 실패하므로, 몇 장 연속 실패하면 조용히 OSM 으로 내려간다. */
function onTileError() {
  if (vwFailed || !CFG.hasVworld) return;
  if (++vwBad < 4) return;
  vwFailed = true;
  toast('VWorld 타일을 불러오지 못해 OpenStreetMap 으로 대체했습니다.<br>' +
        'VWorld 에서 이 키의 <b>등록 도메인에 localhost</b> 가 포함돼 있는지 확인하세요.', 10000);
  setBase(baseKind);
}

function setBase(kind) {
  baseKind = kind;
  baseLayers.forEach(l => map.removeLayer(l));
  vwBad = 0;

  const aerial = kind === 'sat' && CFG.hasVworld && !vwFailed;
  if (!CFG.hasVworld || vwFailed) baseLayers = [osmLayer()];
  else if (kind === 'sat')        baseLayers = [vworldLayer('Satellite', 'jpeg'),
                                                vworldLayer('Hybrid', 'png')];
  else                            baseLayers = [vworldLayer('Base', 'png')];

  baseLayers.forEach(l => { l.on('tileerror', onTileError); l.addTo(map); });
  /* 항공사진은 어둡다. 폴리곤·말풍선 대비를 CSS 에서 올린다. */
  document.body.classList.toggle('sat', aerial);
  if (kind === 'sat' && !aerial)
    toast('항공사진은 VWorld 타일이 있어야 합니다. 현재 OpenStreetMap 입니다.', 6000);
}

/* 2026-10-23 사장님 "데스크탑은 마우스가 꾹 눌린 상태면 회전할 수 있게" —
   지도를 **0.45초 움직이지 않고 누르고 있으면** 회전 모드: 그대로 끌면 지도 가운데를 축으로 돈다. 바로 끌면 예전처럼 이동.
   ★ Leaflet 의 끌기는 document 에 mousemove 를 건다 — 회전 중에는 window(잡기 단계)에서 먼저 받아 멈춰 지도가 같이 밀리지 않게 한다.
   ★ 손을 뗀 뒤의 click 은 한 번 삼킨다(마커 위에서 돌려도 그 단지가 열리지 않게). 단추 · 말풍선 위에서는 안 한다. */
function 길게눌러돌리기() {
  const el = map.getContainer();
  let timer = null, start = null, rot = null;
  const 끝 = () => { if (timer) { clearTimeout(timer); timer = null; } start = null; };
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.shiftKey || typeof map.setBearing !== 'function') return;
    if (e.target.closest('.leaflet-control, .leaflet-popup')) return;   // 단추 · 말풍선 위는 그대로(마커 위는 돌린다 — 손을 뗀 뒤 click 은 삼킨다)
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      rot = { cx, cy, a0: Math.atan2(start.y - cy, start.x - cx), b0: map.getBearing() };
      el.classList.add('rotating');
    }, 450);
  }, true);
  window.addEventListener('mousemove', e => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 3) 끝();   // 바로 끌면 이동
    if (!rot) return;
    e.stopPropagation(); e.preventDefault();
    const a = Math.atan2(e.clientY - rot.cy, e.clientX - rot.cx);
    let b = rot.b0 + (a - rot.a0) * 180 / Math.PI; b = ((b % 360) + 360) % 360;
    map.setBearing(b);
  }, true);
  window.addEventListener('mouseup', () => {
    끝();
    if (rot) {
      rot = null; el.classList.remove('rotating');
      const 삼킴 = ev => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', 삼킴, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', 삼킴, { capture: true }), 300);
    }
  }, true);
}

/* ---------------- 지도 ---------------- */
function initMap() {
  map = L.map('map', {
    zoomControl: true, preferCanvas: true,
    /* ★ 휠 확대가 한 번에 여러 단계 뛰는 문제 (2026-10-20, 사용자 신고).
       Leaflet 은 휠 이벤트를 wheelDebounceTime(기본 40ms) 동안 **모아서**
       한꺼번에 계산한다. 빠르게 굴리면 누적 델타가 커져 한 제스처에 2~3단계가
       뛴다. 실측(패치해서 내부를 찍었다):
         한 노치(deltaY 100) -> 누적 50  -> 1단계   (정상)
         빠르게 세 번        -> 누적 150 -> **2단계** (여기가 체감되는 버그)
       기본 wheelPxPerZoomLevel 이 60 이라 너무 민감하다. 140 으로 올리면
       누적 150 까지는 1단계로 떨어지고, 아주 길게 굴렸을 때만 여러 단계가 뛴다
       (그건 의도된 동작이다 — 빨리 멀어지고 싶을 때가 있다).
       ★ debounce 를 키우면 **더 나빠진다** — 더 오래 모았다가 더 크게 뛴다.
         줄여도 횟수만 늘 뿐이라, 고칠 자리는 wheelPxPerZoomLevel 이다. */
    wheelPxPerZoomLevel: 140,
    /* ★ 반단계 줌 (2026-10-20, 사용자: "너무 휙휙 움직여서").
       Leaflet 의 줌 애니메이션은 **250ms 가 코드에 박혀 있다**(_animateZoom 안의
       setTimeout). CSS 로 전환을 늘리면 250ms 에 클래스가 떨어져 **중간에 뚝 끊긴다** —
       그래서 '느리게' 는 안전한 길이 아니다.
       대신 **한 번에 가는 거리**를 줄인다. zoomSnap 0.5 면 지도가 16.5 같은
       반단계에 설 수 있고, 휠 한 번이 반 단계만 움직여 훨씬 부드럽다.
       ★ zoomDelta 는 1 로 둔다 — 좌측 +/- 단추는 한 단계씩 가는 게 맞다. */
    zoomSnap: 0.5, zoomDelta: 1,
    /* 2026-10-23 사장님 "지도를 360도로 회전 가능하게" — leaflet-rotate(Leaflet 1.9 플러그인).
       폰: 두 손가락 비틀기 · PC: 빈 곳을 꾹 누른 채 끌기(길게눌러돌리기) 또는 Shift + 끌기 · 나침반 단추를 누르면 북쪽이 위로. */
    rotate: true, bearing: 0, touchRotate: true, shiftKeyRotate: true,
    /* 2026-10-24 21:53 사장님 "화살표 위아래(나침반 단추) 없애줘 — 보통 스크롤 · 터치로 하니까" — 평소엔 안 보인다(closeOnZeroBearing).
       지도가 돌아가 있을 때만 나타나 누르면 북쪽이 위로 — 아예 없으면 두 손가락으로 잘못 돌린 지도를 되돌릴 길이 없다. */
    rotateControl: { closeOnZeroBearing: true, position: 'topleft' },
    /* ★ 아래에서 Leaflet 의 휠 확대를 **끄고 직접 돌린다.** 이 값은 남겨 두지만
       실제로는 안 쓰인다(되돌릴 때 기준이 되라고 남긴다). */
  }).setView([37.5885, 126.9680], 16);   // 종로구 청운동

  /* ★ 휠 확대: 한 제스처에 여러 단계가 뛰는 문제 (2026-10-20, 사용자 신고 2회).
     처음엔 wheelPxPerZoomLevel 을 60 -> 140 으로 올렸는데 **그래도 그대로**였다.
     Leaflet 은 휠 이벤트를 debounce 동안 모아 누적 델타로 단계를 계산한다 —
     기기가 한 번에 큰 deltaY 를 쏘거나 이벤트를 많이 쏘면 결국 여러 단계가 뛴다.
     상수를 조절하는 것으로는 **기기마다 다른 값을 맞출 수 없다.**
     그래서 Leaflet 것을 끄고 **규칙을 바꾼다: 한 번 굴리면 딱 한 단계.**
     연속해서 굴리면 쿨다운(220ms)마다 한 단계씩 — 예측 가능하고 절대 안 튄다.
     ★ 커서 위치를 중심으로 확대한다(setZoomAround) — 지도에서 그게 기본 기대다. */
  길게눌러돌리기();
  /* 나침반 단추: 돌아가 있을 때만 보인다 — 손으로 북쪽에 다시 맞춘 경우에도 숨긴다(플러그인은 단추를 눌렀을 때만 숨김) */
  map.on('rotate', () => {
    const el = document.querySelector('#map .leaflet-control-rotate');
    if (el) el.style.display = Math.abs(((map.getBearing() % 360) + 360) % 360) < 1 || Math.abs(((map.getBearing() % 360) + 360) % 360 - 360) < 1 ? 'none' : '';
  });
  map.scrollWheelZoom.disable();
  /* ★ 2차 수정 (사용자 재신고). 처음엔 **고정 쿨다운 220ms** 로 막았다 —
     "한 번 굴림" 과 "한 제스처에 10번" 은 둘 다 1회로 막혔는데도 실기기에서는
     그대로였다. 재 보고 알았다:
       관성 1.5초(16ms 간격 90개 이벤트)를 흉내내니 **내 핸들러가 4번** 불렸다.
       (Leaflet 기본 휠은 0번 — 끄기는 제대로 됐다.)
     트랙패드와 프리스핀 휠은 **손을 뗀 뒤에도** 이벤트를 1~2초 더 쏜다.
     고정 쿨다운은 그 꼬리를 못 막는다 — 220ms 마다 한 번씩 계속 풀린다.
   ★ 그래서 기준을 바꾼다: **"시간이 지나면" 이 아니라 "조용해지면".**
     직전 휠 이벤트와 200ms 이상 떨어져 있을 때만 새 제스처로 친다.
     관성 꼬리는 16ms 간격이라 전부 한 제스처로 삼켜진다.
     일부러 두 번 굴리면(사람 손은 보통 250ms 이상 벌어진다) 두 단계 간다. */
  /* ★ 3차 수정. 2차(간격 기준)도 틀렸다 — 사용자: "스크롤 한번 위로 올리면
     확대 한번하고 1초뒤에 확대 한번더되".
     2차는 `지금 - 직전이벤트 > 200ms` 면 새 제스처로 쳤다. 그런데 관성 꼬리는
     **점점 드문드문해진다**(16ms -> 80ms -> 250ms -> ...). 한 번이라도 틈이
     200ms 를 넘는 순간 '새 제스처' 가 되어 **한 번 더 확대된다.**
     간격 하나로는 '제스처가 끝났는지' 를 알 수 없다.

   ★ 그래서 **조용한 시간이 쌓여야 끝난 것으로** 친다. 휠이 올 때마다 타이머를
     다시 건다 — `제스처쉼` 동안 **한 번도 안 오면** 그때 비로소 제스처가 끝난다.
     꼬리가 드문드문 와도 타이머가 계속 연장되므로 한 제스처로 삼켜진다.
   ★ 덤으로 확대 애니메이션 중에는 받지 않는다. 두 번째 확대는 보통 그때 들어온다.
   ★ 너무 둔하면 `제스처쉼` 을 300 정도로 줄인다. 더 새면 700 으로 올린다. */
  /* ★ 4차. 사용자: "확대는 잘되는데 축소가안돼".
     **진짜 스크롤**(합성 이벤트 말고 브라우저가 만드는 입력)로 재서 찾았다:
     아래로 한 번 = 이벤트 1개 dy=100 -> 확대 호출 1회, 줌 16->15. 축소 자체는 된다.
     안 되는 건 **확대 직후의 축소**다 — 700ms 안에 방향을 바꾸면 같은 제스처로
     삼켜진다. 내 코드가 **방향을 아예 안 봤다.**
   ★ 관성은 **절대 방향이 안 바뀐다.** 그러니 방향이 바뀌면 그건 언제나
     사람이 새로 굴린 것이다 — 쉼 시간과 상관없이 바로 받는다. */
  /* 휠 한 번이 움직이는 거리. 0.5 = 반 단계(부드럽다) · 1 = 한 단계(빠르다)
     · 0.25 = 더 부드럽지만 멀리 가려면 많이 굴려야 한다. */
  const 휠단계 = 0.5;
  const 제스처쉼 = 700;
  /* ★ 5차 (사용자: "확대가 어디까지되고, 축소가 어디까지되? 실제 +,- 버튼
     누르는거보다 안되는거같아서").
     재 보니 **한계는 같다** — 휠도 버튼도 7~19 다. 다른 건 **속도**였다:
     4차까지는 한 제스처에 **딱 한 번**만 움직이게 해서, 계속 굴려도 반 단계에서
     멈췄다. 버튼은 누르는 대로 가는데 휠은 안 가니 "덜 된다" 고 느껴진 것이다.
   ★ 그래서 "한 제스처 = 한 번" 을 버리고 **"계속 굴리면 계속 간다"** 로 바꾼다.
     대신 관성 꼬리는 여전히 막아야 하므로, 둘을 **세기**로 가른다:
       사람이 계속 굴리면 deltaY 크기가 유지된다.
       관성 꼬리는 **크기가 점점 줄어든다.**
     그래서 '제스처 안에서 본 최대 크기의 60% 밑으로 떨어지면 꼬리' 로 보고 버린다.
   ★ 속도는 애니메이션 한 번 길이(260ms)로 묶는다 — 그보다 자주 쏴 봐야
     애니메이션이 못 따라와서 뚝뚝 끊길 뿐이다. */
  const 연속간격 = 260;
  const 꼬리기준 = 0.6;
  let 제스처중 = false, 제스처타이머 = null, 제스처방향 = 0,
      제스처최대 = 0, 마지막움직임 = 0;

  map.getContainer().addEventListener('wheel', (e) => {
    e.preventDefault();                       // 페이지가 같이 스크롤되지 않게
    /* ★ 꼬리든 아니든 **올 때마다 타이머를 다시 건다.** 이게 핵심이다 —
       조용해질 때까지 제스처가 안 끝난다. */
    clearTimeout(제스처타이머);
    제스처타이머 = setTimeout(() => {
      제스처중 = false; 제스처방향 = 0; 제스처최대 = 0;
    }, 제스처쉼);
    if (!e.deltaY) return;

    const 크기 = Math.abs(e.deltaY);
    const 방향 = e.deltaY < 0 ? 1 : -1;
    /* 관성은 **절대 방향이 안 바뀐다.** 바뀌면 언제나 사람이 새로 굴린 것이다. */
    const 방향바뀜 = 제스처방향 !== 0 && 방향 !== 제스처방향;
    if (방향바뀜) 제스처최대 = 0;
    const 이제 = Date.now();
    const 첫발 = !제스처중 || 방향바뀜;

    let 갈까 = 첫발;
    if (!갈까) {
      /* 계속 굴리는 중. 세기가 안 죽었고(= 꼬리가 아니고) 간격이 찼으면 더 간다. */
      const 안죽었나 = 크기 >= 제스처최대 * 꼬리기준;
      갈까 = 안죽었나 && (이제 - 마지막움직임) >= 연속간격;
    }
    제스처최대 = Math.max(제스처최대, 크기);
    if (!갈까) return;
    제스처중 = true; 제스처방향 = 방향; 마지막움직임 = 이제;
    /* ★ 한계를 넘으면 **그만두지 말고 한계까지 간다.** 전에는 return 해서
       18.7 에서 19 로 못 갔다(반단계라 지금은 안 생기지만, 휠단계를 바꾸면 생긴다). */
    const 목표 = Math.min(map.getMaxZoom(),
                   Math.max(map.getMinZoom(), map.getZoom() + 방향 * 휠단계));
    if (목표 === map.getZoom()) return;
    map.setZoomAround(map.mouseEventToContainerPoint(e), 목표);
  }, { passive: false });

  setBase('base');
  if (!CFG.hasVworld)
    toast('VWorld 키가 없어 OpenStreetMap 으로 대체했습니다. <b>.env</b> 의 VWORLD_KEY 를 확인하세요.', 7000);

  parcelLayer = L.geoJSON(null, {
    style: styleParcel,
    onEachFeature: (f, lyr) => {
      const p = f.properties;
      lyr.bindPopup(
        `<div class="t">${esc(p.complex_nm || p.addr || p.pnu)}</div>` +
        `<div class="m">PNU ${esc(p.pnu)}${p.jibun ? ' · ' + esc(p.jibun) : ''}</div>` +
        (p.jiga ? `<div class="m">공시지가 ${fmt(p.jiga)} 원/㎡</div>` : '') +
        (p.complex_id ? `<div class="m">단지 #${p.complex_id} · ${p.dong_cnt}동</div>` : '<div class="m">단지 미지정</div>')
      );
      lyr.on('click', () => { if (p.complex_id) select(p.complex_id, false); });
    }
  });

  buildingLayer = L.geoJSON(null, {
    style: styleBuilding,
    onEachFeature: (f, lyr) => {
      const p = f.properties;
      lyr.bindPopup(
        `<div class="t">${esc(p.buld_nm || (p.rd_nm ? p.rd_nm + ' ' + (p.buld_no || '') : '건물'))}</div>` +
        `<div class="m">건물관리번호 ${esc(p.bd_mgt_sn)}</div>` +
        `<div class="m">PNU ${esc(p.pnu)}${p.gro_flo_co ? ' · 지상 ' + p.gro_flo_co + '층' : ''}</div>` +
        (p.area_m2_approx ? `<div class="m">면적(근사) ${fmt(Math.round(p.area_m2_approx))} ㎡</div>` : '') +
        (p.complex_id ? `<div class="m">단지 #${p.complex_id}</div>` : '<div class="m">단지 미지정</div>')
      );
      lyr.on('click', () => { if (p.complex_id) select(p.complex_id, false); });
    }
  });

  focusLayer = L.geoJSON(null, {
    style: { color: css('--mark'), weight: 3, fillOpacity: 0.10, fillColor: css('--mark') }
  }).addTo(map);

  focusBldLayer = L.geoJSON(null, {
    style: { color: css('--bld-sel'), weight: 1.6, fillColor: css('--bld-sel'), fillOpacity: 0.72 }
  }).addTo(map);

  /* 법정동은 단지보다 아래에 깔린다. 경계는 면이 아니라 '테두리' 로 읽혀야 해서
     채움을 거의 투명하게 두고 클릭만 받는다.
     ★ 2026-10-21: 점선 1.6px → **실선 2px**. 이름표를 줄이면서(아래) 동네를 가르는 일을
       선이 맡게 됐다. 점선은 이름표 사이로 끊겨 보여 경계로 안 읽혔다.
     ★ 채움은 **색으로 값을 칠하지 않는다**(사장님과 정함). 최고가는 거래 한 건이 정하고
       (청운동은 2007년 한 건), 거래량은 동네 크기·주택 종류가 정한다 - 둘 다 동네를
       칠할 근거로는 약하다. 칠하려면 '최근 1년 아파트 매매 평당 중앙값' 처럼 따로 계산하고
       표본 수를 같이 적어야 한다 - 그건 다음 일. */
  lawdLayer = L.geoJSON(null, {
    style: { color: css('--s5'), weight: 2, opacity: .9,
             fillColor: css('--s2'), fillOpacity: .06 },
    onEachFeature: (f, lyr) => {
      lyr.on('click', () => map.fitBounds(lyr.getBounds(), { padding: [40, 40] }));
      lyr.on('mouseover', () => lyr.setStyle({ fillOpacity: .22, weight: 3 }));
      lyr.on('mouseout',  () => lyr.setStyle({ fillOpacity: .06, weight: 2 }));
    },
  }).addTo(map);
  lawdMarkerLayer = L.layerGroup().addTo(map);
  /* 검색으로 고른 법정동 — 줌을 당겨도 계속 보이는 테두리 */
  lawdFocusLayer = L.geoJSON(null, {
    style: { color: css('--s6'), weight: 2.4, opacity: .9, dashArray: '6 4',
             fillColor: css('--s3'), fillOpacity: .08 },
  }).addTo(map);
  /* 겹쳐보기 두 장. 마커보다 **먼저** 만들어 아래에 깔리게 한다.
     ★ 2026-10-22 사장님 "색이 겹치면서 범례 색과 다른 경우" + "원본을 훼손하면 안 돼":
       영역마다 반투명으로 칠하면 겹친 곳이 섞이거나(정비 2,776 중 1,615쌍 겹침) 진해진다(용도 같은 색 겹침 ~300쌍).
       → **원본은 한 개도 빼지 않고 다 그리되**, 영역은 불투명하게 칠하고 **판(pane) 전체에 투명도를 한 번만** 준다.
         같은 색이 겹쳐도 진해지지 않고, 다른 색이 겹쳐도 섞인 새 색이 생기지 않는다(위에 그린 것의 색 — 큰 것 아래·작은 것 위, 서버 순서 그대로).
       → 위에 가려진 것도 숨지 않게 **누른 자리의 영역을 전부** 보여 준다(겹침목록팝업). */
  for (const [이름, 투명, z] of [['ovZone', OV_투명.zone, 410], ['ovRedev', OV_투명.redev, 411]]) {
    /* ★ 2026-10-28 사장님 "손으로 클릭해도 단지 상세가 안 들어가져": leaflet-rotate(10-23)는 기본 판(마커 · 겹쳐보기 …)을 **돌아가는 판** 안에 둔다.
       createPane(이름) 만 하면 지도 판 바로 밑(돌아가는 판의 **형제**)에 생겨 z 405~411 이 돌아가는 판(400) 전체 — 마커(600) 포함 — 위로 올라간다.
       → 겹쳐보기 · 빈자리 판은 기본 겹쳐보기 판(overlayPane)과 **같은 부모(돌아가는 판)** 안으로 옮긴다 — 지도와 같이 돌고,
         마커가 든 '안 돌아가는 판'이 그 뒤 형제라 마커가 늘 위에 온다(면을 눌러도 마커 밖이면 면이 받는다). */
    const pn = map.createPane(이름); map.getPane('overlayPane').parentNode.appendChild(pn); pn.style.zIndex = z; pn.style.opacity = 투명;   // ★ leaflet-rotate 의 createPane 은 부모 인자를 무시한다 → 직접 옮김
  }
  zoneLayer = L.geoJSON(null, { style: styleZone, pane: 'ovZone', renderer: L.svg({ pane: 'ovZone' }) });
  redevLayer = L.geoJSON(null, { style: styleRedev, pane: 'ovRedev', renderer: L.svg({ pane: 'ovRedev' }) });
  zoneLayer.on('click', e => 겹침목록팝업(e, zoneLayer, 용도팝업));
  redevLayer.on('click', e => 겹침목록팝업(e, redevLayer, 정비팝업));

  markerLayer = L.layerGroup().addTo(map);
  newbuildLayer = L.layerGroup().addTo(map);
  분양핀층 = L.layerGroup().addTo(map);
  폐쇄핀층 = L.layerGroup().addTo(map);
  빈자리켜기();

  map.on('moveend', refreshMap);
  /* 줌만 바뀌어도 이름표를 다시 판단한다. loadOverlay 는 bbox 가 그대로면
     다시 안 불릴 수 있어서, 여기서도 한 번 건다. */
  map.on('zoomend', 재개발이름표);
  map.on('zoomend', () => {   // 흐린 말풍선 문턱(줌 18)을 넘나들 때만 마커를 다시 그린다
    const 지금 = map.getZoom() >= 흐린말풍선줌;
    if (지금 !== 흐린말풍선보임) { 흐린말풍선보임 = 지금; paintMarkers(); }
  });
  refreshMap();
}

/* ---------------- 단지 마커 ---------------- */
/* 등록된 단지를 지도에 먼저 보여주고, 폴리곤은 고른 단지만 그린다.
   라벨은 그 단지의 **최근 3년 최고가** 매매 — 평형과 금액. 3년 안 매매가 없으면 마지막 매매를
   흐리게 + 평형 대신 연도로(2026-10-21). 거래가 없으면 점.
   (단독·다가구·토지·상업업무용은 지번 마스킹으로 매칭 자체가 안 되므로 거래가 비어 있다) */
const 흐린말풍선줌 = 18;
let 흐린말풍선보임 = null;   // 문턱을 넘을 때만 다시 그린다
function markerHtml(m, sel) {
  const has = m.max_amount != null;
  /* 거래가 붙은 단지만 가격 말풍선, 나머지는 점.
     장위동은 4,665단지라 전부 말풍선이면 라벨끼리 가려 아무것도 안 읽힌다.
     점으로 남겨두면 위치와 클릭은 그대로 살아 있고, "거래가 안 붙은 단지"가
     눈으로 구분된다(단독·다가구는 지번 마스킹으로 매칭 자체가 불가능하다). */
  if (!has) return `<div class="cdot${sel ? ' sel' : ''}${m.has_recap ? ' recap' : ''}"></div>`;

  const py = m.area_grp ? Math.round(Number(m.area_grp) / 3.3058) : null;
  const amt = Number(m.max_amount) / 100000000;
  const 오래 = m.최근3년 === false;
  /* 2026-10-24 22:37 사장님 ㄱㄱ: 3년 안 매매가 없는 단지의 흐린 말풍선이 빌라 동네에서 겹겹이 쌓였다 —
     평소엔 **점**으로(누르면 상세에 마지막 거래 그대로), 골목 단위(줌 18 이상)로 크게 볼 때만 흐린 말풍선. */
  if (오래 && map && map.getZoom() < 흐린말풍선줌) return `<div class="cdot${sel ? ' sel' : ''}${m.has_recap ? ' recap' : ''}"></div>`;
  const head = 오래 ? `${m.max_ymd.slice(0, 4)}년` : py ? `${py}평` : '최고';
  const body = (amt >= 10 ? amt.toFixed(1) : amt.toFixed(2)).replace(/\.?0+$/, '') + '억';
  return `<div class="cmark${sel ? ' sel' : ''}${m.has_recap ? ' recap' : ''}${오래 ? ' stale' : ''}">
            <b>${head}</b><span>${body}</span></div>`;
}

function drawMarkers(list) {
  markerLayer.clearLayers();
  markerOf.clear();
  list.forEach(m => {
    const mk = L.marker([m.centroid_lat, m.centroid_lng], {
      icon: L.divIcon({ className: 'cmark-wrap', html: markerHtml(m, m.complex_id === selected),
                        iconSize: null, iconAnchor: [0, 0] }),
      zIndexOffset: m.max_amount != null ? 200 : 0,   // 가격 말풍선이 점 위에
      riseOnHover: true,
      title: `${주소이름인가(m) && m.실거래이름 ? m.실거래이름 : shortNm(m.complex_nm)}${m.실거래이름 && !주소이름인가(m) ? ` (실거래 '${m.실거래이름}')` : ''} · ${m.dong_cnt}동` +
             (m.max_amount != null
               ? (m.최근3년 === false ? ' · 최근 3년 매매 없음 · 마지막 매매 ' : ' · 최근 3년 최고가 ')
                 + `${eok(m.max_amount)}${m.area_grp ? ' · ' + m.area_grp + '㎡' : ''}`
                 + `${m.max_ymd ? ' (' + m.max_ymd.slice(0,4) + '.' + m.max_ymd.slice(4,6) + ')' : ''}`
               : ' · 매칭된 매매 없음'),
    });
    mk.on('click', () => select(m.complex_id, false));
    mk.addTo(markerLayer);
    markerOf.set(m.complex_id, { marker: mk, data: m });
  });
}

/* 선택이 바뀌면 마커 아이콘만 다시 칠한다(재요청 없음) */
function paintMarkers() {
  markerOf.forEach(({ marker, data }, id) => {
    marker.setIcon(L.divIcon({ className: 'cmark-wrap', html: markerHtml(data, id === selected),
                               iconSize: null, iconAnchor: [0, 0] }));
  });
}

/* 지도 상태 줄 - 범례 맨 아래에 조용히 머문다.
   ★ 쓰는 곳이 둘(마커 상한 · 법정동 경계)이라 **갈래를 나눈다.**
     한 칸을 둘이 덮어쓰면 늦게 온 쪽이 먼저 온 쪽을 지운다.
   ★ 말풍선이 아니라 머무는 글이다 - 이건 '방금 일어난 일' 이 아니라
     '지금 보고 있는 것의 상태' 라서 스스로 사라지면 안 된다. */
const 지도알림들 = { 마커: '', 법정동: '' };
function 지도알림(갈래, 말) {
  지도알림들[갈래] = 말 || '';
  const el = $('#mcap');
  if (!el) return;
  const 줄 = Object.values(지도알림들).filter(Boolean);
  el.innerHTML = 줄.map(x => `<div>${x}</div>`).join('');
  el.hidden = !줄.length;
  /* 좁은 화면에서는 범례가 접혀 있다. 접힌 채로도 '뭔가 있다' 는 보이게
     점 하나만 띄운다 - 펴라고 떠미는 말풍선은 다시 만들지 않는다. */
  const lg = $('#maplegend');
  if (lg) lg.classList.toggle('has-cap', !!줄.length);
}

async function loadMarkers() {
  /* ★ 줌이 낮으면 마커를 아예 안 그린다. 이때 **알림도 같이 지운다** —
     안 지우면 '400개까지만 그렸습니다' 가 마커 없는 화면에 남는다. */
  if (map.getZoom() < LAWD_ZOOM) {
    markerLayer.clearLayers(); markerOf.clear(); 지도알림('마커', ''); return;
  }
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  try {
    const r = await fetch(`/api/complexes/markers?bbox=${bbox}`).then(r => r.json());
    if (r.error) return 오류토스트('단지 마커', r);
    drawMarkers(r.markers || []);
    /* ★ 상한에 걸렸으면 **말한다**. 538,377개 중 400개만 그려 놓고
       "이게 전부"인 얼굴을 하면 안 된다.
       ★ 2026-10-20 저녁: 토스트로 띄우던 것을 **범례 안 한 줄**로 옮겼다.
         지도를 움직일 때마다 같은 말풍선이 지도를 덮어서 사용자가 치워 달라고 했다.
         사실은 지우지 않았다 - 말하는 자리를 바꿨을 뿐이다.
         이건 '방금 일어난 일'이 아니라 '지금 보고 있는 것의 상태'라서
         사라지는 말풍선보다 머무는 줄이 맞다. */
    지도알림('마커', r.잘림 ? `${fmt(r.상한)}개까지만 그렸습니다 · 확대하면 다 보입니다`
                   : (r.markers || []).length ? '' : '이 영역에는 적재된 단지가 없습니다');
  } catch (e) {
    toast(`단지 마커 조회 실패: ${esc(e.message)}`, 6000);
  }
}

/* ---------------- 대장이 아직 없는 신축 ----------------
   gold.complex 는 건축물대장에서만 만들어진다. 대장이 아직 안 나온 신축은
   단지가 없어 검색에도 지도에도 안 나왔다 — 장위자이레디언트 2,840세대가
   화면에서 통째로 빠져 있었다(CONTEXT 4-13 의 세 번째 경우).

   K-apt 는 관리사무소 등록 기반이라 입주와 거의 동시에 올라온다. 그걸 별도
   축으로 띄운다. 단지코드는 발급하지 않는다 — 대장이 나오면 정식 단지가 되고
   이 목록에서 저절로 사라진다. */
let newbuildItems = [];
let redevItems = [], selectedRedev = null;
let ahItems = [];   /* 2026-10-23: Enter 목록의 청약 공고(단지에 아직 안 이어진 것) */
let hpItems = [];   /* 2026-10-30: Enter 목록의 사업승인 아파트(주택인허가 — 공고 전 · 공사 중) */
let pbItems = [];   /* 2026-10-30: Enter 목록의 공사 중 건물(건축허가 · 착공 · 사용승인 전) */
/* 승인 아파트로 가기: 좌표가 있으면 그 자리로 옮기고 핀 말풍선을 연다(핀은 줌 15 이상에서 그려진다) */
async function 승인으로(h) {
  return h.complex_id ? select(h.complex_id, false) : selectHousePlan(h.hp_pk);
}
async function 승인으로_옛(h) {
  if (h.lat == null || h.lng == null) return toast(`${esc(h.이름 || '이름 없음')} — 지번이 블록이라 지도 자리를 못 찾았습니다(${esc(h.대지위치 || '')})`, 5000);
  map.setView([h.lat, h.lng], Math.max(map.getZoom(), 17));
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    let 찾음 = null;
    newbuildLayer.eachLayer(l => { if (l._hpid === h.hp_pk) 찾음 = l; });
    if (찾음) { 찾음.openPopup(); return; }
  }
}
let selectedKapt = null;
let newbuildLayer = null;
let 분양핀층 = null, 분양핀켜짐 = false, 분양핀차례 = 0;   /* 12:32 버튼을 뺐다 — 검색 제안 '청약 공고' 로 찾는다 */
let 폐쇄핀층 = null, 폐쇄핀켜짐 = false, 폐쇄핀차례 = 0;   /* 2026-10-22 폐쇄·말소 대장 — 점이 많아 기본은 끔 */

function newbuildMarkerHtml(n, sel) {
  const amt = n.최고가 != null ? eok(n.최고가) : null;
  return `<div class="nbmark${sel ? ' sel' : ''}">
            <b>신축</b><span>${esc(shortNm(n.kapt_name) || '')}</span>
            ${amt ? `<i>${esc(amt)}</i>` : ''}</div>`;
}

function drawNewbuilds(list) {
  newbuildLayer.clearLayers();
  list.forEach(n => {
    const mk = L.marker([n.centroid_lat, n.centroid_lng], {
      icon: L.divIcon({ className: 'cmark-wrap', html: newbuildMarkerHtml(n, n.kapt_code === selectedKapt),
                        iconSize: null, iconAnchor: [0, 0] }),
      zIndexOffset: 400, riseOnHover: true,
      title: `${n.kapt_name} · ${fmt(n.세대)}세대 · 사용승인 ${n.사용승인 || '—'}`
           + ' · 건축물대장이 아직 없습니다',
    });
    mk.on('click', () => selectNewbuild(n.kapt_code, false));
    mk.addTo(newbuildLayer);
  });
}

/* ★ 2026-10-30 사장님 "ㄱㄱ": 주택 사업계획승인(주택인허가) — 공고 전 · 공사 중 아파트를 '승인' 핀으로(신축 핀과 같은 층).
     원문 값 그대로. 사용검사 예정일이 지났는데 사용검사일이 비어 있으면 '완공 여부 모름'(추측하지 않는다). */
function hpMarkerHtml(h) {
  return `<div class="nbmark hpmark"><b>승인</b><span>${esc(shortNm(h.이름 || '') || '이름 없음')}</span><i>${fmt(h.세대)}세대</i></div>`;
}
function hpPopup(h) {
  const 오늘 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const 지남 = h.사용검사예정일 && h.사용검사예정일 < 오늘;
  const 줄 = (k, v) => v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '';
  return `<div class="hppop"><b>${esc(h.이름 || '이름 없음')}</b>
    <p class="muted">${esc(h.대지위치 || '')}</p>
    <table>${줄('세대', fmt(h.세대) + '세대')}${줄('주 건축물', h.주건축물수 ? fmt(h.주건축물수) + '동' : '')}${줄('용도', esc(h.용도 || ''))}
      ${줄('사업계획승인', 날8(h.승인일))}${줄('착공', 날8(h.착공일) || (날8(h.착공예정일) ? 날8(h.착공예정일) + ' (예정)' : ''))}
      ${줄('사용검사', 날8(h.사용검사예정일) ? 날8(h.사용검사예정일) + ' (예정)' + (지남 ? ' — 예정일이 지났는데 사용검사 기록이 없어 완공 여부는 모름' : '') : '')}</table>
    <p class="hpsrc">출처: 건축HUB 주택인허가(주택법 사업계획승인) 원문 · 위치는 ${esc(h.위치근거 || '')} · 청약 공고 전일 수 있습니다</p></div>`;
}
function drawHousePlans(list) {
  list.forEach(h => {
    const mk = L.marker([h.lat, h.lng], {
      icon: L.divIcon({ className: 'cmark-wrap', html: hpMarkerHtml(h), iconSize: null, iconAnchor: [0, 0] }),
      zIndexOffset: 350, riseOnHover: true,
      title: `${h.이름 || '이름 없음'} · ${fmt(h.세대)}세대 · 사업계획승인 ${날8(h.승인일) || '—'}`,
    });
    mk._hp = true; mk._hpid = h.hp_pk;
    mk.on('click', () => (h.complex_id ? select(h.complex_id, false) : selectHousePlan(h.hp_pk)));   // 10-30 가단지 번호(389)로 — 일반 단지 상세
    mk.on('popupopen', e => {                         // 위쪽 지역 고르기 줄(약 90px)에 안 가리게 — 돌아가는 지도에선 autoPan 여백이 안 먹어 직접 민다
      const 위 = e.popup.getElement().getBoundingClientRect().top - map.getContainer().getBoundingClientRect().top;
      if (위 < 100) map.panBy([0, 위 - 100]);
    });
    mk.addTo(newbuildLayer);
  });
}
async function loadNewbuilds() {
  if (map.getZoom() < LAWD_ZOOM) { newbuildLayer.clearLayers(); return; }
  if (map._popup && map._popup.isOpen() && map._popup._source && map._popup._source._hp) return;   // 승인 핀 말풍선이 열려 있으면 다시 그리지 않는다(지우면 말풍선이 닫힌다)
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  try {
    const [r, h, pb] = await Promise.all([
      fetch(`/api/newbuilds?bbox=${bbox}`).then(r => r.json()),
      fetch(`/api/houseplans?bbox=${bbox}`).then(r => r.json()).catch(() => ({ markers: [] })),
      fetch(`/api/prebuilds?bbox=${bbox}`).then(r => r.json()).catch(() => ({ markers: [] }))]);
    if (!r.error) drawNewbuilds(r.markers || []);
    if (h && !h.error) drawHousePlans(h.markers || []);
    if (pb && !pb.error) drawPreBuilds(pb.markers || []);
  } catch (e) { /* 보조 축이다. 실패해도 단지 화면을 막지 않는다 */ }
}

/* ---------------- 승인 단지 상세 (2026-10-30 사장님 "123 ㄱㄱ") ----------------
   단지 상세와 같은 그릇(#detail). 전부 원문 — 주택인허가(건축HUB) + 같은 지번의 청약홈 공고.
   ★ 시공사 · 분양가 · 분양 일정 · 분양사무소는 **공고 전엔 공식 자료가 없다** → '모름(공고 전)' 과 그 까닭. 민간 사이트 값은 쓰지 않는다. */
let 고른승인 = null;
let 고른공사 = null;   /* 10-30 공사 중 건물(가상 상세 — 최근 본 단지 표시용) */
function selectHousePlan(pk) { return selectVirtual('h', pk); }   /* 10-30: 단지 상세 그대로(가상) */
/* ---------------- 대장 전 건물 — 단지 상세 그대로 (2026-10-30 사장님 "새 UI 말고 일반 건대장 있는 단지상세처럼만") ----------------
   공사 중 건물(건축허가 · 387 gold.pre_build) · 사업승인 아파트(주택인허가 · 384 gold.house_plan)를 /api/virtual/:kind/:pk 가
   단지 상세(/api/complexes/:id)와 **같은 칸 이름**으로 주고, renderDetail 이 그대로 그린다. 가상(payload.가상)이 '대장 전' 표시.
   ★ 값은 허가 · 승인(설계) 원문. 호 · 실거래 · 공시가격 · 관리비는 대장 뒤에 생겨 비어 있고 칸마다 그렇게 적는다.
   ★ 사용승인이 나서 대장이 생기면 다음 갱신에서 핀이 빠지고 일반 단지가 된다. */
const 세대호말 = p => [Number(p.세대) ? `${fmt(p.세대)}세대` : '', Number(p.호) ? `${fmt(p.호)}호` : ''].filter(Boolean).join(' · ') || '—';
function pbMarkerHtml(p) {
  return `<div class="nbmark pbmark"><b>공사 중</b><span>${esc(shortNm(p.이름 || '') || '이름 없음')}</span><i>${esc(세대호말(p))}</i></div>`;
}
function drawPreBuilds(list) {
  list.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    const mk = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: 'cmark-wrap', html: pbMarkerHtml(p), iconSize: null, iconAnchor: [0, 0] }),
      zIndexOffset: 340, riseOnHover: true,
      title: `${p.이름 || '이름 없음'} · ${p.용도 || ''} · ${세대호말(p)} · 착공 ${날8(p.착공일) || '—'} · 사용승인 전(건축허가 원문)`,
    });
    mk._pbid = p.pk;
    mk.on('click', () => (p.complex_id ? select(p.complex_id, false) : selectPreBuild(p.pk)));   /* 10-30 가단지 번호(389)로 — 일반 단지와 같은 길 */
    mk.addTo(newbuildLayer);
  });
}
/* 10-31 사장님 "단지상세에서 동네 단지를 보여주는 화면 — 저런 느낌처럼(주변 분양 카드)" · "ㄱㄱ"
   단지정보 탭 아래 두 칸: ① 주변 단지(1.5km · 세대 100+ · 가까운 순 5) ② 주변 분양 · 공사 중(2km · 청약 공고 · 사업승인 · 공사 중 단지 5).
   카드를 누르면 그 단지 상세(새로 불러오지 않음). 맨 아래 '○○동 단지 전체' → 동네 쪽(/r/법정동). 값은 서버가 원문 그대로 준다. */
const 주변카드기억 = new Map();
async function 주변카드채우기(c) {
  const box = document.querySelector('#detail .nearcards');
  if (!box || !c || c.centroid_lat == null || c.centroid_lng == null) return;
  const 키 = String(c.complex_id ?? `${c.centroid_lat},${c.centroid_lng}`);
  let r = 주변카드기억.get(키);
  if (!r) {
    const lawd = c.sigungu_cd && c.bjdong_cd ? `${c.sigungu_cd}${c.bjdong_cd}` : '';
    try { r = await fetch(`/api/near/cards?lat=${c.centroid_lat}&lng=${c.centroid_lng}&id=${c.complex_id ?? 0}&lawd=${lawd}`).then(x => x.json()); }
    catch (e) { return; }
    if (!r || r.error) return;
    주변카드기억.set(키, r);
  }
  const 지금 = document.querySelector('#detail .nearcards');
  if (!지금 || 지금.dataset.nc !== String(c.complex_id ?? '')) return;   // 그사이 다른 단지로 옮겼다
  const 거리 = m => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${fmt(Math.round(m / 10) * 10)}m`);
  const 월 = v => { const t = String(v || '').replace(/\D/g, ''); return t.length >= 6 ? `${t.slice(0, 4)}.${t.slice(4, 6)}` : ''; };
  const 카드 = (id, 머리, 이름, 줄) => `<a class="ncard" href="/c/${id}" data-cid="${id}">${머리 || ''}<b>${esc(이름 || '이름 없음')}</b><span>${줄}</span></a>`;
  const 단지칸 = (r.단지 || []).length ? `${sect('주변 단지', 'bld', ` <span class="muted">1.5㎞ 안 ${fmt(r.단지수)}곳 · 가까운 순</span>`)}
    <div class="nclist">${r.단지.map(x => 카드(x.id, '', x.이름, [`${fmt(x.세대)}세대`, x.연 ? `${x.연}년` : '', x.mx ? `최고 ${eok(x.mx)}` : '', 거리(x.m)].filter(Boolean).join(' · '))).join('')}</div>
    ${r.동 ? `<a class="ncmore" href="/r/${esc(r.동.cd)}">${esc(r.동.이름)} 단지 전체 ${fmt(r.동.수)}곳 보기 ›</a>` : ''}` : '';
  const 말 = { a: '청약 공고', h: '사업승인', p: '공사 중' };
  const 가칸 = (r.가단지 || []).length ? `${sect('주변 분양 · 공사 중', '', ` <span class="muted">2㎞ 안 · 청약 공고 먼저</span>`)}
    <div class="nclist">${r.가단지.map(x => 카드(x.id, `<i class="ncchip k-${esc(x.종류)}">${말[x.종류] || ''}</i>`, x.이름,
      (x.종류 === 'a' ? [x.최고만원 ? `최고 ${eok(Number(x.최고만원) * 10000)}` : '', x.공급 ? `공급 ${fmt(x.공급)}세대` : '', x.입주 ? `입주 ${월(x.입주)}` : '', 거리(x.m)]
       : x.종류 === 'h' ? [x.세대 ? `${fmt(x.세대)}세대` : '', x.착공 ? `착공 ${월(x.착공)}` : (x.승인 ? `승인 ${월(x.승인)}` : ''), 거리(x.m)]
       : [(x.세대 || x.호) ? [x.세대 ? `${fmt(x.세대)}세대` : '', x.호 ? `${fmt(x.호)}호` : ''].filter(Boolean).join(' · ') : '', x.착공 ? `착공 ${월(x.착공)}` : '', 거리(x.m)]).filter(Boolean).join(' · '))).join('')}</div>` : '';
  지금.innerHTML = 단지칸 + 가칸;
  지금.onclick = e => {
    const a = e.target.closest('a.ncard'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); select(Number(a.dataset.cid));
  };
}
function 대장전말(V, 무엇) {
  return `<p class="note"><span class="gapw">${esc(무엇)} 없음 · ${V.종류 === 'p' ? '사용승인' : '사용검사'} 전</span> 건축물대장이 아직 없어 ${esc(무엇)}이(가) 이어지지 않습니다 — 대장이 생기면 일반 단지로 넘어가 채워집니다.</p>`;
}
function 가상분양칸(V) {
  const 청 = V.청약 || [];
  const 공고전말 = '청약홈에 같은 지번 공고가 아직 없습니다 — 공고가 나면(청약홈 · 매일 05:10 받음) 이 칸이 채워집니다. 민간 사이트의 분양 일정 · 분양가 · 시공사는 공식 경로가 없어 쓰지 않습니다.';
  const 시공 = (청.find(x => x.cnstrct_entrps_nm) || {}).cnstrct_entrps_nm, 주체 = (청.find(x => x.bsns_mby_nm) || {}).bsns_mby_nm;
  const 최고 = 청.find(x => x.최고분양가);
  return `${sect(`청약 공고 <span class="muted">${fmt(청.length)}</span>`, 'houseplanah')}
    <dl>
      <dt>시공사</dt><dd>${시공 ? esc(시공) + ' <span class="muted">(청약 공고)</span>' : `<span class="gapw" title="${esc(공고전말)}">모름 · 공고 전</span>`}</dd>
      <dt>사업주체</dt><dd>${주체 ? esc(주체) + ' <span class="muted">(청약 공고)</span>' : `<span class="gapw" title="${esc(공고전말)}">모름 · 공고 전</span>`}</dd>
      <dt>분양가</dt><dd>${최고 ? `최고 ${eok(Number(최고.최고분양가) * 10000)} <span class="muted">(청약 공고)</span>` : `<span class="gapw" title="${esc(공고전말)}">모름 · 공고 전</span>`}</dd>
    </dl>
    ${청.length ? `<ul class="plain">${청.map(a => `<li><b>${esc(a.house_nm || '')}</b> <span class="muted">${esc(String(a.rcrit_pblanc_de || '').trim())} 공고 · ${fmt(a.tot_suply)}세대${a.mvn_prearnge_ym ? ` · 입주 ${esc(String(a.mvn_prearnge_ym).slice(0, 4))}.${esc(String(a.mvn_prearnge_ym).slice(4, 6))} 예정` : ''}</span>
        ${a.pblanc_url ? `<a href="${esc(a.pblanc_url)}" target="_blank" rel="noopener">청약홈 공고</a>` : ''}</li>`).join('')}</ul>`
      : `<p class="note"><span class="gapw" title="${esc(공고전말)}">같은 지번의 청약 공고가 아직 없습니다</span></p>`}`;
}
/* 토지 탭 맨 위(일반 단지의 '이 땅의 역사' 자리) — 토지특성 · 토지 이동 · 철거멸실(이 필지). 단지 번호가 없어 역사 목차 대신 원문 칸 */
function 가상땅칸(땅) {
  if (!땅) return '';
  const t = 땅.토지 || null;
  const row = (k, v) => (v == null || v === '' ? '' : `<dt>${k}</dt><dd>${v}</dd>`);
  return `${t ? `${sect('토지특성', 'parcel', '', t.base_year ? `${esc(t.base_year)}년` : '')}
    <dl>
      ${row('지목 · 면적', [t.지목, t.면적 != null ? `${fmt(Math.round(Number(t.면적) * 100) / 100)}㎡` : null].filter(Boolean).map(esc).join(' · '))}
      ${row('개별공시지가', t.공시지가 != null ? `${fmt(Math.round(Number(t.공시지가)))}원/㎡` : null)}
      ${row('이용상황', esc(t.이용상황 || ''))}
      ${row('지형 · 도로', [t.지형고저, t.지형형상, t.도로접면].filter(Boolean).map(esc).join(' · '))}
    </dl>` : ''}
    ${(땅.이동 || []).length ? `${sect('토지 이동 이력', 'parcel', '', '토지이동이력')}<ul class="lu">${땅.이동.map(z => `<li><b>${esc(날짜(z.이동일))}</b> <span>${esc(z.이동사유 || '')}</span></li>`).join('')}</ul>` : ''}`;   /* 철거 신고는 건축인허가 칸 · 이 땅의 역사가 맡는다(가단지 번호로) */
}
let 고른가상 = null;
/* 옛 '최근 본 단지'(공사 중 · 승인 원문 번호) → 가단지 번호(389)로 일반 단지 길(select) */
async function selectVirtual(kind, pk) {
  try {
    const g = await fetch(`/api/precomplex/${kind}/${encodeURIComponent(pk)}`).then(r => r.json());
    if (g && g.상태 === '이동' && g.이동_complex_id) return select(g.이동_complex_id, false);
    if (g && g.complex_id) return select(g.complex_id, false);
    toast('이 건은 지금 원문에 없습니다(사용승인 · 사용검사가 났거나 원문에서 빠졌습니다).', 4000);
  } catch (e) { toast('불러오지 못했습니다', 3000); }
}
function selectPreBuild(pk) { return selectVirtual('p', pk); }

async function selectNewbuild(code, fromList) {
  selectedKapt = code; selected = null;
  주소맞춤('/', 상세쌓기());           // 대장 없는 신축은 아직 단지 주소가 없다
  시트('full');
  목록자동(true);
  document.querySelectorAll('.row').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.kapt === code)));
  const box = $('#detail');
  box.hidden = false;
  box.innerHTML = '<p class="muted">불러오는 중…</p>';
  try {
    const d = await fetch(`/api/newbuilds/${encodeURIComponent(code)}`).then(r => r.json());
    if (d.error) {
      box.innerHTML = `<p class="muted">${esc(d._상태 === 404 ? (d.hint || d.error) : '신축 단지를 불러오지 못했습니다.')}</p>`;
      if (d._상태 !== 404)
        오류카드({ 무엇: '신축 단지', 응답: d, 단지코드: code, 다시: () => selectNewbuild(code, fromList) });
      return;
    }
    renderNewbuild(d);
    const n = d.newbuild;
    recentPush('n', code, n.kapt_name || '', `${n.lawd_nm || ''} · ${fmt(n.세대)}세대`);
    focusLayer.clearLayers(); focusBldLayer.clearLayers();
    if (n.centroid_lat) map.setView([n.centroid_lat, n.centroid_lng], 17);
    loadNewbuilds();
  } catch (e) {
    box.innerHTML = `<p class="muted">신축 정보를 불러오지 못했습니다.<br>${esc(e.message)}</p>`;
  }
}

/* 2026-10-24 21:46 사장님(신축 장위자이레디언트): ① 매매 · 전세 · 월세를 못 고른다 ② 전월세 보증금이 '—' ③ 날짜 정렬이 안 됨.
   → 종류 탭(매매 · 전세 · 월세 — 단지 화면과 같은 3갈래) · 평형 요약은 고른 종류만(값 = 매매가 / 보증금) ·
     그 아래 **최근 거래 목록(날짜 내림차순)**. 분양권 · 입주권은 매매 목록에 섞고 표시(단지 화면 316 과 같게) — 요약에는 넣지 않는다. */
let 신축거래탭 = '매매', 신축더보기 = false, 신축마지막 = null;
function renderNewbuild(data) {
  const { newbuild: n, tradeStats, trades, cost } = data;
  if (!신축마지막 || 신축마지막.newbuild.kapt_code !== n.kapt_code) { 신축거래탭 = '매매'; 신축더보기 = false; }
  신축마지막 = data;
  lastDetail = null; lastGeo = null; lastBgeo = null;
  clearShots();
  const day = v => 날짜(v);
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const stats = tradeStats || [], 목록 = trades || [];
  const 종류들 = ['매매', '전세', '월세'];
  const 수 = k => { const x = 목록.find(t => t.종류 === k); return x ? Number(x.전체) : 0; };
  if (!수(신축거래탭)) 신축거래탭 = 종류들.find(k => 수(k)) || '매매';
  const 값이름 = 신축거래탭 === '매매' ? '최고가' : '최고 보증금';

  /* 동은 못 보여준다 — 31개 동의 이름을 아는 공공데이터가 없다.
     대신 실거래의 aptSeq 가 단지를 갈라준다(4-15). '장위자이레디언트(2단지)' 처럼 이름이 그대로 들어 있다. */
  const 이름표 = new Map(stats.filter(t => t.apt_seq).map(t => [t.apt_seq, t.seq_nm]));
  const bySeq = new Map();
  stats.filter(t => t.종류 === 신축거래탭).forEach(t => {
    const k = t.apt_seq || '';
    if (!bySeq.has(k)) bySeq.set(k, { nm: t.seq_nm, rows: [], cnt: 0 });
    const g = bySeq.get(k); g.rows.push(t); g.cnt += (t.cnt || 0);
  });
  const groups = [...bySeq.values()].sort((a, b) => b.cnt - a.cnt);
  const 갈림 = new Set(stats.map(t => t.apt_seq || '')).size;
  const 요약 = groups.map(g => `
    <div class="subsect">${갈림 > 1 ? esc(g.nm || '단지 미상') + ' · ' : ''}${신축거래탭} ${fmt(g.cnt)}<span class="muted"> · ${g.rows.length}개 평형 (평형 순)</span></div>
    <table><thead><tr><th>평형</th><th class="n">건</th><th class="n">${값이름}</th><th class="n">최근</th></tr></thead><tbody>
    ${g.rows.sort((a, b) => a.area_grp - b.area_grp).map(r => `<tr>
      <td>${r.area_grp}㎡<span class="muted"> ${(r.area_grp / 3.3058).toFixed(1)}평</span></td>
      <td class="n">${fmt(r.cnt)}${r.canceled_cnt ? `<span class="warnx"> 해제${r.canceled_cnt}</span>` : ''}</td>
      <td class="n">${r.max_amount != null ? eok(r.max_amount) : '—'}</td>
      <td class="n">${ymd(r.last_ymd)}</td></tr>`).join('')}</tbody></table>`).join('');

  const 고른 = 목록.filter(t => t.종류 === 신축거래탭);
  const 보일 = 신축더보기 ? 고른 : 고른.slice(0, 30);
  const 돈 = t => 신축거래탭 === '매매' ? eok(t.금액)
    : 신축거래탭 === '월세' ? `${eok(t.보증금)} / ${fmt(Math.round(Number(t.월세) / 10000))}만` : eok(t.보증금);
  const 거래표 = 고른.length ? `
    <div class="subsect">최근 거래<span class="muted"> · 날짜 최신 순${수(신축거래탭) > 고른.length ? ` · 전체 ${fmt(수(신축거래탭))}건 중 최근 ${fmt(고른.length)}건` : ''}</span></div>
    <table><thead><tr><th>날짜</th>${갈림 > 1 ? '<th>단지</th>' : ''}<th class="n">전용</th><th class="n">층</th><th class="n">${신축거래탭 === '매매' ? '가격' : 신축거래탭 === '월세' ? '보증금 / 월세' : '보증금'}</th></tr></thead><tbody>
    ${보일.map(t => `<tr${t.취소 ? ' class="dim"' : ''}>
      <td>${ymd(t.날짜)}</td>
      ${갈림 > 1 ? `<td class="muted">${esc(String(이름표.get(t.apt_seq) || '').replace(/^.*\(/, '(') || '—')}</td>` : ''}
      <td class="n">${t.면적 != null ? Number(t.면적).toFixed(2) : '—'}</td>
      <td class="n">${t.층 != null ? fmt(t.층) : '—'}</td>
      <td class="n">${돈(t)}${t.분양권 ? ` <span class="pill">${esc(t.분양권)}</span>` : ''}${t.취소 ? '<span class="warnx"> 해제</span>' : ''}${t.갱신 ? '<span class="muted"> 갱신</span>' : ''}${t.직거래 ? '<span class="muted"> 직거래</span>' : ''}</td>
    </tr>`).join('')}</tbody></table>
    ${고른.length > 30 ? `<button type="button" class="moreb" data-nbmore>${신축더보기 ? '접기' : `${fmt(고른.length - 30)}건 더 보기`}</button>` : ''}` : '';
  const 탭 = 목록.length ? `<div class="apick tpick">${종류들.map(k => `<button type="button" class="achip" role="tab" aria-selected="${k === 신축거래탭}" data-nbkind="${k}"${수(k) ? '' : ' disabled'}>${k} <b>${fmt(수(k))}</b></button>`).join('')}</div>` : '';
  const tradeBlocks = 탭 + (갈림 > 1 ? `<p class="note sm" title="한 지번 · 신고 단지 일련번호로 구분">실거래 ${갈림}개 단지로 나뉨</p>` : '') + 요약 + 거래표;

  $('#detail').innerHTML = `
    <span class="pill nb" title="건축물대장이 아직 없는 신축 — K-apt 정보만(동 · 필지 · 공시지가 없음)">대장 없는 신축</span>
    <h2>${esc(n.kapt_name || '(이름 없음)')}</h2>
    <p class="sub">${esc(n.kapt_addr || '')}${n.doro_juso ? '<br>' + esc(n.doro_juso) : ''}</p>


    <dl>
      ${row('세대수', fmt(n.세대))}
      ${row('동수', fmt(n.동수))}
      ${row('사용승인', day(n.사용승인))}
      ${n.top_floor ? row('최고 층수', '지상 ' + fmt(n.top_floor) + '층') : ''}
      ${n.난방 ? row('난방', esc(n.난방)) : ''}
      ${n.시공 ? row('시공', esc(n.시공)) : ''}
      ${n.시행 ? row('시행', esc(n.시행)) : ''}
      ${row('법정동', esc(n.lawd_nm || n.bjd_code || '—'))}
      ${row('대표지번 PNU', esc(n.pnu))}
      ${row('건축인허가', n.인허가 ? fmt(n.인허가) + '건' : '없음')}
      ${row('K-apt 코드', esc(n.kapt_code))}
    </dl>
    ${tradeBlocks}
    ${목록.length ? '' : '<p class="muted" style="padding:6px 2px">이 지번에 매칭된 실거래가 없습니다.</p>'}
    <div class="ahbox" data-ah="k|${esc(n.kapt_code)}"></div>
    ${costBlock(cost, { kapt코드: n.kapt_code, hhld: 999 })}`;
  분양채우기();
  관리비추이채우기();
}

document.addEventListener('click', e => {
  const k = e.target.closest('#detail [data-nbkind]');
  const m = e.target.closest('#detail [data-nbmore]');
  if (!(k || m) || !신축마지막) return;
  if (k) { 신축거래탭 = k.dataset.nbkind; 신축더보기 = false; }
  if (m) 신축더보기 = !신축더보기;
  const y = $('#detail').scrollTop;
  renderNewbuild(신축마지막);
  $('#detail').scrollTop = y;
});

/* ═══════════ 자동완성 (2026-10-21, 사장님 요청) ═══════════
   "법정동·행정동으로도 검색 가능해야 하고 자동완성에 떠야 해" + 재개발·상가·학원·학교.
   ★ 목록 검색(search)은 그대로 둔다. 자동완성은 **종류마다 몇 개씩** 빨리 보여 주고,
     고르면 **그 자리로 지도를 옮긴다.** 두 글자부터(한 글자는 60초가 걸렸다 - 서버 주석).
   ★ 늦게 온 응답은 버린다(차례 번호). 빨리 친 사람에게 앞 글자의 제안이 뜨면 안 된다.
   ★ 종류마다 '전체 N개 중 k' 를 적는다 — 자르면 말한다(작업방식 10장).
   ★ 키보드: ↑↓ 고르기 · Enter 열기 · Esc 닫기. 아무것도 안 고르고 Enter 면 목록 검색 그대로. */
const 제안 = { 차례: 0, 고른: -1, 항목: [], 타이머: null, 마지막: null };
const 찾은점Layer = { 층: null };

function 제안닫기() {
  const el = $('#sugg'); if (!el) return;
  el.hidden = true; $('#q').setAttribute('aria-expanded', 'false');
  제안.고른 = -1;
}
function 글자강조(이름, q) {
  const s = String(이름 || ''), i = s.toLowerCase().indexOf(String(q).toLowerCase());
  if (i < 0 || !q) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}
function 제안그리기(j) {
  const el = $('#sugg'); if (!el) return;
  제안.항목 = []; 제안.고른 = -1;
  if (j.안내) { el.innerHTML = `<div class="sg-note">${esc(j.안내)}</div>`; el.hidden = false; return; }
  if (!j.묶음 || !j.묶음.length) {
    /* 2026-10-23: 'e편한세상금정산'(부산 북구) 처럼 **다루는 지역 밖**이라 없는 경우가 있다 — 범위를 같이 적는다 */
    el.innerHTML = `<div class="sg-note">'${esc(j.q)}' 로 제안할 것이 없습니다 — 아래 목록 검색 결과를 보세요<br><span class="muted">터무니는 지금 <b>${esc(범위말로())}</b>만 다룹니다.</span></div>`;
    el.hidden = false; $('#q').setAttribute('aria-expanded', 'true'); return;
  }
  let html = j.꼬리뗌 ? `<div class="sg-note">'${esc(j.꼬리뗌.원래)}' 그대로인 이름은 없어 <b>'${esc(j.꼬리뗌.찾은말)}'</b> 로 찾았습니다</div>` : '';
  for (const g of j.묶음) {
    const 더 = g.전체 > g.항목.length ? `<span class="sg-n">${fmt(g.전체)}개 중 ${g.항목.length}</span>`
                                      : `<span class="sg-n">${fmt(g.전체)}</span>`;
    const 덧말 = [g.앞부분만 ? '이름 앞부분이 같은 것만' : null,
                  g.좌표없음 ? `위치를 아직 못 붙인 ${fmt(g.좌표없음)}곳은 빠졌습니다` : null].filter(Boolean).join(' · ');
    html += `<div class="sg-g" role="presentation"><div class="sg-h">${esc(g.종류)} ${더}${덧말 ? `<span class="sg-x">${esc(덧말)}</span>` : ''}</div>`;
    for (const it of g.항목) {
      const k = 제안.항목.length;
      제안.항목.push({ ...it, 종류: g.종류 });
      html += `<div class="sg-it" role="option" id="sg-${k}" data-k="${k}" aria-selected="false">
        <span class="sg-nm">${글자강조(it.이름, j.q)}${it.표 ? ` <span class="sg-tag">${esc(it.표)}</span>` : ''}</span>${it.보조 ? `<span class="sg-sub">${esc(it.보조)}</span>` : ''}</div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html; el.hidden = false; $('#q').setAttribute('aria-expanded', 'true');
  제안높이();
}
/* ★ 좁은 화면에서는 목록 패널이 아래를 자른다 - 자른 곳까지만 키워서 **스스로 스크롤**되게 한다.
   안 그러면 잘린 아래 항목은 볼 수도 누를 수도 없다(2026-10-21 375px 에서 겪음). */
function 제안높이() {
  const el = $('#sugg'); if (!el || el.hidden) return;
  let 바닥 = window.innerHeight;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ov = getComputedStyle(p).overflowY;
    if (ov === 'hidden' || ov === 'auto' || ov === 'scroll' || ov === 'clip') { 바닥 = Math.min(바닥, p.getBoundingClientRect().bottom); }
  }
  const 위 = el.getBoundingClientRect().top;
  el.style.maxHeight = Math.max(140, Math.min(520, 바닥 - 위 - 8)) + 'px';
}
function 제안표시(k) {
  const el = $('#sugg'); if (!el || el.hidden || !제안.항목.length) return;
  제안.고른 = (k + 제안.항목.length) % 제안.항목.length;
  el.querySelectorAll('.sg-it').forEach(x => x.setAttribute('aria-selected', String(Number(x.dataset.k) === 제안.고른)));
  const on = el.querySelector(`#sg-${제안.고른}`);
  if (on) { on.scrollIntoView({ block: 'nearest' }); $('#q').setAttribute('aria-activedescendant', on.id); }
}
async function 제안부르기() {
  const q = $('#q').value.trim();
  const 내차례 = ++제안.차례;
  if (!q) return 제안닫기();
  try {
    let j = await fetch('/api/suggest?q=' + encodeURIComponent(q)).then(r => r.json());
    if (내차례 !== 제안.차례 || askMode) return;      /* 늦게 온 것 · 그새 AI 검색으로 바꿈 */
    if (j.error) { 제안닫기(); return 오류토스트('자동완성', j); }
    /* ★ 2026-10-29 QA: '광주 봉선동' · '부산 연제구 거제동' · '제주 노형' 처럼 **지역을 앞에 붙이면 0건**이었다(검색어 전체를 이름으로 찾아서).
         0건이고 낱말이 둘 이상(숫자 없음)이면 마지막 낱말로 다시 찾고, 앞 낱말(지역)이 주소 · 이름에 **모두 들어 있는 것만** 남긴다.
         줄임말은 공식 이름으로도 맞춘다(충북 → 충청북도 …). 거른 뒤의 수만 보인다(서버 '전체' 는 거르기 전 수라 안 쓴다). */
    const 낱말 = q.split(/\s+/).filter(Boolean);
    if (!(j.묶음 || []).some(g => (g.항목 || []).length) && 낱말.length >= 2 && !/\d/.test(q)) {
      const 줄임 = { 충북: '충청북도', 충남: '충청남도', 경북: '경상북도', 경남: '경상남도', 전남: '전남광주', 광주: '광주', 서울시: '서울', 부산시: '부산' };
      const 앞 = 낱말.slice(0, -1), 끝 = 낱말[낱말.length - 1];
      const j2 = await fetch('/api/suggest?q=' + encodeURIComponent(끝)).then(r => r.json());
      if (내차례 !== 제안.차례 || askMode) return;
      if (!j2.error) {
        const 맞나 = it => { const t = ((it.보조 || '') + ' ' + (it.이름 || '')).replace(/\s+/g, ''); return 앞.every(w => t.includes(w) || (줄임[w] && t.includes(줄임[w]))); };
        const 묶음 = (j2.묶음 || []).map(g => { const 항목 = (g.항목 || []).filter(맞나); return { ...g, 항목, 전체: 항목.length }; }).filter(g => g.항목.length);
        if (묶음.length) j = { ...j2, q, 묶음 };
      }
    }
    /* 10-30 사장님 "호반써밋초량 안뜨는디": 사업승인 아파트(공고 전 · 공사 중)도 제안에 — 따로 받아 묶음 하나로 붙인다 */
    try {
      const hp = await fetch('/api/houseplans/search?q=' + encodeURIComponent(q)).then(r => r.json());
      if (내차례 !== 제안.차례 || askMode) return;
      if (hp && hp.items && hp.items.length) {
        const 묶 = { 종류: '사업승인 아파트', 전체: hp.전체, 항목: hp.items.slice(0, 5).map(h => ({
          이름: h.이름 || '이름 없음', 보조: [h.대지위치, fmt(h.세대) + '세대', h.승인일 ? '사업계획승인 ' + 날8(h.승인일) : null].filter(Boolean).join(' · '),
          표: '사업승인 · 사용검사 전', 동작: { 종류: '승인', hp: h } })) };
        j = { ...j, q: j.q || q, 묶음: [...(j.묶음 || []), 묶] };
        delete j.안내;
      }
    } catch (e) { /* 보조 — 실패해도 제안은 그대로 */ }
    /* 10-30 "ㄱㄱ": 공사 중 건물(건축허가 · 착공 · 사용승인 전)도 묶음 하나로 */
    try {
      const pb = await fetch('/api/prebuilds/search?q=' + encodeURIComponent(q)).then(r => r.json());
      if (내차례 !== 제안.차례 || askMode) return;
      if (pb && pb.items && pb.items.length) {
        const 묶 = { 종류: '공사 중 건물', 전체: pb.전체, 항목: pb.items.slice(0, 5).map(h => ({
          이름: h.이름 || '이름 없음', 보조: [h.대지위치, 세대호말(h), h.착공일 ? '착공 ' + 날8(h.착공일) : null].filter(Boolean).join(' · '),
          표: '공사 중 · 사용승인 전', 동작: { 종류: '공사', pk: h.pk, id: h.complex_id } })) };
        j = { ...j, q: j.q || q, 묶음: [...(j.묶음 || []), 묶] };
        delete j.안내;
      }
    } catch (e) { /* 보조 */ }
    제안.마지막 = j;
    if (document.activeElement === $('#q')) 제안그리기(j);
  } catch (e) { if (내차례 === 제안.차례) 제안닫기(); }
}
function 상자로(b) {
  if (!b) return false;
  map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: 16 });
  return true;
}
async function 제안고르기(it) {
  제안닫기();
  if (!it) return;
  const d = it.동작 || {};
  if (찾은점Layer.층) 찾은점Layer.층.clearLayers();
  if (d.종류 === '단지') return select(d.id, false);
  if (d.종류 === '승인') return 승인으로(d.hp);
  if (d.종류 === '공사') return d.id ? select(d.id, false) : selectPreBuild(d.pk);
  if (d.종류 === '신축') return selectNewbuild(d.code, false);
  if (d.종류 === '법정동') {
    if (d.경계있음) return selectLawd(d.lawd_cd);
    상자로(d.bbox);
    return toast(`${esc(it.보조 || it.이름)} — 법정동 경계는 아직 받지 않아서, 단지가 있는 범위로 옮겼습니다`, 5000);
  }
  if (d.종류 === '범위') { 상자로(d.bbox); return toast(`${esc(it.보조 ? it.보조 + ' ' : '')}${esc(it.이름)}`, 3000); }
  if (d.종류 === '행정동') {
    try {
      const f = await fetch(`/api/adms/${encodeURIComponent(d.adm_cd)}/geo`).then(r => r.json());
      if (f.error) { 상자로(d.bbox); return 오류토스트('행정동 경계', f); }
      lawdFocusLayer.clearLayers(); lawdFocusLayer.addData(f);
      map.fitBounds(lawdFocusLayer.getBounds(), { padding: [40, 40] });
      const p = f.properties;
      toast(`${esc(p.adm_nm)} (행정동)`
        /* ★ 19:36 사장님: "상가 비율은 필요없어 행정동을 보여주는게 더 중요해" — 상가 쪽 이야기는 화면에서 뺀다 */
        + ` · 경계 통계청 SGIS ${esc(p.year)}`, 6000);
    } catch (e) { 상자로(d.bbox); 오류토스트('행정동 경계', null, e); }
    return;
  }
  if (d.종류 === '폐쇄') return 폐쇄상세(d.key);     // 12:32 왼쪽 상세 + 지도에 X 표 · 회색 필지
  if (d.종류 === '공고') return 공고상세(d.house, d.lat, d.lng);   // 12:32 단지에 안 이어진 청약 공고
  if (d.종류 === '정비' && d.sn) return selectRedevZone(d.sn);   // 2026-10-22 사장님: 누르면 바로 구역 상세로
  if (d.종류 === '정비') {
    if ($('#overlay').value !== 'redev') {            /* 정비사업 겹쳐보기를 켠다 — 구역이 보여야 고른 의미가 있다 */
      $('#overlay').value = 'redev';
      $('#overlay').dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (!상자로(d.bbox) && d.lat) map.setView([d.lat, d.lng], 16);
    return toast(`${esc(it.이름)}${it.보조 ? ' · ' + esc(it.보조) : ''}`, 5000);
  }
  if (d.종류 === '점' && d.lat != null) {
    if (!찾은점Layer.층) 찾은점Layer.층 = L.layerGroup().addTo(map);
    const m = L.circleMarker([d.lat, d.lng], { radius: 9, weight: 3, color: css('--mark'),
                                               fillColor: css('--surface'), fillOpacity: 1 })
      .bindPopup(`<div class="t">${esc(it.이름)}</div><div class="m">${esc(it.종류)}${it.보조 ? ' · ' + esc(it.보조) : ''}</div>`)
      .addTo(찾은점Layer.층);
    map.setView([d.lat, d.lng], 17);
    setTimeout(() => m.openPopup(), 350);
  }
}

/* ---------------- 법정동 ---------------- */
/* 넓게 보면 법정동 경계와 요약 마커, 확대하면 단지 마커. 둘을 같이 띄우면
   라벨이 서로 가린다. */
/* ★ 경계를 행정동으로 볼지 (2026-10-21). 고른 것은 이 브라우저에만 기억한다(편의). */
let 행정동보기 = false;
try { 행정동보기 = localStorage.getItem('teomoony.adm') === '1'; } catch { /* 저장소가 막힌 곳 */ }

async function loadLawds() {
  if (행정동보기) return loadAdms();
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  try {
    const fc = await fetch(`/api/lawds?bbox=${bbox}`).then(r => r.json());
    if (fc.error) return 오류토스트('법정동', fc);
    lawdLayer.clearLayers();
    lawdMarkerLayer.clearLayers();
    if (!fc.features || !fc.features.length) {
      /* ★ 말풍선이 아니라 범례 줄로 (2026-10-20). 지도를 움직일 때마다 떠서
         지도를 덮었다 - 이것도 '상태' 지 '사건' 이 아니다. */
      return 지도알림('법정동', '이 영역에는 적재된 법정동 경계가 없습니다'
        + (개발중 ? ' <b>py load_lawd_geom.py --sgg 11110</b>' : ''));
    }
    지도알림('법정동', '');
    lawdLayer.addData(fc);
    /* ★ 2026-10-21: 이름표를 **이름만** 남긴다. 전에는 '돈암동 최고 18.2억' 꼴(폭 ~111px)이라
       데스크톱 줌 13 에서 126개 중 119개(94%)가 서로 겹쳐 경계를 덮었다.
       숫자는 버리지 않고 마우스를 올리면 보이는 말(title)로 옮긴다. */
    fc.features.forEach(f => {
      const p = f.properties;
      if (p.centroid_lat == null) return;
      const amt = p.max_amount == null ? null : Number(p.max_amount) / 100000000;
      const price = amt == null ? null
        : (amt >= 10 ? amt.toFixed(1) : amt.toFixed(2)).replace(/\.?0+$/, '') + '억';
      const ym = p.max_ymd ? 날짜(p.max_ymd) : '';
      L.marker([p.centroid_lat, p.centroid_lng], {
        icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
          html: `<div class="lmark"><b>${esc(p.emd_nm || '')}</b></div>` }),
        title: [p.full_nm || p.emd_nm || '',
                `단지 ${fmt(p.complex_cnt || 0)}`, `세대 ${fmt(p.hhld_cnt || 0)}`,
                `매매 ${fmt(p.trade_cnt || 0)}건`,
                price ? `최고 ${price}${ym ? ' (' + ym + ', 거래 한 건)' : ''}` : null,
                '누르면 이 동의 단지를 봅니다'].filter(Boolean).join(' · '),
        우선: Number(p.hhld_cnt) || Number(p.complex_cnt) || 0,
      }).on('click', function () {
        map.setView(this.getLatLng(), LAWD_ZOOM);     // 클릭하면 그 동의 단지 보기로 들어간다
      }).addTo(lawdMarkerLayer);
    });
    const 정리 = 법정동이름표정리();
    지도알림('법정동', 정리.숨김
      ? `법정동 이름 ${fmt(정리.전체 - 정리.숨김)} / ${fmt(정리.전체)}개 — 겹치는 ${fmt(정리.숨김)}개는 확대하면 보입니다`
      : '');
  } catch (e) {
    toast(`법정동 조회 실패: ${esc(e.message)}`, 6000);
  }
}

/* ★ 겹치는 이름표 숨기기 (2026-10-21)
   세대가 많은 동부터 놓고, 이미 놓인 이름표와 겹치면 숨긴다. 확대하면 화면 위 거리가
   벌어지므로 다시 계산하면 숨었던 것이 나타난다(지도를 움직일 때마다 loadLawds 가 다시 그린다).
   ★ 숨긴 것은 지우지 않는다 - 경계 면은 그대로 있고 누를 수 있다. 몇 개를 숨겼는지는 범례 줄이 말한다.
   ★ 크기는 **그려진 뒤** 잰다. 글꼴·테마에 따라 폭이 달라서 짐작한 폭으로 재면 틀린다. */
function 법정동이름표정리() {
  const 목록 = [];
  lawdMarkerLayer.eachLayer(m => {
    const el = m.getElement && m.getElement();
    if (el) 목록.push({ el, 우선: m.options.우선 || 0 });
  });
  목록.sort((a, b) => b.우선 - a.우선);
  const 놓은 = [];
  let 숨김 = 0;
  for (const x of 목록) {
    const 상자 = x.el.firstElementChild || x.el;
    x.el.style.visibility = '';
    const r = 상자.getBoundingClientRect();
    const 겹침 = r.width > 0 && 놓은.some(o =>
      r.left < o.right + 4 && r.right + 4 > o.left && r.top < o.bottom + 2 && r.bottom + 2 > o.top);
    if (겹침) { x.el.style.visibility = 'hidden'; x.el.style.pointerEvents = 'none'; 숨김++; }
    else { x.el.style.pointerEvents = ''; 놓은.push(r); }
  }
  return { 전체: 목록.length, 숨김 };
}

/* ---------------- 행정동 경계 (2026-10-21) ----------------
   법정동과 **같은 층**(lawdLayer·lawdMarkerLayer)에 그린다 - 둘 중 하나만 보이게.
   이름표 겹침 숨기기도 같은 함수를 쓴다. */
async function loadAdms() {
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  try {
    const fc = await fetch(`/api/adms?bbox=${bbox}`).then(r => r.json());
    if (fc.error) return 오류토스트('행정동 경계', fc);
    if (!행정동보기) return;                 /* 기다리는 사이 법정동으로 돌렸다 */
    lawdLayer.clearLayers();
    lawdMarkerLayer.clearLayers();
    if (!fc.features || !fc.features.length)
      return 지도알림('법정동', `이 영역에는 행정동 경계가 없습니다 (${범위말로()}만 받았습니다)`);
    lawdLayer.addData(fc);
    fc.features.forEach(f => {
      const p = f.properties;
      if (p.centroid_lat == null) return;
      /* ★ 19:36 사장님: 상가 비율·상가 수는 필요 없다 — 행정동 자체를 보여 준다. (이름표 겹칠 때 우선순위로만 상가 수를 쓴다) */
      L.marker([p.centroid_lat, p.centroid_lng], {
        icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
          html: `<div class="lmark amark"><b>${esc(p.emd_nm || '')}</b></div>` }),
        title: [`${p.adm_nm} (행정동)`, `경계 출처 통계청 SGIS ${p.year}`,
                '누르면 확대합니다'].join(' · '),
        우선: Number(p.상가수) || 0,
      }).on('click', function () {
        map.setView(this.getLatLng(), LAWD_ZOOM);
      }).addTo(lawdMarkerLayer);
    });
    const 정리 = 법정동이름표정리();
    지도알림('법정동', `행정동 경계 · 통계청 SGIS ${esc(fc.features[0].properties.year)}`
      + (정리.숨김 ? ` · 이름 ${fmt(정리.전체 - 정리.숨김)} / ${fmt(정리.전체)}개 (겹치는 것은 확대하면 보입니다)` : ''));
  } catch (e) {
    오류토스트('행정동 경계', null, e);
  }
}

function refreshMap() {
  const dong = map.getZoom() < LAWD_ZOOM;
  if (dong) {
    markerLayer.clearLayers(); markerOf.clear();
    지도알림('마커', '');              /* 법정동 보기에는 '단지 400개까지만' 이 해당 없다 */
    newbuildLayer.clearLayers();
    if (분양핀층) 분양핀층.clearLayers();
    if (폐쇄핀층) 폐쇄핀층.clearLayers();
    loadLawds();
  } else {
    lawdLayer.clearLayers(); lawdMarkerLayer.clearLayers();
    지도알림('법정동', '');            /* 단지 보기로 들어가면 '이름 N개 숨김' 은 해당 없다 */
    loadMarkers();
    loadNewbuilds();
    분양핀불러오기();
    폐쇄핀불러오기();
  }
  if (showPolys) loadParcels(); else { parcelLayer.clearLayers(); buildingLayer.clearLayers(); }
  loadOverlay();
}

/* ---------------- 겹쳐보기 (2026-10-19) ----------------
   ★ 색을 쓰는 방식이 둘 다 다르다 - 섞으면 안 된다.
     용도지역은 **범주**(주거/상업/공업/녹지)라 서로 다른 색조,
     추진단계는 **순서**(기획 -> 준공)라 한 색조의 밝기 단계다.
   ★ 두 팔레트 모두 검증기를 돌려서 통과한 값이다(명도대역·채도·색각·대비).
     눈으로 고르지 않았다. */
const Z_GRP = { 주거: '--z-res', 상업: '--z-com', 공업: '--z-ind', 녹지: '--z-grn' };
/* 판 전체 투명도 — 범례 견본도 같은 값으로 칠한다(지도와 범례가 같은 색으로 보이게) */
const OV_투명 = { zone: 0.4, redev: 0.45 };
function 용도팝업(p) {
  return `<div class="t">${esc(p.uname || '(이름 없음)')}</div>`
    + `<div class="m">${esc(p.sigg_name || '')}${p.dyear ? ' · ' + esc(p.dyear) + '년 결정' : ''}</div>`
    + (p.grp ? '' : '<div class="m">대분류로 분류하지 못한 용도지역입니다</div>');
}
function 정비팝업(p) {
  return `<div class="t">${esc(p.zone_nm || '')}</div>`
    + `<div class="m">${esc(p.biz || p.lclas || '')}</div>`
    + `<div class="m">${p.stage ? esc(p.stage) : '추진단계 코드 ' + esc(p.cd || '') + ' 가 코드표에 없습니다'}`
    + `${p.pct == null ? '' : ` · 진행 ${p.pct}%`}</div>`
    + (p.area ? `<div class="m">${fmt(Math.round(p.area))} ㎡</div>` : '')
    + (p.present_sn ? `<button type="button" class="popbtn" data-redevzone="${esc(p.present_sn)}">구역 상세 보기</button>` : '');
}
/* 점이 GeoJSON 다각형 안에 있나(구멍 고려, 반직선 교차). 좌표는 [lng, lat] */
function 점안(lng, lat, g) {
  const 고리안 = r => { let 안 = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) 안 = !안;
    } return 안; };
  const 면안 = rs => 고리안(rs[0]) && !rs.slice(1).some(고리안);
  if (!g) return false;
  if (g.type === 'Polygon') return 면안(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(면안);
  return false;
}
/* 누른 자리에 겹친 영역 **전부**를 위(작은 것)부터 보여 준다 — 위에 그린 색에 가려진 것도 숨지 않는다 */
function 겹침목록팝업(e, 층, 글) {
  const { lat, lng } = e.latlng, 맞은 = [];
  층.eachLayer(l => { if (l.feature && 점안(lng, lat, l.feature.geometry)) 맞은.push(l.feature.properties); });
  if (!맞은.length && e.layer && e.layer.feature) 맞은.push(e.layer.feature.properties);
  맞은.reverse();                                        // 나중에 그린 것(위)이 먼저
  L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(
    (맞은.length > 1 ? `<div class="m"><b>이 자리에 ${맞은.length}개가 겹쳐 있습니다</b> — 지도 색은 맨 위(첫 번째)의 것입니다</div>` : '')
    + 맞은.map(글).join('<hr class="pophr">')).openOn(map);
}

function styleZone(f) {
  const g = f.properties.grp;
  /* ★ 분류 못 한 것은 **칠하지 않는다.** 아무 색이나 주면 그 색이 뜻을 가진 것처럼
     읽힌다. 테두리만 남겨서 '여기 뭔가 있는데 분류를 못 했다' 로 보이게 한다. */
  if (!g) return { color: css('--ink-4'), weight: 1, dashArray: '3 3', fillOpacity: 0 };
  return { color: css(Z_GRP[g]), weight: 0.8, opacity: 1,
           fillColor: css(Z_GRP[g]), fillOpacity: 1 };        // 투명도는 판(ovZone)이 한 번만 준다
}

/* 정비사업 색 (2026-10-20 다시 씀)
   ★ 전에는 한 보라 색조의 밝기 6단계로 **추진률**을 칠했다. 순서 있는 값에
     밝기를 쓰는 건 원칙상 맞지만, 지도 위 작은 폴리곤에서 6단계는 **눈이 못 가른다**
     (사용자: "색깔이 다 너무 비슷해서 햇갈려").
   ★ 데이터를 세어 보고 정했다: 추진단계(propel_nm)는 **30가지가 넘어** 색으로
     못 가른다. 사업 대분류(biz_lclas_nm)는 **딱 6가지**다. 그래서
       색조 = 무슨 사업이냐 (6색)
       테두리 = 얼마나 왔나 (점선 / 실선 / 굵은 실선)
     한 채널에 한 가지 뜻만 싣는다. 둘 다 색으로 싣던 게 문제였다. */
const RK = {
  '소규모 정비사업': '--rk-small', '정비사업': '--rk-main',
  '역세권사업': '--rk-stn', '재정비촉진사업': '--rk-prom',
  '기타사업': '--rk-etc', '국토부사업': '--rk-molit',
};
/* 추진 정도 3단: 초기(점선) / 인가 이후(실선) / 착공~준공(굵은 실선).
   ★ pct 를 모르면 **굵기를 꾸며내지 않는다** - 점선에 아주 옅게 둔다. */
function 진행모양(pct) {
  /* ★ 2026-10-22: 진하기(fillOpacity)로도 단계를 싣던 것을 뺐다 — 범례는 '추진 정도 = 테두리' 라고만 말한다(한 채널에 한 뜻).
     칠은 불투명, 투명도는 판(ovRedev)이 한 번만 준다. 단계는 테두리(점선 / 실선 / 굵은 실선)로만. */
  if (pct == null) return { weight: 1.2, dashArray: '3 3', opacity: 1, fillOpacity: 1 };
  if (pct < 40)    return { weight: 1.4, dashArray: '5 3', opacity: 1, fillOpacity: 1 };
  if (pct < 80)    return { weight: 1.8, dashArray: null,  opacity: 1, fillOpacity: 1 };
  return             { weight: 3.2, dashArray: null,  opacity: 1, fillOpacity: 1 };
}
function styleRedev(f) {
  const p = f.properties;
  /* 대분류를 모르면 **칠하지 않는다.** 아무 색이나 주면 그 색이 뜻을 가진 것처럼
     읽힌다(용도지역에서 쓰던 규칙과 같다). 테두리만 남긴다. */
  const v = RK[p.lclas];
  const 모양 = 진행모양(p.pct);
  if (!v) return { color: css('--rd-na'), weight: 1.2, dashArray: '3 3',
                   opacity: 1, fillOpacity: 0 };                // 분류 못 함 — 칠하지 않는다(불투명 칠이 밑의 것을 가린다)
  const c = css(v);
  return { color: c, fillColor: c, ...모양 };
}

/* 정비사업 구역 이름표 (2026-10-20)
   사용자: "저게 어떤 재개발 지구인지 이름같은것도 뜨면 좋겠어"

   ★ 클릭 팝업은 **원래 있었다**(구역명·사업명·추진단계·진행%·면적).
     없던 건 **상시 이름표**다. 그런데 전부 띄우면 안 된다 — 이 지도는 이미
     단지 가격 말풍선으로 빽빽하다(사용자가 보낸 화면이 그랬다). 글자가 겹치면
     이름표도 가격도 둘 다 못 읽는다. 그래서 **충분히 확대했을 때만** 띄운다.
   ★ 구역명이 없으면 사업명으로 대신하고, 둘 다 없으면 **이름표를 안 단다.**
     '(이름 없음)' 을 지도에 뿌리면 글자만 늘고 아는 건 늘지 않는다. */
const REDEV_라벨줌 = 16;

function 재개발이름표() {
  if (!redevLayer) return;
  const 켤까 = overlay === 'redev' && map.getZoom() >= REDEV_라벨줌;

  /* 먼저 달 것을 모은다. 넓은 것부터 — 지구(큰 폴리곤)가 제자리를 잡고,
     그 안의 구역이 비켜 앉게 한다. */
  const 대상 = [];
  redevLayer.eachLayer(l => {
    const p = (l.feature && l.feature.properties) || {};
    const nm = p.zone_nm || p.biz || '';
    if (!켤까 || !nm) { if (l.getTooltip()) l.unbindTooltip(); return; }
    let pt = null, 큰가 = true;
    try {
      const b = l.getBounds();
      const a2 = map.latLngToContainerPoint(b.getNorthWest());
      const c2 = map.latLngToContainerPoint(b.getSouthEast());
      큰가 = Math.abs(c2.x - a2.x) >= 70 && Math.abs(c2.y - a2.y) >= 28;
      pt = map.latLngToContainerPoint(b.getCenter());
    } catch (_) { /* 경계를 못 구하면 겹침 판단만 건너뛴다 */ }
    if (!큰가) { if (l.getTooltip()) l.unbindTooltip(); return; }
    대상.push({ l, nm, pt, area: Number(p.area) || 0 });
  });
  대상.sort((a, b) => b.area - a.area);

  /* ★ 겹치면 **숨기지 않고 비켜 쌓는다.** 세운 일대처럼 지구 안에 구역이
     겹쳐 있으면 중심이 거의 같아서 글자가 포개진다("세운4구역" 위에 "세운4").
     하나만 남기면 나머지 이름을 **잃는다** - 어느 쪽이 덜 중요한지 우리가 정할
     근거가 없다. 그래서 y 로 한 줄씩 내려 둘 다 읽히게 한다. */
  const 놓은곳 = [];
  대상.forEach(({ l, nm, pt }) => {
    let dy = 0;
    if (pt) {
      for (let i = 0; i < 40; i++) {
        const y = pt.y + dy;
        if (!놓은곳.some(q => Math.abs(q.x - pt.x) < 90 && Math.abs(q.y - y) < 15)) break;
        dy += 15;
      }
      놓은곳.push({ x: pt.x, y: pt.y + dy });
    }
    if (l.getTooltip()) l.unbindTooltip();       // 줌이 바뀌면 자리도 다시 잡는다
    l.bindTooltip(esc(nm), { permanent: true, direction: 'center',
                             className: 'redevlbl', opacity: 1, offset: [0, dy] });
  });
}

async function loadOverlay() {
  if (!overlay) { zoneLayer.clearLayers(); redevLayer.clearLayers(); return; }
  if (map.getZoom() < 13) {
    zoneLayer.clearLayers(); redevLayer.clearLayers();
    return toast('확대하면 겹쳐보기가 표시됩니다 (줌 13 이상)', 2200);
  }
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  const seq = ++ovlSeq;
  try {
    const fc = await fetch(`/api/${overlay === 'zone' ? 'zones' : 'redev'}?bbox=${bbox}`).then(r => r.json());
    if (seq !== ovlSeq) return;                 // 늦게 온 응답은 버린다
    if (fc.error) return 오류토스트('겹쳐보기', fc);
    const lyr = overlay === 'zone' ? zoneLayer : redevLayer;
    lyr.clearLayers();
    if (fc.features.length) lyr.addData(fc);
    else {
      /* ★ 2026-10-29 QA: 부산에서 '정비사업 구역이 없습니다' 라고 했다 — 정비구역은 **서울만** 받았다(없는 게 아니라 안 받음).
           받은 범위(서울 상자) 밖이면 '안 받음' 으로 말한다. 용도지역 지도도 서울 위주(+일부)라 같은 말로. */
      const c = map.getCenter(), 서울안 = c.lat > 37.42 && c.lat < 37.72 && c.lng > 126.76 && c.lng < 127.19;
      toast(overlay === 'zone'
        ? (서울안 ? '이 영역에는 적재된 용도지역이 없습니다' : '용도지역 지도는 아직 서울 위주로만 받았습니다 — 이 지역은 안 받음(없는 게 아님)')
        : (서울안 ? '이 영역에는 정비사업 구역이 없습니다' : '정비사업 구역은 아직 서울만 받았습니다 — 이 지역은 안 받음(없는 게 아님)'), 3200);
    }
    재개발이름표();
    /* 확대하면 이름이 뜬다는 걸 **한 번은** 알려 준다 — 안 그러면 기능이 있는 줄 모른다. */
    if (overlay === 'redev' && fc.features.length && map.getZoom() < REDEV_라벨줌 && !redev안내했나) {
      redev안내했나 = true;
      toast('구역을 <b>누르면</b> 이름·사업·추진단계가 나옵니다. '
          + `조금 더 확대하면(줌 ${REDEV_라벨줌}) 이름이 지도에 바로 표시됩니다.`, 7000);
    }
  } catch (e) { toast(`겹쳐보기 조회 실패: ${esc(e.message)}`, 5000); }
}
let ovlSeq = 0;
let redev안내했나 = false;

/* 범례는 **켠 레이어의 것만** 뜬다. 안 쓰는 범례가 떠 있으면 지도를 잘못 읽는다. */
function overlayLegend() {
  const el = $('#olegend');
  if (!overlay) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  if (overlay === 'zone') {
    el.innerHTML = `<div class="lt">용도지역</div>`
      + Object.entries(Z_GRP).map(([k, v]) =>
          `<div class="lrow"><span class="sw" style="background:var(${v});opacity:${OV_투명.zone}"></span>${k}지역</div>`).join('')
      + `<div class="lrow"><span class="sw dash"></span>분류 못 함</div>`
      + `<div class="lnote">겹친 곳은 위(작은 것)의 색만 보입니다 — 누르면 그 자리의 것이 전부 나옵니다</div>`;
  } else {
    el.innerHTML = `<div class="lt">사업 종류</div>`
      + Object.entries(RK).map(([k, v]) =>
          `<div class="lrow"><span class="sw rk" style="background:var(${v});opacity:${OV_투명.redev}"></span>${k}</div>`).join('')
      + `<div class="lrow"><span class="sw dash na"></span>분류 못 함</div>`
      + `<div class="lt" style="margin-top:6px">추진 정도 (테두리)</div>`
      + `<div class="lrow"><span class="sw rk st1"></span>초기 (구역지정·추진위)</div>`
      + `<div class="lrow"><span class="sw rk st2"></span>인가 이후</div>`
      + `<div class="lrow"><span class="sw rk st3"></span>착공 · 준공</div>`
      + `<div class="lnote">겹친 곳(지구 안의 구역 등)은 위(작은 것)의 색만 보입니다 — 누르면 그 자리의 것이 전부 나옵니다</div>`;
  }
}

function styleParcel(f) {
  const p = f.properties;
  if (!p.complex_id) {
    return { color: css('--none'), weight: 0.7, opacity: 0.6, fillColor: css('--none'), fillOpacity: 0.12 };
  }
  const isSel = selected && p.complex_id === selected;
  return {
    color: p.has_recap ? css('--mark') : css('--line-2'),
    weight: p.has_recap ? 1.6 : 0.8,
    fillColor: colorOf(p.dong_cnt || 1),
    fillOpacity: isSel ? 0.88 : 0.62,
  };
}

function styleBuilding(f) {
  const p = f.properties;
  const sel = selected && p.complex_id === selected;
  return {
    color: css('--bld-edge'),
    weight: sel ? 1.4 : 0.9,
    fillColor: p.complex_id ? css('--bld') : css('--bld-none'),
    fillOpacity: sel ? 0.85 : 0.6,
  };
}

async function loadBuildings(bbox) {
  if (!showBuildings) { buildingLayer.clearLayers(); return; }
  const seq = fetchSeq;
  try {
    const fc = await fetch(`/api/buildings?bbox=${bbox}`).then(r => r.json());
    if (seq !== fetchSeq) return;
    if (fc.error) return;                       // 필지 쪽에서 이미 안내함
    buildingLayer.clearLayers();
    if (fc.features.length) buildingLayer.addData(fc);
  } catch { /* 지도는 필지만으로도 동작한다 */ }
}

async function loadParcels() {
  if (map.getZoom() < 15) {
    parcelLayer.clearLayers();
    buildingLayer.clearLayers();
    toast('확대하면 필지와 건물이 표시됩니다 (줌 15 이상)', 2500);
    return;
  }
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  const seq = ++fetchSeq;
  try {
    const r = await fetch(`/api/parcels?bbox=${bbox}`);
    const fc = await r.json();
    if (seq !== fetchSeq) return;              // 늦게 도착한 응답은 버린다
    if (fc.error) return 오류토스트('필지', fc);
    parcelLayer.clearLayers();
    if (fc.features.length) parcelLayer.addData(fc);
    else toast('이 영역에는 적재된 필지가 없습니다. 청운동으로 이동해 보세요.', 3500);
    loadBuildings(bbox);
  } catch (e) {
    toast(`필지 조회 실패: ${esc(e.message)}`, 6000);
  }
}

/* ---------------- 말로 찾기 (2026-10-19) ----------------
   ★ 이름을 'AI 검색' 이라 하지 않는다. 지금은 규칙 + 법정동 사전이다.
     아닌 것을 그렇게 부르면 그것부터 거짓말이다.
   ★ 화면이 해야 할 일은 하나다 — **어떻게 알아들었는지 보여주는 것.**
     틀려도 사용자가 거기서 잡는다. */
let askMode = false;

function setMode(m) {
  제안닫기();                      /* 자동완성은 단지 검색 쪽에만 있다 */
  askMode = (m === 'ask');
  closeDetail();          /* 검색 방식을 바꾸면 보던 단지도 맥락이 끊긴다 */
  lastSearchQ = null;
  document.querySelectorAll('.segbtn').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  $('#askhint').hidden = !askMode;
  $('#q').placeholder = askMode
    ? '예) 은평구 아파트 제일 비싼 10개'
    : '단지명 · 주소 · 단지코드';
  $('#q').value = '';
  $('#clear').hidden = true;
  $('#count').textContent = '';
  /* ★ 잠근 건 /api/ask 하나뿐이다. 토글도 입력창도 예시도 **가리지 않는다**.
     다만 다 쓰고 Enter 를 눌러서야 알면 허탈하니 여기서 미리 말해 둔다. */
  $('#list').innerHTML = askMode
    ? '<li class="muted">문장으로 물어보세요. 어떻게 알아들었는지 먼저 보여드립니다.'
      + (토큰() ? '' : '<br><b>AI 검색은 로그인이 필요합니다.</b>') + '</li>'
    : '';
  if (!askMode) search();
}

/* ---- 로그인 (2026-10-19) ---------------------------------------
   ★ AI 검색만 잠근다. 단지 조회는 공개 데이터라 그대로 둔다.
     LLM 호출은 돈이 나가고 문장이 밖으로 나가므로 그 문 하나만 잠근다.
   ★ 토큰은 localStorage 에 둔다. 이 페이지는 우리 서버가 주므로
     localStorage 가 정상 동작한다. 12시간 뒤 만료되면 다시 묻는다. */
const TOK = 'tm_token';
const 토큰 = () => { try { return localStorage.getItem(TOK) || ''; } catch { return ''; } };
const 토큰저장 = v => { try { v ? localStorage.setItem(TOK, v) : localStorage.removeItem(TOK); } catch {} };
/* DB 시계는 UTC 다(SYSDATETIME = SYSUTCDATETIME 실측) — 문의·알림·질문의 때를 **한국 시각으로 보여 준다**(값은 그대로).
   전에는 글자를 잘라 보여서 18:54 에 단 답이 09:54 로 보였다. */
const 한국때 = v => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return String(v).slice(0, 16);
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 16); };
let 관심 = new Set();   // 313: 내 관심 단지 번호(로그인했을 때만 채운다)

function 로그인박스(err, 안내) {
  return `<li class="askbox login">
      <div class="at">AI 검색은 로그인이 필요합니다</div>
      ${안내 ? `<div class="lnote">${esc(안내)}</div>` : ''}
      <div class="lrow"><input id="lu" class="lin" placeholder="아이디"
             autocomplete="username" autocapitalize="off" spellcheck="false"></div>
      <div class="lrow"><input id="lp" class="lin" type="password" placeholder="비밀번호"
             autocomplete="current-password"></div>
      <div class="lrow"><button type="button" id="lgo" class="lbtn">로그인</button>
        ${err ? `<span class="lerr">${esc(err)}</span>` : ''}</div>
    </li>`;
}

function 로그인띄우기(err, 안내) {
  $('#count').textContent = '—';
  $('#list').innerHTML = 로그인박스(err, 안내);
  const u = $('#lu');
  if (u) u.focus();
}

async function 로그인하기() {
  const username = ($('#lu') || {}).value || '';
  const password = ($('#lp') || {}).value || '';
  if (!username || !password) return 로그인띄우기('아이디와 비밀번호를 모두 넣어주세요');
  const btn = $('#lgo');
  if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }) });
    const d = await r.json();
    if (!r.ok) return 로그인띄우기(d.error || '로그인하지 못했습니다');
    토큰저장(d.token);
    배지새로();
    ask();                         /* 원래 하려던 질문을 이어서 한다 */
  } catch (e) {
    로그인띄우기('서버에 연결하지 못했습니다 — ' + e.message);
  }
}

async function ask() {
  const q = $('#q').value.trim();
  if (!q) return;
  closeDetail();          /* 새 질문이면 이전 단지 상세는 맥락이 끊겼다 */
  $('#list').innerHTML = '<li class="muted">찾는 중…</li>';
  try {
    const t = 토큰();
    const r = await fetch('/api/ask?q=' + encodeURIComponent(q),
                          { headers: t ? { Authorization: 'Bearer ' + t } : {} });
    /* ★ 401 은 '틀렸다' 가 아니라 '아직 안 들어왔다' 다. 질문은 입력창에
       그대로 두고 로그인만 받은 뒤 **그 질문을 이어서** 한다. */
    if (r.status === 401) {
      토큰저장('');
      return 로그인띄우기('', t ? '로그인이 만료됐습니다. 다시 들어와 주세요.' : '');
    }
    const d = await r.json();
    if (d.error) {
      /* 400(질문을 못 알아들음 등)은 서버가 사람 말로 준다 - 그 자리에 적는다 */
      if (d._상태 && d._상태 < 500) { $('#list').innerHTML = `<li class="muted">${esc(d.hint || d.error)}</li>`; return; }
      $('#list').innerHTML = `<li class="muted">AI 검색을 하지 못했습니다.</li>`;
      오류카드({ 무엇: 'AI 검색', 응답: d, 다시: () => ask() });
      return;
    }
    if (d.되묻기 && d.되묻기.length) return 되묻기그리기(d);
    renderAsk(d);
  } catch (e) {
    $('#list').innerHTML = `<li class="muted">AI 검색을 하지 못했습니다.</li>`;
    오류카드({ 무엇: 'AI 검색', 예외: e, 다시: () => ask() });
  }
}

/* 2026-10-28 사장님 "애매한 경우엔 다시 질문" — '광주' 처럼 여러 곳에 맞는 말이면 고르지 않고 후보를 보인다. 누르면 그 말을 바꿔 다시 묻는다 */
function 되묻기그리기(d) {
  $('#count').textContent = '';
  const 원문 = String(d.원문 || $('#q').value);
  $('#list').innerHTML = d.되묻기.map((x, i) => `
    <li class="askbox">
      <div class="at">'${esc(x.보임 || x.말)}' — 어느 곳을 말씀하신 건가요?</div>
      <div class="askpick">${x.후보.map((h, j) => `<button type="button" class="ec-b" data-pick="${i}|${j}">${esc(h.이름)}</button>`).join(' ')}</div>
    </li>`).join('');
  $('#list').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    const [i, j] = b.dataset.pick.split('|').map(Number), x = d.되묻기[i], h = x.후보[j];
    $('#q').value = 원문.replace(x.말, h.질의);
    ask();
  }));
}

/* 지역 순위 (2026-10-22) — 숫자는 서버(DB)가 센 그대로. 기준·기간·뺀 곳을 같이 적는다(작업방식 10장: 자르면 말한다). */
function renderAskRegion(d) {
  const h = d.해석 || {}, R = d.지역순위 || {};
  const 만 = v => Math.round(Number(v) / 1e4).toLocaleString();
  const 날 = v => 날짜(v, '');
  const 줄 = (k, v, note) => !v ? '' : `<div class="arow"><span class="ak">${esc(k)}</span><b>${esc(v)}</b>${note ? `<i>${esc(note)}</i>` : ''}</div>`;
  $('#count').textContent = `${fmt((R.목록 || []).length)}곳`;
  const 목 = R.목록 || [];
  $('#list').innerHTML = `
    <li class="askbox">
      <div class="at">이렇게 알아들었습니다 — <b>지역 순위</b></div>
      ${줄('범위', (h.지역 || []).join(' · '))}
      ${줄('단위', h.단위 === '동' ? '법정동' : '시군구', h.단위 === '동' ? "'구별' 이라고 하면 구 단위로 셉니다" : "'동네·동별' 이라고 하면 동 단위로 셉니다")}
      ${줄('기준', h.기준, '총액이 아니라 평당가로 견줍니다 — 지역마다 집 크기가 다릅니다')}
      ${줄('기간', R.기간 ? `${날(R.기간.부터)} ~ ${날(R.기간.까지)} (계약일)` : '', '이번 달·지난달은 신고가 덜 끝나 뺐습니다')}
      ${줄('정렬', h.방향)}
      ${h.종목바꿈 ? `<div class="arow"><span class="ak">종목</span><b>아파트</b><i>${esc(h.종목바꿈)}</i></div>` : ''}
      ${(h.조건안씀 || []).length ? `<div class="arow bad"><span class="ak">안 썼습니다</span><b>${h.조건안씀.map(esc).join(' · ')}</b><i>지역 순위에는 단지 조건을 걸지 않습니다</i></div>` : ''}
      ${(h.못알아들은말 || []).length ? `<div class="arow bad"><span class="ak">못 알아들음</span><b>${h.못알아들은말.map(esc).join(' · ')}</b><i>이 말은 <b>걸러지지 않았습니다</b></i></div>` : ''}
    </li>
    ${(R.덜받음 || []).length ? `<li class="asknote scope"><span class="gap">SCOPE</span>순위에서 뺀 곳 — 이 기간의 아파트 실거래를 <b>다 받지 않았습니다</b>:
       ${R.덜받음.map(x => `${esc(x.이름)}(${fmt(x.달수)}/12달)`).join(' · ')}. 없는 게 아니라 안 받은 것입니다.</li>` : ''}
    ${R.표본적음수 ? `<li class="asknote"><span class="gap">NA</span>거래가 20건 안 되는 ${fmt(R.표본적음수)}곳은 중위값이 흔들려 뺐습니다${
       (R.표본적음 || []).length ? ` — ${R.표본적음.slice(0, 8).map(x => `${esc(x.이름)} ${fmt(x.거래)}건`).join(' · ')}${R.표본적음수 > 8 ? ' …' : ''}` : ''}.</li>` : ''}
    ${목.length ? 목.map(x => `
      <li><button class="row ask" ${h.단위 === '동' ? `data-rk-lawd="${esc(x.코드)}"` : `data-rk-sgg="${esc(x.이름)}"`}
           title="${h.단위 === '동' ? '누르면 지도에서 이 동' : '누르면 이 구의 동네 순위'}">
        <span class="n"><span class="rk">${x.순위}</span>${esc(x.이름)}</span>
        <span class="d"><b>${만(x.중위평당)}만/평</b><br>${fmt(x.거래)}건</span>
      </button></li>`).join('')
      : `<li class="muted">순위를 낼 수 있는 곳이 없습니다.</li>`}
    ${목.length && R.전체 > 목.length ? `<li class="muted">${fmt(R.전체)}곳 중 ${fmt(목.length)}곳 — '30개' 처럼 개수를 말하면 더 보입니다.</li>` : ''}
    <li class="muted sm">평당가 = 거래가 ÷ 전용면적 × 3.3058 · 지역마다 그 기간 거래의 <b>중위값</b>(가운데 값)입니다 — 평균은 초고가 몇 건에 끌려갑니다.</li>`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-rk-lawd]');
  if (a) { selectLawd(a.dataset.rkLawd); return; }
  const g = e.target.closest('[data-rk-sgg]');
  if (g) { $('#q').value = `${g.dataset.rkSgg.replace(/^\S+\s/, '')} 제일 비싼 동네`; ask(); }
});

/* 312: 쓴 조건의 사실을 줄마다 — 조건을 걸었으면 왜 걸렸는지 보여야 한다 */
function 조건사실(c, 켬, 정렬) {
  const m = v => `${Math.round(Number(v)).toLocaleString()}m`;
  const 줄 = [];
  if (c.면적최소 != null) 줄.push(`전용 ${Number(c.면적최소)}${Number(c.면적최대) !== Number(c.면적최소) ? '~' + Number(c.면적최대) : ''}㎡ · ${fmt(c.면적호수)}호`);
  if (c.역거리 != null) 줄.push(`${c.역이름 || ''}역(${c.역노선 || ''}) ${m(c.역거리)}`);
  if (c.학교거리 != null) 줄.push(`${c.학교이름 || ''} ${m(c.학교거리)}`);
  if (c.정비이름) 줄.push(`${c.정비이름} · ${c.정비종류 || ''}${c.정비포함률 != null ? ` · 필지 ${c.정비포함률}% 걸침` : ''}`);
  if (c.용도지역) 줄.push(`${c.용도지역}${c.용도비중 != null ? ` ${c.용도비중}%` : ''}`);
  /* 2026-10-23 사장님 "왜 나왔는지" — **줄 세운 값**도 늘 보인다(신축 순이면 사용승인일 · 세대 순이면 세대 · 거래 많은 순이면 거래 수) */
  const 순 = String(정렬 || '');
  if (/사용승인/.test(순) && c.oldest_use_apr) 줄.push(`사용승인 ${String(c.oldest_use_apr).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1.$2.$3')}`);
  else if (켬 && c.oldest_use_apr) 줄.push(`사용승인 ${String(c.oldest_use_apr).slice(0, 4)}`);
  if ((켬 || /세대/.test(순)) && c.hhld_cnt_sum) 줄.push(`${fmt(c.hhld_cnt_sum)}세대`);
  if (/거래 많은/.test(순) && c.trade_cnt != null) 줄.push(`매매 ${fmt(c.trade_cnt)}건`);
  return 줄.length ? `<span class="s cx">${esc(줄.join(' · '))}</span>` : '';
}

function renderAsk(d) {
  if (d.종류 === '지역순위') return renderAskRegion(d);
  const h = d.해석 || {};
  const ai = d.ai || {};
  const 억 = v => v == null ? '—' : (Number(v) / 1e8).toFixed(1) + '억';
  const 평당 = v => v == null ? '' : Math.round(Number(v) / 1e4).toLocaleString() + '만/평';
  const KINDNM = { APT_TRADE_DEV: '아파트', APT_TRADE: '아파트', RH_TRADE: '연립·다세대',
    OFFI_TRADE: '오피스텔', SH_TRADE: '단독·다가구', LAND_TRADE: '토지',
    NRG_TRADE: '상업·업무용' };

  const 줄 = (k, v, note) => !v ? '' :
    `<div class="arow"><span class="ak">${esc(k)}</span><b>${esc(v)}</b>${
      note ? `<i>${esc(note)}</i>` : ''}</div>`;

  $('#count').textContent = ai.무관함 ? '—' : `${fmt(d.count)}곳`;
  /* 무관하면 '이렇게 알아들었습니다' 는 띄우지 않는다 - 알아들은 게 없다 */
  $('#list').innerHTML = (ai.무관함 ? '' : `
    <li class="askbox">
      <div class="at">이렇게 알아들었습니다</div>
      ${줄('지역', h.지역 && h.지역.length ? h.지역.join(' · ') : '전체',
            h.지역수 > 1 ? `${h.지역수}곳으로 봤습니다` : '')}
      ${줄('단지 이름', h.단지이름, '이름이 들어간 단지만 찾았습니다')}
      ${줄('종목', h.종목 || '가리지 않음',
            h.종목 ? '' : '상가·토지도 섞입니다 — 종목을 함께 보여드립니다')}
      ${줄('정렬', h.정렬, h.정렬추정 ? '말에 없어서 기본값으로 했습니다' : '')}
      ${(h.필터 || []).map(f => 줄('조건', f)).join('')}
      ${(h.조건 || []).map(f => 줄('조건', f)).join('')}
      ${(h.모름 || []).length ? `
        <div class="arow bad"><span class="ak">모름</span>
          <b>${h.모름.map(x => `${esc(x.이름)} ${fmt(x.n)}곳`).join(' · ')}</b>
          <i>값이 없어 조건을 따질 수 없는 단지 — 맞는 척 넣지 않고 뺐습니다</i></div>` : ''}
      ${h.굳힌때 ? 줄('기준', new Date(h.굳힌때).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }),
                    '면적·역·학교·정비·용도 요약을 센 때') : ''}
      ${줄('개수', `${h.개수}곳`)}
      ${(ai.보탠것 || []).length ? `
        <div class="arow ai"><span class="ak">AI 가 보탬</span>
          <b>${ai.보탠것.map(esc).join(' · ')}</b>
          <i>규칙이 못 잡아서 물어봤습니다</i></div>` : ''}
      ${ai.키없음 ? `
        <div class="arow bad"><span class="ak">AI</span><b>키가 없습니다</b>
          <i>.env 의 ANTHROPIC_API_KEY — 규칙만으로 보여드립니다</i></div>` : ''}
      ${ai.실패 ? `
        <div class="arow bad"><span class="ak">AI</span><b>응답을 못 받았습니다</b>
          <i>규칙만으로 보여드립니다</i></div>` : ''}
      ${ai.썼음 && !(ai.보탠것 || []).length ? `
        <div class="arow"><span class="ak">AI</span><b>보탤 게 없었습니다</b>
          <i>물어봤지만 규칙 해석이 더 정확했습니다</i></div>` : ''}
      ${(h.안쓴조건 || []).length ? `
        <div class="arow"><span class="ak">안 썼습니다</span>
          <b>${h.안쓴조건.map(esc).join(' · ')}</b>
          <i>정렬은 하나만 씁니다 — 알아는 들었습니다</i></div>` : ''}
      ${(h.못알아들은말 || []).length ? `
        <div class="arow bad"><span class="ak">못 알아들음</span>
          <b>${h.못알아들은말.map(esc).join(' · ')}</b>
          <i>이 말은 <b>걸러지지 않았습니다</b></i></div>` : ''}
    </li>`) + `
    ${(d.알림 || []).map(a => `<li class="asknote ${
       a.종류 === 'SCOPE' ? 'scope' : (a.종류 === '무관' || a.종류 === 'HINT' ? 'off' : '')}">
       <span class="gap">${esc(a.종류 === 'HINT' ? '안내' : a.종류)}</span>${esc(a.말).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}
    ${d.items.map((c, i) => `
      <li><button class="row ask" data-id="${c.complex_id}">
        <span class="n"><span class="rk">${i + 1}</span>${esc(c.complex_nm || '(이름 없음)')}
          ${c.trade_kind ? `<span class="kd">${esc(KINDNM[c.trade_kind] || c.trade_kind)}</span>` : ''}
          <span class="s">${esc(c.rep_plat_plc || '')}</span>${조건사실(c, (h.조건 || []).length > 0, h.정렬)}</span>
        <span class="d"><b>${억(c.max_amount)}</b><br>${
          c.unit_won ? 평당(c.unit_won) : `${fmt(c.hhld_cnt_sum)}세대`}</span>
      </button></li>`).join('')}`;
}

/* ---------------- 검색 ---------------- */
let lastSearchQ = null;
async function search() {
  /* ★ 검색을 새로 하면 내 위치 모드를 끈다 (2026-10-20). 안 끄면 버튼은
     눌린 채로 남고 '최근 본 것' 은 계속 숨겨진 상태가 된다 — 화면이 둘 중
     어느 모드인지 말을 안 하게 된다. 점도 같이 지운다. */
  if (myPos) 내위치지우기();
  const q = $('#q').value.trim();
  const recap = $('#recap').checked ? '1' : '0';
  $('#clear').hidden = !q;
  /* ★ 검색어가 **바뀐 때만** 닫는다. search() 는 '총괄표제부만' 체크박스
     토글로도 불린다 - 그때까지 닫으면 보던 단지가 사라져 짜증난다. */
  if (q !== lastSearchQ) { closeDetail(); lastSearchQ = q; }
  try {
    const r = await fetch(`/api/complexes?q=${encodeURIComponent(q)}&recap=${recap}&limit=200`);
    const d = await r.json();
    if (d.error) {
      $('#list').innerHTML = `<li class="muted">검색하지 못했습니다.</li>`;
      오류카드({ 무엇: '검색', 응답: d, 다시: () => search() });
      return;
    }
    items = d.items;
    lawdItems = d.lawds || [];
    newbuildItems = d.newbuilds || [];
    redevItems = d.redevs || [];
    ahItems = d.applyhomes || [];
    try { const hp = q ? await fetch('/api/houseplans/search?q=' + encodeURIComponent(q)).then(r => r.json()) : null; hpItems = (hp && hp.items) || []; }
    catch (e) { hpItems = []; }
    try { const pb = q ? await fetch('/api/prebuilds/search?q=' + encodeURIComponent(q)).then(r => r.json()) : null; pbItems = (pb && pb.items) || []; }
    catch (e) { pbItems = []; }
    바뀜정보 = d.바뀜 || null;      // 308: 옛 행정동 이름으로 찾았을 때 — 지금 동 안내
    꼬리뗌정보 = d.꼬리뗌 || null;  // '드림아트빌라' → '드림아트빌' 로 찾았을 때
    /* ★ 상한에 걸렸으면 숫자 옆에 적는다 — '200개 단지' 가 '전부 200개' 로
       읽히면 안 된다. 진짜 페이징(OFFSET)은 아직 없다. */
    $('#count').textContent = `${fmt(d.count)}개 단지${d.잘림 ? '+' : ''}`
      + (d.잘림 ? ` (상한 ${fmt(d.상한)} — 더 있습니다)` : '')
      + (lawdItems.length ? ` · 법정동 ${fmt(lawdItems.length)}` : '')
      + (newbuildItems.length ? ` · 신축 ${fmt(newbuildItems.length)}` : '')
      + (ahItems.length ? ` · 청약 공고 ${fmt(ahItems.length)}` : '')
      + (hpItems.length ? ` · 사업승인 ${fmt(hpItems.length)}` : '')
      + (pbItems.length ? ` · 공사 중 ${fmt(pbItems.length)}` : '');
    renderList();
  } catch (e) {
    $('#list').innerHTML = `<li class="muted">검색하지 못했습니다.</li>`;
    오류카드({ 무엇: '검색', 예외: e, 다시: () => search() });
  }
}

function renderList() {
  const ul = $('#list');
  /* ★ 내 위치 모드에서는 '최근 본 것' 을 깔지 않는다 (2026-10-20).
     깔아 두면 거리순 1등이 최근 목록 **아래**로 밀려서, 가장 가까운 건물이
     화면 밖에 있다. 거리순이라는 약속이 깨진다. */
  const rec = myPos ? '' : recentRows();
  if (!items.length && !lawdItems.length && !newbuildItems.length && !redevItems.length && !ahItems.length && !hpItems.length && !pbItems.length) {
    ul.innerHTML = rec || `<li class="muted">결과가 없습니다. <span class="sm">(${esc(범위말로())}만 다룹니다)</span></li>`; return;
  }
  /* 법정동을 단지보다 위에 둔다. 동을 치는 사람은 그 동으로 이동하려는 것이다. */
  const lawdRows = lawdItems.map(l => `
    <li><button class="row lawd" data-lawd="${l.lawd_cd}" aria-current="${l.lawd_cd === selectedLawd}">
      <span class="sw dong"></span>
      <span class="mid">
        <span class="nm">${esc(l.emd_nm || l.lawd_cd)}</span>
        <span class="ad">${esc(l.full_nm || '')}</span>
      </span>
      <span class="d">${fmt(l.complex_cnt || 0)}단지<br>${fmt(l.trade_cnt || 0)}거래</span>
    </button></li>`).join('');
  /* 신축은 단지 바로 위에 둔다. 단지가 아니지만 사용자가 찾는 것은 같다. */
  const nbRows = newbuildItems.map(n => `
    <li><button class="row nb" data-kapt="${esc(n.kapt_code)}" aria-current="${n.kapt_code === selectedKapt}">
      <span class="sw nb"></span>
      <span class="mid">
        <span class="nm">${esc(n.kapt_name)} <span class="tag">대장없음</span></span>
        <span class="ad">${esc(n.lawd_nm || '')} · 사용승인 ${esc(n.사용승인 || '—')}</span>
      </span>
      <span class="d">${fmt(n.세대)}세대<br>${fmt(n.거래)}거래</span>
    </button></li>`).join('');

  /* 정비사업 구역(2026-10-22) — 법정동 다음, 신축 앞. 구역을 치는 사람은 그 구역을 보려는 것이다 */
  const rzRows = redevItems.map(z => `
    <li><button class="row rz" data-redevzone="${esc(z.present_sn)}" aria-current="${z.present_sn === selectedRedev}">
      <span class="sw rz"></span>
      <span class="mid">
        <span class="nm">${esc(z.zone_nm || z.biz_nm || '')} <span class="tag">정비구역</span></span>
        <span class="ad">${esc([z.biz_nm, z.propel_nm, z.propel_pct != null ? '진행 ' + z.propel_pct + '%' : null].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="d">${z.area_m2 ? fmt(Math.round(z.area_m2)) + '㎡' : ''}</span>
    </button></li>`).join('');
  /* 2026-10-23 사장님 "청약 공고 Enter 목록에도" — 단지에 아직 안 이어진 공고만(이어진 것은 단지 줄로 나온다). 누르면 공고 상세 */
  const ahRows = ahItems.map(a => `
    <li><button class="row ah" data-ah="${esc(a.house_manage_no)}" data-lat="${a.lat == null ? '' : a.lat}" data-lng="${a.lng == null ? '' : a.lng}">
      <span class="sw nb"></span>
      <span class="mid">
        <span class="nm">${esc(a.house_nm || '')} <span class="tag">청약 공고</span></span>
        <span class="ad">${esc([(typeof 공고종류말 !== 'undefined' && 공고종류말[a.공고종류] === 'APT' ? '아파트 분양' : (공고종류말[a.공고종류] || a.공고종류)), a.rcrit_pblanc_de ? String(a.rcrit_pblanc_de).trim() + ' 공고' : null, a.lat == null ? '자리 모름' : null].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="d">${a.tot_suply ? fmt(a.tot_suply) + '세대' : ''}</span>
    </button></li>`).join('');
  /* 308: 옛 행정동 이름으로 찾았으면 맨 위에 '지금은 ○○' 안내 — 아래 법정동·단지는 그 지금 동의 법정동(코드) 결과다 */
  const 바뀜줄 = (myPos || !바뀜정보) ? '' : 바뀜정보.map(b => `
    <li class="moved"><div class="movednote"><b>${esc(b.옛)}</b>은(는) 지금 없는 행정동입니다 —
      ${esc(b.시군구)} <b>${b.지금.map(esc).join(' · ')}</b>(으)로 바뀌었습니다 <span class="muted">(${esc(b.전)}~${esc(b.후)} 사이)</span>.
      <div class="muted sm">아래는 그 동이 걸친 법정동 <b>${b.법정동.map(x => esc(x.nm)).join(' · ')}</b> 기준 결과입니다 — 행정동 경계와 법정동 경계가 달라 경계 밖 단지가 섞일 수 있습니다.
      출처: 국가데이터처 법정동 연계정보(분기별).${b.잘림 ? ' 목록 상한에 걸려 일부만 보입니다.' : ''}</div></div></li>`).join('');
  const 뗌줄 = (myPos || !꼬리뗌정보) ? '' : `<li class="moved"><div class="movednote">'${esc(꼬리뗌정보.원래)}' 그대로인 이름은 없어
      <b>'${esc(꼬리뗌정보.찾은말)}'</b> 로 찾았습니다 <span class="muted">— 끝의 건물 종류 말만 뗐습니다</span></div></li>`;
  ul.innerHTML = 뗌줄 + 바뀜줄 + rec + lawdRows + rzRows + nbRows + items.map(c => `
    <li><button class="row" data-id="${c.complex_id}" aria-current="${c.complex_id === selected}">
      <span class="sw" style="background:${colorOf(c.dong_cnt)}${c.has_recap ? ';outline:1.5px solid var(--mark);outline-offset:-1.5px' : ''}"></span>
      <span class="mid">
        <span class="nm">${주소이름인가(c) && c.실거래이름
            ? esc(c.실거래이름)
            : esc(shortNm(c.complex_nm) || '(이름 없음)') + (c.실거래이름 ? ` <span class="muted">· ${esc(c.실거래이름)}</span>` : '')}</span>
        <span class="ad">${esc(c.rep_plat_plc || '')}</span>
      </span>
      <span class="d">${c.거리m != null
          ? (c.거리m < 1000 ? c.거리m + 'm' : (c.거리m / 1000).toFixed(1) + 'km')
            + '<br>' + c.dong_cnt + '동'
          : c.dong_cnt + '동<br>' + c.pnu_cnt + '필'}</span>
    </button></li>`).join('') + ahRows + hpItems.map((h, i) => `
    <li><button class="row hp" data-hpi="${i}">
      <span class="sw nb"></span>
      <span class="mid">
        <span class="nm">${esc(h.이름 || '이름 없음')} <span class="tag">사업승인 · 사용검사 전</span></span>
        <span class="ad">${esc([h.대지위치, h.승인일 ? '승인 ' + 날8(h.승인일) : null, h.사용검사예정일 ? '사용검사 ' + 날8(h.사용검사예정일) + ' 예정' : null].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="d">${fmt(h.세대)}세대</span>
    </button></li>`).join('') + pbItems.map((h, i) => `
    <li><button class="row hp" data-pbi="${i}">
      <span class="sw nb"></span>
      <span class="mid">
        <span class="nm">${esc(h.이름 || '이름 없음')} <span class="tag">공사 중 · 사용승인 전</span></span>
        <span class="ad">${esc([h.대지위치, h.용도, h.착공일 ? '착공 ' + 날8(h.착공일) : null].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="d">${esc(세대호말(h))}</span>
    </button></li>`).join('');   // 청약 공고는 단지 뒤(이어진 공고는 위 단지 줄로 이미 나온다) · 10-30 사업승인 아파트는 맨 뒤
}

/* ---------------- 주변 점 찍기 (2026-10-20) ----------------
   사용자: "주변에 나오는 지하철,버스,학교,상권에 마우스를 올리면 그 좌표에
            점이 나오고, 그 상권의 이름도 나왔으면"

   ★ 숫자가 어긋나면 안 된다. 서버가 **개수를 세는 뷰와 똑같은 뷰·조건**으로
     점을 준다(222/223). '편의점 51' 이라 적힌 줄에 올리면 **정확히 51개**가 찍힌다.
   ★ 이름을 전부 띄우면 아무것도 안 읽힌다(음식점 53개). **가까운 8개만** 이름,
     나머지는 점만. 숫자는 이미 목록에 적혀 있으니 지도는 '어디에' 만 말하면 된다.
   ★ 한 번 받은 것은 **단지가 바뀔 때까지 기억**한다. 같은 줄에 몇 번을 올려도
     서버를 다시 부르지 않는다.
   ★ 들어오자마자 부르지 않는다 — 목록 위를 스쳐 지나갈 때마다 요청이 날아간다.
     120ms 머물면 그때 부른다. */
const PT_이름수 = 8;
const PT_머무름 = 120;
let ptLayer = null, ptCache = new Map(), ptCacheId = null, ptTimer = null, ptSeq = 0;

function 주변점지우기() {
  if (ptLayer) ptLayer.clearLayers();
}

function 주변점그리기(점들, 강조m, 층) {
  if (!map.getPane('poipt')) {
    /* 마커(600) 위, 내 위치(650) 아래. 내 위치가 가장 위여야 한다 —
       그게 '나' 이고 나머지는 '주변' 이다. */
    map.createPane('poipt');
    map.getPane('poipt').style.zIndex = 640;
    map.getPane('poipt').style.pointerEvents = 'none';
  }
  if (!ptLayer) ptLayer = L.layerGroup().addTo(map);
  /* ★ 20:00: 층을 주면(눌러서 고정) 그 층에 **더한다** — 지우지 않는다. 안 주면 지나가며 보는 임시 층 */
  const 판 = 층 || ptLayer;
  if (!층) ptLayer.clearLayers();
  if (!점들 || !점들.length) return;

  점들.forEach((p, i) => {
    if (p.lat == null || p.lng == null) return;      // 좌표 없는 것은 건너뛴다
    /* ★ 목록의 숫자가 센 범위 **밖**은 흐리게 (2026-10-20).
       '편의점 3' 이라 적힌 줄에 51개가 똑같이 진하게 찍히면 "3개라더니?" 가 된다.
       숫자는 500m 기준인데 뷰는 1km 를 담고 있어서다. 둘 다 보여주되
       **어느 것이 그 숫자인지**를 눈으로 가른다(화면의 '흐린 칩=500m 밖' 규칙과 같다). */
    const 밖 = 강조m != null && p.m != null && p.m > 강조m;
    const 이름 = i < PT_이름수 && !밖;
    const mk = L.marker([p.lat, p.lng], {
      pane: 'poipt', interactive: false, zIndexOffset: 밖 ? 100 - i : 400 - i,
      icon: L.divIcon({ className: 'ptwrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ptdot${밖 ? ' far' : ''}"></div>` + (이름
          ? `<div class="ptlbl">${esc(p.이름 || '')}${
               p.m != null ? ` <i>${fmt(p.m)}m</i>` : ''}</div>` : '') }),
    });
    mk.addTo(판);
  });

  /* 점들이 화면 밖이면 보여줄 의미가 없다. **넓히지는 않고** 알려만 준다 —
     지도를 멋대로 옮기면 사용자가 보던 자리를 잃는다. */
  const 보임 = 점들.some(p => p.lat != null && map.getBounds().contains([p.lat, p.lng]));
  if (!보임) toast('표시한 곳이 지금 화면 밖입니다 — 지도를 줄여 보세요.', 2200);
}

/* ★ 19:55 사장님: 노선 칩 — 노선 전체를 **정류장 순서대로 선**으로, 단지 근처 정류장은 **이름만**,
   가장 가까운 한 곳만 '여기서 타기 · 147m'. 전엔 근처 정류장마다 'OO앞 163m' 이 붙어
   'OO 앞 163m 지점' 처럼 읽혔다. 지도는 옮기지 않는다(보던 자리를 잃지 않게). */
function 노선그리기(노선, 근처, 층) {
  주변점그리기([], null, 층);                           // 판 만들기 (+ 임시면 비우기)
  const 판 = 층 || ptLayer;
  const 색 = css('--s5');
  const 근처키 = new Set((근처 || []).map(p => p.이름));
  const 가장 = (근처 || []).filter(p => p.lat != null).sort((a, b) => a.m - b.m)[0];
  노선.forEach(g => {
    const 줄 = g.정류장.filter(p => p.lat != null).map(p => [p.lat, p.lng]);
    if (줄.length > 1) L.polyline(줄, { pane: 'poipt', color: 색, weight: 3, opacity: .75, interactive: false }).addTo(판);
    g.정류장.forEach(p => {
      if (p.lat == null) return;
      L.circleMarker([p.lat, p.lng], { pane: 'poipt', radius: 3, weight: 1.5, color: 색,
        fillColor: css('--surface'), fillOpacity: 1, interactive: false }).addTo(판);
    });
  });
  /* 이름표: 근처 정류장은 이름만(같은 이름 양방향은 한 번) · 가장 가까운 곳만 거리 */
  const 붙인 = new Set();
  (근처 || []).forEach(p => {
    if (p.lat == null || 붙인.has(p.이름)) return;
    붙인.add(p.이름);
    const 이곳 = 가장 && p.이름 === 가장.이름;
    L.marker([p.lat, p.lng], { pane: 'poipt', interactive: false, zIndexOffset: 이곳 ? 500 : 300,
      icon: L.divIcon({ className: 'ptwrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ptdot"></div><div class="ptlbl${이곳 ? ' here' : ''}">${esc(p.이름 || '')}${
          이곳 ? ` <i>여기서 타기 · ${fmt(가장.m)}m</i>` : ''}</div>` }) }).addTo(판);
  });
  if (!근처키.size) toast('이 노선은 단지 근처에 서는 정류장이 없습니다', 2200);
}

/* 받기만 — 지나가며 보기(임시)와 눌러서 고정이 같은 길을 쓴다 */
async function 주변점받기(kind, key, 단지) {
  const 키 = kind + '|' + key;
  if (ptCacheId !== 단지) { ptCache.clear(); ptCacheId = 단지; }
  if (ptCache.has(키)) return ptCache.get(키);
  const r = await fetch(`/api/complexes/${단지}/points?kind=${encodeURIComponent(kind)}`
                      + `&key=${encodeURIComponent(key)}`).then(r => r.json());
  if (r.error) return r;
  const v = { 점: r.점 || [], 노선: r.노선 || null, 잘림: r.잘림, 상한: r.상한 };
  ptCache.set(키, v);
  return v;
}
function 주변점그려넣기(kind, v, 강조m, 층, n) {
  if (kind === 'busroute' && v.노선) 노선그리기(v.노선, v.점, 층);
  else 주변점그리기(n ? [...v.점].sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9)).slice(0, n) : v.점, 강조m, 층);
}
async function 주변점띄우기(kind, key, 단지, 강조m, n) {
  const 내차례 = ++ptSeq;
  try {
    const v = await 주변점받기(kind, key, 단지);
    if (내차례 !== ptSeq) return;                 // 늦게 온 응답은 버린다
    if (v.error) { 오류토스트('주변 위치', v); return; }
    주변점그려넣기(kind, v, 강조m, null, n);
    if (v.잘림) toast(`${fmt(v.상한)}개까지만 찍었습니다 — 더 있습니다.`, 3000);
  } catch (e) { 오류토스트('주변 위치', null, e); }
}

/* ★ 20:00 사장님: "드래그(지나가기)가 아니라 **클릭하면 좌표가 계속 남아 있게**, 새로고침하면 사라지게".
   눌러 고정한 것은 따로 층에 둔다 — 다른 단지로 옮겨도 남는다(새로고침 전까지).
   같은 줄을 다시 누르면 푼다. 기억은 이 화면(메모리)에만 — 저장하지 않는다. */
const 고정 = new Map();      // '단지|kind|key' → layerGroup
function 고정키(단지, pt) { return `${단지}|${pt}`; }
function 고정표시() {
  document.querySelectorAll('#detail [data-pt]').forEach(el =>
    el.classList.toggle('pinned', 고정.has(고정키(selected, el.dataset.pt))));
}
async function 고정토글(el) {
  const pt = el.dataset.pt || '';
  const 키 = 고정키(selected, pt);
  if (고정.has(키)) {
    map.removeLayer(고정.get(키)); 고정.delete(키); 고정표시();
    return toast('고정을 풀었습니다', 1500);
  }
  const [kind, key] = pt.split('|');
  const 강조m = el.dataset.ptR ? Number(el.dataset.ptR) : null;
  try {
    const v = await 주변점받기(kind, key || '', selected);
    if (v.error) return 오류토스트('주변 위치', v);
    const 층 = L.layerGroup().addTo(map);
    주변점그려넣기(kind, v, 강조m, 층, el.dataset.ptN ? Number(el.dataset.ptN) : null);
    고정.set(키, 층); 고정표시();
    toast(`지도에 고정했습니다 — 한 번 더 누르면 풉니다 (고정 ${고정.size}개 · 새로고침하면 사라집니다)`, 2500);
  } catch (e) { 오류토스트('주변 위치', null, e); }
}

/* 상세 안에서 위임으로 받는다. 상세는 다시 그려질 때마다 DOM 이 바뀌므로
   줄마다 핸들러를 다는 대신 **한 번만** 건다. */
function 주변점묶기() {
  const d = $('#detail');
  if (!d || d.dataset.ptBound) return;
  d.dataset.ptBound = '1';
  d.addEventListener('click', e => {
    if (e.target.closest('[data-school], [data-kinder], [data-ccone], [data-poilist]')) return;          // 2026-10-24 '자세히' 는 모달 — 점 고정과 따로
    const el = e.target.closest('[data-pt]');
    if (!el || !selected) return;
    고정토글(el);
  });
  d.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-pt]');
    if (!el || !selected) return;
    clearTimeout(ptTimer);
    const [kind, key] = (el.dataset.pt || '').split('|');
    const 강조m = el.dataset.ptR ? Number(el.dataset.ptR) : null;
    const n = el.dataset.ptN ? Number(el.dataset.ptN) : null;
    ptTimer = setTimeout(() => 주변점띄우기(kind, key || '', selected, 강조m, n), PT_머무름);
  });
  d.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-pt]');
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;  // 안쪽으로 이동
    clearTimeout(ptTimer);
    ptSeq++;                      // 날아오는 중인 응답을 무효로
    주변점지우기();
  });
}

/* ---------------- 내 위치 (2026-10-20) ----------------
   사용자: "내위치 찾기해서 내위치 근처 단지들 나오게 하기 /
            단지코드라는게 정의되어있으면 그냥 단지라고봐 /
            그냥 내위치주변의 건물들을 보여주면되"
   -> 그래서 **거르지 않는다.** 학교·동사무소·공중화장실도 complex_id 가
      있으면 그대로 나온다.

   ★ 지도 마커는 건드리지 않는다. setView 가 refreshMap -> loadMarkers 를
     부르므로 주변 마커는 **저절로** 그려진다. 여기서 더하는 것은 두 가지뿐이다:
     내 점(정확도 원 포함)과 **거리순 목록**.

   ★ 위치가 틀릴 수 있다는 사실을 숨기지 않는다. 정확도(accuracy)가 크면
     그 숫자를 그대로 말한다 - "근처에 N개" 가 엉뚱한 자리의 N개일 수 있다.
     geolocation 은 와이파이 기지국으로 추정할 때 수백 m~수 km 가 흔하다. */
const GEO_반경 = 1000;      // m. 서버가 100~5000 으로 자른다
const GEO_상한 = 50;

function 내위치지우기() {
  if (myLayer) myLayer.clearLayers();
  myPos = null;
  const b = $('#geo'); if (b) b.setAttribute('aria-pressed', 'false');
}

function 내위치그리기(lat, lng, acc) {
  /* ★ 전용 pane 에 올린다 (2026-10-20, 사용자: "내 위치가 지도상에 어딨는지
     표시가 없어서 햇갈려"). 점은 분명히 그려지고 있었다(DOM 으로 확인했다).
     문제는 **안 보이는 것** — 가격 말풍선 수백 개 사이에서 14px 파란 점은
     그냥 묻힌다. 마커 pane(600) 보다 위(650)에 놓고, 크기도 키우고,
     맥박 고리를 둘러 '여기' 라고 말하게 한다. */
  if (!map.getPane('mypos')) {
    map.createPane('mypos');
    map.getPane('mypos').style.zIndex = 650;
    map.getPane('mypos').style.pointerEvents = 'none';
  }
  if (!myLayer) myLayer = L.layerGroup().addTo(map);
  myLayer.clearLayers();
  /* 정확도 원을 **먼저** 깔고 점을 위에 둔다 */
  if (acc && acc > 0) {
    /* 정확도 원도 같은 pane 에 — 마커 밑에 깔리면 테두리가 안 보인다 */
    /* ★ 이 지도는 preferCanvas: true 다 — Leaflet 이 벡터를 **캔버스**로 그린다.
       캔버스에는 DOM 요소가 없어서 className(CSS)이 아무 일도 하지 않는다.
       처음에 className: 'myacc' 로 썼더니 원이 아예 안 보였다. 그래서 색을
       옵션으로 직접 준다. (style.css 의 .myacc 는 참고용으로 남겨 둔다 —
       renderer 를 L.svg() 로 바꾸면 그쪽이 쓰인다.) */
    L.circle([lat, lng], {
      radius: acc, interactive: false, pane: 'mypos',
      color: '#1e73ff', weight: 2, opacity: .7,
      fillColor: '#1e73ff', fillOpacity: .10,
    }).addTo(myLayer);
  }
  L.marker([lat, lng], {
    icon: L.divIcon({ className: 'mypos-wrap',
                      html: '<div class="mypos-ring"></div><div class="mypos"></div>'
                          + '<div class="mypos-tag">내 위치</div>',
                      iconSize: null, iconAnchor: [0, 0] }),
    zIndexOffset: 1000, interactive: false, pane: 'mypos',
    title: `내 위치 (오차 약 ${acc ? Math.round(acc) : '?'}m)`,
  }).addTo(myLayer);
}

/* 브라우저 오류를 **구분해서** 말한다. "위치를 못 찾았습니다" 하나로 뭉치면
   권한을 거부한 사람과 실내에서 신호가 안 잡힌 사람이 같은 안내를 받는다. */
function geo오류문구(err) {
  if (!window.isSecureContext)
    return '이 페이지가 보안 연결(HTTPS)이 아니어서 브라우저가 위치를 주지 않습니다.';
  switch (err && err.code) {
    case 1: return '위치 권한이 거부되었습니다. 주소창 왼쪽의 자물쇠/아이콘에서 '
                 + '이 사이트의 위치 권한을 허용으로 바꿔 주세요.';
    case 2: return '기기가 위치를 잡지 못했습니다. 실내라면 창가로 이동하거나 '
                 + '와이파이를 켜면 잡힐 수 있습니다.';
    case 3: return '위치를 잡는 데 시간이 너무 걸렸습니다. 다시 눌러 주세요.';
    default: return `위치를 가져오지 못했습니다.${err && err.message ? ' (' + err.message + ')' : ''}`;
  }
}

async function 내위치찾기() {
  const btn = $('#geo');
  /* 켜져 있으면 끈다 — 끌 때는 원래 검색 결과로 돌려준다 */
  if (btn.getAttribute('aria-pressed') === 'true') {
    내위치지우기(); search(); return;
  }
  if (!navigator.geolocation)
    return toast('이 브라우저는 위치 기능을 지원하지 않습니다.', 6000);
  if (geoBusy) return;
  geoBusy = true;
  btn.disabled = true;
  const 원래 = btn.querySelector('span').textContent;
  btn.querySelector('span').textContent = '찾는중';

  try {
    const pos = await new Promise((ok, no) =>
      navigator.geolocation.getCurrentPosition(ok, no,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }));
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;

    /* ★ 먼저 **묻고** 나서 그린다 (2026-10-20).
       처음엔 점을 찍고 지도를 옮긴 **뒤에** 서버에 물었다. 그랬더니 한국 밖
       좌표일 때 지도가 파리로 날아가고 파란 점이 남은 채 "조회 못 함" 만 떴다.
       거절할 거면 **옮기기 전에** 거절해야 한다 - 화면을 바꿔 놓고 못 한다고
       말하면, 사용자는 뭔가 된 줄 알고 그 자리에서 결과를 찾는다. */
    const r = await fetch(`/api/complexes/near?lat=${lat}&lng=${lng}`
                        + `&r=${GEO_반경}&limit=${GEO_상한}`).then(r => r.json());
    if (r.error) {
      내위치지우기();                       // 지도도 목록도 건드리지 않은 상태 그대로
      toast(esc(r.error) + (r.안내 ? '<br>' + esc(r.안내) : ''), 9000);
      return;
    }

    내위치그리기(lat, lng, acc);
    myPos = { lat, lng, acc };
    btn.setAttribute('aria-pressed', 'true');
    /* 마커가 뜨는 줌으로 간다. setView 가 refreshMap 을 부른다. */
    map.setView([lat, lng], Math.max(map.getZoom(), 17));

    closeDetail();
    selectedLawd = null; selectedKapt = null;
    items = r.단지 || [];
    lawdItems = []; newbuildItems = []; hpItems = []; pbItems = [];
    lastSearchQ = null;            // 다음 검색에서 상세를 닫게 둔다

    const 단위 = GEO_반경 >= 1000 ? (GEO_반경 / 1000) + 'km' : GEO_반경 + 'm';
    $('#count').textContent = `내 위치 ${단위} 안 ${fmt(r.개수)}개${r.잘림 ? '+' : ''}`
      + (r.잘림 ? ` (상한 ${fmt(r.상한)} — 더 있습니다)` : '')
      + (acc ? ` · 오차 약 ${Math.round(acc)}m` : '');
    renderList();
    목록자동(false);

    if (!items.length) {
      /* ★ 0개가 "건물이 없다" 는 뜻이 아니다. 좌표가 아직 안 붙은 구역일 수 있다.
         실제로 강남역 800m 는 0개인데 5km 로 넓히면 나온다. 그대로 말한다. */
      toast('이 주변에는 <b>좌표가 붙은 건물이 없습니다.</b><br>'
          + '건물이 없다는 뜻이 아니라, 그 구역의 필지 적재가 아직 안 끝난 것입니다. '
          + '지도를 움직여 찾아보세요.', 9000);
    } else if (acc && acc > 500) {
      toast(`위치 오차가 약 <b>${Math.round(acc)}m</b>입니다 — `
          + '목록의 거리도 그만큼 틀릴 수 있습니다.', 8000);
    }
  } catch (e) {
    const 문구 = (e && typeof e.code === 'number') ? geo오류문구(e)
               : `위치를 가져오지 못했습니다. (${e && e.message ? e.message : e})`;
    toast(esc(문구), 9000);
    내위치지우기();
  } finally {
    geoBusy = false;
    btn.disabled = false;
    btn.querySelector('span').textContent = 원래;
  }
}

/* ---------------- 법정동 선택 ---------------- */
/* 검색에서 동을 고르면 그 동으로 이동하고 경계를 남긴다.
   단지와 달리 좌측 상세는 건드리지 않는다 — 동은 '어디를 볼지' 를 정하는 것이지
   그 자체가 조회 대상은 아니다. */
async function selectLawd(lawd) {
  selectedLawd = lawd;
  document.querySelectorAll('.row.lawd').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.lawd === lawd)));
  const l = lawdItems.find(x => x.lawd_cd === lawd);
  try {
    const f = await fetch(`/api/lawds/${lawd}/geo`).then(r => r.json());
    lawdFocusLayer.clearLayers();
    if (f.error && f._상태 !== 404) {
      오류카드({ 무엇: '법정동 경계', 응답: f, 단지코드: null, 다시: () => selectLawd(lawd) });
      return;
    }
    if (f.error) {
      if (l && l.bbox_minx != null) {
        map.fitBounds([[l.bbox_miny, l.bbox_minx], [l.bbox_maxy, l.bbox_maxx]], { padding: [40, 40] });
      }
      return toast('이 법정동의 경계가 없습니다.'
        + (개발중 ? ' <b>py load_lawd_geom.py --sgg ○○○○○</b>' : ''), 7000);
    }
    lawdFocusLayer.addData(f);
    map.fitBounds(lawdFocusLayer.getBounds(), { padding: [40, 40] });
    const p = f.properties;
    toast(`${esc(p.full_nm || p.emd_nm)} · 단지 ${fmt(p.complex_cnt || 0)} · 매매 ${fmt(p.trade_cnt || 0)}`
          + (p.max_amount ? ` · 최고 ${eok(p.max_amount)}` : ''), 5000);
  } catch (e) {
    toast(`법정동 경계를 불러오지 못했습니다: ${esc(e.message)}`, 6000);
  }
}

/* ---------------- 상세 ---------------- */
/* ★ 새로 검색하면 **이전 단지 상세를 닫는다**(2026-10-19).
   안 닫으면 검색 결과 위에 옛 단지 상세가 그대로 떠서 **목록을 가린다.**
   실제로 AI 검색에서 그랬다 - 종로구를 찾았는데 아까 본 은평구 단지가
   화면을 덮고 있었다. 맥락이 끊겼으면 화면도 끊어야 한다.
   ★ 지도 강조(focus)도 같이 푼다. 상세는 닫혔는데 그 단지만 빛나고 있으면
     무엇을 보고 있는지 모르게 된다. */
/* ---- 목록 접기 -------------------------------------------------------
   ★ 단지 상세를 볼 때 목록은 자리만 먹는다(2026-10-19). 패널 한 칸에
     검색·필터·통계·목록·상세가 전부 세로로 쌓여서, 상세가 46% 안에 갇혔다.
   ★ 자동으로 접되 **사용자가 직접 편 건 존중한다.** 다시 접어 버리면
     "왜 자꾸 닫히지" 가 된다. 수동으로 만진 표시는 상세를 닫을 때 지운다. */
/* ★ '수동' 은 **지금 보고 있는 단지에 대해서만** 둔다(2026-10-19). 처음엔 한 번
   누르면 그 세션 내내 자동 접기가 죽었는데, 그러면 "고쳤다는데 똑같다" 가 된다.
   새로 검색하거나 상세를 닫으면 푼다 - 그때는 사용자도 처음부터 다시 보는 것이다. */
let 목록수동 = false;
function 목록접기(접을까) {
  const panel = document.querySelector('.panel');
  if (!panel) return;
  panel.classList.toggle('list-collapsed', 접을까);
  const btn = document.getElementById('listtoggle');
  if (btn) btn.setAttribute('aria-expanded', String(!접을까));
  const w = document.querySelector('#listtoggle .tword');
  if (w) w.textContent = 접을까 ? '펴기' : '접기';
}
function 목록자동(접을까) { if (!목록수동) 목록접기(접을까); }
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('#listtoggle');
  if (!btn) return;
  const panel = document.querySelector('.panel');
  목록수동 = true;
  목록접기(!panel.classList.contains('list-collapsed'));
});

/* 2026-10-24 사장님(폰) "검색해서 단지상세가 나왔을 때 다시 검색하는 UI 를 띄울 방법이 없다" — 시트 위 '검색' 단추 */
document.addEventListener('click', e => {
  if (!e.target.closest('#sheetsearch')) return;
  closeDetail();
  시트('half');
  const q = $('#q');
  if (q) { q.focus(); try { q.select(); } catch (er) {} }
});

function closeDetail() {
  if (selected === null && selectedKapt === null && selectedRedev === null) return;   /* 열린 게 없으면 그냥 둔다 */
  selected = null; selectedKapt = null;
  목록수동 = false; 목록접기(false);
  lastDetail = null; lastGeo = null; lastBgeo = null;
  clearShots();
  const box = $('#detail');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  구역지우기();
  닫힌자리지우기();
  동공고지우기();
  selectedRedev = null;
  주소맞춤('/');
  document.title = '터무니 · 전국 아파트 단지 조회 — 건축물대장 · 실거래 · 토지';   /* index.html 제목과 같게 */
  시트(($('#q') && $('#q').value.trim()) ? 'half' : 'peek');
  try { focusLayer.clearLayers(); focusBldLayer.clearLayers(); } catch (e) {}
  document.querySelectorAll('.row').forEach(b => b.setAttribute('aria-current', 'false'));
  paintMarkers();
}

async function select(id, fromList) {
  /* 2026-10-22 사장님: 다른 건물을 누르면 앞 건물에서 보던 탭(실거래 등)을 잇지 않고 **단지정보**로 연다.
     같은 단지를 다시 부를 때(묶인 옛 코드 이동 · 다시 불러오기)는 보던 탭을 둔다. */
  if (selected !== id) detailTab = 'info';
  selected = id; selectedKapt = null; 고른가상 = null; 고른공사 = null; 고른승인 = null;
  주소맞춤(`/c/${id}`, 상세쌓기());     // 2026-10-22 SEO: 단지마다 주소 — 공유·새로고침해도 같은 단지
  시트('full');             // 폰: 상세는 지도를 가리고 전체로
  주변점지우기();           // 다른 단지의 주변 점이 남아 있으면 안 된다
  구역지우기();             // 앞 단지에서 눌러 그린 정비구역 경계도
  selectedRedev = null;      // 구역 상세에서 단지로 넘어왔으면 구역 상세는 닫힌 것이다
  /* ★ 단지가 바뀌면 거래 탭의 '직접 고름' 을 푼다 (2026-10-20).
     안 풀면 월세를 보던 사람이 월세가 없는 단지로 옮겼을 때 **빈 화면**을 본다.
     탭 선택 자체(거래탭)는 남겨 둔다 — 같은 종류를 계속 보려는 사람이 많다. */
  탭수동 = false;
  prcShown = 10;          // 단지가 바뀌면 '더보기' 를 접는다
  거래Shown = 10;
  목록자동(true);
  document.querySelectorAll('.row').forEach(b =>
    b.setAttribute('aria-current', String(Number(b.dataset.id) === id)));
  if (showPolys) { parcelLayer.setStyle(styleParcel); buildingLayer.setStyle(styleBuilding); }
  paintMarkers();

  const box = $('#detail');
  box.hidden = false;
  box.innerHTML = '<p class="muted">불러오는 중…</p>';

  try {
    /* ★ 건물 외곽선(/buildings)을 **같이 기다리지 않는다** (2026-10-21).
       그 하나만 공간조인이고, footprint 에 공간색인이 없어서 실측 최대 46초다.
       셋을 Promise.all 로 묶어 두면 나머지가 0.6초에 와도 화면은 46초 동안
       '불러오는 중…' 이다 — **제일 느린 하나가 전체를 정한다.**
       그래서 상세·필지로 먼저 그리고, 외곽선은 도착하면 덧그린다.
       ⚠ 늦게 도착하므로 **단지가 바뀌었는지 확인하고** 그린다. 확인 없이 그리면
         빨리 다음 단지로 넘긴 사람의 지도에 **앞 단지 건물**이 그려진다. */
    /* ⚠ **못 불러온 것을 0건으로 만들면 안 된다.** /buildings 는 지금 공간색인이
       없어서 60초 타임아웃이 날 수 있다. 빈 features 로 바꿔 넘기면 화면이
       "이 단지는 건물 외곽선이 없습니다" 라고 **거짓말**을 한다. 실패는 실패로 표시한다. */
    const bp = fetch(`/api/complexes/${id}/buildings`).then(r => r.json())
                 .then(j => (j && Array.isArray(j.features))
                              ? j : { features: [], 실패: (j && j.error) || '응답을 읽지 못했습니다' })
                 .catch(e => ({ features: [], 실패: String(e.message || e) }));
    const [d, geo] = await Promise.all([
      fetch(`/api/complexes/${id}`).then(r => r.json()),
      fetch(`/api/complexes/${id}/geo`).then(r => r.json()),
    ]);
    /* ★ 2026-10-21 (287): 묶인 조각의 옛 코드 — 남은 단지로 옮겨 간다(최근 본 단지 · 공유 링크) */
    if (d && d.이동) {
      toast(`단지코드 ${esc(id)} 는 ${esc(d.이동)} 으로 묶였습니다 — ${esc(d.이유 || '')}`, 5000);
      return select(d.이동, fromList);
    }
    if (d.error) {
      /* 404 는 사실이다(없는 단지) - 카드 없이 그 자리에 적는다 */
      if (d._상태 === 404) { box.innerHTML = `<p class="muted">단지코드 ${esc(id)} 는 없는 단지입니다.</p>`; return; }
      box.innerHTML = `<p class="muted">상세를 불러오지 못했습니다.</p>`;
      오류카드({ 무엇: '단지 상세', 응답: d, 단지코드: id, 다시: () => select(id, fromList) });
      return;
    }
    lastGeo = geo; lastBgeo = null;   /* 아직 안 왔다 — 앞 단지 것을 쓰면 안 된다 */
    renderDetail(d);
    recentPush('c', id, (주소이름인가(d.complex) && d.complex.실거래이름) || shortNm(d.complex.complex_nm) || '(이름 없음)',
               d.complex.rep_plat_plc || '');

    bp.then(bgeo => {
      if (selected !== id) return;            /* 그동안 다른 단지로 옮겼다 */
      lastBgeo = bgeo;
      if (bgeo.features && bgeo.features.length) focusBldLayer.addData(bgeo);
      /* 목록은 lastBgeo 에서 만들므로 **다시 그려야** 수가 맞는다 */
      if (lastDetail) renderDetail(lastDetail);
    });

    focusLayer.clearLayers();
    focusBldLayer.clearLayers();
    if (geo.features && geo.features.length) {
      focusLayer.addData(geo);
      map.fitBounds(focusLayer.getBounds(), { padding: [60, 60], maxZoom: 18 });
    } else {
      const c = d.complex;
      if (c.centroid_lat) map.setView([c.centroid_lat, c.centroid_lng], 17);
      else toast('이 단지는 연속지적도 필지가 매칭되지 않아 지도에 표시할 수 없습니다.', 5000);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">상세를 불러오지 못했습니다.</p>`;
    오류카드({ 무엇: '단지 상세', 예외: e, 단지코드: id, 다시: () => select(id, fromList) });
  }
}

let lastDetail = null;      // 직거래 토글 시 재요청 없이 다시 그리려고 보관
let hideDirect = false;     // 직거래 제외하고 볼 것인가
let lastGeo = null, lastBgeo = null;   // 상세 썸네일용. select() 가 채운다
let detailTab = 'info';
/* 10-31 사장님 "실거래 → 교통 → 다음으로 넘어갈 때 탭으로 확실하게 분리되고, 오른쪽 · 왼쪽을 눌러서 이동 · 마우스로 꾹 눌러 좌우로" —
   상세 탭 줄이 패널보다 길면 양 끝에 ‹ › 단추(누르면 한 화면씩 민다) · 마우스로 잡아 끌기 · 휠 굴리기를 붙인다.
   끄는 중에 손을 떼면 탭이 눌린 것으로 치지 않는다(5px 넘게 움직였으면). 폰(터치)은 원래대로 손가락으로 민다. */
function 탭줄손잡이(bar) {
  if (!bar || bar.dataset.grip) return;
  bar.dataset.grip = '1';
  const wrap = document.createElement('div'); wrap.className = 'tabwrap';
  bar.parentNode.insertBefore(wrap, bar); wrap.appendChild(bar);
  const 단추 = (cls, 글, 방향) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tabnav ' + cls;
    b.setAttribute('aria-label', 방향 < 0 ? '탭 왼쪽으로' : '탭 오른쪽으로'); b.textContent = 글;
    b.addEventListener('click', () => bar.scrollBy({ left: 방향 * Math.max(120, bar.clientWidth * 0.7), behavior: 'smooth' })); wrap.appendChild(b); return b; };
  const L = 단추('l', '‹', -1), R = 단추('r', '›', 1);
  const 맞춤 = () => { const 끝 = bar.scrollWidth - bar.clientWidth;
    L.hidden = bar.scrollLeft <= 2; R.hidden = 끝 <= 2 || bar.scrollLeft >= 끝 - 2; 탭줄위치 = bar.scrollLeft; };
  bar.addEventListener('scroll', 맞춤, { passive: true });
  new ResizeObserver(맞춤).observe(bar);
  맞춤();
  /* 휠: 세로로 굴려도 탭 줄이 가로로 움직인다(넘칠 때만 · 페이지 스크롤은 끝에 닿으면 그대로) */
  bar.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const 끝 = bar.scrollWidth - bar.clientWidth; if (끝 <= 2) return;
    if ((e.deltaY < 0 && bar.scrollLeft <= 0) || (e.deltaY > 0 && bar.scrollLeft >= 끝)) return;
    e.preventDefault(); bar.scrollLeft += e.deltaY;
  }, { passive: false });
  /* 마우스로 잡아 끌기 */
  let 잡음 = null, 끌었음 = false;
  bar.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    잡음 = { x: e.clientX, l: bar.scrollLeft, id: e.pointerId }; 끌었음 = false;
  });
  bar.addEventListener('pointermove', e => {
    if (!잡음 || e.pointerId !== 잡음.id) return;
    const dx = e.clientX - 잡음.x;
    if (!끌었음 && Math.abs(dx) > 5) { 끌었음 = true; bar.setPointerCapture(e.pointerId); bar.classList.add('dragging'); }
    if (끌었음) bar.scrollLeft = 잡음.l - dx;
  });
  const 놓기 = e => { if (!잡음 || (e && e.pointerId !== 잡음.id)) return; 잡음 = null; bar.classList.remove('dragging'); };
  bar.addEventListener('pointerup', 놓기); bar.addEventListener('pointercancel', 놓기);
  bar.addEventListener('click', e => { if (끌었음) { e.stopPropagation(); e.preventDefault(); 끌었음 = false; } }, true);   // 끈 뒤의 '누름' 은 탭 고르기가 아니다
}
let 탭줄위치 = 0;                     // 2026-10-24 탭 줄 가로 위치(다시 그려도 유지)                // 단지정보 | 실거래 | 토지·건물 (왼쪽부터)
let hoDong = null;                     // 동호배치도에서 펼쳐 둔 동 (null = 세대 많은 동)
let tradeArea = null;                  // 실거래에서 고른 평형(area_grp). null = 전체
/* 공시가격 추이에서 지금 몇 호까지 보여주고 있나. 10 에서 시작해 '더보기' 로 10 씩.
   ★ 단지를 바꿀 때 **10 으로 되돌린다**(select()). 안 되돌리면 앞 단지에서 60까지
     펼쳐 둔 사람이 다음 단지를 열었을 때 느닷없이 60호를 본다. */
let prcShown = 10;
/* 건별 거래 목록에서 지금 몇 줄까지 보여주고 있나. 공시 추이와 **같은 방식**(10씩).
   ★ 단지가 바뀌거나 **거래탭·평형을 바꾸면 10 으로 되돌린다** — 안 되돌리면
     매매에서 60줄 펼친 사람이 월세 탭으로 옮겼을 때 느닷없이 60줄을 본다. */
let 거래Shown = 10;
/* 실거래에서 고른 거래 종류 (2026-10-20, 사용자 요청).
   ★ 전세와 월세를 **갈라서** 보여준다. 전에는 '전월세' 한 덩어리였는데,
     보증금만 있는 전세와 달세가 있는 월세는 값의 단위가 달라 섞으면 뜻을 잃는다.
   ★ 0건인 종류도 **탭은 보여준다.** '없다' 는 것도 정보다 — 탭이 사라지면
     사용자는 '이 단지는 월세가 없구나' 가 아니라 '기능이 없구나' 로 읽는다. */
let 거래탭 = '매매';
let 탭수동 = false;   // 사용자가 직접 고른 뒤에는 자동으로 안 옮긴다
/* 격자에서 고른 평형. 실거래의 tradeArea 와 **따로 둔다**(2026-10-18).
   같은 수치(FLOOR(전용면적))를 쓰지만 적재 범위가 다르다 — 실거래는 전 단지,
   대장 전용면적은 장위동·수색동만이다. 하나로 묶으면 평형을 고른 순간
   한쪽은 걸리고 한쪽은 안 걸리는데 화면은 "걸렸다" 고 말하게 된다.
   둘은 서로 다른 탭에 있으므로 나란히 보일 일도 없다. */
let hoArea = null;
/* 층 평면을 펼쳐 둔 층. null = 안 펼침. 격자의 층 라벨을 누르면 켜진다. */
let hoFloor = null;
/* 같은 평형 안의 **정확한 전용면적**(소수 2자리 문자열). null = 그 평형 전부.
   왜 두 단인가: FLOOR 로 묶으면 타입이 숨는다. 래미안 장위의 `84㎡` 는 실제로
   84.94(614호) + 84.98(142호) 둘이고, DMC 롯데캐슬은 84.93/84.87/84.97 셋이다.
   네이버가 `112.08A` 라고 쓰는 그 구분이다. 1단은 평형(실거래와 같은 어휘),
   2단은 타입 — 어휘를 안 깨면서 숨은 것을 드러낸다. */
let hoAreaX = null;

/* ---------------- 단지 썸네일 ----------------
   단지의 필지·건물 폴리곤은 이미 상세에서 받아온다. 그걸 bbox 로 삼아
   항공사진을 작게 띄우면 단지마다 고유한 그림이 나온다. 서버 추가 작업 없음.

   조감이지 외관이 아니다. 외관은 로드뷰인데 SDK 로 띄우면 단지당 쿼터를
   먹으므로, 여기서는 카카오맵 링크로 새 탭을 연다(키·쿼터 불필요).

   장위동 62-1 로 확인한 바로는 VWorld 항공사진이 신축을 반영한다.
   건물 외곽선은 철거 전 빌라를 그리는데(CONTEXT 4-18) 항공사진은 완공된
   아파트가 찍혀 있었다. 같은 VWorld 인데 갱신 주기가 다르다. */
let shotMaps = [];

function clearShots() {
  shotMaps.forEach(m => { try { m.remove(); } catch (e) {} });
  shotMaps = [];
}

function shotsMarkup(c) {
  const aerial = CFG.hasVworld && !vwFailed;
  if (!aerial)
    return `<div class="shots"><div class="shot none">항공사진을 쓸 수 없습니다<br>
            <span>VWorld 타일이 필요합니다</span></div></div>`;
  const hasGeo = (lastGeo && lastGeo.features && lastGeo.features.length)
              || (lastBgeo && lastBgeo.features && lastBgeo.features.length)
              || c.centroid_lat;
  if (!hasGeo)
    return `<div class="shots"><div class="shot none">이 단지는 필지가 매칭되지 않아<br>
            <span>사진을 만들 수 없습니다</span></div></div>`;
  const rv = c.centroid_lat
    ? `<a class="shot rv" target="_blank" rel="noopener"
          href="https://map.kakao.com/link/roadview/${c.centroid_lat},${c.centroid_lng}"
          title="카카오맵 로드뷰를 새 탭에서 엽니다"><b>로드뷰</b><span>카카오맵에서 열기</span></a>`
    : '';
  return `<div class="shots">
      <div class="shot" id="shotA" title="클릭하면 지도를 이 단지로 옮깁니다"></div>
      <div class="shot" id="shotB" title="클릭하면 지도를 이 단지로 옮깁니다"></div>
      ${rv}
    </div>`;
}

function miniMap(elId, bounds, center, zoomOut) {
  const el = document.getElementById(elId);
  if (!el) return null;
  /* ★ 2026-10-22: 단지를 열 때마다 콘솔에 '_leaflet_pos' 오류가 미니 지도 수만큼(2건) 떴다.
     fitBounds 뒤 setZoom 이 **움직이는 그림(줌 애니메이션)** 을 걸어 두는데, 상세는 자료가 올 때마다 다시 그려져
     (renderDetail → renderShots → clearShots 가 앞 지도를 remove) 애니메이션이 끝나는 순간 지도가 이미 없었다.
     미니 지도는 사진일 뿐이라 움직일 이유가 없다 — 애니메이션을 끄고 줌은 한 번에 정한다. */
  const mm = L.map(el, {
    zoomControl: false, attributionControl: false, dragging: false,
    scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
    keyboard: false, touchZoom: false, preferCanvas: true,
    zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false,
    /* 2026-10-24: 회전 플러그인이 미리보기 지도에도 나침반 단추(▲▼)를 붙여 검색 제안 위로 비쳤다 — 미리보기는 돌릴 일이 없다 */
    rotate: false, rotateControl: false, touchRotate: false, shiftKeyRotate: false
  });
  vworldLayer('Satellite', 'jpeg').addTo(mm);
  vworldLayer('Hybrid', 'png').addTo(mm);
  if (bounds) {
    const z = mm.getBoundsZoom(bounds, false, L.point(16, 16));
    mm.setView(bounds.getCenter(), Math.max(Math.min(z, 19 - zoomOut) - zoomOut, 12), { animate: false });
  } else mm.setView(center, Math.max(18 - zoomOut - zoomOut, 12), { animate: false });
  if (lastBgeo && lastBgeo.features && lastBgeo.features.length)
    L.geoJSON(lastBgeo, { style: { color: '#ffd84d', weight: 1.5, opacity: .95,
                                   fillColor: '#ffd84d', fillOpacity: .12 } }).addTo(mm);
  setTimeout(() => { if (el.isConnected && mm._loaded) mm.invalidateSize({ animate: false }); }, 0);   // 그새 다시 그려져 지워졌으면 손대지 않는다
  el.addEventListener('click', () => {
    if (!$('#sat').checked) { $('#sat').checked = true; setBase('sat'); }
    if (bounds) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 - zoomOut });
    else map.setView(center, 18 - zoomOut);
  });
  return mm;
}

function renderShots(c) {
  clearShots();
  if (!(CFG.hasVworld && !vwFailed)) return;
  let bounds = null;
  try {
    const src = (lastGeo && lastGeo.features && lastGeo.features.length) ? lastGeo : lastBgeo;
    if (src && src.features && src.features.length) bounds = L.geoJSON(src).getBounds();
  } catch (e) { bounds = null; }
  const center = c.centroid_lat ? [c.centroid_lat, c.centroid_lng] : null;
  if (!bounds && !center) return;
  shotMaps.push(miniMap('shotA', bounds, center, 0));   // 단지 근접
  shotMaps.push(miniMap('shotB', bounds, center, 2));   // 주변까지
  shotMaps = shotMaps.filter(Boolean);
}

/* 이 단지 것으로 '보이는' 거래가 다른 지번으로 신고돼 안 붙은 경우.
   한 단지가 여러 필지에 걸쳐 있고 소스마다 다른 필지를 대표로 고른다
   (CONTEXT 4-18 의 "번지 일대"). 길음역 롯데캐슬은 대장 1290 / 실거래 542-1 이다.

   **추정이다.** 법정동 + 사용승인일로 찾았고, 위 평형 집계에는 넣지 않는다.
   섞으면 확인된 거래와 추정이 구분되지 않는다. 따로 두고 그렇게 적는다. */
/* 전세가율 (2026-10-19)
   ★ **새로 받은 데이터가 아니다.** 매매와 전세를 둘 다 갖고 있어서 나오는 값이다.
   ★ 두 거래의 **시점이 다르면 그렇게 말한다.** 2024년 매매가와 2025년 전세금을
     한 숫자로 뭉치면 그게 거짓말이다 - 개월 차이를 그대로 보여주고,
     많이 벌어진 건 눈에 띄게 표시한다.
   ★ 순수 전세(월세 0)와 중개거래만 쓴다 - 서버에서 이미 걸렀고, 화면도 그렇게 적는다. */
function jeonseBlock(rows0, area = null) {
  if (!rows0 || !rows0.length) return '';
  /* ★ 2026-10-22 사장님 "66㎡ 를 골랐는데 다른 평형들도 나와" — 위 평형 칩을 따른다.
     전세가율은 전용 평형으로만 낸다 — 칩이 '건물 84㎡' 같은 다른 면적이면 맞는 줄이 없다. */
  let rows = rows0;
  if (area !== null) {
    const [n, src] = String(area).split('|');
    rows = src ? [] : rows0.filter(r => String(r.평형) === n);
    if (!rows.length) return sect('전세가율', 'rtms', '', '매매·전세 각각의 최근 1건')
      + `<p class="note">${gapCell('', 'NA', `${esc(src ? src + ' ' : '')}${esc(n)}㎡ 전세가율 없음 — 중개 매매 · 순수 전세가 둘 다 있어야 함`)}
         <span class="muted">(다른 ${fmt(rows0.length)}개 평형은 '전체' 에서 보입니다)</span></p>`;
  }
  const far = rows.filter(r => Number(r.개월차) >= 12).length;
  return sect('전세가율', 'rtms', ` ${fmt(rows.length)}개 평형`,
              '매매·전세 각각의 최근 1건') + `
    <table><thead><tr><th>평형</th><th class="n">매매</th><th class="n">전세</th>
      <th class="n">전세가율</th><th class="n">시점 차</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${r.평형}㎡<span class="muted"> ${(r.평형 / 3.3058).toFixed(1)}평</span></td>
      <td class="n">${eok(r.매매가)}<br><span class="muted">${ymd(r.매매일)}</span></td>
      <td class="n">${eok(r.전세금)}<br><span class="muted">${ymd(r.전세일)}</span></td>
      <td class="n"><b>${r.전세가율 == null ? '—' : Number(r.전세가율).toFixed(1) + '%'}</b></td>
      <td class="n${Number(r.개월차) >= 12 ? ' bad' : ''}">${fmt(r.개월차)}개월</td>
    </tr>`).join('')}</tbody></table>
    ${far ? `<p class="note sm">★ ${fmt(far)}개 평형은 매매 · 전세가 1년 넘게 떨어진 거래(같은 시점 아님)</p>` : ''}`;
}

function offsiteBlock(rows) {
  if (!rows || !rows.length) return '';
  const head = rows[0];
  const jibun = pnuJibun(head.거래pnu);
  const list = rows.filter(r => r.area_grp != null);
  const sale = list.filter(r => !r.is_rent), rent = list.filter(r => r.is_rent);

  const tbl = (rs, label) => rs.length ? `
    <div class="subsect">${label} ${fmt(rs.reduce((a, r) => a + (r.cnt || 0), 0))}</div>
    <table><thead><tr><th>평형</th><th class="n">건</th><th class="n">최고</th><th class="n">최근</th></tr></thead><tbody>
    ${rs.map(r => `<tr>
      <td>${r.area_grp}㎡<span class="muted"> ${(r.area_grp/3.3058).toFixed(1)}평</span></td>
      <td class="n">${fmt(r.cnt)}</td>
      <td class="n">${r.max_amount != null ? eok(r.max_amount) : '—'}</td>
      <td class="n">${ymd(r.last_ymd)}</td>
    </tr>`).join('')}</tbody></table>` : '';

  return `
    <div class="sect off">연결되지 않은 거래 ${fmt(head.거래)} ${EST('rtms')}
      <span class="src" title="${esc(SRC.rtms.s)}">${esc(SRC.rtms.t)} <i>단지 미매칭</i></span></div>
    <p class="srcline">${esc(jibun)} 지번 신고 · 위 집계에 안 넣음</p>
    ${tbl(sale, '매매')}${tbl(rent, '전월세')}`;
}

/* 동 이름은 단지마다 다른 자리에 있다 — 큰 단지는 dong_nm('101동'), 작은 단지는
   bld_nm 에 들어 있고, 단독 동짜리는 둘 다 비어 있다(CONTEXT 4-4).
   **셋 다 비면 관리번호를 보여주지 않는다.** 19자리 숫자는 사람에게 의미가 없고,
   동 이름처럼 보여서 더 나쁘다. 관리번호는 title 로만 남긴다. */
/* ---------------- 동 입면 ----------------
   **배치도가 아니라 입면이다.** 동의 실제 위치는 건물 외곽선(지도)에 있고,
   여기서 보여주는 것은 **층 구성**이다 — 지도가 못 보여주는 축이다.
   둘이 상호보완이지 대체가 아니다.

   새로 받는 데이터가 **하나도 없다.** dong_nm·grnd_flr_cnt·ugrnd_flr_cnt·
   hhld_cnt·main_purps_nm 전부 동별 표제부에 이미 있던 것이다.
   오늘 주차 1,177대와 같은 종류 — 적재해 놓고 안 꺼내던 값이다.

   호·라인은 여기 없다. 유일한 출처인 전유공용면적이 0건이다(정책.md 4장).
   층도 층별개요를 적재해야 나온다. **지금 확실한 것은 동과 층수뿐이고,
   그 범위 안에서만 그린다.** */
function elevationBlock(dongs, sel) {
  const rows = (dongs || []).filter(d => !d.is_recap);
  if (!rows.length) return '';
  const up = d => Number(d.grnd_flr_cnt) || 0;
  const dn = d => Number(d.ugrnd_flr_cnt) || 0;
  const maxUp = Math.max(1, ...rows.map(up));
  const maxDn = Math.max(0, ...rows.map(dn));
  /* 층당 픽셀. 동이 많으면 좁아지므로 상한을 둔다 */
  const u = Math.max(3, Math.min(7, 112 / maxUp));
  /* 주거동과 부속동을 가른다 — 경비실·관리동·유치원이 같은 색이면 단지가 커 보인다 */
  const isHome = d => /공동주택|아파트|주택/.test(d.main_purps_nm || '');

  const bar = d => {
    const h = up(d) * u, b = dn(d) * u;
    const nm = (d.dong_nm || d.bld_nm || '').trim();
    const short = nm.replace(/동$/, '') || '—';
    const tip = [nm || '이름 없음', d.main_purps_nm || '',
                 up(d) ? `지상 ${up(d)}층` : '', dn(d) ? `지하 ${dn(d)}층` : '',
                 d.hhld_cnt ? `${fmt(d.hhld_cnt)}세대` : '',
                 d.tot_area ? `${fmt(Math.round(d.tot_area))}㎡` : ''].filter(Boolean).join(' · ');
    return `<div class="ev-col${d.mgm_bldrgst_pk === sel ? ' sel' : ''}"
                 data-ho-dong="${esc(String(d.mgm_bldrgst_pk || ''))}" title="${esc(tip)}">
      <div class="ev-up">
        ${up(d) ? `<span class="ev-n">${up(d)}</span>` : ''}
        <div class="ev-bar${isHome(d) ? '' : ' aux'}" style="height:${h.toFixed(1)}px"></div>
      </div>
      <div class="ev-ground"></div>
      <div class="ev-dn">${b ? `<div class="ev-bar dn" style="height:${b.toFixed(1)}px"></div>` : ''}</div>
      <div class="ev-nm">${esc(short)}</div>
    </div>`;
  };

  const homes = rows.filter(isHome), aux = rows.filter(d => !isHome(d));
  const hh = homes.reduce((a, d) => a + (Number(d.hhld_cnt) || 0), 0);
  return `<div class="stage"><div class="stage-h">단지 전체<span class="src">건축물대장 · 표제부</span></div>
     <div class="elev" style="--dn:${(maxDn * u).toFixed(1)}px">${rows.map(bar).join('')}</div>
     </div>`;
}

/* ---------------- 동 x 라인 x 층 격자 (동호배치도) ----------------
   2026-10-17: 동x층 격자와 층x라인 호 격자를 **하나로 합쳤다.**
   둘은 세로축(층)이 같고 가로축만 달랐다 — 동 칸을 그 동의 라인으로 펼치면
   한 장이 된다. 그러면 가로가 `동 x 라인`, 세로가 `층`, **칸이 호**다.

   폴백이 구조에 들어 있다:
     호(전유부) 있음   -> 동 하나가 라인 수만큼 칸으로 펼쳐진다
     호 없음           -> 동 하나가 한 칸. 즉 예전의 동x층 격자 그대로
     라인을 못 가름     -> 그 동도 한 칸 (상가·관리동·지하주차장)

   칸에 호번호를 쓰지 않는다. 24동 x 4라인 = 96칸인데 글자를 넣으면 3,600px 가
   된다. **배치도는 모양을 보는 그림**이고 호번호는 올려두면 나온다.
   그리고 호번호는 층과 라인에서 복원되므로(99%) 칸마다 적을 이유가 없다.

   색은 층별개요의 용도를 따른다. 층별개요가 없고 호만 있으면 주거로 칠한다. */
/* 호가 지금 고른 평형/타입에 맞나. areaSel = {g:'84', x:'84.94'|null} 또는 null.
   격자와 평면이 **같은 함수로** 판정해야 한다 - 두 군데서 따로 비교하면
   언젠가 한쪽만 고치고 끝난다. */
function hoMatches(h, areaSel) {
  if (!areaSel) return true;
  if (h.평형 == null || String(h.평형) !== areaSel.g) return false;
  if (!areaSel.x) return true;
  return h.전용면적 != null && Number(h.전용면적).toFixed(2) === areaSel.x;
}

function gridBlock(dongs, floors, hos, scope, sel, areaSel) {
  const real = (dongs || []).filter(d => !d.is_recap);
  const F = floors || [], H = hos || [];
  if (!F.length && !H.length) return '';

  const kind = v => /아파트|공동주택|주택|다세대|연립/.test(v || '') ? 'f-home'
                  : /주차/.test(v || '') ? 'f-park'
                  : /근린생활|판매|업무|상업|위락/.test(v || '') ? 'f-shop'
                  : 'f-etc';

  /* 동 순서는 표제부 순서를 따른다. 거기 없는 동은 뒤에 붙인다. */
  const orderAll = [], seen = new Set();
  const push = (pk, nm) => { if (pk && !seen.has(pk)) { seen.add(pk); orderAll.push({ pk, nm }); } };
  real.forEach(d => push(d.mgm_bldrgst_pk, (d.dong_nm || d.bld_nm || '').trim() || '—'));
  F.forEach(f => push(f.mgm_bldrgst_pk, f.동 || '—'));
  H.forEach(h => push(h.동PK, h.동 || '—'));

  /* ★★ 한 번에 한 동만 그린다 (2026-10-18).
     전에는 24개동을 가로로 다 펼쳤다. 열 하나가 12px 이라 동 이름을
     **세로로 세워야** 들어갔고(writing-mode:vertical-rl), 그래서 못 읽었다.
     세로쓰기는 증상이지 원인이 아니었다 — 원인은 '전부 한꺼번에' 다.
     동을 고르면 열이 24개에서 2~4개로 줄고, 라벨이 저절로 가로로 들어간다.
     전체 조망은 지도의 건물 외곽선이 한다(elevationBlock 주석도 같은 말이다). */
  const order = orderAll.filter(d => d.pk === sel);
  if (!order.length) return '';

  /* 동별 라인 목록. 라인이 하나도 안 갈리면 빈 배열 -> 한 칸으로 남는다. */
  const linesOf = new Map(), hoAt = new Map(), orphan = new Map();
  /* ★ 라인을 못 가른 호도 **층은 안다**. 버리지 않고 '라인 모름' 칸에 쌓는다
     (2026-10-17). 전에는 개수만 각주로 세고 격자에서 뺐다. 그래서 호명칭이
     'B101호' 꼴인 **지하가 통째로 비어 보였다** — 데이터가 없는 것과
     화면이 버린 것이 구분되지 않았다. */
  const orphanAt = new Map();
  for (const h of H) {
    const pk = h.동PK;
    if (h.라인 === null || h.라인 === undefined) {
      (orphan.get(pk) || orphan.set(pk, []).get(pk)).push(h);
      const ok2 = pk + '\u0000' + Number(h.층);
      (orphanAt.get(ok2) || orphanAt.set(ok2, []).get(ok2)).push(h);
      continue;
    }
    if (!linesOf.has(pk)) linesOf.set(pk, new Set());
    linesOf.get(pk).add(h.라인);
    hoAt.set(pk + '\u0000' + h.라인 + '\u0000' + Number(h.층), h);
  }
  const flrAt = new Map();
  for (const f of F) {
    const k = f.mgm_bldrgst_pk + '\u0000' + Number(f.층);
    (flrAt.get(k) || flrAt.set(k, []).get(k)).push(f);
  }

  /* 칸(컬럼) 목록을 먼저 펼친다 */
  const cols = [];
  for (const d of order) {
    const ls = [...(linesOf.get(d.pk) || [])].sort((a, b) => a - b);
    const hasOrphan = (orphan.get(d.pk) || []).length > 0;
    if (ls.length) ls.forEach((l, i) => cols.push({ ...d, line: l, first: i === 0, span: ls.length }));
    if (hasOrphan) cols.push({ ...d, line: '?', first: !ls.length, span: 1 });
    else if (!ls.length) cols.push({ ...d, line: null, first: true, span: 1 });
  }
  const flrs = [...new Set([...F.map(f => Number(f.층)), ...H.map(h => Number(h.층))])]
                 .sort((a, b) => b - a);
  if (!cols.length || !flrs.length) return '';
  const fnm = f => (f < 0 ? `지하${-f}` : `${f}`);

  /* ★ 색 기준을 사람이 고르지 않는다 (2026-10-18).
     전에는 [용도 | 공시가격] 토글이 있었다. 그런데 아파트는 전 칸이 '주거' 라
     용도 모드가 **한 색으로 깔려 아무 말도 하지 않는다.** 고를 게 없는 선택지를
     띄워 두면 화면만 복잡해진다.
     그래도 용도를 지우지는 않는다 — **공시가격이 없는 단지에서는 그게 유일한
     색 기준**이다(주택가격은 종로·장위·은평·돈암만 적재됐다). 지우면 나머지
     단지의 격자가 통째로 회색이 된다. 그래서 **있으면 공시가격, 없으면 용도**다.
     용도는 어느 모드에서든 올려두면 나온다(tip 에 들어 있다). */
  const byPrice = H.some(h => h.공시가격);

  const body = flrs.map(f => `<div class="gx-row">
      <div class="gx-h${f < 0 ? ' dn' : ''}">${fnm(f)}</div>
      ${cols.map(c => {
        const orp = c.line === '?' ? (orphanAt.get(c.pk + '\u0000' + f) || []) : [];
        const ho = c.line === '?' ? (orp[0] || null)
                 : c.line === null ? null
                 : hoAt.get(c.pk + '\u0000' + c.line + '\u0000' + f);
        const fl = flrAt.get(c.pk + '\u0000' + f);
        if (!ho && !fl) return `<div class="gx-c"></div>`;
        const top = fl && fl.slice().sort((a, b) => (b.면적 || 0) - (a.면적 || 0))[0];
        const lineTxt = c.line === '?' ? ' 라인 모름'
                      : c.line !== null ? ` ${String(c.line).padStart(2, '0')}라인` : '';
        const tip = [`${c.nm}${lineTxt} ${fnm(f)}층`,
                     c.line === '?' && orp.length
                       ? `호 ${orp.map(x => x.호).join(', ')}`
                       : ho ? `호 ${ho.호}` : '',
                     ho && ho.전용면적 ? `전용 ${Number(ho.전용면적).toFixed(2)}㎡` : '',
                     ...(fl || []).map(x => `· ${x.용도 || '—'} ${fmt(Math.round(x.면적 || 0))}㎡`)]
                    .filter(Boolean).join('\n');
        /* 색 기준이 가격이면 **단지 내 분위**로 칠한다. 절대금액으로 칠하면
           단지마다 색이 달라져 비교가 안 된다(27_hsprc.sql).
           가격이 없는 칸은 회색으로 남긴다 — 0 으로 칠하면 "싸다" 로 읽힌다. */
        const cls = byPrice
          ? (ho && ho.단지분위 ? `p${ho.단지분위}` : 'p0')
          : (top ? kind(top.용도) : 'f-home');
        const tip2 = ho && ho.공시가격
          ? tip + `\n공시 ${eok(ho.공시가격)} (${String(ho.기준일 || '').slice(0,4)}년` +
            `${ho.단지분위 ? ` · 단지 ${ho.단지분위}/5` : ''}` +
            `${ho.라인분위 ? ` · 라인 ${ho.라인분위}/5` : ''})`
          : tip;
        /* 호가 있는 칸만 누를 수 있다. 호가 없으면 열어 봐야 할 상세가 없다. */
        /* ★ 평형 필터는 **숨기지 않고 흐린다** (2026-10-18).
           빼 버리면 열이 사라져 동의 모양이 무너진다 — 그 평형이 동 안
           **어디에 박혀 있는지**가 이 격자의 쓸모인데 그게 같이 사라진다.
           흐린 칸도 여전히 누를 수 있다. 필터는 보기 보조지 통제가 아니다. */
        const dimmed = areaSel && !(ho && hoMatches(ho, areaSel)) ? ' dim' : '';
        return `<div class="gx-c ${cls}${dimmed}${ho ? ' ho hit' : ''}${
          fl && fl.length > 1 ? ' multi' : ''}" title="${esc(tip2)}"${
          ho && ho.호PK ? ` data-ho-pk="${esc(String(ho.호PK))}"` : ''}></div>`;
      }).join('')}
    </div>`).join('');

  /* 머리: 동 이름은 위 피커가 들고 있으므로 격자에는 **라인만** 가로로 쓴다.
     (전에는 동 이름 세로줄 + 라인 번호 두 줄이었다) */
  const head = '';
  /* 칸마다 '01라인' 을 반복하면 30px 에 빡빡하다. 축 이름은 **모서리에 한 번**,
     칸에는 번호만 — 세로축(층)도 같은 방식이다. */
  const lineRow = `<div class="gx-row gx-lines"><div class="gx-h">라인</div>${
      cols.map(c => `<div class="gx-c"${c.line === '?' ? ' title="호 번호로 라인을 정할 수 없는 호(상가 · 지하 등) — 층만 맞춤"' : ''}>${
        c.line === '?' ? '?' : c.line === null ? '전체' : String(c.line).padStart(2, '0')
      }</div>`).join('')}</div>`;

  const nHo = H.length, nLine = cols.filter(c => typeof c.line === 'number').length;
  const nPrice = H.filter(h => h.공시가격).length;
  const orphanAll = [...orphan.values()].flat();

  const modes = '';
  return `<div class="stage"><div class="stage-h">${esc(order[0].nm)}${modes}<span class="src">건축물대장 · ${
      [F.length ? '층별개요' : '', H.length ? '전유부' : '',
       nPrice ? '주택가격' : ''].filter(Boolean).join(' + ')}</span></div>
    <div class="gxgrid">${head}${lineRow}${body}</div>
    <p class="srcline">${/* 2026-10-24 22:25 사장님 ㄱㄱ: '라인 모름 N호' · 'N호 · 라인 N개' 를 뺐다(위 머리와 중복 · 격자에 보임) — 범례만 */''}${nHo ? '' : gapCell('', 'SCOPE', '호는 전유부를 받아야 나옵니다') + ' '}
      ${byPrice
        ? `<span class="fg-k p1"></span>낮음 <span class="fg-k p2"></span><span class="fg-k p3"></span>
           <span class="fg-k p4"></span><span class="fg-k p5"></span>높음
           <span class="fg-k p0" title="색 = 공시가격 · 단지 안 5분위"></span>가격 없음${
           ''}`
        : `<span class="fg-k f-home"></span>주거 <span class="fg-k f-shop"></span>근린·업무
           <span class="fg-k f-park"></span>주차 <span class="fg-k f-etc"></span>기타.`}</p></div>`;
}

/* 2026-10-23 사장님 "평면도는 그냥 다 빼줘" — 층 평면 모식도(floorPlan) · 평형별 평면도 그림(public/floorplans) 을 지웠다. */
/* ---------------- 동 구성 (단지 -> 동 -> 호) ----------------
   세 축을 한 섹션에 **3단계로 쌓는다.** 2026-10-17 에 합쳤다.

   전에는 입면 / 동x층 격자 / 동x층x호 가 따로 있었다. 그런데
   **입면과 격자는 축이 같다**(가로=동, 세로=층). 입면은 격자의 요약이고,
   입면을 먼저 만든 것은 그때 층별개요가 없어서였다. 둘은 대체가 아니라
   **폴백 관계**다 — 층별개요가 있으면 격자, 없으면 입면.
   (입면은 표제부만 있으면 되므로 훨씬 넓은 범위에서 동작한다)

   호는 축이 다르다(가로=라인). 같은 평면에 못 올리므로 **드릴다운**으로 둔다.
   위 단계에서 동을 누르면 그 동의 호 배치가 아래에 펼쳐진다.

   ★ 합치면서 **단계별 출처는 유지한다.** 세 축이 각각 표제부 / 층별개요 /
     전유부에서 오고 적재 범위가 다르다. 한 덩어리로 보이면 "무엇이 없어서
     무엇이 안 보이는지" 가 흐려진다 — 오늘 만든 빈칸 어휘가 거기서 깎인다. */
function structureBlock(dongs, floors, hos, scope, hoTotal) {
  const real = (dongs || []).filter(d => !d.is_recap);
  if (!real.length && !(floors || []).length && !(hos || []).length) return '';

  /* 선택된 동. 키는 표제부 PK — 세 축이 공유하는 코드다(이름이 아니다). */
  let sel = hoDong;
  if (!sel) {
    const cnt = new Map();
    for (const h of hos || []) cnt.set(h.동PK, (cnt.get(h.동PK) || 0) + 1);
    sel = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
       || real.slice().sort((a, b) => (b.hhld_cnt || 0) - (a.hhld_cnt || 0))[0]?.mgm_bldrgst_pk
       || null;
  }

  const nHo = (hos || []).length;
  /* ★ 상한에 걸려 잘렸으면 **말한다** (2026-10-18).
     전에는 TOP 4000 이 말없이 잘랐다 — 한신,한진아파트가 4,851호인데
     격자는 4000만 그려 놓고 "이게 전부" 인 얼굴을 하고 있었다.
     잘린 화면은 틀린 화면보다 고약하다. 틀린 값은 의심이라도 받는데
     잘린 값은 **그럴듯해서** 아무도 안 본다. 동별 호수도 평형 칩의 수도
     여기서 같이 어긋난다. */
  const cut = hoTotal && nHo && hoTotal > nHo
    ? `<p class="note sm">${fmt(hoTotal)}호 중 ${fmt(nHo)}호만 받음 ${gapCell('', 'SCOPE', '격자에 안 보이는 호가 있습니다 — 동별 호수 · 평형 수가 그만큼 모자랍니다')}</p>` : '';
  const nFlr = new Set((floors || []).map(f => Number(f.층))).size;
  const meta = [`${fmt(real.length)}동`, nFlr ? `${fmt(nFlr)}층` : '',
                nHo ? (hoTotal && hoTotal > nHo ? `${fmt(nHo)}/${fmt(hoTotal)}호` : `${fmt(nHo)}호`) : '']
                 .filter(Boolean).join(' · ');

  /* ---- 동 고르기 (2026-10-18) ----
     격자가 한 동만 그리게 바뀌었으므로, **무엇을 보고 있는지와 무엇을 더 볼 수
     있는지**를 이 줄이 들고 있어야 한다. 동마다 층·호·공시 중앙값을 같이 적는다 —
     이름만 있으면 어느 동을 눌러야 할지 고를 근거가 없다.
     ★ 호가 없는 동(상가·관리동)도 **지운다 하지 않고 띄운다.** 비는 것과
       없는 것은 다르다 — 눌러 보면 격자가 그 사유를 말한다. */
  const dongStat = new Map();
  for (const d of real) dongStat.set(d.mgm_bldrgst_pk,
      { nm: (d.dong_nm || d.bld_nm || '').trim() || '—', ho: 0, flr: new Set(), prc: [] });
  for (const h of hos || []) {
    const s = dongStat.get(h.동PK); if (!s) continue;
    s.ho++; s.flr.add(Number(h.층));
    if (h.공시가격) s.prc.push(Number(h.공시가격));
  }
  for (const f of floors || []) {
    const s = dongStat.get(f.mgm_bldrgst_pk); if (s) s.flr.add(Number(f.층));
  }
  /* (med 와 s.prc 는 동 칩의 금액을 뗀 2026-10-19 이후 쓰이지 않는다.
      지우지 않고 둔다 - 동별 공시가격을 '공시가격' 이라고 **제대로 이름 붙여**
      다시 보여줄 자리가 생기면 그때 쓴다. 지금 쓰지 않는다는 사실만 적어 둔다.) */
  const med = a => { if (!a.length) return null;
    const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  /* ★ 동 칩에 **금액을 적지 않는다**(2026-10-19).
     여기 있던 값은 그 동 호들의 **공시가격 중앙값**이었는데, 억 단위로 찍히니
     화면에서는 '이 동의 실거래가' 로 읽힌다. 실제로 그렇게 읽혔다.
     게다가 실거래는 **동을 특정할 수 없다** - 아파트 매매 말고는 API 에
     동 정보가 아예 없다(../Teomoony/CONTEXT.md 4절). 그러니 동 옆의 금액은
     무엇으로 읽히든 틀린다. 동을 고르는 데 필요한 건 규모(층·호)뿐이다. */
  /* 2026-10-24 22:17 사장님 "동은 이름만 · 단추 하나를 누르면 동들이 쫙 나오고, 동을 누르면 그 동 정보가 밑에" —
     칩에서 층 · 호를 뺐다. 평소엔 **고른 동 단추 하나**만 보이고, 누르면 동 목록이 펼쳐진다. 동을 고르면 다시 접힌다.
     22:27 사장님 "'동 선택' 을 누르면 동들이 밑으로 나오고 하나를 고르는 방향" — 선택 상자 모양(작게) · 목록은 단추 **밑에 떠서** 화면을 밀지 않는다. */
  const selNm = (dongStat.get(sel) || {}).nm || '—';
  const picker = real.length > 1 ? `<div class="dsel">
      <button type="button" class="dtog" data-dong-toggle aria-expanded="false" aria-haspopup="listbox"><span class="muted">동 선택</span> <b>${esc(selNm)}</b> <span class="dcaret">▾</span></button>
      <div class="dpick" role="tablist" hidden>${
      real.map(d => { const pk = d.mgm_bldrgst_pk, s = dongStat.get(pk) || {};
        return `<button type="button" class="dchip" role="tab" data-ho-dong="${esc(String(pk))}"
                 aria-selected="${pk === sel}">${esc(s.nm || '—')}</button>`;
      }).join('')}</div></div>` : '';

  /* ---- 평형 고르기 (2026-10-18) ----
     전유공용면적을 올리면서 **호마다 전용면적이 생겼다.** 전에는 평형이
     실거래에만 있는 축이라 이 격자에 걸 수 없었다(그 주석도 같이 고쳤다).
     수를 세는 범위는 **지금 보고 있는 동**이다 — 단지 전체로 세면 칩의 숫자와
     눈앞의 격자가 안 맞는다. */
  const hoSel = (hos || []).filter(h => h.동PK === sel);
  const aCnt = new Map();     // 평형 -> 호수
  const aEx  = new Map();     // 평형 -> Map(정확면적 -> 호수)
  for (const h of hoSel) if (h.평형 != null) {
    const g = String(h.평형);
    aCnt.set(g, (aCnt.get(g) || 0) + 1);
    if (!aEx.has(g)) aEx.set(g, new Map());
    const v = h.전용면적 != null ? Number(h.전용면적).toFixed(2) : null;
    if (v) aEx.get(g).set(v, (aEx.get(g).get(v) || 0) + 1);
  }
  const aKeys = [...aCnt.keys()].sort((a, b) => Number(a) - Number(b));
  /* 타입이 하나뿐이면 칩에 **정확한 면적**을 적는다(`36.14㎡`). 여럿이면
     평형으로 적고(`84㎡`) 눌렀을 때 2단으로 펼친다. 처음부터 다 펼치면
     DMC 롯데캐슬 같은 데서 칩이 마흔 개가 넘는다. */
  const aLabel = k => { const ex = aEx.get(k);
    return ex && ex.size === 1 ? `${[...ex.keys()][0]}㎡` : `${k}㎡`; };
  /* ★ 동을 바꿨는데 그 평형이 없으면 **조용히 전체로 되돌리지 않는다.**
     되돌리면 "내가 고른 게 왜 풀렸지" 가 되고, 그대로 걸면 격자가 통째로
     흐려진다. 그래서 선택은 두고 **왜 안 걸렸는지 적는다.** */
  /* ★ 평형이 하나뿐인 동에서도 타입 줄은 떠야 한다 (화면에서 잡음).
     511동은 전부 84㎡ 라 1단 칩이 안 뜨고(고를 게 없다), 그래서 2단도 안 떠서
     **84.98(44호) + 84.94(12호) 가 갈린다는 사실이 통째로 숨었다.**
     고를 게 없는 것과 볼 게 없는 것은 다르다. 평형이 하나면 그게 고른 것이다. */
  const gSel = hoArea || (aKeys.length === 1 ? aKeys[0] : null);
  const exMap = gSel ? (aEx.get(gSel) || new Map()) : new Map();
  if (hoAreaX && !exMap.has(hoAreaX)) hoAreaX = null;
  const areaOn = (hoArea && aCnt.has(hoArea)) ? { g: hoArea, x: hoAreaX }
               : (gSel && hoAreaX)            ? { g: gSel, x: hoAreaX } : null;
  const apick = aKeys.length > 1 ? `<div class="apick" role="tablist">
      <button type="button" class="achip" data-ho-area=""
        aria-selected="${!hoArea}">전체</button>${
      aKeys.map(k => `<button type="button" class="achip" data-ho-area="${esc(k)}"
        aria-selected="${hoArea === k}">${esc(aLabel(k))}<b>${fmt(aCnt.get(k))}</b>${
        (aEx.get(k) || new Map()).size > 1
          ? `<em title="이 평형에 전용면적이 다른 타입이 ${(aEx.get(k)).size}개 있습니다">${
              (aEx.get(k)).size}타입</em>` : ''}</button>`).join('')
      }</div>` : '';
  /* 2단: 고른 평형 안의 타입. 면적이 실제로 갈릴 때만 뜬다. */
  const xpick = exMap.size > 1 ? `<div class="apick apick2" role="tablist">
      <button type="button" class="achip" data-ho-ax=""
        aria-selected="${!hoAreaX}">${esc(gSel)}㎡ 전부</button>${
      [...exMap.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
        .map(([v, n]) => `<button type="button" class="achip" data-ho-ax="${esc(v)}"
          aria-selected="${hoAreaX === v}">${esc(v)}㎡<b>${fmt(n)}</b></button>`).join('')
      }</div>` : '';
  /* 어휘 주의: EMPTY 가 아니라 **NA** 다. 원본에 값이 빠진 게 아니라
     이 동에 그 평형이 '해당 없음' 이다 — 화면에서 보고 고쳤다(2026-10-18). */
  const aMiss = hoArea && !aCnt.has(hoArea)
    ? `<p class="note">${gapCell('', 'NA',
        `이 동에는 ${hoArea}㎡ 호가 없습니다 — 격자는 전체를 띄웠습니다`)}</p>` : '';
  /* 호는 있는데 전용면적이 하나도 없으면 그 사유를 적는다. 평형 칩이 안 뜨는
     것과 '이 동엔 평형이 하나뿐' 인 것은 다르다. */
  const aNone = hoSel.length && !aKeys.length
    ? `<p class="note">${gapCell('', 'SCOPE',
        '이 법정동의 전유공용면적을 아직 받아오지 않았습니다 — 평형은 그 축에서 옵니다')}</p>` : '';

  /* 격자 한 장으로 끝난다. 층·호가 둘 다 없으면 입면으로 내려간다.
     입면은 단지 전체를 한 장에 그리므로 동 선택과 무관하다. */
  const grid = gridBlock(real, floors, hos, scope, sel, areaOn);
  /* 2026-10-24 22:17: 고른 동의 정보(대장 표제부)를 단추 바로 밑에 — 전엔 맨 아래 '동' 표에 30줄이 다 있었다(중복 · 압축) */
  const 고른동 = real.find(d => d.mgm_bldrgst_pk === sel);
  const 동정보 = 고른동 ? `<dl class="dinfo">${[
      ['용도', esc(고른동.main_purps_nm || 고른동.regstr_kind_nm || '')],
      ['세대', 고른동.hhld_cnt ? fmt(고른동.hhld_cnt) + '세대' : ''],
      ['층', [고른동.grnd_flr_cnt ? `지상 ${fmt(고른동.grnd_flr_cnt)}층` : '', 고른동.ugrnd_flr_cnt ? `지하 ${fmt(고른동.ugrnd_flr_cnt)}층` : ''].filter(Boolean).join(' · ')],
      ['연면적', 고른동.tot_area ? fmt(Math.round(고른동.tot_area)) + '㎡' : ''],
      ['구조', esc(고른동.strct_nm || '')],
      ['사용승인', 고른동.use_apr_day ? 날짜(고른동.use_apr_day) : ''],
      ['위반건축물', 고른동.위반 === 'Y' ? '<span class="pill r">위반건축물 표시</span>' : ''],
    ].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '';
  const body = grid ? picker + 동정보 + apick + xpick + aMiss + aNone + grid

                    : elevationBlock(real, sel);

  /* 호가 없을 때만 그 사유를 적는다 — 격자는 이미 떠 있으므로 섹션이 비지 않는다 */
  const noHo = !(hos || []).length && scope && Number(scope.가상) === 1
    ? `<p class="note"><span class="gapw">호 없음 · 사용승인 전</span> 호(전유부)는 사용승인 뒤 건축물대장이 생기면 채워집니다. 위 동 · 층은 허가(설계) 원문입니다.</p>`
    : !(hos || []).length
    ? `<p class="note">${gapCell('', (scope && Number(scope.전유부) === 1) ? 'EMPTY' : 'SCOPE',
        (scope && Number(scope.전유부) === 1)
          ? '이 단지의 동에 전유부(호)가 없습니다 — 집합건축물이 아닐 수 있습니다'
          : '이 법정동의 전유부를 아직 받아오지 않았습니다. 호·라인은 그 축에서 옵니다')}</p>`
    : '';

  return sect('동 구성', 'bld', ` ${meta}`) + `<div class="struct">${cut}${body}${noHo}</div>`;
}

/* ---------------- 호 하나의 상세 (격자 칸 클릭) ----------------
   ★ 왜 띄우나
     격자는 **모양을 보는 그림**이라 칸에 글자를 안 쓴다(1,000칸이면 못 읽는다).
     그래서 숫자는 툴팁에만 있었는데, 툴팁은 (1) 마우스를 올려야 보이고
     (2) 한 줄씩만 보이고 (3) **공시가격을 한 회차만** 보여준다.
     DB 에는 회차가 다 있다 — 돈암동은 호당 19회차다. 그게 지금 화면
     어디에도 안 나온다. 누르면 그걸 연다.

   ★ 전용면적은 못 적는다
     전유공용면적을 적재하지 않기로 했으므로(README 12장) 호 면적이 DB 에 없다.
     층별개요의 **층 면적**을 대신 적되 '층 전체' 라고 못박는다. 호 면적인 척하면
     5라인짜리에서 5배 틀린 숫자를 사실처럼 보여주게 된다. */
async function openHo(pk) {
  const el = $('#homodal');
  el.innerHTML = `<div class="hm-box"><div class="hm-h">불러오는 중…</div></div>`;
  el.classList.add('on');
  let d;
  try {
    const r = await fetch(`/api/ho/${encodeURIComponent(pk)}`);
    if (!r.ok) {
      if (r.status === 404) throw new Error('이 호를 찾지 못했습니다');
      const j = await r.json().catch(() => ({ _상태: r.status, _번호: r.headers.get('X-Request-Id') }));
      el.classList.remove('on');
      오류카드({ 무엇: '호 상세', 응답: j, 단지코드: selected, 다시: () => openHo(pk) });
      return;
    }
    d = await r.json();
  } catch (e) {
    el.innerHTML = `<div class="hm-box"><div class="hm-h">호 상세
      <button type="button" class="hm-x" data-ho-close>닫기</button></div>
      <p class="note">${esc(e.message || '불러오지 못했습니다')}</p></div>`;
    return;
  }
  const h = d.ho || {}, ps = d.prices || [], fs = d.floor || [];
  const ar = d.area || [], priv = d.priv || null;
  /* 1 전유 / 2 공용. 공용은 용도별로 여러 줄이 온다(2026-10-18 개정).
     전에는 합계 한 줄만 받아 `전용률 45.3%` 를 적었는데, 그 이름이 틀렸다.
     전유/(전유+공용전부) 는 **계약면적 기준**이고, 사람이 아는 전용률은
     공급(분양)면적 기준이다 — 분모가 다른 수치를 같은 이름으로 부른 삼이었다.
     공급면적을 가르려면 주거공용·기타공용 구분이 필요하고, 그 필드가
     **원본에 없다**. 용도명으로 찍었다가 산식에 묻으면 지금과 똑같은 삼을
     다시 밟는다. 그래서 **분류하지 않고 용도를 그대로 보여주고**, 비율은
     계약면적 기준이라고 이름에 집어넣는다. */
  const sumA = rs => rs.reduce((t, x) => t + Number(x.면적 || 0), 0);
  const aOf = cd => ar.filter(x => String(x.구분) === cd);
  const pvs = aOf('1'), pbs = aOf('2');
  const pv = pvs.length ? { 면적: sumA(pvs), 행: pvs.length } : null;
  const pb = pbs.length ? { 면적: sumA(pbs), 행: pbs.length } : null;
  const py = a => (Number(a) / 3.3058).toFixed(1);
  const yr = s => String(s || '').slice(0, 4);

  /* 회차별 추이. 바로 앞 회차와의 차이를 같이 적는다 — 금액만 나열하면
     '올랐나 내렸나' 를 사람이 암산해야 한다. */
  /* ★ 날짜 둘의 뜻이 다르다 (2026-10-18 실측).
       std_day(기준일)  = **전부 YYYY0101** 이다. 공시기준일이 1월 1일이라
                          연도 말고는 아무 정보가 없다 — 매 줄 '01.01' 은 소음이다.
       crtn_day(생성일) = 실제로 공시된 날. 같은 기준일에 회차가 둘 오는 것도
                          (결정공시 -> 조정공시, 27_hsprc.sql) 이 값으로만 갈린다.
     그래서 **연도는 기준일에서, 일자는 생성일에서** 가져와 항상 같이 적는다.
     겹칠 때만 적으면 "왜 어떤 줄만 날짜가 있지" 가 된다. */
  const dupYear = new Set();
  { const seen = new Set();
    for (const p of ps) { const y = yr(p.std_day);
      if (seen.has(y)) dupYear.add(y); else seen.add(y); } }
  const rows = ps.map((p, i) => {
    const prev = ps[i + 1];
    const diff = prev && prev.hsprc ? (p.hsprc - prev.hsprc) / prev.hsprc : null;
    const w = ps[0] && ps[0].hsprc ? Math.max(2, Math.round(p.hsprc / ps[0].hsprc * 100)) : 0;
    const y = yr(p.std_day);
    const cd = String(p.crtn_day || '');
    /* 309: NED(연립·다세대)는 공시일을 안 준다 — 대신 기준월이 1월이 아니면(6월 기준 등) 적는다 */
    const 기준월 = String(p.std_day || '').slice(4, 6);
    return `<tr><td>${esc(y)}${cd.length === 8
      ? `<span class="muted"> ${esc(cd.slice(4,6))}.${esc(cd.slice(6,8))}</span>`
      : (p.출처 === 'NED' && 기준월 && 기준월 !== '01' ? `<span class="muted"> ${esc(기준월)}월 기준</span>` : '')}</td>
      <td class="n">${eok(p.hsprc)}</td>
      <td class="n">${diff == null ? '' :
        `<span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%</span>`}</td>
      <td class="hm-bar"><i style="width:${w}%"></i></td></tr>`;
  }).join('');
  const NED이력 = ps.some(p => p.출처 === 'NED');
  const dupNote = NED이력
    ? ``
    : ``;

  const where = [h.동, h.라인 != null ? `${String(h.라인).padStart(2, '0')}라인` : null,
                 h.층 != null ? `${h.층 < 0 ? `지하${-h.층}` : h.층}층` : null,
                 /* `호` 는 호명칭이라 이미 '호' 가 붙어 있다(예: '1703호').
                    붙이면 '1703호호' 가 된다 — 화면에서 잡았다(2026-10-18). */
                 h.호 || null].filter(Boolean).join(' · ');

  el.innerHTML = `<div class="hm-box">
    <div class="hm-h">${esc(h.complex_nm || '')} <span>${esc(where)}</span>
      <button type="button" class="hm-x" data-ho-close>닫기</button></div>
    <p class="hm-addr">${esc(h.rep_plat_plc || '')}</p>
    ${ps.length ? `<div class="hm-s">공시가격 <b>${eok(ps[0].hsprc)}</b>
        <span class="muted">${esc(yr(ps[0].std_day))}년 · ${fmt(ps.length)}회차</span>
        ${h.단지분위 ? `<span class="pill">단지 ${h.단지분위}/5</span>` : ''}
        ${h.라인분위 ? `<span class="pill">라인 ${h.라인분위}/5</span>` : ''}</div>
      <table class="hm-t"><thead><tr><th>기준 · 공시일</th><th class="n">공시가격</th>
        <th class="n">전회 대비</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${dupNote}
      `
    : `<p class="note">${gapCell('', 'SCOPE',
        '이 호의 주택가격을 아직 받아오지 않았습니다')}</p>`}
    ${pv ? `<div class="hm-s2"><b>${Number(pv.면적).toFixed(2)}㎡</b>
        <span class="muted">전용 ${py(pv.면적)}평</span>
        ${pvs.length === 1 && priv && priv.용도
            ? `<span class="pill">${esc(priv.용도)}</span>` : ''}</div>` : ''}
    <div class="hm-f">
      <div class="hm-k">전용면적</div>
      <div class="hm-v">${pv
        /* ★ 전유도 여러 줄일 수 있다 (2026-10-18 실측).
           은평+장위에서 3,856호가 그렇다 - 복층 1,898(층만 다름) /
           구조 다름 1,119 / 용도 다름 173(상가 한 호에 미용원·음식점·중개·소매점).
           **버그가 아니라 실제 모습**이고, 자연키가 그 구분을 지켜낸 것이다.
           합계만 띄우고 용도를 제일 큰 것 하나로 적으면 나머지가 사라진다. */
        ? `${Number(pv.면적).toFixed(2)} ㎡ <span class="muted">(${py(pv.면적)}평)</span>${
            pvs.length === 1 && priv && priv.구조
              ? `<span class="muted"> · ${esc(priv.구조)}</span>` : ''}${
            pvs.length > 1
              ? `<table class="hm-a"><tbody>${pvs.map(x => `<tr>
                   <td>${esc(x.용도 || '—')}</td>
                   <td class="hm-a2">${esc(x.세부 || '')}</td>
                   <td class="n">${Number(x.면적).toFixed(2)}㎡</td></tr>`).join('')}</tbody></table>
                 <span class="muted">${fmt(pvs.length)}줄입니다 — 복층이거나 한 호에
                   용도가 여럿입니다</span>` : ''}`
        : gapCell('', 'SCOPE', '이 법정동의 전유공용면적을 아직 받아오지 않았습니다')}</div>
      <div class="hm-k">공용면적</div>
      <div class="hm-v">${pb
        /* ⚠ 과소일 수 있다 — collapse 가 페이지 단위라 같은 자연키가 경계를
           넘으면 뒤가 앞을 덮는다(장위+수색 실측 2.8%). 전유는 호당 1행이라
           영향이 없다. **모르는 것을 모른다고 적는다.** */
        ? `<b>${Number(pb.면적).toFixed(2)} ㎡</b>
           <table class="hm-a"><tbody>${pbs.map(x => `<tr>
             <td>${esc(x.용도 || '—')}</td>
             <td class="hm-a2">${esc(x.세부 || '')}</td>
             <td class="n">${Number(x.면적).toFixed(2)}㎡</td></tr>`).join('')}</tbody></table>
           <span class="muted">합계가 과소일 수 있습니다 — 적재 방식 한계입니다</span>`
        : pv ? gapCell('', 'EMPTY', '이 호에 공용 항목이 없습니다')
             : gapCell('', 'SCOPE', '아직 받아오지 않았습니다')}</div>
      ${pv && pb ? `<div class="hm-k">계약면적</div>
        <div class="hm-v">${(Number(pv.면적) + Number(pb.면적)).toFixed(2)} ㎡
          <span class="muted">(${py(Number(pv.면적) + Number(pb.면적))}평) · 이 중 전유가
          ${(pv.면적 / (Number(pv.면적) + Number(pb.면적)) * 100).toFixed(1)}%</span>
          </div>` : ''}
      ${fs.length ? `<div class="hm-k">이 층 전체</div><div class="hm-v">${
        fs.map(f => `${esc(f.용도 || '—')} ${fmt(Math.round(f.면적 || 0))}㎡${
          f.구획수 ? ` · ${fmt(f.구획수)}구획` : ''}`).join('<br>')
      }<span class="muted"> — 호가 아니라 층 전체입니다</span></div>` : ''}
    </div>
    ${호이어서(pv)}</div>`;
}

/* ---------------- 호에서 이어서 보기 (2026-10-23 사장님 원칙: 중복 데이터 없고 · 연계된 데이터를 보기 좋게 · 틀린 데이터 없고) ----------------
   ★ 처음엔 호 상세 안에 그 동 표제부 · 같은 평형 실거래 · 정비구역을 **다시 적었다** — 전부 다른 칸에 이미 있는 값이라 중복이었다.
   ★ 그래서 숫자를 다시 적지 않고 **그 칸으로 가는 길**만 둔다: 이 호의 전용면적 묶음(㎡ 정수 = 실거래 탭 평형 칩과 같은 키)으로 걸러진 실거래 탭 ·
     단지가 걸친 정비구역 칸. 갈 곳이 없으면(그 평형 거래가 없으면) 길도 안 보인다. */
function 호이어서(pv) {
  const d = lastDetail || {};
  const g = pv && pv.면적 != null ? String(Math.floor(Number(pv.면적))) : null;
  const 평형거래 = g == null ? 0 : (d.tradeStats || []).filter(r => r.area_grp != null && String(r.area_grp) === g && (!r.area_src || r.area_src === '전용'))
    .reduce((t, r) => t + (Number(r.cnt) || 0), 0);
  const 길 = [];
  if (평형거래) 길.push(`<button type="button" class="achip" data-hogo="price" data-area="${esc(g)}">이 평형 실거래 <b>${fmt(평형거래)}</b> <span class="muted">전용 ${esc(g)}㎡대</span></button>`);
  if ((d.redev || []).length) 길.push(`<button type="button" class="achip" data-hogo="land">정비구역 <b>${fmt(d.redev.length)}</b></button>`);
  return 길.length ? `<div class="hm-go"><span class="muted">이어서 보기</span>${길.join('')}</div>` : '';
}
document.addEventListener('click', e => {
  const b = e.target.closest('#homodal [data-hogo]');
  if (!b || !lastDetail) return;
  $('#homodal').classList.remove('on');
  detailTab = b.dataset.hogo;
  if (detailTab === 'price') { tradeArea = b.dataset.area || null; 거래Shown = 10; }
  renderDetail(lastDetail);
  setTimeout(() => {
    const t = document.querySelector(detailTab === 'land' ? '#detail [data-redev], #detail .rdv' : '#detail .apick');
    if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 300);
});

/* 동 이름을 뽑는 **단 하나의 규칙**. 대장에 이름이 세 칸으로 흩어져 있고
   단지마다 채워진 칸이 다르다(269 는 bld_nm 만, 다른 곳은 dong_nm 만).
   ★ 격자와 공시가격 추이가 **같은 이름**을 써야 한다 — 두 군데서 따로 고르면 갈라진다. */
function 동이름(d) {
  return ((d && (d.dong_nm || d.bld_nm || d.basis_nm)) || '').trim();
}

/* ---------------- 해제(취소)된 실거래 — 어디에 두기로 했나 (2026-10-21) ----------------
   사장님 제안으로 시작해 **세 번 자리를 옮긴 끝에** 여기로 정했다. 기록해 둔다.

   ① 평형 줄 안, 꼬리표 아래 → 범위·전용·직거래를 다 지나야 나와 **각주처럼 묻혔다.**
   ② 평형 줄 안, 금액 바로 아래 → 유효 금액은 오른쪽 열에 정렬돼 있는데 취소만
      왼쪽에 떠서 **세로 비교가 안 됐다.**
   ③ 평형 줄과 같은 그리드의 형제 줄 → 금액은 맞았지만, 평형 집계 줄 옆에 한 건만
      얹히는 모양이라 여전히 어색했다.
   → ★★ 진짜 원인: 실거래 탭에 **건별 목록이 아예 없었다.** 평형별 집계뿐이라
     "취소를 사이에 끼울 줄" 자체가 없었던 것이다. **없는 것을 고치려 하지 말고
     만든다** — `tradeList()` 를 새로 만들고, 날짜순 제자리에 두었다.

   지금 구조:
     · 건별 '거래 내역' 목록  — 해제 건이 **날짜순 제자리에**, 취소선 + 연한 색 + '해제'
     · 평형별 집계 줄의 꼬리표 — **개수만**(`해제 N`). 목록은 최근 120건만 받으므로
       오래된 해제는 거기 안 잡힌다. 개수까지 빼면 그 존재가 사라진다.
     · 집계 숫자(건수·범위·최근) — **여전히 유효 거래만.** 보여주는 것과 세는 것은 다르다. */
/* ---------------- 건별 거래 목록 (2026-10-21, 사장님 요청) ----------------
   사장님: "실거래는 일자를 기준으로 정렬해서 보여주여야하기때문에 …
            라이브1 / 취소 / 라이브2 / 라이브3 … 이런 형태가 더 좋다"

   ★ 그 전까지 실거래 탭에는 **건별 목록이 없었다.** 평형별 집계(한 줄에 최근 1건 +
     건수)뿐이라 취소 건을 "사이에 끼울" 줄 자체가 없었고, 그래서 취소를 집계 줄
     옆에 덧붙이는 모양이 됐다 — 두 번 고쳤지만 둘 다 어색했던 이유가 이것이다.
     **없는 것을 고치려 하지 말고 만든다.**

   ★★ 취소 건을 빼지 않고 **날짜순 제자리에** 둔다. 그 날 그 신고가 있었던 것은
     사실이고, 빼면 "이 사이에 뭐가 있었나" 를 영영 모른다.
     ⚠ 다만 **집계(건수·범위·최근)에는 여전히 안 들어간다** — 보여주는 것과 세는 것은
       다르다. 위 평형 집계는 전부 유효 거래다.
   ★ 취소 줄은 **취소선 + 연한 색 + '해제' 꼬리표** 셋을 다 쓴다. 날짜순으로 섞여
     있을수록 유효 거래로 오해하기 쉬워서, 섞을수록 표시는 더 분명해야 한다.

   ★ 동·호는 **없다.** 실거래 원본에 안 온다(정책 4장) — 날짜·금액·층·면적뿐이다.
   ★ 자르는 곳마다 "몇 중 몇": 서버가 종류별 120건을 주고 화면은 10줄씩 펼친다.
     평형을 고르면 그 평형만 거르고, 그 수를 다시 적는다. */
function tradeList(rows, 거래탭, 평형) {
  const 종 = r => r.전월세 ? (r.월세냐 ? '월세' : '전세') : '매매';
  const 종R = (rows || []).filter(r => 종(r) === 거래탭);
  if (!종R.length) return '';
  /* ★ 분모를 **지어내지 않는다.** 서버의 `전체` 는 그 **종류 전체**의 건수다.
     평형을 고르면 그 평형의 전체 건수는 **우리가 모른다**(서버가 종류별 120건만 줬다).
     그때 종류 전체를 분모로 쓰면 "매매 2,105건 중 12건" 이 되어 거짓이 된다.
     그래서 평형을 고른 경우에는 **받은 것 안에서** 센다고 적는다. */
  const 전체종류 = Number(종R[0].전체) || 종R.length;
  const R = (평형 == null || 평형 === '') ? 종R : 종R.filter(r => {
    const k = r.평형 == null ? '' : String(r.평형) + (r.면적칸 && r.면적칸 !== '전용' ? '|' + r.면적칸 : '');
    return k === 평형;
  });
  if (!R.length) return '';
  const 받은 = R.length;
  const 보임 = Math.max(1, Math.min(거래Shown, 받은));
  const 돈 = r => r.전월세
    /* 2026-10-23: 월세 원본(monthly_rent)은 **원** 단위다 — '/ 6,000,000만' 으로 보이던 것(만 원으로 바꿔 적는다) */
    ? (r.월세냐 ? `${eok(r.보증금)} / ${fmt(Math.round(Number(r.월세) / 10000))}만` : eok(r.보증금))
    : eok(r.금액);

  const 줄 = R.slice(0, 보임).map((r, i, a) => {
    /* 316: 매매 다음에 오는 준공 전 분양권·입주권 앞에 한 줄 — 날짜가 건너뛰는 것을 '그 사이 거래 없음' 으로 읽지 않게 */
    /* 2026-10-23: 날짜순으로 섞는다(준공 뒤 등기 전 입주권도 있다) — 칸막이는 없앴다. 줄마다 '입주권·분양권' 꼬리표 */
    const 칸막이 = '';
    const 꼬 = [];
    if (r.분양권) 꼬.push(r.분양권);
    if (r.직거래) 꼬.push('직거래');
    if (r.갱신) 꼬.push('갱신');
    const 면 = r.평형 == null ? '면적 미상'
      : `${r.면적칸 && r.면적칸 !== '전용' ? r.면적칸 + ' ' : ''}${r.평형}㎡`;
    const 층 = r.층 ? `${r.층}층` : '';
    return 칸막이 + `<div class="trow${r.취소 ? ' canc' : ''}${r.분양권 ? ' silv' : ''}"${r.근거 ? ` title="${esc(r.분양권)} — 국토부에 권리 거래로 신고된 것(아파트 등기 전) · 이은 근거: ${esc(r.근거)}"` : ''}>
      <div class="td">${esc(ymd(r.날짜))}</div>
      <div class="tm">${r.취소 ? `<s>${돈(r)}</s>` : 돈(r)}</div>
      <div class="tx">${esc([면, 층].filter(Boolean).join(' · '))}${
        꼬.length ? ` <span class="muted">· ${esc(꼬.join(' · '))}</span>` : ''}${
        r.취소 ? ` <span class="tcx">${용어('해제')}</span>` : ''}</div>
    </div>`;
  }).join('');

  const 더 = 보임 < 받은
    ? `<button type="button" class="moreb" data-trade-more="1">10건 더보기
         <span class="muted">(${fmt(보임)} / ${fmt(받은)})</span></button>` : '';
  const 받은본 = R.filter(r => !r.분양권).length;   // 316: '몇 중 몇' 은 매매만 — 섞인 분양권·입주권은 따로 적는다
  const 잘림 = (평형 == null || 평형 === '')
    ? (전체종류 > 받은본
        /* ★ 2026-10-21 QA: 이 '전체' 는 **해제 포함**이다(목록은 해제도 제자리에 둔다). 바로 위 탭·평형 카드의
           건수는 해제를 뺀 수라 '매매 1,429' 옆에 '1,443건 중' 이 떠서 어긋나 보였다 - 그 말을 적는다. */
        ? `<p class="srcline">${esc(거래탭)} ${fmt(전체종류)}건(해제 포함) 중 최근 ${fmt(받은본)}건</p>` : '')
    : `<p class="srcline">최근 ${fmt(종R.length)}건 중 이 평형 ${fmt(받은)}건 · ${esc(거래탭)} 전체 ${fmt(전체종류)}건(해제 포함)</p>`;

  /* 316: 섞인 분양권·입주권 — 몇 건인지 · 집계에는 안 넣었다는 사실만(설명은 정책 화면) */
  const 분 = 거래탭 === '매매' ? Number(종R[0].분양권수) || 0 : 0;
  const 분줄 = 분 ? `<p class="srcline" title="평형 요약 · 최고가에는 안 넣음">분양권·입주권 ${fmt(분)}건 포함</p>` : '';
  /* 10-31 사장님 "필드명이 없으니까 각 숫자가 뭘 의미하는지 이해하기 힘들어 — 전세 매매 월세 전부": 칸 이름 줄(목록과 같은 열에 선다 · style.css subgrid) */
  const 금액칸 = 거래탭 === '월세' ? '보증금 / 월세' : 거래탭 === '전세' ? '보증금' : '거래가';
  const 머리 = `<div class="trow thd"><div class="td">계약일</div><div class="tm">${금액칸}</div><div class="tx">전용면적 · 층${거래탭 !== '매매' ? ' · 갱신 여부' : ''}</div></div>`;
  return sect('거래 내역', 'rtms', ` ${fmt(받은)}`)
    + ``
    + 잘림 + 분줄 + `<div class="tlist">${머리}${줄}</div>${더}`;
}

function dongLabel(d, total) {
  const nm = 동이름(d);
  if (nm) return esc(nm);
  return `<span class="muted">${total === 1 ? '단독' : '이름 없음'}</span>`;
}

/* K-apt(공동주택관리정보) — 관리비·전기차·지하철 같은 '사는 정보' 가 여기 있다.
   대장·실거래에는 없는 축이다.

   **추정 연결이다.** K-apt 의 PNU 를 믿을 수 없어(정책.md 3-7) 법정동 + 사용승인일로
   잇는다. 양쪽 모두 1:1 인 것만 쓴다 — 148개 중 42% 만 1:1 이고 36% 는 2개 이상에
   걸린다. 모호한 것은 아예 안 보여준다.

   단지 수로는 0.1% 지만 **세대 19% · 거래 18%** 다. 우리 단지의 절대다수가
   단독주택이라 단지 수 분모가 그걸 가린다.

   ★ 대조를 같이 보여준다. K-apt 와 대장은 같은 사실(세대·동수·최고층)을 각자 들고
   있다. 매칭이 맞으면 맞아떨어지고 틀리면 어긋난다. **어긋나면 경고를 띄운다** —
   추정이 틀렸을 때 조용히 틀리지 않게 하는 장치다. */
/* ---------------- 관리비 ----------------
   성북구 138단지 실측(2024.12)으로 정한 표시 규칙이다.

   1. **세대당으로만 보여준다.** 총액은 단지 크기를 재는 것이지 관리비를 재는 게
      아니다. 분모는 세대수(kaptdaCnt)다 — 호수(hoCnt)로 나누면 전 단지가
      조용히 틀린다(래미안퍼스트하이 호수 1,568 / 세대수 1,562).

   2. **혼자 두지 않는다.** "세대당 108,794원" 만 보면 비싼지 싼지 알 수 없다.
      같은 법정동 + **같은 분양임대 구분**의 다른 단지와 같이 보여준다.
      분양/임대를 안 가르고 비교하면 틀린다 — 임대 78,450 vs 분양 113,098원.

   3. **개별사용료는 비교에 쓰지 않는다.** 같은 이름의 항목에 단지마다 다른 게
      들어있다. 장위참누리는 세대 전기(electP)가 0 이고(한전 직공급), 장위동
      11단지는 난방이 전부 0 이다(개별난방). 그래서 `비교가능=0` 인 항목은
      금액만 적고 분위를 붙이지 않는다.

   4. **장충 잔액 0 은 "돈이 없다" 가 아니다.** 임대(25/25 전수)이거나 신축이다.
      뷰가 그 뜻을 `장충_잔액_상태` 로 내려보낸다. 0 을 그냥 0 으로 보여주면
      사용자가 틀리게 읽는다.

   5. **운영인력비중**을 쓴다(인건비+청소비+경비비+**위탁관리수수료**). 위탁관리
      단지는 급여가 0 이고 수수료에 묶여 오기 때문이다 — 길음서희스타힐스는
      사람값비중 27.3% 인데 위탁을 넣으면 81.6% 다. 다만 138개 중 1개뿐이라
      예외 표시(`급여없음`)로만 알린다. */
function costBlock(co, ctx) {
  /* 10-31 관리비 추이(K-apt 자료실 엑셀) 그릇 — 이어진 K-apt 코드가 있을 때만. API 관리비가 없는 단지는 이 그릇이 엑셀의 마지막 달을 대신 보인다 */
  const 추이 = ctx && ctx.kapt코드 ? `<div class="costhist" data-kapt="${esc(ctx.kapt코드)}" data-api="${co ? 1 : 0}"></div>` : '';
  return costBlock0(co, ctx) + 추이;
}
function costBlock0(co, ctx) {
  if (!co) {
    /* **빈칸은 '왜 없지' 를 남긴다** — 이 함수 아래쪽(값 없음)에는 그 원칙이
       지켜져 있었는데, 한 단계 앞인 '연결 실패' 만 설명 없이 사라지고 있었다.
       관리비 138단지 중 87개(63%)가 여기로 빠져 화면에 영영 안 나온다.

       세 가지를 가른다 — 셋 다 다른 얘기다.
       ① 150세대 미만: K-apt(의무관리대상 공동주택) 자체가 아니다. 단독주택이
          절대다수라 여기에 안내를 띄우면 전 단지가 잡음이 된다 -> 아무것도 안 띄운다
       ② 그 법정동에 K-apt 미적재: 종로구가 통째로 여기다
       ③ 적재는 됐는데 1:1 연결이 안 섬: 법정동+사용승인일이 겹치면 버린다
          (정책.md 4장 — 추측으로 메우지 않는다) */
    const hh = Number((ctx && ctx.hhld) || 0);
    if (hh < 150) return '';   // K-apt 대상이 아니다. 단독주택이 절대다수라 안내도 잡음이 된다
    const inLawd = Number((ctx && ctx.kapt) || 0);
    /* 2026-10-23: K-apt 가 **이어져 있는데** 관리비만 없으면 '연결이 확정되지 않았다' 는 틀린 말이다(관악드림타운) — 그 경우를 가른다 */
    if (ctx && ctx.이음) return sect('관리비', 'cost') + `<p class="note costnone">${Number(ctx.관리비구)
      ? gapCell('', 'UNSURE', '이 K-apt 단지의 관리비가 없습니다(공시 안 함인지 못 받음인지 모름)')
      : gapCell('', 'SCOPE', '이 구의 K-apt 관리비를 아직 받지 않았습니다')}</p>`;
    return sect('관리비', 'cost') + `<p class="note">${
      inLawd
        ? gapCell('', 'UNSURE',
            'K-apt 연결이 확정되지 않아 관리비를 붙이지 않았습니다(후보가 여럿)')
        : gapCell('', 'SCOPE',
            '이 법정동의 K-apt(공동주택관리정보)를 아직 받아오지 않았습니다.')
    }</p>`;
  }
  const L = co.latest || {}, P = co.peer || {};
  const r = [];
  const add = (k, v) => { if (v !== null && v !== undefined && v !== '') r.push(`<dt>${k}</dt><dd>${v}</dd>`); };
  const won = n => (n == null ? '—' : fmt(Math.round(n)) + '원');
  const ym = L.ym ? 날짜(L.ym) : '';

  if (!L.세대당) {
    /* 값이 없는 이유를 적는다. 빈칸은 "왜 없지" 를 남긴다. */
    return sect('관리비', 'cost', ym ? ` <span class="muted">${esc(ym)}</span>` : '') +
      `<p class="muted">공용관리비가 올라와 있지 않습니다.${
        L.사용승인 ? ` 사용승인 ${esc(String(L.사용승인).slice(0,4))}년 — 입주 전이면 관리비가 없습니다.` : ''}</p>`;
  }

  const n = Number(P.단지 || 0), cheaper = Number(P.나보다싼단지 || 0);
  add('세대당 공용관리비', `<b>${won(L.세대당)}</b> <span class="muted">/ 월</span>`);
  if (n > 1)
    add('같은 동네 비교', `${esc(P.기준 || '')} ${fmt(n)}단지 중 <b>${fmt(cheaper + 1)}번째로 비싸다</b>` +
      ` <span class="muted">(${won(P.최저)} ~ ${won(P.최고)} · 평균 ${won(P.평균)})</span>`);
  add('분양 / 임대', L.분양임대 ? esc(L.분양임대) : '');
  add('관리 방식', L.관리방식 ? esc(L.관리방식) : '');
  add('운영인력비중', L.운영인력비중 == null ? '' :
    `${Number(L.운영인력비중).toFixed(1)}%` +
    (L.급여없음 ? ` <span class="warnx">급여가 0이고 위탁수수료에 묶여 있습니다</span>` : '') +
    (L.위탁비중 > 5 ? ` <span class="muted">(위탁 ${Number(L.위탁비중).toFixed(1)}%)</span>` : ''));
  add('장기수선충당금', L.장충_잔액_상태 === '적립'
    ? `잔액 ${won(L.장충_잔액)} <span class="muted">· 세대당 ${won(L.장충_잔액_세대당)}` +
      `${L.장충_월부과 ? ` · 월 부과 ${won(L.장충_월부과)}` : ''}</span>`
    : `<span class="muted">${esc(L.장충_잔액_상태 || '—')}</span>`);

  /* 항목별 — 공용관리비만 분위 비교 대상이다. 개별사용료는 금액만 적는다. */
  const cmn = (co.items || []).filter(i => i.svc === 'CMN');
  const ind = (co.items || []).filter(i => i.svc === 'IND');
  const nm = i => esc(i.항목) + (i.세부 ? ` <span class="muted">${esc(i.세부)}</span>` : '');
  const tbl = (rows, cap) => !rows.length ? '' : `
    <div class="sub">${cap}</div>
    <table><thead><tr><th>항목</th><th class="n">세대당</th><th class="n">총액</th></tr></thead><tbody>
      ${rows.map(i => `<tr><td>${nm(i)}</td><td class="n">${won(i.세대당)}</td><td class="n">${won(i.amount)}</td></tr>`).join('')}
    </tbody></table>`;

  return sect('관리비', 'cost', ` <span class="muted">${esc(ym)}</span>`) +
    `<dl>${r.join('')}</dl>` +
    tbl(cmn, '공용관리비 — 단지 운영비. 단지 간 비교가 성립한다') +
    tbl(ind, '개별사용료 — 사용량 통과분. <b>단지 간 비교에 쓰지 않는다</b> (계약 형태가 단지마다 다르다)');
}

/* 10-31 사장님 "관리비도 엑셀로" · "ㄱㄱ" — K-apt 자료실 연도별 엑셀(2015 ~ · 주 1회)의 달별 세대당 공용관리비 추이.
   값 = 엑셀의 '공용관리비(합계)' ÷ 지금 K-apt 세대수. API 관리비가 없는 단지는 엑셀 마지막 달을 대신 보인다(출처를 적는다). */
const 관리비추이기억 = new Map();
async function 관리비추이채우기() {
  const box = document.querySelector('#detail .costhist');
  if (!box) return;
  const code = box.dataset.kapt;
  let r = 관리비추이기억.get(code);
  if (!r) {
    try { r = await fetch(`/api/kapt/${encodeURIComponent(code)}/cost-hist`).then(x => x.json()); } catch (e) { return; }
    if (!r || r.error) return;
    관리비추이기억.set(code, r);
  }
  const 지금 = document.querySelector('#detail .costhist');
  if (!지금 || 지금.dataset.kapt !== code) return;
  const 점 = (r.달 || []).filter(x => x.세대당 > 0);
  if (!점.length) return;
  const won = n => (n == null ? '—' : fmt(Math.round(n)) + '원');
  const ym = v => `${String(v).slice(0, 4)}.${String(v).slice(4, 6)}`;
  const 끝 = 점[점.length - 1];
  let 머리 = '';
  if (지금.dataset.api !== '1') {
    /* API 관리비가 없는 단지 — 엑셀 마지막 달로 대신(출처 적음) */
    document.querySelectorAll('#detail .costnone').forEach(e => { e.hidden = true; });
    머리 = `<dl><dt>세대당 공용관리비</dt><dd><b>${won(끝.세대당)}</b> <span class="muted">/ 월 · ${esc(ym(끝.ym))} · K-apt 자료실 엑셀</span></dd>${
      끝.장충월세대당 ? `<dt>장기수선충당금</dt><dd>월 부과 세대당 ${won(끝.장충월세대당)}${끝.장충총 ? ` <span class="muted">· 적립 ${won(끝.장충총)}</span>` : ''}</dd>` : ''}${
      r.분양임대 ? `<dt>분양 / 임대</dt><dd>${esc(r.분양임대)}</dd>` : ''}</dl>`;
  }
  /* 그림: 세대당 공용관리비 달별 선 하나.
     10-31 사장님 "각 점마다의 금액도 나오게" — 점이 75개쯤이라 글자를 다 붙이면 겹친다 →
     ① 마우스를 올리거나(폰은 누르거나 밀면) 가장 가까운 달의 금액이 그 자리에 뜬다 ② 세로축 금액 눈금 세 개 ③ '달별 금액 보기' 표(해 × 달) */
  const W = 320, H = 110, L = 44, R = 6, T = 12, B = 16;
  const vs = 점.map(x => x.세대당), lo = Math.min(...vs), hi = Math.max(...vs), 폭 = Math.max(1, hi - lo);
  const X = i => L + (점.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (점.length - 1));
  const Y = v => T + (H - T - B) * (1 - (v - lo) / 폭);
  const 선 = 점.map((x, i) => `${X(i).toFixed(1)},${Y(x.세대당).toFixed(1)}`).join(' ');
  const 눈 = [hi, (hi + lo) / 2, lo];
  const 짧게 = n => (n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : fmt(Math.round(n)));
  const 열두 = 점.slice(-12), 평균 = 열두.reduce((t, x) => t + x.세대당, 0) / 열두.length;
  const 작년 = 점.find(x => Number(x.ym) === Number(끝.ym) - 100);
  const 변화 = 작년 ? Math.round((끝.세대당 - 작년.세대당) / 작년.세대당 * 1000) / 10 : null;
  /* 달별 표: 해마다 한 줄, 1~12월 */
  const 해들 = [...new Set(점.map(x => String(x.ym).slice(0, 4)))];
  const 값 = new Map(점.map(x => [String(x.ym), x.세대당]));
  const 표 = `<details class="chtbl"><summary>달별 금액 보기 <span class="muted">(세대당 공용관리비 · 원)</span></summary>
    <div class="chtblw"><table class="mini"><thead><tr><th>해</th>${Array.from({ length: 12 }, (_, m) => `<th class="n">${m + 1}월</th>`).join('')}</tr></thead><tbody>
    ${해들.reverse().map(y => `<tr><td>${y}</td>${Array.from({ length: 12 }, (_, m) => { const v = 값.get(`${y}${String(m + 1).padStart(2, '0')}`);
      return `<td class="n">${v ? fmt(v) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  const 제목있음 = !!document.querySelector('#detail .costnone');   // '관리비' 제목은 위(costBlock0)가 이미 그렸다
  지금.innerHTML = (지금.dataset.api !== '1' ? (제목있음 ? '' : sect('관리비', 'cost', ` <span class="muted">${esc(ym(끝.ym))}</span>`)) + 머리 : '') + `
    <div class="sub">관리비 추이 — 세대당 공용관리비 <span class="muted">${esc(ym(점[0].ym))} ~ ${esc(ym(끝.ym))} · ${fmt(점.length)}달 · 점에 마우스를 올리거나 누르면 그 달 금액</span></div>
    <div class="chwrap">
    <svg class="chist" viewBox="0 0 ${W} ${H}" role="img" aria-label="세대당 공용관리비 ${esc(ym(점[0].ym))}부터 ${esc(ym(끝.ym))}까지, 최저 ${won(lo)} 최고 ${won(hi)}. 달별 금액은 아래 표">
      ${눈.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gr"/><text x="${L - 4}" y="${(Y(v) + 3).toFixed(1)}" class="tk" text-anchor="end">${짧게(v)}</text>`).join('')}
      <polyline points="${선}" class="ln"/>
      ${점.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.세대당).toFixed(1)}" r="${점.length > 60 ? 1.5 : 2.2}" class="pt"/>`).join('')}
      <text x="${L}" y="${H - 3}" class="tk">${esc(ym(점[0].ym))}</text><text x="${W - R}" y="${H - 3}" class="tk" text-anchor="end">${esc(ym(끝.ym))}</text>
      <g class="hv" visibility="hidden"><line class="hvl" y1="${T}" y2="${H - B}"/><circle class="hvp" r="3.4"/></g>
      <rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}"/>
    </svg>
    <div class="chtip" hidden></div>
    </div>
    <p class="srcline">최근 12달 평균 <b>${won(평균)}</b>${변화 == null ? '' : ` · 1년 전 같은 달보다 <b>${변화 > 0 ? '+' : ''}${변화}%</b>`} · 최저 ${won(lo)} · 최고 ${won(hi)}
      · 출처: K-apt 자료실 관리비정보(연도별 엑셀 · 주 1회) '공용관리비(합계)' ÷ 지금 세대수${r.세대 ? `(${fmt(r.세대)})` : ''} · 엑셀은 K-apt 가 '참고자료' 로 내는 것이라 위 항목별 값(OpenAPI)과 조금 다를 수 있습니다</p>
    ${표}`;
  /* 가장 가까운 달을 따라가는 표시 */
  const svg = 지금.querySelector('svg.chist'), tip = 지금.querySelector('.chtip'), hv = svg.querySelector('.hv');
  const 보이기 = ev => {
    const b = svg.getBoundingClientRect(); const x = (ev.clientX - b.left) / b.width * W;
    const i = Math.max(0, Math.min(점.length - 1, Math.round((x - L) / ((W - L - R) / Math.max(1, 점.length - 1)))));
    const p = 점[i], cx = X(i), cy = Y(p.세대당);
    hv.setAttribute('visibility', 'visible');
    hv.querySelector('.hvl').setAttribute('x1', cx); hv.querySelector('.hvl').setAttribute('x2', cx);
    hv.querySelector('.hvp').setAttribute('cx', cx); hv.querySelector('.hvp').setAttribute('cy', cy);
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(ym(p.ym))}</b> ${won(p.세대당)}${p.개별세대당 ? `<span class="muted"> · 개별 ${won(p.개별세대당)}</span>` : ''}`;
    const px = cx / W * b.width, half = tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(b.width - tip.offsetWidth, px - half))}px`;
    tip.style.top = `${Math.max(0, cy / H * b.height - 34)}px`;
  };
  const 숨기기 = () => { hv.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', 보이기); hit.addEventListener('pointerdown', 보이기); hit.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') 숨기기(); });
}
function kaptBlock(k) {
  if (!k) return '';
  const r = [];
  const add = (key, v) => { if (v !== null && v !== undefined && v !== '' && v !== 0) r.push(`<dt>${key}</dt><dd>${v}</dd>`); };

  /* 어긋남 검사 — **세대수로만** 한다 (2026-10-15 실측으로 정함)

     세대수   58건 중 11건 어긋남. 나머지는 정확히 0 차이로 맞아떨어진다
              (2,352 / 2,029 / 1,711 / 939 …). 우연일 수 없으니 검증 신호로 쓴다.
              ★ 이 11건은 **호수(hoCnt) 로 비교한 수치다.** 2026-10-16 에
                세대수(kaptdaCnt)로 바로잡았으니 재적재 후 다시 재야 한다.
                래미안퍼스트하이는 호수 1,568 / 세대수 1,562 로, 대장 1,562 와
                정확히 맞는다 — 어긋남이 아니라 내 필드 선택 오류였다.
     동수     58건 중 48건 어긋나지만 **방향이 한쪽으로 쏠린다**
              (대장이 많음 41 / K-apt 가 많음 7). 배수 차이도 난다
              (K-apt 24 vs 대장 50). K-apt 는 주거동만, 대장은 상가·부속동까지
              센다. **어긋남이 아니라 다른 것을 세는 것**이므로 경고하지 않는다.
     최고층   대장 쪽이 대부분 NULL 이라 **비교 자체가 안 된다.**
              '어긋남 0건' 을 '일치' 로 읽으면 안 된다(CONTEXT 4-22 ④ 와 같은 실수). */
  const diffs = [];
  if (k.kapt_세대 && k.대장_세대 && Number(k.kapt_세대) !== Number(k.대장_세대))
    diffs.push(`K-apt ${fmt(k.kapt_세대)}세대 / 대장 ${fmt(k.대장_세대)}세대`);

  /* 2026-10-23: 규모(세대·동·호수) · 주차 · 전기차 · CCTV · 난방 · 복도는 단지정보 '제원' 의 제자리로 옮겼다(중복 없음). 여기는 관리 운영만. */
  /* 지하철 · 버스(K-apt 신고 도보 시간)는 주변 탭의 지하철 · 버스 칸으로 옮겼다 */
  add('관리 방식', k.관리 ? esc(k.관리) : '');
  if (k.경비인원 || k.경비업체) add('경비',
    [k.경비인원 ? `${fmt(k.경비인원)}명` : '', k.경비방식 ? esc(k.경비방식) : '',
     k.경비업체 ? `<span class="muted">${esc(k.경비업체)}</span>` : ''].filter(Boolean).join(' · '));
  if (k.청소인원 || k.청소업체) add('청소',
    [k.청소인원 ? `${fmt(k.청소인원)}명` : '', k.청소방식 ? esc(k.청소방식) : '',
     k.청소업체 ? `<span class="muted">${esc(k.청소업체)}</span>` : ''].filter(Boolean).join(' · '));
  add('관리 인원', k.관리인원 ? fmt(k.관리인원) + '명' : '');
  add('음식물 처리', k.음식물 ? esc(k.음식물) : '');
  add('부대복리시설', k.부대복리시설 ? esc(k.부대복리시설) : '');
  add('편의시설', k.편의시설 ? esc(k.편의시설) : '');
  add('교육시설', k.교육시설 ? esc(k.교육시설) : '');

  if (!r.length && !diffs.length) return '';   // 규모·설비는 제원으로 옮겼다 — 남은 관리 운영 줄이 없으면 칸을 안 그린다
  return sect('관리 정보', 'kapt', ' ' + EST('kapt')) + `
    <dl>${r.join('')}</dl>`;
}

/* 건축인허가 — 대장은 '지어진 것', 인허가는 '지으려는 것'.
   기존 단지의 지번에 최근 허가가 있으면 재건축·증축이 진행 중이라는 신호다.

   **집계하지 않고 건별로 나열한다.** 허가만 받고 안 짓거나, 취소되거나,
   설계변경으로 여러 건이 쌓인다(62-1 한 지번에 15건). 재개발·재건축은
   주택법 사업계획승인 대상이라 이 체계에 아예 안 들어온다(CONTEXT 4-14). */
function permitBlock(rows, scope, dongs, 단지번호) {
  /* ★ 허가 안의 **동 내역** (2026-10-21). 55,214건을 받아만 두고 안 쓰고 있었다.
     허가 줄에는 **구조·지붕·건축면적이 없다** - 그건 동 행에만 있다.
     ★ 접어 둔다. 허가당 동이 평균 1.11개라 늘 펴 두면 줄만 는다.
     ★ 동명이 51%만 채워져 있다. 없으면 **주용도로 적고 이름을 지어내지 않는다.** */
  const 동묶음 = new Map();
  for (const d of (dongs || [])) {
    if (!동묶음.has(d.mgm_pmsrgst_pk)) 동묶음.set(d.mgm_pmsrgst_pk, []);
    동묶음.get(d.mgm_pmsrgst_pk).push(d);
  }
  /* ★ 2026-10-24 21:57 사장님 "동 내역이 어떤 동인지 모르겠어" — **원천(건축인허가 동별개요)에 동 이름 칸이 없다**
       (건축HUB 동별개요 29칸 실측: '건물_명' 하나뿐이고, 거기엔 동 이름 아니면 사업명이 들어 있다).
     → 건물명이 허가의 사업명과 같으면 동 이름이 아니므로 머리에 쓰지 않고 '#순번 · 주/부속 · 용도 · 세대' 로 가른다.
       주건축물 · 세대 많은 순으로 세운다. 대장 동과 면적으로 맞춰 '몇 동' 이라고 짐작하지 않는다(허가는 짓기 전 설계값). */
  const 동블록 = (pk, 사업명) => {
    const 목 = [...(동묶음.get(pk) || [])];
    if (!목.length) return '';
    const 총 = Number(목[0].동총수) || 목.length;
    const 같은이름 = d => !d.bld_nm || String(d.bld_nm).replace(/\s/g, '') === String(사업명 || '').replace(/\s/g, '');
    /* 2026-10-24 22:01 사장님 "동 내역 30개라면서 어떤 동인지 모르면 말이 안 맞다" — '동' 이라 부르지 않는다: **허가 건물 N개(주건축물 a · 부속 b)**.
       표 한 줄 = 건물 하나(번호 · 구분 · 용도 · 세대 · 연면적 · 구조). 원문에 동 이름이 있으면 번호 대신 그 이름. 설명은 정책(건축인허가)에. */
    목.sort((x, y) => ((x.main_atch_gb_nm === '주건축물' ? 0 : 1) - (y.main_atch_gb_nm === '주건축물' ? 0 : 1))
                    || ((Number(y.hhld_cnt) || 0) - (Number(x.hhld_cnt) || 0)) || ((Number(y.tot_area) || 0) - (Number(x.tot_area) || 0)));
    const 주 = 목.filter(d => d.main_atch_gb_nm === '주건축물').length, 부 = 목.filter(d => d.main_atch_gb_nm === '부속건축물').length;
    const 세대합 = 목.reduce((t, d) => t + (Number(d.hhld_cnt) || 0), 0);
    const 나눔 = [주 ? `주건축물 ${fmt(주)}` : '', 부 ? `부속 ${fmt(부)}` : '', 세대합 ? `${fmt(세대합)}세대` : ''].filter(Boolean).join(' · ');
    return `<details class="pdong"><summary>허가 건물 ${fmt(총)}개${나눔 ? ` · ${나눔}` : ''}</summary>
        <table class="pdtab"><thead><tr><th>#</th><th>구분</th><th>용도</th><th class="n">세대</th><th class="n">연면적</th><th>구조</th></tr></thead><tbody>
        ${목.map((d, i) => `<tr>
          <td>${같은이름(d) ? i + 1 : esc(d.bld_nm)}</td>
          <td>${esc(String(d.main_atch_gb_nm || '').replace('건축물', '') || '—')}</td>
          <td>${esc(d.main_purps_nm || '—')}</td>
          <td class="n">${d.hhld_cnt > 0 ? fmt(d.hhld_cnt) : '—'}</td>
          <td class="n">${d.tot_area > 0 ? fmt(Math.round(d.tot_area)) + '㎡' : '—'}</td>
          <td class="muted">${esc(String(d.strct_nm || '').replace('구조', '') || '—')}</td></tr>`).join('')}
        </tbody></table>
        ${총 > 목.length ? `<p class="note sm">${fmt(총)}개 중 ${fmt(목.length)}개만 보여 줍니다.</p>` : ''}
      </details>`;
  };

  if (!rows || !rows.length) {
    /* 적재 안 된 법정동에서 이 섹션이 비면 "허가가 없다" 가 아니라
       "안 받아왔다" 다. 둘을 안 가르면 사용자가 '이 단지는 공사 이력이
       없구나' 로 읽는다 — 조용히 틀린 결론이다.

       ★ 문구에 지역 이름을 **박지 않는다** (2026-10-17).
         전에는 "(현재 장위동만 적재)" 라고 적어 뒀다. 그날은 맞았고,
         종로·은평을 넣은 날 바로 거짓말이 됐다. 범위는 늘어나는데 문구는
         안 따라온다. scope 가 이미 법정동별로 사실을 들고 있으니 화면은
         "안 받아왔다" 까지만 말하면 된다. */
    const loaded = scope && Number(scope.인허가) === 1;
    return sect('건축인허가', 'permit') +
      `<p class="note">${gapCell('', loaded ? 'EMPTY' : 'SCOPE',
        loaded ? '이 단지 지번에 등록된 허가가 없습니다'
               : '이 법정동의 건축인허가를 아직 받아오지 않았습니다')}</p>
      <div class="pxdemo" data-pxid="${esc(String(단지번호 || ''))}"></div>`;
  }
  const ym = v => (v ? 날짜(v, null) : null);     /* 2026-10-24: 'yy.mm' 이던 것 — 일자까지(날짜 하나로) */
  const ymd = ym;
  /* ★ **어떻게 붙었는지**를 적는다 (2026-10-18).
     재개발 단지는 합필 때 본번이 새로 바뀌는데 인허가에는 옛 지번만 있어서
     PNU 로는 영영 안 붙었다. 세대수 다리로 열었다(CONTEXT 11-23).
     그런데 PNU 로 붙은 것과 세대수로 붙은 것은 **신뢰도가 다르다.**
     같은 모양으로 띄우면 사용자가 둘을 구분할 길이 없다.
     다리로 붙은 건은 조건(신축·150세대+·후보 유일)까지 같이 적는다 —
     "왜 이게 이 단지 허가냐" 는 물음에 화면이 답할 수 있어야 한다. */
  const byHhld = rows.filter(a => a.match_by === 'HHLD').length;
  const bridgeNote = '';   /* 2026-10-24: 문장 대신 그 허가 줄에 '추정' 칩(아래) — 조건은 정책(건축인허가) */
  return sect('건축인허가', 'permit', ` ${fmt(rows.length)}`) + bridgeNote + `
    <div class="plist">${rows.map(a => {
      const steps = [['허가', ym(a.arch_pms_day)], ['착공예정', ym(a.stcns_sched_day)],
                     ['착공', ym(a.real_stcns_day)],
                     ['사용승인', ym(a.use_apr_day)]].filter(([, v]) => v);
      const tags = [];
      if (a.hhld_cnt) tags.push(`${fmt(a.hhld_cnt)}세대`);
      if (a.tot_area) tags.push(`연면적 ${fmt(Math.round(a.tot_area))}㎡`);
      if (a.tot_pkng_cnt) tags.push(`주차 ${fmt(a.tot_pkng_cnt)}`);
      if (a.jimok_nm) tags.push(`지목 ${esc(a.jimok_nm)}`);
      if (a.jiyuk_nm) tags.push(esc(a.jiyuk_nm));
      if (a.match_by === 'HHLD') tags.push(EST('permit'));
      /* ★ stcns_delay_day 는 날짜(착공기한)다. 일수가 아니다.
         여기서 `${fmt(날짜)}일` 을 찍어 '착공지연 20,170,910일' 이 화면에 나갔다.
         20170910 = 2017-09-10 = 허가(2015-09-11) + 2년, 즉 착공 마감일이고
         그 건은 2017-07-27 에 착공해 기한을 45일 **앞당겨** 지켰다.
         스키마에서 이 컬럼만 주석이 비어 있었던 것이 발원지다(11_arch_permit.sql).
         지연은 추측하지 않고 착공예정 vs 실제착공 으로 계산한 값만 쓴다. */
      if (a.stcns_delay_day) tags.push(`<span class="muted">착공기한 ${ymd(a.stcns_delay_day)}</span>`);
      if (a.지연일수 > 0) tags.push(`<span class="warnx">착공지연 ${fmt(a.지연일수)}일</span>`);
      else if (a.지연일수 < 0) tags.push(`<span class="muted">예정보다 ${fmt(-a.지연일수)}일 일찍 착공</span>`);
      if (a.기한초과 > 0) tags.push(`<span class="warnx">기한 ${fmt(a.기한초과)}일 넘겨 착공</span>`);
      return `<div class="prow">
        <div class="pa"><b>${esc(a.bld_nm || a.main_purps_nm || '—')}</b>
          <span>${esc(a.arch_gb_nm || '')}</span></div>
        <div class="pb"><span>${steps.map(([k, v]) => `${k} ${v}`).join(' → ') || '—'}</span></div>
        ${tags.length ? `<div class="pm">${tags.join('<em>·</em>')}</div>` : ''}
        ${동블록(a.mgm_pmsrgst_pk, a.bld_nm)}
        <div class="pxtra" data-pxpk="${esc(a.mgm_pmsrgst_pk)}" data-pxapr="${a.use_apr_day ? 1 : 0}"></div>
      </div>`;
    }).join('')}</div>
    <div class="pxdemo" data-pxid="${esc(String(단지번호 || ''))}"></div>
    `;
}

/* ---------------- 출처 배지 ----------------
   이 화면의 숫자는 축이 여섯 개에서 온다. 섞여 있으면 어느 것이 어디서 왔는지
   알 수 없고, **다를 때 그게 발견인지 오류인지도 구분되지 않는다.**
   (세대수만 해도 총괄표제부 / 표제부 합 / 동별 합 세 군데서 나온다)

   note 는 그 축의 알려진 한계다. 숨기지 않고 옆에 적는다. */
const SRC = {
  bld:    { t: '건축물대장', s: '국토부' },
  rtms:   { t: '실거래가', s: '국토부' },
  parcel: { t: '연속지적도', s: 'VWorld' },
  bldg:   { t: '건물 외곽선', s: 'VWorld', note: '신축 반영이 늦을 수 있음' },
  zone:   { t: '용도지역', s: 'VWorld', note: '필지와 공간교차' },
  poi:    { t: '상가(상권)정보', s: '소상공인시장진흥공단', note: '국세청·카드사 · 분기 갱신' },
  /* ★ 공공누리 4유형이라 **출처표시가 의무**다. 이 배지가 그 역할을 한다. */
  redev:  { t: '정비사업 구역', s: '서울 열린데이터광장 · 서울플랜+', note: '공공누리 4유형 · 반기 갱신' },
  school: { t: '초중등학교위치 · 학구도', s: '교육부 · 한국교육시설안전원 · 학교알리미', note: '거리는 직선 · 구역은 학구도' },
  /* 유치원알리미 공시. ★ 1년에 2회만 갱신된다 - note 에 적어 둔다 */
  kinder: { t: '유치원알리미', s: '교육부 · 한국교육학술정보원 (유치원 공시정보)',
            note: '연 2회 공시 · 직선거리' },
  applyhome: { t: '청약홈 분양정보', s: '한국부동산원 (청약홈 APT 분양정보)', note: '추정 연결' },
  houseplan: { t: '주택인허가', s: '국토교통부 건축HUB 주택인허가(주택법 사업계획승인) 대용량 월 파일', note: '원문 그대로' },
  houseplanah: { t: '청약홈 분양정보', s: '한국부동산원 (청약홈 APT 분양정보)', note: '같은 지번 공고' },
  applyhome0: { t: '청약홈 분양정보', s: '한국부동산원 (청약홈 분양정보) — 단지에 아직 안 이어진 공고' },
  closed: { t: '폐쇄·말소 건축물대장', s: '국토교통부 건축HUB 폐쇄말소대장정보', note: '현재 대장과 따로' },
  childcare: { t: '보육정보공개', s: '교육부 · 한국사회보장정보원 (어린이집별 기본정보)', note: '기준일 값 · 직선거리' },
  landuse: { t: '토지이용규제정보', s: '국토교통부 토지이용규제정보서비스 (VWorld getLandUseAttr)' },
  hira: { t: '심평원 병원·약국', s: '건강보험심사평가원 병원정보서비스 · 약국정보서비스 (요양기관 신고)' },
  academy: { t: 'NEIS 학원·교습소', s: '교육부 NEIS 교육정보 개방포털 (교육청 등록 현황)',
             note: '교육청 등록 · 직선거리' },
  subway: { t: '도시철도 역사정보', s: '국가철도공단', note: '연 1회 · 직선거리' },
  bus:    { t: '전국 버스정류장 위치', s: '국토교통부', note: '연 1회 · 직선거리' },
  kapt:   { t: 'K-apt', s: '공동주택관리정보' },
  /* ★ 뱃지는 **어디서 왔는지**를 말해야 한다(2026-10-19). 섹션 제목과 같은 말을
     반복하면 ('건축인허가' 옆에 '건축인허가') 정보가 0 이다. 실제로 그랬다. */
  permit: { t: '건축행정시스템', s: '국토교통부 세움터 (건축인허가)', note: '착공·사용승인 기준' },
  cost:   { t: 'K-apt', s: '공동주택관리정보 (관리비)', note: '월 단위 공시' },
};

/* ================= 빈칸의 사유 =================
   이 화면의 빈칸은 전부 뜻이 다르다. 그런데 오랫동안 **값이 없으면 줄을 안 그렸고**,
   그래서 "원래 없는 것 / 아직 안 받은 것 / 고장난 것" 이 전부 똑같이 보였다.

   2026-10-16 에 브라운스톤 돈암(24개동)의 주차가 통째로 비어 있었다. 1,177대가
   DB 에 멀쩡히 있었고, 쿼리가 총괄표제부를 안 보고 있었을 뿐이다. **줄이 없으니
   아무도 "왜 없지" 를 묻지 않았다** — 사용자가 직접 묻기 전까지.

   실거래에서 이미 같은 문제를 풀어뒀다. 상태 7종과 meta.v_lawd_scope 로
   "없다" 와 "안 봤다" 를 갈라 **설명되지 않는 미매칭을 0건으로** 만든 그 장치다.
   그걸 화면 전체로 넓힌다.

   ★ UNKNOWN 을 반드시 남겨둔다. 넷 중 아무것도 아닌데 비어 있으면 그게 버그다.
     모든 빈칸에 그럴듯한 설명을 붙이면 **버그가 정상처럼 보인다.**
     "준비중" 한 가지로 덮지 않는 이유가 이것이다 — 그 말은 넷 중 SCOPE 에만
     해당하고, 나머지에 쓰면 지키지 못할 약속이 된다. */
const GAP = {
  /* 2026-10-24 22:09 사장님 "단지 상세에서 쓸데없는 말을 빼고, 확인하고 싶으면 정책" — 빈칸 사유는 **짧은 말 하나**.
     자세한 까닭(note)은 글자로 늘어놓지 않고 title(마우스 올림 · 폰은 누르면 말풍선)로. '없다' 와 '안 받았다' 의 구분은 그대로. */
  SCOPE:   { t: '안 받음',     c: 'g-scope'  },  // 범위 밖. 받으면 생긴다
  NA:      { t: '해당 없음',   c: 'g-na'     },  // 이 단지 종류엔 그 축이 없다
  UNSURE:  { t: '모름',        c: 'g-unsure' },  // 데이터는 있으나 이 단지 것이라 확신 못 함
  EMPTY:   { t: '값 없음',     c: 'g-empty'  },  // 받아왔는데 그 칸이 공란
  UNKNOWN: { t: '분류 안 됨',  c: 'g-unknown'},  // ★ 버그 신호
};

/* 값이 있으면 값을, 없으면 사유를 적는다. **줄은 언제나 그린다.**
   why 를 안 넘기면 UNKNOWN 이다 — 분류를 깜빡한 것도 드러나야 한다. */
/* 2026-10-24 22:09: 덧말을 title(툴팁)로 옮겼는데 **폰엔 마우스가 없다** — 터치 화면에서는 누르면 그 글을 작은 말풍선으로 띄운다.
   단추 · 링크 · 누르면 다른 일을 하는 칸(data-*)은 건드리지 않는다. 다른 곳을 누르거나 3초 지나면 닫힌다. */
document.addEventListener('click', e => {
  const 열린 = document.querySelector('.tipbub');
  if (열린) 열린.remove();
  if (!matchMedia('(hover: none)').matches) return;
  const el = e.target.closest('#detail [title]');
  if (!el || el.closest('a, button, summary, [data-pt], [data-histgo], [data-nbkind]')) return;
  const 글 = el.getAttribute('title');
  if (!글) return;
  const b = document.createElement('div');
  b.className = 'tipbub'; b.textContent = 글;
  document.body.appendChild(b);
  const r = el.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
  b.style.maxWidth = w + 'px';
  b.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left)) + 'px';
  b.style.top = (r.bottom + 6 + b.offsetHeight > innerHeight ? r.top - b.offsetHeight - 6 : r.bottom + 6) + 'px';
  setTimeout(() => b.remove(), 3500);
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-dong-toggle]');
  if (!e.target.closest('.dsel')) document.querySelectorAll('.dsel .dpick:not([hidden])').forEach(l => {   // 바깥을 누르면 닫는다
    l.hidden = true; const b = l.parentElement.querySelector('[data-dong-toggle]'); if (b) b.setAttribute('aria-expanded', 'false'); });
  if (!t) return;
  const list = t.parentElement.querySelector('.dpick');
  if (!list) return;
  list.hidden = !list.hidden;
  t.setAttribute('aria-expanded', String(!list.hidden));
});

/* 2026-10-24: 짐작으로 이은 값 옆의 작은 '추정' 칩 — 누르면 그 정책 항목으로 */
function EST(키) { return `<a href="#policy" class="est" data-pol-go="${키}" title="짐작으로 이은 값 — 누르면 정책">추정</a>`; }

function gapCell(value, why, note) {
  /* ★ 0 을 빈값으로 치지 않는다. 지하 0층·기계식 0대·비상용 0대는 **값**이다.
     여기서 0 을 결측으로 뭉개면 "지하가 없다" 가 "대장에 값 없음" 으로 둔갑한다 —
     장충 잔액에서 `0 — 확인 필요` 를 따로 둔 것과 같은 이유다. */
  if (value !== null && value !== undefined && value !== '') return value;
  const g = GAP[why] || GAP.UNKNOWN;
  return `<span class="gap ${g.c}" title="${esc(note ? g.t + ' — ' + note : g.t)}">${g.t}</span>`;
}

/* ★ 교육청 등록 학원·교습소 (2026-10-21)
   '생활 편의' 의 학원은 **상가 업종**이라 이 숫자와 다르다 - 둘 다 맞고 출처가 다르다. 그래서 적는다.
   위치를 아직 다 못 붙였으면 몇 곳 중 몇 곳 기준인지 적는다 - 덜 센 것을 '적다' 로 읽으면 안 된다. */
function 학원칸(a) {
  if (!a) return '';
  const 묶음 = (a.묶음 || []).filter(x => Number(x.r1000) > 0);
  const 가까운 = a.가까운 || [];
  const r500 = 묶음.reduce((s, x) => s + Number(x.r500 || 0), 0);
  const 전체 = Number(a.전체) || 0, 좌표 = Number(a.좌표있음) || 0;
  const 덜붙임 = 전체 && 좌표 < 전체
    ? `학원·교습소 ${fmt(전체)}곳 중 위치를 붙인 ${fmt(좌표)}곳(${(좌표 * 100 / 전체).toFixed(1)}%)만 셌습니다` : '';
  const 이름 = g => String(g).replace(/^\d+\s*/, '');
  return `
    ${sect('학원·교습소', 'academy', 묶음.length ? ` ${fmt(r500)}` : '')}
    ${묶음.length ? `
      <table class="mini"><thead><tr><th>분야</th><th>500m</th><th>1km</th><th>가장 가까운</th></tr></thead><tbody>
        ${묶음.map(x => `<tr data-pt="academy|${esc(x.묶음)}" data-pt-r="500"><td>${esc(이름(x.묶음))}</td><td>${fmt(x.r500)}</td><td>${fmt(x.r1000)}</td><td>${fmt(x.최단m)}m</td></tr>`).join('')}
      </tbody></table>
      ${가까운.length ? `<div class="schrow">${가까운.map(x => `
        <div class="scell" data-pt="academynm|${esc(x.이름 || '')}"><span class="sg">${esc(x.분야 || '—')}</span><b>${esc(x.이름 || '—')}</b>
          <span class="sd">${fmt(x.거리m)}m${x.과정 ? ' · ' + esc(x.과정) : ''}</span></div>`).join('')}</div>
        <p class="note sm">500m 안 <b>가까운 순 ${가까운.length}곳</b>${
          Number(가까운[0].전체500) > 가까운.length ? ` (500m 안 전체 ${fmt(가까운[0].전체500)}곳)` : ''}.</p>` : ''}
      ${덜붙임 ? `<p class="note sm">${덜붙임}</p>` : ''}`
    : `<p class="note">${gapCell('', 전체 ? 'NA' : 'SCOPE',
        전체 ? '이 단지 1km 안에 위치가 붙은 학원·교습소가 없습니다' + (좌표 < 전체 ? ' — 아직 위치를 붙이는 중이라 없다고 단정할 수 없습니다' : '')
             : '학원 정보를 아직 받지 않았습니다')}</p>`}`;
}

let 그리는가상 = null;   /* 10-30: 대장 전 건물(가상)을 그리는 동안 — 대장(bld) 배지를 허가 · 승인 원문 배지로 바꿔 단다(출처를 속이지 않게) */
function sect(title, srcKey, extra = '', detail = '') {
  if (그리는가상 && srcKey === 'bld') srcKey = 그리는가상.종류 === 'h' ? 'houseplan' : 그리는가상.종류 === 'a' ? 'houseplanah' : 'permit';
  const x = SRC[srcKey];
  /* 2026-10-22 사장님 "단지정보 안 부가 설명은 '정책' 에 전부 정리" — 배지를 누르면 그 출처의 기준·설명(정책 화면)으로 */
  const badge = x ? `<a class="src" href="#policy" data-pol="${esc(detail === '주택가격' ? '주택가격' : srcKey)}" title="${esc(x.s)} — 누르면 이 칸의 기준·출처">${esc(x.t)}${
    detail ? ` · ${esc(detail)}` : ''}${x.note ? ` <i>${esc(x.note)}</i>` : ''}<span class="polq" aria-hidden="true">?</span></a>` : '';
  return `<div class="sect">${title}${extra}${badge}</div>`;
}

/* ---------------- 단지 제원 ----------------
   전부 건축물대장(silver.bld_title)에 이미 들어와 있던 값이다. 새로 받는 것은 없고
   화면에 안 보여주고 있었을 뿐이다.

   **줄은 언제나 그린다** (2026-10-16 전환). 예전엔 값이 없으면 줄을 안 그렸고,
   그 근거는 "줄이 없으면 왜 비었지도 없다" 였다. 그게 틀렸다 — 줄이 없으면
   "왜 비었지" 가 없어지는 게 아니라 **없다는 사실 자체가 없어진다.**
   주차 1,177대가 그렇게 사라져 있었다(총괄표제부를 안 보던 버그).
   이제 빈칸마다 사유를 적고, 분류가 안 되면 UNKNOWN 으로 드러낸다.

   제원은 전부 건축물대장에서 온다. 단지가 존재한다는 것 자체가 대장을 적재했다는
   뜻이므로 **기본 사유는 EMPTY**(받아왔는데 그 칸이 공란)다. 예외는 동별 표제부가
   0 건일 때 — 승강기·높이·층수·구조·지붕은 총괄에 아예 없는 필드라 NA 가 된다.

   세대당 주차는 세대수가 이미 있으니 나눗셈 하나다. 구축 아파트를 볼 때
   실제로 보는 숫자다. */
/* ---------------- 공시가격 18년 추이 (2026-10-21) ----------------
   `silver.bld_hsprc` 에 2008~2026 **19개 연도**가 쌓여 있는데, 지금까지 시계열을
   볼 수 있는 곳은 **호 모달 하나뿐**이었다 — 격자 칸을 눌러야 나온다.
   단지를 열었을 때 "이 단지 값이 18년간 어떻게 움직였나" 는 어디에도 없었다.

   ★★ **집계가 한 글자도 없다.** 호마다 **그 호의 원본 숫자**를 연도순으로 늘어놓는다.
     연도별 평균·중위를 내면 그 순간 (ㄱ) 어떤 호를 넣을지 (ㄴ) 평균이냐 중위냐 를
     내가 고르게 된다. 게다가 **연도마다 공시가격이 있는 호 수가 다르므로**
     연도끼리 비교하는 것 자체가 거짓이 된다. 그래서 내지 않는다.

   ★ 같은 해에 회차가 둘 올 수 있다 — 결정공시 뒤 조정공시(27_hsprc.sql).
     막대는 한 해에 하나만 그릴 수 있으므로 **나중 공시(조정)** 를 그리고,
     **그렇게 했다고 화면에 적는다.** 전 회차는 호를 누르면 다 보인다(호 모달).
     서버가 `std_day DESC, crtn_day DESC` 로 보내므로 **그 해 첫 줄이 나중 공시**다.
     (실측: 석관동삼성 60호가 1,200행인데 연도는 19개 — 한 호에 겹친 해가 있다.)

   ★ 막대 높이는 **보이는 호들의 최대값**으로 맞춘다. 호마다 자기 최대로 맞추면
     모양은 잘 보이지만 **줄끼리 비교가 안 된다** — 같은 기준이라고 적는다.

   ★ 자르는 곳마다 "몇 개 중 몇 개": 서버가 60호까지 보내고 화면은 10호씩 펼친다.
     `전체공시호`(공시가격이 있는 호 전체)를 같이 적는다(작업방식 10장 규칙 2).

   ★ 줄에 `data-ho-pk` 를 쓴다 — 격자 칸과 **같은 속성**이라 호 모달 바인딩이
     그대로 듣는다. 여는 길을 두 군데 만들지 않는다. */
function prcBlock(rows, scope, 적재, dongs) {
  const R = rows || [];
  /* ⚠⚠ **'없다' 고 단정하면 안 된다** (2026-10-21 화면에서 거짓말을 잡았다).
     처음엔 `scope.주택가격` 으로 갈랐는데, 그건 `EXISTS(hsprc WHERE pnu LIKE 법정동%)`
     라서 **한 건만 있어도 1** 이다. 잠실(524566)은 총 515,054건 중 100건만 받은
     상태인데 화면이 "이 단지 호에 공시가격이 없습니다" 라고 적었다 — 5,564호 전부
     아직 안 들어온 것이었다. 그래서 **적재 진행(받은건수 vs 전체건수)**으로 가른다.
       받은건수 < 전체건수 → 아직 받는 중이다  → '못 본 것'
       받은건수 >= 전체건수 → 다 받았는데 없다 → '없는 것'
     적재 정보 자체가 없으면 역시 '못 본 것' 이다. 모를 때는 모른다고 적는다. */
  const 받 = 적재 ? Number(적재.받은건수) : null;
  const 전 = 적재 ? Number(적재.전체건수) : null;
  const 받는중 = !적재 || !(전 > 0) || !(받 >= 전);
  const 덜받은말 = (적재 && 전 > 0)
    ? `이 법정동 주택가격을 ${fmt(전)}건 중 ${fmt(받 || 0)}건만 받았습니다 — 아직 받는 중입니다`
    : '이 법정동의 주택가격을 아직 받아오지 않았습니다';

  if (!R.length) {
    return sect('공시가격 추이', 'bld', '', '주택가격')
      + `<p class="note">${gapCell('', 받는중 ? 'SCOPE' : 'EMPTY',
          받는중 ? 덜받은말 : '이 단지 호에 공시가격이 없습니다')}</p>`;
  }

  /* ★ 2026-10-21 QA: `r.동` 이 **null 인 단지가 있다**(269 청운현대 — 호 전부 null).
     그래서 '404호 · 4층' 이 네 동에서 네 번 나왔다(60호 중 39건이 같은 이름).
     동 이름은 `dongs` 축에 있고 **격자는 동PK 로 그걸 찾아** 쓴다 — 같은 길을 쓴다.
     `동이름()` 한 군데에서 뽑으므로 격자와 이 목록이 갈라질 수 없다. */
  const 동표 = new Map((dongs || []).map(x => [String(x.mgm_bldrgst_pk), 동이름(x)]));
  const 동찾기 = r => (r.동 && String(r.동).trim())
                      || 동표.get(String(r.동PK)) || '';

  const 순 = [], 묶 = new Map();
  for (const r of R) {
    if (!묶.has(r.호PK)) {
      묶.set(r.호PK, { 호PK: r.호PK, 동: 동찾기(r), 호: r.호, 층: r.층, 해: new Map() });
      순.push(r.호PK);
    }
    const g = 묶.get(r.호PK);
    const y = String(r.std_day || '').slice(0, 4);
    if (y && !g.해.has(y)) g.해.set(y, Number(r.hsprc));   /* 첫 줄 = 나중 공시 */
  }
  const 전체공시호 = Number(R[0].전체공시호) || 순.length;
  const 받은 = 순.length;
  const 보임 = Math.max(1, Math.min(prcShown, 받은));
  const 쓸 = 순.slice(0, 보임).map(k => 묶.get(k));
  let 최대 = 0;
  for (const g of 쓸) for (const v of g.해.values()) if (v > 최대) 최대 = v;
  const 연도수 = new Set(R.map(r => String(r.std_day || '').slice(0, 4)).filter(Boolean)).size;

  const 줄 = 쓸.map(g => {
    const ys = [...g.해.keys()].sort();
    const 처음 = g.해.get(ys[0]), 끝 = g.해.get(ys[ys.length - 1]);
    const 변화 = 처음 > 0 ? (끝 - 처음) / 처음 : null;
    const bars = ys.map(y => {
      const v = g.해.get(y);
      const h = 최대 > 0 ? Math.max(3, Math.round(v / 최대 * 100)) : 3;
      return `<i style="height:${h}%" title="${esc(y)}년 ${eok(v)}"></i>`;
    }).join('');
    /* ★ `호` 는 호명칭이라 '101동1005호' 처럼 **동이 이미 붙어 있는 경우**가 있다.
       앞에 동을 또 붙이면 '101동 101동1005호' 가 된다(호 모달에서 겪은 것과 같은 함정). */
    /* ★ 2026-10-21 QA: 호명칭이 두 모양으로 온다 — '101동1005호' 처럼 '호' 가 붙은 것과
       '808' 처럼 **맨 숫자**인 것(이화에수풀). 맨 숫자면 '808 · 8층' 이 되어 동 번호처럼
       읽힌다. **숫자만일 때만** '호' 를 붙인다 — 조건 없이 붙이면 '1005호호' 가 된다
       (호 모달에서 이미 밟은 함정). 원본 글자는 그대로 두고 단위만 보탠다. */
    const 호원 = String(g.호 || '');
    const 호명 = /^\d+$/.test(호원) ? 호원 + '호' : 호원;
    const 동명 = String(g.동 || '');
    const 층명 = g.층 == null ? '' : (g.층 < 0 ? `지하${-g.층}층` : `${g.층}층`);
    /* 동 · 호 · 층 순서다. 층을 앞에 두면 '10층 · 101동1005호' 가 되어 어색하다(화면에서 잡음). */
    const 이름 = [(동명 && 호명 && !호명.startsWith(동명)) ? 동명 : '', 호명, 층명]
                   .filter(Boolean).join(' · ') || g.호PK;
    return `<div class="hprow" data-ho-pk="${esc(g.호PK)}" role="button" tabindex="0">
      <div class="hprow-h"><b>${esc(이름)}</b><span>${eok(끝)}</span></div>
      <div class="spk">${bars}</div>
      <div class="hprow-f">${esc(ys[0])} ${eok(처음)} → ${esc(ys[ys.length - 1])} ${eok(끝)}${
        변화 == null ? '' : ` <span class="${변화 >= 0 ? 'up' : 'down'}">${
          변화 >= 0 ? '+' : ''}${(변화 * 100).toFixed(0)}%</span>`}${
        ys.length < 연도수 ? ` <span class="muted">· ${fmt(ys.length)}개 연도만</span>` : ''}</div>
    </div>`;
  }).join('');

  const 더 = 보임 < 받은
    ? `<button type="button" class="moreb" data-prc-more="1">10개 더보기
         <span class="muted">(${fmt(보임)} / ${fmt(받은)})</span></button>` : '';

  return sect('공시가격 추이', 'bld', ` ${fmt(전체공시호)}`, '주택가격')
    + ``
    + (R.some(r => r.출처 === 'NED')
        ? `` : '')
    + (전체공시호 > 받은
        ? `<p class="srcline" title="최신 공시가격이 높은 순">${fmt(전체공시호)}호 중 ${fmt(받은)}호</p>` : '')
    /* ★ 행이 **있어도** 적재가 덜 됐으면 적는다 — 지금 보이는 것이 전부가 아니다 */
    + (받는중 ? `<p class="srcline">${gapCell('', 'SCOPE', 덜받은말
         + ' — 이 단지에 호와 연도가 더 붙을 수 있습니다')}</p>` : '')
    + `<div class="hplist">${줄}</div>${더}`;
}

function specBlock(spec, c, 분위들, 전용률, 호총수, kapt, dongs) {
  if (!spec) return '';
  const n1 = v => Number(v).toFixed(1).replace(/\.0$/, '');
  /* 0 과 결측을 가른다 — 서버가 NULL 은 '안 적었다', 0 은 '적었는데 0' 으로 내려보낸다 */
  const has = v => v !== null && v !== undefined && v !== '';
  /* 동별 표제부가 없으면 그 축의 필드는 물어볼 데가 없다 */
  const dongOnly = Number(spec.동별건수 || 0) > 0 ? 'EMPTY' : 'NA';
  const dongNote = dongOnly === 'NA' ? '동별 표제부가 없습니다' : '';
  /* ★ 2026-10-20: 라벨에 **용어 설명 ?** 를 붙인다(사용자 요청).
     건폐율·용적률 같은 말은 처음 보는 사람에게 아무 뜻이 없다. */
  /* ★ 2026-10-20: 한 덩어리로 20줄 넘게 이어져서 **어디가 한 묶음인지** 안 보였다.
     의미 단위로 자른다 - 땅 / 규모 / 설비 / 구조 / 공사 / 인증.
     ★ 줄은 여전히 **언제나 그린다**(위 주석의 원칙). 묶음만 나눈 것이고,
       한 묶음이 통째로 비면 그 묶음은 안 그린다 - 빈 제목만 남으면 소음이다. */
  const 묶음 = [];
  let 지금 = null;
  const grp = 제목 => { 지금 = []; 묶음.push([제목, 지금]); };
  const add = (k, v, why = 'EMPTY', note = '') =>
    지금.push(`<dt>${라벨용어(k)}</dt><dd>${gapCell(v, why, note)}</dd>`);

  /* 2026-10-23: '땅'(대장의 용도지역 · 지구 · 구역)은 땅 탭 '용도지역' 칸으로 옮겼다 — 지도 면적 비중 · 토지이용계획과 한 칸(중복 없음 · 주제별) */
  grp('규모');
  /* 2026-10-23 사장님 원칙 "중복 없고 · 이어진 데이터를 보기 좋게" — 흩어져 있던 규모(세대 · 동 · 층 · 연면적)를 여기 한 곳에.
     '단지 요약'(같은 탭) · '관리 정보'(K-apt, 관리 탭)에 따로 있던 줄을 옮겼다. 출처가 다른 값은 **한 칸에 출처를 달아** 같이 둔다. */
  const k = kapt || null;
  {
    /* 단지 머리 · 지도 · AI 검색과 **같은 값**(동별 표제부 세대 합 = hhld_cnt_sum). 총괄표제부 값이 다르면 옆에 적는다 */
    const 대장 = c.hhld_cnt_sum || spec.세대;
    const kh = k && Number(k.kapt_세대) ? Number(k.kapt_세대) : null;
    /* 2026-10-24 22:05 사장님: '· K-apt 같음' 같은 덧말을 뺀다. 출처가 서로 **다를 때만** 짧게 그 값을 적는다(무엇이 왜 다른지는 정책). */
    const 다른값 = [spec.세대 && Number(spec.세대) !== Number(대장) ? `총괄표제부 ${fmt(spec.세대)}` : '',
                   kh && kh !== Number(대장) && !(spec.세대 && kh === Number(spec.세대)) ? `K-apt ${fmt(kh)}` : ''].filter(Boolean);
    /* 10-30 QA: 대장 전(가상) 오피스텔은 허가 원문에 세대가 없고 호만 있다 — '값 없음' 대신 호를 적는다(세대로 바꿔 부르지 않는다) */
    const 호만 = Number(spec.호) || 0, 공급 = Number(spec.공급세대) || 0;
    if (!대장 && 공급) add('세대', `공급 ${fmt(공급)}세대 <span class="muted">· 청약 공고 — 조합원 · 보류분은 빠질 수 있어 총 세대가 아닙니다</span>`); else
    add('세대', 대장 ? `${fmt(대장)}세대${호만 ? ` · ${fmt(호만)}호` : ''}${다른값.length ? ` <span class="muted">· ${다른값.join(' · ')}</span>` : ''}`
              : 호만 ? `${fmt(호만)}호 <span class="muted">· 오피스텔 — 세대가 아니라 호</span>` : '');
    add('동', c.dong_cnt != null ? `${fmt(c.dong_cnt)}동${k && Number(k.kapt_동수) && Number(k.kapt_동수) !== Number(c.dong_cnt) ? ` <span class="muted">· 주거동 ${fmt(k.kapt_동수)}</span>` : ''}` : '');
    add('층', [c.max_floor ? `지상 ${fmt(c.max_floor)}층` : '',
               has(spec.지하층) ? (spec.지하층 ? `지하 ${fmt(spec.지하층)}층` : '지하 없음') : ''].filter(Boolean).join(' · '), dongOnly, dongNote);
    add('연면적', c.tot_area_sum ? fmt(Math.round(c.tot_area_sum)) + ' ㎡' : '');
  }

  /* ★ 건폐율은 정의상 100% 를 넘을 수 없다(대지면적 대비 건축면적).
     넘는 값이 실제로 온다 — 정릉동 258-37 이 59,315% 다(대장에 소수점이 빠진 듯).
     **버리지 않고 이상하다고 적는다.** NULL 로 바꾸면 "대장에 값이 없다" 와
     구분이 사라진다. 장충 잔액 0, 주차 7대 차이와 같은 처리다. */
  {
    const bad = spec.건폐율 > 100;
    add('건폐율·용적률', (spec.건폐율 || spec.용적률)
      ? `${spec.건폐율 ? n1(spec.건폐율) + '%' : '—'} / ${spec.용적률 ? n1(spec.용적률) + '%' : '—'}`
        + (bad ? ` <span class="gap g-unknown">건폐율이 100%를 넘습니다 — 대장 값 이상</span>` : '')
      : '');
  }
  /* ★ 용적률 분위 (2026-10-20). 바로 윗줄(건폐율·용적률) 다음에 둔다 —
     '얼마나 지었나' 바로 옆이 '그래서 많은 건가' 의 자리다.
     ★ 단지(총괄표제부)와 건물(표제부)을 **따로** 줄 세운다. 섞지 않는다.
     ★ 분위를 못 내면 **왜 못 내는지** 적는다. 빈칸만 주면 버그로 읽힌다. */
  {
    const 줄 = (분위들 || []);
    const 한줄 = v => {
      const 수 = v.잰수 ? (v.최소 === v.최대 ? n1(v.최소) + '%'
                                            : n1(v.최소) + '~' + n1(v.최대) + '%') : null;
      if (!수) return null;
      const 묶음 = v.바구니종류 > 1 ? '여러 용도지역' : esc(v.용도지역 || '');
      const 덧 = [];
      if (v.넓은비교) 덧.push('종 섞임');          /* 좁은 패널에 맞춘 줄임말 - 뜻은 ? 에 있다 */
      if (v.잰수 < v.대장수) 덧.push(`${fmt(v.대장수)}개 중 ${fmt(v.잰수)}개 기준`);
      /* ★ 수치와 '무엇과 견줬나' 를 **위아래로** 나눈다. 한 줄로 붙이면
         376~520px 패널에서 줄이 넘쳐 읽히지 않는다(실측). */
      /* 2026-10-24 22:05 사장님: '서울 · 수성 · 성남 · 안양 제2종일반주거지역 단지 3,065개 중' 은 툴팁으로(자세한 기준은 ? · 정책) */
      const 기준 = `${범위말로()} ${v.바구니종류 > 1 ? '여러 용도지역' : (v.용도지역 || '')} ${v.종류} ${fmt(v.바구니수)}개 중${덧.length ? ' · ' + 덧.join(' · ') : ''}`;
      return `<span class="qt" title="${esc(기준)}"><b>상위 ${수}</b> <span class="muted">같은 용도지역 ${esc(v.종류)} 중</span></span>`;
    };
    /* 단지를 먼저 — 사람이 먼저 궁금해하는 쪽이다 */
    const 순서 = [...줄].sort((a, b) => (a.종류 === '단지' ? -1 : 1));
    const 보임 = 순서.map(한줄).filter(Boolean);
    if (보임.length) {
      add('용적률 분위', 보임.join(''));
    } else {
      /* ★ 사유가 여러 가지면 하나로 단정하지 않는다.
         서버의 `사유종류` 는 **한 종류 안에서** 몇 가지인지 센 값이다 —
         MIN(사유) 로 뽑은 한 줄만 보여 주면 나머지를 없는 것처럼 만든다.
         (창덕궁: 157개 동 중 일부는 '역사문화환경보존지역', 일부는 아예 없음) */
      const 사유들 = [...new Set(순서.map(v => v.사유).filter(Boolean))];
      const 섞임 = 순서.some(v => v.사유종류 > 1) || 사유들.length > 1;
      add('용적률 분위', '', 'UNSURE',
          !사유들.length ? '견줄 대장을 찾지 못했습니다'
          : 섞임 ? '대장마다 사유가 다릅니다 — 예: ' + 사유들[0]
          : 사유들[0]);
    }
  }
  add('대지면적', spec.대지면적 ? fmt(Math.round(spec.대지면적)) + ' ㎡' : '');
  add('건축면적', spec.건축면적 ? fmt(Math.round(spec.건축면적)) + ' ㎡' : '');
  add('높이', spec.높이 ? n1(spec.높이) + ' m' : '', dongOnly, dongNote);
  add('건물', (has(spec.주건축물) || has(spec.부속건축물))
    ? [has(spec.주건축물) ? `주 ${fmt(spec.주건축물)}동` : '',
       has(spec.부속건축물) ? `부속 ${fmt(spec.부속건축물)}동` : ''].filter(Boolean).join(' · ') : '');
  /* 주용도는 단지 이름 위 용도 칩과 같은 값(중복) — 2026-10-24 뺐다 */

  /* ★ 전용률 (2026-10-21). 호 상세(openHo)가 **호 하나**에 대해 이미 적고 있는 것과
     같은 사실을 **단지 단위**로 적는다. 거르는 조건은 서버에서 글자 그대로 맞춰 뒀다
     (_q_exar 주석) - 한쪽을 고치면 다른 쪽도 고친다.

     ★ **분모를 숫자 옆에 박는다.** 사람이 아는 전용률 70~80% 는 공급(분양)면적
       기준이고 이 값은 계약면적 기준이라 50% 쯤 나온다. 이름만 '전용률' 로 두면
       "왜 50% 야" 가 되고, 그 답이 화면에 없으면 숫자 전체를 못 믿게 된다.

     ★ 공급면적 기준은 **내지 않는다.** 공용을 주거공용/기타공용으로 갈라야 하는데
       원본에 그 구분 코드가 없다. 용도명으로 짐작하면 추정이 숫자로 위장된다.

     ★ 몇 호를 쟀는지 같이 적는다 - 자르는 곳마다 "몇 개 중 몇 개".

     ⚠ 공용 합계가 과소일 수 있어(collapse 가 페이지 단위, 실측 2.8%) 이 비율은
       실제보다 **높게** 나올 수 있다. 모르는 것을 모른다고 적는다. */
  {
    const e = 전용률 || null;
    const 전유 = e ? Number(e.전유합) : 0, 공용 = e ? Number(e.공용합) : 0;
    if (e && e.잰호 > 0 && 전유 > 0 && 공용 > 0) {
      const 계약 = 전유 + 공용;
      const 몇 = (호총수 && 호총수 > e.잰호)
        ? `${fmt(호총수)}호 중 ${fmt(e.잰호)}호` : `${fmt(e.잰호)}호`;
      /* 2026-10-24 22:05: 계산식 · 기준은 툴팁으로(정책 bld 에 설명) */
      add('전용률', `<span class="qt" title="${esc(`계약면적 기준 · ${몇} 기준 — 전유 ${fmt(Math.round(전유))}㎡ ÷ 계약면적 ${fmt(Math.round(계약))}㎡`)}"><b>${(전유 / 계약 * 100).toFixed(1)}%</b></span>`);
    } else if (e && Number(e.면적행있는호) > 0) {
      /* 받아왔는데 공용이 없다 - 단독·다가구처럼 실제로 공용부가 없는 건물이 그렇다 */
      add('전용률', '', 'EMPTY', '이 단지 호에 공용 항목이 없습니다');
    } else {
      add('전용률', '', 'SCOPE', '이 단지의 전유공용면적을 아직 받아오지 않았습니다');
    }
  }

  grp('설비');
  {
    /* 내역은 두 방식이 섞여 있을 때만. 자주식만이면 '자주 6' 은 '6대' 와 같은 말이다. */
    const base = spec.세대 || c.hhld_cnt_sum;
    const per = base > 0 ? ` <span class="muted">· 세대당 ${(spec.주차 / base).toFixed(2)}</span>` : '';
    /* 기계식 0 은 '자주식만' 이라는 사실이므로 적는다. 둘 다 결측일 때만 생략. */
    const mix = (has(spec.주차_자주) || has(spec.주차_기계))
      ? ` <span class="muted">(자주 ${fmt(spec.주차_자주 || 0)}·기계 ${fmt(spec.주차_기계 || 0)})</span>` : '';
    /* 총주차대수와 내역 합이 어긋나면 적는다. 세대수를 세 축에서 비교하는 것과
       같은 장치다 — 덮으면 어느 쪽이 맞는지 영영 모른다. */
    const gap = (spec.주차_내역합 && spec.주차_내역합 !== spec.주차)
      ? ` <span class="muted">· 내역 합 ${fmt(spec.주차_내역합)}대로 ${
          fmt(Math.abs(spec.주차 - spec.주차_내역합))}대 차이</span>` : '';
    const kp = k && Number(k.주차) ? `<br><span class="muted">K-apt ${fmt(k.주차)}대${(k.주차_지상 || k.주차_지하) ? ` (지상 ${fmt(k.주차_지상 || 0)}·지하 ${fmt(k.주차_지하 || 0)})` : ''}</span>` : '';
    add('주차', (spec.주차 || kp) ? `${spec.주차 ? `${fmt(spec.주차)}대${mix}${per}${gap}` : '<span class="muted">대장에 없음</span>'}${kp}` : '');
    const ev = k ? (k.전기차_지상 || 0) + (k.전기차_지하 || 0) : 0;
    if (ev) add('전기차 충전기', `${fmt(ev)}기 <span class="muted">(K-apt${(k.전기차_지상 && k.전기차_지하) ? ` · 지상 ${fmt(k.전기차_지상)}·지하 ${fmt(k.전기차_지하)}` : ''})</span>`);
    if (k && k.CCTV) add('CCTV', `${fmt(k.CCTV)}대 <span class="muted">(K-apt)</span>`);
  }
  /* ★ 승용 0 + 비상용 N 은 **모순이다.** 비상용 승강기가 있는 건물에 승용이
     0 대일 수 없다(보통 겸용으로 잡힌다). 0 을 살리기로 했다고 해서 모순까지
     사실처럼 단정하면 안 된다 — '없음' 이라고 적으면 그게 확인된 사실로 읽힌다.
     주차의 7대 차이와 같은 취급: **어긋난다고 적고 판단은 사람에게 넘긴다.** */
  {
    const el = [];
    if (has(spec.승강기)) el.push(spec.승강기 ? `승용 ${fmt(spec.승강기)}` : '승용 0');
    if (has(spec.비상용)) el.push(`<span class="muted">비상 ${fmt(spec.비상용)}</span>`);
    /* ★ 원인을 추측해 적지 않는다. 한때 여기에 "동별로 일부만 기재된 것으로
       보입니다" 라고 써 뒀다가 실측에서 깨졌다 — 57232 는 24개 동 **전부**
       승용이 명시적으로 0 이었다(NULL 이 아니라 0). 부분 기재가 아니다.
       사실만 적고 원인은 비워 둔다. 모르는 것을 아는 척하면 그게 화면에 박힌다. */
    const odd = spec.승강기 === 0 && spec.비상용 > 0
      ? ` <span class="muted">· 승용이 0 으로 기재돼 있습니다 (확인 필요)</span>` : '';
    add('승강기', el.length ? el.join(' · ') + odd : '', dongOnly, dongNote);
  }

  grp('구조');
  add('구조', spec.구조 ? esc(spec.구조) : '', dongOnly, dongNote);
  add('지붕', spec.지붕 ? esc(spec.지붕) : '', dongOnly, dongNote);
  if (k && k.복도) add('복도 유형', `${esc(k.복도)} <span class="muted">(K-apt)</span>`);
  if (k && k.난방) add('난방', `${esc(k.난방)} <span class="muted">(K-apt)</span>`);

  grp('공사');

  /* 허가 -> 착공 -> 사용승인. 없는 단계는 적지 않는다. */
  const ym = v => (v ? 날짜(v, null) : null);
  const steps = [['허가', ym(spec.허가일)], ['착공', ym(spec.착공일)], ['사용승인', ym(spec.사용승인)]]
    .filter(([, v]) => v);
  지금.push(`<dt>공사</dt><dd${steps.length ? ' class="flow"' : ''}>${
    steps.length
      ? steps.map(([k, v]) => `<span><i>${k}</i>${v}</span>`).join('<em>→</em>')
      : gapCell('', 'EMPTY')}</dd>`);

  /* 349 (2026-10-24 사장님 "위반건축물 표시하면 좋긴해"): 대장 위에 찍히는 '위반건축물' 표시 — GIS건물통합정보(국가공간정보센터) violt_bild.
     ★ 동마다 대장에 이어진 것만 센다. 하나도 안 이어졌으면 줄을 안 그린다(모름 ≠ 없음). 일부만 이어졌으면 몇 동을 봤는지 적는다. */
  {
    const 동들 = (dongs || []).filter(d => !d.is_recap);
    const 본 = 동들.filter(d => d.위반 === 'Y' || d.위반 === 'N');
    if (본.length) {
      const 위 = 본.filter(d => d.위반 === 'Y');
      const 범위 = 본.length < 동들.length ? ` <span class="muted">· ${fmt(동들.length)}개 동 중 ${fmt(본.length)}개 동 확인</span>` : '';
      grp('대장 표시');
      add('위반건축물', (위.length
          ? `<span class="pill r">위반건축물</span> ${위.map(d => `<span title="이 동 자료 변경일 ${esc(d.위반기준일 || '모름')}">${dongLabel(d, 동들.length)}</span>`).join(', ')}${위.length > 1 ? ` (${fmt(위.length)}개 동)` : ''}`
          : '표시 없음') + 범위
        + `<br><span class="muted">GIS건물통합정보(건축물대장의 위반건축물 표시 · 국가공간정보센터) — 위반 내용 · 시정 여부는 원천에 없습니다</span>`);
    }
  }

  grp('인증');

  add('에너지효율', spec.에너지등급 ? esc(spec.에너지등급) + '등급'
    + (spec.에너지절감 ? ` <span class="muted">· 절감 ${n1(spec.에너지절감)}%</span>` : '')
    + (spec.epi ? ` <span class="muted">· EPI ${n1(spec.epi)}</span>` : '') : '');
  add('녹색건축', spec.녹색건축 ? esc(spec.녹색건축) : '');
  add('지능형건축물', spec.지능형건축물 ? esc(spec.지능형건축물) : '');

  /* ★ 줄이 하나도 없는 묶음은 안 그린다(제목만 남으면 소음이다).
     ★ 줄은 있는데 **전부 비어 있는** 묶음은 그리되 눈에서 물러나게 한다.
       지우면 안 된다 - '줄이 없으면 왜 비었지도 없다'(위 주석의 원칙).
       창덕궁의 '인증' 이 그렇다: 3줄 전부 대장에 값이 없다. */
  return sect('제원', 'bld', '', spec.기준 || '')
    + 묶음.filter(([, 줄]) => 줄.length)
          .map(([제목, 줄]) => {
            const 다빔 = 줄.every(x => x.includes('class="gap'));
            return `<div class="grp${다빔 ? ' dim' : ''}">${제목}</div>`
                 + `<dl class="grpdl${다빔 ? ' dim' : ''}">${줄.join('')}</dl>`;
          })
          .join('');
}

/* ---------------- 주변 탭 그리기 (교통 · 상권 · 병원·약국 · 교육) ----------------
   ★ 2026-10-30 사장님 "상권 학교는 못 붙여?" — 단지 상세 안에 있던 그리기를 함수로 뺐다. 단지 상세 · 공사 중 건물 · 승인 아파트가 **같은 그리기**를 쓴다.
     받는 칸은 단지 상세 응답과 같은 이름(poi · schools · subways …). 공사 중 · 승인은 /api/near/at(한 점 주변, 388)이 같은 모양으로 준다.
   ★ 단지 번호가 있어야 하는 덤 칸(심평원 병원 · 약국 인허가 · 어린이집)은 단지일 때만. */
function 주변판들(p) {
  const { complex: c, poi, poiSum, poiBrand, poiLife, schools, subways, busStops, schoolZone, schoolZoneLoaded, busRoutes, busList,
          좌표없음, kinders, kinderLoaded, academy, schoolList, schoolGroups, 받은자료, kapt } = p;
  const sch  = (schools || []);
  const kin  = (kinders || []);
  const sz   = (schoolZone || []);
  const br   = (busRoutes || []);
  const bl   = (busList || []);
  const 정류장묶음 = [];
  bl.forEach(x => {
    if (busStops && x.정류장 === busStops.가까운곳) return;
    let g = 정류장묶음.find(y => y.정류장 === x.정류장);
    if (!g) 정류장묶음.push(g = { 정류장: x.정류장, 거리: [], ars: [] });
    g.거리.push(x.거리m); if (x.ars) g.ars.push(x.ars);
  });
  const BTYPE = { '3': ['간선', 'bt3'], '4': ['지선', 'bt4'], '2': ['마을', 'bt2'],
                  '6': ['광역', 'bt6'], '15': ['심야', 'bt15'], '5': ['순환', 'bt5'],
                  '1': ['공항', 'bt1'], '7': ['인천', 'bt7'], '8': ['경기', 'bt8'],
                  '10': ['관광', 'bt10'], '14': ['한강', 'bt14'] };
  const sub  = (subways || []);
  const bus  = busStops || null;
  const pz = (poi || []);
  const pTot = k => pz.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const pOn  = (poiSum && Number(poiSum.단지내)) || 0;
  const pb   = (poiBrand || []).filter(b => Number(b.r1000) > 0);
  const pl   = (poiLife || []).filter(x => Number(x.r1000) > 0);
  const paneN = 좌표없음 ? `
    <div class="asknote scope"><span class="gap">SCOPE</span>
      이 단지는 중심좌표가 없어 지하철 · 버스를 거리로 찾을 수 없습니다(없는 게 아님)</div>` : `
    ${/* ★ 머리글 숫자는 **전체**다. 보여주는 수(4)를 적으면 그게 전부인 줄 안다 */''}
    ${sect('지하철', 'subway', sub.length ? ` ${fmt(Number(sub[0].전체) || sub.length)}` : '')}
    ${kapt && (kapt.지하철 || kapt.지하철도보) ? `<p class="note sm">K-apt 신고: ${esc(kapt.지하철 || '')}${kapt.지하철노선 ? ` <span class="muted">${esc(kapt.지하철노선)}</span>` : ''}${kapt.지하철도보 ? ` · 도보 ${esc(kapt.지하철도보)}` : ''}</p>` : ''}
    ${sub.length ? `
      <div class="schrow">${sub.map(x => `
        <div class="scell" data-pt="subway|${esc(x.역)}">
          <span class="sg">${Number(x.환승) ? '환승' : '역'}</span>
          <b>${esc(x.역)}</b>
          <span class="sd">${fmt(x.최단m)}m</span>
          <span class="sn">${esc(x.노선 || '')}</span>
        </div>`).join('')}</div>
      ${ (Number(sub[0].전체) || 0) > sub.length ? `<p class="note sm">1.5km 안 ${fmt(sub[0].전체)}곳 중 가까운 ${fmt(sub.length)}곳</p>` : ''}`
      : `<p class="note">${gapCell('', 'NA',
          '단지 1.5km 안에 도시철도 역이 없습니다')}</p>`}

    ${sect('버스', 'bus', bus && Number(bus.r500) ? ` ${fmt(bus.r500)}` : '')}
    ${kapt && kapt.버스도보 ? `<p class="note sm">K-apt 신고: 정류장까지 도보 ${esc(kapt.버스도보)}</p>` : ''}
    ${bus && Number(bus.r500) ? `
      ${/* ★ 20:05 사장님: 여기 올리면 **가장 가까운 정류장 한 점만**(전엔 500m 안 전부). data-pt-n=1 = 가까운 순 첫 점만 */''}
      <div class="zrow2" data-pt="bus|${esc(bus.가까운곳 || '')}" data-pt-n="1">
        <span class="zt">가장 가까운 정류장</span>
        <b>${fmt(bus.최단m)}m</b>
        <span class="sn">${esc(bus.가까운곳 || '')}</span>
      </div>
      ${/* ★ 2026-10-21: 전에는 **개수만** 있고 이름이 없었다. 번호 칩은 '노선'
            이라 단위가 다르다 — 정류장은 정류장대로 적는다.
            한 줄에 올리면 **그 정류장만** 지도에 찍힌다(data-pt 의 키). */''}
      ${bl.length ? `<div class="stoplist">${정류장묶음.map(x => `
        <div class="stoprow" data-pt="bus|${esc(x.정류장)}" title="누르면 지도에 고정합니다">
          <b>${esc(x.정류장 || '—')}</b>
          <span class="sd">${x.거리.map(m => fmt(m)).join(' · ')}m</span>
          ${x.ars.length ? `<span class="sn">ARS ${x.ars.map(a => esc(a)).join(' · ')}</span>` : ''}
        </div>`).join('')}</div>
        ${(Number(bl[0].전체) || 0) > bl.length ? `<p class="note sm">정류장 ${fmt(bl[0].전체)}곳 중 가까운 ${fmt(bl.length)}곳</p>` : ''}` : ''}
      ${(() => {
        /* ★ 거리대로 **갈라서** 보여준다(2026-10-20). 전에는 번호 칩을 한 덩어리로
           쏟아 놓고 위에 '6 / 300m · 19 / 500m · 184 가장가까움' 세 숫자만 두어서,
           **어느 번호가 300m 인지 알 수 없었다.** 게다가 6·19 는 정류장 수인데
           칩은 노선이라 단위가 섞여 있었다 - 둘을 따로 적는다. */
        const r300 = Number(bus.r300) || 0, r500 = Number(bus.r500) || 0;
        const 칩 = (x) => {
          const t = BTYPE[String(x.종류)] || ['', 'bt0'];
          /* ★ 2026-10-21: 번호 칩에도 점 표시를 붙인다. 전에는 '가장 가까운
             정류장' 한 줄에만 있어서, 번호에 올리면 아무 일도 안 났다. */
          return `<span class="bno ${t[1]}" data-pt="busroute|${esc(x.번호)}"`
               + ` title="${esc(t[0])} · 가장 가까운 정류장 ${fmt(x.최단m)}m">${esc(x.번호)}</span>`;
        };
        const 묶음 = (제목, 정류장, 목록) => {
          if (!목록.length) return '';
          const 잘림 = 목록.length > 30;
          return `<div class="busgrp">
            <div class="bgh">${esc(제목)}
              <span class="sn">정류장 ${fmt(정류장)}곳 · 노선 ${fmt(목록.length)}개${
                잘림 ? ' (30개만)' : ''}</span></div>
            <div class="buses">${목록.slice(0, 30).map(칩).join('')}</div>
          </div>`;
        };
        const 가까이 = br.filter(x => Number(x.최단m) <= 300);
        const 멀리   = br.filter(x => Number(x.최단m) > 300);
        if (!br.length) return '';
        return 묶음('300m 안', r300, 가까이)
             + 묶음('300~500m', Math.max(0, r500 - r300), 멀리);
      })()}
      ${br.length ? `<p class="note sm" title="버스 노선을 아직 전부 받지 못해 여기 없는 번호가 있을 수 있습니다">노선 일부만 받음</p>` : ''}
      <p class="note sm">가장 가까운 정류장 <b>${esc(bus.가까운곳 || '—')}</b></p>`
      : `<p class="note">${Number(bus && bus.적재)
          ? gapCell('', 'NA', '단지 500m 안에 버스정류장이 없습니다')
          : gapCell('', 'SCOPE', '버스정류장을 아직 적재하지 않았습니다')}</p>`}




`;

  /* ★ 2026-10-24 10:29 사장님 "교통 · 상권 · 의료로 나누고 싶어" — 상권 탭(상가 점포 · 브랜드 · 생활 편의). 병원·약국 묶음은 의료 탭으로 */
  const paneC = 좌표없음 ? `
    <div class="asknote scope"><span class="gap">SCOPE</span>
      이 단지는 중심좌표가 없어 상권을 거리로 찾을 수 없습니다(없는 게 아님)</div>` : `
    ${sect('상권', 'poi', pz.length ? ` ${fmt(pTot('r500'))}` : '')}
    ${pz.length ? `
      <div class="poirow">
        <span><b>${fmt(pTot('r300'))}</b>300m</span>
        <span><b>${fmt(pTot('r500'))}</b>500m</span>
        <span><b>${fmt(pTot('r1000'))}</b>1km</span>
        <span><b>${fmt((poiSum && poiSum.업종수500) || 0)}</b>업종(500m)</span>
      </div>
      ${pb.length ? `<div class="brands">${pb.slice(0, 12).map(b => `
        <span class="bchip${Number(b.r500) ? '' : ' far'}" data-pt="brand|${esc(b.브랜드)}"
          data-pt-r="${Number(b.r500) ? 500 : 1000}"
          title="가장 가까운 곳 ${fmt(b.최단m)}m">${esc(b.브랜드)}${
          Number(b.r500) > 1 ? `<b>${fmt(b.r500)}</b>` : ''}</span>`).join('')}</div>
        ` : ''}
      ${pl.length ? `${생활묶음(pl).filter(([g]) => g !== '병원·약국').map(([g, xs]) => `
        <div class="lgrp"><span class="lgl">${esc(g)}<button type="button" class="sdet lgo" data-poilist="${esc(xs.map(x => x.항목).join(','))}" data-poinm="${esc(g)}" title="이 묶음의 점포 목록">목록 ›</button></span><div class="lifegrid">${xs.map(x => `
        <div class="lcell${Number(x.r500) ? '' : ' far'}" data-pt="life|${esc(x.항목)}"
             data-pt-r="${Number(x.r500) ? 500 : 1000}"
             title="가장 가까운 곳 ${fmt(x.최단m)}m">
          <b>${fmt(Number(x.r500) || Number(x.r1000))}</b>
          <span>${esc(x.항목)}${Number(x.r500) ? '' : ' <i>1km</i>'}</span></div>`).join('')}</div></div>`).join('')}
        ` : ''}
      <div class="lt2">그 밖에 많은 업종 (500m)</div>
      <div class="zlist">${pz.filter(r => Number(r.r500) > 0).slice(0, 8).map(r => `
        <div class="zrow"><span class="zn">${esc(r.소분류 || '')}</span>
          <span class="zbar"><i style="width:${
            (100 * Number(r.r500) / Math.max(1, Number(pz[0].r500))).toFixed(1)}%"></i></span>
          <b>${fmt(r.r500)}</b></div>`).join('')}</div>
      ${pOn ? `<p class="note sm">단지 안 점포 <b>${fmt(pOn)}곳</b></p>` : ''}
      `
      : `<p class="note">${(받은자료 && 받은자료['상가'])
          ? gapCell('', 'NA', '단지 500m 안에 상가업소가 없습니다')
          : gapCell('', 'SCOPE', '이 시군구의 상가업소를 아직 받아오지 않았습니다')}</p>`}

`;

  /* ★ 2026-10-24 병원·약국 탭 — 심평원 병원(종별 · 큰 병원 · 간판 과목) · 행안부 약국 인허가 · 상가 업종 병원·약국(출처 갈라 적음) */
  const paneH = 좌표없음 ? `
    <div class="asknote scope"><span class="gap">SCOPE</span>
      이 단지는 중심좌표가 없어 병원·약국을 거리로 찾을 수 없습니다(없는 게 아님)</div>` : `
    ${c && c.complex_id ? `<div class="hirabox" data-hira="${esc(String(c.complex_id))}"></div>` : ''}
    ${c && c.complex_id ? `<div class="phbox" data-ph="${esc(String(c.complex_id))}"></div>` : ''}
    ${(() => { const g = pl.length ? 생활묶음(pl).find(([n]) => n === '병원·약국') : null; if (!g) return '';
      return `<div class="lt2">상가 업종으로 본 병원·약국 <span class="muted">(상가 데이터 — 위와 출처 다름)</span></div>
        <div class="lifegrid">${g[1].map(x => `
        <div class="lcell${Number(x.r500) ? '' : ' far'}" data-pt="life|${esc(x.항목)}" data-pt-r="${Number(x.r500) ? 500 : 1000}" title="가장 가까운 곳 ${fmt(x.최단m)}m">
          <b>${fmt(Number(x.r500) || Number(x.r1000))}</b><span>${esc(x.항목)}${Number(x.r500) ? '' : ' <i>1km</i>'}</span></div>`).join('')}</div>`; })()}
`;


  /* ★ 2026-10-24 교육 탭 — 어린이집 → 유치원 → 배정 초등 → 초 → 중 → 고 → 학원·교습소(교육청 등록, 01:09 사장님 "교육에 학원 넣자"). 상가 업종 '입시·보습학원' 은 상권 탭 생활 편의 그대로(출처가 다름) */
  const paneE = 좌표없음 ? `
    <div class="asknote scope"><span class="gap">SCOPE</span>
      이 단지는 중심좌표가 없어 어린이집 · 유치원 · 학교를 거리로 찾을 수 없습니다(없는 게 아님)</div>` : `
    ${c && c.complex_id ? `<div class="ccbox" data-cc="${esc(String(c.complex_id))}"></div>` : ''}
    ${sect('유치원', 'kinder', kin.length ? ` ${fmt(Number(kin[0].전체) || kin.length)}` : '')}
    ${kin.length ? `
      <div class="schrow">${kin.map(x => `
        <div class="scell" data-pt="kinder|${esc(x.이름 || '')}" data-pt-r="500">
          <span class="sg">${esc((x.설립 || '').replace(/\s/g, '') || '—')}</span>
          <b>${esc(x.이름 || '—')}</b>
          ${x.kinder_cd ? `<button type="button" class="sdet" data-kinder="${esc(x.kinder_cd)}" title="유치원 상세">자세히 ›</button>` : ''}
          <span class="sd">${fmt(x.거리m)}m${
            x.정원 != null ? ` · 정원 ${fmt(x.정원)}` : ''}${
            x.원아 != null ? ` · 원아 ${fmt(x.원아)}` : ''}</span>
          <span class="sn">${x.학급 != null ? `${fmt(x.학급)}학급` : ''}${
            x.운영시간 ? ' · ' + esc(x.운영시간) : ''}${
            x.공시 ? ` · <b>${esc(String(x.공시).slice(0, 4))}년 ${
              esc(String(x.공시).slice(4))}차 공시</b>` : ''}</span>
        </div>`).join('')}</div>
      ${(Number(kin[0].전체) || 0) > kin.length ? `<p class="note sm">500m 안 ${fmt(kin[0].전체)}곳 중 가까운 ${fmt(kin.length)}곳</p>` : ''}`
      : `<p class="note">${gapCell('', kinderLoaded ? 'NA' : 'SCOPE',
          kinderLoaded
            ? '이 단지 500m 안에 유치원이 없습니다'
            : '유치원을 아직 적재하지 않았습니다 — 없는 게 아니라 안 받은 것입니다')}</p>`}

    ${['초등학교', '중학교', '고등학교'].map(급 => 학교급칸(급, sch.find(x => x.학교급 === 급), (schoolList || []).filter(x => x.학교급 === 급),
        (schoolGroups || []).filter(x => x.급 === 급), schoolZoneLoaded)).join('')}
    ${[...(schoolList || []), ...(schoolGroups || [])].some(x => x.학생 != null) ? `<p class="note sm">학교알리미 ${esc(String(Math.max(...[...(schoolList || []), ...(schoolGroups || [])].filter(x => x.공시연도).map(x => Number(x.공시연도)))))}년 공시</p>` : ''}

    ${학원칸(academy)}
`;

  return { paneN, paneC, paneH, paneE };
}

function renderDetail(payload) {
  lastDetail = payload;
  const { complex: c, dongs, parcels, tradeStats, offsite, spec, permits, permitDongs, kapt, cost,
          floors, hos, scope, 호총수, 전용률, 호공시, 공시적재, 거래목록, zones, redev, poi, poiSum, poiBrand, poiLife, schools, subways, busStops, schoolZone, schoolZoneLoaded, vlrat, busRoutes, busList, 좌표없음, kinders, kinderLoaded, jeonse, academy, schoolList, schoolGroups, 받은자료 } = payload;
  /* 10-30 사장님 "새 UI 말고 일반 건대장 있는 단지상세처럼만" — 대장 전 건물(공사 중 · 승인)도 **이 그리기 그대로**. 가상 = 그 표시(/api/virtual) */
  const V = payload.가상 || null;
  그리는가상 = V;
  /* 실거래는 평형(전용면적) 단위로 묶어서 본다. 동/호 특정은 하지 않는다.
     (아파트 매매 말고는 동 정보가 API 에 아예 없다. ../Teomoony/CONTEXT.md 4절) */
  const stats = tradeStats || [];
  const pyeong = a => (Number(a) / 3.3058).toFixed(1);
  const mon = ymd;          // 거래일은 일자까지 있다
  const range = (lo, hi) => (lo == null || hi == null || Number(lo) === Number(hi))
    ? '' : `<span class="muted">${eok(lo)}~${eok(hi)}</span>`;

  /* 평형을 표가 아니라 카드로 낸다.
     7열 표는 376~520px 패널에 안 맞았다 — '범위'·'직거래' 는 대개 비어 있는데
     자리를 차지하고, 부속 줄(실제 전용면적·층)이 칸마다 따로 놀아 행이 들쭉날쭉했다.
     **없는 값은 줄을 만들지 않는다**는 원칙을 표에서는 지킬 수 없다. */
  /* ---- 평형 고르기 (2026-10-18) ----
     ★ 이 필터는 실거래 섹션 밖으로 나가지 않는다. 전역 필터로 올리면
       적재 범위가 다른 축이 **안 걸리는데 걸린 것처럼** 보인다.
       (2026-10-18 정정: '대장에는 호별 전용면적이 없다' 고 적어 뒀는데
        전유공용면적을 올리면서 생겼고, 격자에도 평형 칩이 붙었다. 다만
        그건 장위동·수색동만이고 실거래는 전 단지라 **범위가 다르다** —
        그래서 상태를 합치지 않고 hoArea 를 따로 뒀다.)
     ★ 매매와 전월세에 **같이** 건다. "내 평형이 얼마" 를 보려는 것이지
       매매만 보려는 게 아니다. 한쪽에 그 평형 거래가 없으면 **없다고 적는다** —
       필터가 걸렸는데 섹션이 비면 버그인지 없는 건지 구분이 안 된다. */
  /* ★ 키는 **문자열로 통일한다.** area_grp 는 SQL 에서 CAST(.. AS INT) 라
       숫자로 오고, data-area 로 갔다 오면 문자열이 된다. 섞어 쓰면
       `[59,65,84].includes("84")` 가 false 라 **누를 때마다 전체로 되돌아간다**
       — 실제로 그랬다(2026-10-18, 화면에서 잡음). 타입이 조용히 갈리는 자리다. */
  /* ★ 2026-10-20: area_grp 가 **NULL 일 수 있다**(면적 미상). 전에는 그런 거래를
     서버가 통째로 버려서 화면이 "실거래가 없습니다" 라고 거짓말을 했다.
     이제 버리지 않으므로 여기서 받아야 한다. String(null) 은 "null" 이라
     칩에 'null㎡' 가 찍힌다 — 빈 문자열을 미상의 키로 쓴다. */
  /* ★ 키에 **출처**를 섞는다 (2026-10-20). 상업업무용은 전용면적이 아니라
     건물면적으로 온다 — 전용 84㎡ 와 건물 84㎡ 는 다른 것을 잰 수라
     같은 칩으로 묶으면 안 된다. */
  const akey = r => (r.area_grp == null ? '' : String(r.area_grp) + (r.area_src && r.area_src !== '전용' ? '|' + r.area_src : ''));
  /* 칩/행에 보일 이름. '전용' 은 기본이라 안 적는다 — 늘 붙어 있으면 뜻이 없다. */
  const alabel = r => (r.area_grp == null ? AREA_미상
    : (r.area_src && r.area_src !== '전용' ? r.area_src + ' ' : '') + r.area_grp + '㎡');
  const alabelKey = k => { if (k === '') return AREA_미상;
    const [n, src] = String(k).split('|'); return (src ? src + ' ' : '') + n + '㎡'; };
  const AREA_미상 = '면적 미상';
  const areaKeys = [...new Set(stats.map(akey))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : Number(a) - Number(b)));  // 미상은 맨 뒤
  if (tradeArea !== null && !areaKeys.includes(tradeArea)) tradeArea = null;  // 단지가 바뀌면 푼다
  const areaPick = areaKeys.length > 1 ? `<div class="apick">
      <button type="button" class="achip" data-area="" aria-selected="${tradeArea === null}">전체</button>${
      areaKeys.map(k => {
        const n = stats.filter(r => akey(r) === k).reduce((s, r) => s + (r.cnt || 0), 0);
        return `<button type="button" class="achip" data-area="${esc(k)}"
                 aria-selected="${tradeArea === k}">${
                 esc(alabelKey(k))}<b>${fmt(n)}</b></button>`;
      }).join('')}</div>` : '';

  const statTable = (list0, label) => {
    /* ★ rent/off 를 **정렬보다 먼저** 만든다. 아래 정렬이 off 를 쓰는데
       const 는 선언 전에 쓰면 그 자리에서 터진다(TDZ). */
    const rent = label !== '매매';
    const off = !rent && hideDirect;            // 직거래 제외는 매매에만 의미가 있다
    const list0b = tradeArea === null ? list0 : list0.filter(r => akey(r) === tradeArea);
    /* ★ 2026-10-20 사용자 요청: **최신 거래일이 맨 위로.**
       전에는 서버가 준 순서(평형 오름차순)였다. 사람이 먼저 보고 싶은 것은
       '작은 평형' 이 아니라 '방금 거래된 것' 이다.
       ★ 프런트에서 정렬한다 — 직거래 제외 토글을 켜면 보이는 날짜가
         b_last_ymd 로 바뀌는데, 서버 ORDER BY 로는 그걸 못 따라간다.
         **화면에 찍히는 바로 그 날짜**로 줄을 세워야 어긋나지 않는다.
       ★ 날짜가 없는 줄은 **맨 뒤**로 보낸다. 지우지 않는다 — 거래는 있는데
         날짜만 없는 경우가 있고, 그것도 보여야 한다. */
    const 그날 = r => (off ? r.b_last_ymd : r.last_ymd) || '';
    const list = [...list0b].sort((a, b) => {
      const A = 그날(a), B = 그날(b);
      if (A && B && A !== B) return B.localeCompare(A);   // 최신 먼저
      if (!A !== !B) return A ? -1 : 1;                   // 날짜 없는 것은 뒤로
      return (a.area_grp ?? 0) - (b.area_grp ?? 0);       // 같으면 평형 순
    });
    if (!list.length) {
      if (!list0.length) return '';       // 원래 없던 섹션은 그대로 안 그린다
      return sect(label, 'rtms', '') +
        `<p class="note">${gapCell('', 'EMPTY',
          `${esc(alabelKey(tradeArea))} 의 ${label} 거래가 `
          + `없습니다 — 다른 평형에는 있습니다`)}</p>`;
    }
    const n = list.reduce((s, r) => s + ((off ? r.b_cnt : r.cnt) || 0), 0);
    const canc = list.reduce((s, r) => s + (r.canceled_cnt || 0), 0);
    const direct = list.reduce((s, r) => s + (r.direct_cnt || 0), 0);
    const rgst = list.reduce((s, r) => s + (r.rgst_cnt || 0), 0);
    /* 등기 지연 (2026-10-19). 평형별 평균을 **건수로 가중**해 단지 평균을 낸다 -
       평형 평균을 그냥 평균하면 거래 1건짜리 평형이 과대 대표된다. */
    const dlyN   = list.reduce((t, r) => t + (r.rgst_delay_avg != null ? (r.rgst_cnt || 0) : 0), 0);
    const dlyAvg = dlyN ? list.reduce((t, r) => t + (r.rgst_delay_avg != null
                     ? r.rgst_delay_avg * (r.rgst_cnt || 0) : 0), 0) / dlyN : 0;
    const dlyMax = list.reduce((t, r) => Math.max(t, r.rgst_delay_max || 0), 0);
    const slow   = list.reduce((t, r) => t + (r.rgst_slow_cnt || 0), 0);
    const all = list.reduce((s, r) => s + (r.cnt || 0), 0);
    const share = list.reduce((s, r) => s + (r.share_cnt || 0), 0);
    const preN = list.reduce((s, r) => s + (r.pre_cnt || 0), 0);

    /* ★ 2026-10-22 19:10 사장님 "('전체' 의 평형 요약 줄도) ㅇㅇ 빼" — 평형별 건수는 위 칩에, 거래는 아래 '거래 내역' 에 있다.
       '전체' 에서는 줄을 아예 안 그린다. 평형을 고르면 한 줄(건수·범위·해제)만 남긴다. */
    const cards = tradeArea === null ? '' : list.map(r => {
      const cnt = off ? r.b_cnt : r.cnt;
      if (off && !cnt) return '';              // 직거래뿐인 평형은 제외하면 남는 게 없다
      const lastAmt = off ? r.b_last_amount : r.last_amount;
      const lastYmd = off ? r.b_last_ymd : r.last_ymd;
      const lo = off ? r.b_min_amount : r.min_amount;
      const hi = off ? r.b_max_amount : r.max_amount;

      /* ★ 2026-10-20: `r.last_monthly ?` 로 보면 안 된다. mssql 드라이버가 큰 수를
         **문자열**로 주기 때문에 월세 0 이 `"0"` 으로 와서 **참**이 되고,
         전세에 '/ 0만' 이 붙었다. 숫자로 바꿔 비교한다.
         ★ 같은 함정이 또 있을 수 있다 — 금액 칸을 참/거짓으로 보는 자리는 전부 의심할 것. */
      const 월세 = Number(r.last_monthly) || 0;
      const price = rent
        ? eok(r.last_deposit) + (월세 > 0
            ? ` <span class="mo">/ ${fmt(Math.round(월세 / 10000))}만</span>` : '')
        : eok(lastAmt);
      const when = [lastYmd ? `최근 ${ymd(lastYmd)}` : null,   // 이 줄의 금액은 그 평형의 '최근 거래' 다(2026-10-22)
                    r.min_floor ? (r.min_floor === r.max_floor
                      ? `${r.min_floor}층` : `${r.min_floor}~${r.max_floor}층`) : null]
                   .filter(Boolean).join(' · ');

      /* 꼬리표는 **있을 때만**. 비어 있는 칸을 만들지 않는다. */
      const tags = [];
      const rg = rent ? range(r.min_deposit, r.max_deposit) : range(lo, hi);
      if (rg) tags.push(`범위 ${rg.replace(/<[^>]+>/g, '')}`);
      if (r.area_kinds > 1) tags.push(`전용 ${esc(r.areas || '')}`);
      else if (r.areas) tags.push(`전용 ${esc(r.areas)}㎡`);
      /* ★ 2026-10-21 (세 번째 손질): 해제는 **아래 '거래 내역' 목록에 건별로** 나온다.
         여기 줄을 또 그리면 같은 사실이 두 군데가 되므로 뺐다(사장님 지시).
         ⚠ 다만 **개수는 남긴다.** 거래 내역은 종류별 **최근 120건**만 받으므로
           오래된 해제는 그 목록에 안 잡힌다 — 84㎡ 는 해제가 32건인데 목록에는
           2건만 보였다. 개수까지 빼면 **나머지 30건의 존재가 사라진다.**
         ⚠ 꼬리표에 섞이므로 '범위' 와 헷갈리지 않게 **경고색 + 물음표 도움말**을 붙인다.
           범위·건수·최근은 전부 유효 거래만 센 값이다. */
      if (r.canceled_cnt) tags.push(
        `<span class="warnx">${용어('해제')} ${fmt(r.canceled_cnt)}</span>`);
      if (!rent && r.direct_cnt) tags.push(`<span class="warnx">직거래 ${fmt(r.direct_cnt)}</span>`);
      if (!rent && r.share_cnt) tags.push(`<span class="warnx">지분 ${fmt(r.share_cnt)}</span>`);
      if (rent && r.renew_cnt) tags.push(`갱신 ${fmt(r.renew_cnt)}${
        r.rr_cnt ? ` (권 ${fmt(r.rr_cnt)})` : ''}`);
      if (rent && r.pre_cnt) tags.push(
        `<span class="${r.pre_rate >= 0 ? 'up' : 'down'}">종전 대비 ${
          r.pre_rate >= 0 ? '+' : ''}${(r.pre_rate * 100).toFixed(1)}%</span>`);

      /* ★ 2026-10-22 사장님 (52940 66㎡): 평형 하나를 고르고 그 평형이 **1건**이면 이 줄과 아래 '거래 내역' 이
         **같은 거래를 두 번** 보여 헷갈린다 → 줄 대신 한 줄 안내(꼬리표만 남긴다). 2건 이상이면 줄을 둔다(범위·건수가 뜻이 있다). */
      /* ★ 17:56 사장님 "요약 줄 없애는 게 좋아 — 결국 중복 2개" → 평형 하나를 고르면 **건수와 관계없이** 요약 줄을 빼고
         한 줄(건수 · 범위 · 해제 수)만 둔다. 해제 수는 남긴다 — 거래 내역은 최근 120건만이라 오래된 해제는 거기 없다.
         '전체' 에서는 평형끼리 견주는 표라 줄을 둔다(거래 내역은 평형이 섞인 날짜순이다). */
      if (tradeArea !== null)
        return `<p class="srcline">${r.area_grp == null ? AREA_미상 : esc(alabel(r))} ${label} ${fmt(cnt)}건${
          tags.length ? ` <span class="muted">· ${tags.join(' · ')}</span>` : ''}</p>`;
      return `<div class="prow">
        <div class="pa">${r.area_grp == null
          ? `<b>${AREA_미상}</b><span class="muted">API 미제공</span>`
          : `<b>${esc(alabel(r))}</b><span>${pyeong(r.avg_area)}평</span>`}</div>
        <div class="pb"><b>${price}</b>${when ? `<span>${when}</span>` : ''}</div>
        <div class="pc">${fmt(cnt)}건</div>
        ${tags.length ? `<div class="pm">${tags.join('<em>·</em>')}</div>` : ''}
      </div>`;
    }).join('');

    /* ★ 2026-10-21 QA: 가운뎃점이 빠져 있었다. `.sect` 가 flex(gap 7px)라
       "매매 12" 와 "4개 평형" 이 **구분 없이 나란히** 놓여 '매매 12 4개 평형' 으로
       읽혔다 — 숫자 둘이 붙으면 어느 쪽이 무엇인지 알 수 없다.
       같은 뜻을 적는 윗자리(subsect)는 이미 ' · ' 를 쓴다. 규칙을 맞춘다. */
    return `${sect(label + ' ' + fmt(n), 'rtms', `<span class="muted">· ${fmt(list.length)}개 평형</span>`)}${
      !rent && direct ? `<label class="tgl"><input type="checkbox" id="nodirect"${
        hideDirect ? ' checked' : ''}> 직거래 제외</label>` : ''}
      ${!rent && all ? `<p class="srcline">중개 ${fmt(all - direct)} · 직거래 ${fmt(direct)}${
        share ? ` · 지분거래 ${fmt(share)}` : ''} · 등기일자 확인 ${fmt(rgst)}/${fmt(all)}${
        canc ? ` · 해제 ${fmt(canc)}` : ''}</p>` : ''}
      ${!rent && dlyN ? `<p class="srcline">등기까지 평균 <b>${Math.round(dlyAvg)}일</b>${dlyMax ? ` · 최장 ${fmt(dlyMax)}일` : ''}${
        slow ? ` · 180일 넘음 ${fmt(slow)}건` : ''}${(all - rgst) ? ` · 등기일자 없음 ${fmt(all - rgst)}건` : ''}</p>` : ''}
      ${rent && preN ? `<p class="srcline">종전 보증금 신고 ${fmt(preN)}건(갱신) · 변동률은 건별 평균</p>` : ''}
      <div class="plist">${cards}</div>`;
  };

  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const day = s => 날짜(s);

  /* ---- 헤더: 핵심을 한 줄로 ----
     세부는 탭 안에 둔다. 한 화면에 다 쌓으면 스크롤만 길고 뭐가 중요한지 안 보인다. */
  const yr = c.oldest_use_apr ? Number(c.oldest_use_apr.slice(0, 4)) : null;
  const age = yr ? new Date().getFullYear() - yr + 1 : null;
  const facts = [
    spec && spec.주용도 ? esc(spec.주용도) : '',
    c.hhld_cnt_sum ? fmt(c.hhld_cnt_sum) + '세대' : '',
    c.dong_cnt ? `${fmt(c.dong_cnt)}개동` : '',   /* 10-31: 동 수를 모르는 단지(청약 공고)에 '—개동' 이 찍혔다 */
    yr ? `${날짜(c.oldest_use_apr)}${age ? ` <span class="muted">(${age}년차)</span>` : ''}` : '',
    V && V.호 ? `${fmt(V.호)}호` : '',
    V && V.착공일 ? `착공 ${날짜(V.착공일)}` : '',
    V && !V.착공일 && V.착공예정일 ? `착공 ${날짜(V.착공예정일)} 예정` : '',
    V && V.사용검사예정일 ? `사용검사 ${날짜(V.사용검사예정일)} 예정` : '',
    V && V.공고일 ? `청약 공고 ${날짜(String(V.공고일).replace(/-/g, '').slice(0, 8))}` : '',
    V && V.입주예정 ? `입주 ${날짜(V.입주예정)} 예정` : '',
  ].filter(Boolean).join(' · ');
  const ratios = spec && (spec.용적률 || spec.건폐율)
    ? `용적률 ${spec.용적률 ? Number(spec.용적률).toFixed(0) + '%' : '—'} · 건폐율 ${
        spec.건폐율 ? Number(spec.건폐율).toFixed(0) + '%' : '—'}` : '';

  const dongN = dongs.filter(d => !d.is_recap).length;
  const saleN = stats.filter(r => !r.is_rent).reduce((a, r) => a + (r.cnt || 0), 0);
  const rentN = stats.filter(r => r.is_rent).reduce((a, r) => a + (r.cnt || 0), 0);

  /* 탭 이름은 사람 말로 쓰되, **가르는 기준은 출처**다. 한 탭 = 한 축.
     주제로 가르면 한 탭 안에 대장·VWorld·지적도가 섞이고, 숫자가 어긋날 때
     어느 축 문제인지 알 수 없다. 출처는 각 섹션의 배지가 말한다. */
  /* ★ 탭을 축 단위로 쪼갰다 (2026-10-18).
     전에는 `단지정보` 하나에 **일곱 덩어리**가 쌓여 있었다 — 제원·요약·K-apt·
     관리비·인허가·배치도·동 목록. 스크롤이 길어서 뭐가 있는지 모른 채 지나친다.

     쪼개는 기준은 길이가 아니라 **축**이다. 이 프로젝트는 축마다 적재 범위가
     다르고(빈칸 사유가 거기서 나온다), 한 탭 안에 범위가 다른 축이 섞이면
     "무엇이 없어서 무엇이 안 보이는지" 가 흐려진다.

       단지정보  표제부·총괄표제부      — 이 단지가 무엇인가
       동·호     동/층별개요/전유부     — 어떻게 생겼나
       관리      K-apt                  — 사는 정보 (대장에 없는 축)
       실거래    국토부 실거래          — 얼마인가
       토지·허가 PNU 축                 — 이 땅은 무엇인가
     ★★ 2026-10-23 사장님 원칙("중복 없고 · 이어진 데이터를 보기 좋게") 로 **축(출처)이 아니라 주제**로 다시 나눴다:
       단지정보 = 규모 · 설비 · 구조 · 공사(대장 + K-apt 같은 칸 · 인허가) / 땅 = 이 땅의 역사 · 필지 · 용도지역(대장 + 지도 비중 + 토지이용계획) · 정비 · 옛 대장 /
       동·호 = 배치도 · 동 · 공시가격 / 실거래 = 거래 · 전세가율 · 다른 지번 / 주변 = 교통(거리 + K-apt 도보) · 학교 · 상권 … / 관리 = K-apt 운영 · 관리비.

     ★ 건축인허가를 `토지·허가` 로 옮긴 이유: 인허가는 **PNU 로 떨어진다**.
       단지에 매달린 축이 아니라 **지번에 매달린 축**이고, 그건 필지·건물
       외곽선과 같은 자리다. "이 땅에 뭘 지으려 했나" 는 "이 땅이 무엇인가" 와
       한 묶음이다. (10-6 의 미해결 — 합필 전 지번 때문에 아파트에 안 붙는
       문제도 이 자리에 있어야 눈에 띈다) */
  /* ★ 선언을 TABS **앞**으로 올린다 - 탭 라벨의 숫자(nearN)가 이걸 쓴다.
     아래에 그냥 뒀더니 `Cannot access 'sub' before initialization` 이다. */
  const sch  = (schools || []);
  const kin  = (kinders || []);
  const sz   = (schoolZone || []);
  const br   = (busRoutes || []);
  const bl   = (busList || []);
  /* ★ 20:00 사장님: 이름이 같은 정류장(길 양쪽 · 방향만 다름)은 **한 줄**로. 지도에는 두 점이 다 찍힌다
     (data-pt 의 키가 정류장 이름이라 같은 이름이 다 나온다). 순서는 가까운 쪽 기준 그대로. */
  const 정류장묶음 = [];
  bl.forEach(x => {
    /* ★ 20:05: 위 '가장 가까운 정류장' 과 같은 이름은 목록에서 뺀다(사장님 — 겹쳐 보일 필요 없음) */
    if (busStops && x.정류장 === busStops.가까운곳) return;   /* bus 는 아래에서 선언된다 — busStops 를 직접 */
    let g = 정류장묶음.find(y => y.정류장 === x.정류장);
    if (!g) 정류장묶음.push(g = { 정류장: x.정류장, 거리: [], ars: [] });
    g.거리.push(x.거리m); if (x.ars) g.ars.push(x.ars);
  });
  /* 버스 종류 — 노선명으로 실측해서 정한 코드다(추측 아님).
     1 공항 · 2 마을 · 3 간선 · 4 지선 · 5 순환 · 6 광역 · 7 인천 ·
     8 경기 · 10 관광 · 14 한강 · 15 심야 */
  const BTYPE = { '3': ['간선', 'bt3'], '4': ['지선', 'bt4'], '2': ['마을', 'bt2'],
                  '6': ['광역', 'bt6'], '15': ['심야', 'bt15'], '5': ['순환', 'bt5'],
                  '1': ['공항', 'bt1'], '7': ['인천', 'bt7'], '8': ['경기', 'bt8'],
                  '10': ['관광', 'bt10'], '14': ['한강', 'bt14'] };
  const sub  = (subways || []);
  const bus  = busStops || null;

  /* ★ '주변' 을 단지정보 **바로 뒤**에 둔다(2026-10-19).
       집을 고를 때 묻는 순서가 '무슨 건물인가 -> 어디에 있는가' 다.
       동·호/관리/실거래는 그 다음에 따져 보는 것들이다. */
  /* ★ 2026-10-21 QA: 지하철을 **그린 줄 수**(sub.length, 최대 4)로 세고 있었다. 지하철 머리글은
     '전체'(브라운스톤 돈암 6 · 센트라스 11)인데 탭에는 4만 들어가 두 숫자가 어긋났다.
     같은 사실은 한 곳에서 — 머리글과 같은 '전체' 를 쓴다(작업방식 10장). */
  const subN = sub.length ? (Number(sub[0].전체) || sub.length) : 0;
  /* 2026-10-24 학교는 '교육' 탭으로 — 주변 숫자는 지하철 + 버스(500m) 만 */
  const nearN = subN + (bus && Number(bus.r500) || 0);
  /* ★ 2026-10-24 10:36 사장님 "연관성 있는 것끼리 순서" — 세 묶음(묶음 사이에 가는 줄):
       ① 이 단지 — 단지정보 · 동·호 · 관리 · 토지  (건물 · 호 · 사는 정보 · 그 땅)
       ② 가격    — 실거래 · 분양·청약              (거래된 값 · 처음 판 값)
       ③ 주변    — 교통 · 교육 · 상권 · 병원·약국   (어디에 있나 · 집 고를 때 묻는 순서)
     각 줄의 4번째 칸 = 묶음 이름(탭 줄 구분선용) */
  const TABS = [
    ['info',  `단지정보`, '단지'],
    ['dong',  `동·호 <b>${fmt(dongN)}</b>`, '단지'],
    ['mgmt',  `관리`, '단지'],
    ['land',  `토지 <b>${fmt(parcels.length)}</b>`, '단지'],   /* 2026-10-24 사장님 "땅 보다는 토지로" */
    ['price', `실거래 <b>${fmt(saleN + rentN)}</b>`, '가격'],
    /* 2026-10-22 사장님 "청약을 왜 실거래 탭에 놨어?" — 분양·청약을 따로 탭으로. 이어진 공고가 있을 때만 보인다(분양탭확인). */
    ['sale',  `분양·청약${분양수(c.complex_id) ? ` <b>${fmt(분양수(c.complex_id))}</b>` : ''}`, '가격'],
    ['near',  `교통 <b>${fmt(nearN)}</b>`, '주변'],     /* 2026-10-24 10:29 "교통 · 상권 · 의료로 나누고 싶어" — 지하철 · 버스 */
    /* 2026-10-24 "어린이집·유치원·초등·중등·고등은 분리" — 나이 순 · 학원(교육청 등록)까지 */
    ['edu',   `교육`, '주변'],
    ['shop',  `상권${(poi || []).length ? ` <b>${fmt((poi || []).reduce((t, r) => t + (Number(r.r500) || 0), 0))}</b>` : ''}`, '주변'],   /* 숫자 = 상권 칸 머리글과 같은 500m 합 */
    ['med',   `병원·약국`, '주변'],
  ];
  const TAB_KEYS = TABS.map(t => t[0]);
  if (!TAB_KEYS.includes(detailTab)) detailTab = 'info';

  /* 거래 종류 탭. 서버가 is_wolse 로 갈라서 준다. */
  const 거래분류 = [
    ['매매', r => !r.is_rent],
    ['전세', r => r.is_rent && !r.is_wolse],
    ['월세', r => r.is_rent && r.is_wolse],
  ];
  if (!거래분류.some(([n]) => n === 거래탭)) 거래탭 = '매매';
  /* 고른 탭이 0건이면 **있는 탭으로 옮겨 준다** — 처음 열었을 때 빈 화면을 보여
     '고장났나' 하게 만들지 않는다. 사용자가 직접 고른 뒤에는 건드리지 않는다. */
  if (!탭수동 && !stats.some(거래분류.find(([n]) => n === 거래탭)[1])) {
    const 있는것 = 거래분류.find(([, f]) => stats.some(f));
    if (있는것) 거래탭 = 있는것[0];
  }
  const 고른거래 = 거래분류.find(([n]) => n === 거래탭);
  const 거래탭UI = stats.length ? `<div class="apick tpick">${거래분류.map(([이름, f]) => {
      const n = stats.filter(f).reduce((t, r) => t + (r.cnt || 0), 0);
      return `<button type="button" class="achip" data-trade="${이름}"
                aria-selected="${거래탭 === 이름}">${이름}<b>${fmt(n)}</b></button>`;
    }).join('')}</div>` : '';

  const paneS = V ? 가상분양칸(V) : `<div class="ahbox" data-ah="c|${c.complex_id}"><p class="note muted">불러오는 중…</p></div>`;
  const paneP = `
    ${stats.length ? `` : ''}
    ${거래탭UI}
    ${areaPick}
    ${statTable(stats.filter(고른거래[1]), 거래탭)}
    ${tradeList(거래목록, 거래탭, tradeArea)}
    ${jeonseBlock(jeonse, tradeArea)}
    ${offsiteBlock(offsite)}
    ${stats.length ? '' : V ? 대장전말(V, '실거래') : `<p class="note">${gapCell('', 'NA',
        '이 단지에 이어진 실거래가 없습니다 — 거래가 없다는 뜻은 아닙니다(못 이음)')}</p>`}`;

  /* 주변 상권 (2026-10-19)
     ★ 반경과 '단지내상가' 는 **다른 축**이다 - 반경은 입지, 단지내는 그 단지의
       일부(PNU 로 코드 조인). 한 줄에 섞으면 둘 다 뜻을 잃는다.
     ★ **소분류**로 보여준다. 대분류(음식/소매/수리·개인)는 분류 체계의 말이다 -
       사람은 "편의점·카페·약국" 으로 생각한다. */
  /* ★ 건물 외곽선 목록을 **지도 응답에서** 만든다 (2026-10-21).
     전에는 상세(/api/complexes/:id)가 `buildings` 를 따로 내려줬다. 그런데 그 쿼리는
     /api/complexes/:id/buildings 와 **글자만 다른 같은 공간조인**이었고, select() 는
     그 둘을 동시에 부른다 - 즉 425,257행 footprint 에 대한 공간조인이 한 번 열 때
     **두 번** 돌았다. footprint 에 공간색인이 없어서 그게 상세 60초의 원인이었다.
     이제 한 응답에서 나오므로 **목록과 지도가 갈라질 수 없다**(작업방식 10장).

     ★ 그래서 이 수는 "지도에 실제로 그려진 건물 수" 다. 전에는 목록이 지도보다
       많을 수 있었다(/buildings 에만 geojson IS NOT NULL 이 있었다. 실측으로는
       geojson 이 NULL 인 행이 0건이어서 지금까지는 같았지만, 같다는 보장이 없었다).
     ★ 정렬은 서버가 하던 것과 같게 유지한다 - 층 내림, 그다음 면적 내림. */
  /* ★ **아직 안 온 것**과 **없는 것**을 가른다. select() 가 단지를 바꿀 때
     lastBgeo 를 null 로 두고, 외곽선이 도착하면 채운 뒤 다시 그린다.
     이 구분이 없으면 기다리는 동안 화면이 "0건" 이라고 **거짓말**을 한다. */
  const 외곽선대기 = lastBgeo === null;
  const 외곽선실패 = !!(lastBgeo && lastBgeo.실패);
  const buildings = (((lastBgeo || {}).features) || [])
    .map(f => f.properties || {})
    .sort((a, b) => (Number(b.gro_flo_co || 0) - Number(a.gro_flo_co || 0))
                 || (Number(b.area_m2_approx || 0) - Number(a.area_m2_approx || 0)));

  const pz = (poi || []);
  const pTot = k => pz.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const pOn  = (poiSum && Number(poiSum.단지내)) || 0;
  const pb   = (poiBrand || []).filter(b => Number(b.r1000) > 0);
  const pl   = (poiLife || []).filter(x => Number(x.r1000) > 0);

  const paneI = `
    ${specBlock(spec, c, vlrat, 전용률, 호총수, kapt, dongs)}
    ${permitBlock(permits, scope, permitDongs, c.complex_id)}
    ${sect('단지 요약', 'bld')}
    <dl>
      ${row('단지코드', c.complex_id)}${V ? row(V.키말, esc(V.pk)) : ''}
      ${spec ? '' : `${row('대장 동 / 건물', `${fmt(c.dong_cnt)} / ${c.bld_cnt == null ? '—' : fmt(c.bld_cnt)}`)}
      ${c.max_floor ? row('최고 층수', '지상 ' + fmt(c.max_floor) + '층') : ''}
      ${row('세대수', fmt(c.hhld_cnt_sum))}
      ${row('연면적', c.tot_area_sum ? fmt(Math.round(c.tot_area_sum)) + ' ㎡' : '—')}
      ${row('사용승인', day(c.oldest_use_apr))}`}
      ${row('대표지번', esc(c.rep_jibun || '—'))}
      ${c.centroid_lat ? row('좌표', `${Number(c.centroid_lat).toFixed(5)}, ${Number(c.centroid_lng).toFixed(5)}`) : ''}
    </dl>
    <div class="nearcards" data-nc="${esc(String(c.complex_id ?? ''))}"></div>
`;

  /* 주변 — 대중교통 / 학교 / 상권 (2026-10-19)
     ★ 단지정보 탭에 쌓다 보니 제원부터 상권까지 한 화면이 됐다.
       **축이 다르다** - 단지정보는 '이 건물이 무엇인가', 주변은 '어디에 있는가'.
       축이 다르면 탭을 나눈다. 실거래/관리를 나눠 둔 것과 같은 이유다.
     ★ 순서는 집을 고를 때 묻는 순서다: 지하철 -> 버스 -> 학교 -> 상권. */
  /* ★ 주변은 전부 **거리**로 찾는다. 좌표가 없으면 전부 0건이 되는데,
     그대로 두면 "500m 안에 없습니다" 라는 거짓말이 된다(2026-10-19).
     없는 것과 아직 못 본 것은 다르다 - 먼저 그렇게 말하고, 0건 목록은 안 그린다. */
  const { paneN, paneC, paneH, paneE } = 주변판들(payload);   /* 10-30: 공사 중 · 승인 상세도 같은 그리기를 쓴다 */

  /* 사는 정보 — K-apt 축. 대장에도 실거래에도 없는 것들이 여기 있다. */
  const _관리 = `
    ${kaptBlock(kapt)}
    ${costBlock(cost, { hhld: (spec && spec.세대) || c.hhld_cnt_sum, ...(scope || {}), 이음: Boolean(kapt), kapt코드: kapt && kapt.kapt_code })}`;
  /* ★ 2026-10-21 QA: 150세대 미만이면 두 칸이 **둘 다 일부러 비어** 탭이 통째로 빈 화면이었다
     (리얼파크2차 16세대). 칸마다 안내를 띄우면 잡음이지만, 탭 전체가 비면 '왜 비었나' 를 한 줄 적는다. */
  const paneM = V ? 대장전말(V, '관리비 · K-apt') : _관리.trim() ? _관리 : `<p class="note">${gapCell('', 'NA',
    'K-apt(공동주택관리정보) 대상이 아닙니다 — 의무관리 공동주택(150세대 이상 등)만 관리비를 공개합니다. '
    + `이 단지는 대장 기준 ${fmt((spec && spec.세대) || c.hhld_cnt_sum || 0)}세대입니다.`)}</p>`;

  /* 어떻게 생겼나 — 동/층별개요/전유부. 셋의 적재 범위가 서로 다르다. */
  const paneD = `
    ${structureBlock(dongs, floors, hos, scope, 호총수)}
    ${/* 2026-10-23: 공시가격 추이는 실거래 탭에서 여기로 — 호마다 매기는 값이라 동·호 배치도(호 칸 · 호 상세)와 한 자리 */''}
    ${/* 2026-10-24 사장님: 공시가격 추이는 호 상세(호 칸 누르면)와 중복 — 동·호 탭에서 뺐다 */''}

    ${/* 2026-10-24: 동 표(30줄)는 뺐다 — 위 동 단추로 고른 동의 정보가 단추 밑에 나온다 */''}
    ${/* 2026-10-23: '세대수가 축마다 다릅니다' 는 단지정보 제원의 세대 줄(총괄표제부 · K-apt 값을 같은 칸에)이 맡는다 — 중복 없음 */''}`;

  /* 이 땅은 무엇인가 — 전부 **PNU 로 떨어지는** 축이다(필지·건물외곽선·인허가). */
  /* 용도지역 (2026-10-19)
     ★ 0.5% 미만은 접는다. 필지와 용도지역은 **다른 사람이 다른 때 그린 폴리곤**
       이라 경계가 미세하게 어긋나고, 그 틈이 교차면적으로 잡힌다. 그대로 두면
       화면이 "이 단지는 1종일반주거에도 걸쳐 있다" 고 말하는데 그건 거짓말이다.
     ★ 그렇다고 조용히 버리지는 않는다. 무엇을 접었는지 아래에 적는다. */
  const zAll  = (zones || []).filter(z => z.용도지역);
  const zMain = zAll.filter(z => (Number(z.비중) || 0) >= 0.5);
  const zTiny = zAll.filter(z => (Number(z.비중) || 0) < 0.5);

  const rv = (redev || []);

  const paneL = `
    ${c.complex_id != null ? `<div class="hsbox" data-hs="${esc(String(c.complex_id))}"></div>` : ''}${V ? 가상땅칸(V.땅) : ''}
    ${sect('필지', 'parcel', ` ${fmt(parcels.length)}`, `폴리곤 ${fmt(parcels.filter(p => p.centroid_lat).length)}`)}
    <table><thead><tr><th>지번</th><th>구분</th><th class="n">공시지가</th></tr></thead><tbody>
      ${parcels.map(p => `<tr>
        <td>${esc(p.jibun || p.pnu)}${p.is_representative ? ' <span class="pill">대표</span>' : ''}</td>
        <!-- ★ pnu_role 이 NULL 이면 '모름' 이다 (2026-10-20). 전에는 NULL 도 '대지' 로
             단정했다 — 부속지번(bld_atch_jibun)이 안 온 단지까지 '대지' 라고 말했다.
             MAIN=표제부 지번 / ATTACHED=부속지번. 둘 다 아니면 근거가 없는 것이다. -->
        <td>${p.pnu_role === 'ATTACHED' ? '부속'
             : p.pnu_role === 'MAIN' ? '대지'
             : gapCell('', 'UNSURE', '대지 · 부속 근거 없음(부속지번 자료가 안 옴)')
            }${p.centroid_lat ? '' : ' · 폴리곤없음'}</td>
        <td class="n">${p.jiga ? fmt(Math.round(p.jiga)) : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}
    </tbody></table>
    ${c.jiga_avg ? `<p class="note sm">공시지가 평균 ${fmt(Math.round(c.jiga_avg))} 원/㎡</p>` : ''}
    ${parcels.length && !parcels.some(p => p.centroid_lat)
      ? `<p class="note">${gapCell('', scope && Number(scope.필지) === 1 ? 'EMPTY' : 'SCOPE',
          scope && Number(scope.필지) === 1
            ? '이 단지의 지번이 연속지적도에 매칭되지 않아 지도에 그릴 수 없습니다'
            : '이 법정동의 연속지적도를 아직 받지 않았습니다')}</p>` : ''}

    ${sect('용도지역', 'zone', zMain.length ? ` ${fmt(zMain.length)}` : '')}
    ${spec && (spec.용도지역 || spec.용도지구 || spec.용도구역) ? `<dl class="zdl">
      ${spec.용도지역 ? `<dt>대장 용도지역</dt><dd>${esc(spec.용도지역)}</dd>` : ''}
      ${spec.용도지구 ? `<dt>대장 용도지구</dt><dd>${esc(spec.용도지구)}</dd>` : ''}
      ${spec.용도구역 ? `<dt>대장 용도구역</dt><dd>${esc(spec.용도구역)}</dd>` : ''}
    </dl><p class="srcline">위: 대장(${esc(spec.기준 || '대장')}) 값 · 아래: 지도 겹친 넓이(VWorld)</p>` : ''}
    ${zMain.length ? `<div class="zlist">${zMain.map(z => `
      <div class="zrow"><span class="zn">${esc(z.용도지역 || '')}</span>
        <span class="zbar"><i style="width:${Math.max(2, Number(z.비중) || 0).toFixed(1)}%"></i></span>
        <b>${(Number(z.비중) || 0).toFixed(1)}%</b></div>`).join('')}
      ${zTiny.length ? `<p class="note sm" title="필지와 용도지역 폴리곤 경계가 미세하게 어긋나 생기는 조각이라 접었습니다">0.5% 미만 ${esc(zTiny.map(z => z.용도지역).join(', '))} 접음</p>` : ''}
      
    </div>` : `<p class="note">${gapCell('', 'SCOPE',
        '이 법정동의 용도지역을 아직 받지 않았습니다')}</p>`}

    ${c.complex_id == null ? '' : `<div class="lubox" data-lu="${esc(String(c.complex_id))}"></div>
    <div class="clbox" data-cl="${esc(String(c.complex_id))}"></div>`}

    ${sect('정비사업 구역', 'redev', rv.length ? ` ${fmt(rv.length)}` : '')}
    ${rv.length ? rv.map(r => `<div class="rdv"${r.sn ? ` data-redev="${esc(String(r.sn))}" role="button" tabindex="0" title="누르면 지도에 이 구역 경계를 그립니다 · 다시 누르면 지웁니다"` : ''}>
      <div class="rdv-h"><b>${esc(r.구역 || '')}</b>${
        r.단계 ? `<span class="rdv-st">${esc(r.단계)}</span>`
               : gapCell('', 'EMPTY', `추진단계 코드 ${esc(r.단계코드 || '')} 가 코드표에 없습니다`)}</div>
      ${r.계획용적률 != null || r.계획세대 != null ? `<div class="rdv-m"><b>정비계획</b> ${esc([r.계획용적률 != null ? '용적률 ' + Number(r.계획용적률) + '%' : null,
          r.계획건폐율 != null ? '건폐율 ' + Number(r.계획건폐율) + '%' : null, r.계획세대 != null ? fmt(r.계획세대) + '세대' : null,
          r.계획층수 && /\/\d+$/.test(r.계획층수) ? '지상 ' + String(r.계획층수).split('/')[1] + '층' : null].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="rdv-m">${esc(r.사업 || r.대분류 || '')}${
        r.구역면적 ? ` · ${fmt(Math.round(r.구역면적))}㎡` : ''}${
        (Number(r.포함률) || 0) < 99 ? ` · 단지의 ${(Number(r.포함률) || 0).toFixed(0)}%가 이 구역 안` : ''}</div>
    </div>`).join('') : `<p class="note">${gapCell('', 'NA',
        '이 단지는 정비사업 구역에 걸쳐 있지 않습니다')}</p>`}

    <!-- 2026-10-22 사장님 "건물 외곽선 표는 의미없어 — 지도에만" : 표를 뺐다. 외곽선은 지도에 그대로 그린다(층·면적은 동·호 탭의 대장 원문). -->

`;

  $('#detail').innerHTML = `
    ${shotsMarkup(c)}
    <!-- 13:21 '단독/총괄표제부'(대장 구조) 대신 **대장 원문 용도** — 용도채우기 가 채운다 -->
    ${V ? `<a class="pill nb" href="#policy" data-pol="precomplex" title="${esc(V.출처)} — 건축물대장은 사용승인(사용검사) 뒤에 생깁니다. 값은 ${V.종류 === 'a' ? '청약 공고 원문' : '허가 · 승인(설계)'} 기준입니다. 누르면 이 단지를 보여 주는 기준">${esc(V.상태말)}</a>
      <span class="pill">${c.has_recap ? '여러 동' : '한 동'}</span>${c.complex_id != null ? `
      <button type="button" class="favbtn" data-fav="${c.complex_id}" aria-pressed="${관심.has(c.complex_id)}"
            title="관심 단지 — 내 정보에 모아 봅니다(로그인)">${관심.has(c.complex_id) ? '★ 관심' : '☆ 관심'}</button>` : ''}` : `<span class="usebox" data-use="${esc(String(c.complex_id))}"><span class="pill${c.has_recap ? ' r' : ''}">${c.has_recap ? '여러 동' : '한 동'}</span></span>
    <span class="pill cl" data-clpill="${esc(String(c.complex_id))}" role="button" tabindex="0" hidden></span>
    <button type="button" class="favbtn" data-fav="${c.complex_id}" aria-pressed="${관심.has(c.complex_id)}"
            title="관심 단지 — 내 정보에 모아 봅니다(로그인)">${관심.has(c.complex_id) ? '★ 관심' : '☆ 관심'}</button>`}
    <h2>${esc(표시이름(c) || '(이름 없음)')}</h2>
    ${주소이름인가(c) && c.실거래이름
      ? `<p class="sub muted" title="건축물대장에 건물 이름이 없어, 이 지번으로 신고된 실거래가 가장 많이 쓴 이름을 보입니다.">이름은 실거래 신고 이름입니다 — 대장에는 이름이 없습니다</p>`
      : c.실거래이름 ? `<p class="sub muted" title="이 단지에 지번(PNU)으로 붙은 실거래가 가장 많이 쓴 이름입니다. 대장 이름이 같은 단지를 가를 때 씁니다.">실거래 이름 '${esc(c.실거래이름)}'</p>` : ''}
    <p class="sub">${esc(c.rep_plat_plc || '')}${c.rep_road_addr ? '<br>' + esc(c.rep_road_addr) : ''}</p>
    <p class="facts">${facts}${ratios ? `<br><span class="muted">${ratios}</span>` : ''}</p>
    <p class="sub muted usecomp" data-usecomp="${esc(String(c.complex_id))}" hidden></p>
    <div class="tabs">${TABS.map(([k, label, 묶], i) =>
      `${i && 묶 !== TABS[i - 1][2] ? '<span class="tabsep" aria-hidden="true"></span>' : ''}<button type="button" class="tab" data-tab="${k}" aria-selected="${k === detailTab}"${k === 'sale' && !(V ? V.종류 === 'h' || (V.청약 || []).length : 분양수(c.complex_id)) && detailTab !== 'sale' ? ' hidden' : ''}>${label}</button>`).join('')}</div>
    <div class="pane">${({ info: paneI, near: paneN, shop: paneC, med: paneH, edu: paneE, dong: paneD, mgmt: paneM,
                           price: paneP, sale: paneS, land: paneL })[detailTab] || paneI}</div>
    ${V ? `<p class="note sm muted">출처: ${esc(V.출처)} (${esc(V.키말)} ${esc(V.pk)}${V.원문처음월 ? ` · ${esc(V.원문처음월)}부터` : ''}) · ${V.지번없음 ? '공고 지번이 없는 택지 블록이라 지도 자리 · 주변 · 땅은 비어 있습니다' : '주변 · 땅은 그 지번 필지 기준'}. 이름은 원문 그대로이고 대장 단지와 이름으로 잇지 않습니다.</p>` : ''}`;

  그리는가상 = null;
  renderShots(c);          // innerHTML 이 바뀐 뒤여야 컨테이너가 존재한다
  고정표시();              // 20:00 눌러 고정한 줄 표시를 다시 입힌다
  document.querySelectorAll('#detail [data-redev]').forEach(el => el.classList.toggle('on', el.dataset.redev === 구역지금));
  if (c.complex_id != null) {   /* 단지 번호(가단지 389 포함)로 받는 덤 칸 — 번호가 없으면 건너뛴다 */
  if (!V) { 분양채우기(); 분양탭확인(c.complex_id); }   // 가단지 분양 칸은 같은 지번 청약(가상분양칸)이 맡는다
  토지이용채우기();        // 토지이용계획 칸 — 토지 탭에 있을 때만 그릇이 있다
  폐쇄채우기();            // 폐쇄·말소 대장 칸 — 토지 탭에 있을 때만 그릇이 있다
  역사채우기();            // 이 땅의 역사 — 토지 탭 맨 위
  허가덧채우기();          // 건축인허가 부가 원문(평형 · 층 · 주차 · 대수선 · 가설 · 철거멸실) — 단지정보 탭
  if (!V) { 폐쇄머리표(); 용도채우기(c.complex_id); }   // 머리 표(옛 대장 · 대장 용도) — 대장 전 건물에는 없다
  }
  /* 14:05 QA: 다른 단지로 옮겨도 탭 제목이 첫 단지 그대로였다 — 서버 /c/:id 제목과 같은 규칙으로 맞춘다 */
  try {
    const 동네 = (c.rep_plat_plc || '').split(/\s+/).slice(1, 3).join(' ');
    const 세대 = Number(c.hhld_cnt_sum) || null;
    document.title = [표시이름(c) || `단지 ${c.complex_id}`, 동네, 세대 ? `${세대.toLocaleString('ko-KR')}세대` : null].filter(Boolean).join(' · ') + ' — 터무니';
  } catch (e) {}
  동공고그리기(c.sigungu_cd && c.bjdong_cd ? `${c.sigungu_cd}${c.bjdong_cd}` : null);   // 이 법정동의 단지 밖 청약 공고
  if (c.complex_id != null) {
  주변카드채우기(c);       // 10-31 단지정보 탭 아래 '주변 단지' · '주변 분양 · 공사 중'
  관리비추이채우기();      // 10-31 관리 탭 관리비 아래 '관리비 추이'(K-apt 자료실 엑셀)
  어린이집채우기();        // 어린이집 칸 — 교육 탭에 있을 때만 그릇이 있다
  병원채우기();            // 심평원 병원·약국 칸 — 병원·약국 탭에 있을 때만 그릇이 있다
  약국채우기();            // 행안부 약국 인허가 칸 — 병원·약국 탭에 있을 때만 그릇이 있다
  }

  $('#detail').querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => { 탭줄위치 = ($('#detail .tabs') || {}).scrollLeft || 0; detailTab = b.dataset.tab; renderDetail(lastDetail); }));
  /* ★ 2026-10-24 사장님 "상권 탭을 누르면 단지정보 탭으로 가" — 다시 그리면 탭 줄(폰에서 가로로 넘김)이 맨 왼쪽으로 돌아가
       오른쪽 끝 탭(상권 · 병원·약국)을 눌러도 '단지정보 · 동·호 …' 만 보였다. 누르기 전 위치를 되살리고, 고른 탭이 안 보이면 보이게 민다. */
  { const 줄위치 = 탭줄위치;   /* 감싸면(요소를 옮기면) 가로 위치가 0 으로 돌아간다 — 감싼 뒤에 되살린다 */
    탭줄손잡이($('#detail .tabs')); 탭줄위치 = 줄위치; }
  { const bar = $('#detail .tabs'), on = bar && bar.querySelector('.tab[aria-selected="true"]');
    if (bar && on) {
      bar.scrollLeft = 탭줄위치;
      if (on.offsetLeft < bar.scrollLeft || on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth)
        bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
    } }

  /* 동호배치도의 동 선택 — 탭과 같은 패턴(상태 바꾸고 다시 그린다) */
  $('#detail').querySelectorAll('[data-ho-dong]').forEach(b =>
    b.addEventListener('click', () => { hoDong = b.dataset.hoDong; renderDetail(lastDetail); }));
  /* 공시가격 추이 '더보기' — 10 씩 늘린다. 다시 그리기만 하고 **재요청하지 않는다**
     (서버가 60호를 한 번에 보냈다). */
  $('#detail').querySelectorAll('[data-prc-more]').forEach(b =>
    b.addEventListener('click', () => { prcShown += 10; renderDetail(lastDetail); }));
  /* 거래 내역 '더보기' — 10 씩. 재요청 없이 다시 그리기만 한다(서버가 120건을 줬다). */
  $('#detail').querySelectorAll('[data-trade-more]').forEach(b =>
    b.addEventListener('click', () => { 거래Shown += 10; renderDetail(lastDetail); }));
  /* 격자 칸 -> 호 상세 */
  $('#detail').querySelectorAll('[data-ho-pk]').forEach(c =>
    c.addEventListener('click', () => openHo(c.dataset.hoPk)));
  /* 격자 평형 고르기 */
  $('#detail').querySelectorAll('[data-ho-area]').forEach(b =>
    b.addEventListener('click', () => {
      hoArea = b.dataset.hoArea || null;
      hoAreaX = null;          /* 평형이 바뀌면 타입 선택은 뜻을 잃는다 */
      renderDetail(lastDetail); }));
  /* 2단 - 같은 평형 안의 타입(정확한 전용면적) */
  $('#detail').querySelectorAll('[data-ho-ax]').forEach(b =>
    b.addEventListener('click', () => {
      hoAreaX = b.dataset.hoAx || null; renderDetail(lastDetail); }));
  /* 평형 고르기 — 동 선택과 같은 패턴(상태 바꾸고 다시 그린다) */
  $('#detail').querySelectorAll('[data-area]').forEach(b =>
    b.addEventListener('click', () => {
      tradeArea = b.dataset.area || null; 거래Shown = 10; renderDetail(lastDetail); }));
  주변점묶기();          // 주변 목록 hover -> 지도에 점 (한 번만 묶인다)

  /* 거래 종류 고르기 (2026-10-20). 평형과 같은 패턴. */
  $('#detail').querySelectorAll('[data-trade]').forEach(b =>
    b.addEventListener('click', () => {
      거래탭 = b.dataset.trade; 탭수동 = true; 거래Shown = 10; renderDetail(lastDetail); }));


  const nd = $('#nodirect');
  if (nd) nd.addEventListener('change', e => { hideDirect = e.target.checked; renderDetail(lastDetail); });
}

/* ---------------- 시작 ---------------- */
async function boot() {
  try { CFG = await fetch('/api/config').then(r => r.json()); } catch { CFG = {}; }
  initMap();

  try {
    const h = await fetch('/api/health').then(r => r.json());
    if (h.ok) {
      $('#stats').innerHTML = [
        ['단지', fmt(h.complexes)], ['필지', fmt(h.parcels)],
        /* ★ 이 숫자는 is_canceled=0 이라 **해제 거래가 빠져 있다.** 문서의 적재 건수
           (75,608)와 다른 이유가 이것이다.
           2026-10-20: 화면의 '해제 제외' 꼬리표는 사용자 요청으로 뺐다(헷갈린다고).
           **숫자를 바꾼 게 아니라 설명만 뺀 것이다** - 왜 다른지는 여기 남긴다. */
        ['건물', fmt(h.buildings)], ['실거래', fmt(h.trades)],
      ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      if (!h.parcels) {
        if (개발중) toast('필지가 아직 적재되지 않았습니다. <b>py load_cadastral.py</b> 를 먼저 실행하세요.', 9000);
      } else if (!h.buildings) {
        if (개발중) toast('건물 외곽선이 아직 적재되지 않았습니다. <b>py load_building.py</b> 를 실행하면 지도에 건물이 올라갑니다.', 9000);
      }
    } else {
      $('#stats').innerHTML = `<div class="stat" style="grid-column:1/-1"><div class="k">DB</div><div class="v" style="font-size:12px">수를 못 셀</div></div>`;
      toast(esc(h.hint || h.error || 'DB 에 연결하지 못했습니다.'), 12000);
    }
  } catch (e) {
    toast(`서버 응답 없음: ${esc(e.message)}`, 9000);
  }

  let t;
  $('#q').addEventListener('input', () => {
    if (askMode) { $('#clear').hidden = !$('#q').value.trim(); return; }   /* 말로 찾기는 Enter 로만 */
    /* ★ 2026-10-24 11:07 사장님 "검색 제안 목록도 뜨고 단지 목록도 떠서 둘 — 하나만" — 치는 동안은 **제안 목록 하나만**.
       아래 단지 목록(시트)은 Enter(검색 키)를 누를 때만 바꾼다. 글자를 다 지우면 처음 목록으로 돌린다. */
    $('#clear').hidden = !$('#q').value.trim();
    clearTimeout(t);
    if (!$('#q').value.trim()) t = setTimeout(search, 220);
    clearTimeout(제안.타이머); 제안.타이머 = setTimeout(제안부르기, 150); });
  $('#q').addEventListener('keydown', e => {
    if (askMode) { if (e.key === 'Enter') ask(); return; }
    const 열림 = !$('#sugg').hidden && 제안.항목.length;
    if (e.key === 'ArrowDown' && 열림) { e.preventDefault(); 제안표시(제안.고른 + 1); }
    else if (e.key === 'ArrowUp' && 열림) { e.preventDefault(); 제안표시(제안.고른 - 1); }
    else if (e.key === 'Enter') {
      if (열림 && 제안.고른 >= 0) { e.preventDefault(); 제안고르기(제안.항목[제안.고른]); }
      else { e.preventDefault(); 제안닫기(); clearTimeout(t); search(); $('#q').blur(); }   /* 안 고르고 Enter(폰 검색 키) — 제안을 닫고 그때 단지 목록을 연다 · 키보드도 내린다 */
    } else if (e.key === 'Escape') 제안닫기();
  });
  /* 누르는 순간 입력창이 포커스를 잃어 제안이 닫히지 않게 — 마우스는 pointerdown 에서 바로 고른다.
     ★ 2026-10-24 사장님 "모바일에서 스크롤 내리려 하면 그 단지가 눌려 들어가져" — 손가락은 **누르는 순간이 스크롤의 시작**이기도 하다.
       터치 · 펜은 떼는 순간(pointerup)에, 누른 자리에서 10px 안으로만 움직였을 때만 고른다. 스크롤이 시작되면 브라우저가 pointercancel 을 보낸다. */
  let 제안누름 = null;
  $('#sugg').addEventListener('pointerdown', e => {
    const x = e.target.closest('.sg-it'); if (!x) return;
    if (e.pointerType === 'mouse') { e.preventDefault(); 제안고르기(제안.항목[Number(x.dataset.k)]); return; }
    제안누름 = { id: e.pointerId, x: e.clientX, y: e.clientY, k: Number(x.dataset.k) };
  });
  $('#sugg').addEventListener('pointermove', e => {
    if (제안누름 && e.pointerId === 제안누름.id && Math.hypot(e.clientX - 제안누름.x, e.clientY - 제안누름.y) > 10) 제안누름 = null;
  });
  $('#sugg').addEventListener('pointercancel', () => { 제안누름 = null; });
  $('#sugg').addEventListener('pointerup', e => {
    const p = 제안누름; 제안누름 = null;
    if (!p || e.pointerId !== p.id || e.pointerType === 'mouse') return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) return;
    const x = e.target.closest('.sg-it'); if (!x || Number(x.dataset.k) !== p.k) return;
    e.preventDefault(); 제안고르기(제안.항목[p.k]);
  });
  /* 터치를 떼면 뒤따르는 mousedown 이 입력창 포커스를 빼앗아 목록을 닫는다 — 목록 안에서는 막는다(스크롤은 그대로) */
  $('#sugg').addEventListener('mousedown', e => { if (e.target.closest('.sg-it')) e.preventDefault(); });
  $('#q').addEventListener('blur', () => setTimeout(제안닫기, 120));
  $('#q').addEventListener('focus', () => {
    if (!askMode && 제안.마지막 && 제안.마지막.q === $('#q').value.trim()) 제안그리기(제안.마지막);
  });
  document.querySelectorAll('.segbtn').forEach(b =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#askhint').addEventListener('click', e => {
    const b = e.target.closest('.ex'); if (!b) return;
    $('#q').value = b.textContent; $('#clear').hidden = false; ask(); });
  $('#recap').addEventListener('change', search);
  $('#polys').addEventListener('change', e => {
    showPolys = e.target.checked;
    if (showPolys) {
      parcelLayer.addTo(map); buildingLayer.addTo(map); loadParcels();
    } else {
      map.removeLayer(parcelLayer); map.removeLayer(buildingLayer);
      parcelLayer.clearLayers(); buildingLayer.clearLayers();
    }
  });
  /* 겹쳐보기 — 켠 것만 지도에 올린다. 끈 쪽은 지우고 내린다(메모리도, 눈도). */
  /* ★ 지도 위 '용도/정비' 버튼은 숨긴 select 를 **대신 눌러 준다**(2026-10-19).
     값을 바꾸고 change 를 쏘면 아래 기존 처리기가 그대로 받는다 - 겹쳐보기
     로직은 한 줄도 안 고쳤다. 같은 걸 두 벌로 만들면 반드시 어긋난다. */
  document.querySelectorAll('.mc.ov').forEach(b => {
    b.addEventListener('click', () => {
      const sel = $('#overlay');
      const 지금 = b.dataset.ov;
      sel.value = (sel.value === 지금) ? '' : 지금;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  const 겹침표시 = () => {
    const v = $('#overlay').value;
    document.querySelectorAll('.mc.ov').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.ov === v)));
  };
  $('#overlay').addEventListener('change', 겹침표시);
  겹침표시();

  /* 내 위치 (2026-10-20). 겹쳐보기 버튼들과 달리 숨은 <select> 를 거치지
     않는다 - 지도 레이어를 켜는 게 아니라 **한 번 하는 동작**이다. */
  $('#geo').addEventListener('click', 내위치찾기);
  $('#measure').addEventListener('click', 거리재기단추);
  동네시작();

  $('#overlay').addEventListener('change', e => {
    overlay = e.target.value;
    [['zone', zoneLayer], ['redev', redevLayer]].forEach(([k, lyr]) => {
      if (overlay === k) lyr.addTo(map);
      else { if (map.hasLayer(lyr)) map.removeLayer(lyr); lyr.clearLayers(); }
    });
    overlayLegend();
    loadOverlay();
  });
  $('#sat').addEventListener('change', e => setBase(e.target.checked ? 'sat' : 'base'));
  /* 경계: 행정동 ↔ 법정동 (2026-10-21). 넓게 볼 때(줌 < LAWD_ZOOM)만 그려진다 -
     확대한 상태에서 켜면 '넓히면 보입니다' 라고 한 번 말한다. */
  if ($('#adm')) {
    $('#adm').checked = 행정동보기;
    $('#adm').addEventListener('change', e => {
      행정동보기 = e.target.checked;
      try { localStorage.setItem('teomoony.adm', 행정동보기 ? '1' : '0'); } catch { /* 편의 기능 */ }
      if (map.getZoom() < LAWD_ZOOM) loadLawds();
      else toast(`지도를 넓히면 ${행정동보기 ? '행정동' : '법정동'} 경계가 보입니다`, 2500);
    });
  }
  $('#clear').addEventListener('click', () => { $('#q').value = ''; 제안닫기(); 제안.마지막 = null; search(); $('#q').focus(); });
  /* 로그인 칸에서 Enter 로도 들어갈 수 있게 */
  $('#list').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'lu' || e.target.id === 'lp')) {
      e.preventDefault(); 로그인하기();
    }
  });
  $('#list').addEventListener('click', e => {
    if (e.target.id === 'lgo') { 로그인하기(); return; }
    if (e.target.id === 'reclear') { recentClear(); return; }
    const b = e.target.closest('.row');
    if (!b) return;
    if (b.dataset.redevzone) return;      // 정비구역 줄은 문서 단위 처리기(selectRedevZone)가 받는다
    if (b.dataset.rkLawd || b.dataset.rkSgg) return;   // 지역 순위 줄은 문서 단위 처리기가 받는다 — 여기서 select(NaN) 로 /c/NaN 이 열렸다(문의 #1)
    if (b.dataset.lawd) selectLawd(b.dataset.lawd);
    else if (b.dataset.kapt) selectNewbuild(b.dataset.kapt, true);
    else if (b.dataset.hpi != null && hpItems[Number(b.dataset.hpi)]) 승인으로(hpItems[Number(b.dataset.hpi)]);
    else if (b.dataset.hpk) selectHousePlan(b.dataset.hpk);
    else if (b.dataset.pbk) selectPreBuild(b.dataset.pbk);
    else if (b.dataset.pbi != null && pbItems[Number(b.dataset.pbi)]) { const x = pbItems[Number(b.dataset.pbi)]; x.complex_id ? select(x.complex_id, true) : selectPreBuild(x.pk); }
    else if (b.dataset.ah) 공고상세(b.dataset.ah, b.dataset.lat ? Number(b.dataset.lat) : null, b.dataset.lng ? Number(b.dataset.lng) : null);
    else if (b.dataset.id && Number.isInteger(Number(b.dataset.id))) select(Number(b.dataset.id), true);
  });

  탭달기();
  테마달기();
  시트달기();
  search();
  주소로열기();
}

/* ---------- 단지 주소 /c/:id (2026-10-22 SEO) ----------
   서버가 /c/:id 에 요약 HTML 을 넣어 보낸다(검색엔진용 · 보이는 요약). 여기서는 그 단지를 지도에서 열어 자세한 상세로 바꾼다.
   주소는 replaceState 로만 바꾼다 — 뒤로가기 동작은 예전과 같다(쌓지 않는다). '#보기' 는 그대로 붙여 둔다. */
function 주소맞춤(경로, 쌓기 = false) {
  try {
    /* 쌓기: 폰에서 상세를 열 때만 기록을 하나 쌓는다 — 폰의 '뒤로' 가 사이트를 나가지 않고 상세를 닫게(popstate). */
    if (쌓기) history.pushState({ 상세: 1 }, '', 경로 + location.search + location.hash);
    else if (location.pathname !== 경로) history.replaceState(history.state, '', 경로 + location.search + location.hash);
  } catch (e) { /* 주소는 덤 — 못 바꿔도 화면은 그대로 */ }
}
function 주소로열기() {
  /* 10-31 동네 쪽(/r/…): 서버가 상세 자리에 그린 지역 목록을 지도 화면에서 그대로 보인다. 목록의 단지는 누르면 바로 상세(새로 불러오지 않음) */
  if (/^\/r(\/\d+)?\/?$/.test(location.pathname)) {
    보기전환('map');
    const d = $('#detail');
    if (d) {
      d.hidden = false;
      d.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('.ssr a[href^="/c/"]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault(); select(Number(a.getAttribute('href').slice(3)));
      });
    }
    if (폰()) 시트('full');
    /* 지도는 그 시군구 · 동 상자로(지역 목록과 같은 경계 자료 · 못 받으면 그대로) */
    const cd = (location.pathname.match(/^\/r\/(\d{5}|\d{10})\/?$/) || [])[1];
    if (cd) fetch(cd.length === 10 ? `/api/areas/dongs?sgg=${cd.slice(0, 5)}` : `/api/areas/sgg?sido=${cd.slice(0, 2)}`).then(x => x.json()).then(r => {
      const x = cd.length === 10 ? (r.동 || r.dongs || r.items || []).find(v => v.cd === cd) : (r.구 || []).find(v => v.sgg_cd === cd);
      if (x && x.minx != null && map) map.fitBounds([[x.miny, x.minx], [x.maxy, x.maxx]]);
    }).catch(() => {});
    return;
  }
  const m = location.pathname.match(/^\/c\/(\d+)\/?$/);
  if (!m) return;
  보기전환('map');
  select(Number(m[1]));
}

/* ================= 3탭: 홈 / 지도 / 이용현황 (2026-10-20) =================
   왜: 들어오면 지도만 덩그러니 있어서 처음 온 사람이 여기가 뭐 하는 곳인지
   몰랐다. 홈을 앞에 두고, 쓰인 횟수를 공개로 보여준다.

   ★ .panel 과 .mapwrap 은 손대지 않는다. 숨기고 보이는 것만 .app[data-view] 로
     가른다 - 기존 선택자와 로직이 한 줄도 안 바뀌게.
   ★ 지도는 숨어 있는 동안 제 크기를 0 으로 안다. 돌아올 때 invalidateSize 로
     다시 재고 refreshMap 을 부른다. 안 하면 회색 화면이 뜬다. */
const 보기들 = ['home', 'map', 'usage', 'qna', 'policy', 'my', 'github'];
let 지금보기 = null, 홈받음 = false, 이용받음 = 0;

function 보기전환(이름, 주소도 = true) {
  if (!보기들.includes(이름)) 이름 = 'home';
  if (지금보기 === 이름) return;
  지금보기 = 이름;
  document.querySelector('.app').dataset.view = 이름;
  $('#view-home').hidden  = 이름 !== 'home';
  $('#view-usage').hidden = 이름 !== 'usage';
  $('#view-qna').hidden   = 이름 !== 'qna';
  $('#view-policy').hidden = 이름 !== 'policy';
  $('#view-my').hidden = 이름 !== 'my';
  $('#view-github').hidden = 이름 !== 'github';
  { const m = $('#mebtn'); if (m) m.setAttribute('aria-current', String(이름 === 'my')); }
  document.querySelectorAll('.tab').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.view === 이름)));
  if (주소도) {
    const h = '#' + 이름;
    if (location.hash !== h)
      history.replaceState(null, '', location.pathname + location.search + h);
  }
  if (이름 === 'map' && typeof map !== 'undefined' && map) { map.invalidateSize(); refreshMap(); }
  if (이름 === 'home')  홈그리기();
  if (이름 === 'usage') 이용그리기();
  if (이름 === 'qna')   문의탭그리기();
  if (이름 === 'policy') 정책그리기();
  if (이름 === 'my') 내정보그리기();
  if (이름 === 'github') 깃허브그리기();
  const v = document.querySelector('.view:not([hidden])');
  if (v) v.scrollTop = 0;
}

/* 밝게 / 어둡게. 고르지 않았으면 기기 설정을 따른다 (CSS 의 prefers-color-scheme).
   고르면 data-theme 으로 그걸 덮어쓴다. localStorage 는 사생활 모드에서
   던질 수 있으니 읽기도 쓰기도 감싼다 - 못 읽어도 화면은 정상으로 돈다. */
function 테마달기() {
  $('#theme').addEventListener('click', () => {
    const 고른것 = document.documentElement.dataset.theme;
    const 지금어둡나 = 고른것 ? 고른것 === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const 다음 = 지금어둡나 ? 'light' : 'dark';
    document.documentElement.dataset.theme = 다음;
    try { localStorage.setItem('teomoony.theme', 다음); } catch (e) {}
  });
}

function 탭달기() {
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) 보기전환(b.dataset.view);
  });
  { const m = $('#mebtn'); if (m) m.addEventListener('click', () => 보기전환('my')); }   // 내 정보 = 머리틀 오른쪽 사람 그림
  window.addEventListener('hashchange', () => 보기전환((location.hash || '').slice(1), false));
  const 첫 = (location.hash || '').slice(1);
  보기전환(보기들.includes(첫) ? 첫 : 'home');
}

/* ---- 홈: 지금 들어 있는 양 ----
   0 인 것은 숨기지 않고 '준비 중' 이라고 적는다. 없는 것을 없다고 말하는 것도
   데이터다 - 칸을 지우면 왜 안 보이는지 아무도 모른다. */
const 홈칸 = [
  ['complexes', '단지'], ['parcels', '필지'], ['buildings', '건물'],
  ['trades', '실거래'],
  ['stores', '상권 점포'], ['schools', '학교'], ['kinders', '유치원'],
  ['academies', '학원'], ['subways', '지하철역'], ['bus_stops', '버스 정류장'],
  ['redev', '정비사업 구역'], ['zones', '용도지역'], ['land_char', '토지특성'],
  /* 308: 받은 시군구 · 지금 기준(국가데이터처 법정동 연계정보 최신 분기) */
  /* 2026-10-28 사장님 "저거 글자 안 나오게" — 법정동 · 행정동 칸의 받은 지역 목록(시도 이름 줄)을 뺀다 */
  ['bdongs', '법정동'], ['hdongs', '행정동'], ['hdongs_old', '바뀐 옛 행정동', '2013년 이후'],
];
async function 홈그리기() {
  const el = $('#homestats');
  if (홈받음) return;
  if (!el.children.length)
    el.innerHTML = 홈칸.map(([, k]) =>
      `<div class="hs wait"><div class="k">${esc(k)}</div><div class="v">세는 중</div></div>`).join('');
  try {
    const h = await fetch('/api/health?full=1').then(r => r.json());
    if (!h.ok) throw new Error(h.hint || h.error || 'DB 에 연결하지 못했습니다.');
    el.innerHTML = 홈칸.map(([키, 이름, 덧], i) => {
      const v = Number(h[키]) || 0;
      return `<div class="hs${i < 4 ? ' lead' : ''}${v ? '' : ' wait'}">
          <div class="k">${esc(이름)}${덧 ? `<i>${esc(typeof 덧 === 'function' ? 덧() : 덧)}</i>` : ''}</div>
          <div class="v">${v ? fmt(v) : '준비 중'}</div>
        </div>`;
    }).join('');
    홈받음 = true;
  } catch (e) {
    el.innerHTML = `<div class="hs" style="grid-column:1/-1">
        <div class="k">수를 못 셌습니다</div>
        <div class="v" style="font-size:13px">${esc(e.message)}</div></div>`;
  }
}

/* ---- 이용현황 ----
   ★ 2026-10-24 11:26 사장님 "날짜별로 분리 · 사람이 이용하는 게 맨 위" — 맨 위 합계(사람) · 14일 막대(누르면 그날) · 날짜 칩(전체 · 각 날) ·
     그 아래 **사람 동작 → 시간대 → 갈래 → 나라** 가 고른 날 하루로 바뀐다. 합계 · 14일은 /api/usage(전체), 고른 날은 /api/usage?day= 로 따로. */
let 이용날 = null;                         // null = 전체
let 이용날펼침 = false;                     // 10-30 날짜 목록을 펼쳤나
const 이용캐시 = new Map();
function 한국날(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 10); }
async function 이용그리기(강제 = false) {
  const 이제 = Date.now();
  const 합 = $('#usum'), 액 = $('#uacts'), 날 = $('#udays');
  try {
    let u = 이용캐시.get('');
    if (!u || 강제 || 이제 - u._t > 20000) {
      u = await fetch('/api/usage').then(r => r.json());
      if (u.error) throw new Error(u.hint || u.error);
      u._t = 이제; 이용캐시.set('', u);
    }
    합.innerHTML = [['오늘', u.합계.오늘], ['최근 7일', u.합계.이레], ['전체', u.합계.전체]]
      .map(([k, v]) => `<div class="hs lead"><div class="k">${k}</div><div class="v">${fmt(v)}</div></div>`).join('');
    /* 14일 막대 — 빠진 날은 0 (한국 날짜) · 누르면 그날 */
    const 표 = new Map((u.일별 || []).map(d => [String(d.날), d.횟수]));
    const 칸 = []; for (let i = 13; i >= 0; i--) 칸.push(한국날(이제 - i * 86400000));
    const 값 = 칸.map(k => 표.get(k) || 0), 큰 = Math.max(1, ...값);
    날.innerHTML = 칸.map((k, i) => `<button type="button" class="ud${값[i] ? '' : ' zero'}${이용날 === k ? ' on' : ''}" data-uday="${k}" title="${esc(날짜(k))} · ${fmt(값[i])}회">
        <i style="height:${값[i] ? Math.max(3, 값[i] / 큰 * 100).toFixed(1) : 2}%"></i>
        <span>${(i % 3 === 1 || i === 13) ? esc(날짜(k).slice(5)) : ''}</span></button>`).join('');
    /* ★ 2026-10-30 사장님 "일자를 나열하는 게 아니라 버튼 하나로 — 누르면 그 일자들이 나오게": 단추 하나 + 펼치는 목록 */
    const 지금날말 = 이용날 ? `${날짜(이용날)}${이용날 === 한국날(이제) ? ' 오늘' : ''}` : '전체';
    $('#udaypick').innerHTML = `<button type="button" class="achip udaybtn" aria-expanded="${이용날펼침}" aria-haspopup="listbox">날짜 · <b>${esc(지금날말)}</b> ▾</button>
      <div class="udaylist" role="listbox"${이용날펼침 ? '' : ' hidden'}>${[`<button type="button" class="udayit" role="option" data-uday="" aria-selected="${이용날 == null}">전체<b>${fmt(u.합계.전체)}</b></button>`,
        ...칸.slice().reverse().map((k, i) => `<button type="button" class="udayit" role="option" data-uday="${k}" aria-selected="${이용날 === k}">${esc(날짜(k))}${i === 0 ? ' 오늘' : ''}<b>${fmt(표.get(k) || 0)}</b></button>`)].join('')}</div>`;

    /* 고른 날 */
    let d = u;
    if (이용날) {
      d = 이용캐시.get(이용날);
      if (!d || (이용날 === 한국날(이제) && 이제 - d._t > 20000)) {
        d = await fetch('/api/usage?day=' + encodeURIComponent(이용날)).then(r => r.json());
        if (d.error) throw new Error(d.hint || d.error);
        d._t = 이제; 이용캐시.set(이용날, d);
      }
    }
    const 언제 = 이용날 ? `${날짜(이용날)} 하루` : '전체';
    $('#uwhen1').textContent = `동작별 · ${언제}`;
    $('#uwhen2').textContent = `사람 · 로봇 갈래별 · ${언제}`;
    $('#uwhen3').textContent = `${이용날 ? `${날짜(이용날)} 하루` : '최근 7일'} · 접속 주소 수와 요청 수 — 주소는 보이지 않습니다`;
    $('#uwhen4').textContent = `사람 · 한국 시각 · ${언제}`;

    const 수 = x => 이용날 ? x.전체 : x.전체;     // 날을 고르면 서버가 그날만 세어 '전체' 칸에 담는다
    const 최대 = Math.max(1, ...d.동작.map(수));
    액.innerHTML = d.동작.length ? d.동작.map(x => `
      <div class="ua">
        <div class="nm">${esc(x.동작)}</div>
        <div class="n">${fmt(수(x))}${이용날 ? '' : `<s>오늘 ${fmt(x.오늘)}</s>`}</div>
        <div class="bar"><i style="width:${(수(x) / 최대 * 100).toFixed(1)}%"></i></div>
      </div>`).join('')
      : `<p class="note sm">${이용날 ? '이날 사람이 쓴 기록이 없습니다.' : '아직 쌓인 기록이 없습니다.'}</p>`;

    /* 시간대 — 날을 골랐을 때만 */
    const hb = $('#uhourbox');
    if (이용날) {
      const 시 = new Map((d.시간별 || []).map(x => [Number(x.시), Number(x.횟수)]));
      const hv = [...Array(24).keys()].map(h => 시.get(h) || 0), hm = Math.max(1, ...hv);
      $('#uhours').innerHTML = hv.map((v, h) => `<div class="ud${v ? '' : ' zero'}" title="${h}시 · ${fmt(v)}회">
          <i style="height:${v ? Math.max(3, v / hm * 100).toFixed(1) : 2}%"></i><span>${h % 3 === 0 ? h : ''}</span></div>`).join('');
      hb.hidden = false;
    } else hb.hidden = true;

    /* 갈래별 — '모름' 은 갈래를 세기 전(접속 기록이 없던 때)의 것 */
    const 갈풀이 = { '사람': '로봇이라고 밝히지 않은 접속', '검색 로봇': '구글 · 네이버 · 빙 등', 'AI 수집 로봇': 'Claude · GPT 등 AI 학습·검색용 수집기',
      'SEO 수집 로봇': 'Ahrefs 등 검색 순위 분석용', '기타 로봇·미리보기': '메신저 링크 미리보기 등', '스크립트': '프로그램으로 직접 부른 것',
      '스캐너 추정': '오래된 브라우저를 흉내 낸 데이터센터 접속', '수집 추정': '단지 페이지만 열고 그 단지 자료는 한 번도 안 부른 접속(브라우저라면 부른다) — 사람처럼 꾸민 수집 로봇으로 봅니다', '모름': `갈래를 세기 전 기록${u.갈래시작 ? ` (${esc(날짜(u.갈래시작))} 전)` : ''}` };
    const 갈최대 = Math.max(1, ...(d.갈래별 || []).map(x => x.전체));
    $('#ukinds').innerHTML = (d.갈래별 || []).map(x => `
      <div class="ua">
        <div class="nm">${esc(x.갈래)} <s>${esc(갈풀이[x.갈래] || '')}</s></div>
        <div class="n">${fmt(x.전체)}${이용날 ? '' : `<s>오늘 ${fmt(x.오늘)}</s>`}</div>
        <div class="bar"><i style="width:${(x.전체 / 갈최대 * 100).toFixed(1)}%"></i></div>
      </div>`).join('') || '<p class="note sm">아직 없습니다.</p>';
    const 나라이름 = { KR: '한국', US: '미국', FR: '프랑스', JP: '일본', SG: '싱가포르', NL: '네덜란드', PL: '폴란드', CA: '캐나다', DE: '독일',
      GB: '영국', RU: '러시아', AU: '호주', TW: '대만', CN: '중국', IN: '인도', BE: '벨기에', BD: '방글라데시', ID: '인도네시아', '??': '모름' };
    const 나최대 = Math.max(1, ...(d.나라 || []).map(x => x.요청));
    $('#unations').innerHTML = (d.나라 || []).map(x => `
      <div class="ua">
        <div class="nm">${esc(나라이름[x.나라] || x.나라)} · ${esc(x.갈래)}</div>
        <div class="n">${fmt(x.요청)}<s>주소 ${fmt(x.IP수)}곳</s></div>
        <div class="bar"><i style="width:${(x.요청 / 나최대 * 100).toFixed(1)}%"></i></div>
      </div>`).join('') || '<p class="note sm">아직 없습니다.</p>';
  } catch (e) {
    액.innerHTML = `<p class="note sm">이용현황을 읽지 못했습니다 — ${esc(e.message)}</p>`;
  }
}
document.addEventListener('click', e => {
  const 단추 = e.target.closest('#view-usage .udaybtn');
  const 목록 = document.querySelector('#view-usage .udaylist');
  if (단추) { 이용날펼침 = !이용날펼침; if (목록) 목록.hidden = !이용날펼침; 단추.setAttribute('aria-expanded', String(이용날펼침)); return; }
  const b = e.target.closest('#view-usage [data-uday]');
  if (!b) {                                         // 바깥을 누르면 접는다
    if (이용날펼침 && !e.target.closest('#view-usage .udaylist')) { 이용날펼침 = false; if (목록) 목록.hidden = true;
      const t = document.querySelector('#view-usage .udaybtn'); if (t) t.setAttribute('aria-expanded', 'false'); }
    return;
  }
  const k = b.dataset.uday || null;
  이용날 = (이용날 === k && k) ? null : k;      // 같은 날을 다시 누르면 전체
  이용날펼침 = false;
  이용그리기();
});

/* ===================== 정책 (2026-10-22 사장님 "단지정보 안 부가 설명들을 '정책' 에 전부 정리") =====================
   ★ 화면 칸마다 붙어 있던 '어떻게 셌나 · 왜 이렇게 보이나' 설명을 여기 한 곳에 모았다.
     칸에는 **그 단지의 사실**(건수 · 자름 · 받은 범위 · 연결 근거)만 남긴다. 칸 머리의 출처 배지를 누르면 여기 그 절로 온다.
   ★ 키는 SRC(출처 배지)의 키와 같다 — 배지 → 절이 끊기지 않게. */
const 정책 = [
  { 키: '공통', 제목: '공통 원칙', 글: [
    '세 가지를 지킵니다. <b>① 중복 데이터 없이</b> — 같은 값은 <b>한 곳에서 계산</b>하고 상세(목록·표)는 한 칸에만 둡니다. 탭 이름 · 칩의 건수 같은 길잡이 요약은 두되 반드시 그 계산과 같은 숫자입니다. <b>② 이어진 데이터를 보기 좋게</b> — 이어진 자료는 주제별로 모아 보이고, 누르면 바로 가고 거꾸로도 갈 수 있으며, 값마다 출처 · 기준일을 볼 수 있습니다. <b>③ 틀린 데이터 없이</b> — 확실한 규칙으로만 잇고, 모르면 빈칸과 그 까닭을 적고, 원본은 고치지 않으며, 기준일을 같이 적습니다(오래된 값도 틀린 값이 될 수 있습니다). 아래 원칙들은 이 셋을 지키는 방법입니다.',
    '국가가 공개한 데이터를 <b>원본 그대로</b> 보여 줍니다. 값을 고치거나 지어내지 않고, 모르는 것은 모른다고 적습니다.',
    '서로 다른 자료는 <b>코드·지번(PNU)·좌표·면적</b>으로만 잇습니다. <b>이름으로는 잇지 않습니다.</b> 코드가 없어 다른 단서(날짜·세대수 등)로 이은 것은 <b>추정 연결</b>이라고 표시합니다.',
    '빈칸의 뜻을 가릅니다 — <b>SCOPE</b> 아직 안 받음 · <b>EMPTY</b> 받았는데 없음 · <b>NA</b> 해당 없음 · <b>UNSURE</b> 확인 못 함.',
    '<b>어디까지 받았나</b>는 적재 기록이 아니라 <b>들어 있는 데이터를 자료 × 시군구로 세어</b> 정합니다(받았다고 적혀 있어도 비어 있으면 안 받은 것). 단지의 시군구에 그 자료가 한 줄도 없으면 SCOPE, 있으면 500m 안에 없을 때 NA 입니다. 시 단위로 받는 자료(일반구가 있는 시의 어린이집 등)는 그 시를 함께 봅니다. 좌표만 있는 자료(학원 · 병원 · 약국 · 학교 · 정류장 · 역)는 좌표가 든 <b>법정동 경계</b>로 시군구를 가립니다.',
    '거리는 모두 <b>단지 중심점에서 잰 직선거리</b>입니다 — 단지 경계·출입구·도보 거리가 아닙니다. 큰 단지일수록 실제와 벌어집니다.',
    '계산한 값(평당가·중위값·분위 등)은 <b>데이터가 다 있고 계산이 정확할 때만</b> 보이고, 기준(대상·기간·표본)을 같이 적습니다. 목록을 자르면 전체 몇 개 중 몇 개인지 적습니다.',
    '단지 중심좌표가 없으면 거리로 찾는 칸(교통 · 교육 · 상권 · 병원·약국)을 볼 수 없습니다 — 없는 것이 아니라 못 본 것입니다. 필지(연속지적도)를 받으면 좌표가 생깁니다.',
    '화면에는 이 단지에 해당하는 숫자만 짧게 적고, 왜 그런지 · 무엇을 빼고 셌는지 같은 설명은 이 정책 화면에 모읍니다(칸 머리의 출처 칩 ? 을 누르면 그 칸의 항목으로 옵니다).',
    '<b>화면의 짧은 말</b>(2026-10-24): 빈칸은 <b>안 받음</b>(그 지역 자료를 아직 안 받음) · <b>값 없음</b>(받았는데 원본 칸이 비어 있음) · <b>해당 없음</b>(이 단지 종류엔 그 자료가 없음) · <b>모름</b>(자료는 있으나 이 단지 것이라 확신 못 함) 넷 중 하나로 적고, 자세한 까닭은 그 말에 마우스를 올리거나(폰은 누르면) 나옵니다. <b>추정</b> 칩은 코드가 아닌 다른 단서(날짜 · 세대수 등)로 이은 값이라는 뜻이고, 누르면 그 규칙이 적힌 정책 항목으로 옵니다.',
  ] },
  { 키: '매칭', 제목: '데이터 잇기 규칙 (매칭)', 글: [
    '<b>원칙</b> — 이름은 보지 않습니다. <b>공식 코드</b>(법정동코드 · 지번(PNU) · 도로명코드+건물번호 · 대장 관리번호)가 같을 때만 잇고, 후보가 <b>하나</b>일 때만 잇습니다. 잘못 이은 값은 비워 둔 것보다 나쁘므로, 시험에서 틀린 연결이 나온 길은 막는 조건(가드)을 더하거나 쓰지 않습니다. 이은 것마다 어느 길로 이었는지(근거)를 남기고, 원본 값은 고치지 않습니다.',
    '<b>지번(PNU)</b> = 법정동코드 10자리 + 산 여부 1 + 본번 4 + 부번 4. 실거래 · 청약 공고 · K-apt · 대장의 지번은 원문의 법정동 · 본번 · 부번으로 만듭니다. 법정동은 국가 법정동 마스터, <b>도로명은 행정안전부 도로명주소</b>(받은 시군구 법정동 전체 주소를 공식 API로 받아 둠)의 도로명코드(12자리) · 건물번호 · 공식 지번을 씁니다. 글자로만 온 주소는 공식 주소 검색에 물어, <b>물은 도로명·번호와 정확히 같은 결과가 하나</b>일 때만 그 코드를 씁니다.',
    '<b>단지</b> = 건축물대장 총괄표제부·표제부를 관리번호(상위 PK)와 지번으로 묶은 것. 동은 관리건축물대장PK로 잇습니다.',
    '<b>실거래 → 단지</b> ① 실거래 지번 = 단지 필지. 한 필지에 단지가 여럿이면 그 거래를 담을 수 있는 건물로 — 아파트·연립·단독은 세대 있는 주택 동의 단지(세대 많은 쪽), 오피스텔은 오피스텔 동이 있는 단지, 그 밖은 대지 · 연면적 큰 쪽.<br>② <b>이전고시 전이라 사업 전 지번으로 신고된 새 아파트</b>: 실거래 지번 = K-apt 지번이고 그 K-apt 가 단지 하나에만 이어져 있거나, 실거래 도로명코드+건물번호 = 대장 도로명코드+건물번호인 단지가 하나일 때. 여기에 같은 아파트 번호(aptSeq)의 <b>첫 계약이 준공 1년 전 이후</b>여야 합니다 — 또는 그 지번에 폐쇄 대장이 없고, 그 번호의 마지막 계약이 준공 뒤이고, 첫 계약이 준공 3년 전 이후일 때(LH수서처럼 준공 몇 해 전부터 신고된 곳).<br>③ <b>옛 지번이 토지이동으로 합병된 곳</b>: 거래 지번이 지금 지적도에 없고, 그 지번 토지이동이력의 마지막 줄이 \'N번과 합병되어 말소\'(원문)이며, 같은 법정동 N 필지의 세대 단지가 하나이고, <b>계약일이 그 단지 사용승인일 이후</b>일 때만(아파트·연립·단독). 사용승인 전 계약은 헐린 옛 건물 거래라 붙이지 않습니다(예: 장미타운 → 은평자이더스타 등 1,304건은 안 붙임 · 능마루빌라 전월세 18건은 붙임).<br>④ <b>옛 건물 거래 떼기</b>: 지번만으로 붙이면 헐린 옛 건물의 거래가 그 자리 새 건물에 붙는다 — 세대 없는 건물(체육관·상가 등)에 붙은 주거 거래 중 그 건물 사용승인 <b>전</b> 계약, 그리고 같은 아파트 번호(aptSeq)의 거래가 사용승인 <b>전에 끝났고</b> 3년 넘게 먼저 시작된 것은 단지에서 떼어 폐쇄 대장 자리의 옛 거래로 둡니다(원본 칸은 그대로 · 뗀 기록을 남김). 예: 신반포스포츠센터에 붙어 있던 옛 신반포9·10·17차 · 녹원한신 3,366건, 포레나노원에 붙어 있던 옛 상계주공8단지 1,536건.<br><span class="muted">막은 예: \'폐쇄 대장 없음\' 하나만 보면 래미안도곡카운티에 헐린 진달래아파트 거래가 붙었다 → 그 번호가 준공 뒤까지 이어질 것을 함께 봅니다.</span>',
    '<b>분양권·입주권 → 단지</b>(목록에만 보이고 평형 요약 · 최고가 · 전세가율 · AI 검색 · 지역 순위에는 넣지 않음) ① 이 단지에 이어진 청약 공고의 지번(공고 · 그 공고의 K-apt · 이 단지 필지)에서 <b>첫 모집공고일 이후</b> 계약 — 입주권은 공고 <b>전 10년</b>까지(조합원 권리는 일반분양 전에 거래됨) ② 이 단지 필지에서 <b>준공 전 ~ 준공 뒤 10년</b> 계약, 같은 필지에 거래 10년 전 이후 준공된 다른 세대 단지가 없을 때 ③ 이 단지 K-apt 의 지번, 그 지번의 K-apt 가 이 단지뿐이고 준공 앞뒤 10년 안. 국토부에 권리로 신고된 것은 그대로 권리 거래로 보여 줍니다.',
    '<b>K-apt → 단지</b> ① 같은 법정동 + 같은 사용승인일인 단지가 양쪽에 하나씩 ② K-apt 도로명주소의 <b>공식 도로명코드+건물번호</b> = 단지 어느 동 대장의 도로명코드+건물번호, 또는 K-apt 의 공식 지번 = 단지 필지 — 그리고 세대수 5% 안 · 양쪽 하나씩. ③ 아래 \'대장 조각 묶기\' ②로 묶은 단지는 그 근거가 된 K-apt 와 잇습니다.',
    '<b>대장 조각 묶기</b>(단지는 대장 총괄표제부마다 하나라, 오래된 대단지는 필지마다 조각이 됩니다 — 흡수한 조각은 지우지 않고 \'묶임\' 으로 남기며 옮긴 필지 · 동 · 거래를 모두 기록합니다) ① 같은 필지(산 · 0번지는 근거로 안 씀)를 쓰는 주거 조각끼리, 두 조각에 붙은 아파트 실거래의 국토부 단지번호(aptSeq)가 합쳐서 <b>정확히 하나</b>일 때 ② <b>K-apt 단지 하나 = 대장 조각 여럿</b>: 아직 안 이어진 K-apt 의 공식 지번에 세대 단지가 하나이고 사용승인일이 같으며, 같은 법정동 · <b>같은 날 승인</b>된 주거 조각 중 다른 단지번호가 없는 것을 <b>전부</b> 모아(골라 맞추지 않음) <b>세대 합이 K-apt 세대수와 정확히 같을 때</b>만 — 한 조각이 두 K-apt 묶음에 같이 들면 묶지 않습니다(예: 상계주공7단지 2,634세대 = 691번지 476 + 692번지 2,158). 반대로 대장 단지 하나에 K-apt 가 둘인 곳(상계주공15·16단지 = 624번지 4,492)은 아직 잇지 않습니다.',
    '<b>청약 공고 → 단지</b>(앞 길이 먼저, 한 공고는 한 단지) ① 같은 법정동 · 입주예정월 ±4개월 안 사용승인 · 단지 세대 ≥ 공급 · 공고 지번 필지와 100m 안 — 후보 하나 ② 공고 지번 = 단지 필지 · 공고 뒤 준공한 세대 단지 하나 ③ 공고 지번 = K-apt 지번(그 지번 K-apt 하나): 그 K-apt 의 단지가 공고 뒤 준공이면 그 단지, 대장이 아직 없는 신축이면 그 K-apt(신축) — 공급 ≤ 세대 ④ <b>오피스텔 · 도시형 · 생활숙박</b>: 공고 지번 = 단지 필지 · 그 필지 단지 하나 · 사용승인 ≥ 공고일 − 3년 ⑤ <b>무순위 · 임의공급 · 불법행위 재공급</b>(준공 뒤 남은 집 · 취소분): 공고 지번 = 단지 필지 · 세대 단지 하나 · 사용승인 ≥ 공고일 − 5년 · 세대 ≥ 공급 ⑥ <b>같은 공고 지번의 다른 공고가 이미 이어진 곳</b>(청약홈이 무순위·재공급마다 관리번호를 따로 붙여 본 분양만 이어지고 뒤 공고가 남던 것): 그 지번의 이어진 공고들이 가리키는 곳이 하나 · 그 필지에 다른 지금 단지·K-apt 없음 · 이 공고일 ≥ 이어진 첫 공고일 · 세대 ≥ 공급 (①~⑤가 끝난 뒤 한 번만).<br><span class="muted">막은 예: 공급 ≤ 세대가 없으면 롯데캐슬 이스트폴(631) 공고가 같은 지번의 어울채행복주택(300)에 붙었다. 사용승인 하한이 없으면 오피스텔 공고가 그 자리 헐리기 전 1978·1985년 건물에 붙었다. 거리 없이 \'법정동 · 입주월 · 세대\' 만 맞는 후보는 쓰지 않는다(겹친 8건 중 7건이 다른 단지).</span>',
    '<b>단지 밖 청약 공고</b>(아직 단지에 안 이어진 것): <b>같은 공고 지번이면 한 항목</b> — 검색 제안 한 줄 · 지도 표 하나 · 상세 하나에 그 지번의 일반·무순위·재공급·임의공급을 공고일 순으로. 청약홈이 공고마다 관리번호를 따로 붙여 같은 집이 여러 개로 떠 보였다. 묶는 근거는 지번뿐(이름 안 봄) · 입주예정월은 같은 사업 무순위가 달리 적는 일이 흔해 키로 안 쓴다. 같은 지번의 다른 공고가 이미 단지에 이어졌으면 위 ⑥ 으로 그 단지에 잇는다 — ⑥ 에 막힌 것(먼저 나온 공고 · 같은 필지에 다른 단지)만 단지 밖에 남고, 상세에 그 단지를 적는다.',
    '<b>지도 자리</b> — 단지는 필지 경계의 중심. 필지가 지금 지적도에 없는 단지는 ① 대장 도로명주소 → 공식 주소(정확히 하나) → 그 공식 지번 필지(같은 시군구)의 중심 ② 그 지번도 지적도에 없으면 대장 도로명주소를 <b>VWorld 지오코더</b>에 물어, 돌려준 주소가 물은 주소와 <b>글자 그대로 같을 때만</b> 그 건물 점(마곡 엠밸리 9단지 · 우디안 · 파크샤인 등)에 놓습니다 — 자리만 쓰고 단지 필지로는 쓰지 않습니다. 폐쇄 대장은 필지 중심, 필지가 없으면 ① 토지이동이력의 \'N번과 합병되어 말소\' 인 N 필지 ② 같은 도로명주소의 지금 건물(자리만 빌리고 \'뒤를 이은 단지\' 로 보지 않음) ③ 공식 주소의 지번 필지. 어느 길로 놓았는지 상세에 적습니다.',
    '<b>대장이 아직 없는 새 단지</b>(재건축·재개발은 이전고시 뒤에 새 지번으로 대장이 생기는 경우가 많음): K-apt 에만 있으면 <b>신축</b>으로 지도·검색에 보이고, 동·호·면적은 공식 대장이 생기면 채워집니다. 추정으로 단지를 만들지 않습니다.',
    '<b>잇지 않는 것</b> — 사업 중 임시 지번(가지번) · 블록 번호(공식 대응표가 없음), 공식 주소의 지번이 지금 지적도에 없는 곳, 여러 단지를 한 번에 모집한 공고(행복주택 · 국민임대 차수 등). 이런 거래·공고는 법정동 · 폐쇄 대장 · 정비구역 상세에서 보입니다.',
  ] },
  { 키: 'bld', 제목: '건축물대장 (국토교통부 건축HUB)', 글: [
    '<b>단지</b>는 대장의 총괄표제부·표제부를 지번과 관리번호로 묶은 것입니다. 동은 이름이 아니라 <b>관리건축물대장PK</b>로 잇습니다.',
    '<b>동 막대</b>의 높이는 지상 층수입니다 — 동의 실제 위치가 아니라 층 구성입니다(위치는 지도). 진한 것이 주거동, 옅은 것이 부속동입니다.',
    '<b>동·호 격자</b>는 가로가 라인, 세로가 층, 칸이 호입니다. 라인은 호번호가 <b>층×100+라인</b> 꼴일 때만 가릅니다(상가·지하 등은 ? 칸).',
    '격자 칸에 올리면 동·라인·층·호와 용도·공시가격이 나오고, 누르면 그 호의 공시가격 이력이 열립니다. 한 라인 안을 세로로 읽는 것이 순수한 층 차이입니다(라인이 다르면 평형이 섞입니다).',
    '<b>전용률</b>은 전유 ÷ <b>계약면적</b>(전유+공용 전부)입니다. 공용 합계가 과소일 수 있어 실제보다 높게 나올 수 있습니다. 흔히 말하는 70~80%는 전유 ÷ 공급(분양)면적인데, 공용을 주거공용·기타공용으로 가르는 코드가 원본에 없어 공급면적은 내지 않습니다.',
    '<b>제원 · 세대</b>는 동별 표제부 세대의 합입니다. 총괄표제부 · K-apt 값이 <b>다를 때만</b> 옆에 그 값을 짧게 적습니다(같으면 안 적음). 다를 수 있는 까닭: 총괄표제부는 단지를 한 장으로 적은 값이라 동별 합과 어긋나기도 하고, K-apt 는 관리사무소가 등록한 값이라 상가 · 관리동이 섞이거나 빠지기도 합니다.',
    '<b>제원 · 동</b>은 대장의 동(주건축물 · 부속 포함) 수입니다. K-apt 주거동 수가 다르면 옆에 \'주거동 N\' 으로 적습니다. <b>층</b>의 지상 최고층은 건물 외곽선(VWorld) 기준이고, 지하층은 대장 기준입니다.',
    '<b>용적률 분위</b>: 같은 용도지역(예: 제2종일반주거지역) 안의 단지끼리, 또는 건물끼리 용적률로 줄 세운 순위입니다. 비교 범위는 받은 지역 전체이고, 몇 개와 견줬는지는 값에 마우스를 올리면 나옵니다. 여러 용도지역에 걸친 단지는 \'여러 용도지역\' 묶음과 견줍니다.',
    '<b>용도</b>(단지 이름 위 칩)는 총괄표제부 주용도(없으면 표제부 주용도) 원문입니다. 칩에 마우스를 올리면 기타용도와 동별 주용도가 나옵니다. 호별 용도(아파트 · 근린생활시설 · 학원 …)는 동·호 탭의 호 칸에 있습니다.',
  ] },
  { 키: '주택가격', 제목: '공시가격 (공동주택가격)', 글: [
    '공시가격은 <b>과세표준용</b>이라 실거래가가 아닙니다. 단지 간 비교에 쓰면 안 됩니다. 격자 색·분위는 <b>그 단지 안</b>에서의 5분위입니다.',
    '연도는 <b>공시기준일</b>(매년 1월 1일), 옆 숫자는 <b>공시일</b>입니다. 같은 해가 두 줄이면 결정공시 뒤 조정공시가 따로 온 것이고, 추이 막대는 나중 공시(조정)를 그립니다.',
    '<b>공시가격 추이</b>는 호마다 그 호의 원본 값을 연도순으로 늘어놓을 뿐 <b>연도별 평균·중위는 내지 않습니다</b> — 연도마다 값이 있는 호 수가 달라 뭉치면 거짓이 됩니다.',
    '건축HUB 주택가격에 없는 <b>연립·다세대</b> 호는 <b>VWorld 공동주택가격</b>(국토교통부 공시)으로 채웠습니다. 같은 필지 안에서 동명·호명이 <b>하나로 맞는 호</b>만 이었고(한쪽 동명이 빈칸이면 그 필지에 그 호명이 양쪽 하나씩일 때만), 두 출처를 한 호에 섞지 않습니다. 이 자료에는 공시일이 없어 연도(기준월이 1월이 아니면 그 달)만 적습니다.',
  ] },
  { 키: 'rtms', 제목: '실거래가 (국토교통부)', 글: [
    '<b>분양권·입주권</b>(국토부에 권리 거래로 신고된 것 — 정비사업은 준공·입주 뒤에도 이전고시·등기 전까지 이렇게 신고됩니다 · 서울은 <b>2007년 1월부터</b> 받았습니다 — 2006년은 25개 구 모두 0건으로 왔습니다)은 매매 목록에 날짜순으로 섞고 줄마다 표시합니다. 원본 지번이 사업 전 지번이라, <b>이 단지에 이어진 청약 공고의 지번</b>이거나 <b>이 단지 필지에서 준공 전 ~ 준공 뒤 10년 안에 맺은 계약</b>(같은 필지에 그 무렵 준공된 다른 주거 단지가 없을 때)만 이 단지 것으로 봅니다. 헐린 뒤 새 대장이 아직 없는 자리의 거래는 폐쇄 대장 · 정비구역 상세에 보입니다. 새 단지의 아파트 실거래가 사업 전 지번으로 신고된 곳(이전고시 전)은 <b>K-apt 지번</b>이 같고 그 K-apt 가 이 단지 하나에만 이어져 있으며 그 아파트 번호(aptSeq)가 준공 무렵에 시작될 때만 이 단지에 붙입니다(정확한 조건은 <a href="#policy" data-pol-go="매칭">데이터 잇기 규칙</a>) — 옛 건물 거래는 옛 번호로 훨씬 일찍부터 있어 붙지 않습니다. 폐쇄 대장 상세에는 그 지번의 단지에 안 붙은 거래를 닫힌 날 앞(옛 건물) · 뒤(새 건물)로 나눠 보입니다. 권리 거래라 완공 아파트 값과 달라 <b>평형 요약·최고가·전세가율·AI 검색·지역 순위에는 넣지 않습니다.</b>',
    '실거래에는 <b>동·호가 없습니다</b>(층·면적까지만 옵니다). 그래서 평형(전용면적) 기준으로만 모읍니다.',
    '<b>거래 내역</b>은 신고일 기준 최근 순이고, <b>해제된 거래도 제자리에</b> 둡니다(취소선) — 그 날 그 신고가 있었던 것은 사실이라서요. 건수·범위·최근 값은 <b>유효 거래만</b> 셉니다.',
    '<b>직거래</b>는 중개사 없이 당사자끼리 한 거래라 가족 간 저가 거래가 섞일 수 있습니다. 직거래 제외를 켜면 뺍니다.',
    '<b>전세가율</b> = 그 평형의 최근 순수 전세(월세 0) 1건 ÷ 최근 중개 매매 1건. 월세가 낀 계약과 직거래는 뺍니다. 두 거래가 떨어져 있으면 <b>시점 차</b>를 같이 적습니다 — 1년 넘게 떨어지면 같은 시점의 값이 아닙니다.',
    '<b>등기 지연</b>은 계약일에서 소유권이전 등기일까지입니다. 등기일자가 빈 거래는 아직 등기 전이라고 단정하지 않습니다(전체에서도 20~30%가 비어 있습니다).',
    '<b>분양권·입주권</b>은 분양권전매 실거래를 <b>지번</b>(공고 지번 · 준공 후 지번)으로 이은 것이고 첫 모집공고일 이후 계약만 셉니다. \'분양가와 차이\' 는 같은 전용면적의 <b>최고</b> 분양가를 뺀 값이라 옵션·확장·층 차이는 들어 있지 않습니다. 입주권은 조합원 권리라 분양가와 견주지 않습니다.',
    '단지에 이어진 실거래가 없다고 나오면 <b>거래가 없다는 뜻이 아닙니다</b> — 실거래는 시군구 단위로 전부 받아 두었고 이 단지에 이어 붙이지 못한 것입니다. 단독·다가구는 원본이 지번을 가려(1**) 잇기가 구조적으로 어렵습니다.',
    '거래 내역은 그 종류(매매 · 전세 · 월세)의 <b>최근 120건</b>까지 받아 보여 줍니다(분양권·입주권은 따로 120건까지 섞음). 평형을 고르면 그 120건 안에서 고른 평형만 남기고, 전체 건수(해제 포함)를 같이 적습니다. 평형 줄의 건수 · 범위는 전체 거래로 셉니다.',
    '전월세 갱신 계약 가운데 <b>종전 보증금</b>이 함께 신고된 것은 같은 계약의 전후를 견줄 수 있습니다. 평형 줄의 \'종전 대비\' 는 그 계약들의 변동률을 건마다 낸 뒤 평균한 값입니다.',
  ] },
  { 키: '지역순위', 제목: 'AI 검색 · 지역 순위', 글: [
    'AI는 문장을 정해진 조건으로 바꾸기만 합니다. <b>숫자는 전부 DB가 셉니다.</b> 어떻게 알아들었는지를 먼저 보여 드리고, 못 알아들은 말은 그렇다고 적습니다.',
    '<b>지역 순위</b>: 아파트 매매 · 해제·직거래 뺌 · 평당가(거래가 ÷ 전용면적 × 3.3058)의 <b>중위값</b>. 기간은 지난 12개월에서 신고가 덜 끝난 이번 달·지난달을 뺀 것입니다. 거래 20건 미만인 곳과, 그 기간 실거래를 다 받지 않은 시군구는 순위에서 빼고 따로 적습니다.',
    '<b>단지 조건</b>(2026-10-22): 평형 · 사용승인 · 세대수 · 역 거리 · 학교 거리 · 정비구역 · 용도지역. 숫자와 단위가 있는 말만 조건이 됩니다 — <b>\'역세권\' \'초품아\'처럼 정해진 기준이 없는 말은 조건으로 바꾸지 않고</b> 거리로 적어 달라고 말합니다. 다만 \'역세권 · 역 주변 · 역 인근\' 은 다른 정렬을 말하지 않았으면 거리로 거르지 않고 <b>역 가까운 순</b>(1.5km 안)으로 줄만 세웁니다(문턱을 지어내지 않음). 결과 줄에는 정렬에 쓴 값(사용승인일 · 세대수 · 매매 건수 · 역·학교 거리)을 같이 보입니다. AI가 문장에 없는 숫자를 만들어 오면 버립니다.',
    '<b>평형은 전용면적</b>입니다(\'30평대\' = 전용 99~132㎡). 공급면적은 원본에 주거공용·기타공용 구분이 없어 정확히 못 내므로 쓰지 않습니다. 대장의 주거 호(아파트·연립·다세대·오피스텔) 전유면적으로 보고, 대장 호가 없는 단지는 실거래 전용면적으로 봅니다. 평형을 걸면 실거래가도 그 면적의 거래로만 봅니다.',
    '사용승인은 단지에서 <b>가장 먼저 승인된 동</b> 기준입니다. 역(1.5km 안)·학교(2km 안, 운영 중)는 단지 중심점에서 잰 <b>직선거리</b>로, 단지 상세의 지하철·학교 칸과 같은 값입니다. 학교 거리는 배정(학구도)이 아닙니다.',
    '정비구역은 서울 정비사업 자료(서울만)에서 <b>필지가 구역과 겹친 단지</b>입니다 — 겹친 넓이가 단지 필지 넓이의 <b>1% 이상</b>인 것만(경계에 겨우 닿은 단지는 뺌 · 정비구역 상세와 같은 기준) · 걸친 비율을 같이 적습니다. 서울 밖 단지는 \'안 걸침\'이 아니라 모름입니다. 재개발·재건축은 사업명에 그 말이 든 것만이고 재정비촉진(뉴타운)·모아타운·가로주택은 따로 고릅니다. 용도지역은 필지 면적 비중이 가장 큰 것입니다.',
    '<b>학교 가까운 순</b>은 단지 중심점에서 가장 가까운 학교(초·중·고를 말하면 그 학교)까지의 직선거리로 줄을 세웁니다 — 거리 문턱을 지어내지 않고 순서만 냅니다(2km 안 · 배정 아님). \'역세권\' \'초품아\' \'학군\' \'한강뷰\' 처럼 기준이나 자료가 없는 말은 조건으로 바꾸지 않고 그 까닭을 알림으로 적습니다.',
    '가격이 아닌 정렬(신축 순 · 역 가까운 순 …)에서 종목(아파트 등)은 <b>그 종류 매매가 있는 단지</b>로 가립니다 — 종류는 실거래로만 압니다. 조건을 따질 값이 없는 단지는 맞는 척 넣지 않고 \'모름\'으로 수만 적습니다.',
    '<b>말 읽기 규칙</b>(2026-10-23, 200문항 점검): <b>\'동\' 을 뺀 동 이름</b>(잠실 · 반포 · 여의도 · 평촌)은 받은 지역 안에 \'그 이름 + 동\' 이 <b>정확히</b> 있을 때만 그 동으로 봅니다 — 같은 말이 구 이름에 맞으면 구가 먼저(마포 = 마포구). 묶어 부르는 말은 뜻이 정해진 것만 구로 풉니다: 마용성(마포·용산·성동) · 노도강(노원·도봉·강북) · 금관구(금천·관악·구로) · 강남3구(강남·서초·송파) · 강남4구(+강동). 별명(래푸 등)은 이름 사전을 지어내지 않으므로 찾지 않습니다.',
    '<b>단위 없는 숫자</b>(\'마포 84\' · \'59 타입\')는 전용 ㎡ 로 읽고 그렇게 읽었다고 적습니다. <b>이상·이하가 없는 금액</b>(\'10억 아파트\')은 쓰지 않고 그렇다고 말합니다 — AI 도 방향을 채우지 못합니다. \'평당 5천 이하\' · \'평당 1억 넘는\' 은 <b>최고가 거래의 평당가</b>(전용 ㎡ ÷ 3.3058 · 결과에 보이는 값)로 거릅니다.',
    '이름은 찾았는데 함께 말한 조건에 맞는 단지가 없으면 \'없다\'(NA) 와 \'이름을 못 찾음\'(SCOPE) 을 가릅니다. 지금 대장에 없는 이름이 폐쇄·말소 대장이나 정비구역 이름에 있으면 그쪽을 알려 드립니다. 지역을 하나도 못 알아들었으면 받은 곳 전체에서 찾았다고 적습니다(조용히 넓히지 않습니다).',
    '노선 이름은 원본 노선 이름과 같거나, 원본 이름의 <b>마지막 말</b>이 같을 때 그 노선입니다(\'신림선\' = \'수도권 경량도시철도 신림선\'). 노선을 말하고 \'가까운\' 이라고 하면 역 가까운 순입니다.',
    'AI 검색 질문 문장은 기능 개선을 위해 로그인 아이디와 함께 보관합니다.',
  ] },
  { 키: '역사', 제목: '이 땅의 역사 (단지 상세 · 토지 탭)', 글: [
    '<b>토지 바뀜</b>(2026-10-24): <b>용도지역</b>은 토지특성의 <b>기준연도 사이에</b> 달라진 해를 적습니다(예: 2025 제2종일반주거지역 → 제3종일반주거지역 · 용도지역1·2 는 한 묶음이라 순서만 바뀐 해는 적지 않음). 바뀌었다가 다음 해에 그대로 되돌아간 것은 조사 흔들림일 수 있어 목차에 올리지 않습니다. <b>지목 · 면적 · 분할 · 합병</b>은 비교로 만들지 않고 토지이동이력의 <b>원문 사유와 이동일</b>을 그대로 씁니다. 지형 · 도로접면 · 이용상황은 조사원이 해마다 다시 판정하는 칸이라 변화로 적지 않습니다(원본 값은 그대로 보관). 공시지가처럼 해마다 바뀌는 게 정상인 값은 변경이 아니라 추이로 봅니다.',
    '<b>위반건축물</b>(2026-10-24): 건축물대장 위에 찍히는 \'위반건축물\' 표시를 GIS건물통합정보(국가공간정보센터 · 세움터 대장 속성)에서 받아 <b>동마다</b> 적습니다. 그 건물을 대장과 잇는 것은 같은 필지 · 대장 관리번호 끝자리 · 사용승인일(또는 연면적)이 <b>하나로만</b> 맞을 때뿐입니다(이름으로 잇지 않음). 못 이은 동은 \'모름\' 이라 세지 않고, 몇 개 동을 확인했는지 함께 적습니다. 위반 내용 · 시정 여부는 원천에 없어 적지 않습니다. 표시가 붙었다 · 떨어진 날은 받을 때마다 버전으로 남깁니다.',
    '<b>새로 잇지 않습니다.</b> 이미 이어 둔 자료의 <b>날짜만</b> 모은 목차입니다 — 건수 · 세대 · 금액 같은 값은 다시 적지 않고(중복 없음), 줄을 누르면 그 값이 있는 칸으로 갑니다(옛 대장 줄은 지도에 그 자리도 표시). 날짜는 원문 그대로이고 없는 날짜는 메우지 않습니다.',
    '들어가는 일: <b>옛 건물</b>(이 단지 필지의 폐쇄·말소 대장, 또는 폐쇄 대장에서 지금 단지로 이어 둔 것)의 사용승인 · 그 지번 옛 실거래(어느 단지에도 안 붙은 것, 대장 닫힌 날 전)의 시작 · 말소/폐쇄 · <b>정비구역</b>(필지의 1% 이상 걸친 서울 정비사업 구역 — 지정일 · 지금 단계의 날짜) · 이 단지 필지의 <b>건축 허가 · 착공</b> · 이 단지에 이은 <b>청약 공고</b> · <b>분양권·입주권</b> 거래 시작(실거래 탭과 같은 규칙) · 지금 대장 사용승인 · 이 단지 실거래 시작.',
    '이 단지 앞의 일(옛 대장 · 정비구역 · 인허가 · 청약 · 분양권)이 하나도 없으면 칸을 보이지 않습니다. 재건축으로 지번이 바뀐 단지(예: 가락시영 → 헬리오시티)는 옛 대장이 다른 지번에 있어 이어 두지 않은 한 여기 나오지 않습니다.',
  ] },
  { 키: '호자료', 제목: '호 상세 — 이어서 보기', 글: [
    '동·호 배치도에서 호를 누르면 그 호의 공시가격 회차 · 면적 아래에 <b>이어서 보기</b>가 있습니다 — 같은 값을 여기 다시 적지 않고(중복 없음) 그 값이 있는 칸으로 바로 갑니다.',
    '<b>이 평형 실거래</b> = 이 호의 전용면적 묶음(㎡ 정수 — 실거래 탭 평형 칩과 같은 키)으로 걸러진 실거래 탭. 실거래에는 동·호가 없어 <b>이 호의 거래</b>가 아니라 같은 단지 · 같은 평형의 거래입니다. 그 평형 거래가 없으면 길도 안 보입니다. <b>정비구역</b> = 단지가 걸친 정비사업 구역 칸(토지 탭).',
  ] },
  { 키: 'kapt', 제목: 'K-apt 공동주택관리정보', 글: [
    'K-apt 는 단지 코드를 대장과 공유하지 않아 <b>법정동 + 사용승인일</b>, 또는 <b>공식 도로명코드+건물번호 · 공식 지번 + 세대 5% 안</b>으로 잇습니다(양쪽 하나씩일 때만). 자세한 규칙은 <a href="#policy" data-pol-go="매칭">데이터 잇기 규칙</a>.',
    'K-apt는 주거동만, 대장은 상가·부속동까지 세므로 동 수·세대수가 다를 수 있습니다.',
    '관리비가 비어 있는 까닭을 가릅니다 — <b>이 구의 관리비를 아직 안 받음</b>(SCOPE) · <b>K-apt 에 이어져 있는데 그 단지 관리비가 없음</b>(같은 구는 받았으니 그 단지가 공시하지 않았거나 그 단지만 못 받은 것 — 둘을 가를 기록은 아직 없음) · <b>K-apt 연결이 확정되지 않음</b>(같은 날 승인된 단지가 여럿이라 버림 — 추측으로 붙이면 다른 단지의 관리비가 사실처럼 보입니다).',
    '교통 탭의 \'K-apt 신고\' 역 · 도보 시간은 관리주체가 적은 값이라, 단지 중심점에서 잰 직선거리와 잰 방법이 다릅니다.',
    '건축물대장이 아직 없는 신축은 K-apt 정보만 보입니다(동 목록 · 필지 · 공시지가는 대장에서 나오므로 없음). 대장이 공개되면 정식 단지로 바뀝니다. 한 지번에 여러 단지가 있으면 실거래 신고의 단지 일련번호로 가릅니다.',
    '<b>관리비 추이</b>(관리 탭): K-apt 자료실이 매주 올리는 연도별 관리비 엑셀(2015년~)의 \'공용관리비(합계)\' 를 지금 세대수로 나눈 달별 선입니다. 위 세대당 공용관리비와 항목 표는 OpenAPI 값이고, 엑셀은 K-apt 가 참고자료로 내는 것이라 두 값이 조금 다를 수 있습니다 — 단지가 일반관리비를 세부 없이 합계로만 올리면 엑셀 쪽이 큽니다(2025년 단지·달의 약 6.5%).',
  ] },
  { 키: 'permit', 제목: '건축인허가 (국토교통부 세움터)', 글: [
    '허가 건수는 건물 수가 아닙니다 — 설계변경·취소로 한 지번에 여러 건이 쌓입니다.',
    '재개발·재건축은 주택법 사업계획승인 대상이라 이 자료에 들어오지 않습니다.',
    '재개발 단지는 준공 때 본번이 바뀌어 지번으로 안 붙는 경우가 있어, <b>신축 · 150세대 이상 · 그 법정동에서 세대수가 유일</b>할 때만 법정동 + 세대수로 이었습니다(추정).',
    '착공지연은 착공예정일과 실제 착공일의 차이만 씁니다. 착공기한은 날짜이지 일수가 아닙니다.',
    '<b>허가 건물</b>(2026-10-24): 허가마다 딸린 건물(원문 \'동별개요\')을 한 줄씩 적습니다. 원문에는 <b>동 이름 칸이 없고</b> 건물명 칸에 사업명이 들어 있는 경우가 많아, 몇 동인지는 알 수 없습니다 — 그래서 \'동\' 이라 부르지 않고 번호로 적으며(원문에 동 이름이 있으면 그 이름), 주건축물 · 세대 많은 순으로 세웁니다. 대장의 동과 면적 · 세대로 맞춰 \'몇 동\' 이라고 짐작하지 않습니다(허가는 짓기 전 설계값). 실제 동은 동·호 탭(건축물대장)에 있습니다.',
    '<b>허가 설계 · 대수선 · 가설 · 철거</b>(2026-10-30): 건축HUB 건축인허가 원문의 평형(전유공용면적 · 호별개요) · 층별 용도(층별개요) · 계획 주차(주차장) · 대수선 내용 · 가설건축물을 그 허가 줄에 붙입니다. 모두 <b>허가(설계 · 신고) 기준</b>이라 설계변경 · 사용승인 뒤 값과 다를 수 있고, 사용승인이 난 허가는 건축물대장 칸이 기준입니다. 평형 이름은 원문 그대로(84A · 301 …)이고, 층별 용도는 여러 동을 합친 층 범위입니다.',
    '<b>철거 · 멸실 신고</b>는 원문에 허가 번호가 비어 있어 <b>이 단지 필지(지번)</b>로만 잇습니다. 날짜 · 석면 함유 표시는 원문 그대로입니다(오타처럼 보이는 날짜도 고치지 않습니다). 모델하우스(견본주택)는 원문 용도 코드에 없어 골라내지 않습니다.',
    '<b>공사 중 건물</b>(지도 \'공사 중\' 핀 · 2026-10-30): 건축허가 신축 중 <b>2022년 이후 착공 · 사용승인 전 · 그 필지에 새 대장이 아직 없는</b> 공동주택 · 오피스텔(10세대 · 호 이상)입니다. 대장 단지와 같은 탭으로 보이지만 값은 전부 허가(설계) 원문이고, 평형 · 실거래 · 공시가격은 사용승인 · 대장 뒤에 생겨 비어 있습니다. 2019~2021년에 착공했는데 승인 기록이 없는 건은 공사 중인지 멈췄는지 알 수 없어 넣지 않습니다.',
  ] },
  { 키: 'precomplex', 제목: '건축물대장 전 단지 — 공사 중 · 사업승인 · 청약 공고', 글: [
    '건축물대장은 사용승인(아파트는 사용검사) 뒤에 생깁니다. 그 전 건물도 단지처럼 볼 수 있게 <b>9억번대 번호</b>(900000001~)를 따로 붙였습니다. 일반 단지 수 · 지역별 개수 · 가격 마커 · 통계 · AI 검색에는 <b>섞지 않습니다</b> — 지도에는 \'공사 중\' · \'승인\' 핀으로만 보입니다.',
    '<b>사업승인 아파트</b>(건축HUB 주택인허가): 총세대 20 이상 · 사용검사일이 비어 있음 · 사업계획승인 2016년 이후 · 같은 필지에 승인일 뒤 사용승인된 건축물대장이 없음.',
    '<b>공사 중 건물</b>(건축HUB 건축인허가): 신축 · 2022년 이후 실제 착공 · 사용승인일이 비어 있음 · 같은 필지에 허가일 뒤 사용승인된 대장이 없음 · 공동주택이거나 오피스텔(층별 용도) · 세대 + 호 10 이상 · 한 필지에 여럿이면 가장 최근 허가 한 건.',
    '<b>청약 공고</b>(청약홈 입주자모집공고): 단지에 아직 안 이어진 공고 · 같은 지번에 위 두 종류의 단지가 없음 · 같은 지번에 첫 공고일 뒤 사용승인된 대장이 없음 · 첫 공고의 입주 예정이 공고보다 뒤이고 이번 달 이후. 공고 때 이미 입주한 분양전환 · 잔여세대 · 공가 재공급은 다 지은 단지라 붙이지 않습니다. 세대 칸은 <b>공급 세대</b>(조합원 · 보류분이 빠질 수 있음)입니다. 매일 새 공고를 봅니다.',
    '지도의 분양 핀이나 검색의 청약 공고를 누르면, 그 공고가 속한 단지가 있으면 단지 상세로 열립니다. 사업승인 · 공사 중 단지에도 같은 지번의 청약 공고가 \'분양 · 청약\' 칸에 붙습니다.',
    '<b>붙이지 않는 것</b>: 단독주택 · 상가 · 창고 · 공장 등, 10세대(호) 미만, 2019~2021년에 착공했는데 승인 기록이 없는 건(공사 중인지 멈췄는지 알 수 없음), 건축허가만 받고 착공 전인 건(허가만 받고 안 짓거나 취소 · 설계변경이 흔해 \'짓는 중\' 으로 오해될 수 있음 — 착공하면 자동으로 붙습니다).',
    '번호는 한 번 주면 바뀌지 않습니다(공유 주소 유지). 매달 다시 보고, <b>같은 필지에 대장 단지가 생기면 그 단지로 넘어갑니다</b> — 옛 번호로 들어와도 정식 단지가 열립니다. 원문에서 빠지고 넘어갈 단지가 없으면 \'없어짐\' 으로 남깁니다. 이름으로 잇지 않습니다.',
    '화면의 값은 허가 · 승인(설계) 원문입니다. 호 · 실거래 · 공시가격 · 관리비는 대장 뒤에 생겨 비어 있습니다. 주변 · 토지의 기준점은 그 지번 필지의 가운데입니다.',
    '알려진 한계: 승인 건 중 지번이 블록 · 로트인 곳(약 1,400)과 청약 공고 중 지번이 없는 곳(약 210)은 필지를 못 찾아 지도 핀이 없고 검색으로만 찾습니다. 사용검사 예정일이 지났는데 기록이 없는 곳(약 1,600)은 \'완공 여부 모름\' 입니다. 청약 공고는 택지 블록 지번, 승인은 실제 지번으로 적혀 <b>같은 사업이 두 번 보일 수 있습니다</b>(이름으로 합치지 않음 — 많아야 약 50곳).',
  ] },
  { 키: 'namemask', 제목: '건물 이름 속 개인 이름 가림', 글: [
    '건축물대장 · 허가 원문의 건물 이름 끝에 <b>소유자 이름이 괄호로</b> 붙은 경우가 많습니다(예: \'단독주택 (홍길동)\'). 터무니는 대표자 이름을 보이지 않는 것과 같은 까닭으로, 화면 · 검색 · 지도에서 이 괄호를 <b>(개인 이름 가림)</b>으로 바꿔 보입니다.',
    '가리는 기준: 이름 <b>끝</b> 괄호 안이 한글 3글자이고 첫 글자가 흔한 성씨이며 끝 글자가 지명 · 시설 말(군 · 시 · 구 · 동 · 리 · 관 · 당 · 창 · 교 · 산 등)이 아닌 것, 또는 두 글자 성(남궁 · 황보 · 제갈 등)으로 시작하는 한글 4글자. \'외 1\' 같은 꼬리는 떼고 봅니다. 유치원 · 국방부 · 요양원 같은 말은 사람 이름이 아니라 그대로 둡니다.',
    '괄호 안에 <b>\'대표 · 대표자 · 대표이사\' 뒤에 사람 이름</b>이 붙은 경우(예: \'(○○건설(주)대표홍길동)\')도 회사 이름째 괄호를 가립니다. 대표자 이름은 보이지 않는다는 원칙입니다.',
    '<b>짐작이 섞인 규칙</b>입니다 — 사람 이름 꼴인 상호(예: 3글자 가게 이름)도 가려질 수 있고, 규칙 밖의 이름(2글자 · 외자)은 남을 수 있습니다. 원문(대장 · 허가 원본)은 고치지 않았습니다. 처음 적용(2026-10-30): 단지 이름 44,452곳 · 옛(폐쇄) 대장 이름 4,789곳.',
  ] },
  { 키: 'zone', 제목: '용도지역 · 토지이용', 글: [
    '단지의 용도지역 비중은 <b>필지와 용도지역 폴리곤의 교차 면적</b>입니다 — 땅으로 잰 값이라 대장 경계와 정확히 같지는 않습니다.',
    '토지이용계획의 \'일부 걸침\' 은 필지의 일부만 구역 안, \'접함\' 은 경계에 닿아 있다는 <b>원본 표기</b>입니다. 묶음(개발·정비 · 높이·경관 …)은 우리가 정한 것이고 이름은 원본 그대로입니다.',
    '지도 겹쳐보기는 원본 영역을 <b>하나도 빼지 않고</b> 그립니다. 겹친 곳은 위(작은 것)의 색만 보이고, 누르면 그 자리의 영역이 전부 나옵니다.',
    '<b>토지거래허가구역</b>: 구역 안에서 정해진 면적을 넘는 땅(아파트는 대지지분)을 사고팔려면 시·군·구청 허가가 필요합니다.',
    '토지이용계획은 세대 있는 단지의 <b>대표 필지부터</b> 받고 있습니다 — 나머지 필지의 지정은 받기 전까지 모릅니다.',
    '필지 표의 \'대표 · 부속\' 은 대장의 표제부 지번 · 부속지번(getBrAtchJibunInfo)으로 가립니다. 부속지번 자료가 안 온 단지는 근거가 없다고 적습니다.',
    '용도지역 칸 위는 건축물대장(총괄표제부 · 표제부)에 적힌 값, 아래는 필지와 용도지역 지도(VWorld)가 겹친 넓이 비중입니다.',
    '용도지역 비중이 <b>0.5% 미만</b>인 것은 접어서 이름만 적습니다 — 필지와 용도지역 폴리곤은 다른 사람이 다른 때 그린 경계라 미세하게 어긋나고, 그 틈이 \'걸침\' 으로 잡히기 때문입니다.',
  ] },
  { 키: 'poi', 제목: '주변 상권 · 생활 편의 (소상공인시장진흥공단)', 글: [
    '생활 편의 묶음은 <b>우리가 정한 것</b>입니다 — 원본 분류에 그런 축은 없습니다. 숫자는 500m 기준, 500m 안에 없으면 1km 안 개수를 흐리게 적습니다.',
    '학원은 소분류로 나눴습니다(요가·필라테스는 운동으로, 직원 훈련 같은 어른 학원은 묶음에서 뺌). 병원은 원본이 \'내과/소아과\' 를 한 칸으로 적어 소아과만 따로 셀 수 없고, 유사 의료업은 뺐습니다. 상가 데이터라 학교는 들어 있지 않습니다.',
    '브랜드는 상호명에 적힌 글자로 찾습니다 — 상호에 브랜드가 없는 점포가 있어 <b>있다는 말은 되지만 없다는 말은 안 됩니다</b>.',
    '\'단지 땅 위 점포\' 는 거리로 센 것이 아니라 <b>지번(PNU)</b>이 이 단지 필지와 같은 점포입니다 — 단지내상가로 봐도 됩니다.',
    '병원·약국 탭의 \'상가 업종으로 본 병원·약국\' 은 이 상가 데이터의 업종 이름으로 센 것이라, 심평원(요양기관) · 행안부(약국 인허가) 숫자와 다릅니다.',
  ] },
  { 키: 'academy', 제목: '학원·교습소 (교육부 NEIS)', 글: [
    '교육청에 <b>등록된</b> 학원·교습소(개원)입니다. 생활 편의의 학원 숫자는 상가 업종이라 출처가 다르고, 둘 다 맞습니다.',
  ] },
  { 키: 'school', 제목: '학교 · 통학구역', 글: [
    '학교 거리는 직선거리라 <b>배정과 다릅니다</b>. 폐교·휴교는 빼고 운영 중인 학교만 셉니다.',
    '<b>학생 · 학급 · 교사 수</b>는 학교알리미(한국교육학술정보원) 공시 \'학년별·학급별 학생수\' 그대로입니다 — 학급당 학생 수 · 수업교원 1인당 학생 수도 공시값이고 우리가 나누지 않습니다. 공시는 1년에 한 번이라 화면에 공시연도를 적습니다.',
    '학교 위치(교육부 학교ID)와 학교알리미(정보공시 학교코드)는 <b>코드 체계가 달라</b> 대응표가 없습니다. 이름은 보지 않고 <b>학교급 · 설립일(위치표준의 설립일은 학교알리미의 설립일 또는 개교일과 같다) · 학교알리미 법정동 경계 안 · 양쪽 후보 하나</b>일 때만 잇습니다(서울 1,313곳 중 1,256곳). 같은 구 · 같은 설립일로 넓히면 다른 학교가 붙어서(중산고 ↔ 대진디자인고) 쓰지 않습니다. 못 이은 학교는 학생 수 칸이 비고 까닭을 적습니다.',
    '<b>통학구역 · 학교군(학구도)</b>: 단지 중심점이 든 <b>초등 통학구역 · 중학교 학교군 · 고등학교 학군</b>(한국교육시설안전원 경계)과 그 구역의 학교를 <b>학교학구도연계정보</b>(학구ID ↔ 학교ID 공식 대응표)로 보입니다 — 이름으로 잇지 않습니다. 교육 탭 목록에서 구역 학교에는 \'배정\'(초) · \'학교군\'(중) · \'학군\'(고) 표를 달고, 1km 안 학교와 한 목록으로 합칩니다(같은 학교를 두 번 안 보임). 중학교는 학교군 안 추첨이라 후보, 고등학교 학군은 일반고 배정 단위(특목·자율·특성화고는 따로 지원).',
    '단지 중심점 한 점으로 판정해 큰 단지는 동마다 다를 수 있습니다. 최종 배정은 교육지원청이 정합니다. 학구도 7종은 매년 3월 · 9월에 새로 나옵니다(기준일을 화면에 적음).',
  ] },
  { 키: 'subway', 제목: '지하철 · 버스', 글: [
    '지하철은 1.5km 안 역만 보입니다.',
    '정류장은 같은 이름(길 양쪽)을 한 줄로 묶고, 서울BIS·경기BIS 로 두 번 들어온 같은 승강장은 <b>ARS 번호로 묶어</b> 셉니다. 줄을 누르면 지도에 고정됩니다.',
    '버스 번호는 그 노선이 서는 <b>가장 가까운 정류장</b> 기준으로 나눠 같은 노선이 두 번 나오지 않습니다. 노선 쪽 정류장 좌표가 없는 행은 다른 지역 노선이 섞일 수 있어 뺐습니다.',
  ] },
  { 키: 'kinder', 제목: '유치원 · 어린이집', 글: [
    '유치원 원아·학급 수는 <b>공시 시점이 유치원마다 달라</b> 줄마다 적습니다 — 1년에 두 번만 공시하고 몇 해 전 공시가 마지막인 곳도 있어 오늘 숫자가 아닙니다.',
    '유치원은 유치원알리미(연 2회 공시), 어린이집은 보육정보공개입니다. 둘 다 500m 안 가까운 순이고, 정원·현원은 원문 <b>기준일</b> 값입니다. 입소 대기나 배정은 이 자료에 없습니다.',
  ] },
  { 키: 'hira', 제목: '병원·약국 (심평원 · 행정안전부)', 글: [
    '큰 병원은 5km 안 가장 가까운 상급종합·종합병원 3곳, 칸은 500m(없으면 1km) 안 종별 개수입니다.',
    '진료과목은 신고 과목이 넓어(정형외과 의원도 소아청소년과를 신고) 쓰지 않고, 요양기관 개설 현황의 <b>간판 과목</b>만 셉니다 — 그 기준일 뒤 생긴 곳은 빠져 있습니다.',
    '<b>약국 인허가</b>(행정안전부 지방행정 인허가)는 심평원과 출처가 달라 숫자가 다를 수 있습니다. 영업과 폐업을 가르고, 폐업은 원문 좌표가 비어 있는 것이 많아 좌표 있는 것만 셉니다(실제보다 적게 잡힘).',
  ] },
  { 키: 'redev', 제목: '정비사업 구역', 글: [
    '구역에 <b>걸친 단지</b>는 단지 필지와 구역 경계의 겹친 넓이로 셉니다. 경계에 겨우 닿은(1% 미만) 단지는 뺍니다.',
    '<b>정비계획</b>(계획 용적률·건폐율·층수·공급 세대)은 서울시 도시계획사업(서울플랜+) 자료입니다. 구역 자료와 번호가 달라 <b>자치구 코드 · 사업 소분류 코드 · 사업 면적(소수점까지)</b>이 모두 같은 후보가 하나일 때, 또는 사업 위치 지번이 구역 안이고 면적이 5% 안일 때만 이었습니다. 원문에 0으로 적힌 칸은 \'안 적음\' 이라 비웁니다.',
    '지도 색은 사업 종류, 테두리는 추진 정도(점선 초기 · 실선 인가 이후 · 굵은 실선 착공·준공)입니다. 지구 안에 구역이 겹친 곳은 위(작은 것)의 색만 보입니다.',
  ] },
  { 키: 'houseplan', 제목: '주택인허가 — 사업승인 · 사용검사 전 아파트 (건축HUB)', 글: [
    '30세대 이상 아파트는 건축허가가 아니라 <b>주택법 사업계획승인</b>을 받습니다. 건축HUB 주택인허가(대용량 월 파일)의 원문 그대로입니다 — 기본개요 · 동별개요 · 호별개요(평형) · 행위개요 · 주차장 · 부대시설 · 복리분양시설.',
    '지도의 <b>승인</b> 핀: 총세대 20+ · 승인 2016년 이후 · 사용검사일이 원문에 비어 있는 것. 그 필지에 사용승인된 건축물대장이 생겼으면 뺍니다. 예정일이 지났는데 사용검사 기록이 없으면 \'완공 여부 모름\' 입니다.',
    '<b>시공사 · 분양가 · 분양 일정 · 분양사무소</b>는 청약 공고 전에는 공식 자료가 없습니다. 민간 사이트의 분양계획은 공식 경로가 없어 쓰지 않습니다. 청약홈에 <b>같은 지번</b> 공고가 나오면 그 원문으로 채웁니다(이름으로 잇지 않음).',
    '사업주체(시행)는 관리공동형별개요에서 <b>같은 지번 + 같은 사업승인일</b>일 때만 가져옵니다(주택대장 번호가 달라서).'] },
  { 키: 'houseplanah', 제목: '청약홈 분양정보 — 승인 단지에 붙이는 법', 글: [
    '승인 단지의 대표 지번(시군구 · 법정동 · 산 · 본번 · 부번)이 청약 공고 주소에서 풀어낸 지번과 <b>똑같을 때만</b> 붙입니다. 블록 주소(택지지구 ○○BL)는 지번이 없어 붙이지 않습니다.'] },
  { 키: 'applyhome', 제목: '청약홈 분양정보 (한국부동산원)', 글: [
    '공고는 지번·입주월·세대·거리로 단지에 잇습니다(추정 연결, 이름으로 잇지 않음). 다섯 길과 막는 조건은 <a href="#policy" data-pol-go="매칭">데이터 잇기 규칙</a>.',
    '공고 지번이 지금 지적도에 없으면 같은 본번 필지들의 가운데에 <b>근처</b>로 놓습니다(정확한 자리 아님). 그것도 없으면 <b>자리 모름</b>으로 법정동에 모읍니다.',
    '경쟁률은 <b>1순위 · 해당지역</b> 기준(없으면 그 다음 순위)입니다. \'미달 n\' 은 접수가 공급보다 n세대 적었다는 원문 표기입니다. 오피스텔·도시형은 군 단위로 청약을 받아 같은 군의 타입은 같은 경쟁률입니다.',
    '공급 세대는 그 공고의 일반·특별공급분이라 단지 전체 세대보다 적을 수 있습니다.',
    '분양권·입주권 가운데 첫 모집공고 <b>전</b>에 맺은 것은 입주권(조합원 권리) 계약입니다 — 공고 지번에서 공고 전 10년 안의 것만 잇습니다. 공고 자료 없이 <b>이 단지 필지에서 맺은 계약</b>(준공 전 ~ 준공 뒤 10년)으로 이은 것은 같은 필지에 그 무렵 준공된 다른 단지가 없을 때만입니다.',
    '단지에 아직 안 이어진 공고는 공고 지번 자리에 보입니다(지도 표 · 검색 제안).',
    '청약홈은 무순위 · 재공급 · 임의공급마다 관리번호를 새로 붙여 이름이 같아도 공고가 따로 있습니다 — 단지 밖 공고는 <b>같은 공고 지번</b>이면 한데 보입니다(묶는 근거는 지번뿐).',
  ] },
  { 키: 'closed', 제목: '폐쇄·말소 건축물대장', 글: [
    '같은 필지(PNU)에 있던 <b>예전 건물(또는 예전 서류)의 닫힌 대장</b>입니다. 땅이 같을 뿐 시기가 다르고, 지금 단지가 그 자리에 이어 지은 것이라고 단정하지 않습니다.',
    '\'폐쇄\' 는 철거와 다를 수 있습니다(대장을 새로 만들며 닫은 경우). 묶음은 같은 필지 · 같은 말소일입니다.',
    '지도의 ✕ 와 회색 점선은 그 대장이 있던 <b>필지의 지금 경계</b>입니다 — 옛 건물 모양이 아닙니다.',
    '폐쇄 대장에는 지금 대장과 달리 <b>호가 어느 동 대장에 속하는지 적는 번호</b>(상위 대장 번호)가 없어 호를 동에 확실히 이을 수 없습니다 — 이름으로 잇지 않으므로 동 · 호 격자를 그리지 않고 따로 보입니다. 층은 표제부 번호로, 전용면적은 호 번호로 이었습니다(코드).',
    '폐쇄 상세의 공시가격은 VWorld 공동주택가격(국토교통부 공시) 원문입니다 — 과세 기준 값이라 실거래가가 아닙니다. 공시는 지번 단위라 <b>대장이 닫힌 해까지</b>만 보입니다(그 뒤 값은 같은 지번에 새로 지은 건물 것). 연도마다 공시된 호 수가 달라 평균은 내지 않고 원문 최저~최고만 적습니다.',
    '이 지번으로 신고된 실거래 가운데 단지에 안 붙은 것을 <b>대장이 닫힌 날 앞(헐리기 전 건물)</b> · <b>뒤(이 자리에 새로 지은 건물 — 새 대장이 아직 없거나 다른 지번이라 못 이음)</b>로 나눠 보입니다. 닫힌 뒤의 분양권·입주권은 이 자리에 새로 짓는 사업의 권리입니다. 실거래 신고의 단지 이름은 참고로만 보이고 잇는 데 쓰지 않습니다.',
  ] },
  { 키: '지역', 제목: '법정동 · 행정동', 글: [
    '법정동·행정동 마스터는 국가데이터처 법정동 연계정보(분기별, 2013.07~)입니다. 옛 행정동 이름으로 찾으면 그 뒤를 이은 지금 행정동(공식 연계정보에서 같은 법정동을 나눠 가진 동)으로 안내하고, 그 동이 걸친 법정동 기준으로 결과를 보여 줍니다 — 행정동과 법정동 경계가 달라 경계 밖 단지가 섞일 수 있습니다.',
  ] },
];
const 정책별칭 = { bldg: 'bld', parcel: 'zone', landuse: 'zone', cost: 'kapt', bus: 'subway', childcare: 'kinder', applyhome0: 'applyhome' };
function 정책그리기(키) {
  const el = $('#polbody'); if (!el) return;
  if (!el.dataset.done) {
    el.innerHTML = `<nav class="poltoc">${정책.map(p => `<a href="#policy" data-pol-go="${esc(p.키)}">${esc(p.제목)}</a>`).join('')}</nav>`
      + 정책.map(p => `<section class="polsec" id="pol-${esc(p.키)}"><h3>${esc(p.제목)}</h3><ul>${p.글.map(g => `<li>${g}</li>`).join('')}</ul></section>`).join('');
    el.dataset.done = '1';
  }
  const k = 정책별칭[키] || 키;
  const sec = k && document.getElementById('pol-' + k);
  document.querySelectorAll('.polsec.on').forEach(x => x.classList.remove('on'));
  if (sec) { sec.classList.add('on'); setTimeout(() => sec.scrollIntoView({ block: 'start' }), 30); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-pol]');
  if (a) { e.preventDefault(); 보기전환('policy'); 정책그리기(a.dataset.pol); return; }
  const g = e.target.closest('[data-pol-go]');
  /* 2026-10-24 사장님 "정책을 눌러도 이동 안 해" — 정책 안 목차용이라 화면을 안 바꿨다. 단지 상세 · 모달에서 눌러도 정책으로 간다 */
  if (g) { e.preventDefault(); if (!g.closest('#polbody')) { try { $('#homodal').classList.remove('on'); } catch (x) {} 보기전환('policy'); } 정책그리기(g.dataset.polGo); return; }
  if (e.target.closest('#polback')) { 보기전환('map'); }
  if (e.target.closest('#poltop')) { $('#view-policy').scrollTo({ top: 0, behavior: 'smooth' }); }
});
/* 10-31 정책 머리 줄이 붙었는지(내렸는지) — 붙으면 아래 선 · '↑ 목차' 단추를 보인다 */
{ const v = document.getElementById('view-policy');
  if (v) v.addEventListener('scroll', () => { const h = v.querySelector('.polhead'); if (h) h.classList.toggle('stuck', v.scrollTop > 40); }, { passive: true }); }

/* ---- 문의 탭 (2026-10-22) ----
   질문·답변은 누구나 본다(/api/inquiries). 남기기는 로그인한 사용자만(서버도 막는다). 답변은 root 만(서버도 막는다).
   ★ 사용자가 쓴 글은 **전부 esc** 한다 — 남이 쓴 글이 모두에게 보이는 자리다. */
let 문의쪽 = 1, 나 = null;
async function 나알기() {
  const t = 토큰(); if (!t) return (나 = null);
  try { const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } });
        나 = r.ok ? await r.json() : null; if (!r.ok) 토큰저장(''); }
  catch { 나 = null; }
  return 나;
}
async function 문의탭그리기(쪽 = 1) {
  문의쪽 = 쪽;
  await 나알기();
  const 새 = $('#qnew');
  새.innerHTML = 나
    ? `<div class="qform"><label for="qtxt" class="ec-help">문의 남기기 <span class="muted">(${esc(나.username)}로 로그인됨)</span></label>
        <textarea id="qtxt" class="ec-txt" maxlength="2000" rows="3" placeholder="궁금한 점 · 잘못된 값 · 바라는 기능"></textarea>
        <div class="ec-btns"><button type="button" class="ec-b ec-pri" data-q-send>남기기</button><span class="qmsg muted"></span></div></div>`
    : `<p class="ec-help">문의를 남기려면 로그인하세요. <button type="button" class="ec-b" data-q-login>로그인하러 가기</button></p>`;
  const L = $('#qlist');
  L.innerHTML = '<p class="muted">불러오는 중…</p>';
  try {
    const d = await fetch('/api/inquiries?page=' + 쪽).then(r => r.json());
    if (d.error) throw new Error(d.error);
    const 날 = 한국때;
    const 관리 = 나 && 나.role === 'root';
    L.innerHTML = (d.목록 || []).length ? (d.목록 || []).map(q => `
      <article class="qitem" data-qid="${q.id}">
        <div class="qhead"><span class="pill${q.답변 ? ' use' : ''}">${q.답변 ? '답변함' : '답변 전'}</span>
          <span class="muted">#${q.id} · ${esc(q.누구)} · ${esc(날(q.때))}</span>
          ${q.종류 === '오류' ? `<span class="pill">오류</span>` : ''}</div>
        ${q.종류 === '오류' ? `<p class="qerr">${esc(q.무엇 || '')} 실패 — ${esc(q.말 || '')}${q.오류번호 ? ` <span class="muted">· 오류번호 ${esc(q.오류번호)}</span>` : ''}${q.단지코드 ? ` <span class="muted">· 단지코드 ${esc(q.단지코드)}</span>` : ''}</p>` : ''}
        ${q.내용 ? `<p class="qbody">${esc(q.내용).replace(/\n/g, '<br>')}</p>` : (q.종류 === '오류' ? '<p class="qbody muted">(글 없이 오류 정보만 남김)</p>' : '')}
        ${q.답변 ? `<div class="qans"><b>터무니</b> <span class="muted">${esc(날(q.답변때))}</span><p>${esc(q.답변).replace(/\n/g, '<br>')}</p></div>` : ''}
        ${관리 ? `<details class="qadm"${q.답변 ? '' : ' open'}><summary>${q.답변 ? '답변 고치기' : '답변 달기'}</summary>
            <textarea class="ec-txt" rows="3" maxlength="4000">${esc(q.답변 || '')}</textarea>
            <div class="ec-btns"><button type="button" class="ec-b ec-pri" data-q-answer="${q.id}">저장</button><span class="qmsg muted"></span></div></details>` : ''}
      </article>`).join('')
      + (d.전체 > 30 ? `<div class="ec-btns">${쪽 > 1 ? `<button type="button" class="ec-b" data-q-page="${쪽 - 1}">이전</button>` : ''}
          <span class="muted">${fmt(d.전체)}건 중 ${fmt((쪽 - 1) * 30 + 1)}–${fmt(Math.min(쪽 * 30, d.전체))}</span>
          ${쪽 * 30 < d.전체 ? `<button type="button" class="ec-b" data-q-page="${쪽 + 1}">다음</button>` : ''}</div>` : '')
      : '<p class="muted">아직 남긴 문의가 없습니다.</p>';
  } catch (e) {
    L.innerHTML = `<p class="note sm">문의 목록을 읽지 못했습니다 — ${esc(e.message)}</p>`;
  }
}
document.addEventListener('click', async e => {
  const v = document.getElementById('view-qna'); if (!v || v.hidden || !v.contains(e.target)) return;
  if (e.target.closest('[data-q-login]')) { 보기전환('my'); return; }   // 313: 로그인은 내 정보 탭에서
  const pg = e.target.closest('[data-q-page]'); if (pg) { 문의탭그리기(Number(pg.dataset.qPage)); return; }
  const send = e.target.closest('[data-q-send]');
  if (send) {
    const 글 = ($('#qtxt') || {}).value || '', msg = send.parentElement.querySelector('.qmsg');
    if (!글.trim()) { msg.textContent = '내용을 적어 주세요'; return; }
    send.disabled = true;
    try {
      const r = await fetch('/api/inquiry', { method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + 토큰() },
        body: JSON.stringify({ 종류: '일반', 내용: 글 }) });
      const d = await r.json();
      if (r.status === 401) { 토큰저장(''); return 문의탭그리기(); }
      if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
      문의탭그리기(1);
    } catch (x) { send.disabled = false; msg.textContent = '남기지 못했습니다 — ' + x.message; }
    return;
  }
  const ans = e.target.closest('[data-q-answer]');
  if (ans) {
    const box = ans.closest('.qadm'), msg = box.querySelector('.qmsg');
    ans.disabled = true;
    try {
      const r = await fetch(`/api/inquiry/${ans.dataset.qAnswer}/answer`, { method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + 토큰() },
        body: JSON.stringify({ 답변: box.querySelector('textarea').value }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
      문의탭그리기(문의쪽);
    } catch (x) { ans.disabled = false; msg.textContent = '저장하지 못했습니다 — ' + x.message; }
  }
});

boot();

/* ---------------- 거리 재기 (2026-10-21, 사장님 요청) ----------------
   단추를 켜면 지도를 누를 때마다 점이 찍히고, 점마다 **처음부터 누적 거리**를 적는다.
   마우스를 움직이면 마지막 점에서 커서까지 점선과 거리가 따라온다.
   끝: 두 번 누르기 · Esc · 우클릭.  마지막 점 지우기: Backspace.  다시 단추 = 지우고 끄기.
   ★ 켜져 있는 동안은 마커·경계를 눌러도 반응하지 않게 한다(재는 중에 단지가 열리면 안 된다) —
     CSS(.measuring) 가 그 층들의 포인터를 끈다. 거리는 Leaflet map.distance(대원 거리, m). */
const 재기 = { 켜짐: false, 끝남: false, 점: [], 층: null, 선: null, 따라선: null, 따라말: null };
function 거리말(m) { return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)}km`; }
function 재기합() {
  let t = 0;
  for (let i = 1; i < 재기.점.length; i++) t += map.distance(재기.점[i - 1], 재기.점[i]);
  return t;
}
function 재기판() {
  /* ★ 선이 단지 마커(markerPane 600) 아래에 깔려 안 보였다 → 마커 위 전용 판(620). 누르기는 통과 */
  if (!map.getPane('measure')) {
    const p = map.createPane('measure'); p.style.zIndex = 620; p.style.pointerEvents = 'none';
  }
  return 'measure';
}
function 재기그리기() {
  if (!재기.층) 재기.층 = L.layerGroup().addTo(map);
  재기.층.clearLayers();
  if (!재기.점.length) { 지도알림('거리', '지도를 눌러 첫 점을 찍으세요 · 두 번 누르거나 Esc 로 끝'); return; }
  재기.선 = L.polyline(재기.점, { pane: 재기판(), color: css('--mark'), weight: 3, interactive: false }).addTo(재기.층);
  let 누적 = 0;
  재기.점.forEach((p, i) => {
    if (i) 누적 += map.distance(재기.점[i - 1], p);
    L.circleMarker(p, { pane: 재기판(), radius: 4.5, weight: 2, color: css('--mark'), fillColor: css('--surface'),
                        fillOpacity: 1, interactive: false }).addTo(재기.층)
      .bindTooltip(i ? 거리말(누적) : '시작', { permanent: true, direction: 'top', offset: [0, -6],
                                              className: 'mtip' + (i === 재기.점.length - 1 && i ? ' last' : '') });
  });
  지도알림('거리', `거리 ${거리말(재기합())} · 점 ${재기.점.length}개`
    + (재기.끝남 ? ' · 다시 누르면 새로 잽니다 · 단추를 한 번 더 누르면 지웁니다' : ' · 두 번 누르거나 Esc 로 끝 · Backspace 마지막 점 지우기'));
}
function 재기따라(e) {
  if (!재기.켜짐 || 재기.끝남 || !재기.점.length) return;
  const a = 재기.점[재기.점.length - 1];
  if (!재기.따라선) {
    재기.따라선 = L.polyline([a, e.latlng], { pane: 재기판(), color: css('--mark'), weight: 2, dashArray: '5 5', interactive: false }).addTo(map);
    재기.따라말 = L.tooltip({ direction: 'right', offset: [10, 0], className: 'mtip live' });
  }
  재기.따라선.setLatLngs([a, e.latlng]);
  재기.따라말.setLatLng(e.latlng).setContent(`+${거리말(map.distance(a, e.latlng))} · 합 ${거리말(재기합() + map.distance(a, e.latlng))}`);
  if (!map.hasLayer(재기.따라말)) 재기.따라말.addTo(map);
}
function 재기따라지우기() {
  if (재기.따라선) { map.removeLayer(재기.따라선); 재기.따라선 = null; }
  if (재기.따라말) { map.removeLayer(재기.따라말); 재기.따라말 = null; }
}
function 재기누름(e) {
  if (!재기.켜짐) return;
  if (재기.끝남) { 재기.점 = []; 재기.끝남 = false; }
  재기.점.push(e.latlng);
  재기그리기();
}
function 재기끝(e) {
  if (!재기.켜짐 || 재기.끝남) return;
  if (e && e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
  /* 두 번 누르기는 click 두 번 + dblclick 이라 같은 자리 점이 하나 더 찍힌다 — 하나 뺀다 */
  if (e && e.type === 'dblclick' && 재기.점.length >= 2) {
    const n = 재기.점.length;
    if (map.distance(재기.점[n - 1], 재기.점[n - 2]) < 1) 재기.점.pop();
  }
  재기.끝남 = true; 재기따라지우기(); 재기그리기();
}
function 재기키(e) {
  if (!재기.켜짐) return;
  if (e.key === 'Escape') { 재기끝(); }
  else if (e.key === 'Backspace' && !재기.끝남 && 재기.점.length
           && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) {
    e.preventDefault(); 재기.점.pop(); 재기그리기();
  }
}
function 거리재기단추() {
  const btn = $('#measure');
  재기.켜짐 = !재기.켜짐;
  btn.setAttribute('aria-pressed', String(재기.켜짐));
  map.getContainer().classList.toggle('measuring', 재기.켜짐);
  if (재기.켜짐) {
    재기.점 = []; 재기.끝남 = false;
    map.doubleClickZoom.disable();
    map.on('click', 재기누름); map.on('dblclick', 재기끝); map.on('contextmenu', 재기끝);
    map.on('mousemove', 재기따라);
    document.addEventListener('keydown', 재기키);
    재기그리기();
  } else {
    map.doubleClickZoom.enable();
    map.off('click', 재기누름); map.off('dblclick', 재기끝); map.off('contextmenu', 재기끝);
    map.off('mousemove', 재기따라);
    document.removeEventListener('keydown', 재기키);
    재기따라지우기();
    if (재기.층) 재기.층.clearLayers();
    재기.점 = [];
    지도알림('거리', '');
  }
}

/* ---------------- 동네 고르기 (2026-10-21 18:56, 사장님 "만들어봐") ----------------
   왼쪽 위 창: [법정동|행정동] 탭 · [구 ▾] · [동 ▾].
   · 탭 = 넓게 볼 때 그리는 경계 종류(전엔 오른쪽 '행정동' 체크박스). 고른 것은 이 브라우저에 기억(편의).
   · 동을 고르면 그 동으로 가서 테두리를 강조(lawdFocusLayer)하고, 그 동 안의 **다른 체계** 경계를
     얇게 같이 그린다 — '법정동 장위동 = 행정동 장위1동 34% · 장위2동 33% · 장위3동 31%'.
     둘을 늘 같이 그리면 선이 이중으로 보여 지저분하다 — 겹쳐 보여주는 건 **고른 동 하나**만.
   · 지도를 움직이면 가운데가 어느 구·동인지 창이 따라간다('지금 어디'). 고른 직후 1.5초는 안 따라간다. */
const 동네 = { 시도: [], 시도cd: '', 구: [], 동: [], 구cd: '', 동kind: '', 고른: null, 멈춤: 0, 타이머: null, 번: 0, 구번: 0, 리: [], 리부모: '', 리번: 0 };
/* ★ 19:03 사장님: "시 군 구를 다 고를 수 있어야" — 시·도 → 시·군·구 → 읍·면·동. 목록은 전국(법정동코드),
   받은 자료가 없는 곳은 '자료 없음' 으로 적고 고르면 이름만 보인다(지도는 안 옮긴다 — 옮길 상자가 없다). */
const 구이름 = nm => String(nm || '').replace(/^(.+?시)(.+구)$/, '$1 $2');
let relateLayer = null, relateLabelLayer = null;
const 동네종류 = () => (행정동보기 ? 'adm' : 'lawd');
const 동네말 = k => (k === 'adm' ? '행정동' : '법정동');
/* ★ 2026-10-27 사장님 "고를 때 단지 개수도" — 서버가 지도 마커 그대로 센 수(단지수). 수를 못 받았으면 안 적는다 */
/* ★ 17:03 사장님 "법정동 행정동은 걍 갯수만 보여줘" — '이름 (수)' 만. 수를 받았으면 '경계 없음' 같은 덧말도 안 붙인다 */
const 수있음 = x => typeof x.단지수 === 'number';
const 단지수말 = x => (수있음(x) ? ` (${fmt(x.단지수)})` : '');

async function 동네시작() {
  if (!$('#areactl')) return;
  relateLayer = L.geoJSON(null, {
    interactive: false,
    style: f => (f.properties.체계 === 'adm'
      ? { color: css('--ink-2'), weight: 1.6, opacity: .85, dashArray: '4 4', fill: false }
      : { color: css('--s5'), weight: 1.6, opacity: .85, fill: false }),
  }).addTo(map);
  relateLabelLayer = L.layerGroup().addTo(map);
  동네탭표시();
  document.querySelectorAll('#areactl .ac-tabs button').forEach(b =>
    b.addEventListener('click', () => 동네탭(b.dataset.k)));
  $('#acSido').addEventListener('change', e => 동네시도(e.target.value, true));
  $('#acSgg').addEventListener('change', e => 동네구(e.target.value, true));
  $('#acDong').addEventListener('change', e => e.target.value ? 동네동(e.target.value) : 동네지우기());
  /* 2026-10-26 리 — '리 전체' 로 되돌리면 그 읍·면을 다시 보인다(리 목록은 그대로) */
  $('#acRi').addEventListener('change', e => e.target.value ? 동네리(e.target.value)
    : (동네.리부모 ? 동네동(동네.리부모, true) : null));
  $('#acClear').addEventListener('click', 동네지우기);
  try {
    const r = await fetch('/api/areas/sido').then(r => r.json());
    if (r.error) return 오류토스트('시·도 목록', r);
    동네.시도 = r.시도 || [];
    $('#acSido').innerHTML = '<option value="">시·도</option>' + 동네.시도.map(g =>
      `<option value="${g.sido_cd}">${esc(g.이름 || '')}${수있음(g) ? 단지수말(g) : g.자료 ? '' : ' · 자료 없음'}</option>`).join('');
  } catch (e) { 오류토스트('시·도 목록', null, e); }
  map.on('moveend', () => { clearTimeout(동네.타이머); 동네.타이머 = setTimeout(동네따라가기, 500); });
  동네따라가기();
}
function 동네탭표시() {
  document.querySelectorAll('#areactl .ac-tabs button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.k === 동네종류())));
}
async function 동네탭(k) {
  if (k === 동네종류()) return;
  행정동보기 = k === 'adm';
  try { localStorage.setItem('teomoony.adm', 행정동보기 ? '1' : '0'); } catch { /* 편의 기능 */ }
  동네탭표시();
  if (map.getZoom() < LAWD_ZOOM) loadLawds();
  else toast(`지도를 넓히면 ${동네말(k)} 경계가 보입니다`, 2500);
  /* 고른 동은 다른 체계의 것이 되므로 지우고, 같은 자리의 이 체계 동을 다시 찾는다 */
  동네지우기(true);
  if (동네.구cd) await 동네구(동네.구cd, false);
  동네따라가기(true);
}
async function 동네시도(sido, 이동) {
  if (이동 && 동네.고른) 동네지우기(true);
  동네.시도cd = sido || '';
  const sel = $('#acSgg');
  동네.구 = []; 동네.구cd = ''; 동네.동 = []; 동네.동kind = '';   /* 동 칸을 비웠으니 기억도 비운다(안 비우면 같은 구를 다시 골라도 안 불러왔다) */
  $('#acDong').innerHTML = '<option value="">읍·면·동</option>'; $('#acDong').disabled = true;
  if (!sido) { sel.innerHTML = '<option value="">시·군·구</option>'; sel.disabled = true; return; }
  const 번 = ++동네.구번;
  try {
    const r = await fetch(`/api/areas/sgg?sido=${sido}`).then(r => r.json());
    if (번 !== 동네.구번) return;
    if (r.error) return 오류토스트('시·군·구 목록', r);
    동네.구 = r.구 || [];
    sel.innerHTML = `<option value="">시·군·구 (${동네.구.length})</option>` + 동네.구.map(g =>
      `<option value="${g.sgg_cd}">${esc(구이름(g.sgg_nm))}${수있음(g) ? 단지수말(g) : g.자료 ? '' : ' · 자료 없음'}</option>`).join('');
    sel.disabled = false;
    if (이동) {
      const 있 = 동네.구.filter(g => g.minx != null);
      if (있.length) {
        동네.멈춤 = Date.now() + 1500;
        map.fitBounds([[Math.min(...있.map(g => g.miny)), Math.min(...있.map(g => g.minx))],
                       [Math.max(...있.map(g => g.maxy)), Math.max(...있.map(g => g.maxx))]], { padding: [30, 30] });
        if (있.length < 동네.구.length) toast(`${동네.구.length}곳 중 ${있.length}곳만 자료를 받았습니다 — 받은 곳으로 옮깁니다`, 3500);
      } else toast('이 시·도는 아직 자료를 받지 않았습니다 — 목록만 보입니다', 3500);
    }
  } catch (e) { 오류토스트('시·군·구 목록', null, e); }
}
async function 동네구(sgg, 이동) {
  if (이동 && 동네.고른) 동네지우기(true);   /* 사람이 구를 바꿨다 — 앞 동의 강조·겹침 설명을 남기지 않는다 */
  동네.구cd = sgg || '';
  const sel = $('#acDong');
  if (!sgg) { sel.innerHTML = '<option value="">읍·면·동</option>'; sel.disabled = true; 동네.동 = []; return; }
  const g = 동네.구.find(x => x.sgg_cd === sgg);
  if (이동 && g && g.minx != null) {
    동네.멈춤 = Date.now() + 1500;
    map.fitBounds([[g.miny, g.minx], [g.maxy, g.maxx]], { padding: [30, 30] });
  } else if (이동 && g) toast(`${esc(구이름(g.sgg_nm))}는 아직 자료를 받지 않았습니다 — 동 이름만 보입니다`, 3500);
  const k = 동네종류();
  if (동네.동kind === k && 동네.동.length && 동네.동[0]._sgg === sgg) return;
  const 번 = ++동네.번;
  try {
    const r = await fetch(`/api/areas/dongs?sgg=${sgg}&kind=${k}`).then(r => r.json());
    if (번 !== 동네.번) return;
    if (r.error) return 오류토스트('동 목록', r);
    동네.동 = (r.동 || []).map(x => ({ ...x, _sgg: sgg })); 동네.동kind = k;
    sel.innerHTML = `<option value="">${동네말(k)} (${동네.동.length})</option>` + 동네.동.map(d =>
      `<option value="${d.cd}">${esc(d.이름 || '')}${수있음(d) ? 단지수말(d) : d.경계있음 ? '' : ' · 경계 없음'}</option>`).join('');
    sel.disabled = false;
    if (r.말 && 이동) toast(esc(r.말), 4000);
  } catch (e) { 오류토스트('동 목록', null, e); }
}
function 리줄숨김() {
  동네.리 = []; 동네.리부모 = '';
  $('#acRiRow').hidden = true; $('#acRi').innerHTML = '<option value="">리 전체</option>';
}
function 동네지우기(조용히, 리유지) {
  동네.고른 = null;
  if (!리유지) 리줄숨김();
  lawdFocusLayer.clearLayers();
  if (relateLayer) relateLayer.clearLayers();
  if (relateLabelLayer) relateLabelLayer.clearLayers();
  $('#acRel').hidden = true; $('#acRel').innerHTML = '';
  $('#acClear').hidden = true;
  if (!조용히) $('#acDong').value = '';
}
async function 동네동(cd, 리유지) {
  const k = 동네종류();
  const d = 동네.동.find(x => x.cd === cd);
  동네지우기(true, 리유지);
  if (리유지) $('#acRi').value = '';
  else if (k === 'lawd') 리목록(cd);   /* 기다리지 않는다 — 경계 그리기와 따로 */
  동네.고른 = { k, cd };
  $('#acClear').hidden = false;
  동네.멈춤 = Date.now() + 1800;
  try {
    const f = await fetch(k === 'adm' ? `/api/adms/${cd}/geo` : `/api/lawds/${cd}/geo`).then(r => r.json());
    if (f.error) {
      if (d && d.minx != null) map.fitBounds([[d.miny, d.minx], [d.maxy, d.maxx]], { padding: [40, 40] });
      if (f._상태 === 404) return toast(`${esc(d ? d.이름 : cd)} — 이 ${동네말(k)}의 경계를 아직 받지 않았습니다`, 3500);
      return 오류토스트(`${동네말(k)} 경계`, f);
    }
    lawdFocusLayer.addData(f);
    /* 고른 동은 **굵은 실선** — 안에 그리는 다른 체계(점선/가는 선)와 섞이지 않게 */
    lawdFocusLayer.setStyle({ color: css('--s6'), weight: 3.4, opacity: 1, dashArray: null,
                              fillColor: css('--s3'), fillOpacity: .06 });
    map.fitBounds(lawdFocusLayer.getBounds(), { padding: [40, 40] });
  } catch (e) { return 오류토스트(`${동네말(k)} 경계`, null, e); }
  /* 그 동 안의 다른 체계 */
  try {
    const r = await fetch(`/api/areas/relate?kind=${k}&cd=${cd}`).then(r => r.json());
    if (!동네.고른 || 동네.고른.cd !== cd) return;
    if (r.error) return 오류토스트('겹치는 동', r);
    const 다른 = k === 'adm' ? 'lawd' : 'adm';
    if (r.없음 || !(r.features || []).length)
      return toast(`${esc(d ? d.이름 : cd)} — ${esc(r.말 || '겹치는 ' + 동네말(다른) + '을 찾지 못했습니다')}`, 3500);
    r.features.forEach(x => { x.properties.체계 = 다른; });
    relateLayer.addData({ type: 'FeatureCollection', features: r.features });
    r.features.forEach(x => {
      const p = x.properties;
      if (p.centroid_lat == null) return;
      L.marker([p.centroid_lat, p.centroid_lng], { interactive: false,
        icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
          html: `<div class="rlbl ${다른}"><b>${esc(p.이름)}</b></div>` }) }).addTo(relateLabelLayer);
    });
    /* ★ 19:40 사장님: 비율(%)은 안 보인다 — **어느 동이 겹치는지**만. 순서는 많이 겹치는 순(서버가 정렬),
       '(일부)' = 그 동의 일부만 이 동에 들어온다(상대 넓이 < 90%). 경계선이 스치는 조각(3% 미만)은 서버가 뺀다. */
    /* ★ 19:42 사장님: 창 아래 글자도 뺀다 — 겹치는 동은 **지도 위 경계와 이름표**로만 보인다 */
  } catch (e) { 오류토스트('겹치는 동', null, e); }
}
/* ★ 2026-10-26 사장님 "법정동까지만 보여주는데 리까지 있는 경우도 있어" — 고른 읍·면에 리가 있으면 한 줄 더 */
async function 리목록(emd) {
  const 번 = ++동네.리번;
  try {
    const r = await fetch(`/api/areas/ris?emd=${emd}`).then(r => r.json());
    if (번 !== 동네.리번 || !동네.고른 || 동네.고른.cd !== emd) return;
    if (r.error) return 오류토스트('리 목록', r);
    동네.리 = r.리 || []; 동네.리부모 = emd;
    if (!동네.리.length) { $('#acRiRow').hidden = true; return; }
    $('#acRi').innerHTML = `<option value="">리 전체 (${동네.리.length})</option>` + 동네.리.map(x =>
      `<option value="${x.cd}">${esc(x.이름 || '')}${수있음(x) ? 단지수말(x) : x.경계있음 ? '' : ' · 경계 없음'}</option>`).join('');
    $('#acRiRow').hidden = false;
  } catch (e) { 오류토스트('리 목록', null, e); }
}
async function 동네리(cd) {
  const x = 동네.리.find(y => y.cd === cd);
  lawdFocusLayer.clearLayers();
  if (relateLayer) relateLayer.clearLayers();
  if (relateLabelLayer) relateLabelLayer.clearLayers();
  동네.고른 = { k: 'lawd', cd: 동네.리부모, 리: cd };
  $('#acClear').hidden = false;
  동네.멈춤 = Date.now() + 1800;
  try {
    const f = await fetch(`/api/lawds/${cd}/geo`).then(r => r.json());
    if (f.error) {
      if (x && x.minx != null) map.fitBounds([[x.miny, x.minx], [x.maxy, x.maxx]], { padding: [40, 40] });
      if (f._상태 === 404 || f.error === 'not found') return toast(`${esc(x ? x.이름 : cd)} — 이 리의 경계를 아직 받지 않았습니다`, 3500);
      return 오류토스트('리 경계', f);
    }
    lawdFocusLayer.addData(f);
    lawdFocusLayer.setStyle({ color: css('--s6'), weight: 3.4, opacity: 1, dashArray: null, fillColor: css('--s3'), fillOpacity: .06 });
    map.fitBounds(lawdFocusLayer.getBounds(), { padding: [40, 40] });
  } catch (e) { 오류토스트('리 경계', null, e); }
}
async function 동네따라가기(강제) {
  if (!강제 && Date.now() < 동네.멈춤) return;
  if (!$('#areactl') || document.activeElement && document.activeElement.closest && document.activeElement.closest('#areactl select')) return;
  const c = map.getCenter();
  try {
    const r = await fetch(`/api/areas/here?lat=${c.lat.toFixed(6)}&lng=${c.lng.toFixed(6)}`).then(r => r.json());
    if (r.error) return;
    const 여기 = r[동네종류()] || null;
    const sgg = (여기 && 여기.sgg_cd) || (r.adm && r.adm.sgg_cd) || '';
    if (!sgg) return;
    const sido = sgg.slice(0, 2);
    if (sido !== 동네.시도cd) { $('#acSido').value = sido; await 동네시도(sido, false); }
    if (sgg !== 동네.구cd || 동네.동kind !== 동네종류()) { $('#acSgg').value = sgg; await 동네구(sgg, false); }
    if (!동네.고른) $('#acDong').value = 여기 ? 여기.cd : '';
  } catch { /* 따라가기는 편의 — 실패해도 고르기는 된다 */ }
}

/* ---------------- 분양(청약홈) (2026-10-21, 사장님 "1,2 ㄱㄱ") ----------------
   실거래 탭(정식 단지) · 대장 없는 신축 상세에 그릇(.ahbox)을 두고, 그려진 뒤 따로 받아 채운다.
   이어진 공고가 없으면 **칸 자체를 안 보인다** — 2020년 전 단지까지 '없음' 을 붙이면 소음이다.
   연결은 추정(법정동 · 입주월 · 세대 · 거리)이라 그렇게 적는다. 이름으로 잇지 않았다. */
const 분양캐시 = new Map();
/* 2026-10-22: 공고가 없어도 같은 필지·거래 뒤 준공으로 이은 분양권·입주권 거래가 있으면 탭을 연다 — 수는 공고 수, 공고가 없으면 거래 수 */
function 분양수(cid) { const r = 분양캐시.get(`c|${cid}`); if (!r) return 0; const n = (r.공고 || []).length;
  return n || ((Number((r.분양권수 || {}).건수) || 0) + (Number((r.분양권수 || {}).취소) || 0)); }
async function 분양탭확인(cid) {
  const 키 = `c|${cid}`;
  let r = 분양캐시.get(키);
  if (!r) {
    try { r = await fetch(`/api/applyhome?complex_id=${encodeURIComponent(cid)}`).then(x => x.json()); } catch { return; }
    if (!r || r.error) return;
    분양캐시.set(키, r);
  }
  const b = document.querySelector('#detail .tab[data-tab="sale"]');
  if (!b || !lastDetail || String((lastDetail.complex || {}).complex_id) !== String(cid)) return;   // 그사이 다른 단지로 옮겼다
  const n = 분양수(cid);
  if (n) { b.hidden = false; b.innerHTML = `분양·청약 <b>${fmt(n)}</b>`; }
  else if (detailTab === 'sale') { detailTab = 'info'; renderDetail(lastDetail); }   // 공고가 없는 단지로 옮겼다
}
async function 분양채우기() {
  const box = document.querySelector('#detail .ahbox');
  if (!box) return;
  const [kind, id] = (box.dataset.ah || '').split('|');
  const 키 = box.dataset.ah;
  try {
    let r = 분양캐시.get(키);
    if (!r) {
      r = await fetch(`/api/applyhome?${kind === 'c' ? 'complex_id' : 'kapt_code'}=${encodeURIComponent(id)}`).then(r => r.json());
      if (r.error) return;                      // 분양 칸은 덤 — 못 받아도 상세는 그대로
      분양캐시.set(키, r);
    }
    const 지금 = document.querySelector('#detail .ahbox');
    if (!지금 || 지금.dataset.ah !== 키) return;  // 그사이 다른 단지로 옮겼다
    지금.innerHTML = 분양칸(r.공고 || []) + 분양권칸(r);
  } catch { /* 덤 */ }
}
/* ★ 2026-10-24 교육 탭 학교급 한 칸 — 단지가 든 구역(초 통학구역 · 중 학교군 · 고 학군)과 그 구역 학교(학교학구도연계정보) + 1km 안 학교를
   **한 목록**으로(같은 학교를 두 번 안 보인다 · school_id 로 합침). 구역 학교에는 '배정'/'학교군'/'학군' 표.
   중·고는 구역 학교 중 1km 밖은 접어 둔다(학군에 스무 곳이 넘는다). 거리는 모두 v_complex_school 과 같은 직선거리. */
function 학교급칸(급, 요, 목, 구, 학구받음) {
  const 짧 = 급.replace('학교', '');
  const 표말 = { 초등학교: '배정', 중학교: '학교군', 고등학교: '학군' }[급];
  const 구역들 = [...new Map(구.map(x => [x.구역id, x])).values()];
  const 구역학교 = 구.filter(x => x.school_id);
  const 구역id = new Set(구역학교.map(x => x.school_id));
  const 합 = new Map();
  for (const x of 목) 합.set(x.school_id, { ...x, 구역: 구역id.has(x.school_id) });
  for (const x of 구역학교) if (!합.has(x.school_id))
    합.set(x.school_id, { school_id: x.school_id, 학교급: 급, 이름: x.이름 || x.원문이름, 설립: x.설립, 거리m: x.거리m, 이음: x.이음,
      학생: x.학생, 학급: x.학급, 학급당: x.학급당, 교사: x.교사, 교사당: x.교사당, 공시연도: x.공시연도, 제외: x.제외, 제외사유: x.제외사유,
      알리미적재: x.알리미적재, 구역: true, 위치없음: !x.이름, 운영: x.운영 });
  const 다 = [...합.values()].sort((a, b) => (a.거리m ?? 1e9) - (b.거리m ?? 1e9));
  const 펼 = 급 === '초등학교' ? 다 : 다.filter(x => !x.구역 || (x.거리m ?? 1e9) <= 1000 || x === 다.find(y => y.구역));
  const 접 = 다.filter(x => !펼.includes(x));
  const 칸 = x => `
    <div class="scell"${x.school_id && !x.위치없음 ? ` data-pt="schoolid|${esc(x.school_id)}"` : ''}>
      <span class="sg">${esc(x.설립 || '')}${x.분교 === '분교' ? ' 분교' : ''}</span>
      <b>${esc(x.이름 || '—')}${x.구역 ? ` <span class="ztag">${표말}</span>` : ''}</b>
      ${x.school_id && !x.위치없음 ? `<button type="button" class="sdet" data-school="${esc(x.school_id)}" title="학교 상세">자세히 ›</button>` : ''}
      <span class="sd">${x.거리m != null ? fmt(x.거리m) + 'm' : '거리 모름'}${x.남녀 && x.남녀 !== '남녀공학' ? ' · ' + esc(x.남녀 === '남' ? '남학교' : x.남녀 === '여' ? '여학교' : x.남녀) : ''}</span>
      ${x.위치없음 ? `<span class="sst">${gapCell('', 'UNSURE', '연계표에는 있는데 학교 위치 자료에 없습니다(폐교·이전 등) — 원문 이름만')}</span>` : 학교공시줄(x)}
    </div>`;
  const 구역줄 = 구역들.length ? 구역들.map(z => `
      <div class="zrow2 hzone" role="button" tabindex="0" data-hzone="${({ '통학구역': 'E', '중학교 학교군': 'M', '고등학교 학교군': 'H' })[z.구역종류] || 'E'}|${esc(z.구역id)}"
           title="눌러서 지도에 경계 보기">
        <span class="zt">${esc(z.구역종류)}</span>
        <b>${esc(z.구역)}</b>${Number(z.공동) ? ' <span class="zb">공동</span>' : ''}
        <span class="muted sm">· ${esc(짧)}학교 ${fmt(구.filter(y => y.구역id === z.구역id && y.school_id).length)}곳</span>
        <span class="hzgo">지도에 보기</span>
      </div>`).join('') + `<p class="note sm" title="${esc((급 === '초등학교' ? '배정 구역' : 급 === '중학교' ? '학교군 안 추첨 — 표시 학교는 후보' : '일반고 배정 단위(특목 · 자율 · 특성화는 따로)') + ' · 단지 중심점으로 판정')}">${급 === '중학교' ? '추첨 · 후보 학교 · ' : ''}기준일 ${esc(날짜((구[0] || {}).기준일, ''))}</p>`
    : `<p class="note sm">${gapCell('', 학구받음 ? 'UNSURE' : 'SCOPE', 학구받음
        ? `단지 중심점이 어느 ${급 === '초등학교' ? '통학구역' : '학교군'}에도 안 들어갑니다 — 경계이거나 원본에 빠진 곳입니다`
        : '이 지역의 학구도를 아직 받지 않았습니다')}</p>`;
  if (!다.length) return `${sect(급, 'school')}${구역줄}<p class="note">${gapCell('', 'NA', `이 단지 2km 안에 ${짧}학교가 없습니다`)}</p>`;
  return `${sect(급, 'school', 요 ? ` ${fmt(요.r1000)}<span class="muted">· 1km</span>` : '')}
    ${구역줄}
    <div class="schrow">${펼.map(칸).join('')}</div>
    ${접.length ? `<details class="zfold"><summary>이 ${급 === '중학교' ? '학교군' : '학군'}의 나머지 ${fmt(접.length)}곳 (1km 밖)</summary><div class="schrow">${접.map(칸).join('')}</div></details>` : ''}
    ${요 ? `<p class="note sm">${Number(요.r1000) ? `1km 안 ${fmt(요.r1000)}곳` : (목.length > 1 ? `1km 안에 없어 가장 가까운 곳 — 같은 거리 ${fmt(목.length)}곳` : `1km 안에 없어 가장 가까운 한 곳`)} · 2km 안 ${fmt(요.r2000)}곳</p>` : ''}`;   /* '직선거리' 는 정책(공통)에 */
}
/* ★ 2026-10-23 학교알리미 공시 한 줄 — 공시값 그대로. 못 이은 까닭을 가른다(안 받음 SCOPE · 받았는데 못 이음 UNSURE · 공시 제외 NA) */
function 학교공시줄(x) {
  if (x.학생 != null && x.제외 !== 'Y')
    return `<span class="sst">학생 <b>${fmt(x.학생)}</b> · 학급 ${fmt(x.학급)} · 학급당 ${esc(String(x.학급당 ?? '—'))}명<br>교사 ${fmt(x.교사)} · 수업교원 1인당 학생 ${esc(String(x.교사당 ?? '—'))}명</span>`;
  if (x.제외 === 'Y') return `<span class="sst">${gapCell('', 'NA', '학교알리미 공시 제외' + (x.제외사유 ? ' — ' + x.제외사유 : ''))}</span>`;
  if (!Number(x.알리미적재)) return `<span class="sst">${gapCell('', 'SCOPE', '이 구의 학교알리미 공시를 아직 받지 않았습니다')}</span>`;
  if (!Number(x.이음)) return `<span class="sst">${gapCell('', 'UNSURE', '학교알리미 공시와 코드로 잇지 못했습니다 — 이름으로는 잇지 않습니다')}</span>`;
  return `<span class="sst">${gapCell('', 'NA', '이 학교의 학생 수 공시가 없습니다')}</span>`;
}
function 분양칸(공고, 머리에적음 = false) {   // 머리에적음: 공고 상세처럼 '안 이어짐' 을 위에서 이미 말한 경우
  if (!공고.length) return '';
  const 날 = v => 날짜(v);   /* 원문이 'YYYY-MM-DD' 와 'YYYYMMDD' 둘 다 온다 — 날짜() 가 둘 다 받는다 */
  const 월 = v => 날짜(v);
  /* 단지에 안 이어진 공고(지도 핀)는 '추정 연결' 표가 맞지 않는다 — 출처 표만 단다 */
  /* ★ 2026-10-23 "똑같은 건데 달라 보여" — 공고가 여럿이면 줄 머리는 **종류 · 공고일**, 이름은 첫 공고 이름과 다를 때만(예: '(2차)', '오피스텔 IM594').
     '무순위·재공급 · 무순위' 처럼 같은 말이 두 번 나오지 않게 원문 구분이 종류 말에 이미 있으면 뺀다. */
  const 첫이름 = (공고[공고.length - 1] || {}).house_nm || '';
  const 여럿 = 공고.length > 1;
  const 안이어짐만 = !공고.some(p => p.근거);
  return `${sect('분양', 공고.some(p => p.근거) ? 'applyhome' : 'applyhome0', ` ${fmt(공고.length)}`)}
    ${공고.map(p => {
      const 형 = p.주택형 || [];
      const 종 = p.공고종류 === 'APT' ? (여럿 ? '분양' : null) : p.공고종류 ? 공고종류말[p.공고종류] : null;
      const 구분 = [종, p.house_secd_nm && !(종 || '').includes(p.house_secd_nm) && p.house_secd_nm !== 'APT' ? p.house_secd_nm : null,
                   p.house_dtl_secd_nm, p.rent_secd_nm].filter(Boolean);
      return `<div class="ahrow">
        <div class="ah1">${여럿
          ? `<b>${esc(구분[0] || '공고')} · ${esc(날(p.rcrit_pblanc_de))}</b>
             <span class="muted">${esc([...구분.slice(1), p.house_nm && p.house_nm !== 첫이름 ? p.house_nm : null].filter(Boolean).join(' · '))}</span>`
          : `<b>${esc(p.house_nm || '')}</b> <span class="muted">${esc(구분.join(' · '))}</span>`}</div>
        <!-- 2026-10-22 사장님 "가로 말고 세로로" — 공고 정보를 한 줄씩 -->
        <dl class="ahkv">${[
          ['모집공고', 날(p.rcrit_pblanc_de)],
          p.rcept_bgnde ? ['청약 접수', 날(p.rcept_bgnde)] : null,
          p.przwner_de ? ['당첨자 발표', 날(p.przwner_de)] : null,
          ['입주예정', 월(p.mvn_prearnge_ym)],
          ['공급', `${fmt(p.tot_suply || 0)}세대`],
          p.cnstrct_entrps_nm ? ['시공', esc(p.cnstrct_entrps_nm)] : null,
          p.pblanc_url ? ['공고 원문', `<a href="${esc(p.pblanc_url)}" target="_blank" rel="noopener">청약홈 공고</a>`] : null,
        ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${형.length ? `<table class="mini"><thead><tr><th>주택형(전용)</th><th class="n">공급</th><th class="n">최고 분양가</th><th class="n">전용 평당</th>${
            형.some(m => m.경쟁 != null) ? '<th class="n">경쟁률</th>' : ''}${형.some(m => m.가점최저 != null) ? '<th class="n">당첨가점</th>' : ''}</tr></thead><tbody>
          ${형.map(m => `<tr><td>${esc(m.house_ty || '')}${m.전용m2 ? `<span class="muted"> ${(Number(m.전용m2) / 3.3058).toFixed(1)}평</span>` : ''}</td>
            <td class="n">${fmt(m.공급 || 0)}</td>
            <td class="n">${m.최고원 ? eok(m.최고원) : '—'}</td>
            <td class="n">${m.최고원 && m.전용m2 ? eok(Number(m.최고원) / (Number(m.전용m2) / 3.3058)) : '—'}</td>${
            형.some(z => z.경쟁 != null) ? `<td class="n" title="${esc([m.경쟁군 ? `${m.경쟁군}군 전체(이 군 공급 ${fmt(m.경쟁공급)}세대) — 군 안 여러 타입이 같은 경쟁률` : '', m.경쟁순위 ? m.경쟁순위 + '순위' : '', m.경쟁구분 || '', m.접수 != null ? '접수 ' + fmt(m.접수) + '건' : ''].filter(Boolean).join(' · '))}">${
              m.경쟁 == null ? '—' : (m.경쟁군 ? `<span class="muted sm">${esc(m.경쟁군)}군</span> ` : '') + (m.미달 != null ? `<span class="warnx">미달 ${fmt(m.미달)}</span>`
                : /^\d+(\.\d+)?$/.test(String(m.경쟁).trim()) ? esc(String(m.경쟁)) + ':1'
                : `<span class="muted" title="원문 경쟁률 칸 '${esc(String(m.경쟁))}' — 숫자가 아님(접수가 없었거나 집계 안 함)">${esc(String(m.경쟁)) === '-' ? '—' : esc(String(m.경쟁))}</span>`)}</td>` : ''}${
            형.some(z => z.가점최저 != null) ? `<td class="n">${m.가점최저 != null ? `${Number(m.가점최저)}~${Number(m.가점최고)}` : '—'}</td>` : ''}</tr>`).join('')}
          </tbody></table>
          ${형.some(m => m.경쟁 != null) ? `` : ''}` : ''}
        ${p.근거 ? `<p class="note sm">추정 연결 — ${esc(p.근거)}${p.거리m != null ? ` · 공고 지번과 ${fmt(p.거리m)}m` : ''}. 이름으로 잇지 않았습니다.</p>` : ''}
        ${p.공고종류 === 'PBLPVT' ? '<p class="note sm">공공지원민간임대는 분양이 아니라 임대라 금액 칸을 비웠습니다(조건은 공고문).</p>' : ''}
      </div>`;
    }).join('')}
    ${안이어짐만 && !머리에적음 ? `<p class="note sm">단지에 아직 안 이어진 공고 — 공고 지번 자리에 보임</p>` : ''}`;
}

/* 생활 편의 묶음 머리 (294, 2026-10-21) — 서버 ord 번호 구간으로 나눈다. 번호는 server.js _q_poiLife 한 곳에서만 정한다. */
function 생활묶음(pl) {
  const g = o => o <= 6 ? '장보기·먹거리' : o <= 14 ? '병원·약국' : o <= 19 ? '학원·공부'
               : o <= 23 ? '운동·목욕' : o <= 25 ? '생활' : o <= 28 ? '놀거리' : '그 밖';
  const out = [];
  for (const x of pl) {
    const k = g(Number(x.ord) || 99);
    if (!out.length || out[out.length - 1][0] !== k) out.push([k, []]);
    out[out.length - 1][1].push(x);
  }
  return out;
}

/* ---------------- 토지이용계획 (2026-10-21, 사장님 "토지이용계획도 ㄱㄱ") ----------------
   토지 탭에 그릇(.lubox)을 두고 그려진 뒤 따로 받아 채운다(분양 칸과 같은 방식).
   ★ 묶음은 **우리가 정한 것**이다 — 원본은 이름 목록일 뿐이다. 이름은 원본 그대로 쓴다.
     · 거래   : 토지거래계약에관한허가구역 — 사고팔 때 허가가 필요하다. 맨 위에 둔다.
     · 개발·정비 : 정비구역 · 재개발 · 재정비촉진 · 소규모주택정비 · 지구단위계획 · 공공주택 복합 · 건축허가제한 · 개발제한
     · 용도지역 : 코드 UQA1~4 (주거·상업·공업·녹지)
     · 높이·경관 : 고도지구 · 최고높이 · 경관 · 역사문화 · 대공방어 · 비행/표면구역
     · 나머지는 접어 둔다. '접함'(도로·공원·학교에 닿아 있음)은 따로 접는다.
   ★ 받은 필지가 단지의 일부뿐이면 그렇게 적는다. 안 받은 필지를 '해당 없음' 으로 말하지 않는다. */
const 토지이용캐시 = new Map();
async function 토지이용채우기() {
  const box = document.querySelector('#detail .lubox');
  if (!box) return;
  const 키 = box.dataset.lu;
  box.innerHTML = `${sect('토지이용계획', 'landuse')}<p class="note muted">불러오는 중…</p>`;
  let r = 토지이용캐시.get(키), 실패 = null;
  if (!r) {
    try {
      const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/landuse`);
      if (!x.ok) throw new Error('HTTP ' + x.status);
      r = await x.json(); 토지이용캐시.set(키, r);
    } catch (e) { 실패 = e.message || String(e); }
  }
  const 지금 = document.querySelector('#detail .lubox');
  if (!지금 || 지금.dataset.lu !== 키) return;   // 그사이 다른 단지로 옮겼다
  지금.innerHTML = 실패
    ? `${sect('토지이용계획', 'landuse')}<p class="note">${gapCell('', 'UNSURE',
        '토지이용계획을 불러오지 못했습니다 — ' + 실패 + '. 없다는 뜻이 아니라 못 본 것입니다')}</p>`
    : 토지이용칸(r);
}
function 토지이용분류(x) {
  const n = x.이름 || '', c = x.코드 || '';
  if (n === '토지거래계약에관한허가구역') return '거래';
  if (/정비구역|정비예정|재개발|재건축|재정비촉진|소규모주택정비|공공주택 복합|지구단위계획|건축허가·착공제한|개발행위허가제한|개발제한구역|도시관리계획 입안중/.test(n)) return '개발·정비';
  if (/^UQA[1-4]/.test(c)) return '용도지역';
  if (x.저촉 === '3') return '접함';
  if (/고도지구|최고높이|경관|역사문화|대공방어|비행안전|표면구역/.test(n)) return '높이·경관';
  return '그 밖';
}
/* 2026-10-22: 서버 토지이용레이어고르기 와 **같은 표** — 바꾸면 둘 다 바꾼다 */
function 경계됨(code) {
  const c = String(code || '');
  return !/^UQA0/.test(c) && ['UQA', 'UQQ', 'UQF', 'UQH', 'UQI', 'UQM', 'UQN', 'UQT', 'UOA', 'UDE'].some(p => c.startsWith(p));
}
function 토지이용칸(r) {
  const s = r.범위 || {}, 항목 = r.항목 || [], 해제 = r.해제 || [];
  const 필지 = Number(s.필지) || 0, 받은 = Number(s.받은) || 0;
  const 머리 = sect('토지이용계획', 'landuse', 항목.length ? ` ${fmt(항목.length)}` : '');
  if (!받은) return `${머리}<p class="note">${gapCell('', 'SCOPE',
    '이 단지 필지의 토지이용계획을 아직 받지 않았습니다')}</p>`;
  const 저촉말 = { '1': '포함', '2': '일부 걸침', '3': '접함' };
  const 줄 = x => `<li${경계됨(x.코드) ? ` data-lushape="${esc(x.코드)}|${esc(x.이름 || '')}" role="button" tabindex="0" title="누르면 지도에 이 구역 경계를 그립니다 · 다시 누르면 지웁니다"` : ''}><b>${esc(x.이름 || '')}</b><span class="muted"> ${esc(저촉말[x.저촉] || '')}${
      받은 > 1 && Number(x.필지) < 받은 ? ` · 필지 ${fmt(x.필지)}/${fmt(받은)}` : ''}${
      Number(x.지정) > Number(x.필지) ? ` · 지정 ${fmt(x.지정)}건` : ''}</span></li>`;
  const 묶음 = {};
  for (const x of 항목) (묶음[토지이용분류(x)] ||= []).push(x);
  const 펼침 = (k, cls = '') => 묶음[k] ? `<div class="lu-g${cls}"><div class="lt2">${k}</div><ul class="lu">${묶음[k].map(줄).join('')}</ul></div>` : '';
  const 접음 = k => 묶음[k] ? `<details class="lu-g"><summary>${k} ${fmt(묶음[k].length)}</summary><ul class="lu">${묶음[k].map(줄).join('')}</ul></details>` : '';
  const 최신 = 항목.map(x => x.갱신일 || '').sort().pop();
  return `${머리}
    ${묶음['거래'] ? `<div class="lu-hot" data-lushape="${esc(묶음['거래'][0].코드 || 'UQQ600')}|${esc(묶음['거래'][0].이름 || '')}" role="button" tabindex="0" title="누르면 지도에 허가구역 경계를 그립니다"><b>토지거래허가구역</b> 안에 있습니다
      <span class="muted">— 지정 ${fmt(묶음['거래'].reduce((t, x) => t + (Number(x.지정) || 0), 0))}건</span></div>` : ''}
    ${펼침('개발·정비')}${펼침('용도지역')}${접음('높이·경관')}${접음('그 밖')}${접음('접함')}
    ${해제.length ? `<p class="note sm">전에는 걸려 있다가 <b>빠진 것</b>: ${esc(해제.map(x => x.이름).join(', '))}</p>` : ''}
    ${받은 < 필지 ? `<p class="srcline">필지 ${fmt(필지)}곳 중 ${fmt(받은)}곳 ${gapCell('', 'SCOPE', '나머지 필지는 아직 안 받음')}</p>` : ''}`;
}

/* ---------------- 심평원 병원·약국 (2026-10-21 밤) ----------------
   주변 탭 '생활 편의' 밑에 그릇(.hirabox)을 두고 따로 받아 채운다.
   ★ 위 생활 편의의 병원 숫자(상가정보 · 사업자등록)와 **출처가 다르다** — 그래서 따로 적고 섞지 않는다.
   ★ 진료과목은 안 보인다: 신고 과목이 넓어서 '소아과 몇 곳' 으로 쓰면 틀린다(CONTEXT 11-168).
   ★ 아직 안 받았으면 그렇게 말한다. '없다' 와 '못 봤다' 를 가른다. */
const 병원캐시 = new Map();
async function 병원채우기() {
  const box = document.querySelector('#detail .hirabox');
  if (!box) return;
  const 키 = box.dataset.hira;
  let r = 병원캐시.get(키);
  if (!r) {
    try {
      const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/hira`);
      if (!x.ok) return;                         // 덤 — 못 받아도 상세는 그대로
      r = await x.json();
      if (Number((r.상태 || {}).적재)) 병원캐시.set(키, r);   // 아직 안 받은 상태는 담아 두지 않는다 — 들어오면 바로 보이게
    } catch { return; }
  }
  const 지금 = document.querySelector('#detail .hirabox');
  if (!지금 || 지금.dataset.hira !== 키) return;
  지금.innerHTML = 병원칸(r);
  고정표시();             // 늦게 그려진 칸에도 '고정됨' 표시를 입힌다
}
function 병원칸(r) {
  const st = r.상태 || {};
  const 머리 = `<div class="lt2">병원 규모 · 심평원 <span class="muted">(건강보험 요양기관 신고)</span></div>`;
  if (!Number(st.적재)) return `${머리}<p class="note sm">${gapCell('', 'SCOPE', '심평원 병원·약국 목록을 아직 받지 않았습니다 — 오늘 밤 받습니다')}</p>`;
  if (!Number(st.좌표)) return '';
  const 거리 = m => (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : fmt(m) + 'm');
  const 큰 = r.큰병원 || [], 종 = r.종별 || [];
  return `${머리}
    ${큰.length ? `<ul class="lu">${큰.map(h => `<li data-pt="hira|y:${esc(h.ykiho || '')}" title="누르면 지도에 고정 · 올리면 잠깐 보기"><b>${esc(h.이름 || '')}</b><span class="muted"> ${esc(h.종별 || '')} · ${거리(Number(h.m) || 0)}${
        h.의사 != null ? ` · 의사 ${fmt(h.의사)}명` : ''}</span></li>`).join('')}</ul>`
      : `<p class="note sm">5km 안에 상급종합·종합병원이 없습니다.</p>`}
    ${종.length ? `<div class="lifegrid">${종.map(x => `
      <div class="lcell${Number(x.r500) ? '' : ' far'}" data-pt="hira|${esc(x.cl_cd || '')}" data-pt-r="${Number(x.r500) ? 500 : 1000}"
           title="가장 가까운 곳 ${fmt(x.최단m)}m · 1km 안 의사 ${fmt(x.의사)}명">
        <b>${fmt(Number(x.r500) || Number(x.r1000))}</b>
        <span>${esc(x.종별 || '')}${Number(x.r500) ? '' : ' <i>1km</i>'}</span></div>`).join('')}</div>` : ''}
    ${과목칸(r)}
    ${(r.과목상태 || {}).기준일 ? `<p class="note sm">간판 과목 ${esc(날짜(r.과목상태.기준일))} 기준</p>` : ''}`;
}
/* 간판 과목 칸 (298) — 아이 키우는 집이 먼저 찾는 순서로 앞에 세우고, 나머지는 많은 순 */
const 과목순서 = ['소아청소년과', '내과', '이비인후과', '가정의학과', '치과', '한방', '정형외과', '피부과', '안과', '산부인과'];
function 과목칸(r) {
  const st = r.과목상태 || {};
  if (!Number(st.이어짐)) return `<div class="lt2">간판 과목</div><p class="note sm">${gapCell('', 'SCOPE', '요양기관 개설 현황(간판 과목)을 아직 받지 않았습니다 — 곧 받습니다')}</p>`;
  const 과 = (r.과목 || []).slice();
  if (!과.some(x => x.과목 === '소아청소년과')) 과.push({ 과목: '소아청소년과', r500: 0, r1000: 0, 최단m: null });   // 0 도 정보다 — 1km 안에 없다
  const 순 = x => { const i = 과목순서.indexOf(x.과목); return i < 0 ? 100 : i; };
  과.sort((a, b) => (순(a) - 순(b)) || (Number(b.r1000) - Number(a.r1000)));
  return `<div class="lt2">간판 과목 <span class="muted">(의원·병원 · 500m, 없으면 1km)</span></div>
    <div class="lifegrid">${과.slice(0, 12).map(x => {
      const n = Number(x.r500) || Number(x.r1000) || 0;
      return `<div class="lcell${Number(x.r500) ? '' : ' far'}"${n ? ` data-pt="hira|g:${esc(x.과목)}" data-pt-r="${Number(x.r500) ? 500 : 1000}"` : ''}
           title="${x.최단m != null ? '가장 가까운 곳 ' + fmt(x.최단m) + 'm' : '1km 안에 없습니다'}">
        <b>${fmt(n)}</b><span>${esc(x.과목)}${Number(x.r500) ? '' : (n ? ' <i>1km</i>' : ' <i>1km 안 없음</i>')}</span></div>`; }).join('')}</div>`;
}

/* 분양권·입주권 거래 (2026-10-21 밤) — 분양 칸 밑. 지번(PNU)으로 이었다(서버 주석).
   ★ '분양가와 차이' 는 **같은 전용면적(±0.05㎡)의 최고 분양가**와의 뺄셈일 뿐이다. 옵션·확장비·층은 모른다.
   ★ 입주권('입')은 조합원 권리라 분양가와 견줄 값이 아니다 — 차이를 안 적는다.
     원본 구분 칸이 빈 거래는 빈 채로 둔다(분양권이라고 단정하지 않는다). */
function 분양권칸(r) {
  const t = r.분양권 || [], n = r.분양권수 || {};
  if (!t.length) return '';
  const 형 = (r.공고 || []).flatMap(p => p.주택형 || []);
  const 최고 = a => { const v = 형.filter(m => m.전용m2 != null && Math.abs(Number(m.전용m2) - Number(a)) < 0.05 && m.최고원)
                                 .map(m => Number(m.최고원)); return v.length ? Math.max(...v) : null; };
  const 억 = v => { const a = Math.floor(v / 1e8), b = Math.round((v % 1e8) / 1e4);
    return a ? `${a}억${b ? ' ' + fmt(b) : ''}` : `${fmt(b)}만`; };
  const 날 = d => 날짜(d);
  /* 2026-10-22 사장님 "취소 빼지마" — 취소 거래도 줄로 보이고 '취소' 표시 · 해제일(원문). 분양가와 차이는 취소 줄엔 안 적는다 */
  return `<div class="lt2">분양권·입주권 거래 <b>${fmt((Number(n.건수) || 0) + (Number(n.취소) || 0) || t.length)}</b>건${Number(n.취소) ? ` <span class="muted">(그중 해제 ${fmt(n.취소)}건)</span>` : ''}</div>
    ${Number(n.공고전) ? `<p class="note sm">${fmt(n.공고전)}건은 첫 공고 전 입주권(조합원 권리)</p>` : ''}
    ${r.분양권말 ? `<p class="note sm">${r.분양권말}</p>` : ''}
    ${Number(n.필지로) ? `<p class="note sm" title="공고 자료 없이 이 단지 필지에서 맺은 계약으로 이음">공고 없이 이은 계약 ${fmt(n.필지로)}건</p>` : ''}
    <table class="mini"><thead><tr><th>계약</th><th class="n">전용</th><th class="n">층</th><th class="n">거래가</th><th>구분</th><th class="n">분양가와 차이</th></tr></thead><tbody>
    ${t.slice(0, 15).map(x => {
      const 기준 = x.구분 === '입' || Number(x.취소) ? null : 최고(x.전용);
      const 차 = 기준 != null && x.거래원 ? Number(x.거래원) - 기준 : null;
      /* 2026-10-22 사장님 "실거래 취소처럼 동일하게" — 실거래 탭(.trow.canc)과 같은 세 가지: 취소선 금액 · 연한 색 · '해제' 꼬리표(용어 풀이) */
      const 취 = Number(x.취소);
      return `<tr${취 ? ' class="canc"' : ''}><td>${날(x.계약일)}${취 ? ` <span class="tcx"${x.해제일 ? ` title="해제일 ${esc(x.해제일)} (원문)"` : ''}>${용어('해제')}</span>` : ''}</td><td class="n">${Number(x.전용).toFixed(2)}</td><td class="n">${x.층 ?? '—'}</td>
        <td class="n">${x.거래원 ? (취 ? `<s>${억(Number(x.거래원))}</s>` : 억(Number(x.거래원))) : '—'}</td><td>${x.구분 === '입' ? '입주권' : x.구분 === '분' ? '분양권' : '<span class="muted">빈칸</span>'}</td>
        <td class="n">${차 == null ? '—' : (차 >= 0 ? '+' : '−') + 억(Math.abs(차))}</td></tr>`; }).join('')}
    </tbody></table>
    ${t.length > 15 ? `<p class="note sm">최근 15건만 보입니다.</p>` : ''}`;
}

/* ================= 폰 바텀시트 (2026-10-22, 사장님 "너 생각대로 ㄱㄱ") =================
   ≤640px 지도 보기에서만 쓴다(넓은 화면은 CSS 가 아무것도 안 바꾼다 — 상태 값만 달린다).
     peek : 검색 전 — 지도가 화면 가득, 아래 손잡이와 목록 머리만
     half : 검색 결과 · 주변 항목을 눌렀을 때 — 지도와 같이 본다
     full : 단지 상세 — 지도를 가린다
   손잡이는 누르면 한 칸씩, 끌면 손 뗀 높이에서 가까운 칸으로 붙는다.
   ★ 폰의 '뒤로': 상세를 열 때 기록을 하나 쌓고(pushState), 뒤로 오면 상세를 닫는다. */
/* ★ const 가 아니라 function — boot() 가 파일 끝보다 먼저 불려도 쓸 수 있게(선언 전 접근 TDZ 를 피한다, 11-1xx 교훈) */
function 폰() { return matchMedia('(max-width:640px)').matches; }
function 상세쌓기() { return 폰() && !(history.state && history.state.상세); }
function 시트(상태) {
  const app = document.querySelector('.app');
  if (!app) return;
  /* 상세가 열려 있나 — 폰에서는 상세를 볼 때 검색 틀·동네 고르기를 접어 지도 띠를 넓힌다(CSS) */
  if (selected !== null || selectedKapt !== null) app.dataset.detail = '1'; else delete app.dataset.detail;
  if (app.dataset.sheet === 상태) return;
  app.dataset.sheet = 상태;
  if (상태 === 'half' && 폰()) setTimeout(시트지도맞춤, 260);   // 높이가 다 바뀐 뒤에 잰다(.22s)
}
/* 반쯤 내렸을 때 단지(와 찍힌 주변 점)가 검색 틀과 시트 사이 **보이는 띠** 안에 오게 */
function 시트지도맞춤() {
  try {
    if (!map) return;
    const b = L.latLngBounds([]);
    const 넣기 = l => {
      if (l.getLatLng) b.extend(l.getLatLng());
      else if (l.getBounds) { try { b.extend(l.getBounds()); } catch (e) {} }
      else if (l.eachLayer) l.eachLayer(넣기);
    };
    if (focusLayer) focusLayer.eachLayer(넣기);
    if (ptLayer) ptLayer.eachLayer(넣기);
    고정.forEach((g, k) => { if (k.startsWith(selected + '|')) 넣기(g); });   // 눌러 고정한 주변 점도 띠 안에
    if (!b.isValid()) return;
    const top = (document.querySelector('.ptop') || {}).offsetHeight || 0;
    const sh = (document.querySelector('#psheet') || {}).offsetHeight || 0;
    map.fitBounds(b, { paddingTopLeft: [24, top + 16], paddingBottomRight: [24, sh + 16], maxZoom: 17 });
  } catch (e) { /* 덤 */ }
}
function 시트달기() {
  const app = document.querySelector('.app');
  if (!app.dataset.sheet) app.dataset.sheet = 'peek';
  const top = document.querySelector('.ptop');
  if (top && 'ResizeObserver' in window)
    new ResizeObserver(() => app.style.setProperty('--ptop-h', top.offsetHeight + 'px')).observe(top);
  const ac = document.querySelector('.areactl');
  if (ac && 'ResizeObserver' in window)
    new ResizeObserver(() => app.style.setProperty('--ac-h', ac.offsetHeight + 'px')).observe(ac);

  /* 검색 결과가 그려지면(검색어가 있을 때만) 반쯤 올린다. 검색 전 지도 훑기로 목록이 바뀌는 건 그대로 둔다 */
  const list = $('#list');
  if (list) new MutationObserver(() => {
    if (app.dataset.sheet === 'peek' && $('#q') && $('#q').value.trim()) 시트('half');
  }).observe(list, { childList: true });

  /* 주변 항목을 누르면 반쯤 내려 지도에 찍힌 점을 보인다(폰에는 '마우스 올리기' 가 없다) */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-school], [data-kinder], [data-ccone], [data-poilist]')) return;
    const el = e.target.closest('#detail [data-pt]');
    if (!폰() || !el) return;
    if (app.dataset.sheet === 'full') 시트('half');
    /* 누른 줄이 시트 안에서 보이게 · 점은 받아 오는 데 시간이 걸리니 한 번 더 맞춘다 */
    setTimeout(() => { try { el.scrollIntoView({ block: 'nearest' }); } catch (x) {} }, 280);
    setTimeout(시트지도맞춤, 1000);
  });

  /* 뒤로 = 상세 닫기 */
  window.addEventListener('popstate', e => {
    if (e.state && e.state.상세) return;
    if (selected !== null || selectedKapt !== null) closeDetail();
  });

  /* 손잡이: 누르면 한 칸씩, 끌면 가까운 칸으로 */
  const grip = $('#sheetgrip'), sheet = $('#psheet');
  if (!grip || !sheet) return;
  const 다음 = { peek: 'half', half: (selected !== null || selectedKapt !== null) ? 'full' : 'full', full: 'half' };
  let y0 = null, h0 = 0, 움직임 = 0;
  grip.addEventListener('pointerdown', e => {
    if (!폰()) return;
    y0 = e.clientY; h0 = sheet.offsetHeight; 움직임 = 0;
    sheet.classList.add('dragging'); grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', e => {
    if (y0 === null) return;
    const dy = y0 - e.clientY; 움직임 = Math.max(움직임, Math.abs(dy));
    const 전체 = sheet.parentElement.offsetHeight || window.innerHeight;
    sheet.style.height = Math.max(48, Math.min(전체, h0 + dy)) + 'px';
  });
  const 놓기 = e => {
    if (y0 === null) return;
    sheet.classList.remove('dragging');
    const 전체 = sheet.parentElement.offsetHeight || window.innerHeight;
    const 비 = sheet.offsetHeight / 전체;
    sheet.style.height = '';
    y0 = null;
    if (움직임 < 6) { 시트(다음[app.dataset.sheet] || 'half'); return; }   // 끌지 않았으면 '누름'
    시트(비 < 0.25 ? 'peek' : 비 < 0.76 ? 'half' : 'full');
  };
  grip.addEventListener('pointerup', 놓기);
  grip.addEventListener('pointercancel', 놓기);
}

/* ---------------- 지도의 '분양' 핀 (2026-10-22, 사장님 "1,2,3 ㄱㄱ") ----------------
   단지에 아직 안 이어진 청약홈 공고를 **공고 지번 자리**에 핀으로. 같은 주택(관리번호)의 공고는 한 핀으로 묶는다.
   ★ 자리를 못 찾은 공고(지번 없음 · 공공주택지구 블록)는 핀이 없다 — 동 가운데에 찍으면 틀린 자리라서. */
const 공고종류말 = { APT: 'APT', URBTY: '오피스텔·도시형', REMNDR: '무순위·재공급', PBLPVT: '공공지원민간임대', OPT: '임의공급' };
const 공고종류짧게 = { APT: '분양', URBTY: '오피스텔', REMNDR: '무순위', PBLPVT: '임대', OPT: '임의공급' };
async function 분양핀불러오기() {
  if (!분양핀층) return;
  if (!분양핀켜짐 || map.getZoom() < LAWD_ZOOM) { 분양핀층.clearLayers(); return; }
  const 차례 = ++분양핀차례;
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  let r;
  try { r = await fetch(`/api/applyhome/pins?bbox=${bbox}`).then(x => x.json()); } catch (e) { return; }   // 보조 축 — 실패해도 지도는 그대로
  if (차례 !== 분양핀차례 || r.error) return;
  분양핀층.clearLayers();
  /* ★ 2026-10-23 사장님 "너무 겹쳐 보여" — 같은 주택(관리번호) 묶음에 더해, **같은 자리(같은 공고 지번 필지)** 의 공고도 한 핀으로.
     장위 푸르지오 마크원처럼 일반공급 · 무순위 · 임의공급이 관리번호가 따로라 핀이 겹겹이 떴다. 묶는 근거는 지번(필지 중심점)이지 이름이 아니다. */
  const 자리 = new Map();
  for (const p of (r.핀 || [])) {
    const k = p.pnu || `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;
    const g = 자리.get(k) || { lat: p.lat, lng: p.lng, 집: new Map(), 종류: new Set(), n: 0, 입주: null, 이름: null };
    if (!g.집.has(p.house_manage_no)) g.집.set(p.house_manage_no, { 이름: p.house_nm, 공고일: p.rcrit_pblanc_de });
    g.종류.add(p.공고종류); g.n++;
    g.이름 = p.house_nm;                                    // 핀은 공고일 최근 순 — 마지막에 남는 이름이 첫 공고
    if (p.mvn_prearnge_ym && (!g.입주 || p.mvn_prearnge_ym > g.입주)) g.입주 = p.mvn_prearnge_ym;
    자리.set(k, g);
  }
  const 지금월 = new Date().toISOString().slice(0, 7).replace('-', '');
  for (const g of 자리.values()) {
    const 입주 = g.입주 ? 날짜(g.입주) : null;
    const 앞 = g.입주 && g.입주 >= 지금월;
    const 꼬리 = [...g.종류].map(k => 공고종류짧게[k] || k).join('·');
    const mk = L.marker([g.lat, g.lng], {
      icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ahmark${앞 ? ' soon' : ''}"><b>${esc(꼬리)}</b><span>${esc(shortNm(g.이름) || '')}</span>${
               g.n > 1 ? `<em>공고 ${fmt(g.n)}</em>` : ''}${입주 ? `<i>${앞 ? '입주예정' : '입주'} ${esc(입주)}</i>` : ''}</div>` }),
      zIndexOffset: 300, riseOnHover: true,
      title: `${g.이름} · 청약홈 공고 ${g.n}건 · 단지에 아직 안 이어짐`,
    });
    mk.on('click', () => 분양핀열기([...g.집.keys()][0], [g.lat, g.lng]));   // 서버가 같은 지번 공고를 다 준다
    mk.addTo(분양핀층);
  }
}
/* 10-30 청약 공고 → 그 공고가 속한 가단지(389) — 있으면 일반 단지처럼 상세를 연다(공고만 있는 사업도 단지 상세 그대로) */
const 공고가단지 = new Map();
async function 가단지찾기(house) {
  if (공고가단지.has(house)) return 공고가단지.get(house);
  let id = null;
  try { const r = await fetch(`/api/precomplex-ah/${encodeURIComponent(house)}`).then(x => x.json()); id = r && r.complex_id ? Number(r.complex_id) : null; } catch (e) { /* 못 물어봄 — 옛 길(공고 칸) */ }
  공고가단지.set(house, id); return id;
}
async function 분양핀열기(house, ll) {
  { const g = await 가단지찾기(house); if (g) { map.closePopup(); return select(g, false); } }
  const pop = L.popup({ maxWidth: 360, minWidth: 260, className: 'ahpop', autoPanPadding: [20, 60] })
    .setLatLng(ll).setContent('<p class="muted">불러오는 중…</p>').openOn(map);
  try {
    const r = await fetch(`/api/applyhome?house=${encodeURIComponent(house)}`).then(x => x.json());   // 같은 공고 지번의 안 이어진 공고까지
    if (r.error) throw new Error(r.error);
    pop.setContent(`<div class="ahpopin">${분양칸(r.공고 || [])}${(r.공고 || []).length ? 분양권칸(r) : ''}</div>`);
  } catch (e) { pop.setContent(`<p class="note">공고를 불러오지 못했습니다 — ${esc(e.message || String(e))}</p>`); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('#ahpins');
  if (!b) return;
  분양핀켜짐 = !분양핀켜짐;
  b.setAttribute('aria-pressed', String(분양핀켜짐));
  분양핀불러오기();
});

/* ---------------- 용도 표 (2026-10-22 13:21, 사장님 "대장법상 기준으로" ㄱㄱ) ----------------
   ★ 고르지 않는다. 법(별표1 · 대장 작성방법)은 용도를 **동마다** 적고 단지 전체 종류는 정하지 않는다.
     → 총괄표제부 주용도(있으면) / 주건축물 표제부 주용도(동마다 다르면 다 적음) · 기타용도 원문 · 전유부 호별 세부 용도(센 그대로). */
const 용도캐시 = new Map();
async function 용도채우기(cid) {
  const 키 = String(cid);
  let r = 용도캐시.get(키);
  if (!r) {
    try { r = await fetch(`/api/complexes/${encodeURIComponent(키)}/usage`).then(x => x.json()); } catch { return; }
    if (!r || r.error) return;
    용도캐시.set(키, r);
  }
  const box = document.querySelector(`#detail .usebox[data-use="${키}"]`);
  if (!box) return;
  const 표 = r.표제부 || [], 총 = r.총괄, 전 = r.전유 || [];
  const 주들 = [...new Set(표.map(x => x.주용도).filter(Boolean))];
  const 주 = (총 && 총.주용도) || 주들[0] || null;
  const 주출처 = 총 && 총.주용도 ? '총괄표제부 주용도(주된 건축물의 주용도)' : '표제부 주용도';
  const 기타 = (총 && 총.기타용도) || (표[0] && 표[0].기타용도) || null;
  const 동합 = 표.reduce((t, x) => t + (Number(x.동) || 0), 0);
  const 다른동 = !(총 && 총.주용도) && 주들.length > 1 ? 주들.slice(1) : [];
  const 풀이 = `건축물대장 원문입니다 — ${주출처}${기타 ? ` · 기타용도 '${기타}'` : ''}.
용도는 법(건축법 시행령 별표1)대로 동마다 적힌 것이고, 우리가 고르거나 바꾼 말이 없습니다.${
    표.length > 1 ? `\n주건축물 ${동합}동: ` + 표.map(x => `${x.주용도 || '빈칸'}${x.기타용도 ? `(${x.기타용도})` : ''} ${x.동}동`).join(' · ') : ''}`;
  box.innerHTML = (주 ? `<span class="pill use" title="${esc(풀이)}">${esc(주)}</span>` : '<span class="pill">용도 원문 없음</span>')
    + (기타 && 기타 !== 주 ? ` <span class="usetxt" title="${esc(풀이)}">${esc(기타.length > 40 ? 기타.slice(0, 40) + '…' : 기타)}</span>` : '')
    + (다른동.length ? ` <span class="usetxt muted">· 다른 동 ${esc(다른동.join(', '))}</span>` : '')
    + '';
  /* 2026-10-24 22:05 사장님 "단지 상세에서 쓸데없는 말을 빼고 싶다 — 확인하고 싶으면 정책" : 전유부 호별 용도 줄 · '여러 동 · 총괄표제부' 칩을 뺐다 */
  const comp = null;
  if (comp && 전.length) {
    const 합 = 전.reduce((t, x) => t + (Number(x.호) || 0), 0);
    comp.innerHTML = `전유부 호별 용도(원문, 센 것): ${전.slice(0, 5).map(x => `${esc(x.세부용도 || '빈칸')} ${fmt(x.호)}`).join(' · ')}${
      전.length > 5 ? ` · 그 밖 ${fmt(전.slice(5).reduce((t, x) => t + (Number(x.호) || 0), 0))}` : ''} <span class="muted">/ ${fmt(합)}호</span>`;
    comp.hidden = false;
  }
}

/* ---------------- 약국 인허가 · 행정안전부 (2026-10-22, 307) ----------------
   심평원 칸(.hirabox) 밑에 따로(.phbox). ★ 출처가 다르다 — 숫자를 섞지 않는다.
   ★ 폐업은 원문 좌표가 비어 있는 것이 많아 '좌표 있는 것만' 이라고 비율과 함께 적는다. */
const 약국캐시 = new Map();
async function 약국채우기() {
  const box = document.querySelector('#detail .phbox');
  if (!box) return;
  const 키 = box.dataset.ph;
  let r = 약국캐시.get(키);
  if (!r) {
    try {
      const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/pharmacy`);
      if (!x.ok) return;                         // 덤 — 못 받아도 상세는 그대로
      r = await x.json();
      if (Number((r.범위 || {}).적재)) 약국캐시.set(키, r);
    } catch { return; }
  }
  const 지금 = document.querySelector('#detail .phbox');
  if (!지금 || 지금.dataset.ph !== 키) return;
  지금.innerHTML = 약국칸(r);
}
function 약국칸(r) {
  const 범 = r.범위 || {}, 셈 = r.셈 || {}, 영 = r.영업 || [], 폐 = r.폐업 || [];
  const 머리 = `<div class="lt2">약국 · 행정안전부 인허가 <span class="muted">(지방행정 인허가 · 영업/폐업)</span></div>`;
  if (!Number(범.적재)) return `${머리}<p class="note sm">${gapCell('', 'SCOPE', '행안부 약국 인허가를 아직 받지 않았습니다')}</p>`;
  if (!Number(범.좌표)) return '';
  const 날 = v => 날짜(v, '');
  const 폐비 = Number(범.폐업전체) ? Math.round(100 * Number(범.폐업좌표) / Number(범.폐업전체)) : null;
  return `${머리}
    <div class="lifegrid">
      <div class="lcell"><b>${fmt(Number(셈.영업) || 0)}</b><span>영업 중 <i>500m</i></span></div>
      <div class="lcell" title="최근 5년 안에 인허가를 받은 곳(지금 영업 중)"><b>${fmt(Number(셈.개업5년) || 0)}</b><span>그중 5년 안 개업</span></div>
      <div class="lcell far" title="좌표가 있는 폐업 기록만 셉니다"><b>${fmt(Number(셈.폐업) || 0)}</b><span>폐업 기록 <i>좌표 있는 것만</i></span></div>
      <div class="lcell far" title="좌표가 있는 폐업 기록만 셉니다"><b>${fmt(Number(셈.폐업5년) || 0)}</b><span>그중 5년 안 폐업</span></div>
    </div>
    ${영.length ? `<ul class="lu">${영.map(x => `<li><b>${esc(x.이름 || '')}</b><span class="muted"> ${fmt(Number(x.m) || 0)}m${
        x.인허가일 ? ` · ${날(x.인허가일)} 인허가` : ''}</span></li>`).join('')}</ul>`
      : `<p class="note sm">${gapCell('', 'NA', '500m 안에 영업 중인 약국 기록이 없습니다')}</p>`}
    ${폐.length ? `<div class="lt2">최근 폐업 <span class="muted">(500m · 좌표 있는 것만)</span></div>
      <ul class="lu">${폐.map(x => `<li><s>${esc(x.이름 || '')}</s><span class="muted"> ${fmt(Number(x.m) || 0)}m${
        x.폐업일 ? ` · ${날(x.폐업일)} ${esc(x.상세상태 || '폐업')}` : ` · ${esc(x.상세상태 || '폐업')} (폐업일 원문에 없음)`}${
        x.인허가일 ? ` · ${날(x.인허가일)} 인허가` : ''}</span></li>`).join('')}</ul>` : ''}
    <p class="note sm">좌표 없어 못 센 곳: 영업 ${fmt(Number(범.영업좌표없음) || 0)}/${fmt(Number(범.영업전체) || 0)} · 폐업은 ${폐비 != null ? `${폐비}%만` : '일부만'} 좌표 있음${범.받은날 ? ` · ${esc(날(범.받은날))} 받음` : ''}</p>`;
}

/* ---------------- 어린이집 (2026-10-22, 사장님 "어린이집 운영 승인 됐엉") ----------------
   교육 탭 맨 위 그릇(.ccbox). 유치원과 같은 500m · 가까운 순 10곳. 인원은 원문 '기준일' 값. */
const 어린이집캐시 = new Map();
async function 어린이집채우기() {
  const box = document.querySelector('#detail .ccbox');
  if (!box) return;
  const 키 = box.dataset.cc;
  let r = 어린이집캐시.get(키);
  if (!r) {
    try {
      const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/childcare`);
      if (!x.ok) return;
      r = await x.json(); 어린이집캐시.set(키, r);
    } catch { return; }
  }
  const 지금 = document.querySelector('#detail .ccbox');
  if (!지금 || 지금.dataset.cc !== 키) return;
  const 곳 = r.곳 || [], 유 = r.유형 || [], 범 = r.범위 || {};
  const 전체 = 유.reduce((t, x) => t + (Number(x.n) || 0), 0);
  if (!Number(범.이시군구)) {
    지금.innerHTML = `${sect('어린이집', 'childcare')}<p class="note">${gapCell('', 'SCOPE',
      `이 시군구의 어린이집을 아직 받지 않았습니다 (지금은 ${범위말로()}) — 없는 게 아니라 안 받은 것입니다`)}</p>`;
    return;
  }
  const 기준 = 곳.map(x => x.기준일).filter(Boolean).sort().pop();
  지금.innerHTML = `${sect('어린이집', 'childcare', 전체 ? ` ${fmt(전체)}` : '')}
    ${곳.length ? `
      <p class="sm">${유.map(x => `<span class="lt2" data-pt="childcare|${esc(x.유형 || '')}" data-pt-r="500">${esc(x.유형 || '—')} <b>${fmt(x.n)}</b></span>`).join(' · ')}</p>
      <div class="schrow">${곳.map(x => `
        <div class="scell" data-pt="childcarenm|${esc(x.이름 || '')}" data-pt-r="500">
          <span class="sg">${esc(x.유형 || '—')}</span>
          <b>${esc(x.이름 || '—')}</b>
          ${x.stcode ? `<button type="button" class="sdet" data-ccone="${esc(x.stcode)}" title="어린이집 상세">자세히 ›</button>` : ''}
          <span class="sd">${fmt(x.m)}m${x.정원 != null ? ` · 정원 ${fmt(x.정원)}` : ''}${x.현원 != null ? ` · 현원 ${fmt(x.현원)}` : ''}</span>
          <span class="sn">${[x.반수 != null ? `${fmt(x.반수)}반` : null, x.통학차량 === '운영' ? '통학차량' : null,
            x.상태 && x.상태 !== '정상' ? `<b>${esc(x.상태)}</b>` : null,
            x.제공서비스 && x.제공서비스 !== '일반' ? esc(x.제공서비스) : null].filter(Boolean).join(' · ')}</span>
        </div>`).join('')}</div>
      <p class="note sm">500m 안 <b>${fmt(전체)}곳</b> 중 가까운 순 ${fmt(곳.length)}곳${기준 ? ` · 기준일 ${esc(날짜(기준))}` : ''}</p>`
      : `<p class="note">${gapCell('', Number(범.좌표) ? 'NA' : 'SCOPE',
          Number(범.좌표) ? '이 단지 500m 안에 어린이집이 없습니다' : '단지 좌표가 없어 주변을 잴 수 없습니다')}</p>`}`;
}

/* ---------------- 폐쇄·말소 건축물대장 (2026-10-22, 사장님 "폐쇄된 것들도 단지화" · "장위동,수색동 먼저") ----------------
   ★ 현재 단지와 섞지 않는다 — 토지 탭의 따로 칸 · 지도의 따로 점(기본 끔).
   ★ '폐쇄' 는 '철거' 가 아니다(대장을 새로 만들며 닫은 것도 있다 — 장위동 우방아파트는 '일부폐쇄' 인데 지금도 있다).
     그래서 구분은 원문(말소 · 폐쇄 · 일부말소 · 일부폐쇄) 그대로 적는다.
   ★ 묶음 = 같은 대지(PNU) + 같은 말소일. 세대수는 총괄표제부 원문만(동별 합을 만들지 않는다). */
const 폐쇄캐시 = new Map();
const 날8 = v => (v && /^\d{8}$/.test(v) ? 날짜(v) : null);
function 폐쇄묶음줄(s, 동들, 열기 = false) {
  const 이름 = s.이름 || s.plat_plc || s.pnu;
  const 꼬리 = [s.주용도, s.동수 ? `${fmt(s.동수)}동` : null, s.총괄세대 != null ? `총괄표제부 ${fmt(s.총괄세대)}세대` : null,
              날8(s.사용승인일) ? `사용승인 ${날8(s.사용승인일)}` : null].filter(Boolean).join(' · ');
  const 동줄 = (동들 || []).map(t => `<li><b>${esc(t.dong_nm || t.bld_nm || t.main_atch_gb_nm || '동')}</b>
      <span class="muted">${esc([t.main_purps_nm, t.strct_nm, t.grnd_flr_cnt != null ? `지상 ${t.grnd_flr_cnt}층` : null,
        t.ugrnd_flr_cnt != null ? `지하 ${t.ugrnd_flr_cnt}층` : null, t.hhld_cnt != null ? `${fmt(t.hhld_cnt)}세대` : null,
        t.fmly_cnt != null ? `${fmt(t.fmly_cnt)}가구` : null, t.tot_area != null ? `연면적 ${fmt(Math.round(t.tot_area * 100) / 100)}㎡` : null,
        날8(t.use_apr_day) ? `사용승인 ${날8(t.use_apr_day)}` : null, t.shter_gb_nm].filter(Boolean).join(' · '))}</span></li>`).join('');
  return `<details class="clsite" data-clpnu="${esc(s.pnu || '')}"${열기 ? ' open' : ''}><summary><span class="clgb">${esc(s.폐쇄구분 || '구분 없음')}</span>
      <b>${esc(이름)}</b> <span class="muted">${esc(날8(s.shter_day) ? `${날8(s.shter_day)} ${s.폐쇄구분 || ''}` : '말소일 원문에 없음')}</span>
      ${꼬리 ? `<div class="muted sm">${esc(꼬리)}</div>` : ''}</summary>
      ${s.이름 && s.plat_plc ? `<p class="sm muted">${esc(s.plat_plc)}${s.new_plat_plc ? ` · ${esc(s.new_plat_plc)}` : ''}</p>` : ''}
      ${동줄 ? `<ul class="lu">${동줄}</ul>` : '<p class="sm muted">이 묶음에는 총괄표제부만 있습니다(동별 표제부 없음).</p>'}
      ${s.lat != null ? '' : '<p class="sm muted">그 필지가 지금은 없어(합필·분필) 지도에 자리를 찍지 않습니다.</p>'}
    </details>`;
}
async function 폐쇄받기(키) {
  let r = 폐쇄캐시.get(키);
  if (r) return r;
  try {
    const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/closed`);
    if (!x.ok) return null;                               // 덤 — 못 받아도 상세는 그대로
    r = await x.json(); 폐쇄캐시.set(키, r); return r;
  } catch { return null; }
}
/* 2026-10-22 사장님 "검색할 때 아무 표시가 없으니 그냥 라이브 건축물 같아" — 머리에 표를 단다.
   ★ 이 단지는 **지금 대장이 있는** 단지다. 표는 '같은 필지에 닫힌 대장도 있다' 는 뜻 — 문구로 가른다. */
async function 폐쇄머리표() {
  const el = document.querySelector('#detail [data-clpill]');
  if (!el) return;
  const 키 = el.dataset.clpill;
  if (닫힌자리단지 !== 키) 닫힌자리지우기();        // 다른 단지의 ✕ 가 남지 않게
  const r = await 폐쇄받기(키);
  const 지금 = document.querySelector('#detail [data-clpill]');
  if (!r || !지금 || 지금.dataset.clpill !== 키) return;
  const 묶 = r.묶음 || [];
  /* 13:11 사장님 "폐쇄됐다가 지금 라이브인 건 지도에 표시 안 하고, 히스토리로 토지·허가 탭에만 글자" — 지도 표·머리 표를 안 쓴다 */
  return;
  const 최근 = 묶.find(s => s.shter_day) || 묶[0];
  지금.textContent = `옛 대장 ${fmt(묶.length)}`;
  지금.title = `이 단지는 지금 대장이 있는 현재 건물입니다.
같은 필지에 예전 건물(또는 예전 서류)의 닫힌 대장이 ${묶.length}묶음 있습니다(최근: ${최근.폐쇄구분 || ''} ${날8(최근.shter_day) || ''}).
누르면 토지 탭의 옛 대장 칸으로 갑니다.`;
  지금.hidden = false;
}
document.addEventListener('click', e => {
  const el = e.target.closest('#detail [data-clpill]');
  if (!el) return;
  detailTab = 'land'; renderDetail(lastDetail);
  setTimeout(() => { const b = document.querySelector('#detail .clbox'); if (b) b.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 400);
});
/* ---------------- 건축인허가 부가 원문 (2026-10-30 사장님 "ㄱㄱ+") ----------------
   /api/complexes/:id/permitx — 받아만 두고 안 쓰던 건축HUB 건축인허가 원문(386).
   ★ 허가 줄마다: 평형(전유 · 공용 · 호수) · 층별 용도 · 계획 주차 · 대수선 내용 · 가설건축물. 전부 **허가(설계 · 신고) 기준**이라고 적는다.
     사용승인이 난 허가는 접어 두고 "지금 값은 대장 칸" 이라고 적는다(대장이 먼저).
   ★ 철거멸실은 원문에 허가 번호가 비어 있어 **이 단지 필지(지번)** 로만 잇는다 — 칸 아래 한 묶음.
   ★ 못 받으면 아무것도 안 그린다(덤). */
const 허가덧캐시 = new Map();
async function 허가덧받기(키) {
  if (허가덧캐시.has(키)) return 허가덧캐시.get(키);
  try {
    const x = await fetch(`/api/complexes/${encodeURIComponent(키)}/permitx`);
    if (!x.ok) return null;
    const r = await x.json(); 허가덧캐시.set(키, r); return r;
  } catch { return null; }
}
const 허가면 = v => (v == null || v === '' ? '—' : `${fmt(Math.round(Number(v) * 100) / 100)}㎡`);
function 층말(f) {
  const 구 = f.층구분 || '';
  const a = f.최저층, b = f.최고층;
  if (a == null && b == null) return 구 || '층 원문 없음';
  if (구 === '옥탑') return a === b || b == null ? `옥탑 ${a}층` : `옥탑 ${a}~${b}층`;
  return a === b || b == null ? `${구} ${a}층` : `${구} ${a}~${b}층`;
}
function 허가덧줄(pk, d, 끝남) {
  const 평 = d.평형.filter(x => x.pk === pk), 층 = d.층.filter(x => x.pk === pk), 주 = d.주차.filter(x => x.pk === pk);
  const 대 = d.대수선.filter(x => x.pk === pk), 가 = d.가설.filter(x => x.pk === pk);
  const 묶 = [];
  if (대.length) {
    묶.push(`<div class="pxl"><b>대수선 내용</b> ${대.map(x => esc([x.구분, x.변경].filter(Boolean).join(' ') || '구분 원문 없음')).join('<em>·</em>')}</div>`);
  }
  if (가.length) {
    묶.push(`<div class="pxl"><b>가설건축물</b> ${가.map(x => esc([x.용도 === '가설건축물' ? '' : x.용도, x.구조, x.지상층 ? `지상 ${x.지상층}층` : '', x.연면적 ? `연면적 ${fmt(Math.round(x.연면적))}㎡` : '',
      x.존치만료 ? `존치 기한 ${날짜(x.존치만료, null) || x.존치만료}` : ''].filter(Boolean).join(' · ') || '원문 칸 비어 있음')).join('<em>·</em>')}</div>`);
  }
  const 설계 = [];
  if (평.length) {
    const 종 = Number(평[0].종류수) || 평.length;
    const 호합 = 평.reduce((t, x) => t + (Number(x.호수) || 0), 0);
    설계.push(`<table class="pdtab"><thead><tr><th>평형(원문)</th><th class="n">호수</th><th class="n">전유</th><th class="n">공용</th><th>용도</th></tr></thead><tbody>
      ${평.map(x => `<tr><td>${esc(x.평형)}</td><td class="n">${x.호수 ? fmt(x.호수) : '—'}</td><td class="n">${허가면(x.전유)}</td><td class="n">${허가면(x.공용)}</td>
        <td class="muted">${esc(x.용도 || '—')}${x.기타용도 && x.기타용도 !== x.용도 ? ` · ${esc(x.기타용도)}` : ''}</td></tr>`).join('')}
      </tbody></table>${종 > 평.length ? `<p class="note sm">${fmt(종)}종 중 호수 많은 ${fmt(평.length)}종만 보여 줍니다.</p>` : ''}`);
    설계.unshift(`<div class="pxl"><b>평형</b> ${fmt(종)}종${호합 ? ` · 호 ${fmt(호합)}개` : ''}</div>`);
  }
  if (층.length) {
    설계.push(`<div class="pxl"><b>층별 용도</b> ${층.map(f => `${esc(층말(f))} ${esc(f.용도 || '용도 원문 없음')}`).join('<em>·</em>')}</div>`);
  }
  if (주.length) {
    const z = 주.reduce((t, x) => { for (const k of ['옥내자주', '옥외자주', '옥내기계', '옥외기계', '인근자주', '인근기계', '면제']) t[k] = (t[k] || 0) + (Number(x[k]) || 0); return t; }, {});
    const 말 = [['옥내 자주식', z.옥내자주], ['옥외 자주식', z.옥외자주], ['옥내 기계식', z.옥내기계], ['옥외 기계식', z.옥외기계],
               ['인근 자주식', z.인근자주], ['인근 기계식', z.인근기계], ['면제', z.면제]].filter(([, v]) => v > 0);
    const 합 = z.옥내자주 + z.옥외자주 + z.옥내기계 + z.옥외기계 + z.인근자주 + z.인근기계;
    설계.push(`<div class="pxl"><b>계획 주차</b> ${말.length ? `${fmt(합)}대 — ${말.map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}` : '원문에 대수 0'}</div>`);
  }
  if (설계.length) {
    const 머리 = [평.length ? `평형 ${fmt(Number(평[0].종류수) || 평.length)}종` : '', 층.length ? '층별 용도' : '', 주.length ? '계획 주차' : ''].filter(Boolean).join(' · ');
    묶.push(`<details class="pdong"><summary>허가 설계 — ${머리}</summary>
      <div class="pdlist">
        <p class="note sm">허가(설계) 기준 원문입니다. 설계변경 · 사용승인 뒤 값과 다를 수 있습니다.${끝남 ? ' 이 허가는 사용승인이 났습니다 — 지금 값은 제원 · 평형(건축물대장) 칸이 기준입니다.' : ''}</p>
        ${설계.join('')}
      </div></details>`);
  }
  return 묶.join('');
}
function 철거블록(rows) {
  if (!rows || !rows.length) return '';
  const 석 = x => {
    const 있 = [['천장재', x.석면_천장재], ['단열재', x.석면_단열재], ['지붕재', x.석면_지붕재], ['보온재', x.석면_보온재], ['바닥재', x.석면_바닥재], ['기타', x.석면_기타]]
      .filter(([, v]) => /^(1|Y|y|유|있음)$/.test(String(v || '').trim())).map(([k]) => k);
    return 있.length ? `석면 함유 신고: ${있.join(' · ')}` : '';
  };
  return `<details class="pdong pxdemo-in"><summary>이 필지의 철거 · 멸실 신고 ${fmt(rows.length)}건</summary>
    <div class="pdlist">${rows.map(x => {
      const 날 = [x.시작일 ? `시작 ${날짜(x.시작일, null) || x.시작일}` : '', x.종료일 ? `종료 ${날짜(x.종료일, null) || x.종료일}` : '',
                  x.멸실일 ? `멸실 ${날짜(x.멸실일, null) || x.멸실일}` : ''].filter(Boolean).join(' → ');
      const 덧 = [x.용도, x.구조, x.건축물수 ? `건물 ${fmt(x.건축물수)}개` : '', x.연면적 ? `연면적 ${fmt(Math.round(x.연면적))}㎡` : '',
                  x.세대 ? `${fmt(x.세대)}세대` : '', x.가구 ? `${fmt(x.가구)}가구` : '', x.호 ? `${fmt(x.호)}호` : '', 석(x)].filter(Boolean).join(' · ');
      return `<div class="pdrow"><b>${esc(x.구분 || '구분 원문 없음')}</b><span>${esc(날 || '날짜 원문 없음')}</span>
        <span>${esc(x.건물명 || x.대지위치 || '')}</span>${덧 ? `<span class="muted">${esc(덧)}</span>` : ''}</div>`;
    }).join('')}
    <p class="note sm">건축HUB 건축인허가 철거멸실관리대장 원문 · 허가 번호가 비어 있어 이 단지 필지(지번)로만 잇습니다.</p></div></details>`;
}
async function 허가덧채우기() {
  const box = document.querySelector('#detail .pxdemo');
  if (!box) return;
  const 키 = box.dataset.pxid;
  if (!키) return;
  const d = await 허가덧받기(키);
  const 지금 = document.querySelector('#detail .pxdemo');
  if (!d || !지금 || 지금.dataset.pxid !== 키) return;
  for (const el of document.querySelectorAll('#detail .pxtra[data-pxpk]')) el.innerHTML = 허가덧줄(el.dataset.pxpk, d, el.dataset.pxapr === '1');
  지금.innerHTML = 철거블록(d.철거);
}
/* ---------------- 이 땅의 역사 (2026-10-23 사장님 "2번은 좋은거같아") ----------------
   ★ 새로 잇지 않는다 — 이미 이어 둔 것(옛 대장 · 옛 거래 · 정비구역 · 인허가 · 청약 · 분양권 · 지금 대장 · 실거래)을 **시간순 목차**로.
   ★ 사장님 원칙(18:11) "중복 데이터 없고 · 연계된 데이터를 보기 좋게 · 틀린 데이터 없고" — 숫자(건수 · 세대 · 면적)는 **다시 적지 않는다**.
     줄마다 날짜 · 무슨 일 · 어디에 있는지만 적고, 누르면 그 값이 있는 칸으로 간다(옛 대장 줄은 지도에 그 자리도 그린다).
   ★ 날짜는 원문 그대로. 날짜가 없는 일은 끝에. 이 단지 '앞의 일' 이 하나도 없으면 칸을 안 보인다. */
async function 역사채우기() {
  const box = document.querySelector('#detail .hsbox');
  if (!box) return;
  const 키 = box.dataset.hs;
  let d;
  try { d = await fetch(`/api/complexes/${encodeURIComponent(키)}/history`).then(r => r.ok ? r.json() : null); } catch (e) { d = null; }
  const 지금 = document.querySelector('#detail .hsbox');
  if (!d || !지금 || 지금.dataset.hs !== 키) return;
  const 숫 = v => String(v || '').replace(/[^0-9]/g, '');
  const 날 = v => { const t = 숫(v); return t.length >= 6 || t.length === 4 ? 날짜(t) : ''; };   /* 토지특성은 기준연도(yyyy)만 있다 */
  const ev = [];
  /* 간다 = [탭, 그 칸 제목] · 폐쇄 = 지도에 그릴 옛 대장 키 */
  const 넣 = (날짜, 무엇, 간다, 출처, 폐쇄) => ev.push({ d: 숫(날짜).slice(0, 8), 무엇, 간다, 출처, 폐쇄 });
  const 옛칸 = ['land', '이 필지의 옛 대장'];
  for (const s of ((d.옛대장 && d.옛대장.줄) || [])) {
    const 이름 = s.이름 || s.주용도 || '이름 없는 건물';
    if (s.사용승인일) 넣(s.사용승인일, `옛 건물 사용승인 — ${이름}`, 옛칸, '폐쇄·말소 대장', s.site_key);
    if (Number(s.매매 || 0) + Number(s.전월세 || 0)) 넣(s.처음, `옛 건물 실거래 시작 — ${이름}`, 옛칸, '국토부 실거래', s.site_key);
    if (s.shter_day) 넣(s.shter_day, `옛 대장 ${s.폐쇄구분 || '폐쇄'} — ${이름}`, 옛칸, '폐쇄·말소 대장', s.site_key);
  }
  for (const z of (d.정비 || [])) {
    if (z.지정일) 넣(z.지정일, `정비구역 지정 — ${z.zone_nm || z.사업명 || ''}`, ['land', '정비사업 구역'], '서울 정비사업');
    if (z.추진일) 넣(z.추진일, `${z.추진단계 || z.propel_nm || '추진 단계'} — ${z.zone_nm || ''}`, ['land', '정비사업 구역'], '서울 정비사업');
  }
  /* 구분 · 용도가 둘 다 빈 인허가는 첫 허가일 한 줄로만(같은 말 '인허가' 줄이 일곱 번 이어지면 목차가 아니다) */
  const 빈 = (d.인허가 || []).filter(a => !a.arch_gb_nm && !a.main_purps_nm).map(a => 숫(a.arch_pms_day)).filter(Boolean).sort();
  if (빈.length) 넣(빈[0], '건축 허가 — 구분 원문 없음(첫 허가)', ['info', '건축인허가'], '건축인허가');
  for (const a of (d.인허가 || []).filter(a => a.arch_gb_nm || a.main_purps_nm)) {
    const 무엇 = a.arch_gb_nm || a.main_purps_nm;
    if (a.arch_pms_day) 넣(a.arch_pms_day, `건축 허가 — ${무엇}`, ['info', '건축인허가'], '건축인허가');
    if (a.real_stcns_day) 넣(a.real_stcns_day, `착공 — ${무엇}`, ['info', '건축인허가'], '건축인허가');
  }
  for (const p of (d.청약 || [])) 넣(p.rcrit_pblanc_de, `청약 공고 — ${p.house_nm || ''}`, ['sale', '분양'], '청약홈');
  /* 10-30 사장님 "ㄱㄱ+": 철거 · 멸실 신고(건축인허가 철거멸실관리대장 원문 · 이 단지 필지) — 날짜가 있는 것만 · 칸은 건축인허가 아래 묶음 */
  const 덧 = await 허가덧받기(키);
  /* 철거는 시작일(없으면 종료 · 멸실일) — 다섯 건이 넘으면(재개발 터) 한 줄로 묶는다: 첫 날에 'N건' (목차가 철거로 덮이지 않게) */
  const 철 = ((덧 && 덧.철거) || []).map(x => ({ x, 날: 숫(x.시작일 || x.종료일 || x.멸실일) })).filter(o => o.날.length === 8).sort((a, b) => a.날.localeCompare(b.날));
  if (철.length > 5) 넣(철[0].날, `철거·멸실 신고 ${fmt(철.length)}건 시작 (마지막 ${날(철[철.length - 1].날)})`, ['info', '건축인허가'], '철거멸실관리대장');
  else for (const { x, 날: d8 } of 철) 넣(d8, `${x.구분 || '철거·멸실'} 신고 — ${x.용도 || x.건물명 || '건물'}`, ['info', '건축인허가'], '철거멸실관리대장');
  /* 348 용도지역 바뀜(토지특성 기준연도 사이) · 토지이동(원문 사유 · 일자). 필지가 여럿이면 몇 곳인지만(값은 필지 칸) */
  for (const g of (d.토지바뀜 || [])) {
    const 곳 = Number(g.필지) > 1 ? ` (필지 ${fmt(g.필지)}곳)` : '';
    넣(g.시점, `용도지역 ${g.전값 || '—'} → ${g.새값 || '—'}${곳}`, ['land', '필지'], '토지특성(기준연도)');
  }
  for (const m of (d.토지이동 || [])) {
    const 곳 = Number(m.필지) > 1 ? ` (필지 ${fmt(m.필지)}곳)` : '';
    넣(m.이동일, `토지 ${m.이동사유 || '이동'}${곳}`, ['land', '필지'], '토지이동이력');
  }
  const 권 = d.분양권 || {};
  if (Number(권.건수)) 넣(권.처음, '분양권·입주권 거래 시작', ['price', '거래 내역'], '국토부 분양권전매');
  if (!ev.length) { 지금.innerHTML = ''; return; }
  const c = d.단지 || {};
  if (c.oldest_use_apr) 넣(c.oldest_use_apr, '사용승인 — 지금 대장', ['info', '제원'], '건축물대장');
  if ((d.실거래 || {}).처음) 넣(d.실거래.처음, '이 단지 실거래 시작', ['price', '거래 내역'], '국토부 실거래');
  ev.sort((a, b) => (a.d ? 0 : 1) - (b.d ? 0 : 1) || a.d.localeCompare(b.d));
  /* 같은 날 · 같은 일은 한 줄(인허가가 같은 날 여러 건) */
  const 줄 = ev.filter((e, i) => !ev.slice(0, i).some(x => x.d === e.d && x.무엇 === e.무엇));
  지금.innerHTML = `${sect('이 땅의 역사', 'hist')}
    <ol class="hist">${줄.map(e => `<li data-histgo="${esc(e.간다.join('|'))}" data-histd="${esc(String(e.d || '').replace(/[^0-9]/g, '').slice(0, 8))}"${e.폐쇄 ? ` data-histcl="${esc(e.폐쇄)}"` : ''} role="button" tabindex="0" title="누르면 그 칸으로 갑니다${e.폐쇄 ? ' · 지도에 그 옛 대장 자리를 표시합니다' : ''}">
      <span class="hist-d">${esc(날(e.d) || '날짜 없음')}</span>
      <span class="hist-w">${esc(e.무엇)}<span class="hist-s">${esc(e.출처)} · ${esc(e.간다[1])} 칸</span></span></li>`).join('')}</ol>
    `;
}
document.addEventListener('click', async e => {
  const li = e.target.closest('#detail [data-histgo]');
  if (!li || !lastDetail) return;
  const [탭, 칸] = li.dataset.histgo.split('|');
  const 옛 = li.dataset.histcl;
  if (탭 !== detailTab) { detailTab = 탭; renderDetail(lastDetail); }
  /* 10-25 사장님 "하나를 클릭하면 밑으로 이동하는데, 어디를 봐야 할지 모르겠어" — 내려간 칸 안에서 **그 줄**을 찾아 가운데로 · 잠깐 색칠.
     찾는 법: 옛 대장 줄은 그 대장 표시(data-clsite) · 그 밖은 같은 날짜가 적힌 가장 작은 줄(2009.07.30 · 2009-07-30 · 20090730 어느 꼴이든).
     못 찾으면 칸 제목을 색칠한다(어디로 왔는지는 보이게). */
  const 날 = li.dataset.histd || '';
  setTimeout(() => {
    const t = [...document.querySelectorAll('#detail .sect')].find(x => x.textContent.trim().startsWith(칸));
    if (!t) return;
    const 칸들 = [];
    for (let n = t.nextElementSibling; n && !n.classList.contains('sect'); n = n.nextElementSibling) 칸들.push(n);
    const 꼴 = 날.length === 8 ? [날, `${날.slice(0, 4)}.${날.slice(4, 6)}.${날.slice(6)}`, `${날.slice(0, 4)}-${날.slice(4, 6)}-${날.slice(6)}`,
                                  `${날.slice(0, 4)}.${Number(날.slice(4, 6))}.${Number(날.slice(6))}`] : [];
    let 줄 = null;
    if (옛) 줄 = 칸들.map(n => n.matches(`[data-clsite="${CSS.escape(옛)}"]`) ? n : n.querySelector(`[data-clsite="${CSS.escape(옛)}"]`)).find(Boolean) || null;
    if (!줄 && 꼴.length) {
      const 후보 = 칸들.flatMap(n => [n, ...n.querySelectorAll('tr, li, .row, p, div')])
        .filter(x => 꼴.some(f => (x.textContent || '').includes(f)));
      /* 가장 작은(안쪽) 줄 — 자식 중에 같은 날짜를 품은 것이 없는 것 */
      줄 = 후보.find(x => !후보.some(y => y !== x && x.contains(y))) || null;
      if (줄 && 줄.closest('tr')) 줄 = 줄.closest('tr');
    }
    const 칠 = 줄 || t;
    for (let dt = 줄 && 줄.closest('details'); dt; dt = dt.parentElement && dt.parentElement.closest('details')) dt.open = true;   /* 접힌 묶음 안 줄이면 펴고 간다 */
    칠.scrollIntoView({ block: 줄 ? 'center' : 'start', behavior: 'smooth' });
    칠.classList.remove('histflash'); void 칠.offsetWidth; 칠.classList.add('histflash');
    setTimeout(() => 칠.classList.remove('histflash'), 2600);
  }, 350);
  if (옛) {
    try {
      const r = await fetch(`/api/closed/site/${encodeURIComponent(옛)}`).then(x => x.json());
      if (!r.error) 닫힌자리그리기(r, 'clmap:' + 옛);
    } catch (x) { /* 지도 표시는 덤 — 못 그려도 칸 이동은 했다 */ }
  }
});
async function 폐쇄채우기() {
  const box = document.querySelector('#detail .clbox');
  if (!box) return;
  const 키 = box.dataset.cl;
  const r = await 폐쇄받기(키);
  if (!r) return;
  const 지금 = document.querySelector('#detail .clbox');
  if (!지금 || 지금.dataset.cl !== 키) return;
  const 범 = r.범위 || {}, 묶 = r.묶음 || [];
  if (!Number(범.받은동)) { 지금.innerHTML = ''; return; }   // 이 동네는 아직 안 받음 — 칸을 안 보인다(받은 동: 장위동·수색동)
  const 동 = {};
  for (const t of (r.동 || [])) (동[t.site_key] ||= []).push(t);
  지금.innerHTML = `${sect('이 필지의 옛 대장 (폐쇄·말소)', 'closed', 묶.length ? ` ${fmt(묶.length)}` : '')}
    ${묶.length ? 묶.map(s => 폐쇄묶음줄(s, 동[s.site_key])).join('')
      : '<p class="note muted">이 단지 필지에는 폐쇄·말소된 대장이 없습니다.</p>'}
    ${ Number(범.받은동) < Number(범.법정동) ? `<p class="srcline">이 단지 필지의 법정동 ${fmt(범.법정동)}곳 중 ${fmt(범.받은동)}곳만 받았습니다.</p>` : ''}`;
}
/* ---------------- 지금 대장 없는 자리 (2026-10-25 사장님 "✕ 는 말소돼서 지금 못 쓰는 자리 · 누르지 않아도 보이게") ----------------
   닫힌(폐쇄·말소) 대장이 있었고 그 필지에 **지금 대장(단지)이 없는** 곳 — 옅은 회색 면. 17 이상 확대하면 저절로, 19 이상이면 ✕ 도.
   ★ 옛 대장이 있었어도 지금 건물이 있는 필지는 여기 안 나온다(10-23 사장님 "지금 라이브인 건 지도에 표시 안 함").
   ★ 면은 그 필지의 **지금** 경계다(옛 건물 모양은 원천에 없다). 누르면 닫힌 대장 말풍선. */
const 빈자리줌 = 17, 빈자리X줌 = 19;
let 빈자리층 = null, 빈자리차례 = 0, 빈자리타이머 = null;
function 빈자리켜기() {
  /* ★ 10-28: 기본 겹쳐보기 판과 같은 부모(돌아가는 판) 안으로 — 밖에 두면 이 판의 캔버스(지도 전체 크기)가 단지 마커 위에 덮여 17 이상 확대에서 마커가 안 눌렸다 */
  if (!map.getPane('emptyPane')) { const pn = map.createPane('emptyPane'); map.getPane('overlayPane').parentNode.appendChild(pn); pn.style.zIndex = 405; }
  빈자리층 = L.featureGroup().addTo(map);
  map.on('moveend', () => { clearTimeout(빈자리타이머); 빈자리타이머 = setTimeout(빈자리불러오기, 300); });
  빈자리불러오기();
}
async function 빈자리불러오기() {
  if (!빈자리층) return;
  const z = map.getZoom();
  if (z < 빈자리줌) { 빈자리층.clearLayers(); 지도알림('빈자리', ''); return; }
  const 차례 = ++빈자리차례;
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  let r;
  try { r = await fetch(`/api/closed/empty?bbox=${bbox}`).then(x => x.json()); } catch (e) { return; }
  if (차례 !== 빈자리차례 || !r || r.error) return;
  빈자리층.clearLayers();
  const 면 = L.geoJSON(r, { pane: 'emptyPane',
    style: { color: '#6b7280', weight: 1, opacity: 0.7, fillColor: '#6b7280', fillOpacity: 0.28 },
    onEachFeature: (f, ly) => {
      const p = f.properties || {};
      ly.bindTooltip(`지금 대장 없는 자리 · 옛 대장 ${fmt(p.개수)}${p.최근 ? ` · 최근 ${esc(p.구분 || '')} ${esc(날8(p.최근) || '')}` : ''}${p.이름 ? ` · ${esc(p.이름)}` : ''}`,
                     { direction: 'top', sticky: true });
      ly.on('click', e => { if (p.key) 폐쇄핀열기(p.key, e.latlng); });
    } }).addTo(빈자리층);
  if (z >= 빈자리X줌) 면.eachLayer(ly => {
    L.marker(ly.getBounds().getCenter(), { interactive: false, pane: 'emptyPane', keyboard: false,
      icon: L.divIcon({ className: 'clx-wrap', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="clx emp" aria-label="지금 대장 없는 자리">✕</div>' }) }).addTo(빈자리층);
  });
  지도알림('빈자리', r.잘림 ? '지금 대장 없는 자리는 한 화면에 1,500 필지까지만 보입니다 — 더 확대하세요' : '');
}
async function 폐쇄핀불러오기() {
  if (!폐쇄핀층) return;
  if (!폐쇄핀켜짐 || map.getZoom() < LAWD_ZOOM) { 폐쇄핀층.clearLayers(); return; }
  const 차례 = ++폐쇄핀차례;
  const b = map.getBounds();
  const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(7)).join(',');
  let r;
  try { r = await fetch(`/api/closed/pins?bbox=${bbox}`).then(x => x.json()); } catch (e) { return; }
  if (차례 !== 폐쇄핀차례 || r.error) return;
  폐쇄핀층.clearLayers();
  for (const s of (r.핀 || [])) {
    const 큰 = s.동수 > 1 || (s.총괄세대 || 0) > 0;
    const mk = L.circleMarker([s.lat, s.lng], { radius: 큰 ? 6 : 4, weight: 1.5, color: '#7a6a58', fillColor: '#b9a58c',
      fillOpacity: 0.55, className: 'clpt' });
    mk.bindTooltip(`${esc(s.이름 || s.plat_plc || '')} · ${esc(s.폐쇄구분 || '')} ${esc(날8(s.shter_day) || '')}`, { direction: 'top' });
    mk.on('click', () => 폐쇄핀열기(s.site_key, [s.lat, s.lng]));
    mk.addTo(폐쇄핀층);
  }
  if ((r.핀 || []).length >= 800) 지도알림('폐쇄', '폐쇄·말소 점은 한 화면에 800개까지만 보입니다 — 더 확대하세요');
  else 지도알림('폐쇄', '');
}
async function 폐쇄핀열기(key, ll) {
  const pop = L.popup({ maxWidth: 360, minWidth: 260, className: 'ahpop', autoPanPadding: [20, 60] })
    .setLatLng(ll).setContent('<p class="muted">불러오는 중…</p>').openOn(map);
  try {
    const r = await fetch(`/api/closed/site/${encodeURIComponent(key)}`).then(x => x.json());
    if (r.error) throw new Error(r.error);
    const s = r.묶음;
    pop.setContent(`<div class="ahpopin">${sect('폐쇄·말소 대장', 'closed')}${폐쇄묶음줄(s, r.동, true)}
      ${s.now_complex_id ? `<p class="sm">같은 필지의 지금 단지: <a href="/c/${s.now_complex_id}" data-goc="${s.now_complex_id}">${esc(s.now_nm || '단지')}</a>
        <span class="muted">(같은 필지일 뿐, 이어 지은 것이라는 뜻은 아님)</span></p>` : ''}</div>`);
  } catch (e) { pop.setContent(`<p class="note">불러오지 못했습니다 — ${esc(e.message || String(e))}</p>`); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-goc]');
  if (a) { e.preventDefault(); map.closePopup(); select(Number(a.dataset.goc)); return; }
  const nb = e.target.closest('[data-gonew]');
  if (nb) { e.preventDefault(); map.closePopup(); selectNewbuild(nb.dataset.gonew, false); return; }
  const b = e.target.closest('#clpins');
  if (!b) return;
  폐쇄핀켜짐 = !폐쇄핀켜짐;
  b.setAttribute('aria-pressed', String(폐쇄핀켜짐));
  폐쇄핀불러오기();
});

/* ---------------- 이 법정동의 단지 밖 청약 공고 (2026-10-22 13:31, 사장님 "그 법정동에 있을 때 점으로 · 누르면 단지 상세처럼") ----------------
   ★ 단지 상세를 열면 그 단지의 법정동에서 **단지에 안 이어진** 공고를 지도에 놓는다.
     · 지번 자리가 있는 것: 그 자리에 '공고' 표(누르면 공고 상세)
     · 자리가 없는 것: **'자리 모르는 공고 N' 묶음 표 하나** — 그 동을 가리키는 표일 뿐 공고의 자리가 아니다(점선 테두리 · 문구로 밝힘).
       누르면 목록 → 고르면 공고 상세. 법정동조차 모르는 공고(44)는 여기 안 나오고 검색 제안으로만. */
const 공고날 = v => 날짜(v);
let 동공고층 = null, 동공고지금 = null, 동공고차례 = 0;
function 동공고지우기() { if (동공고층) { try { map.removeLayer(동공고층); } catch (e) {} } 동공고층 = null; 동공고지금 = null; }
async function 동공고그리기(lawd) {
  if (!lawd) { 동공고지우기(); return; }
  if (동공고지금 === lawd) return;                     // 같은 동 — 다시 안 그린다(받는 중이어도)
  동공고지우기(); 동공고지금 = lawd;
  const 차례 = ++동공고차례;                            // ★ 10-23: 같은 동을 두 번 받아 표가 두 겹으로 쌓이던 것 — 마지막 부름만 그린다
  let r;
  try { r = await fetch(`/api/applyhome/dong/${encodeURIComponent(lawd)}`).then(x => x.json()); } catch { if (차례 === 동공고차례) 동공고지금 = null; return; }
  if (차례 !== 동공고차례 || !r || r.error || 동공고지금 !== lawd || typeof map === 'undefined' || !map) return;
  const g = L.featureGroup().addTo(map);
  /* ★ 2026-10-23 사장님 "너무 겹쳐 보여" — 같은 공고 지번 필지(pnu)의 공고는 **표 하나**로.
     장위 푸르지오 마크원처럼 일반공급·무순위·(2차)가 관리번호가 따로라 같은 자리에 표가 겹겹이 섰다.
     묶는 근거는 지번(pnu)이지 이름이 아니다. 하나면 바로 공고 상세, 여럿이면 목록 → 고르면 공고 상세. */
  const 필지묶음 = new Map();
  for (const h of (r.자리있음 || [])) {
    const k = h.pnu || `${Number(h.lat).toFixed(6)},${Number(h.lng).toFixed(6)}`;
    (필지묶음.get(k) || 필지묶음.set(k, []).get(k)).push(h);     // 서버가 공고일 최근 순 — hs[0] 이 가장 최근
  }
  for (const hs of 필지묶음.values()) {
    const h = hs[0], ll = [Number(h.lat), Number(h.lng)];
    const 첫 = hs[hs.length - 1];                              // 첫 공고(보통 일반분양) 이름
    const 꼬리 = [...new Set(hs.map(x => 공고종류짧게[x.공고종류] || '공고'))].join('·');
    const 공고수 = hs.reduce((a, x) => a + (Number(x.공고수) || 1), 0);
    const mk = L.marker(ll, { zIndexOffset: 300, riseOnHover: true,
      title: `${첫.house_nm} · 청약 공고 ${공고수}건 · 단지에 아직 안 이어짐`,
      icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ahmark"><b>${esc(꼬리)}</b><span>${esc(shortNm(첫.house_nm) || '')}</span>${공고수 > 1 ? `<em>공고 ${fmt(공고수)}</em>` : ''}</div>` }) });
    mk.on('click', () => 공고상세(h.house_manage_no, ll[0], ll[1]));   // 상세가 같은 지번 공고를 다 보인다
    mk.addTo(g);
  }
  /* 13:49 '근처' — 공고 지번 필지가 지금 없어 같은 본번 필지들의 가운데에(점선 · '근처' 글씨) */
  /* 같은 본번이면 같은 자리 — 겹쳐 쌓이지 않게 **자리마다 하나**로 묶는다(여럿이면 '근처 N' → 목록) */
  const 근처묶음 = new Map();
  for (const h of (r.근처 || [])) {
    const k = `${Number(h.근처lat).toFixed(6)},${Number(h.근처lng).toFixed(6)}`;
    (근처묶음.get(k) || 근처묶음.set(k, []).get(k)).push(h);
  }
  for (const hs of 근처묶음.values()) {
    const h = hs[0], ll = [Number(h.근처lat), Number(h.근처lng)];
    const mk = L.marker(ll, { zIndexOffset: 280, riseOnHover: true,
      title: `${hs.length > 1 ? `청약 공고 ${hs.length}건` : h.house_nm} — 공고 지번 필지가 지금 지적도에 없어 같은 본번 필지 ${h.근처필지}개 가운데에 놓았습니다(정확한 자리 아님)`,
      icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ahmark near"><b>근처${hs.length > 1 ? ' ' + hs.length : ''}</b><span>${esc(shortNm(h.house_nm) || '')}${hs.length > 1 ? ' 외' : ''}</span></div>` }) });
    if (hs.length === 1) mk.on('click', () => 공고상세(h.house_manage_no, ll[0], ll[1]));
    else mk.on('click', () => L.popup({ maxWidth: 320, minWidth: 240, className: 'ahpop', autoPanPadding: [20, 60] }).setLatLng(ll)
      .setContent(`<div class="ahpopin"><div class="lt2">근처 청약 공고 ${fmt(hs.length)}</div>
        <p class="note sm">공고 지번 필지가 지금 지적도에 없어 <b>같은 본번 필지 ${fmt(h.근처필지)}개의 가운데</b>에 놓았습니다 — 정확한 자리가 아닙니다.</p>
        <ul class="lu">${hs.map(x => `<li data-ahopen="${esc(x.house_manage_no)}" role="button" tabindex="0"><b>${esc(x.house_nm || '')}</b>
          <span class="muted"> ${esc(공고종류말[x.공고종류] || x.공고종류 || '')} · 공고 ${esc(공고날(x.rcrit_pblanc_de))}</span></li>`).join('')}</ul></div>`).openOn(map));
    mk.addTo(g);
  }
  const 모름 = r.자리모름 || [], 자리 = r.표시자리;
  if (모름.length && 자리 && 자리.lat != null) {
    const mk = L.marker([Number(자리.lat), Number(자리.lng)], { zIndexOffset: 250,
      title: `${자리.동이름 || '이 동'} — 지번이 없어 자리를 모르는 청약 공고 ${모름.length}건(표시 자리는 ${자리.근거}, 공고의 자리가 아님)`,
      icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
        html: `<div class="ahmark nowhere"><b>공고</b><span>자리 모름 ${fmt(모름.length)}</span></div>` }) });
    mk.on('click', () => {
      L.popup({ maxWidth: 320, minWidth: 240, className: 'ahpop', autoPanPadding: [20, 60] }).setLatLng(mk.getLatLng())
        .setContent(`<div class="ahpopin"><div class="lt2">${esc(자리.동이름 || '이 동')} · 자리 모르는 청약 공고 ${fmt(모름.length)}</div>
          <p class="note sm">공고에 지번이 없거나(공공주택지구 블록 등) 그 필지가 지금 없어 <b>정확한 자리를 모릅니다</b>. 이 표는 동을 가리킬 뿐입니다.</p>
          <ul class="lu">${모름.map(h => `<li data-ahopen="${esc(h.house_manage_no)}" role="button" tabindex="0"><b>${esc(h.house_nm || '')}</b>
            <span class="muted"> ${esc(공고종류말[h.공고종류] || h.공고종류 || '')} · 공고 ${esc(공고날(h.rcrit_pblanc_de))}</span></li>`).join('')}</ul></div>`)
        .openOn(map);
    });
    mk.addTo(g);
  }
  동공고층 = g;
}
document.addEventListener('click', e => {
  const li = e.target.closest && e.target.closest('[data-ahopen]');
  if (!li) return;
  map.closePopup(); 공고상세(li.dataset.ahopen, null, null);
});

/* ---------------- 검색 제안에서 연 '단지 밖' 상세 (2026-10-22 12:32, 사장님 "버튼 빼고 검색 제안에서") ----------------
   ① 청약 공고(단지 미연결) ② 폐쇄·말소 대장. 정비구역 상세와 같은 틀(왼쪽 상세 · 폰은 시트)을 쓴다 — selectedRedev 에 'ah:'·'cl:' 로 표를 단다.
   ★ 폐쇄: 지도에 **✕ 표 + 회색 점선 필지** — "닫힌 것" 이 한눈에. 그려지는 건 **그 필지의 지금 경계**지 옛 건물 모양이 아니다(문구로 밝힘).
     필지가 사라졌으면(합필·분필) 아무것도 안 그린다 — 자리를 지어내지 않는다. */
function 보조상세열기(표) {
  if (selected !== null || selectedKapt !== null || selectedRedev !== null) closeDetail();
  selectedRedev = 표;
  목록자동(true);
  const box = $('#detail'); box.hidden = false; box.innerHTML = '<p class="muted">불러오는 중…</p>';
  시트('half');
  return box;
}
function 지도맞추기(b, z = 18) {
  setTimeout(() => {
    const top = 폰() ? ((document.querySelector('.ptop') || {}).offsetHeight || 0) : 0;
    const sh = 폰() ? ((document.querySelector('#psheet') || {}).offsetHeight || 0) : 0;
    if (b.getNorthEast) map.fitBounds(b, { paddingTopLeft: [24, top + 24], paddingBottomRight: [24, sh + 24], maxZoom: z });
    else map.setView(b, z);
  }, 280);
}
async function 공고상세(house, lat, lng) {
  { const g = await 가단지찾기(house); if (g) return select(g, false); }   // 10-30 가단지가 있으면 단지 상세로
  const 표 = 'ah:' + house;
  보기전환('map');
  const 남길동 = 동공고지금;                 // 동 공고 점에서 열었으면 그 점들은 남긴다(옆 공고로 바로 옮겨 가게)
  const box = 보조상세열기(표);
  if (남길동) 동공고그리기(남길동);
  let r, w = null;
  try {
    [r, w] = await Promise.all([
      fetch(`/api/applyhome?house=${encodeURIComponent(house)}`).then(x => x.json()),
      fetch(`/api/applyhome/${encodeURIComponent(house)}/where`).then(x => x.json()).catch(() => null)]);
    if (r.error) throw new Error(r.error);
  }
  catch (e) { if (selectedRedev === 표) box.innerHTML = `<p class="note">${gapCell('', 'UNSURE', '공고를 불러오지 못했습니다 — ' + (e.message || e))}</p>`; return; }
  if (selectedRedev !== 표) return;
  if (w && !w.error && w.lat != null) { lat = Number(w.lat); lng = Number(w.lng); }
  const 근처 = w && w.자리 === '근처';
  구역지우기();
  if (lat != null) {
    구역층 = L.featureGroup([L.marker([lat, lng], { interactive: false, icon: L.divIcon({ className: 'cmark-wrap', iconSize: null, iconAnchor: [0, 0],
      html: `<div class="ahmark${근처 ? ' near' : ''}"><b>${근처 ? '근처' : '공고'}</b><span>${esc(shortNm(((r.공고 || []).slice(-1)[0] || {}).house_nm) || '')}</span></div>` }) })]).addTo(map);   // 첫 공고 이름
    구역지금 = 표; 지도맞추기([lat, lng], 17);
  }
  const 지번말 = w && w.pnu ? `${w.pnu.slice(10, 11) === '2' ? '산 ' : ''}${Number(w.pnu.slice(11, 15))}${Number(w.pnu.slice(15, 19)) ? '-' + Number(w.pnu.slice(15, 19)) : ''}` : null;
  const 이력칸 = w && (w.이력 || w.이력실패) ? `<div class="lt2">공고 지번 ${esc(지번말 || '')}의 토지 이동 이력 <span class="muted">(VWorld 토지이동이력 원문)</span></div>${
      w.이력실패 ? `<p class="note sm">${gapCell('', 'UNSURE', '이력을 불러오지 못했습니다 — ' + w.이력실패)}</p>`
      : (w.이력 || []).length ? `<ul class="lu">${w.이력.slice(0, 4).map(z => `<li><b>${esc(z.일자 ? 날짜(z.일자) : '날짜 없음')}</b> <span>${esc(z.사유 || '')}</span>
          <span class="muted">${esc([z.지목, z.면적 ? z.면적 + '㎡' : null].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`
      : '<p class="note sm">이 지번으로 된 토지 이동 이력이 없습니다(블록 번호이거나 지번이 아닌 표기일 수 있음).</p>'}` : '';
  const 공고들 = r.공고 || [];                                  // 서버가 공고일 최근 순 — 끝이 첫 공고
  const 집수 = new Set(공고들.map(p => p.house_manage_no)).size;
  const 이어짐 = r.같은지번이어짐 || [];
  box.innerHTML = `<span class="pill">청약 공고</span> <span class="pill cl">단지 미연결</span>
    <h2>${esc((공고들[공고들.length - 1] || {}).house_nm || '청약 공고')}</h2>
    ${집수 > 1 ? `<p class="note sm">같은 공고 지번의 공고 ${fmt(공고들.length)}건을 한데 보임</p>` : ''}
    ${이어짐.length ? `<p class="note sm">같은 공고 지번의 다른 공고는 이미 ${이어짐.map(c => c.complex_id ? `<a href="/c/${c.complex_id}" data-goc="${c.complex_id}">${esc(c.이름 || '단지')}</a>`
        : `<a href="#" data-gonew="${esc(c.kapt_code)}">${esc(c.이름 || 'K-apt 단지')}</a> <span class="muted">(대장 없는 신축 · K-apt)</span>`).join(' · ')}
      에 이어져 있음(그 단지의 분양 칸)</p>` : ''}
    <p class="note sm">단지에 아직 안 이어짐 · ${lat == null ? '지도 자리 없음(공고 지번 필지를 못 찾음)'
        : 근처 ? `지도 표는 '근처'(공고 지번 필지가 지금 없어 같은 본번 필지 ${fmt(w.근처필지)}개 가운데)` : '지도 표 = 공고 지번 자리'}</p>
    ${이력칸}
    <div class="ahbox">${분양칸(공고들, true)}${공고들.length ? 분양권칸(r) : ''}</div>`;
}
/* 12:44 사장님 "따로 버튼 안 눌러도 X 누른 것처럼" — 단지 상세를 열면 그 단지 필지 중 닫힌 대장이 있는 필지에 **저절로** ✕ + 회색 점선.
   ★ 구역층(정비·토지이용 토글)과 따로 둔다 — 그걸 켜고 꺼도 이 표시는 남는다. 단지를 닫거나 바꾸면 지운다.
   ★ 필지마다 ✕ 하나(같은 필지에 묶음이 여럿이면 말풍선에 다). 지금 단지 모양은 건드리지 않는다. */
let 닫힌자리층 = null, 닫힌자리단지 = null;
const 닫힌자리들 = new Map();   // pnu → { 면, 표, n }  — 12:59 목록 줄 ↔ 지도 ✕ 짝 맞추기
function 닫힌자리지우기() { if (닫힌자리층) { try { map.removeLayer(닫힌자리층); } catch (e) {} } 닫힌자리층 = null; 닫힌자리단지 = null; 닫힌자리들.clear(); }
/* 13:06 사장님 "바꿔봐" — 단지 위에서는 ✕·회색 채움이 '이 단지가 폐쇄됐다' 로 읽혔다(52940 드림아트빌: 1962 옛 집 → 2001 지금 건물).
   → 단지 상세에서는 **'옛 대장' 표**(작은 회색 글씨 표)만, 필지는 안 칠한다. 줄에 올리면 표가 주황 · 필지 테두리만 실선.
   ✕ + 회색 채움은 검색으로 **닫힌 대장 자체를 열었을 때만**(폐쇄상세). */
const 닫힌표아이콘 = (말, 켬) => L.divIcon({ className: 'oldtag-wrap', iconSize: null, iconAnchor: [0, 0],
  html: `<div class="oldtag${켬 ? ' on' : ''}">${esc(말)}</div>` });
const 닫힌면모양 = 켬 => 켬 ? { color: '#c2410c', weight: 3, dashArray: null, fillOpacity: 0, opacity: 1 }
                         : { color: '#6b7280', weight: 0, fillOpacity: 0, opacity: 0 };
/* 목록 줄에 올리거나 누르면 그 ✕ 를 키우고 주황으로, 그 필지는 진한 실선. 지도 ✕ 에 올리면 목록 줄을 밝힌다 */
function 닫힌자리강조(pnu, 켬, 옮김 = false) {
  for (const [k, v] of 닫힌자리들) {
    const 이것 = 켬 && k === pnu;
    if (v.표) { v.표.setIcon(닫힌표아이콘(v.말, 이것)); v.표.setZIndexOffset(이것 ? 1200 : 800); }
    if (v.면) v.면.setStyle(닫힌면모양(이것));
  }
  document.querySelectorAll('#detail .clsite').forEach(el => el.classList.toggle('hl', !!켬 && el.dataset.clpnu === pnu));
  const v = 닫힌자리들.get(pnu);
  if (켬 && 옮김 && v) {
    const ll = v.표 ? v.표.getLatLng() : v.면.getBounds().getCenter();
    if (!map.getBounds().pad(-0.1).contains(ll)) {
      if (폰() && document.querySelector('.app').dataset.sheet === 'full') 시트('half');
      setTimeout(() => map.panTo(ll), 폰() ? 280 : 0);
    }
  }
}
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('#detail .clsite[data-clpnu]');
  if (el && 닫힌자리들.has(el.dataset.clpnu)) 닫힌자리강조(el.dataset.clpnu, true);
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest && e.target.closest('#detail .clsite[data-clpnu]');
  if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
  if (닫힌자리고정 !== el.dataset.clpnu) 닫힌자리강조(닫힌자리고정, !!닫힌자리고정);
});
let 닫힌자리고정 = null;   // 누른 줄은 마우스를 떼도 밝힌 채로(다른 줄을 누르거나 같은 줄을 다시 누르면 바뀜)
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('#detail .clsite[data-clpnu] > summary');
  if (!el) return;
  const pnu = el.parentElement.dataset.clpnu;
  if (!닫힌자리들.has(pnu)) return;
  닫힌자리고정 = 닫힌자리고정 === pnu ? null : pnu;
  닫힌자리강조(pnu, 닫힌자리고정 === pnu, true);
});
function 닫힌자리자동(cid, r) {
  if (닫힌자리단지 === cid && 닫힌자리층) { if (닫힌자리고정) setTimeout(() => 닫힌자리강조(닫힌자리고정, true), 0); return; }   // 탭만 바꿨다 — 다시 그리지 않는다
  닫힌자리지우기(); 닫힌자리고정 = null;
  const 필 = (r.필지 || []).filter(x => x.geometry || x.lat != null);
  if (!필.length || typeof map === 'undefined' || !map) return;
  /* ★ 12:52 사장님 "회색이 안 나와" — 단지 필지·건물(주황) 밑에 깔려 가려졌다. 전용 판(pane)을 위에 둔다(그림 400 < 이것 450 < 표 600) */
  if (!map.getPane('closedPane')) { const pn = map.createPane('closedPane'); pn.style.zIndex = 450; pn.style.pointerEvents = 'none'; }
  const g = L.featureGroup().addTo(map);
  for (const f of 필) {
    const 묶 = (r.묶음 || []).filter(s => s.pnu === f.pnu);
    const 말 = 묶.map(s => `${s.폐쇄구분 || ''} ${날8(s.shter_day) || '날짜 없음'} · ${s.이름 || s.주용도 || '이름 없음'}`).join('\n');
    const 최근 = 묶.filter(x => x.shter_day).sort((a, b) => b.shter_day.localeCompare(a.shter_day))[0] || 묶[0] || {};
    const 짝 = { 면: null, 표: null, n: 묶.length,
                 말: 묶.length > 1 ? `옛 대장 ${묶.length}` : `옛 대장 · ${최근.shter_day ? 최근.shter_day.slice(0, 4) + ' ' : ''}${최근.폐쇄구분 || ''}` };
    if (f.geometry) 짝.면 = L.geoJSON(f.geometry, { interactive: false, pane: 'closedPane', style: 닫힌면모양(false) }).addTo(g);
    if (f.lat != null) {
      const m = L.marker([Number(f.lat), Number(f.lng)], { zIndexOffset: 800, keyboard: false,
        title: `이 필지의 옛 대장 ${묶.length}묶음 — 지금 이 단지 건물이 아니라 예전 건물(또는 예전 서류)입니다\n${말}`, icon: 닫힌표아이콘(짝.말, false) });
      m.on('mouseover', () => 닫힌자리강조(f.pnu, true));
      m.on('mouseout', () => 닫힌자리강조(닫힌자리고정, !!닫힌자리고정));
      m.on('click', () => { 닫힌자리고정 = f.pnu; detailTab = 'land'; renderDetail(lastDetail);
        setTimeout(() => { const b = document.querySelector(`#detail .clsite[data-clpnu="${f.pnu}"]`) || document.querySelector('#detail .clbox');
          if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); 닫힌자리강조(f.pnu, true); }, 500); });
      짝.표 = m.addTo(g);
    }
    닫힌자리들.set(f.pnu, 짝);
  }
  닫힌자리층 = g; 닫힌자리단지 = cid;
}
/* 닫힌 대장 자리: ✕ 표 + 회색 점선 필지(필지의 **지금** 경계). 구역층을 같이 써서 한 번에 하나 */
function 닫힌자리그리기(r, 표) {
  const s = r.묶음 || {};
  구역지우기();
  if (!(r.필지 || s.lat != null)) return false;
  const g = L.featureGroup().addTo(map);
  if (!map.getPane('closedPane')) { const pn = map.createPane('closedPane'); pn.style.zIndex = 450; pn.style.pointerEvents = 'none'; }
  if (r.필지) L.geoJSON(r.필지, { interactive: false, pane: 'closedPane',
    style: { color: '#4b5563', weight: 2, dashArray: '5 4', fillColor: '#6b7280', fillOpacity: 0.5 } }).addTo(g);
  const c = s.lat != null ? [Number(s.lat), Number(s.lng)] : g.getBounds().getCenter();
  /* 14:08 QA: 작은 필지(20m 남짓)는 ✕(26px)가 회색을 다 덮었다 → 최대(19)까지 당기고, ✕ 는 필지 **위쪽 바깥**에 핀처럼 */
  const 위 = r.필지 ? L.latLng(g.getBounds().getNorth(), g.getBounds().getCenter().lng) : null;
  L.marker(위 || c, { interactive: false, zIndexOffset: 900, icon: L.divIcon({ className: 'clx-wrap', iconSize: [22, 22], iconAnchor: 위 ? [11, 26] : [11, 11],
    html: '<div class="clx pin" aria-label="닫힌 대장">✕</div>' }) }).addTo(g);
  구역층 = g; 구역지금 = 표;
  지도맞추기(r.필지 ? g.getBounds() : c, 19);
  return true;
}
/* 단지 상세 토지 탭의 닫힌 대장 줄 → 지도에 ✕ (12:36 사장님 "그대론데??" — 지금 단지는 그대로 두고, 닫힌 대장 자리만 따로 표시) */
document.addEventListener('click', async e => {
  const b = e.target.closest('#detail [data-clsite]');
  if (!b) return;
  e.preventDefault();
  const 표 = 'clmap:' + b.dataset.clsite;
  if (구역지금 === 표) { 구역지우기(); return; }
  try {
    const r = await fetch(`/api/closed/site/${encodeURIComponent(b.dataset.clsite)}`).then(x => x.json());
    if (r.error) throw new Error(r.error);
    if (닫힌자리그리기(r, 표)) { b.classList.add('on'); if (폰() && document.querySelector('.app').dataset.sheet === 'full') 시트('half'); }
  } catch (x) { toast('닫힌 대장 자리를 불러오지 못했습니다', 2500); }
});
/* 2026-10-23 사장님 "확실한건만" — 폐쇄·말소 대장 자리의 실거래 중 **어느 단지에도 안 붙은 것**(분양권·입주권 빼고).
   닫히기 전 = 옛 건물 · 닫힌 뒤 = 이 지번으로 신고된 새 건물(새 대장이 아직 없거나 다른 지번에 있다). 날짜로만 가른다. */
function 옛거래칸(o, s, 때들 = ['전', '뒤']) {
  if (!o || !(o.셈 || []).length) return '';
  const 날 = d => 날짜(d);
  const 닫 = 날(String(s.shter_day || ''));
  const 종 = k => /^APT/.test(k) ? '아파트' : /^RH/.test(k) ? '연립·다세대' : /^OFFI/.test(k) ? '오피스텔' : /^SH/.test(k) ? '단독·다가구' : '그 밖';
  const 돈 = x => Number(x.전월세) ? (Number(x.월세) ? `${eok(x.보증금)} / ${fmt(Math.round(Number(x.월세) / 10000))}만` : eok(x.보증금)) : eok(x.거래원);
  return 때들.map(때 => {
    const c = o.셈.find(z => z.때 === 때); if (!c) return '';
    const 줄 = o.줄.filter(z => z.때 === 때);
    const n = (Number(c.매매) || 0) + (Number(c.전월세) || 0) + (Number(c.해제) || 0);
    return sect(때 === '전' ? '이 자리 옛 건물 실거래' : '닫힌 뒤 이 지번으로 신고된 실거래', 'rtms', ` ${fmt(n)}`)
      + `<p class="note sm">${때 === '전'
          ? `대장이 닫힌 ${닫} 이전 계약(헐리기 전 건물 — 단지에 안 붙임) ·`
          : `대장이 닫힌 ${닫} 이후 같은 지번 계약(새 건물로 보임 — 단지에 못 이음) ·`}
        매매 ${fmt(c.매매 || 0)} · 전월세 ${fmt(c.전월세 || 0)}${Number(c.해제) ? ` · 해제 ${fmt(c.해제)}` : ''} · ${날(c.처음)} ~ ${날(c.끝)}${c.이름 ? ` · 신고 이름 ${esc(c.이름)} <span class="muted">(참고)</span>` : ''}</p>
      <table class="mini"><thead><tr><th>계약</th><th>종류</th><th class="n">전용</th><th class="n">층</th><th class="n">금액</th></tr></thead><tbody>
      ${줄.slice(0, 15).map(x => `<tr${Number(x.취소) ? ' class="canc"' : ''}><td>${날(x.계약일)}${Number(x.취소) ? ` <span class="tcx">${용어('해제')}</span>` : ''}</td>
        <td>${종(x.종류)} ${Number(x.전월세) ? (Number(x.월세) ? '월세' : '전세') : '매매'}</td><td class="n">${x.전용 != null ? Number(x.전용).toFixed(2) : '—'}</td>
        <td class="n">${x.층 ?? '—'}</td><td class="n">${Number(x.취소) ? `<s>${돈(x)}</s>` : 돈(x)}</td></tr>`).join('')}
      </tbody></table>${n > 15 ? `<p class="note sm">최근 15건만 보입니다.</p>` : ''}`;
  }).join('');
}
/* 2026-10-23 사장님 "폐쇄 말소대장도 기존 단지상세처럼 동호나 그런 정보들을 동일하게" — 단지 상세와 같은 탭 · 같은 그림 함수(structureBlock · tradeList).
   ★ 탭: 대장정보 · 동·호 · 실거래 · 토지. 동·호 격자와 실거래 목록은 단지 상세와 **같은 함수**라 보이는 법이 같다(작업방식 10장).
   ★ 호 → 동은 **잇지 않는다**(폐쇄 기본개요에 상위 대장 번호가 없다 · 사장님 "잇지말고") — 동·호 탭에 까닭을 적는다. */
let 폐쇄탭 = 'info', 폐쇄거래탭 = '매매', 폐쇄마지막 = null, 폐쇄동다 = false, 폐쇄공시동 = null, 폐쇄공시줄 = null;
/* 폐쇄 자리 공시가격 — 한 동의 호마다 연도별 원문 값(호 · 층 · 전용 · 해마다) */
function 공시호표(줄, 억원) {
  const 호 = new Map();
  for (const x of 줄) { const k = x.호명 + '|' + (x.층 || ''); if (!호.has(k)) 호.set(k, { 호: x.호명, 층: x.층, 전용: x.전용면적, 값: [] }); 호.get(k).값.push(x); }
  if (!호.size) return '<p class="note sm">이 동의 공시가격 줄이 없습니다.</p>';
  return `<table class="cned"><thead><tr><th>호</th><th>층</th><th class="n">전용</th><th>연도별 공시가격 (원문)</th></tr></thead><tbody>
    ${[...호.values()].map(h => `<tr><td>${esc(h.호 || '—')}</td><td>${esc(h.층 || '—')}</td><td class="n">${h.전용 != null ? Number(h.전용).toFixed(2) : '—'}</td>
      <td class="sm">${h.값.map(v => `<span class="nowrap">${esc(v.기준연도)}${v.기준월 && v.기준월 !== '01' ? '.' + esc(v.기준월) : ''} <b>${억원(v.공시가격)}</b></span>`).join(' · ')}</td></tr>`).join('')}
  </tbody></table>`;
}
async function 폐쇄상세(key) {
  const 표 = 'cl:' + key;
  보기전환('map');
  const box = 보조상세열기(표);
  let r;
  try { r = await fetch(`/api/closed/site/${encodeURIComponent(key)}`).then(x => x.json()); if (r.error) throw new Error(r.error); }
  catch (e) { if (selectedRedev === 표) box.innerHTML = `<p class="note">${gapCell('', 'UNSURE', '닫힌 대장을 불러오지 못했습니다 — ' + (e.message || e))}</p>`; return; }
  if (selectedRedev !== 표) return;
  if (!폐쇄마지막 || 폐쇄마지막.key !== key) { 폐쇄탭 = 'info'; 폐쇄동다 = false; 폐쇄공시동 = null; 폐쇄공시줄 = null; hoDong = null; hoArea = null; hoAreaX = null; hoFloor = null; 거래Shown = 10; }
  폐쇄마지막 = { key, r, 표, box };
  닫힌자리그리기(r, 표);
  폐쇄그리기();
}
function 폐쇄그리기() {
  const m = 폐쇄마지막; if (!m || selectedRedev !== m.표) return;
  const { r, box } = m, s = r.묶음, 대 = r.대장 || { 동: [], 층: [], 호: [], 받음: {} };
  const 받음 = 대.받음 || {};
  const 다받음 = ['getSrExposInfo', 'getSrExposPubuseAreaInfo', 'getSrFlrOulnInfo'].every(k => 받음[k]);
  const 호수 = (대.호 || []).length;
  const 거래 = r.거래 || [];
  const 종수 = k => 거래.filter(x => (x.전월세 ? (x.월세냐 ? '월세' : '전세') : '매매') === k).length ? Number(거래.find(x => (x.전월세 ? (x.월세냐 ? '월세' : '전세') : '매매') === k).전체) : 0;
  const 거래수 = ['매매', '전세', '월세'].reduce((t, k) => t + 종수(k), 0);
  if (!['매매', '전세', '월세'].some(k => k === 폐쇄거래탭 && 종수(k))) 폐쇄거래탭 = ['매매', '전세', '월세'].find(k => 종수(k)) || '매매';
  const 분양권수 = (Number(r.분양권수.건수) || 0) + (Number(r.분양권수.취소) || 0);
  const 뒤수 = (r.옛거래.셈 || []).filter(z => z.때 === '뒤').reduce((t, z) => t + (Number(z.매매) || 0) + (Number(z.전월세) || 0) + (Number(z.해제) || 0), 0);
  const TABS = [['info', '대장정보'], ['dong', `동·호 <b>${fmt(호수 || (대.동 || []).length)}</b>`],
                ['price', `실거래 <b>${fmt(거래수 + 분양권수 + 뒤수)}</b>`], ['land', '토지']];
  if (!TABS.some(t => t[0] === 폐쇄탭)) 폐쇄탭 = 'info';
  const 날 = d => d ? String(d).replace(/^(\d{4})(\d\d)(\d\d)$/, '$1.$2.$3') : '';

  const paneI = `${sect('폐쇄·말소 대장', 'closed')}
    ${폐쇄묶음줄(s, r.동, true)}
    ${s.now_complex_id ? `<p class="sm">같은 필지의 지금 단지: <a href="/c/${s.now_complex_id}" data-goc="${s.now_complex_id}">${esc(s.now_nm || '단지')}</a>
      <span class="muted">(같은 필지일 뿐, 이어 지은 것이라는 뜻은 아님)</span></p>` : ''}`;

  /* 2026-10-23 사장님 "1번 ㄴㄴ 그럼 잇지말고, 왜 동호가 없는지 간략히 설명해" — 호를 동에 **잇지 않는다**. 동은 동대로(층은 표제부 번호로) · 호는 호대로(전용면적은 호 번호로) */
  /* 2026-10-23: 평형은 **주거 호**(전유 용도에 주택·아파트가 든 것)만 — 상가 칸(4㎡ · 5㎡ …)이 섞이지 않게. 나머지는 용도별 수만 */
  const 주거호 = h => /주택|아파트/.test(h.용도 || '');
  const 평 = new Map(); for (const h of 대.호 || []) if (h.평형 != null && 주거호(h)) 평.set(h.평형, (평.get(h.평형) || 0) + 1);
  const 그밖 = new Map(); for (const h of 대.호 || []) if (!주거호(h)) { const k = h.용도 || '용도 없음'; 그밖.set(k, (그밖.get(k) || 0) + 1); }
  /* 동 줄 순서: 세대 있는 동 먼저 · 이름 속 숫자 순(1동 · 2동 · … · 10동) — 글자 순이면 100동 · 10동 · 1동 이 섞였다 */
  const 숫 = d => { const m = String(d.dong_nm || d.bld_nm || '').match(/(\d+)/); return m ? Number(m[1]) : 1e9; };
  const 동줄 = [...(대.동 || [])].sort((a, b) => ((b.hhld_cnt > 0) - (a.hhld_cnt > 0)) || (숫(a) - 숫(b))
    || String(a.dong_nm || a.bld_nm || '').localeCompare(String(b.dong_nm || b.bld_nm || ''), 'ko'));
  const 층범위 = pk => { const f = (대.층 || []).filter(x => String(x.mgm_bldrgst_pk) === String(pk)).map(x => Number(x.층)).filter(Number.isFinite);
    if (!f.length) return '—'; const lo = Math.min(...f), hi = Math.max(...f); return `${lo < 0 ? '지하 ' + (-lo) : lo}${hi !== lo ? ' ~ ' + hi : ''}층`; };
  const paneD = `<p class="note sm">동 · 호를 따로 보임(폐쇄 대장엔 호를 동에 잇는 번호가 없음 — 격자 없음)</p>
    ${sect('동', 'closed', ` ${fmt((대.동 || []).length)}`)}
    <table><thead><tr><th>동</th><th>용도</th><th class="n">세대</th><th>층</th><th class="n">연면적</th><th>닫힌 날</th></tr></thead><tbody>
      ${동줄.map((d, i) => `<tr${d.이묶음 ? '' : ' class="muted"'}${i >= 30 && !폐쇄동다 ? ' hidden' : ''}><td>${esc(d.dong_nm || d.bld_nm || '—')}</td><td>${esc(d.main_purps_nm || '—')}</td>
        <td class="n">${d.hhld_cnt ? fmt(d.hhld_cnt) : '—'}</td><td>${(대.층 || []).length ? 층범위(d.mgm_bldrgst_pk) : (d.grnd_flr_cnt ? `지상 ${d.grnd_flr_cnt}층` : '—')}</td>
        <td class="n">${d.tot_area ? fmt(Math.round(d.tot_area)) : '—'}</td><td>${esc(날(d.shter_day))}</td></tr>`).join('') || '<tr><td colspan="6">—</td></tr>'}
    </tbody></table>
    ${동줄.length > 30 && !폐쇄동다 ? `<button type="button" class="more" data-cdong-all="1">동 ${fmt(동줄.length - 30)}개 더 보기</button>` : ''}
    ${sect('호 (전유부)', 'closed', ` ${fmt(호수)}`)}
    ${호수 ? `<p class="sm">전유부 <b>${fmt(호수)}호</b>${평.size ? ` · 주거 호의 전용면적(전유공용면적)으로 본 평형:` : ''}</p>
      ${평.size ? `<div class="apick">${[...평.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `<span class="achip">${fmt(k)}㎡<b>${fmt(n)}</b></span>`).join('')}</div>
        ${그밖.size ? `<p class="note sm">주거 아닌 호(평형에서 뺌): ${[...그밖.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${fmt(n)}`).join(' · ')}</p>` : ''}`
                : `<p class="note sm">${다받음 ? '전유공용면적에 전용면적이 없습니다.' : '전용면적(전유공용면적)은 아직 받는 중입니다.'}</p>`}`
      : `<p class="note">${다받음 ? gapCell('', 'NA', '이 지번의 폐쇄 대장에는 전유부(호)가 없습니다 — 호로 나뉘지 않은 건물(일반 대장)입니다')
                               : gapCell('', 'SCOPE', '이 지번의 폐쇄 전유부를 아직 받는 중입니다(집합 대장 지번부터 차례로)')}</p>`}
    <p class="note sm">공공데이터포털 폐쇄말소대장 원문 — 층은 표제부 번호로, 전용면적은 호 번호로 이었습니다(코드).</p>`;

  const 거래탭UI = 거래수 ? `<div class="apick tpick">${['매매', '전세', '월세'].map(k =>
      `<button type="button" class="achip" data-ctrade="${k}" aria-selected="${폐쇄거래탭 === k}">${k}<b>${fmt(종수(k))}</b></button>`).join('')}</div>` : '';
  /* 2026-10-23 사장님 "123 너가 ㄱㄱ" — 이 지번의 공동주택가격(VWorld NED). 연도별: 공시된 호 수 · 최저~최고(원문 값). 평균·중위는 안 낸다(정책).
     동을 누르면 그 동(NED 원문 동명)의 호마다 연도별 값. ★ 대장의 동과 잇지 않는다 — 이름이 같아 보여도 다른 자료다. */
  const 공 = r.공시 || { 연도: [], 동: [], 받음: null };
  const 억원 = v => { if (v == null) return '—'; const a = Math.floor(v / 1e8), b = Math.round((v % 1e8) / 1e4); return a ? `${a}억${b ? ' ' + fmt(b) : ''}` : `${fmt(b)}만`; };
  const 공시칸 = 공.연도.length ? `${sect('공시가격 (공동주택가격)', '주택가격', ` ${fmt(공.연도.length)}회`)}
    <p class="note sm">대장이 닫힌 해(${esc(String(s.shter_day || '').slice(0, 4))})까지의 공시 · 원문 최저~최고${공.연도.some(y => y.이름수 > 1) ? '' : ` 원문 공동주택명: ${esc(공.연도[0].이름 || '—')}`}</p>
    <table><thead><tr><th>기준</th><th class="n">공시된 호</th><th class="n">최저</th><th class="n">최고</th></tr></thead><tbody>
      ${공.연도.map(y => `<tr><td>${esc(y.기준연도)}${y.기준월 && y.기준월 !== '01' ? '.' + esc(y.기준월) : ''}</td><td class="n">${fmt(y.호)}</td><td class="n">${억원(y.최저)}</td><td class="n">${억원(y.최고)}</td></tr>`).join('')}
    </tbody></table>
    ${공.동.length ? `<div class="lt2">동을 고르면 호마다 연도별 값 <span class="muted">(NED 원문 동명)</span></div>
      <div class="apick">${공.동.map(d => `<button type="button" class="achip" data-cned="${esc(d.동)}" aria-selected="${폐쇄공시동 === d.동}">${esc(d.동 || '(동명 없음)')}<b>${fmt(d.호)}</b></button>`).join('')}</div>
      <div id="cnedbox">${폐쇄공시동 != null && 폐쇄공시줄 && 폐쇄공시줄.동 === 폐쇄공시동 ? 공시호표(폐쇄공시줄.줄, 억원) : ''}</div>` : ''}`
    : (공.받음 ? `<p class="note sm">${gapCell('', 'EMPTY', '이 지번에 대장이 닫히기 전 해의 공동주택가격 공시가 없습니다(VWorld 원문 · 공시는 2006년부터)')}</p>`
               : `<p class="note sm">${gapCell('', 'SCOPE', '이 지번의 공동주택가격(VWorld)을 아직 받는 중입니다')}</p>`);
  const paneP = `${거래수 ? `<p class="note sm">대장이 닫힌 ${esc(날(s.shter_day))} 이전 계약(헐리기 전 건물)${
        (r.옛거래.셈 || []).filter(z => z.때 === '전').map(z => z.이름 ? ` · 신고 이름 ${esc(z.이름)} <span class="muted">(참고)</span>` : '').join('')}</p>` : ''}
    ${거래탭UI}
    ${tradeList(거래, 폐쇄거래탭, null)}
    ${옛거래칸(r.옛거래, s, ['뒤'])}
    ${(r.분양권 || []).length ? sect('이 자리 사업의 분양권·입주권', 'rtms', ` ${fmt(분양권수)}`)
      + 분양권칸({ ...r, 공고: [], 분양권말: `대장이 닫힌 ${esc(날(s.shter_day))} 이후 이 지번 계약(새로 짓는 사업의 권리) · 신고 이름 ${esc([...new Set(r.분양권.map(x => x.이름).filter(Boolean))].slice(0, 3).join(', ') || '—')} <span class="muted">(참고)</span>` }) : ''}
    ${거래수 || (r.분양권 || []).length || (r.옛거래.셈 || []).length ? '' : `<p class="note">${gapCell('', 'NA', '이 지번으로 신고된 실거래 중 단지에 안 붙은 것이 없습니다')}</p>`}
    ${공시칸}`;

  const paneL = `${r.이력 ? `<div class="lt2">이 필지의 토지 이동 이력 <span class="muted">(VWorld 토지이동이력 원문 · ${esc(날짜(r.이력.받은시각, ''))} 받음)</span></div>
      ${r.이력.줄.length ? `<ul class="lu">${r.이력.줄.slice(0, 12).map(z => `<li><b>${esc(z.이동일 ? 날짜(z.이동일) : '날짜 없음')}</b> <span>${esc(z.이동사유 || '')}</span>
        <span class="muted">${esc([z.지번, z.지목, z.면적 != null ? Number(z.면적) + '㎡' : null].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`
        : '<p class="note sm">이 필지로 된 토지 이동 이력이 없습니다.</p>'}` : `<p class="note">${gapCell('', 'SCOPE', '이 필지의 토지 이동 이력을 아직 받지 않았습니다')}</p>`}
    ${r.필지 ? '' : `<p class="note sm">${s.lat != null ? (s.위치근거 && s.위치근거 !== '필지 중심' ? `이 필지는 지금 지적도에 없어 <b>${esc(s.위치근거)}</b>에 점을 찍었습니다(그 필지 경계가 아닙니다).` : '필지 경계를 받지 못해 자리만 찍었습니다.') : '그 필지가 지금은 없어서(합필·분필) 지도에 아무것도 그리지 않았습니다.'}</p>`}`;

  box.innerHTML = `<span class="pill cl">폐쇄·말소 대장</span>
    <h2>${esc(s.이름 || s.plat_plc || s.pnu)}</h2>
    <p class="sub">${esc(s.plat_plc || '')}${s.new_plat_plc ? '<br>' + esc(s.new_plat_plc) : ''}</p>
    <div class="tabs">${TABS.map(([k, label]) => `<button type="button" class="tab" data-ctab="${k}" aria-selected="${k === 폐쇄탭}">${label}</button>`).join('')}</div>
    <div class="pane">${({ info: paneI, dong: paneD, price: paneP, land: paneL })[폐쇄탭] || paneI}</div>`;

  const 다시 = () => 폐쇄그리기();
  box.querySelectorAll('[data-ctab]').forEach(b => b.addEventListener('click', () => { 폐쇄탭 = b.dataset.ctab; 다시(); }));
  box.querySelectorAll('[data-cdong-all]').forEach(b => b.addEventListener('click', () => { 폐쇄동다 = true; 다시(); }));
  box.querySelectorAll('[data-cned]').forEach(b => b.addEventListener('click', async () => {
    const 동 = b.dataset.cned; 폐쇄공시동 = 동; 폐쇄공시줄 = null; 다시();
    try { const j = await fetch(`/api/closed/site/${encodeURIComponent(m.key)}/ned?dong=${encodeURIComponent(동)}`).then(x => x.json());
      if (폐쇄공시동 === 동) { 폐쇄공시줄 = { 동, 줄: j.줄 || [] }; 다시(); } } catch (e) { toast('공시가격을 못 불러왔습니다', 4000); }
  }));
  box.querySelectorAll('[data-ctrade]').forEach(b => b.addEventListener('click', () => { 폐쇄거래탭 = b.dataset.ctrade; 거래Shown = 10; 다시(); }));
  box.querySelectorAll('[data-trade-more]').forEach(b => b.addEventListener('click', () => { 거래Shown += 10; 다시(); }));
  box.querySelectorAll('[data-ho-dong]').forEach(b => b.addEventListener('click', () => { hoDong = b.dataset.hoDong; 다시(); }));
  box.querySelectorAll('[data-ho-flr]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.hoFlr; hoFloor = (v === '' || String(hoFloor) === v) ? null : Number(v); 다시(); }));
  box.querySelectorAll('[data-ho-area]').forEach(b => b.addEventListener('click', () => { hoArea = b.dataset.hoArea || null; hoAreaX = null; 다시(); }));
  box.querySelectorAll('[data-ho-ax]').forEach(b => b.addEventListener('click', () => { hoAreaX = b.dataset.hoAx || null; 다시(); }));
}

/* ---------------- 정비사업 구역 경계 (2026-10-22, 사장님 "재개발 부분을 누르면 그 폴리곤") ----------------
   토지 탭 '정비사업 구역' 줄을 누르면 그 구역 경계를 지도에 그리고 맞춘다. 다시 누르면 지운다. 단지를 바꾸거나 닫으면 지운다.
   ★ 겹쳐 보기('정비')와 같은 표(silver.redev_zone)다 — 다른 경계가 아니다. */
let 구역층 = null, 구역지금 = null;
function 구역지우기() {
  if (구역층) { try { map.removeLayer(구역층); } catch (e) {} }
  구역층 = null; 구역지금 = null;
  document.querySelectorAll('#detail [data-redev].on, #detail [data-lushape].on, #detail [data-clsite].on, #detail [data-hzone].on').forEach(el => el.classList.remove('on'));
}
/* ★ 2026-10-24 10:44 사장님 "어린이집 · 유치원 · 상권도 자세히 · 모달로" — 학교 상세와 같은 그릇(#homodal · .sbox). 원문 값 그대로. */
function 모달열기(html) { const el = $('#homodal'); el.innerHTML = `<div class="hm-box sbox">${html}</div>`; el.classList.add('on'); }
const 모달머리 = (이름, 보조) => `<div class="hm-h">${esc(이름 || '')} <span>${esc(보조 || '')}</span><button type="button" class="hm-x" data-ho-close>닫기</button></div>`;
const 모달표 = (머리, 줄들) => !줄들.length ? '' : `<table class="hm-t"><thead><tr>${머리.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  줄들.map(r => `<tr>${r.map((v, i) => `<td${i ? ' class="n"' : ''}>${v == null || v === '' ? '—' : (typeof v === 'number' ? fmt(v) : esc(String(v)))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const 모달줄 = (k, v) => v == null || v === '' ? '' : `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
const 모달링크 = u => { const t = String(u || '').trim(); return /^https?:\/\//.test(t) ? `<a href="${esc(t)}" target="_blank" rel="noopener">${esc(t.replace(/^https?:\/\//, ''))}</a>` : (t ? esc(t) : ''); };
async function 모달받기(url, 무엇) {
  모달열기(`<div class="hm-h">불러오는 중…</div>`);
  try { const r = await fetch(url); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || '불러오지 못했습니다'); return d; }
  catch (e) { 모달열기(`${모달머리(무엇)}<p class="note">${esc(e.message || '불러오지 못했습니다')}</p>`); return null; }
}
const 수칸 = v => { if (v == null) return null; const t = String(v).replace(/[^0-9.]/g, ''); return t === '' ? null : Number(t); };   /* 원문이 '5개' · '2명' 처럼 단위를 달고 올 때가 있다 */
const 공시차수말 = t => { const s = String(t || ''); return /^\d{5}$/.test(s) ? `${s.slice(0, 4)}년 ${s.slice(4)}차 공시` : (s || ''); };

async function 유치원상세(code) {
  const d = await 모달받기(`/api/kinder/${encodeURIComponent(code)}${selected ? `?cid=${encodeURIComponent(selected)}` : ''}`, '유치원 상세');
  if (!d) return;
  const k = d.유치원 || {}, h = d.항목 || {};
  const b = h.basicInfo2 || {}, t = h.teachersInfo || {}, y = h.yearOfWork || {}, bd = h.building || {}, ca = h.classArea || {},
        bus = h.schoolBus || {}, sf = h.safetyEdu || {}, ml = h.schoolMeal || {}, ev = h.environmentHygiene || {}, ld = h.lessonDay || {}, af = h.afterSchoolPresent || {};
  const 연령 = [['만3세', 'clcnt3', 'ag3fpcnt', 'ppcnt3'], ['만4세', 'clcnt4', 'ag4fpcnt', 'ppcnt4'], ['만5세', 'clcnt5', 'ag5fpcnt', 'ppcnt5'],
               ['혼합', 'mixclcnt', 'mixfpcnt', 'mixppcnt'], ['특수', 'shclcnt', 'spcnfpcnt', 'shppcnt']]
    .map(([n, c, f, p]) => [n, 수칸(b[c]), 수칸(b[f]), 수칸(b[p])]).filter(r => r.slice(1).some(v => v));
  const 교원 = [['원장', 'drcnt'], ['원감', 'adcnt'], ['수석교사', 'hdst_thcnt'], ['보직교사', 'asps_thcnt'], ['일반교사', 'gnrl_thcnt'], ['특수교사', 'spcn_thcnt'],
               ['보건교사', 'ntcnt'], ['영양교사', 'ntrt_thcnt'], ['기간제교사·강사', 'shcnt_thcnt'], ['직원', 'owcnt']]
    .map(([n, f]) => [n, 수칸(t[f])]).filter(r => r[1]);
  const 자격 = [['정교사 1급', 'rgth_gd1_qacnt'], ['정교사 2급', 'rgth_gd2_qacnt'], ['준교사', 'asth_qacnt'], ['수석교사', 'hdst_tchr_qacnt'], ['특수학교 정교사', 'spsc_tchr_qacnt'], ['보건교사', 'nth_qacnt'], ['영양교사', 'ntth_qacnt']]
    .map(([n, f]) => [n, 수칸(t[f])]).filter(r => r[1]);
  const 근속 = [['1년 미만', 'yy1_undr_thcnt'], ['1~2년', 'yy1_abv_yy2_undr_thcnt'], ['2~4년', 'yy2_abv_yy4_undr_thcnt'], ['4~6년', 'yy4_abv_yy6_undr_thcnt'], ['6년 이상', 'yy6_abv_thcnt']]
    .map(([n, f]) => [n, 수칸(y[f])]).filter(r => r[1] != null);
  const 점검 = [['놀이시설 안전검사', sf.plyg_ck_yn === 'Y' ? `${날짜(sf.plyg_ck_dt, '')} ${sf.plyg_ck_rs_cd || ''}` : (sf.plyg_ck_yn === 'N' ? '대상 아님' : '')],
               ['소방 대피훈련', sf.fire_avd_yn === 'Y' ? 날짜(sf.fire_avd_dt, '') : sf.fire_avd_yn], ['소방 안전점검', sf.fire_safe_yn === 'Y' ? 날짜(sf.fire_safe_dt, '') : sf.fire_safe_yn],
               ['가스 점검', sf.gas_ck_yn === 'Y' ? 날짜(sf.gas_ck_dt, '') : sf.gas_ck_yn], ['전기설비 점검', sf.elect_ck_yn === 'Y' ? 날짜(sf.elect_ck_dt, '') : sf.elect_ck_yn],
               ['실내공기질', ev.arql_chk_dt ? `${날짜(ev.arql_chk_dt, '')} ${ev.arql_chk_rslt_tp_cd || ''}` : ''], ['미세먼지', ev.mdst_chk_dt ? `${날짜(ev.mdst_chk_dt, '')} ${ev.mdst_chk_rslt_cd || ''}` : ''],
               ['조도', ev.ilmn_chk_dt ? `${날짜(ev.ilmn_chk_dt, '')} ${ev.ilmn_chk_rslt_cd || ''}` : ''], ['정기소독', ev.fxtm_dsnf_chk_dt ? `${날짜(ev.fxtm_dsnf_chk_dt, '')} ${ev.fxtm_dsnf_chk_rslt_tp_cd || ''}` : '']]
    .filter(r => r[1]);
  const 차수 = 공시차수말(b.pbnttmng || k.pbnt_tmng);
  모달열기(`${모달머리(k.kinder_nm, [k.establish].filter(Boolean).join(' · '))}
    <p class="hm-addr">${esc(k.addr || '')}${k.거리m != null ? ` · 이 단지에서 ${fmt(k.거리m)}m(직선)` : ''}</p>
    ${연령.length ? `<div class="lt2">반 · 정원 · 원아 <span class="muted">(${esc(차수)})</span></div>${모달표(['연령', '학급', '정원', '원아'], 연령)}
      <p class="note sm">인가 총정원 ${fmt(수칸(b.prmstfcnt) ?? k.cap_cnt)}명</p>` : ''}
    ${교원.length ? `<div class="lt2">교직원 <span class="muted">(직위별 · ${esc(공시차수말(t.pbnttmng))})</span></div>${모달표(['직위', '인원'], 교원)}` : ''}
    ${자격.length ? `<div class="lt2">교원 자격 <span class="muted">(자격 보유 수)</span></div>${모달표(['자격', '인원'], 자격)}` : ''}
    ${근속.length ? `<div class="lt2">교사 근속연수 <span class="muted">(${esc(공시차수말(y.pbnttmng))})</span></div>${모달표(['근속', '교사 수'], 근속)}` : ''}
    <div class="lt2">시설 · 운영</div>
    <dl class="ahkv">${[
      모달줄('운영시간', esc(k.oper_time || '')),
      /* 원문이 '2009년' · '지상1층/ 지하0층' 처럼 단위를 달고 온다 — 붙이지 않고 그대로 */
      /* 건물 · 교실면적은 원문이 단위를 달고 온다('2009년' · '지상1층/ 지하0층' · '5개' · '323㎡') — 글자 그대로 */
      모달줄('건물', [bd.archyy ? `건축 ${esc(bd.archyy)}` : '', bd.floorcnt ? esc(bd.floorcnt) : '', bd.bldgprusarea ? `건물 전용 ${esc(bd.bldgprusarea)}` : '', bd.grottar ? `대지 ${esc(bd.grottar)}` : ''].filter(Boolean).join(' · ')),
      모달줄('교실', [ca.crcnt ? esc(ca.crcnt) : '', ca.clsrarea ? esc(ca.clsrarea) : ''].filter(Boolean).join(' · ')),
      모달줄('체육장', ca.phgrindrarea ? esc(ca.phgrindrarea) : ''),
      모달줄('보건 · 조리 · 기타 공간', [ca.hlsparea ? `보건 ${esc(ca.hlsparea)}` : '', ca.ktchmssparea ? `조리 ${esc(ca.ktchmssparea)}` : '', ca.otsparea ? `기타 ${esc(ca.otsparea)}` : ''].filter(Boolean).join(' · ')),
      모달줄('통학차량', bus.vhcl_oprn_yn === 'Y' ? `운행 ${fmt(수칸(bus.opra_vhcnt))}대(신고 ${fmt(수칸(bus.dclr_vhcnt))}대)` : (bus.vhcl_oprn_yn === 'N' ? '운행 안 함' : '')),
      모달줄('CCTV', sf.cctv_ist_yn === 'Y' ? `${fmt(수칸(sf.cctv_ist_total))}대(안 ${fmt(수칸(sf.cctv_ist_in))} · 밖 ${fmt(수칸(sf.cctv_ist_out))})` : (sf.cctv_ist_yn === 'N' ? '없음' : '')),
      모달줄('급식', [ml.mlsr_oprn_way_tp_cd, 수칸(ml.mlsr_kpcnt) != null ? `급식 원아 ${fmt(수칸(ml.mlsr_kpcnt))}명` : '', ml.ntrt_tchr_agmt_yn === 'Y' ? '영양교사 배치' : ''].filter(Boolean).map(esc).join(' · ')),
      모달줄('방과후 과정', [수칸(af.inor_clcnt) ? `독립편성 ${fmt(수칸(af.inor_clcnt))}학급` : '', 수칸(af.pm_rrgn_clcnt) ? `오후재편성 ${fmt(수칸(af.pm_rrgn_clcnt))}학급` : '', af.oper_time || ''].filter(Boolean).map(esc).join(' · ')),
      모달줄('수업일수', [수칸(ld.ag5_lsn_dcnt) ? `만5세 ${fmt(수칸(ld.ag5_lsn_dcnt))}일` : '', 수칸(ld.afsc_pros_lsn_dcnt) ? `방과후 ${fmt(수칸(ld.afsc_pros_lsn_dcnt))}일` : ''].filter(Boolean).join(' · ')),
      모달줄('설립일', k.est_date ? esc(날짜(k.est_date)) : ''), 모달줄('개원일', k.open_date ? esc(날짜(k.open_date)) : ''),
      모달줄('전화', esc(k.tel_no || '')), 모달줄('홈페이지', 모달링크(k.hp_addr)),
    ].join('')}</dl>
    ${점검.length ? `<div class="lt2">안전 · 위생 점검 <span class="muted">(점검일 · 결과 원문)</span></div>${모달표(['항목', '점검'], 점검)}` : ''}
    ${!Object.keys(h).length ? `<p class="note sm">${gapCell('', 'SCOPE', '이 유치원의 공시 상세 항목을 아직 받지 않았습니다')}</p>` : ''}
    <p class="srcline">${esc(d.출처)} · 항목마다 공시 차수가 다를 수 있습니다</p>`);
}

async function 어린이집상세(st) {
  const d = await 모달받기(`/api/childcare/${encodeURIComponent(st)}${selected ? `?cid=${encodeURIComponent(selected)}` : ''}`, '어린이집 상세');
  if (!d) return;
  const c = d.어린이집 || {};
  모달열기(`${모달머리(c.이름, [c.유형, c.상태 && c.상태 !== '정상' ? c.상태 : ''].filter(Boolean).join(' · '))}
    <p class="hm-addr">${esc(c.주소 || '')}${c.거리m != null ? ` · 이 단지에서 ${fmt(c.거리m)}m(직선)` : ''}</p>
    <div class="hm-s"><b>정원 ${fmt(c.정원)} · 현원 ${fmt(c.현원)}</b><span class="muted">${d.대기합 != null ? `입소대기 ${fmt(d.대기합)}명 · ` : ''}기준일 ${esc(날짜(c.기준일, ''))}</span></div>
    ${d.연령.length ? `<div class="lt2">연령별 반 · 아동</div>${모달표(['연령', '반', '아동'], d.연령.map(x => [x.이름, x.반, x.아동]))}
      <p class="note sm">합계(원문) 반 ${fmt(d.반합)} · 아동 ${fmt(d.아동합)}</p>` : ''}
    ${d.대기.some(x => x.수) ? `<div class="lt2">입소대기 아동 <span class="muted">(원문)</span></div>${모달표(['나이', '대기'], d.대기.filter(x => x.수 != null).map(x => [x.이름, x.수]))}` : ''}
    ${d.교직원.length ? `<div class="lt2">보육교직원</div>${모달표(['직종', '인원'], d.교직원.map(x => [x.이름, x.수]))}
      <p class="note sm">총계(원문) ${fmt(d.교직원합)}명 — 직종별 합과 다를 수 있습니다(원문 목록에 없는 직종)</p>` : ''}
    ${d.근속.length ? `<div class="lt2">교직원 근속연수 <span class="muted">(원문 값 · 비율 %)</span></div>${모달표(['근속', '%'], d.근속.map(x => [x.이름, x.비율]))}` : ''}
    <div class="lt2">시설 · 운영</div>
    <dl class="ahkv">${[
      모달줄('보육실', [c.보육실수 != null ? `${fmt(c.보육실수)}실` : '', c.보육실면적 != null ? `${fmt(c.보육실면적)}㎡` : ''].filter(Boolean).join(' · ')),
      모달줄('놀이터', c.놀이터수 != null ? `${fmt(c.놀이터수)}곳` : ''),
      모달줄('CCTV', c.CCTV수 != null ? `${fmt(c.CCTV수)}대` : ''),
      모달줄('통학차량', esc(c.통학차량 || '')),
      모달줄('제공 서비스', esc(c.제공서비스 || d.특성 || '')),
      모달줄('인가일', c.인가일 ? esc(날짜(c.인가일)) : ''),
      모달줄('휴지', c.휴지시작 ? `${esc(날짜(c.휴지시작))} ~ ${esc(날짜(c.휴지끝, ''))}` : ''),
      모달줄('전화', esc(c.전화 || '')), 모달줄('홈페이지', 모달링크(c.홈페이지)),
    ].join('')}</dl>
    <p class="srcline">${esc(d.출처)} · 칸 이름은 data.go.kr 15101154 출력 목록 기준</p>`);
}

async function 점포목록(items, 이름) {
  if (!selected) return;
  const d = await 모달받기(`/api/complexes/${encodeURIComponent(selected)}/poi-list?life=${encodeURIComponent(items)}`, `${이름} 점포`);
  if (!d) return;
  const L = d.점포 || [];
  const 묶 = new Map(); for (const x of L) (묶.get(x.항목) || 묶.set(x.항목, []).get(x.항목)).push(x);
  모달열기(`${모달머리(`${이름} 점포`, '1km 안 · 가까운 순')}
    ${[...묶.entries()].map(([항, xs]) => `<div class="lt2">${esc(항)} <span class="muted">1km 안 ${fmt(xs[0].전체)}곳 · 500m 안 ${fmt(xs[0].전체500)}곳</span></div>
      ${모달표(['이름', '층', '거리'], xs.map(x => [[x.이름, x.지점].filter(Boolean).join(' ') + (x.단지안 ? ' (단지 안)' : ''), x.층 || '', `${fmt(x.거리m)}m`]))}
      ${Number(xs[0].전체) > xs.length ? `<p class="note sm">가까운 ${fmt(xs.length)}곳만 보입니다 — ${fmt(xs[0].전체)}곳 중</p>` : ''}`).join('')}
    ${!L.length ? `<p class="note">${gapCell('', 'NA', '1km 안에 이 묶음의 점포가 없습니다')}</p>` : ''}
    <p class="srcline">${esc(d.출처)} · 상권 칸과 같은 자료 · 거리는 단지 중심점에서 직선</p>`);
}
document.addEventListener('click', e => {
  const k = e.target.closest('[data-kinder]'), c = e.target.closest('[data-ccone]'), p = e.target.closest('[data-poilist]');
  if (!k && !c && !p) return;
  e.preventDefault(); e.stopPropagation();
  if (k) 유치원상세(k.dataset.kinder);
  else if (c) 어린이집상세(c.dataset.ccone);
  else 점포목록(p.dataset.poilist, p.dataset.poinm || '');
});
/* ★ 2026-10-24 10:36 사장님 "학교나 그 외 상세는 모달로" — 학교 상세 모달(호 상세와 같은 그릇 #homodal).
   위치표준 · 학교알리미 · 학구도 세 출처를 칸마다 밝힌다. 값은 원문 그대로(나눗셈 없음 — 학급당 · 1인당도 공시값). */
async function 학교상세(sid) {
  const el = $('#homodal');
  el.innerHTML = `<div class="hm-box sbox"><div class="hm-h">불러오는 중…</div></div>`;
  el.classList.add('on');
  let d;
  try {
    const r = await fetch(`/api/school/${encodeURIComponent(sid)}${selected ? `?cid=${encodeURIComponent(selected)}` : ''}`);
    d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || '불러오지 못했습니다');
  } catch (e) {
    el.innerHTML = `<div class="hm-box sbox"><div class="hm-h">학교 상세<button type="button" class="hm-x" data-ho-close>닫기</button></div>
      <p class="note">${esc(e.message || '불러오지 못했습니다')}</p></div>`;
    return;
  }
  const b = d.학교 || {}, 연 = d.연도 || [], 동 = d.전출입 || [], 구 = d.구역 || [];
  const 최근 = 연[0];
  const 줄 = (k, v) => v == null || v === '' ? '' : `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const 남녀 = v => v === '남' ? '남학교' : v === '여' ? '여학교' : v;
  const 링크 = u => { const t = String(u || '').trim(); return /^https?:\/\//.test(t) ? `<a href="${esc(t)}" target="_blank" rel="noopener">${esc(t.replace(/^https?:\/\//, ''))}</a>` : (t ? esc(t) : ''); };
  const 구역말 = { E: '초등 통학구역', M: '중학교 학교군', H: '고등학교 학군' };
  const 없음 = !b.schul_code
    ? `<p class="note sm">${gapCell('', 'UNSURE', '학교알리미 공시와 코드로 잇지 못했습니다 — 학생 · 교사 수가 없습니다(이름으로는 잇지 않습니다)')}</p>` : '';
  el.innerHTML = `<div class="hm-box sbox">
    <div class="hm-h">${esc(b.school_nm || '학교')} <span>${esc([b.school_se, b.fond_type, b.고교종류].filter(Boolean).join(' · '))}</span>
      <button type="button" class="hm-x" data-ho-close>닫기</button></div>
    <p class="hm-addr">${esc(b.rdnmadr || b.road_addr || '')}${b.lnmadr ? ` · ${esc(b.lnmadr)}` : ''}${b.거리m != null ? ` · 이 단지에서 ${fmt(b.거리m)}m(직선)` : ''}</p>

    ${최근 && 연.length === 1 ? `<div class="hm-s"><b>학생 ${fmt(최근.학생)}명</b><span class="muted">학급 ${fmt(최근.학급)} · 학급당 ${esc(String(최근.학급당 ?? '—'))}명 · 교사 ${fmt(최근.교사)} · 수업교원 1인당 ${esc(String(최근.교사당 ?? '—'))}명 · ${esc(String(최근.공시연도))}년 공시</span></div>` : 최근 ? '' : 없음}
    ${/* 연도별 표가 있으면 머리 요약을 안 둔다 — 첫 줄(최근 공시)과 같은 숫자를 두 번 보이지 않게 */''}
    ${연.length > 1 ? `<div class="lt2">학생 · 학급 · 교사 <span class="muted">(학교알리미 공시 · 최근 3년만)</span></div>
      <table class="hm-t"><thead><tr><th>공시연도</th><th class="n">학생</th><th class="n">학급</th><th class="n">학급당</th><th class="n">교사</th><th class="n">교원 1인당</th></tr></thead><tbody>
      ${연.map(x => `<tr><td>${esc(String(x.공시연도))}</td><td class="n">${fmt(x.학생)}</td><td class="n">${fmt(x.학급)}</td><td class="n">${esc(String(x.학급당 ?? '—'))}</td><td class="n">${fmt(x.교사)}</td><td class="n">${esc(String(x.교사당 ?? '—'))}</td></tr>`).join('')}
      </tbody></table>` : ''}

    ${(d.학년 || []).length ? `<div class="lt2">학년별 <span class="muted">(${esc(String(d.학년공시 || ''))}년 공시)</span></div>
      <table class="hm-t"><thead><tr><th>학년</th><th class="n">학생</th><th class="n">학급</th><th class="n">학급당</th></tr></thead><tbody>
      ${d.학년.map(x => `<tr><td>${esc(x.이름)}</td><td class="n">${fmt(x.학생)}</td><td class="n">${fmt(x.학급)}</td><td class="n">${esc(String(x.학급당 ?? '—'))}</td></tr>`).join('')}
      </tbody></table>` : ''}

    ${동.length ? `<div class="lt2">전입 · 전출 <span class="muted">(그 공시연도 학년도 중 이 학교로 오고 간 학생)</span></div>
      <table class="hm-t"><thead><tr><th>공시연도</th><th class="n">전입</th><th class="n">전출</th></tr></thead><tbody>
      ${동.map(x => `<tr><td>${esc(String(x.공시연도))}</td><td class="n">${fmt(x.전입)}</td><td class="n">${fmt(x.전출)}</td></tr>`).join('')}
      </tbody></table>` : ''}

    ${구.length ? `<div class="lt2">이 학교를 받는 구역 <span class="muted">(학구도 · 학교학구도연계정보)</span></div>
      ${구.map(z => `<div class="zrow2 hzone" role="button" tabindex="0" data-hzone="${esc(z.종류)}|${esc(z.hakgudo_id)}" data-hzclose="1">
        <span class="zt">${esc(구역말[z.종류] || '')}</span><b>${esc(z.이름 || '')}</b>${Number(z.공동) ? ' <span class="zb">공동</span>' : ''}
        <span class="muted sm">· 학교 ${fmt(z.학교수)}곳 · 구역 안 세대 있는 단지 ${fmt(z.단지)}곳${z.세대 ? ` · ${fmt(z.세대)}세대` : ''}</span><span class="hzgo">지도에 보기</span></div>`).join('')}
      <p class="note sm">구역 안 단지 = 대장 세대가 있는 단지 중 중심점이 구역 경계 안(교육 탭과 같은 판정 · 단독주택처럼 세대가 안 적힌 건물은 안 셈) · 기준일 ${esc(날짜((구[0] || {}).기준일, ''))}</p>`
      : `<p class="note sm">${gapCell('', 'NA', b.school_se === '고등학교' ? '학군 배정 대상이 아닌 학교입니다(특목 · 자율 · 특성화 등 — 연계표에 구역이 없음)' : '연계표에 이 학교를 받는 구역이 없습니다')}</p>`}

    <div class="lt2">기본</div>
    <dl class="ahkv">${[
      줄('설립', esc([b.fond_type || b.fond_sc, b.설립유형].filter(Boolean).join(' · '))),
      줄('남녀', esc(남녀(b.coedu) || '')),
      줄('주야', esc(b.주야 || '')),
      줄('설립일', b.fond_ymd ? esc(날짜(b.fond_ymd)) : ''),
      줄('개교일', b.개교 ? esc(날짜(b.개교)) : ''),
      줄('교육지원청', esc(b.edc_sport_nm || '')),
      줄('홈페이지', 링크(b.hmpg)),
    ].join('')}</dl>
    <p class="srcline">위치 · 이름: ${esc(d.출처.위치)} · 학생 · 교사: ${esc(d.출처.공시)}${b.schul_code ? `(학교 코드 규칙으로 이음 — ${esc(b.이음근거 || '')})` : ''} · 구역: ${esc(d.출처.구역)}</p>
  </div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-school]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  학교상세(b.dataset.school);
});
/* 모달 안 구역 줄 → 모달 닫고 지도에 경계 */
document.addEventListener('click', e => {
  const z = e.target.closest('#homodal [data-hzone]');
  if (!z) return;
  $('#homodal').classList.remove('on');
  if (폰() && document.querySelector('.app').dataset.sheet === 'full') 시트('half');
}, true);
/* ★ 2026-10-24 사장님 "학구도를 클릭하면 지도에 표시" — 교육 탭 통학구역 · 학교군 줄 → 그 경계 + 그 구역 학교 점.
   정비구역 · 토지이용과 같은 층(한 번에 하나 · 다시 누르면 지움). 초록 — 정비(주황) · 토지이용(보라)과 갈리게. */
async function 학구보이기(el) {
  const [k, id] = String(el.dataset.hzone || '').split('|');
  const 키 = `hz:${k}:${id}`;
  if (구역지금 === 키) { 구역지우기(); return; }
  구역지우기();
  try {
    const x = await fetch(`/api/schoolzone/${encodeURIComponent(k)}/${encodeURIComponent(id)}`);
    const f = await x.json();
    if (!x.ok || f.error) { toast(f.error || '경계를 불러오지 못했습니다 — 없다는 뜻이 아닙니다', 3000); return; }
    const 면 = L.geoJSON(f, { interactive: false, style: { color: '#15803d', weight: 4, fillColor: '#22c55e', fillOpacity: 0.22 } });
    const 점 = (f.학교 || []).map(s => L.circleMarker([Number(s.lat), Number(s.lon)], { radius: 6, weight: 2, color: '#15803d', fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(esc(s.이름 || ''), { permanent: true, direction: 'top', className: 'hztip', offset: [0, -6] }));
    구역층 = L.featureGroup([면, ...점]).addTo(map);
    구역지금 = 키; el.classList.add('on');
    const b = 면.getBounds();
    const top = (document.querySelector('.ptop') || {}).offsetHeight || 0;
    const sh = 폰() ? ((document.querySelector('#psheet') || {}).offsetHeight || 0) : 0;
    if (폰() && document.querySelector('.app').dataset.sheet === 'full') 시트('half');
    const 맞춤 = () => map.fitBounds(b, { paddingTopLeft: [24, (폰() ? top : 0) + 24], paddingBottomRight: [24, sh + 24], maxZoom: 17 });
    setTimeout(맞춤, 폰() ? 280 : 0);
    /* 단지를 막 연 직후에는 단지 맞춤(외곽선 도착)이 뒤에 와서 덮는다 — 아직 이 구역을 보고 있고 경계가 화면에 다 안 들어 있으면 한 번 더 */
    setTimeout(() => { if (구역지금 === 키 && !map.getBounds().contains(b)) 맞춤(); }, 1200);
    const p = f.properties || {};
    toast(`${esc(p.이름 || '')} — ${esc(p.종류 || '')}${Number(p.공동) ? ' · 공동' : ''} · 학교 ${fmt((f.학교 || []).length)}곳 (학구도 기준일 ${esc(날짜(p.기준일, ''))})`, 3000);
  } catch (e) { toast('경계를 불러오지 못했습니다 — 없다는 뜻이 아닙니다', 2500); }
}
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('#detail [data-hzone], #homodal [data-hzone]');
  if (el) 학구보이기(el);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('#detail [data-hzone]');
  if (el) { e.preventDefault(); 학구보이기(el); }
});
/* 토지이용계획 줄 → 구역 경계 (2026-10-22). 정비구역과 같은 층 · 같은 토글(한 번에 하나) */
async function 토지구역보이기(el) {
  const [code, nm] = String(el.dataset.lushape || '').split('|');
  const cid = (el.closest('.lubox') || {}).dataset?.lu;
  const 키 = `lu:${cid}:${code}`;
  if (구역지금 === 키) { 구역지우기(); return; }
  구역지우기();
  toast('구역 경계를 받는 중…', 1500);
  try {
    const x = await fetch(`/api/complexes/${encodeURIComponent(cid)}/landuse-shape?code=${encodeURIComponent(code)}&nm=${encodeURIComponent(nm || '')}`);
    const r = await x.json();
    if (!x.ok || r.error) { toast(r.error || '구역 경계를 불러오지 못했습니다 — 없다는 뜻이 아닙니다', 3000); return; }
    if (!(r.구역 || []).length) { toast(r.말 || '경계를 찾지 못했습니다', 3000); return; }
    구역층 = L.geoJSON({ type: 'FeatureCollection', features: r.구역 }, { interactive: false,
      style: { color: '#7c3aed', weight: 3, dashArray: '6 4', fillOpacity: 0.12 } }).addTo(map);   /* 보라 — 동 경계(파랑)·정비구역(주황)과 갈리게 */
    구역지금 = 키; el.classList.add('on');
    const b = 구역층.getBounds();
    const top = (document.querySelector('.ptop') || {}).offsetHeight || 0;
    const sh = 폰() ? ((document.querySelector('#psheet') || {}).offsetHeight || 0) : 0;
    if (폰() && document.querySelector('.app').dataset.sheet === 'full') 시트('half');
    setTimeout(() => map.fitBounds(b, { paddingTopLeft: [24, (폰() ? top : 0) + 24], paddingBottomRight: [24, sh + 24], maxZoom: 17 }), 폰() ? 280 : 0);
    const 고시 = [...new Set(r.구역.map(f => f.properties.고시연도).filter(Boolean))].sort().join('·');
    toast(`${nm} — 경계 ${r.구역.length}개${고시 ? ` · 고시 ${고시}년` : ''} (VWorld${r.출처 === '미리 받음' && r.받은시각 ? ` · ${날짜(r.받은시각)} 받음` : ''})`, 3000);
  } catch (e) { toast('구역 경계를 불러오지 못했습니다 — 없다는 뜻이 아닙니다', 2500); }
}
document.addEventListener('click', e => {
  const el = e.target.closest('#detail [data-lushape]');
  if (el) 토지구역보이기(el);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('#detail [data-lushape]');
  if (el) { e.preventDefault(); 토지구역보이기(el); }
});
async function 구역보이기(sn, el) {
  if (구역지금 === sn) { 구역지우기(); return; }
  구역지우기();
  try {
    const f = await fetch(`/api/redev/${encodeURIComponent(sn)}`).then(r => r.json());
    if (f.error) return 오류토스트('정비구역 경계', f);
    구역층 = L.geoJSON(f, { interactive: false,
      style: { color: css('--mark') || '#c2410c', weight: 2.5, dashArray: '6 4', fillOpacity: 0.12 } }).addTo(map);
    구역지금 = sn;
    if (el) el.classList.add('on');
    const b = 구역층.getBounds();
    const 맞춤 = () => {
      const top = (document.querySelector('.ptop') || {}).offsetHeight || 0;
      const sh = 폰() ? ((document.querySelector('#psheet') || {}).offsetHeight || 0) : 0;
      map.fitBounds(b, { paddingTopLeft: [24, (폰() ? top : 0) + 24], paddingBottomRight: [24, sh + 24], maxZoom: 17 });
    };
    if (폰() && document.querySelector('.app').dataset.sheet === 'full') {
      시트('half');
      setTimeout(() => { 맞춤(); try { el && el.scrollIntoView({ block: 'nearest' }); } catch (x) {} }, 280);   // 누른 줄이 시트 안에 보이게
    }
    else 맞춤();
    const p = f.properties || {};
    toast(`${p.zone_nm || '정비구역'}${p.stage ? ' — ' + p.stage : ''}${p.area ? ` · ${fmt(Math.round(p.area))}㎡` : ''}`, 2500);
  } catch (e) { toast('정비구역 경계를 불러오지 못했습니다', 2000); }
}
document.addEventListener('click', e => {
  const el = e.target.closest('#detail [data-redev]');
  if (el) 구역보이기(el.dataset.redev, el);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('#detail [data-redev]');
  if (el) { e.preventDefault(); 구역보이기(el.dataset.redev, el); }
});

/* ---------------- 정비사업 구역 상세 (2026-10-22, 사장님 "신길제2구역을 검색했을 때도 단지 상세처럼") ----------------
   검색 결과의 정비구역 줄 · 지도 구역 말풍선의 '구역 상세 보기' 로 연다. 왼쪽(폰은 시트)에 구역 개요 · 걸친 단지 · 구역 안 공고,
   지도에는 경계를 그리고 맞춘다. 단지 줄을 누르면 그 단지 상세로 간다. */
async function selectRedevZone(sn) {
  if (selected !== null || selectedKapt !== null) closeDetail();
  selectedRedev = sn;
  document.querySelectorAll('.row.rz').forEach(b => b.setAttribute('aria-current', String(b.dataset.redevzone === sn)));
  목록자동(true);
  const box = $('#detail');
  box.hidden = false;
  box.innerHTML = '<p class="muted">불러오는 중…</p>';
  시트('half');
  let d;
  try {
    d = await fetch(`/api/redev/${encodeURIComponent(sn)}/detail`).then(r => r.json());
    if (d.error) throw new Error(d.error);
  } catch (e) {
    if (selectedRedev === sn) box.innerHTML = `<p class="note">${gapCell('', 'UNSURE', '정비구역을 불러오지 못했습니다 — ' + (e.message || e))}</p>`;
    return;
  }
  if (selectedRedev !== sn) return;   // 그사이 다른 것을 열었다
  /* 경계 — 토지 탭 줄 누르기와 같은 층을 쓴다 */
  구역지우기();
  if (d.geometry) {
    구역층 = L.geoJSON({ type: 'Feature', geometry: d.geometry, properties: {} }, { interactive: false,
      style: { color: css('--mark') || '#c2410c', weight: 2.5, dashArray: '6 4', fillOpacity: 0.1 } }).addTo(map);
    구역지금 = sn;
    const b = 구역층.getBounds();
    setTimeout(() => {
      const top = 폰() ? ((document.querySelector('.ptop') || {}).offsetHeight || 0) : 0;
      const sh = 폰() ? ((document.querySelector('#psheet') || {}).offsetHeight || 0) : 0;
      map.fitBounds(b, { paddingTopLeft: [24, top + 24], paddingBottomRight: [24, sh + 24], maxZoom: 17 });
    }, 280);
  }
  box.innerHTML = 구역상세(d);
}
function 구역상세(d) {
  const z = d.구역 || {}, 단 = d.단지 || [], 공 = d.공고 || [];
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const 세대합 = 단.reduce((t, x) => t + (Number(x.포함률) >= 50 ? Number(x.세대) || 0 : 0), 0);
  const 날 = v => 날짜(v);   /* 원문이 'YYYY-MM-DD' 와 'YYYYMMDD' 둘 다 온다 — 날짜() 가 둘 다 받는다 */
  const 월 = v => 날짜(v);
  const 이름 = x => (x.이름 && x.주소 && x.이름 === x.주소 && x.실거래이름) ? x.실거래이름 : (shortNm(x.이름) || x.이름 || '(이름 없음)');
  return `
    <span class="pill">정비사업 구역</span>
    <h2>${esc(z.zone_nm || z.biz || '')}</h2>
    <p class="sub">${esc([z.biz, z.lclas].filter(Boolean).join(' · '))}</p>
    ${sect('구역 개요', 'redev')}
    <dl>
      ${row('추진단계', z.stage ? esc(z.stage) + (z.pct != null ? ` <span class="muted">· 진행 ${z.pct}%</span>` : '')
                                : gapCell('', 'EMPTY', `추진단계 코드 ${esc(z.cd || '')} 가 코드표에 없습니다`))}
      ${row('구역 면적', z.area ? fmt(Math.round(z.area)) + ' ㎡' : '—')}
      ${/* 2026-10-22 09:05 사장님 "임의로 계산해서 하는 건 하지 마" — 지금 건물·노후도도 뺐다. 원본에 있는 값만 보인다 */''}
      ${(() => { const p = d.계획; if (!p) return '';
          const 층 = String(p.층수 || '');
          const 층말 = /^\d+\/\d+$/.test(층) ? `지하 ${층.split('/')[0]} · 지상 ${층.split('/')[1]}층` : esc(층);
          return row('<b>정비계획</b>', `<span class="muted">${esc([p.소분류, p.추진단계].filter(Boolean).join(' · '))}</span>`)
            + (p.용적률 != null ? row('계획 용적률', `${Number(p.용적률)}%`) : '')
            + (p.건폐율 != null ? row('계획 건폐율', `${Number(p.건폐율)}%`) : '')
            + (층 ? row('층수', 층말 + (p.높이m != null ? ` <span class="muted">· 높이 ${Number(p.높이m)}m</span>` : '')) : '')
            + (p.공급세대 != null ? row('공급 세대', `${fmt(p.공급세대)}세대${p.분양세대 != null || p.임대세대 != null
                ? ` <span class="muted">· 분양 ${p.분양세대 != null ? fmt(p.분양세대) : '—'} · 임대 ${p.임대세대 != null ? fmt(p.임대세대) : '—'}${p.임대비율 != null ? ` (${Number(p.임대비율)}%)` : ''}</span>` : ''}`) : '')
            + (p.용도지역_후 ? row('용도지역', `${esc(p.용도지역_전 || '—')} → ${esc(p.용도지역_후)}`) : '')
            + (p.연면적 != null ? row('계획 연면적', `${fmt(Math.round(p.연면적))} ㎡`) : ''); })()}
      ${row('걸친 단지', `${fmt(단.length)}곳`)}
    </dl>
    ${sect('구역 안 청약 공고', 'applyhome0', 공.length ? ` ${fmt(공.length)}` : '')}
    ${공.length ? `<ul class="lu">${공.map(p => `<li${p.이은단지 ? ` data-goto="${p.이은단지}"` : ` data-ahhouse="${esc(p.house_manage_no)}" data-lat="${p.lat}" data-lng="${p.lng}"`} style="cursor:pointer">
        <b>${esc(p.house_nm || '')}</b><span class="muted"> ${esc(공고종류말[p.공고종류] || p.공고종류 || '')} · 모집공고 ${날(p.rcrit_pblanc_de)} · 입주예정 ${월(p.mvn_prearnge_ym)} · 공급 ${fmt(p.tot_suply || 0)}세대</span></li>`).join('')}</ul>`
      : `<p class="note">${gapCell('', 'NA', `공고 지번이 이 구역 안에 있는 청약홈 공고가 없습니다 (${범위말로()} 공고만 받았습니다)`)}</p>`}
    ${(d.분양권 || []).length ? sect('구역 안 분양권·입주권', 'rtms', ` ${fmt((Number(d.분양권수.건수) || 0) + (Number(d.분양권수.취소) || 0))}`)
      + 분양권칸({ ...d, 공고: [], 분양권말: `이 구역 경계와 겹치는 <b>지금 필지</b>의 지번으로 신고된 계약입니다(${날(d.분양권수.처음)} ~ ${날(d.분양권수.끝)}). 실거래 신고의 단지명: ${esc([...new Set(d.분양권.map(x => x.이름).filter(Boolean))].slice(0, 3).join(', ') || '—')} (참고로만 보입니다 — 이름으로 잇지 않습니다)` }) : ''}
    ${sect('구역에 걸친 단지', 'bld', ` ${fmt(단.length)}`)}
    ${/* 2026-10-22 사장님 "걸친 단지 10개씩, 더보기 누르면 10개씩 더" — 다 그려 두고 11번째부터 숨긴다(다시 받지 않는다) */''}
    ${단.length ? `<ul class="lu zcx">${단.map((x, i) => `<li data-goto="${x.complex_id}" style="cursor:pointer"${i >= 10 ? ' hidden' : ''}>
        <b>${esc(이름(x))}</b><span class="muted"> ${x.세대 ? fmt(x.세대) + '세대 · ' : ''}${x.동 ? fmt(x.동) + '동 · ' : ''}${x.사용승인 ? String(x.사용승인).slice(0, 4) + '년 · ' : ''}구역 안 ${Number(x.포함률).toFixed(0)}%${
          x.최고 ? ` · 3년 최고 ${eok(x.최고)}` : ''}</span></li>`).join('')}</ul>
      ${단.length > 10 ? `<button type="button" class="moreb" data-zcx-more>10개 더보기 <span class="muted">(10 / ${fmt(단.length)})</span></button>` : ''}`
      : `<p class="note">${gapCell('', 'NA', '이 구역과 겹치는 대장 단지가 없습니다')}</p>`}
    <p class="srcline">${esc(d.출처 || '')}${d.뺀단지 ? ` · 경계에 겨우 닿은(1% 미만) ${fmt(d.뺀단지)}곳은 뺐습니다` : ''}${d.계획 ? (String(d.계획.근거 || '').startsWith('코드') ? ' · 정비계획: 자치구·사업 소분류 코드·사업 면적이 모두 같은 후보 하나로 이음' : ` · 정비계획: 사업 위치 지번이 구역 안 · 면적 ${Number(d.계획.면적차pct)}% 차이로 이음`) : ' · 이어진 정비계획(서울플랜+) 없음'}</p>`;
}
document.addEventListener('click', e => {
  const z = e.target.closest('[data-redevzone]');
  if (z && !e.target.closest('#detail [data-redev]')) { e.preventDefault(); try { map.closePopup(); } catch (x) {} selectRedevZone(z.dataset.redevzone); return; }
  if (!selectedRedev) return;
  const mb = e.target.closest('#detail [data-zcx-more]');
  if (mb) {
    const 숨은 = [...document.querySelectorAll('#detail ul.zcx > li[hidden]')];
    숨은.slice(0, 10).forEach(li => { li.hidden = false; });
    const 전체 = document.querySelectorAll('#detail ul.zcx > li').length;
    const 보임 = 전체 - document.querySelectorAll('#detail ul.zcx > li[hidden]').length;
    if (보임 >= 전체) mb.remove(); else mb.innerHTML = `10개 더보기 <span class="muted">(${fmt(보임)} / ${fmt(전체)})</span>`;
    return;
  }
  const g = e.target.closest('#detail [data-goto]');
  if (g) { select(Number(g.dataset.goto)); return; }
  const h = e.target.closest('#detail [data-ahhouse]');
  if (h) { 시트('half'); 분양핀열기(h.dataset.ahhouse, [Number(h.dataset.lat), Number(h.dataset.lng)]); }
});

/* ---- 내 정보 (313, 2026-10-22) — 관심 단지 · 알림함(사이트 안 수신함) · 내 문의 · 내 AI 질문 ----
   ★ 회원가입은 보류(사장님) — 있는 계정으로 로그인만. ★ 남이 쓴 글(답변 포함)은 전부 esc.
   (관심 Set 은 위 로그인 칸 옆에 둔다 — 상세 그리기가 먼저 읽을 수 있어서) */
async function 배지새로() {
  const t = 토큰(), b = $('#mybadge');
  if (!t) { 관심 = new Set(); if (b) b.hidden = true; 별새로(); return; }
  try {
    const r = await fetch('/api/my/badge', { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401) { 토큰저장(''); 관심 = new Set(); if (b) b.hidden = true; 별새로(); return; }
    const d = await r.json(); if (d.error) return;
    관심 = new Set(d.관심 || []);
    if (b) { b.hidden = !d.안읽음; b.textContent = d.안읽음 > 99 ? '99+' : String(d.안읽음); b.title = `안 읽은 알림 ${d.안읽음}`; }
    별새로();
  } catch { /* 배지는 편의 — 못 받아도 화면은 그대로 */ }
}
function 별새로() {
  document.querySelectorAll('[data-fav]').forEach(b => {
    const on = 관심.has(Number(b.dataset.fav));
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★ 관심' : '☆ 관심';
  });
}
async function 내정보그리기() {
  const box = $('#mybox'), t = 토큰();
  const 날 = 한국때;
  if (!t) {
    box.innerHTML = `<h2 class="vtitle">내 정보</h2>
      <div class="mysec mylogin"><p class="ec-help">관심 단지 · 알림함 · 내 문의는 로그인하면 보입니다.
        <span class="muted">지금은 회원가입을 받지 않습니다 — 있는 계정으로만 들어옵니다.</span></p>
        <input id="mlu" class="lin" placeholder="아이디" autocomplete="username" autocapitalize="off" spellcheck="false">
        <input id="mlp" class="lin" type="password" placeholder="비밀번호" autocomplete="current-password">
        <div class="ec-btns"><button type="button" class="ec-b ec-pri" id="mlgo">로그인</button><span class="lerr" id="mlerr"></span></div></div>`;
    return;
  }
  box.innerHTML = '<h2 class="vtitle">내 정보</h2><p class="muted">불러오는 중…</p>';
  let d;
  try {
    const r = await fetch('/api/my', { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401) { 토큰저장(''); return 내정보그리기(); }
    d = await r.json();
    if (d.error) throw Object.assign(new Error(d.error), { 응답: d });
  } catch (e) {
    box.innerHTML = '<h2 class="vtitle">내 정보</h2><p class="muted">내 정보를 불러오지 못했습니다.</p>';
    오류카드(e.응답 ? { 무엇: '내 정보', 응답: e.응답, 다시: () => 내정보그리기() } : { 무엇: '내 정보', 예외: e, 다시: () => 내정보그리기() });
    return;
  }
  관심 = new Set((d.관심 || []).map(x => x.complex_id));
  const 나 = d.나 || {};
  const 억 = v => v == null ? '' : (Number(v) / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
  box.innerHTML = `<h2 class="vtitle">내 정보</h2>
    <div class="mysec"><div class="myrow"><span><b>${esc(나.username || '')}</b> <span class="pill">${esc(나.role || '')}</span>
        <span class="s">마지막 로그인 ${esc(날(나.last_login))} · 남긴 문의 ${fmt(d.수.문의)} · AI 질문 ${fmt(d.수.질문)}</span></span>
      <span class="r"><button type="button" class="ec-b" data-my-out>로그아웃</button></span></div></div>

    ${나.role === 'root' ? `<section class="mysec"><h3>접속 IP <span class="muted">최근 7일 · root 만 보입니다 — 이용현황(공개)에는 나라별 수만</span>
        <button type="button" class="ec-b" data-my-ips>열기</button></h3><div id="myips"></div></section>
      <section class="mysec"><h3>수집 현황 <span class="muted">자료마다 언제 받았고 다음은 언제인지 · 안 돌았으면 왜인지</span>
        <button type="button" class="ec-b" data-my-collect>열기</button></h3><div id="mycollect"></div></section>` : ''}

    <section class="mysec"><h3>알림함 ${d.안읽음 ? `<span class="pill use">안 읽음 ${fmt(d.안읽음)}</span>` : ''}
        <span class="muted">문의에 답이 달리면 여기로 옵니다</span>
        ${d.안읽음 ? '<button type="button" class="ec-b" data-my-readall>모두 읽음</button>' : ''}</h3>
      ${(d.알림 || []).length ? d.알림.map(n => `
        <button type="button" class="myrow${n.읽은때 ? '' : ' new'}" data-my-notice="${n.notice_id}" data-my-inq="${n.inquiry_id || ''}">
          <span><b>${esc(n.제목)}</b>${n.내용 ? `<span class="s">${esc(n.내용).slice(0, 300)}</span>` : ''}</span>
          <span class="r">${esc(날(n.때))}${n.읽은때 ? '' : '<br><b>새 알림</b>'}</span></button>`).join('')
        : '<p class="muted">알림이 없습니다.</p>'}</section>

    <section class="mysec"><h3>관심 단지 <span class="muted">${fmt((d.관심 || []).length)}곳 · 단지 상세의 ☆ 관심 으로 넣고 뺍니다</span></h3>
      ${(d.관심 || []).length ? d.관심.map(c => `
        <div class="myrow"><button type="button" class="myrow" style="border:0;margin:0;padding:0" data-my-open="${c.merged_into || c.complex_id}">
            <span><b>${esc(c.complex_nm || '(이름 없음)')}</b>
            <span class="s">${esc(c.rep_plat_plc || '')}${c.hhld_cnt_sum ? ` · ${fmt(c.hhld_cnt_sum)}세대` : ''}${c.oldest_use_apr ? ` · 사용승인 ${esc(String(c.oldest_use_apr).slice(0, 4))}` : ''}
              ${c.trade_last_amt ? ` · 최근 매매 ${억(c.trade_last_amt)} (${esc(String(c.trade_last_ymd || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'))})` : ''}
              ${c.merged_into ? ` · <b>다른 단지로 묶였습니다</b>` : (c.is_active === false ? ' · <b>지금은 없는 단지</b>' : '')}</span></span></button>
          <span class="r">${esc(날(c.넣은때).slice(0, 10))}<br><button type="button" class="unfav" data-fav="${c.complex_id}" aria-pressed="true">★ 관심</button></span></div>`).join('')
        : '<p class="muted">아직 없습니다. 단지 상세 위의 <b>☆ 관심</b> 을 누르면 여기에 모입니다.</p>'}</section>

    <section class="mysec"><h3>내 문의 <span class="muted">${fmt((d.문의 || []).length)}건 — 모두가 보는 문의 탭에도 있습니다</span></h3>
      ${(d.문의 || []).length ? d.문의.map(q => `
        <div class="myrow"><span><span class="pill${q.답변 ? ' use' : ''}">${q.답변 ? '답변함' : '답변 전'}</span> #${q.inquiry_id}
            ${q.종류 === '오류' ? `<span class="pill">오류</span> ${esc(q.무엇 || '')}` : ''}
            ${q.내용 ? `<span class="s">${esc(q.내용).replace(/\n/g, '<br>')}</span>` : ''}
            ${q.답변 ? `<div class="myans"><b>터무니</b> <span class="muted">${esc(날(q.답변때))}</span><br>${esc(q.답변).replace(/\n/g, '<br>')}</div>` : ''}</span>
          <span class="r">${esc(날(q.때))}</span></div>`).join('')
        : '<p class="muted">남긴 문의가 없습니다.</p>'}</section>

    <section class="mysec"><h3>내 AI 질문 <span class="muted">최근 ${fmt((d.질문 || []).length)}개 · 누르면 다시 찾습니다</span></h3>
      ${(d.질문 || []).length ? d.질문.map(a => `
        <button type="button" class="myrow" data-my-ask="${esc(a.질문)}"><span>${esc(a.질문)}
            <span class="s">${esc(a.종류 || '')}${a.결과수 != null ? ` · ${fmt(a.결과수)}곳` : ''}</span></span>
          <span class="r">${esc(날(a.때))}</span></button>`).join('')
        : '<p class="muted">아직 없습니다.</p>'}</section>`;
  배지새로();
}
document.addEventListener('click', async e => {
  /* 별(관심) — 상세 · 내 정보 어디서나 */
  const f = e.target.closest('[data-fav]');
  if (f) {
    e.preventDefault();
    const id = Number(f.dataset.fav), t = 토큰();
    if (!t) { toast('관심 단지는 로그인하면 쓸 수 있습니다 — 내 정보 탭에서 로그인하세요', 3500); 보기전환('my'); return; }
    const on = 관심.has(id);
    f.disabled = true;
    try {
      const r = await fetch('/api/my/fav/' + id, { method: on ? 'DELETE' : 'PUT', headers: { Authorization: 'Bearer ' + t } });
      if (r.status === 401) { 토큰저장(''); toast('로그인이 만료됐습니다 — 다시 들어와 주세요', 3500); 보기전환('my'); return; }
      const d = await r.json();
      if (!r.ok || d.error) { toast(esc(d.error || '바꾸지 못했습니다'), 3000); return; }
      on ? 관심.delete(id) : 관심.add(id);
      별새로();
      if (지금보기 === 'my') 내정보그리기();
    } catch (x) { toast('바꾸지 못했습니다 — ' + esc(x.message), 3000); }
    finally { f.disabled = false; }
    return;
  }
  const v = document.getElementById('view-my'); if (!v || v.hidden || !v.contains(e.target)) return;
  if (e.target.closest('#mlgo')) {
    const u = ($('#mlu') || {}).value || '', pw = ($('#mlp') || {}).value || '', er = $('#mlerr');
    if (!u || !pw) { er.textContent = '아이디와 비밀번호를 모두 넣어 주세요'; return; }
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
      const d = await r.json();
      if (!r.ok) { er.textContent = d.error || '로그인하지 못했습니다'; return; }
      토큰저장(d.token); 내정보그리기();
    } catch (x) { er.textContent = '서버에 연결하지 못했습니다 — ' + x.message; }
    return;
  }
  if (e.target.closest('[data-my-out]')) { 토큰저장(''); 관심 = new Set(); 배지새로(); 내정보그리기(); return; }
  if (e.target.closest('[data-my-readall]')) {
    await fetch('/api/my/notice/read', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + 토큰() }, body: '{}' }).catch(() => {});
    내정보그리기(); return;
  }
  const n = e.target.closest('[data-my-notice]');
  if (n) {
    await fetch('/api/my/notice/read', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + 토큰() },
      body: JSON.stringify({ id: Number(n.dataset.myNotice) }) }).catch(() => {});
    배지새로();
    보기전환('qna');   // 답변은 문의 탭에서 그 글과 같이 본다
    const qid = n.dataset.myInq;
    if (qid) setTimeout(() => { const a = document.querySelector(`#view-qna [data-qid="${qid}"]`); if (a) { a.scrollIntoView({ block: 'center' }); a.style.outline = '2px solid var(--mark)'; } }, 900);
    return;
  }
  /* 2026-10-28 수집 현황(root) — 상태 색: 성공 초록 · 실패/못돎 빨강 · 건너뜀 노랑 · 놓음/도는중 회색 */
  if (e.target.closest('[data-my-collect]')) {
    const box = $('#mycollect'); box.innerHTML = '<p class="muted">불러오는 중…</p>';
    const 때 = v => v ? esc(String(v).slice(5, 16).replace('T', ' ')) : '—';
    const 색 = st => ({ 성공: 'ok', 실패: 'bad', 못돎: 'bad', 건너뜀: 'warn' })[st] || 'mid';
    try {
      const r = await fetch('/api/admin/collect', { headers: { Authorization: 'Bearer ' + 토큰() } });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
      box.innerHTML = `<div class="ipwrap"><table class="iptab"><thead><tr><th>자료</th><th>일정</th><th>주기</th><th>마지막 성공</th><th>최근</th><th>다음</th><th>7일 실패·못돎</th></tr></thead><tbody>${
        d.일정.map(x => { const [st, at, why] = String(x.최근 || '').split('|');
          return `<tr title="${esc((x.출처주기 || '') + (x.근거 ? ' · ' + x.근거 : ''))}"><td>${esc(x.자료)}</td><td>${esc(x.이름)}${x.켜짐 ? '' : ' <span class="muted">(꺼짐)</span>'}</td><td>${esc(x.주기)}</td>
            <td>${때(x.마지막성공)}</td><td>${st ? `<span class="cst ${색(st)}">${esc(st)}</span> ${esc(String(at).slice(5))}${why ? `<br><span class="muted sm">${esc(why)}</span>` : ''}` : '—'}</td>
            <td>${때(x.다음)}</td><td>${fmt(x.실패7일)}</td></tr>`; }).join('')}</tbody></table></div>
        <h4 class="sm">최근 실행</h4>
        <div class="ipwrap"><table class="iptab"><thead><tr><th>예정</th><th>일정</th><th>상태</th><th>시작 ~ 끝</th><th>걸린 시간</th><th>이유 · 로그</th></tr></thead><tbody>${
        d.기록.map(x => `<tr><td>${때(x.예정)}</td><td>${esc(x.이름)}</td><td><span class="cst ${색(x.상태)}">${esc(x.상태)}</span></td>
          <td>${때(x.시작)} ~ ${때(x.끝)}</td><td>${x.초 != null ? fmt(Math.round(x.초 / 60)) + '분' : '—'}</td>
          <td class="sm">${esc(x.이유 || '')}${x.로그 ? `<br><span class="muted">logs\\${esc(x.로그)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="note sm">'못돎' = 예정 시각에 PC 나 수집 일정 프로그램이 꺼져 있었던 것(다시 켜질 때 적힘). '건너뜀' = 앞 실행이 아직 도는 중 · 디스크 부족 · 출처에 새 것 없음. 시각은 한국 시각.</p>`;
    } catch (x) { box.innerHTML = `<p class="note sm">불러오지 못했습니다 — ${esc(x.message)}</p>`; }
    return;
  }
  if (e.target.closest('[data-my-ips]')) {
    const box = $('#myips'); box.innerHTML = '<p class="muted">불러오는 중…</p>';
    try {
      const r = await fetch('/api/admin/ips', { headers: { Authorization: 'Bearer ' + 토큰() } });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
      box.innerHTML = `<div class="ipwrap"><table class="iptab"><thead><tr><th>IP</th><th>나라</th><th>갈래</th><th>요청</th><th>단지</th><th>API</th><th>실패</th><th>처음 ~ 끝</th></tr></thead><tbody>${
        d.목록.map(x => `<tr${x.운영자 ? ' class="own"' : ''} title="${esc(x.ua)}"><td>${esc(x.ip)}${x.운영자 ? ' <b>나</b>' : ''}</td><td>${esc(x.나라 || '')}</td><td>${esc(x.갈래)}</td>
          <td>${fmt(x.n)}</td><td>${fmt(x.단지)}</td><td>${fmt(x.api)}</td><td>${fmt(x.실패)}</td>
          <td>${esc(String(x.첫).slice(5, 16).replace('T', ' '))} ~ ${esc(String(x.끝).slice(5, 16).replace('T', ' '))}</td></tr>`).join('')}</tbody></table></div>
        <p class="note sm">'나' = root 로 로그인한 요청이 들어온 주소 — 이용현황에서 뺍니다. 줄에 올리면 브라우저 이름(UA)이 보입니다. 시각은 한국 시각.</p>`;
    } catch (x) { box.innerHTML = `<p class="note sm">불러오지 못했습니다 — ${esc(x.message)}</p>`; }
    return;
  }
  const o = e.target.closest('[data-my-open]');
  if (o) { 보기전환('map'); select(Number(o.dataset.myOpen)); return; }
  const a = e.target.closest('[data-my-ask]');
  if (a) { 보기전환('map'); if (!askMode) setMode('ask'); $('#q').value = a.dataset.myAsk; ask(); return; }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && (e.target.id === 'mlp' || e.target.id === 'mlu')) { const b = $('#mlgo'); if (b) b.click(); } });
/* 처음 열 때 · 창으로 돌아올 때 배지를 새로(답변이 달렸는지) — 주기적으로 두드리지 않는다 */
배지새로();
document.addEventListener('visibilitychange', () => { if (!document.hidden) 배지새로(); });

/* ---- Github (2026-10-22 사장님 "어차피 깃 소스코드도 다 공개할 거라 · Github 탭을 문의 오른쪽에") ----
   ★ 저장소 주소를 아직 받지 않았다 — 빈 칸이면 '공개 준비 중' 으로 적는다(없는 주소를 지어내지 않는다). 주소가 생기면 여기 두 칸만 채운다. */
const 깃허브 = {
  화면: 'https://github.com/kkm4512/Teomoony-f',   // Teomoony-f — 화면 · 서버
  적재: 'https://github.com/kkm4512/Teomoony-b',   // Teomoony-b — 적재(ETL) · DB 스크립트 · 작업 기록
};
function 깃허브그리기() {
  const 칸 = (주소, 이름, 글) => `<div class="ghcard"><h3>${esc(이름)}</h3><p>${글}</p>
    <p>${주소 ? `<a href="${esc(주소)}" target="_blank" rel="noopener">${esc(주소)}</a>` : '<span class="muted">저장소 주소를 아직 붙이지 않았습니다 — 공개 준비 중</span>'}</p></div>`;
  $('#ghbox').innerHTML = `<h2 class="vtitle">Github</h2>
    <p class="note sm">터무니의 소스코드는 모두 공개합니다. 데이터를 어디서 받아 어떻게 잇고 어떻게 세는지 — 화면에 보이는 숫자가 어디서 왔는지를 코드로 확인할 수 있습니다.
      키·비밀번호(.env)는 저장소에 넣지 않습니다.</p>
    ${칸(깃허브.화면, 'Teomoony-f — 화면 · 서버', 'Node.js(Express) API 와 지도 화면(Leaflet). 단지 상세 · 검색 · AI 검색 · 겹쳐보기 · 정책 화면.')}
    ${칸(깃허브.적재, 'Teomoony-b — 적재 · DB', '공공데이터 적재(Python) · SQL Server 테이블과 파생표 스크립트(deploy/sql) · 작업 기록(CONTEXT.md).')}`;
}
