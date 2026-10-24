/* ===================== 서비스DB(PostgreSQL) 읽기 (2026-10-24 23:35, ../Teomoony/deploy/svc/design.md) =====================
   사장님 결정: 적재DB(MSSQL) → 서비스DB(PostgreSQL) 1시간마다 발행 · 화면은 서비스DB 를 읽는다.
   1단계: 단지 하나로 결과가 정해지는 응답(상세 · 경계 · 역사 · 용도 …)을 발행기(etl/svc_publish.py)가 **지금 서버 응답 그대로** gzip 으로
   svc.complex_json 에 담아 둔다. 여기서는 그걸 꺼내 그대로 보낸다(값이 같다는 게 보장된다).
   ★ 없으면(아직 발행 전 단지) 아무 일 없이 다음(next) — 기존 적재DB 경로가 답한다. 서비스DB 가 죽어도 화면은 산다.
   ★ 켜고 끄기: Teomoony-f/svc_mode.json 의 "read" (10초마다 다시 읽음) — 되돌리기는 false 한 줄. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Pool } = require('pg');

const 설정파일 = path.join(__dirname, '..', 'svc_mode.json');
let 설정 = { read: false }, 설정읽은때 = 0;
function 지금설정() {
  if (Date.now() - 설정읽은때 > 10000) {
    설정읽은때 = Date.now();
    try { 설정 = JSON.parse(fs.readFileSync(설정파일, 'utf8')); } catch (e) { 설정 = { read: false }; }
  }
  return 설정;
}

let pool = null;
function pg() {
  if (!pool) {
    pool = new Pool({ host: '127.0.0.1', port: 15432, database: 'teomoony', user: 'teomoony',
                      password: process.env.SVC_DB_PASSWORD || '', max: 10, idleTimeoutMillis: 30000,
                      connectionTimeoutMillis: 2000, statement_timeout: 3000 });
    pool.on('error', () => {});   // 끊긴 연결은 버린다 — 다음 요청이 새로 붙는다
  }
  return pool;
}

/* ---------- Redis (사장님 "수도권 지역 기반 · 대단지 기준으로 캐싱") ----------
   키 = t:{발행판}:{종류}:{단지} — 발행이 끝나 판 번호가 바뀌면 다음 요청부터 저절로 새 판(지우는 일 없음, 옛 키는 2시간 뒤 · LRU 로 사라짐).
   값 = 서비스DB 의 gzip 그대로. 50ms 안에 답이 없으면 기다리지 않는다. Redis 가 죽어도 화면은 서비스DB → 적재DB 로 산다.
   미리 채움: 판이 바뀔 때마다 수도권(11 · 28 · 41) 500세대 이상 단지의 상세(detail). 그 밖은 열린 것만 담김. */
