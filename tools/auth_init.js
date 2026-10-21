/* 로그인 준비 — 테이블 · 서명키 · root 계정  (2026-10-19)
   ───────────────────────────────────────────────────────────
   한 번 돌리면 끝이다. 여러 번 돌려도 안전하다(이미 있으면 건드리지 않는다).

   ★ 비밀번호는 **채팅에도 로그에도 찍지 않는다.** .env 에만 적는다.
   ★ 해시는 Node 내장 scrypt 를 쓴다. bcrypt 는 네이티브 빌드가 필요해서
     의존성을 늘린다 - 이 프로젝트는 mssql/express/dotenv 셋뿐이다.
   ★ 토큰 서명키(AUTH_SECRET)도 여기서 만든다. 없으면 로그인이 안 선다.   */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require(path.join(__dirname, '..', 'src', 'db.js'));

const ENVP = [
  path.join(__dirname, '..', '..', 'Teomoony', '.env'),
  path.join(__dirname, '..', '.env'),
].find(p => fs.existsSync(p));

function envSet(key, val, comment) {
  let s = fs.readFileSync(ENVP, 'utf8');
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (re.test(s)) {
    if (s.match(re)[0].slice(key.length + 1).trim()) return false;  // 이미 값이 있다
    s = s.replace(re, key + '=' + val);
  } else {
    s = s.replace(/\s*$/, '\n') + (comment ? comment + '\n' : '') + key + '=' + val + '\n';
  }
  fs.writeFileSync(ENVP, s);
  return true;
}

/* 사람이 옮겨 적을 수 있는 글자만 쓴다 - 0/O, 1/l/I 는 뺀다 */
const ABC = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pick = n => Array.from(crypto.randomBytes(n))
  .map(b => ABC[b % ABC.length]).join('');

function hash(pw, salt) {
  return crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

(async () => {
  console.log('.env :', ENVP);

  /* 1) 토큰 서명키 */
  if (envSet('AUTH_SECRET', crypto.randomBytes(48).toString('base64url'),
             '\n# ------------------------------------------------------------\n' +
             '# 로그인 (2026-10-19)\n' +
             '#   AUTH_SECRET : Bearer 토큰 서명키. 바꾸면 **모든 토큰이 무효**가 된다.\n' +
             '#   ★ 이 줄이 비면 로그인이 아예 서지 않는다 - 조용히 통과시키지 않는다.'))
    console.log('AUTH_SECRET  새로 만들었습니다');
  else console.log('AUTH_SECRET  이미 있습니다 - 그대로 둡니다');

  /* 2) 테이블 */
  const pool = await getPool();
  await pool.request().query(`
    IF SCHEMA_ID('meta') IS NULL EXEC('CREATE SCHEMA meta');
    IF OBJECT_ID('meta.app_user') IS NULL
    CREATE TABLE meta.app_user (
      user_id    INT IDENTITY(1,1) PRIMARY KEY,
      username   NVARCHAR(64)  NOT NULL UNIQUE,
      pw_salt    VARCHAR(64)   NOT NULL,
      pw_hash    VARCHAR(256)  NOT NULL,
      role       VARCHAR(16)   NOT NULL CONSTRAINT df_app_user_role DEFAULT 'user',
      is_active  BIT           NOT NULL CONSTRAINT df_app_user_act  DEFAULT 1,
      created_at DATETIME2(0)  NOT NULL CONSTRAINT df_app_user_crt  DEFAULT SYSDATETIME(),
      last_login DATETIME2(0)  NULL,
      pw_changed DATETIME2(0)  NULL);`);
  console.log('meta.app_user  준비됨');

  /* 3) root — 이미 있으면 **건드리지 않는다** (비밀번호를 덮어쓰면 안 된다) */
  const got = await pool.request().query(
    `SELECT user_id, created_at FROM meta.app_user WHERE username = 'root'`);
  if (got.recordset.length) {
    console.log('root  이미 있습니다 (' + got.recordset[0].created_at.toISOString().slice(0,10) +
                ') - 비밀번호는 그대로 둡니다');
    process.exit(0);
  }

  const pw = pick(20);
  const salt = crypto.randomBytes(16).toString('hex');
  await pool.request()
    .input('u', sql.NVarChar(64), 'root')
    .input('s', sql.VarChar(64), salt)
    .input('h', sql.VarChar(256), hash(pw, salt))
    .query(`INSERT INTO meta.app_user (username, pw_salt, pw_hash, role)
            VALUES (@u, @s, @h, 'root')`);

  /* ★ 비밀번호는 .env 에만 적는다. 화면에 찍지 않는다 -
       터미널 기록과 로그 파일에 남기 때문이다. */
  envSet('ROOT_PASSWORD', pw,
    '#   ROOT_PASSWORD : 처음 만든 root 비밀번호. **여기서만 볼 수 있다.**\n' +
    '#   ★ 로그인한 뒤 바꾸고 이 줄을 지우는 걸 권합니다.');
  console.log('root  만들었습니다 — 비밀번호는 .env 의 ROOT_PASSWORD 줄에 있습니다');
  console.log('      (화면에 찍지 않습니다. 로그에 남으니까요)');
  process.exit(0);
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
