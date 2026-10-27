/* norm — 단지 상세의 '주변 상가 · 학교 · 자료 받았나' 를 서비스DB 매칭 테이블(nm)에서 (2026-10-27 · 개발판 시험 → 채용)
   사장님 "중복 데이터는 매칭 테이블을 만들고 거기서 가져오게 — 프론트도 개발로 만들고 그 DB 를 바라보게 해서 실제 속도와 데이터로 재 봐".
   ★ 원천 표는 원본 그대로 한 번(store · school · school_zone · school_group · school_zone_link · school_link · schoolinfo · schoolinfo_stat).
     매칭 표: complex_zone(단지 → 통학구역 · 학교군) · complex_pnu. 거리(주변)는 매칭 표 없이 공간 색인(ST_DWithin).
   ★ 적재DB 질의(server.js _q_poi … _q_schools)와 **같은 칸 이름 · 같은 순서 · 같은 뜻**. SQL Server 는 NULL 을 앞에 둔다 → NULLS FIRST. 거리 정수는 CAST(AS INT) 처럼 버림(trunc).
   ★ node-pg 는 numeric · bigint 를 글자로 준다 → 전부 ::int / ::float8 로 돌려 mssql 드라이버와 같은 숫자로.
   ★ 돌려주는 모양은 mssql 결과와 같다: { recordset, recordsets }. */
const { Pool } = require('pg');
let pool = null;
function pg() {
  /* 서비스DB(teomoony) 의 nm 스키마(etl/nm_build.py 가 새로 만들어 바꿔 끼운다). 3초 넘으면 끊는다 → server.js 가 적재DB 질의로 */
  if (!pool) pool = new Pool({ host: '127.0.0.1', port: 15432, database: process.env.NORM_DB || 'teomoony', user: 'teomoony',
                               password: process.env.SVC_DB_PASSWORD || '', max: 10, idleTimeoutMillis: 30000,
                               options: '-c search_path=nm,public -c statement_timeout=3000' });
  return pool;
}
const 모양 = (...rs) => ({ recordset: rs[0], recordsets: rs });
const V_POI = `WITH c AS (SELECT * FROM cpt WHERE complex_id = $1 AND is_active = 1),
  v AS MATERIALIZED (SELECT s.inds_scls_nm, s.inds_lcls_nm, s.inds_mcls_cd, s.life, s.brand, ST_Distance(s.g, c.g) AS d,
                            CASE WHEN EXISTS (SELECT 1 FROM complex_pnu cp WHERE cp.complex_id = $1 AND cp.pnu = s.pnu) THEN 1 ELSE 0 END AS on_site
                       FROM store s, c WHERE ST_DWithin(s.g, c.g, 1000)) `;
async function poi(id) {
  const r = await pg().query(V_POI + `SELECT inds_scls_nm AS "소분류", inds_lcls_nm AS "대분류",
      sum(CASE WHEN d <= 300 THEN 1 ELSE 0 END)::int AS r300, sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END)::int AS r500,
      count(*)::int AS r1000, min(trunc(d))::int AS "최단m", sum(on_site)::int AS "단지내"
    FROM v WHERE inds_scls_nm IS NOT NULL GROUP BY inds_scls_nm, inds_lcls_nm
    ORDER BY sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END) DESC, count(*) DESC, min(d), inds_scls_nm COLLATE svc.ko_ci`, [id]);
  return 모양(r.rows);
}
async function poiSum(id) {
  const r = await pg().query(V_POI + `SELECT count(DISTINCT CASE WHEN d <= 500 THEN inds_mcls_cd END)::int AS "업종수500",
      count(DISTINCT inds_mcls_cd)::int AS "업종수1000", sum(on_site)::int AS "단지내" FROM v`, [id]);
  return 모양(r.rows);
}
async function poiBrand(id) {
  const r = await pg().query(V_POI + `SELECT brand AS "브랜드", sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END)::int AS r500,
      count(*)::int AS r1000, min(trunc(d))::int AS "최단m"
    FROM v WHERE brand IS NOT NULL GROUP BY brand ORDER BY sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END) DESC, min(d), brand COLLATE svc.ko_ci`, [id]);
  return 모양(r.rows);
}
const 생활순서 = [['편의점',1],['마트·슈퍼',2],['카페',3],['빵집',4],['음식점',5],['주점',6],['약국',7],['내과·소아과',8],['치과',9],['한의원',10],
  ['그 외 의원',11],['병원·종합병원',12],['요양병원',13],['동물병원',14],['입시·보습학원',15],['영어·외국어',16],['예체능학원',17],['그 외 학원',18],
  ['독서실·스터디카페',19],['헬스·요가',20],['수영장',21],['골프연습장',22],['목욕탕·사우나',23],['미용실',24],['세탁소',25],['PC방',26],['노래방',27],['당구장·볼링장',28]];
