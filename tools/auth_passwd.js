/* root 비밀번호를 .env 의 ROOT_PASSWORD 값으로 맞춘다  (2026-10-19)
   ───────────────────────────────────────────────────────────
   쓰는 법 : .env 의 ROOT_PASSWORD 를 원하는 값으로 고치고 이 스크립트를 돌린다.
            (큐에 auth-passwd.job)

   ★ 비밀번호를 **명령줄 인자로 받지 않는다.** 인자로 주면 터미널 기록과
     프로세스 목록에 남는다. .env 를 단일 창구로 둔다.
   ★ 화면에도 찍지 않는다. 길이와 '약한지' 만 말한다.
   ★ 약한 값이면 **막지는 않되 분명히 경고한다.** 로컬에서는 편의가 맞을 수 있다 -
     다만 공개 배포 전에 반드시 바꿔야 한다는 걸 로그에 남긴다. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require(path.join(__dirname, '..', 'src', 'db.js'));

const ENVP = [
  path.join(__dirname, '..', '..', 'Teomoony', '.env'),
  path.join(__dirname, '..', '.env'),
].find(p => fs.existsSync(p));

/* 자동 스캐너가 제일 먼저 넣어보는 값들 */
const WEAK = new Set(['root', 'admin', 'password', 'passwd', '1234', '12345',
                      '123456', 'test', 'qwerty', 'teomoony', 'admin123']);

(async () => {
  const line = fs.readFileSync(ENVP, 'utf8')
    .split(/\r?\n/).find(l => l.startsWith('ROOT_PASSWORD='));
  const pw = line ? line.slice('ROOT_PASSWORD='.length).trim() : '';
  if (!pw) {
    console.error('.env 에 ROOT_PASSWORD 값이 없습니다 — 바꿀 값을 거기 적어주세요');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

  const pool = await getPool();
  const r = await pool.request()
    .input('s', sql.VarChar(64), salt)
    .input('h', sql.VarChar(256), hash)
    .query(`UPDATE meta.app_user
               SET pw_salt = @s, pw_hash = @h, pw_changed = SYSDATETIME()
             WHERE username = 'root';
            SELECT n = @@ROWCOUNT`);
  const n = r.recordset[0].n;
  if (!n) { console.error("root 계정이 없습니다 - 먼저 auth-init 을 도세요"); process.exit(1); }

  const weak = WEAK.has(pw.toLowerCase()) || pw.length < 8;
  console.log(`root 비밀번호를 바꿨습니다 (${pw.length}자) — 값은 찍지 않습니다`);
  if (weak) {
    console.log('');
    console.log('  ★★ 지금 값은 **약합니다.** 자동 스캐너가 제일 먼저 넣어보는 쪽입니다.');
    console.log('     localhost 안에서는 편의가 맞을 수 있지만,');
    console.log('     **도메인으로 공개하기 전에 반드시 바꿔야 합니다.**');
    console.log('     바꾸는 법 : .env 의 ROOT_PASSWORD 를 고치고 큐에 auth-passwd.job');
    console.log('     뚫리면 AI 검색이 열리고 — 그건 Anthropic API 로 돈이 나가는 문입니다.');
  }
  process.exit(0);
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
