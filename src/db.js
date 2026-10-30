const path = require('path');
const fs = require('fs');
const sql = require('mssql');

/* 설정은 두 곳에서 읽는다.
   1) Teomoony-f/.env            (있으면 우선)
   2) ..\Teomoony\.env           (ETL 과 같은 설정을 공유)
   키를 두 군데 적어두지 않기 위해서다. */
function loadEnv() {
  const here = path.join(__dirname, '..', '.env');
  const shared = path.join(__dirname, '..', '..', 'Teomoony', '.env');
  for (const p of [shared, here]) {
    if (fs.existsSync(p)) require('dotenv').config({ path: p, override: true });
  }
}
loadEnv();

const config = {
  server: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 11433),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Teomoony',
  options: {
    encrypt: false,              // 로컬 Docker. 운영이면 true
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  /* ★ 상세가 쿼리 27개를 한꺼번에 던진다(직렬 16초 -> 한 파). 풀이 10이면
     세 파로 나뉘어 **줄 서는 시간**이 각 쿼리 측정값에 섞인다. 큰 단지
     (헬리오시티 9,510세대)에서 off 가 직렬 27ms 인데 배치 안에서 1,917ms 로
     보이는 게 그것이다. 20으로 올려 재 본다 — 효과 없으면 되돌린다.
     ★ 늘리면 적재와 부딪힐 일도 늘어난다. 그래서 되풀이()(교착 재시도)가 있다. */
  /* ★ 20 으로 올려 재 봤다(2026-10-20): 큰 단지만 2,003 -> 1,780ms(11%),
     작은 단지는 노이즈 안에서 오히려 조금 나빴다. 적재와 부딪힐 일만 늘어서
     **10 으로 되돌렸다.** 큰 단지의 남은 1.8초는 hos(9,510세대 호 목록)이고,
     그건 데이터가 많아서 드는 정직한 비용이다. */
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000,
};

/* ---------- 가단지(389) — 대장 전 건물의 단지 번호로 들어온 요청 (2026-10-30 사장님 "가단지코드를 붙이는 건 어때?" · "ㄱㄱ") ----------
   단지 번호로 받는 칸(/api/complexes/:id/history · landuse · closed · hira · pharmacy · childcare · points · poi-list · geo · buildings · permitx · usage)은
   gold.complex · complex_pnu · v_complex_* 를 complex_id 로 본다. 가단지는 일반 단지 표에 **안 넣었으므로**(단지 수 · 마커 · 통계에 안 섞이게)
   그 요청 동안만 질의 글자를 바꿔 끼운다:
     gold.complex → #gc(그 한 줄) · complex_pnu → #gcp(그 필지) · complex_bld → #gcb(빈 표 — 대장 전) · v_complex_poi/school/… → gold.fn_pt_*(388, 같은 식)
     v_complex_zone/redev · complex_redev_hit → gold.fn_pnu_*(388) · v_complex_permit → 그 필지 허가 · 분양권 · 청약 링크 · 호 → 빈 것.
   ★ server.js 의 손질 없이 같은 질의가 돈다(같은 사실은 한 곳에서). 바꿔 끼울 이름이 늘면 여기(가단지바꿈)만 고친다. */