let redis = null, redis준비 = false, 판 = 0, 판본때 = 0, 채운판 = 0;
function rd() {
  if (!redis) {
    try {
      redis = require('redis').createClient({ socket: { host: '127.0.0.1', port: 16379, connectTimeout: 1000,
                                                       reconnectStrategy: n => Math.min(n * 500, 10000) } });
      redis.on('ready', () => { redis준비 = true; });
      redis.on('end', () => { redis준비 = false; });
      redis.on('error', () => { redis준비 = false; });
      redis.connect().catch(() => {});
    } catch (e) { redis = null; }
  }
  return redis준비 ? redis : null;
}
const 늦으면 = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(undefined), ms))]);
async function 지금판() {
  if (Date.now() - 판본때 > 20000) {
    판본때 = Date.now();
    try { const r = await pg().query("SELECT coalesce(max(publish_id), 0) AS v FROM svc.publish WHERE status = 'ok'"); 판 = Number(r.rows[0].v); } catch (e) {}
    if (판 && 판 !== 채운판 && !채우는중 && Date.now() - 채움실패때 > 300000) {
      채우는중 = true;
      미리채움(판).then(() => { 채운판 = 판; }, e => { if (e.message === 'Redis 연결 없음') return;   // 막 켜져 아직 붙는 중 — 20초 뒤 다시
                                     채움실패때 = Date.now(); console.log(`[svc] Redis 미리 채움 실패 — ${e.message} (5분 뒤 다시)`); })
                  .finally(() => { 채우는중 = false; });
    }
  }
  return 판;
}
const 대단지기준 = 500;
let 채우는중 = false, 채움실패때 = 0;
/* 미리 채움: 번호만 먼저 고르고 본문은 100곳씩 — 한 번에 수십 MB 를 끌어오면 statement_timeout(3초)에 걸린다(10-25 실측: 1,204곳 · 43MB 가 한 번도 안 채워짐) */
async function 미리채움(v) {
  const c = rd(); if (!c) throw new Error('Redis 연결 없음');
  const a = Date.now();
  const ids = (await pg().query(`SELECT l.complex_id FROM svc.complex_list l
                                  WHERE l.merged_into IS NULL AND l.hhld >= $1 AND left(l.sgg_cd, 2) IN ('11', '28', '41')
                                  ORDER BY l.hhld DESC`, [대단지기준])).rows.map(x => x.complex_id);
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const r = await pg().query(`SELECT complex_id, body_gz FROM svc.complex_json WHERE kind = 'detail' AND status = 200 AND complex_id = ANY($1)`, [ids.slice(i, i + 100)]);
    if (!r.rows.length) continue;
    const m = c.multi();
    for (const x of r.rows) m.set(`t:${v}:detail:${x.complex_id}`, x.body_gz, { EX: 7200 });
    await m.exec(); n += r.rows.length;
  }
  console.log(`[svc] Redis 미리 채움 — 판 ${v} · 수도권 ${대단지기준}세대+ ${ids.length}곳 중 상세 ${n}곳 · ${Date.now() - a}ms`);
}

/* 차단기: 연속 실패 5번이면 30초 동안 서비스DB 를 건너뛴다(화면은 적재DB 경로로) */
let 실패 = 0, 쉬는끝 = 0;
const 셈 = new Map();   // kind → { hit, miss, fallback, ms }
function 세기(kind, 무엇, ms) {
  const x = 셈.get(kind) || { hit: 0, miss: 0, fallback: 0, ms: 0 };
  x[무엇]++; if (ms) x.ms += ms; 셈.set(kind, x);
}
setInterval(async () => {
  if (!셈.size || !지금설정().read) return;
  const 줄 = [...셈.entries()]; 셈.clear();
  const at = new Date(Math.floor(Date.now() / 60000) * 60000);
  try {
    for (const [kind, x] of 줄)
      await pg().query(`INSERT INTO app.cache_stat (at, kind, hit, miss, fallback, miss_ms_avg) VALUES ($1,$2,$3,$4,$5,$6)
                        ON CONFLICT (at, kind) DO UPDATE SET hit = app.cache_stat.hit + EXCLUDED.hit, miss = app.cache_stat.miss + EXCLUDED.miss,
                                                             fallback = app.cache_stat.fallback + EXCLUDED.fallback`,
                        [at, 'svc:' + kind, x.hit, x.miss, x.fallback, x.miss ? Math.round(x.ms / x.miss) : null]);
  } catch (e) { /* 기록 실패는 무시 */ }
}, 60000).unref();

const 종류 = new Set(['detail', 'geo', 'buildings', 'history', 'usage', 'landuse', 'landuse-shape', 'childcare', 'pharmacy', 'hira', 'closed']);
const 길 = /^\/api\/complexes\/(\d{1,9})(?:\/([a-z-]+))?\/?$/;

