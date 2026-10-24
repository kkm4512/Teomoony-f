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
  const x = 셈.get(kind) || { hit: 0, miss: 0, fallback: 0, ms: 0, stored: 0 };
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
    if (!r.rows.length) { 세기(kind, 'miss', Date.now() - a); res.set('X-Svc', 'miss'); 지나며담기(res, id, kind, v); return next(); }
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


/* 지나며 담기(10-25): 아직 발행 안 된 단지(작은 단지 46만 곳 등)는 옛 경로가 답한다 — 그 **답을 그대로** 서비스DB 에 담아 둔다.
   발행기가 받는 것과 같은 몸(같은 서버 · 같은 주소 · 물음표 없음 = _timing 없음)이라 값이 같다. 다음부터는 서비스DB 에서 · 바뀌면 매시 발행이 고친다.
   ★ 200 만(없는 번호를 두드리는 봇이 404 를 쌓지 않게). 이미 있으면 건드리지 않는다(발행기가 담은 게 우선). 실패는 조용히 넘어간다 — 화면에는 상관없다. */
function 지나며담기(res, id, kind, v) {
  /* res.send 를 감싼다 — 옛 경로는 res.json(→ send(글)) 도, 상세처럼 res.type(json).send(글) 도 쓴다. 글(문자열)일 때 한 번만 담는다 */
  const 원래 = res.send.bind(res);
  let 담음 = false;
  res.send = body => {
    try {
      if (!담음 && res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body)) && /json/.test(String(res.get('Content-Type') || ''))) {
        담음 = true;
        const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
        setImmediate(() => {
          let j; try { j = JSON.parse(raw.toString('utf8')); } catch { return; }
          if (j && j.error) return;
          zlib.gzip(raw, { level: 6 }, (err, gz) => {
            if (err) return;
            const sha = require('crypto').createHash('sha256').update(raw).digest('hex');
            pg().query(`INSERT INTO svc.complex_json (complex_id, kind, status, body_gz, sha, bytes, publish_id, updated_at)
                        VALUES ($1, $2, 200, $3, $4, $5, $6, now()) ON CONFLICT (complex_id, kind) DO NOTHING`,
                       [id, kind, gz, sha, raw.length, v || 0]).then(() => 세기(kind, 'stored'), () => {});
          });
        });
      }
    } catch (e) { /* 담기 실패는 화면과 상관없다 */ }
    return 원래(body);
  };
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


/* ---------- 자동완성 (2단계 둘째 묶음, 2026-10-25) ----------
   발행기(svc_layers.py · svc_suggest_src.py)가 묶음마다 **검색어와 상관없는 값을 적재DB 에서 미리 계산**해 svc.lyr_sg_* 에 담는다.
   여기서는 옛 질의와 같은 조건으로 거르고 · 같은 순서로 세우고 · 같은 상한으로 자른 뒤, **옛 경로와 같은 함수(묶음만들기)** 로 응답을 만든다.
   ★ 적재DB 는 Korean_Wansung_CI_AS(대소문자 무시) → LIKE 는 ILIKE, '=' 는 lower() 끼리. 이름 정렬은 svc.ko_ci(ICU, 대소문자 무시).
   ★ NULL 순서: MSSQL 은 오름차순에서 NULL 이 먼저 · 내림차순에서 나중 — PG 는 반대가 기본이라 하나하나 적는다.
   ★ 켜고 끄기: svc_mode.json "suggest". _svc=1 = 켜기 전 대조용. */
const { 도로명맞춤, 묶음만들기, 종류꼬리 } = require('./suggest_shape');
const 같이 = s => String(s == null ? '' : s).replace(/[\\%_]/g, m => '\\' + m);   // PG LIKE 이스케이프(옛 글자그대로 의 [..] 대신)
const K = 'COLLATE svc.ko_ci';
/* 청약 공고일(rcrit_pblanc_de)은 '2026-10-14' 와 '20261014  ' 가 섞여 있다. 적재DB(Windows 콜레이션)는 하이픈을 1단계에서 무시하고
   (같은 날로 보고) 마지막에 하이픈 있는 쪽을 크게 친다 · 끝 빈칸은 무시 — 같게 맞춘다(10-25 청약 핀 대조에서 13건) */
/* 이름 정렬: 적재DB(Windows 콜레이션 '단어 정렬')는 하이픈(전각 포함)과 작은따옴표를 1단계에서 무시하고, 같으면 그것이 든 쪽을 크게 친다
   ('중구－가로가판대－37' 이 '중구24시…' 뒤로 — 10-25 자동완성 대조 1건). ICU 는 문장부호를 숫자 앞에 둬서 따로 맞춘다 */