const { AsyncLocalStorage } = require('async_hooks');
const 가단지자리 = new AsyncLocalStorage();
const 가단지바꿈 = [
  [/gold\.complex_pnu\b/g, '#gcp'],
  [/gold\.complex_bld\b/g, '#gcb'],
  [/gold\.complex_redev_hit\b/g, 'gold.fn_pnu_redev_hit(@ppnu, @gid)'],
  [/gold\.v_complex_(poi|school|subway|bus|kinder|academy|childcare)\b/g, 'gold.fn_pt_$1(@plat, @plng, @gid)'],
  [/gold\.v_complex_zone\b/g, 'gold.fn_pnu_zone(@ppnu, @gid)'],
  [/gold\.v_complex_redev\b/g, 'gold.fn_pnu_redev(@ppnu, @gid)'],
  /* 이름 자리에 그대로 들어가는 함수 · 뷰로(389) — 별칭이 있든 없든 문법이 맞게 */
  [/gold\.v_complex_permit\b/g, 'gold.fn_pnu_permit(@ppnu, @gid)'],
  [/gold\.v_complex_ho\b/g, 'gold.v_empty_complex_ho'],
  [/gold\.applyhome_link\b/g, 'gold.v_empty_applyhome_link'],
  [/gold\.fn_complex_silv\(\s*@id\s*\)/g, 'gold.fn_complex_silv(0)'],
  [/gold\.complex(?![A-Za-z0-9_])/g, '#gc'],
];
const 가단지머리 = `
IF OBJECT_ID('tempdb..#gc') IS NOT NULL DROP TABLE #gc;
IF OBJECT_ID('tempdb..#gcp') IS NOT NULL DROP TABLE #gcp;
IF OBJECT_ID('tempdb..#gcb') IS NOT NULL DROP TABLE #gcb;
SELECT * INTO #gc FROM gold.complex WHERE 1 = 0 UNION ALL SELECT * FROM gold.complex WHERE 1 = 0;
INSERT #gc (complex_id, complex_nm, complex_nm_ns, rep_pnu, rep_plat_plc, sigungu_cd, bjdong_cd, has_recap, dong_cnt, pnu_cnt, is_active, created_at, updated_at, centroid_lat, centroid_lng)
VALUES (@gid, @gnm, REPLACE(ISNULL(@gnm, N''), N' ', N''), @ppnu, @gaddr, LEFT(@ppnu, 5), SUBSTRING(@ppnu, 6, 5), 0, 1, 1, 1, SYSDATETIME(), SYSDATETIME(), @plat, @plng);
SELECT * INTO #gcp FROM gold.complex_pnu WHERE 1 = 0 UNION ALL SELECT * FROM gold.complex_pnu WHERE 1 = 0;
IF @ppnu IS NOT NULL INSERT #gcp (complex_id, pnu, pnu_role, is_representative, linked_at) VALUES (@gid, @ppnu, 'MAIN', 1, SYSDATETIME());
SELECT * INTO #gcb FROM gold.complex_bld WHERE 1 = 0 UNION ALL SELECT * FROM gold.complex_bld WHERE 1 = 0;
`;
function 가단지글(text) { let t = String(text); for (const [re, to] of 가단지바꿈) t = t.replace(re, to); return 가단지머리 + t; }
function 가단지요청(rq, g) {
  let 넣음 = false;
  const 겉 = new Proxy(rq, { get(t, k) {
    if (k === 'input') return (...a) => { t.input(...a); return 겉; };
    if (k === 'query') return (text, ...rest) => {
      if (!넣음) { 넣음 = true;
        t.input('gid', sql.Int, g.id).input('gnm', sql.NVarChar(200), g.이름 || null).input('gaddr', sql.NVarChar(300), g.주소 || null)
         .input('ppnu', sql.Char(19), g.pnu || null).input('plat', sql.Float, g.lat ?? null).input('plng', sql.Float, g.lng ?? null); }
      return t.query(가단지글(text), ...rest);
    };
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  return 겉;
}
function 가단지풀(pool, g) {
  return new Proxy(pool, { get(t, k) {
    if (k === 'request') return () => 가단지요청(t.request(), g);
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
}

let poolPromise = null;
function getPool() {
  const g = 가단지자리.getStore();
  if (g) return 진짜풀().then(p => 가단지풀(p, g));
  return 진짜풀();
}
function 진짜풀() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch(err => {
      poolPromise = null;              // 실패하면 다음 요청에서 다시 시도
      throw err;
    });
  }
  return poolPromise;
}

/* ★ 2026-10-22: 집안 전용 /api/_apply 만 쓰는 **긴 풀**(한 배치 20분까지, 연결 2개).
   파생표를 처음 세는 것처럼 한 문장이 60초를 넘는 일이 있다(312 — 면적표 전체를 한 번 훑는 편이
   호마다 찾아가는 것보다 디스크에 훨씬 싸다). 화면 요청은 그대로 60초 풀을 쓴다 — 느린 화면을 숨기지 않게. */
let longPromise = null;
function getLongPool() {
  if (!longPromise) {
    longPromise = new sql.ConnectionPool({ ...config, pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
                                           requestTimeout: 20 * 60 * 1000 })
      .connect().catch(err => { longPromise = null; throw err; });
  }
  return longPromise;
}

module.exports = { sql, getPool, 진짜풀, getLongPool, config, 가단지자리 };
