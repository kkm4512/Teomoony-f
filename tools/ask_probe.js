/* 터무니 - /api/ask 를 **끝에서 끝까지** 두드려 보는 시험대
 *
 * ★ 왜 따로 있나: /api/ask 는 로그인을 요구한다. 비밀번호를 채팅이나
 *   화면에 찍지 않으려면 **이 기계 안에서** .env 를 읽어 로그인해야 한다.
 *   결과는 tools/ask_probe.out.txt 에 적는다 - 비밀번호는 어디에도 안 적는다.
 */
const fs = require('fs'), path = require('path');
const ENV = 'C:\\Project\\Teomoony\\.env';
const OUT = path.join(__dirname, 'ask_probe.out.txt');
const BASE = process.env.TM_BASE || 'http://127.0.0.1:5173';

for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

/* 물어볼 문장은 ask_probe.in.txt 에서 읽는다 - 일감 설정을 안 건드리고
   문장만 바꿔 가며 시험하려고. 파일이 없으면 아래 기본 묶음을 쓴다. */
const IN = path.join(__dirname, 'ask_probe.in.txt');
const 파일문장 = fs.existsSync(IN)
  ? fs.readFileSync(IN, 'utf8').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  : [];
const 문장들 = process.argv.slice(2).length ? process.argv.slice(2)
  : 파일문장.length ? 파일문장 : [
  '드림아트빌라가 어딨지',
  '안양 실거래 제일 싼게 뭐야',
  '서초동 20억 넘는 아파트 10개',
  '오늘 날씨 어때',
  '없는이름아파트가 어딨지',
];
const 줄 = [];
const 적자 = (...a) => { const s = a.join(' '); 줄.push(s); console.log(s); };

(async () => {
  try {
    const lr = await fetch(BASE + '/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: process.env.ROOT_PASSWORD }) });
    if (!lr.ok) { 적자('✗ 로그인 실패 HTTP', lr.status, (await lr.text()).slice(0, 200)); throw 0; }
    const tok = (await lr.json()).token;
    적자('로그인 OK · 토큰', tok ? tok.length + '자' : '없음', '\n');

    for (const q of 문장들) {
      const t0 = Date.now();
      const r = await fetch(BASE + '/api/ask?q=' + encodeURIComponent(q),
        { headers: { Authorization: 'Bearer ' + tok } });
      const ms = Date.now() - t0;
      if (!r.ok) { 적자(`✗ ${q}  HTTP ${r.status}\n`); continue; }
      const j = await r.json(), h = j.해석 || {}, ai = j.ai || {};
      적자(`■ ${q}   (${ms}ms)`);
      적자(`   지역 ${JSON.stringify(h.지역)} | 단지이름 ${JSON.stringify(h.단지이름)}` +
           ` | 종목 ${h.종목} | 정렬 ${h.정렬}${h.정렬추정 ? '(추정)' : ''}`);
      적자(`   못알아들음 ${JSON.stringify(h.못알아들은말)} | 필터 ${JSON.stringify(h.필터)}`);
      적자(`   AI 썼음=${ai.썼음} 실패=${ai.실패} 무관=${ai.무관함 || false}` +
           ` 보탬 ${JSON.stringify(ai.보탠것 || [])}`);
      (j.알림 || []).forEach(a => 적자(`   [${a.종류}] ${a.말}`));
      적자(`   ${j.count}곳` + ((j.items || []).length
        ? ' → ' + j.items.slice(0, 3).map(x => `${x.complex_nm}(${x.rep_plat_plc || '-'})`).join(' / ')
        : ''));
      적자('');
    }
  } catch (e) { if (e) 적자('✗ ' + (e && e.message || e)); }
  fs.writeFileSync(OUT, 줄.join('\n'), 'utf8');
})();