const 이름순 = c => `translate(${c}, '-－‐‑''', '') ${K} NULLS FIRST, coalesce(${c} ~ '[-－‐‑'']', false)`;
const 날오름 = c => `replace(rtrim(${c}), '-', '') NULLS FIRST, coalesce(${c} LIKE '%-%', false)`;
const 날내림 = c => `replace(rtrim(${c}), '-', '') DESC NULLS LAST, coalesce(${c} LIKE '%-%', false) DESC`;
async function 꼬리떼기PG(q) {
  if (!q || /\d/.test(q) || !종류꼬리.test(q)) return null;
  const 후보 = (q.endsWith('빌라') ? [q.slice(0, -1)] : []).concat([q.replace(종류꼬리, '').trim()]).filter(v => [...v].length >= 2);
  if (!후보.length) return null;
  const 있나 = async v => (await pg().query(`
      (SELECT 1 FROM svc.lyr_sg_complex WHERE complex_nm ILIKE $1 LIMIT 1)
      UNION ALL (SELECT 1 FROM svc.lyr_sg_complex_name WHERE src = 'alias' AND name ILIKE $1 LIMIT 1)
      UNION ALL (SELECT 1 FROM svc.lyr_sg_complex_name WHERE src = 'kapt' AND name ILIKE $1 LIMIT 1)`, [`%${같이(v)}%`])).rows.length > 0;
  if (await 있나(q)) return null;
  for (const v of 후보) if (await 있나(v)) return v;
  return null;
}
async function 자동완성(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().suggest || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => k !== 'q' && k !== '_svc')) return next();
  const raw = String(req.query.q || '').trim().slice(0, 60);
  const 길이 = [...raw].length;
  if (!raw || 길이 < 2) return next();   // 빈 것 · 한 글자는 옛 경로가 DB 없이 바로 답한다
  try {
    const t0 = Date.now();
    let 글자 = 도로명맞춤(raw);
    const 뗀말 = await 꼬리떼기PG(도로명맞춤(raw));
    if (뗀말) 글자 = 뗀말;
    const e = 같이(글자);
    const q = `%${e}%`, p = `${e}%`, q0 = `%${e.replace(/\s+/g, '')}%`;
    const 짧은 = /\d/.test(raw)
      ? (() => { const w = 도로명맞춤(raw).replace(/번지/g, '').trim().split(/\s+/); return w.length >= 2 ? w.slice(-2).join(' ') : null; })()
      : null;
    const qid = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
    const 주소 = /\d/.test(raw) && 길이 >= 3;
    const Q = (sql, v) => pg().query(sql, v).then(r => r.rows);
    const rs = await Promise.all([
      /* 1 구 */
      Q(`SELECT sgg_cd, sgg_nm, sido_nm, 전체, minx, miny, maxx, maxy FROM (
           SELECT *, count(*) OVER ()::int AS 전체, CASE WHEN lower(sgg_nm) = lower($1) THEN 0 WHEN sgg_nm ILIKE $3 THEN 1 ELSE 2 END AS 순
             FROM svc.lyr_sg_sgg WHERE sgg_nm ILIKE $2) g
         ORDER BY 순, ${이름순('sgg_nm')}, sgg_cd LIMIT 3`, [raw, q, p]),
      /* 2 법정동 */
      Q(`SELECT lawd_cd, emd_nm, full_nm, 전체, "경계있음", minx, miny, maxx, maxy FROM (
           SELECT *, count(*) OVER ()::int AS 전체, CASE WHEN lower(emd_nm) = lower($1) THEN 0 WHEN emd_nm ILIKE $3 THEN 1 ELSE 2 END AS 순
             FROM svc.lyr_sg_lawd WHERE emd_nm ILIKE $2) d
         ORDER BY 순, ${이름순('emd_nm')}, lawd_cd LIMIT 6`, [raw, q, p]),
      /* 3 행정동 */
      Q(`SELECT adm_cd_sgis, year, adm_nm, emd_nm, mois_nm, "연결비율", minx, miny, maxx, maxy, count(*) OVER ()::int AS 전체,
                CASE WHEN emd_nm ILIKE $2 THEN emd_nm ELSE mois_nm END AS 걸린이름, "지금없음"
           FROM svc.lyr_sg_adm WHERE emd_nm ILIKE $2 OR mois_nm ILIKE $2
          ORDER BY CASE WHEN lower(emd_nm) = lower($1) OR lower(mois_nm) = lower($1) THEN 0 WHEN emd_nm ILIKE $3 THEN 1 ELSE 2 END,
                   ${이름순('emd_nm')}, adm_cd_sgis LIMIT 5`, [raw, q, p]),
      /* 4 단지 */
      Q(`WITH c AS (
           SELECT complex_id FROM svc.lyr_sg_complex WHERE nm_ns ILIKE $1
           UNION SELECT complex_id FROM svc.lyr_sg_complex WHERE complex_id = $2::int
           UNION SELECT n.complex_id FROM svc.lyr_sg_complex_name n WHERE n.live = 1 AND n.name_ns ILIKE $1
           UNION SELECT complex_id FROM svc.lyr_sg_complex WHERE $3::boolean AND (rep_plat_plc ILIKE $4 OR rep_road_addr ILIKE $4))
         SELECT x.complex_id, x.complex_nm, x.rep_plat_plc, x.hhld_cnt_sum, x.dong_cnt, x.centroid_lat, x.centroid_lng,
                count(*) OVER ()::int AS 전체, x."실거래이름", x."폐쇄"
           FROM c JOIN svc.lyr_sg_complex x ON x.complex_id = c.complex_id
          ORDER BY CASE WHEN x.complex_id = $2::int THEN 0 WHEN x.complex_nm ILIKE $5 THEN 1 WHEN x."실거래이름" ILIKE $5 THEN 1 ELSE 2 END,
                   x.hhld_cnt_sum DESC NULLS LAST, x.complex_id LIMIT 5`, [q0, qid, 주소, q, p]),
      /* 5 신축 */
      Q(`SELECT kapt_code, kapt_name, lawd_nm, "세대", centroid_lat, centroid_lng, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_newbuild WHERE name_ns ILIKE $1
          ORDER BY CASE WHEN kapt_name ILIKE $2 THEN 0 ELSE 1 END, "세대" DESC NULLS LAST, kapt_code LIMIT 3`, [q0, p]),
      /* 6 재개발 · 정비 */
      Q(`SELECT present_sn, zone_nm, biz_nm, propel_nm, centroid_lat, centroid_lng, minx, miny, maxx, maxy, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_redev WHERE zone_ns ILIKE $1 OR biz_ns ILIKE $1
          ORDER BY CASE WHEN zone_nm ILIKE $2 THEN 0 ELSE 1 END, ${이름순('zone_nm')}, present_sn LIMIT 4`, [q0, p]),
      /* 7 지하철역 */
      Q(`SELECT sttn_nm, "노선", lat, lon, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_subway WHERE sttn_nm ILIKE $2
          ORDER BY CASE WHEN lower(sttn_nm) = lower($1) OR lower(sttn_nm) = lower($1 || '역') THEN 0 WHEN sttn_nm ILIKE $3 THEN 1 ELSE 2 END,
                   ${이름순('sttn_nm')} LIMIT 4`, [raw, q, p]),
      /* 8 학교 */
      Q(`SELECT school_nm, school_se, "주소", lat, lon, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_school WHERE school_nm ILIKE $1
          ORDER BY CASE WHEN school_nm ILIKE $2 THEN 0 ELSE 1 END, ${이름순('school_nm')}, ${이름순('"주소"')}, ${이름순('school_se')} LIMIT 4`, [q, p]),
      /* 9 유치원 */
      Q(`SELECT kinder_nm, "주소", lat, lon, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_kinder WHERE kinder_nm ILIKE $1
          ORDER BY CASE WHEN kinder_nm ILIKE $2 THEN 0 ELSE 1 END, ${이름순('kinder_nm')}, ${이름순('"주소"')} LIMIT 3`, [q, p]),
      /* 10 학원 */
      Q(`SELECT aca_nm, realm_sc_nm, "주소", lat, lon, count(*) OVER ()::int AS 전체,
                (SELECT count(*)::int FROM svc.lyr_sg_academy x WHERE x.lat IS NULL AND x.aca_nm ILIKE $1) AS 좌표없음
           FROM svc.lyr_sg_academy WHERE lat IS NOT NULL AND aca_nm ILIKE $1
          ORDER BY CASE WHEN aca_nm ILIKE $2 THEN 0 ELSE 1 END, ${이름순('aca_nm')}, ${이름순('"주소"')}, ${이름순('realm_sc_nm')} LIMIT 4`, [q, p]),
      /* 11 상가 — 앞부분 일치 */
      /* 적재DB 처럼 너비도 무시: nm_key = lower(NFKC(이름)) · 검색어도 같게 */
      Q(`SELECT bizes_nm, brch_nm, inds_scls_nm, "주소", lat, lon, adong_nm, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_semas WHERE nm_key LIKE $2
          ORDER BY CASE WHEN nm_key = $1 THEN 0 ELSE 1 END, ${이름순('bizes_nm')}, ${이름순('brch_nm')}, ${이름순('"주소"')}, bizes_id LIMIT 5`,
        [raw.normalize('NFKC').toLowerCase(), 같이(글자.normalize('NFKC').toLowerCase()) + '%']),
      /* 12 폐쇄 · 말소 대장 */
      Q(`SELECT site_key, "이름", "폐쇄구분", shter_day, "주용도", "총괄세대", plat_plc, lat, lng, now_complex_id, "동수",
                CASE WHEN "이름" ILIKE $2 THEN 0 ELSE 1 END AS 주소로, count(*) OVER ()::int AS 전체
           FROM svc.lyr_sg_closed
          WHERE "이름_ns" ILIKE $1
             OR ($4::text IS NOT NULL AND ("지번짧게" = $4 OR "지번짧게" LIKE $5 || '-%' OR "도로짧게" = $4 OR "도로짧게" LIKE $5 || '-%'))
          ORDER BY CASE WHEN "이름" ILIKE $3 THEN 0 WHEN "이름" ILIKE $2 THEN 1 ELSE 2 END, "총괄세대" DESC NULLS LAST, "동수" DESC NULLS LAST,
                   ${이름순('"이름"')}, site_key LIMIT 4`, [q0, q, p, 짧은, 같이(짧은)]),
      /* 13 청약 공고 */
      Q(`WITH z AS (
           SELECT a.*, CASE WHEN a.name_ns ILIKE $1 THEN 1 ELSE 0 END AS 이름맞음, CASE WHEN a.house_nm ILIKE $2 THEN 1 ELSE 0 END AS 앞맞음
             FROM svc.lyr_sg_applyhome a
            WHERE a.g IN (SELECT b.g FROM svc.lyr_sg_applyhome b WHERE b.name_ns ILIKE $1)),
         y AS (
           SELECT z.*, max(이름맞음) OVER w AS 맞음, max(앞맞음) OVER w AS 앞, count(*) OVER w AS 공고수,
                  row_number() OVER (PARTITION BY g ORDER BY ${날오름('rcrit_pblanc_de')}, pblanc_no NULLS FIRST) AS 첫
             FROM z WINDOW w AS (PARTITION BY g)),
         k AS (SELECT g, string_agg("공고종류", ',' ORDER BY "공고종류") AS 종류들 FROM (SELECT DISTINCT g, "공고종류" FROM svc.lyr_sg_applyhome) d GROUP BY g)
         SELECT y.house_manage_no, y.house_nm, y."공고종류", k.종류들, y.공고수::int AS 공고수, y.rcrit_pblanc_de, y.hssply_adres, y.lat, y.lng,
                count(*) OVER ()::int AS 전체
           FROM y JOIN k ON k.g = y.g WHERE y.첫 = 1 AND y.맞음 = 1
          ORDER BY y.앞 DESC, ${날내림('y.rcrit_pblanc_de')}, y.house_manage_no LIMIT 4`, [q0, p]),
      /* 14 바뀐 행정동 — 날짜는 글자로 담았다: 옛 경로(tedious)처럼 UTC 자정 Date 로 */
      Q(`SELECT *, count(*) OVER ()::int AS 전체 FROM svc.lyr_sg_hdong_old WHERE "행정동명" ILIKE $2
          ORDER BY CASE WHEN lower("행정동명") = lower($1) THEN 0 WHEN "행정동명" ILIKE $3 THEN 1 ELSE 2 END, ${이름순('"행정동명"')}, "행정동코드" LIMIT 4`, [raw, q, p])
        .then(rows => rows.map(x => ({ ...x, 마지막: x.마지막 && new Date(x.마지막 + 'T00:00:00Z'), 후분기: x.후분기 && new Date(x.후분기 + 'T00:00:00Z') }))),
    ]);
    const 묶음 = 묶음만들기(rs, 길이);
    실패 = 0; 세기('suggest', 'hit'); res.set('X-Svc', 'hit');
    return res.json({ q: raw, ms: Date.now() - t0, 묶음, ...(뗀말 ? { 꼬리뗌: { 원래: raw, 찾은말: 뗀말 } } : {}) });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('suggest', 'fallback'); return next();
  }
}


