/* 앱 상태(회원 · 문의 · 알림 · 관심 단지 · AI 질문 · 이용현황 · 접속 기록)를 서비스DB(app.*)에서 (2026-11-01, 서비스DB 분리 4묶음)
   ★ 켜고 끄기: svc_mode.json "app". 꺼져 있으면 server.js 의 옛 경로(적재DB ops.* · meta.app_user) 그대로.
   ★ 넘어갈 때: etl/app_to_pg.py 로 옮기고(번호 그대로) → "app": true → app.cutover 한 줄. 그 뒤로는 app.* 가 원본이다(되돌리면 그 사이 쓴 것이 적재DB 에 없다).
   ★ 응답 모양을 옛 경로와 같게: 때(timestamp)는 node-mssql 처럼 **UTC 로 읽는다**(적재DB 에 적힌 벽시계 값 그대로 · SYSDATETIME = UTC, 접속 기록 '때' = 한국시간),
     count/sum 은 ::int(옛 경로는 INT — 숫자로 나감), bigint 번호(ask_id · log_sk)는 문자열(node-mssql 과 같음). */
const { Pool, types } = require('pg');
const { 지금설정 } = require('./svc');

const 타입 = {
  getTypeParser(oid, fmt) {
    if (oid === 1114) return s => (s == null ? null : new Date(s.replace(' ', 'T') + 'Z'));   // timestamp without time zone → UTC 로
    return types.getTypeParser(oid, fmt);
  },
};
let pool = null;
function pg() {
  if (!pool) {
    pool = new Pool({ host: '127.0.0.1', port: 15432, database: 'teomoony', user: 'teomoony', password: process.env.SVC_DB_PASSWORD || '',
                      max: 6, idleTimeoutMillis: 30000, connectionTimeoutMillis: 3000, statement_timeout: 30000, types: 타입 });
    pool.on('error', () => {});
  }
  return pool;
}
const 켜짐 = () => process.env.TEOMOONY_DEV !== '1' && !!지금설정().read && !!지금설정().app;
const 지금UTC = "(now() AT TIME ZONE 'UTC')";
const q = (text, values) => pg().query(text, values);

/* ---- 운영자 IP ---- */
async function 운영자IP목록() { return (await q('SELECT ip FROM app.usage_owner_ip')).rows.map(x => x.ip); }
async function 운영자IP넣기(ip, 근거) { await q('INSERT INTO app.usage_owner_ip (ip, "근거") VALUES ($1, $2) ON CONFLICT (ip) DO NOTHING', [ip, 근거]); }

/* ---- 이용현황 셈(시간 단위) ---- */
async function 이용넣기(줄) {   // [[시각문자열, 동작, 갈래, 수]]
  for (let i = 0; i < 줄.length; i += 500) {
    const 조각 = 줄.slice(i, i + 500), v = [], p = [];
    조각.forEach(([t, a, g, n], j) => { v.push(`($${j * 4 + 1}::timestamp, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}::int)`); p.push(t, a, g || '모름', n); });
    await q(`INSERT INTO app.usage_hour ("시각", "동작", "갈래", "횟수") VALUES ${v.join(',')}
             ON CONFLICT ("시각", "동작", "갈래") DO UPDATE SET "횟수" = app.usage_hour."횟수" + EXCLUDED."횟수"`, p);
  }
}