async function 단지응답(req, res, next) {
  if (req.method !== 'GET' || !지금설정().read) return next();
  const m = 길.exec(req.path);
  if (!m || Object.keys(req.query).length) return next();     // 물음표 붙은 요청(진단 · 고르기)은 기존 경로
  const id = Number(m[1]), kind = m[2] || 'detail';
  if (!종류.has(kind)) return next();
  if (Date.now() < 쉬는끝) { 세기(kind, 'fallback'); return next(); }
  const a = Date.now();
  const 보냄 = (status, gz, 어디) => {
    res.status(status).set({ 'Content-Type': 'application/json; charset=utf-8', 'X-Svc': 어디, 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' });
    if (/\bgzip\b/.test(req.get('accept-encoding') || '')) return res.set('Content-Encoding', 'gzip').end(gz);
    return res.end(zlib.gunzipSync(gz));
  };
  /* ① Redis — 200 응답만 담는다(404 같은 건 서비스DB 에서) */
  let v = 0;
  try {
    v = await 늦으면(지금판(), 300) || 0;
    const c = v && rd();
    if (c) {
      const gz = await 늦으면(c.get(require('redis').commandOptions({ returnBuffers: true }), `t:${v}:${kind}:${id}`), 50);
      if (gz) { 세기('redis:' + kind, 'hit'); return 보냄(200, gz, 'redis'); }
      세기('redis:' + kind, 'miss');
    }
  } catch (e) { /* Redis 문제는 건너뛴다 */ }
  try {
    const r = await pg().query('SELECT status, body_gz FROM svc.complex_json WHERE complex_id = $1 AND kind = $2', [id, kind]);
    실패 = 0;
    if (!r.rows.length) { 세기(kind, 'miss', Date.now() - a); res.set('X-Svc', 'miss'); return next(); }
    세기(kind, 'hit');
    const { status, body_gz } = r.rows[0];
    if (status === 200 && v) { const c = rd(); if (c) c.set(`t:${v}:${kind}:${id}`, body_gz, { EX: 7200 }).catch(() => {}); }
    return 보냄(status, body_gz, 'hit');
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기(kind, 'fallback');
    return next();
  }
}


/* ---------- 지도 마커 (2단계 첫 칸) ----------
   svc.complex_marker = 발행기가 적재DB 에서 통째로 만든 단지 점 + 최근 3년 최고가(없으면 마지막 매매). 기존 /api/complexes/markers 와 같은 모양으로 낸다.
   ★ 같은 동 수 · 세대 수끼리의 순서는 적재DB 도 정해 두지 않은 것이라(ORDER BY 동점) 줄 순서가 다를 수 있다 — 고르는 집합은 같다. */
function 상한(v, 기본, 최대) { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(n, 최대) : 기본; }
async function 마커(req, res, next) {
  if (!지금설정().read || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => k !== 'bbox' && k !== 'limit')) return next();   // 진단 · 대조용 물음표는 기존 경로
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n))) return next();
  const limit = 상한(req.query.limit, 400, 1000);
  const 오늘 = new Date(Date.now() + 9 * 3600 * 1000);
  const 기준 = `${오늘.getUTCFullYear() - 3}${String(오늘.getUTCMonth() + 1).padStart(2, '0')}${String(오늘.getUTCDate()).padStart(2, '0')}`;
  try {
    const r = await pg().query(`SELECT complex_id, complex_nm, rep_plat_plc, has_recap, dong_cnt, hhld_cnt_sum, centroid_lat, centroid_lng,
                                       trade_cnt, rent_cnt, area_grp, max_amount, max_ymd, max_dealing, "실거래이름"
                                  FROM svc.complex_marker
                                 WHERE centroid_lng BETWEEN $1 AND $3 AND centroid_lat BETWEEN $2 AND $4
                                 ORDER BY dong_cnt DESC NULLS LAST, hhld_cnt_sum DESC NULLS LAST, complex_id LIMIT $5`,
                              [bbox[0], bbox[1], bbox[2], bbox[3], limit + 1]);
    실패 = 0; 세기('markers', 'hit');
    const 잘림 = r.rows.length > limit;
    const 행 = (잘림 ? r.rows.slice(0, limit) : r.rows).map(m => ({ ...m, 최근3년: m.max_ymd ? m.max_ymd >= 기준 : null }));
    res.set('X-Svc', 'hit');
    return res.json({ 상한: limit, 잘림, 가격기준: { 말: '최근 3년 최고가 · 없으면 마지막 매매', 시작: 기준 }, markers: 행 });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('markers', 'fallback'); return next();
  }
}

module.exports = { 단지응답, 마커, pg, 지금설정 };