/* ---------- 목록 검색 /api/complexes?q= (2단계 둘째 묶음, 2026-10-25) ----------
   옛 처리(server.js '검색')와 같은 갈래 · 같은 조건 · 같은 순서 · 같은 JS 마무리. 원천은 svc.lyr_sg_cmap(단지 목록 칸) · sg_atch(부속지번) ·
   sg_complex_name(K-apt · 실거래 이름) · lyr_lawd_stat · sg_newbuild · sg_redev · sg_applyhome · sg_hdong_pair/plaw.
   ★ 켜고 끄기: svc_mode.json "search". 물음표는 q · limit · recap 만(그 밖은 옛 경로). */
const 목록칸 = `v.complex_id, v.complex_nm, v.grouping_rule, v.has_recap, v.rep_jibun, v.rep_plat_plc, v.rep_road_addr, v.lawd_nm,
                v.dong_cnt, v.pnu_cnt, v.parcel_hit, v.hhld_cnt_sum, v.tot_area_sum, v.oldest_use_apr, v.jiga_avg, v.centroid_lat, v.centroid_lng`;
async function 목록검색(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().search || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => !['q', 'limit', 'recap', '_svc'].includes(k))) return next();
  let q = 도로명맞춤(String(req.query.q || '').trim().slice(0, 200));
  if (/^\d{10,}$/.test(q)) return next();   // 옛 경로는 sql.Int 로 넘긴다 — 아주 긴 숫자는 그쪽에 맡긴다
  const limit = 상한(req.query.limit, 50, 300);
  const onlyRecap = req.query.recap === '1';
  let 꼬리뗌 = null;
  try {
    const Q = (sql, v) => pg().query(sql, v).then(r => r.rows);
    { const 뗀 = await 꼬리떼기PG(q); if (뗀) { 꼬리뗌 = { 원래: q, 찾은말: 뗀 }; q = 뗀; } }
    const e = 같이(q);
    const qq = q ? `%${e}%` : null, q0 = `%${e.replace(/\s+/g, '')}%`;
    const qid = /^\d+$/.test(q) ? Number(q) : null;
    /* 10-25: 이름 · 지번 · 도로명 세 칸 ILIKE 대신 s_all(소문자 한 칸) LIKE — 두 글자 검색(trigram 못 씀)이 2.6초 → 아래.
       부속지번 맞음(am)은 해시 반조인으로 · 보여 줄 줄의 부속지번만 따로 꺼낸다(정렬 색인 순으로 읽다가 상한에서 멈출 수 있게) */
    const 본 = Q(`
      WITH am AS MATERIALIZED (SELECT complex_id, min(plat_plc ${K}) AS 부속지번 FROM svc.lyr_sg_atch WHERE $1::text IS NOT NULL AND plat_plc ILIKE $1 GROUP BY complex_id)
      SELECT ${목록칸},
             CASE WHEN $1::text IS NOT NULL AND NOT (v.complex_nm ILIKE $1 OR v.rep_plat_plc ILIKE $1 OR v.rep_road_addr ILIKE $1)
                  THEN (SELECT am.부속지번 FROM am WHERE am.complex_id = v.complex_id) END AS 부속지번,
             v."폐쇄"
        FROM svc.lyr_sg_cmap v
       WHERE ${[...q].length >= 3
               /* 세 글자 이상: trigram 색인으로 맞는 번호를 먼저 모은다(드문 말도 빠르다) */
               ? `v.complex_id IN (SELECT complex_id FROM svc.lyr_sg_cmap WHERE s_all LIKE lower($1) UNION SELECT complex_id FROM am UNION SELECT $2::int WHERE $2::int IS NOT NULL)`
               /* 두 글자 이하 · 빈 검색: 색인이 못 받치니 정렬 순으로 읽다가 상한에서 멈춘다(흔한 말이 대부분) */
               : `(($1::text IS NULL AND $2::int IS NULL) OR ($1::text IS NOT NULL AND v.s_all LIKE lower($1))
                   OR v.complex_id IN (SELECT complex_id FROM am) OR v.complex_id = $2::int)`}
         AND ($3::boolean = false OR v.has_recap)
       ORDER BY v.dong_cnt DESC NULLS LAST, v.pnu_cnt DESC NULLS LAST, v.complex_id
       LIMIT $4`, [qq, qid, onlyRecap, limit + 1]);
    const 법정동들 = q ? Q(`SELECT lawd_cd, emd_nm, full_nm, centroid_lat, centroid_lng, minx AS bbox_minx, miny AS bbox_miny, maxx AS bbox_maxx, maxy AS bbox_maxy,
                                 complex_cnt, trade_cnt, max_amount
                            FROM svc.lyr_lawd_stat WHERE emd_nm ILIKE $1 OR full_nm ILIKE $1 OR lawd_cd ILIKE $1
                           ORDER BY complex_cnt DESC NULLS LAST, ${이름순('emd_nm')}, lawd_cd LIMIT 8`, [qq]) : [];
    const 신축들 = q ? Q(`SELECT kapt_code, kapt_name, lawd_nm, pnu, "세대", "동수", "사용승인", "거래", centroid_lat, centroid_lng, kapt_addr
                           FROM svc.lyr_sg_newbuild WHERE name_ns ILIKE $1 OR kapt_addr ILIKE $2 OR doro_juso ILIKE $2
                          ORDER BY "거래" DESC NULLS LAST, "세대" DESC NULLS LAST, kapt_code LIMIT 8`, [q0, qq]) : [];
    const 이름들 = q ? Q(`SELECT complex_id, min(name ${K}) AS 걸린이름 FROM (
                             SELECT complex_id, name FROM svc.lyr_sg_complex_name WHERE src IN ('kapt', 'kaptpnu') AND name_ns ILIKE $1
                             UNION ALL SELECT complex_id, NULL FROM svc.lyr_sg_complex_name WHERE src = 'alias' AND name_ns ILIKE $1
                             UNION ALL SELECT complex_id, NULL FROM svc.lyr_sg_complex WHERE nm_ns ILIKE $1) x
                          GROUP BY complex_id ORDER BY complex_id`, [q0]) : [];
    const 정비들 = q ? Q(`SELECT present_sn, zone_nm, biz_lclas_nm, biz_nm, propel_nm, propel_pct, area_m2
                           FROM svc.lyr_sg_redev WHERE has_geo = 1 AND (zone_ns ILIKE $1 OR biz_ns ILIKE $1)
                          ORDER BY CASE WHEN zone_nm ILIKE $2 THEN 0 ELSE 1 END, area_m2 DESC NULLS LAST, present_sn LIMIT 8`, [q0, qq]) : [];
    const 공고들 = q ? Q(`SELECT house_manage_no, house_nm, "공고종류", rcrit_pblanc_de, hssply_adres, tot_suply, lat, lng FROM (
                             SELECT a.*, row_number() OVER (PARTITION BY house_manage_no ORDER BY ${날내림('rcrit_pblanc_de')}, pblanc_no DESC NULLS LAST) AS rn
                               FROM svc.lyr_sg_applyhome a WHERE a.name_ns ILIKE $1) x
                          WHERE x.rn = 1 ORDER BY ${날내림('x.rcrit_pblanc_de')}, x.house_manage_no LIMIT 8`, [q0]) : [];
    const [r0, lawds0, newbuilds, kr, redevs, applyhomes] = await Promise.all([본, 법정동들, 신축들, 이름들, 정비들, 공고들]);
    let lawds = lawds0;
    let 행들 = r0;
    if (q) {
      const 있음 = new Set(행들.map(x => x.complex_id));
      const 더 = kr.filter(x => !있음.has(x.complex_id)).slice(0, 20);
      if (더.length) {
        const er = await Q(`SELECT ${목록칸}, NULL AS 부속지번 FROM svc.lyr_sg_cmap v
                             WHERE v.complex_id = ANY($1::int[]) AND ($2::boolean = false OR v.has_recap)`, [더.map(x => x.complex_id), onlyRecap]);
        const 이름 = new Map(더.map(x => [x.complex_id, x.걸린이름]));
        행들 = 행들.concat(er.map(x => ({ ...x, 'K-apt이름': 이름.get(x.complex_id) || undefined })))
          .sort((a, b) => (b.dong_cnt - a.dong_cnt) || (b.pnu_cnt - a.pnu_cnt) || (a.complex_id - b.complex_id));
      }
    }
    const 잘림 = 행들.length > limit;
    const _행 = 잘림 ? 행들.slice(0, limit) : 행들;
    if (_행.length) {
      const al = await Q(`SELECT complex_id, "실거래이름" FROM svc.lyr_sg_cmap WHERE complex_id = ANY($1::int[]) AND "실거래이름" IS NOT NULL`, [_행.map(x => x.complex_id)]);
      const 별 = new Map(al.map(x => [x.complex_id, x.실거래이름]));
      _행.forEach(x => { if (별.has(x.complex_id)) x.실거래이름 = 별.get(x.complex_id); });
    }
    let 바뀜 = null;
    const 옛이름 = q.replace(/\s+/g, '');
    if (옛이름 && 옛이름.length <= 20 && /동$|가$|면$|읍$/.test(옛이름)) {
      const [쌍0, 법] = await Promise.all([
        Q(`SELECT "행정동코드", "시군구명", "행정동명", "마지막", "후분기", "새코드", "새이름", "새현행" FROM svc.lyr_sg_hdong_pair
            WHERE lower("행정동명") = lower($1) ORDER BY "행정동코드", ${이름순('"새이름"')}, "새코드"`, [옛이름]),
        Q(`SELECT DISTINCT "옛코드", "법정동코드", "법정동명" FROM svc.lyr_sg_hdong_plaw WHERE lower("행정동명") = lower($1) ORDER BY "옛코드", "법정동코드"`, [옛이름])]);
      const 쌍 = 쌍0.map(x => ({ ...x, 마지막: x.마지막 && new Date(x.마지막 + 'T00:00:00Z'), 후분기: x.후분기 && new Date(x.후분기 + 'T00:00:00Z') }));
      if (쌍.length && 법.length) {
        const 분기 = d => { const t = new Date(d); return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
        const 옛 = [...new Map(쌍.map(x => [x.행정동코드, x])).values()];
        바뀜 = 옛.map(o => ({
          옛: o.행정동명, 시군구: o.시군구명, 전: 분기(o.마지막), 후: 분기(o.후분기),
          지금: [...new Set(쌍.filter(x => x.행정동코드 === o.행정동코드).map(x => x.새이름 + (x.새현행 ? '' : '(그 뒤 또 바뀜)')))],
          법정동: [...new Map(법.filter(x => x.옛코드 === o.행정동코드).map(x => [x.법정동코드, x.법정동명])).entries()].map(([cd, nm]) => ({ cd, nm })),
        }));
        const 코드 = [...new Set(법.map(x => x.법정동코드))].filter(c => /^\d{10}$/.test(c)).slice(0, 20);
        const [xl, xc] = await Promise.all([
          Q(`SELECT lawd_cd, emd_nm, full_nm, centroid_lat, centroid_lng, minx AS bbox_minx, miny AS bbox_miny, maxx AS bbox_maxx, maxy AS bbox_maxy,
                    complex_cnt, trade_cnt, max_amount
               FROM svc.lyr_lawd_stat WHERE lawd_cd = ANY($1::text[])
              ORDER BY complex_cnt DESC NULLS LAST, ${이름순('emd_nm')}, lawd_cd LIMIT 8`, [코드]),
          Q(`SELECT ${목록칸}, NULL AS 부속지번 FROM svc.lyr_sg_cmap v
              WHERE left(v.rep_pnu, 10) = ANY($1::text[]) AND ($2::boolean = false OR v.has_recap)
              ORDER BY v.dong_cnt DESC NULLS LAST, v.pnu_cnt DESC NULLS LAST, v.complex_id LIMIT $3`, [코드, onlyRecap, limit + 1])]);
        const 있는동 = new Set(lawds.map(x => x.lawd_cd));
        lawds = lawds.concat(xl.filter(x => !있는동.has(x.lawd_cd)).map(x => ({ ...x, 옛동으로: 옛이름 })));
        const 있는단지 = new Set(_행.map(x => x.complex_id));
        const 더단지 = xc.filter(x => !있는단지.has(x.complex_id)).map(x => ({ ...x, 옛동으로: 옛이름 }));
        const 남는칸 = Math.max(0, limit - _행.length);
        _행.push(...더단지.slice(0, 남는칸));
        if (더단지.length > 남는칸) 바뀜.forEach(b => { b.잘림 = true; });
      }
    }
    실패 = 0; 세기('search', 'hit'); res.set('X-Svc', 'hit');
    return res.json({ count: _행.length, 상한: limit, 잘림: 잘림 || !!(바뀜 && 바뀜.some(b => b.잘림)), items: _행, lawds, newbuilds, redevs, applyhomes, 바뀜, 꼬리뗌 });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('search', 'fallback'); return next();
  }
}