const 생활CASE = 'CASE life ' + 생활순서.map(([k, n]) => `WHEN '${k}' THEN ${n}`).join(' ') + ' ELSE 99 END';
async function poiLife(id) {
  const r = await pg().query(V_POI + `SELECT life AS "항목", sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END)::int AS r500,
      count(*)::int AS r1000, min(trunc(d))::int AS "최단m", (${생활CASE}) AS ord
    FROM v WHERE life IS NOT NULL GROUP BY life ORDER BY ord`, [id]);
  return 모양(r.rows);
}
const ST = `LEFT JOIN LATERAL (SELECT t.stdnt_cnt::int AS "학생", t.class_cnt::int AS "학급", t.per_class::float8 AS "학급당", t.teach_cnt::int AS "교사",
                   t.per_teacher::float8 AS "교사당", t.pban_yr::int AS "공시연도", t.excp_yn AS "제외", t.excp_rsn AS "제외사유"
              FROM schoolinfo_stat t WHERE t.schul_code = l.schul_code ORDER BY t.pban_yr DESC LIMIT 1) st ON true`;
const 알리미 = `CASE WHEN c.sgg IS NOT NULL AND EXISTS (SELECT 1 FROM schoolinfo i2 WHERE left(i2.adrcd_cd, 5) = c.sgg) THEN 1 ELSE 0 END`;
async function schoolZone(id) {
  const q = pg();
  const [a, b] = await Promise.all([
    q.query(`SELECT z.hakgudo_nm AS "학구", CASE WHEN z.hakgudo_gb = '1' THEN 1 ELSE 0 END AS "공동", z.edu_nm AS "교육지원청", z.base_dt AS "기준일"
               FROM complex_zone cz JOIN school_zone z ON z.zone_sk = cz.sk WHERE cz.complex_id = $1 AND cz.kind = 'E'`, [id]),
    q.query(`WITH c AS (SELECT * FROM cpt WHERE complex_id = $1),
      z AS (SELECT '초등학교' AS "급", '통학구역' AS "구역종류", z.hakgudo_id AS "구역id", z.hakgudo_nm AS "구역", CASE WHEN z.hakgudo_gb = '1' THEN 1 ELSE 0 END AS "공동"
              FROM complex_zone cz JOIN school_zone z ON z.zone_sk = cz.sk WHERE cz.complex_id = $1 AND cz.kind = 'E'
            UNION ALL
            SELECT CASE g.kind WHEN 'M' THEN '중학교' ELSE '고등학교' END, CASE g.kind WHEN 'M' THEN '중학교 학교군' ELSE '고등학교 학교군' END,
                   g.hakgudo_id, g.hakgudo_nm, CASE WHEN g.hakgudo_gb = '1' THEN 1 ELSE 0 END
              FROM complex_zone cz JOIN school_group g ON g.group_sk = cz.sk WHERE cz.complex_id = $1 AND cz.kind = 'G')
      SELECT z."급", z."구역종류", z."구역id", z."구역", z."공동", k.base_dt AS "기준일",
             k.school_id, k.school_nm AS "원문이름", s.school_nm AS "이름", s.fond_type AS "설립", s.oper_sttus AS "운영",
             CASE WHEN s.g IS NOT NULL AND c.g IS NOT NULL THEN trunc(ST_Distance(s.g, c.g))::int END AS "거리m",
             CASE WHEN l.schul_code IS NOT NULL THEN 1 ELSE 0 END AS "이음",
             st.*, ${알리미} AS "알리미적재"
        FROM z LEFT JOIN c ON true
        LEFT JOIN school_zone_link k ON k.hakgudo_id = z."구역id"
        LEFT JOIN school s ON s.school_id = k.school_id AND s.is_current = 1
        LEFT JOIN school_link l ON l.school_id = k.school_id
        ${ST}
       ORDER BY CASE z."급" WHEN '초등학교' THEN 1 WHEN '중학교' THEN 2 ELSE 3 END, z."구역" COLLATE svc.ko_ci, 12 NULLS FIRST, k.school_id NULLS FIRST`, [id])]);
  return 모양(a.rows, b.rows);
}
const V_SCH = `WITH c AS (SELECT * FROM cpt WHERE complex_id = $1),
  v AS MATERIALIZED (SELECT s.school_id, s.school_se, s.school_nm, s.fond_type, s.bnhh_se, ST_Distance(s.g, c.g) AS d FROM school s, c
                      WHERE c.is_active = 1 AND s.is_current = 1 AND s.g IS NOT NULL AND s.oper_sttus = '운영' AND ST_DWithin(s.g, c.g, 2000)),
  n AS (SELECT school_id, school_se, school_nm, fond_type, bnhh_se, d,
               row_number() OVER (PARTITION BY school_se ORDER BY d, school_id) AS rn,
               rank() OVER (PARTITION BY school_se ORDER BY d) AS rk,
               sum(CASE WHEN d <= 1000 THEN 1 ELSE 0 END) OVER (PARTITION BY school_se) AS k1 FROM v)`;
