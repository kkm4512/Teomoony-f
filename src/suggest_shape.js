/* 자동완성 · 목록 검색이 같이 쓰는 글자 맞춤과 자동완성 응답 모양 (2026-10-25 server.js 에서 옮김)
   ★ 옛 경로(적재DB, server.js)와 새 경로(서비스DB, svc.js)가 **같은 코드**로 응답을 만들게 — 값 · 순서 · 문구가 갈라지지 않게. */
const 시도이름 = [
  [/^서울(?:시|특별시)?\s/, '서울특별시 '], [/^부산(?:시|광역시)?\s/, '부산광역시 '], [/^대구(?:시|광역시)?\s/, '대구광역시 '],
  [/^인천(?:시|광역시)?\s/, '인천광역시 '], [/^광주(?:시|광역시)?\s(?=[가-힣]+구(?:\s|$))/, '광주광역시 '], [/^대전(?:시|광역시)?\s/, '대전광역시 '],
  [/^울산(?:시|광역시)?\s/, '울산광역시 '], [/^세종(?:시|특별자치시)?\s/, '세종특별자치시 '], [/^경기(?:도)?\s/, '경기도 '],
  [/^강원(?:도|특별자치도)?\s/, '강원특별자치도 '], [/^충북\s/, '충청북도 '], [/^충남\s/, '충청남도 '],
  [/^전북(?:특별자치도)?\s/, '전북특별자치도 '], [/^경북\s/, '경상북도 '], [/^경남\s/, '경상남도 '],
  [/^제주(?:도|특별자치도)?\s/, '제주특별자치도 '],
];
function 시도맞춤(s) {
  for (const [re, to] of 시도이름) if (re.test(s)) return s.replace(re, to);
  return s;
}
function 도로명맞춤(q) {
  let s = 시도맞춤(String(q || '').trim().replace(/\s+/g, ' '));
  if (!/[가-힣](대로|로|길)\s*\d/.test(s)) return s;
  s = s.replace(/([가-힣A-Za-z0-9]+(?:대로|로|길))\s+(\d+(?:번)?(?:가)?길)/g, '$1$2');      // …로 25길 → …로25길
  s = s.replace(/((?:대로|로|길))(\d+(?:-\d+)?)$/, '$1 $2');                                // …길40-5 → …길 40-5 (끝 번호)
  s = s.replace(/((?:대로|로|길))\s*(\d+(?:-\d+)?)\s*$/, '$1 $2');
  return s;
}

