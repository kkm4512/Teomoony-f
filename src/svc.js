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


/* ---------- 지도 층 (2단계, 2026-10-25) ----------
   발행기(etl/svc_layers.py)가 적재DB 의 화면 질의에서 bbox 조건만 뺀 그대로를 svc.lyr_* 에 담는다. 여기서는 bbox 로 고르고
   **옛 처리와 같은 코드로** 응답을 만든다(속성 순서 · 형 · 상한 · 잘림 그대로).
   ★ 켜고 끄기: svc_mode.json "map" (read 와 따로). 물음표에 bbox · limit 말고 다른 게 붙으면 옛 경로(대조용 _x=1).
   ★ 동점 순서: 옛 경로와 같은 기준 + 마지막에 키(옛 경로에도 같이 넣었다). PG 의 DESC 는 NULL 이 앞이라 NULLS LAST 를 붙인다(MSSQL 과 같게). */
/* GiST 로 후보를 고르고(&& 는 PG 기하 연산이라 1e-6 만큼 너그럽다 — 경계 밖 필지가 한두 개 더 걸렸다, 10-25 대조) 정확한 비교로 다시 거른다 = 옛 경로와 같은 조건 */
const 상자 = '(box(point(minx, miny), point(maxx, maxy)) && box(point($1, $2), point($3, $4)) AND maxx >= $1 AND minx <= $3 AND maxy >= $2 AND miny <= $4)';
const 소수7 = x => Math.round(x * 1e7) / 1e7;
function 층켜짐(req, 허용) {
  /* _svc=1 = 켜기 전 대조용(서비스DB 길을 강제로) — map 이 꺼져 있어도 이 요청만 */
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().map || 강제) || Date.now() < 쉬는끝) return null;
  if (Object.keys(req.query).some(k => !허용.includes(k) && k !== '_svc')) return null;
  const b = String(req.query.bbox || '').split(',').map(Number);
  if (b.length !== 4 || b.some(n => !Number.isFinite(n))) return null;   // 틀린 bbox → 옛 경로가 400 을 낸다
  return b;
}
function 층(이름, 만들기) {
  return async (req, res, next) => {
    const b0 = 층켜짐(req, ['bbox', 'limit']);
    if (!b0) return next();
    /* 옛 경로는 bbox 를 sql.Decimal(12, 7) 로 넘긴다 = 소수 7자리로 반올림된 값으로 비교. 같게 맞춘다(닫힌 핀은 sql.Float — 그대로) */
    const b = 이름 === 'closed-pins' ? b0 : b0.map(소수7);
    try {
      const 몸 = await 만들기(req, b);
      실패 = 0; 세기('map:' + 이름, 'hit');
      res.set('X-Svc', 'hit');
      return res.json(몸);
    } catch (e) {
      if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
      세기('map:' + 이름, 'fallback'); return next();
    }
  };
}
function 면들(rows) {   // 옛 toFC 와 같다: geojson 이 없거나 깨진 줄은 빼고, 나머지 칸은 그대로 properties
  const features = [];
  for (const row of rows) {
    if (!row.geojson) continue;
    let g;
    try { g = JSON.parse(row.geojson); } catch { continue; }
    const { geojson, ...props } = row;
    features.push({ type: 'Feature', geometry: g, properties: { ...props } });
  }
  return { type: 'FeatureCollection', features };
}
const 필지 = 층('parcels', async (req, b) => {
  const limit = 상한(req.query.limit, 3000, 8000);
  const r = await pg().query(`SELECT pnu, jibun, addr, jiga, geojson, complex_id, complex_nm, dong_cnt, has_recap
                                FROM svc.lyr_parcel WHERE ${상자} LIMIT $5`, [b[0], b[1], b[2], b[3], limit + 1]);
  const 잘림 = r.rows.length > limit;
  const fc = 면들(잘림 ? r.rows.slice(0, limit) : r.rows);
  fc.상한 = limit; fc.잘림 = 잘림;
  return fc;
});
const 건물 = 층('buildings', async (req, b) => {
  const limit = 상한(req.query.limit, 3000, 8000);
  const r = await pg().query(`SELECT bd_mgt_sn, buld_nm, buld_no, rd_nm, gro_flo_co, area_m2_approx, pnu, geojson, complex_id, complex_nm, has_recap
                                FROM svc.lyr_building WHERE ${상자} LIMIT $5`, [b[0], b[1], b[2], b[3], limit + 1]);
  const 잘림 = r.rows.length > limit;
  const fc = 면들(잘림 ? r.rows.slice(0, limit) : r.rows);
  fc.상한 = limit; fc.잘림 = 잘림;
  return fc;
});
const 법정동 = 층('lawds', async (req, b) => {
  const r = await pg().query(`SELECT v.lawd_cd, v.emd_nm, v.full_nm, v.centroid_lat, v.centroid_lng, v.complex_cnt, v.dong_cnt, v.hhld_cnt,
                                     v.max_amount, v.max_area, v.max_ymd, v.trade_cnt, g.geojson
                                FROM svc.lyr_lawd_stat v LEFT JOIN svc.lyr_lawd_geo g ON g.lawd_cd = v.lawd_cd
                               WHERE ${상자.replace(/minx|miny|maxx|maxy/g, m => 'v.' + m)}
                               ORDER BY v.complex_cnt DESC NULLS LAST, v.lawd_cd`, [b[0], b[1], b[2], b[3]]);
  const features = r.rows.filter(d => d.geojson).map(d => ({
    type: 'Feature',
    geometry: JSON.parse(d.geojson),
    properties: {
      lawd_cd: d.lawd_cd, emd_nm: d.emd_nm, full_nm: d.full_nm,
      centroid_lat: d.centroid_lat, centroid_lng: d.centroid_lng,
      complex_cnt: d.complex_cnt, dong_cnt: d.dong_cnt, hhld_cnt: d.hhld_cnt,
      max_amount: d.max_amount, max_area: d.max_area, max_ymd: d.max_ymd,
      trade_cnt: d.trade_cnt,
    },
  }));
  return { type: 'FeatureCollection', features };
});
const 행정동 = 층('adms', async (req, b) => {
  const r = await pg().query(`SELECT * FROM svc.lyr_adm WHERE minx <= $3 AND maxx >= $1 AND miny <= $4 AND maxy >= $2`, [b[0], b[1], b[2], b[3]]);
  const features = r.rows.filter(d => d.geojson).map(d => ({
    type: 'Feature',
    geometry: JSON.parse(d.geojson),
    properties: {
      adm_cd_sgis: d.adm_cd_sgis, year: d.year, adm_nm: d.adm_nm, emd_nm: d.emd_nm,
      centroid_lat: d.centroid_lat, centroid_lng: d.centroid_lng,
      연결: d.연결, 연결비율: d.연결비율, 상가수: d.상가수,
      갈림내역: d.연결 === '갈림' ? d.갈림내역 : null,
      adm_cd_mois: d.연결 === '확인' ? d.adm_cd_mois : null,
      mois_nm: d.mois_nm,
    },
  }));
  return { type: 'FeatureCollection', 출처: '통계청 SGIS 행정구역 경계', features };
});
const 닫힌핀 = 층('closed-pins', async (req, b) => {
  const r = await pg().query(`SELECT site_key, pnu, shter_day, "이름", "이름출처", "주용도", "동수", "총괄세대", "사용승인일", "폐쇄구분",
                                     plat_plc, new_plat_plc, lat, lng, now_complex_id, now_nm, "위치근거"
                                FROM svc.lyr_closed WHERE lat BETWEEN $2 AND $4 AND lng BETWEEN $1 AND $3
                               ORDER BY "동수" DESC NULLS LAST, shter_day DESC NULLS LAST, site_key LIMIT 800`, [b[0], b[1], b[2], b[3]]);
  return { 핀: r.rows };
});
/* 신축 핀: bbox 가 없으면 전국 목록(옛 경로와 같게) — 그래서 층() 을 안 쓰고 따로 */
async function 신축핀(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().map || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => k !== 'bbox' && k !== 'limit' && k !== '_svc')) return next();
  const raw = req.query.bbox == null ? null : String(req.query.bbox);
  const b = String(raw || '').split(',').map(Number).map(소수7);
  const 있음 = raw !== null;
  if (있음 && !(b.length === 4 && b.every(Number.isFinite))) return next();
  try {
    const lim = 상한(req.query.limit, 200, 500);
    const r = await pg().query(`SELECT kapt_code, kapt_name, lawd_nm, pnu, "세대", "동수", "사용승인", "거래", "최고가", centroid_lat, centroid_lng
                                  FROM svc.lyr_newbuild
                                 WHERE centroid_lat IS NOT NULL ${있음 ? 'AND centroid_lng BETWEEN $2 AND $4 AND centroid_lat BETWEEN $3 AND $5' : ''}
                                 ORDER BY "거래" DESC NULLS LAST, "세대" DESC NULLS LAST, kapt_code LIMIT $1`,
                                있음 ? [lim, b[0], b[1], b[2], b[3]] : [lim]);
    실패 = 0; 세기('map:newbuilds', 'hit'); res.set('X-Svc', 'hit');
    return res.json({ markers: r.rows });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('map:newbuilds', 'fallback'); return next();
  }
}

module.exports = { 단지응답, 마커, 필지, 건물, 법정동, 행정동, 닫힌핀, 신축핀, pg, 지금설정 };