const ORD = x => `CASE ${x} WHEN '초등학교' THEN 1 WHEN '중학교' THEN 2 WHEN '고등학교' THEN 3 ELSE 9 END`;
async function schools(id) {
  const q = pg();
  const [a, b] = await Promise.all([
    q.query(V_SCH + `, a AS (SELECT school_se, sum(CASE WHEN d <= 500 THEN 1 ELSE 0 END)::int AS r500, sum(CASE WHEN d <= 1000 THEN 1 ELSE 0 END)::int AS r1000,
                                count(*)::int AS r2000 FROM v GROUP BY school_se)
      SELECT a.school_se AS "학교급", n.school_nm AS "가까운곳", n.fond_type AS "설립", n.bnhh_se AS "분교", trunc(n.d)::int AS "최단m",
             a.r500, a.r1000, a.r2000, CASE WHEN l.schul_code IS NOT NULL THEN 1 ELSE 0 END AS "이음", st.*, ${알리미} AS "알리미적재", ${ORD('a.school_se')} AS ord
        FROM a JOIN n ON n.school_se = a.school_se AND n.rn = 1 CROSS JOIN c
        LEFT JOIN school_link l ON l.school_id = n.school_id ${ST}
       ORDER BY ord`, [id]),
    q.query(V_SCH + `
      SELECT n.school_id, n.school_se AS "학교급", n.school_nm AS "이름", n.fond_type AS "설립", n.bnhh_se AS "분교", trunc(n.d)::int AS "거리m",
             CASE WHEN l.schul_code IS NOT NULL THEN 1 ELSE 0 END AS "이음", st.*, i.coedu AS "남녀", i.hmpg AS "홈", ${알리미} AS "알리미적재", ${ORD('n.school_se')} AS ord
        FROM n CROSS JOIN c
        LEFT JOIN school_link l ON l.school_id = n.school_id
        LEFT JOIN schoolinfo i ON i.schul_code = l.schul_code ${ST}
       WHERE n.d <= 1000 OR (n.k1 = 0 AND n.rk = 1)
       ORDER BY ord, n.d, n.school_id`, [id])]);
  return 모양(a.rows, b.rows);
}
/* scope — '이 법정동에 그 자료를 받았나'. 법정동 한 줄짜리 표(lawd_scope, norm_scope.py 가 원천 표에서 EXISTS 와 같은 뜻으로 만든다).
   단지의 법정동은 complex_lawd(gold.complex 의 sigungu_cd + bjdong_cd 그대로). 단지가 없으면 지금처럼 법정동 NULL · 전부 0. */
async function scope(id) {
  const r = await pg().query(`SELECT l.lawd AS "법정동", coalesce(s."필지", 0) AS "필지", coalesce(s."건물", 0) AS "건물", coalesce(s."인허가", 0) AS "인허가",
      coalesce(s.kapt, 0) AS kapt, coalesce(s."관리비구", 0) AS "관리비구", coalesce(s."주택가격", 0) AS "주택가격", coalesce(s."전유부", 0) AS "전유부", coalesce(s."층별", 0) AS "층별"
    FROM (SELECT $1::int AS id) x LEFT JOIN complex_lawd l ON l.complex_id = x.id LEFT JOIN lawd_scope s ON s.lawd = l.lawd`, [id]);
  return 모양(r.rows);
}
module.exports = { poi, poiSum, poiBrand, poiLife, schoolZone, schools, scope };