function 글자그대로(s) {
  return String(s == null ? '' : s).replace(/[%_[]/g, m => '[' + m + ']');
}

/* 자동완성 묶음 — rs = 14개 결과(옛 질의의 recordsets 순서 그대로), 길이 = 검색어 글자 수 */
function 묶음만들기(rs, 길이) {
    const 상자 = x => (x.minx == null ? null : [Number(x.minx), Number(x.miny), Number(x.maxx), Number(x.maxy)]);
    const 전체 = a => (a.length ? Number(a[0].전체) : 0);
  const 묶음 = [
      { 종류: '구', 전체: 전체(rs[0]), 항목: rs[0].map(x => ({
          이름: x.sgg_nm, 보조: x.sido_nm, 동작: { 종류: '범위', bbox: 상자(x) } })) },
      { 종류: '법정동', 전체: 전체(rs[1]), 항목: rs[1].map(x => ({
          이름: x.emd_nm, 보조: x.full_nm,
          동작: { 종류: '법정동', lawd_cd: x.lawd_cd, 경계있음: !!x.경계있음, bbox: 상자(x) } })) },
      { 종류: '행정동', 전체: 전체(rs[2]), 항목: rs[2].map(x => ({
          이름: x.emd_nm,
          보조: x.adm_nm.replace(/\s*\S+$/, ''),   /* 19:36: 상가 쪽 이름은 안 보인다(사장님) */
          표: Number(x.지금없음) ? `${x.year}년 경계 · 지금은 없는 동` : undefined,
          동작: { 종류: '행정동', adm_cd: x.adm_cd_sgis, bbox: 상자(x) } })) },
      /* 308: 옛 행정동 → 지금 동. 분기 사이에 바뀌었다는 것만 안다(시행일은 그 사이 어딘가) */
      { 종류: '바뀐 행정동', 전체: 전체(rs[13] || []), 항목: (rs[13] || []).map(x => {
          const 분기 = d => { const t = new Date(d); return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
          const 상 = 상자(x);
          return {
            이름: x.행정동명,
            보조: `${x.시군구명} · 옛 행정동 → 지금 ${x.새이름}${Number(x.새현행아님) ? ' (그 뒤 또 바뀜)' : ''} · ${분기(x.마지막)}~${분기(x.후분기)} 사이에 바뀜`,
            표: Number(x.새수) > 1 ? `${x.새수}개 동으로` : '옛 이름',
            동작: x.adm_cd ? { 종류: '행정동', adm_cd: x.adm_cd, bbox: 상 } : { 종류: '범위', bbox: 상 } }; }) },
      { 종류: '단지', 전체: 전체(rs[3]), 항목: rs[3].map(x => ({
          /* 20:19: 이름이 주소뿐이면 실거래 이름을 이름으로(화면 app.js 표시이름 과 같은 규칙) */
          이름: (x.complex_nm === x.rep_plat_plc && x.실거래이름) ? x.실거래이름 : x.complex_nm,
          보조: [x.실거래이름 && !(x.complex_nm === x.rep_plat_plc) ? `실거래 '${x.실거래이름}'` : null, x.rep_plat_plc,
                 x.hhld_cnt_sum ? `${x.hhld_cnt_sum}세대` : null].filter(Boolean).join(' · '),
          /* 13:11: 현재 단지에는 옛 대장 표를 달지 않는다(토지·허가 탭에만 기록) */
          동작: { 종류: '단지', id: x.complex_id } })) },
      { 종류: '폐쇄·말소 대장', 전체: 전체(rs[11] || []), 항목: (rs[11] || []).map(x => ({
          이름: x.이름 || x.plat_plc,
          보조: [x.폐쇄구분 && x.shter_day ? `${x.폐쇄구분} ${x.shter_day.slice(0, 4)}.${x.shter_day.slice(4, 6)}.${x.shter_day.slice(6, 8)}` : x.폐쇄구분,
                 x.주용도, x.총괄세대 ? `${x.총괄세대}세대(총괄표제부)` : null, x.이름 ? x.plat_plc : null,
                 x.lat == null ? '지도 자리 없음' : null].filter(Boolean).join(' · '),
          표: '닫힌 대장',
          동작: { 종류: '폐쇄', key: x.site_key, lat: x.lat == null ? null : Number(x.lat), lng: x.lng == null ? null : Number(x.lng),
                  now: x.now_complex_id || null } })) },
      { 종류: '청약 공고', 전체: 전체(rs[12] || []), 항목: (rs[12] || []).map(x => ({
          이름: x.house_nm,
          보조: [[...new Set(String(x.종류들 || x.공고종류 || '').split(',').filter(Boolean))]
                   .map(k => ({ APT: '분양', URBTY: '오피스텔·도시형', REMNDR: '무순위·재공급', PBLPVT: '공공지원민간임대', OPT: '임의공급' }[k] || k)).join(' · '),
                 Number(x.공고수) > 1 ? `공고 ${x.공고수}건` : null,
                 x.rcrit_pblanc_de ? `${Number(x.공고수) > 1 ? '첫 공고' : '공고'} ${String(x.rcrit_pblanc_de).replace(/[^0-9]/g, '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1.$2.$3')}` : null, x.hssply_adres].filter(Boolean).join(' · '),
          표: x.lat == null ? '단지 미연결 · 자리 없음' : '단지 미연결',
          동작: { 종류: '공고', house: x.house_manage_no, lat: x.lat == null ? null : Number(x.lat), lng: x.lng == null ? null : Number(x.lng) } })) },
      { 종류: '신축', 전체: 전체(rs[4]), 항목: rs[4].map(x => ({
          이름: x.kapt_name, 보조: [x.lawd_nm, x.세대 ? `${x.세대}세대` : null].filter(Boolean).join(' · '),
          동작: { 종류: '신축', code: x.kapt_code } })) },
      { 종류: '재개발·정비', 전체: 전체(rs[5]), 항목: rs[5].map(x => ({
          이름: x.zone_nm, 보조: [x.biz_nm, x.propel_nm].filter(Boolean).join(' · '),
          동작: { 종류: '정비', sn: x.present_sn, bbox: 상자(x), lat: x.centroid_lat, lng: x.centroid_lng } })) },
      { 종류: '지하철역', 전체: 전체(rs[6]), 항목: rs[6].map(x => ({
          이름: x.sttn_nm, 보조: x.노선, 동작: { 종류: '점', lat: x.lat, lng: x.lon } })) },
      { 종류: '학교', 전체: 전체(rs[7]), 항목: rs[7].map(x => ({
          이름: x.school_nm, 보조: [x.school_se, x.주소].filter(Boolean).join(' · '), 동작: { 종류: '점', lat: x.lat, lng: x.lon, ...(x.school_id ? { sid: x.school_id } : {}) } })) },
      { 종류: '유치원', 전체: 전체(rs[8]), 항목: rs[8].map(x => ({
          이름: x.kinder_nm, 보조: x.주소, 동작: { 종류: '점', lat: x.lat, lng: x.lon, ...(x.kinder_cd ? { kcd: x.kinder_cd } : {}) } })) },
      { 종류: '학원', 전체: 전체(rs[9]), 좌표없음: rs[9].length ? Number(rs[9][0].좌표없음) : 0, 항목: rs[9].map(x => ({
          이름: x.aca_nm, 보조: [x.realm_sc_nm, x.주소].filter(Boolean).join(' · '), 동작: { 종류: '점', lat: x.lat, lng: x.lon, ...(x.aca_asnum ? { aid: x.aca_asnum } : {}) } })) },
      { 종류: '상가', 전체: 전체(rs[10]), 앞부분만: true, 두글자부터: 길이 < 2, 항목: rs[10].map(x => ({
          이름: x.bizes_nm + (x.brch_nm ? ` ${x.brch_nm}` : ''), 보조: [x.inds_scls_nm, x.adong_nm, x.주소].filter(Boolean).join(' · '),
          동작: { 종류: '점', lat: x.lat, lng: x.lon, ...(x.bizes_id ? { stid: x.bizes_id } : {}) } })) },
    ];
  /* 11-01 사장님 "장위초등학교가 검색에서 갈라지고 그걸 눌러야 학교 정보가 떠서 불편" — 학교 · 유치원 좌표가 든 단지(401 · 위치로만 이음)가 있으면
     그 단지 줄 하나로 합친다: 단지 줄에 학교급을 붙이고 학교 줄은 뺀다. 단지 줄이 목록에 없으면 학교 줄이 그 단지를 연다(단지정보 탭 맨 위가 학교 칸). */
  const 단지묶 = 묶음.find(g => g.종류 === '단지');
  for (const [종, ri, 급] of [['학교', 7, x => x.school_se], ['유치원', 8, () => '유치원']]) {
    const g = 묶음.find(z => z.종류 === 종); if (!g) continue;
    const 남 = [];
    g.항목.forEach((it, i) => {
      const cid = Number((rs[ri][i] || {}).complex_id) || null;
      if (!cid) { 남.push(it); return; }
      const 같은 = 단지묶 && 단지묶.항목.find(d => d.동작 && d.동작.id === cid);
      if (같은) { if (!같은.동작.학교) { 같은.보조 = [급(rs[ri][i]), 같은.보조].filter(Boolean).join(' · '); 같은.동작.학교 = true; } return; }
      남.push({ ...it, 동작: { 종류: '단지', id: cid, 학교: true } });
    });
    g.전체 = Math.max(0, g.전체 - (g.항목.length - 남.length)); g.항목 = 남;
  }
  /* 11-01 사장님 "분양 청약 폐쇄된 다른 건물도 중복으로 잡히나" → "ㄱㄱ": 같은 곳이 두 줄로 나오지 않게(이름이 아니라 이미 이어 둔 번호로).
     ① 닫힌 대장 — 그 대장의 '지금 단지'(now · 필지 + 말소일로 이어 둠)가 단지 줄에 있으면 대장 줄을 뺀다(단지 상세 토지 탭 '옛 대장' 에 있다).
     ② 정비 구역 중 역세권 공급사업(미리내집 · 청년안심주택 · 장기전세 · 역세권 활성화) — 대부분 겹치는 단지(위치)가 단지 줄에 있으면 뺀다(단지 상세 토지 탭 정비 칸에 있다).
     청약 공고 · 신축은 잇기 규칙(402 여덟째 · 아홉째 길)으로 이어지면 공고 줄이 원래 안 나온다. */
  const 있는단지 = new Set(((단지묶 && 단지묶.항목) || []).map(d => d.동작 && d.동작.id).filter(Boolean));
  const 닫 = 묶음.find(z => z.종류 === '폐쇄·말소 대장');
  if (닫) { const 남 = 닫.항목.filter(it => !(it.동작 && it.동작.now && 있는단지.has(it.동작.now))); 닫.전체 = Math.max(0, 닫.전체 - (닫.항목.length - 남.length)); 닫.항목 = 남; }
  const 정 = 묶음.find(z => z.종류 === '재개발·정비');
  if (정) { const 남 = 정.항목.filter((it, i) => !(Number((rs[5][i] || {}).main_complex_id) && 있는단지.has(Number(rs[5][i].main_complex_id))));
            정.전체 = Math.max(0, 정.전체 - (정.항목.length - 남.length)); 정.항목 = 남; }
  return 묶음.filter(g => g.항목.length);
}

/* 이름 끝의 건물 종류 말 — '드림아트빌라' → '드림아트빌' (이름꼬리떼기) */
const 종류꼬리 = /(빌라|아파트|맨션|타운|하우스|빌리지|주택|오피스텔|빌딩|apt|APT)$/;

module.exports = { 시도맞춤, 도로명맞춤, 글자그대로, 묶음만들기, 종류꼬리 };