/* ---- 접속 기록 ---- */
const 기록칸 = ['때', 'ip', '내부', '경로', '질의', '동작', '상태', '밀리', '나라', 'ua', '리퍼러', '요청번호', '오류'];
async function 기록넣기(줄) {
  const v = [], p = [];
  줄.forEach((x, j) => {
    v.push('(' + 기록칸.map((k, i) => `$${j * 기록칸.length + i + 1}${k === '때' ? '::timestamp' : ''}`).join(', ') + ')');
    p.push(x.때, x.ip, !!x.내부, x.경로, x.질의, x.동작, x.상태, x.밀리, x.나라, x.ua, x.리퍼러, x.요청번호, x.오류);
  });
  await q(`INSERT INTO app.req_log (${기록칸.map(k => `"${k}"`).join(', ')}) VALUES ${v.join(',')}`, p);
}
async function 기록정리() {   // 옛 경로와 같은 기준(SYSDATETIME = UTC 벽시계 - 90일)
  const r = await q(`DELETE FROM app.req_log WHERE log_sk IN (SELECT log_sk FROM app.req_log WHERE "때" < ${지금UTC} - interval '90 days' LIMIT 5000)`);
  return r.rowCount;
}

/* ---- 이용현황 화면(/api/usage) — 옛 경로의 결과표 6개와 같은 모양 ---- */
async function 이용현황(a) {   // { 오늘, 이레, 보름, d0, d1 } — 'YYYY-MM-DDTHH:MM:SS' 문자열
  const 날거름 = `($4::timestamp IS NULL OR ("시각" >= $4::timestamp AND "시각" < $5::timestamp))`;
  const 인자 = [a.오늘, a.이레, a.보름, a.d0, a.d1];
  const [r0, r1, r2, r3, r4, r5] = await Promise.all([
    q(`SELECT "동작", sum(CASE WHEN "시각" >= $1::timestamp THEN "횟수" ELSE 0 END)::int AS "오늘",
              sum(CASE WHEN "시각" >= $2::timestamp THEN "횟수" ELSE 0 END)::int AS "이레", sum("횟수")::int AS "전체"
         FROM app.usage_hour WHERE "갈래" IN ('사람', '모름') AND ${날거름} AND $3::text IS NOT NULL
        GROUP BY "동작" ORDER BY sum("횟수") DESC, "동작" COLLATE svc.ko_ci`, 인자),
    q(`SELECT to_char("시각", 'YYYY-MM-DD') AS "날", sum("횟수")::int AS "횟수" FROM app.usage_hour
        WHERE "시각" >= $1::timestamp AND "갈래" IN ('사람', '모름') GROUP BY 1 ORDER BY 1`, [a.보름]),
    q(`SELECT "갈래", sum(CASE WHEN "시각" >= $1::timestamp THEN "횟수" ELSE 0 END)::int AS "오늘",
              sum(CASE WHEN "시각" >= $2::timestamp THEN "횟수" ELSE 0 END)::int AS "이레", sum("횟수")::int AS "전체"
         FROM app.usage_hour WHERE ${날거름} AND $3::text IS NOT NULL GROUP BY "갈래" ORDER BY sum("횟수") DESC, "갈래" COLLATE svc.ko_ci`, 인자),
    q(`SELECT min("시각") AS "처음" FROM app.usage_hour WHERE "갈래" <> '모름'`),
    q(`SELECT l.ip, l."나라", l.ua, count(*)::int AS n FROM app.req_log l
        WHERE l."때" >= coalesce($1::timestamp, $2::timestamp) AND ($3::timestamp IS NULL OR l."때" < $3::timestamp)
          AND NOT l."내부" AND l."상태" < 400 AND NOT EXISTS (SELECT 1 FROM app.usage_owner_ip o WHERE o.ip = l.ip)
        GROUP BY l.ip, l."나라", l.ua`, [a.d0, a.이레, a.d1]),
    q(`SELECT extract(hour FROM "시각")::int AS "시", sum("횟수")::int AS "횟수" FROM app.usage_hour
        WHERE $1::timestamp IS NOT NULL AND "갈래" IN ('사람', '모름') AND "시각" >= $1::timestamp AND "시각" < $2::timestamp
        GROUP BY 1 ORDER BY 1`, [a.d0, a.d1]),
  ]);
  return { recordsets: [r0.rows, r1.rows, r2.rows, r3.rows, r4.rows, r5.rows] };
}
async function 접속IP() {   // /api/admin/ips
  return (await q(`SELECT l.ip, max(l."나라") AS "나라", max(l.ua) AS ua, count(*)::int AS n,
                          sum(CASE WHEN l."경로" LIKE '/c/%' THEN 1 ELSE 0 END)::int AS "단지", sum(CASE WHEN l."경로" LIKE '/api/%' THEN 1 ELSE 0 END)::int AS api,
                          sum(CASE WHEN l."상태" >= 400 THEN 1 ELSE 0 END)::int AS "실패", min(l."때") AS "첫", max(l."때") AS "끝",
                          max(CASE WHEN o.ip IS NULL THEN 0 ELSE 1 END)::int AS "운영자"
                     FROM app.req_log l LEFT JOIN app.usage_owner_ip o ON o.ip = l.ip
                    WHERE l."때" >= ${지금UTC} - interval '7 days' AND NOT l."내부"
                    GROUP BY l.ip ORDER BY count(*) DESC LIMIT 300`)).rows;
}