/* ---------- 남은 넷 (2026-10-25 사장님 "2번 ㄱㄱ") ----------
   지금 위치 지역(/api/areas/here) · 내 위치 주변(/api/complexes/near) · 청약 핀(/api/applyhome/pins): svc.lyr_here_* · lyr_near · lyr_apin(_cnt)
   호 상세(/api/ho/:pk) · 주변 지점(/points?kind=) · 점포 목록(/poi-list?life=): 호 · 조합이 너무 많아 미리 못 만든다 → **지나며 담기**(svc.resp_cache, 24시간 · 그 단지가 바뀌면 매시 발행이 지움).
   ★ 켜고 끄기: svc_mode.json "misc" · "cache". _svc=1 은 켜기 전 대조용. */
const 소수8 = x => Math.round(x * 1e8) / 1e8;
async function 여기지역(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().misc || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => !['lat', 'lng', '_svc'].includes(k))) return next();
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return next();
  try {
    const y = 소수8(lat), x = 소수8(lng);   // 옛 경로: sql.Decimal(11, 8) · (12, 8)
    const r = await pg().query(`
      SELECT * FROM (
        SELECT 'adm' AS 종류, cd, "이름", sgg_cd FROM svc.lyr_here_adm
         WHERE minx <= $1 AND maxx >= $1 AND miny <= $2 AND maxy >= $2 AND ST_Contains(g, ST_SetSRID(ST_MakePoint($1, $2), 4326))
        UNION ALL
        SELECT 'lawd', cd, "이름", sgg_cd FROM svc.lyr_here_lawd
         WHERE minx <= $1 AND maxx >= $1 AND miny <= $2 AND maxy >= $2 AND ST_Contains(g, ST_SetSRID(ST_MakePoint($1, $2), 4326))) z
      ORDER BY 1, 2`, [x, y]);
    const 하나 = k => r.rows.find(z => z.종류 === k) || null;
    실패 = 0; 세기('misc:here', 'hit'); res.set('X-Svc', 'hit');
    return res.json({ adm: 하나('adm'), lawd: 하나('lawd') });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('misc:here', 'fallback'); return next();
  }
}
async function 주변단지(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().misc || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => !['lat', 'lng', 'r', 'limit', '_svc'].includes(k))) return next();
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39.5 || lng < 124 || lng > 132) return next();   // 거절 문구는 옛 경로가
  const 반경 = Math.min(Math.max(Number(req.query.r) || 1000, 100), 5000);
  const limit = 상한(req.query.limit, 30, 100);
  try {
    const dLat = 반경 / 111320.0, dLng = 반경 / (111320.0 * Math.cos(lat * Math.PI / 180));
    const r = await pg().query(`
      WITH me AS (SELECT geography(ST_SetSRID(ST_MakePoint($2, $1), 4326)) AS p)
      SELECT complex_id, complex_nm, has_recap, dong_cnt, hhld_cnt_sum, pnu_cnt, centroid_lat, centroid_lng, rep_plat_plc, rep_road_addr, lawd_nm,
             trunc(ST_Distance(geography(ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat), 4326)), me.p))::int AS "거리m"
        FROM svc.lyr_near, me
       WHERE centroid_lng BETWEEN $3 AND $4 AND centroid_lat BETWEEN $5 AND $6
         AND ST_Distance(geography(ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat), 4326)), me.p) <= $7
       ORDER BY "거리m", complex_id LIMIT $8`,
      [lat, lng, lng - dLng, lng + dLng, lat - dLat, lat + dLat, 반경, limit + 1]);
    const 잘림 = r.rows.length > limit;
    실패 = 0; 세기('misc:near', 'hit'); res.set('X-Svc', 'hit');
    return res.json({
      기준: { lat, lng }, 반경m: 반경, 상한: limit, 잘림,
      개수: 잘림 ? limit : r.rows.length,
      주의: '좌표가 붙은 단지만 나옵니다. 필지 적재가 끝나는 대로 늘어납니다.',
      단지: 잘림 ? r.rows.slice(0, limit) : r.rows });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('misc:near', 'fallback'); return next();
  }
}
async function 청약핀(req, res, next) {
  const 강제 = req.query._svc === '1';
  if (!지금설정().read || !(지금설정().misc || 강제) || Date.now() < 쉬는끝) return next();
  if (Object.keys(req.query).some(k => !['bbox', '_svc'].includes(k))) return next();
  const b = String(req.query.bbox || '').split(',').map(Number);
  if (b.length !== 4 || b.some(v => !Number.isFinite(v))) return next();
  try {
    const [p, c] = await Promise.all([
      pg().query(`SELECT house_manage_no, pblanc_no, house_nm, "공고종류", house_dtl_secd_nm, tot_suply, rcrit_pblanc_de, mvn_prearnge_ym, pnu, lat, lng
                    FROM svc.lyr_apin WHERE lng BETWEEN $1 AND $3 AND lat BETWEEN $2 AND $4
                   ORDER BY ${날내림('rcrit_pblanc_de')}, house_manage_no, pblanc_no LIMIT 600`, b),
      pg().query(`SELECT "안이어짐", "자리없음" FROM svc.lyr_apin_cnt`)]);
    실패 = 0; 세기('misc:apin', 'hit'); res.set('X-Svc', 'hit');
    return res.json({ 핀: p.rows, 셈: c.rows[0] || {} });
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('misc:apin', 'fallback'); return next();
  }
}
/* 지나며 담기(응답 통째로) — 주소(물음표 포함) 하나 = 한 줄. 단지 번호를 같이 적어 두고 그 단지가 바뀌면 발행기가 지운다 */
const 캐시길 = [
  { re: /^\/api\/ho\/([A-Za-z0-9\-_]{1,50})$/, 허용: [], 단지: (m, body) => body && body.ho && body.ho.complex_id },
  { re: /^\/api\/complexes\/(\d{1,9})\/points$/, 허용: ['kind', 'key'], 단지: m => Number(m[1]) },
  { re: /^\/api\/complexes\/(\d{1,9})\/poi-list$/, 허용: ['life'], 단지: m => Number(m[1]) },
];
async function 응답캐시(req, res, next) {
  if (req.method !== 'GET' || !지금설정().read || !지금설정().cache || Date.now() < 쉬는끝) return next();
  const 길 = 캐시길.find(g => g.re.test(req.path));
  if (!길 || Object.keys(req.query).some(k => !길.허용.includes(k))) return next();
  const m = 길.re.exec(req.path), 키 = req.originalUrl;
  try {
    const r = await pg().query(`SELECT body_gz FROM svc.resp_cache WHERE url = $1 AND at > now() - interval '24 hours'`, [키]);
    실패 = 0;
    if (r.rows.length) {
      세기('cache', 'hit');
      res.status(200).set({ 'Content-Type': 'application/json; charset=utf-8', 'X-Svc': 'hit', 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' });
      if (/\bgzip\b/.test(req.get('accept-encoding') || '')) return res.set('Content-Encoding', 'gzip').end(r.rows[0].body_gz);
      return res.end(zlib.gunzipSync(r.rows[0].body_gz));
    }
  } catch (e) {
    if (++실패 >= 5) { 쉬는끝 = Date.now() + 30000; 실패 = 0; }
    세기('cache', 'fallback'); return next();
  }
  세기('cache', 'miss'); res.set('X-Svc', 'miss');
  const 원래 = res.send.bind(res);
  let 담음 = false;
  res.send = body => {
    try {
      if (!담음 && res.statusCode === 200 && (typeof body === 'string' || Buffer.isBuffer(body)) && /json/.test(String(res.get('Content-Type') || ''))) {
        담음 = true;
        const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
        setImmediate(() => {
          let j; try { j = JSON.parse(raw.toString('utf8')); } catch { return; }
          if (j && j.error) return;
          const cid = Number(길.단지(m, j)) || null;
          zlib.gzip(raw, { level: 6 }, (err, gz) => {
            if (err) return;
            pg().query(`INSERT INTO svc.resp_cache (url, complex_id, body_gz, bytes, at) VALUES ($1, $2, $3, $4, now())
                        ON CONFLICT (url) DO UPDATE SET complex_id = EXCLUDED.complex_id, body_gz = EXCLUDED.body_gz, bytes = EXCLUDED.bytes, at = now()`,
                       [키, cid, gz, raw.length]).then(() => 세기('cache', 'stored'), () => {});
          });
        });
      }
    } catch (e) { /* 담기 실패는 화면과 상관없다 */ }
    return 원래(body);
  };
  return next();
}

module.exports = { 단지응답, 마커, 필지, 건물, 법정동, 행정동, 닫힌핀, 신축핀, 자동완성, 목록검색, 여기지역, 주변단지, 청약핀, 응답캐시, pg, 지금설정 };