/* ---- 로그인 ---- */
async function 사용자(username) {
  return (await q('SELECT user_id, username, pw_salt, pw_hash, role, is_active FROM app.app_user WHERE username = $1', [username])).rows[0];
}
async function 로그인때(id) { await q(`UPDATE app.app_user SET last_login = ${지금UTC} WHERE user_id = $1`, [id]); }

/* ---- 문의 ---- */
async function 문의넣기(x) {
  const r = await q(`INSERT INTO app.inquiry (user_id, "아이디", "종류", "무엇", "말", "오류번호", "단지코드", "화면", "내용")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING inquiry_id`,
                    [x.uid, x.u, x.종류, x.무엇, x.말, x.번호, x.단지, x.화면, x.내용]);
  return r.rows[0].inquiry_id;
}
async function 문의목록(o) {
  return (await q(`SELECT inquiry_id, "때", "아이디", "종류", "무엇", "말", "오류번호", "단지코드", "내용", "상태", "답변", "답변때", "답변자",
                          (count(*) OVER ())::int AS "전체"
                     FROM app.inquiry ORDER BY "때" DESC, inquiry_id DESC OFFSET $1 LIMIT 30`, [o])).rows;
}
async function 답변(id, a, u) {   // 옛 경로와 같다: 고치면 덮고 · 빈 글이면 거두고 · 답변이면 알림 한 줄
  const c = await pg().connect();
  try {
    await c.query('BEGIN');
    const r = await c.query(`UPDATE app.inquiry SET "답변" = $2, "답변때" = CASE WHEN $2::text IS NULL THEN NULL ELSE ${지금UTC} END,
                                    "답변자" = CASE WHEN $2::text IS NULL THEN NULL ELSE $3 END, "상태" = CASE WHEN $2::text IS NULL THEN '새로' ELSE '답변함' END
                              WHERE inquiry_id = $1`, [id, a, u]);
    if (r.rowCount && a != null)
      await c.query(`INSERT INTO app.notice (user_id, "종류", "제목", "내용", inquiry_id)
                     SELECT user_id, '문의답변', '문의 #' || inquiry_id || ' 에 답변이 달렸습니다', left($2, 300), inquiry_id
                       FROM app.inquiry WHERE inquiry_id = $1 AND user_id IS NOT NULL`, [id, a]);
    await c.query('COMMIT');
    return r.rowCount;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

/* ---- 내 정보 ---- */
async function 내정보(uid) {   // 옛 경로의 결과표 7개와 같은 모양
  const [나, 알림, 관심, 문의, 질문, 안, 수] = await Promise.all([
    q('SELECT username, role, last_login FROM app.app_user WHERE user_id = $1', [uid]),
    q(`SELECT notice_id, "때", "종류", "제목", "내용", inquiry_id, "읽은때" FROM app.notice WHERE user_id = $1 ORDER BY "때" DESC, notice_id DESC LIMIT 50`, [uid]),
    q(`SELECT f.complex_id, f."넣은때", c.complex_nm, c.rep_plat_plc, c.hhld_cnt_sum, c.oldest_use_apr, c.trade_last_ymd, c.trade_last_amt, c.is_active, c.merged_into
         FROM app.fav_complex f LEFT JOIN svc.lyr_cinfo c ON c.complex_id = f.complex_id
        WHERE f.user_id = $1 AND f."뺀때" IS NULL ORDER BY f."넣은때" DESC`, [uid]),
    q(`SELECT inquiry_id, "때", "종류", "무엇", "내용", "상태", "답변", "답변때" FROM app.inquiry WHERE user_id = $1 ORDER BY "때" DESC LIMIT 50`, [uid]),
    q(`SELECT "때", "질문", "종류", "결과수" FROM app.ask_log WHERE user_id = $1 ORDER BY "때" DESC LIMIT 30`, [uid]),
    q(`SELECT count(*)::int AS "안읽음" FROM app.notice WHERE user_id = $1 AND "읽은때" IS NULL`, [uid]),
    q(`SELECT (SELECT count(*)::int FROM app.inquiry WHERE user_id = $1) AS "문의", (SELECT count(*)::int FROM app.ask_log WHERE user_id = $1) AS "질문"`, [uid]),
  ]);
  return { recordsets: [나.rows, 알림.rows, 관심.rows, 문의.rows, 질문.rows, 안.rows, 수.rows] };
}
async function 배지(uid) {
  const [a, b] = await Promise.all([
    q(`SELECT count(*)::int AS "안읽음" FROM app.notice WHERE user_id = $1 AND "읽은때" IS NULL`, [uid]),
    q(`SELECT complex_id FROM app.fav_complex WHERE user_id = $1 AND "뺀때" IS NULL`, [uid])]);
  return { 안읽음: a.rows[0].안읽음, 관심: b.rows.map(x => x.complex_id) };
}
async function 관심넣기(uid, cid) {   // 'none' | 'full' | 'ok' — 옛 경로와 같은 순서로 본다
  if (!(await q('SELECT 1 FROM svc.lyr_cinfo WHERE complex_id = $1', [cid])).rows.length) return 'none';
  if ((await q(`SELECT count(*)::int AS n FROM app.fav_complex WHERE user_id = $1 AND "뺀때" IS NULL`, [uid])).rows[0].n >= 500) return 'full';
  await q(`INSERT INTO app.fav_complex (user_id, complex_id) VALUES ($1, $2)
           ON CONFLICT (user_id, complex_id) DO UPDATE SET "뺀때" = NULL,
              "넣은때" = CASE WHEN app.fav_complex."뺀때" IS NULL THEN app.fav_complex."넣은때" ELSE ${지금UTC} END`, [uid, cid]);
  return 'ok';
}
async function 관심빼기(uid, cid) { await q(`UPDATE app.fav_complex SET "뺀때" = ${지금UTC} WHERE user_id = $1 AND complex_id = $2 AND "뺀때" IS NULL`, [uid, cid]); }
async function 알림읽음(uid, id) {
  await q(`UPDATE app.notice SET "읽은때" = ${지금UTC} WHERE user_id = $1 AND "읽은때" IS NULL AND ($2::int IS NULL OR notice_id = $2)`, [uid, id]);
}

/* ---- AI 질문 ---- */
async function 질문넣기(x) {
  await q(`INSERT INTO app.ask_log (user_id, "아이디", "질문", "종류", "해석", "결과수") VALUES ($1, $2, $3, $4, $5, $6)`, [x.uid, x.u, x.q, x.k, x.h, x.n]);
}

module.exports = { 켜짐, 운영자IP목록, 운영자IP넣기, 이용넣기, 기록넣기, 기록정리, 이용현황, 접속IP, 사용자, 로그인때,
                   문의넣기, 문의목록, 답변, 내정보, 배지, 관심넣기, 관심빼기, 알림읽음, 질문넣기 };
