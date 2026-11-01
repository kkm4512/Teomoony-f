/* 2026-11-01 사장님 "정비와 재개발을 분리" — 원본 사업 소분류(biz_nm)로만 가른다(이름 · 위치로 고치지 않는다).
   재개발 = **다시 짓는 사업**만 적은 목록(화이트리스트). 목록에 없는 새 소분류는 '정비'(그 밖의 구역)로 간다 — 모르는 걸 재개발이라 하지 않는다.
   ★ server.js(적재DB 경로)와 svc.js(서비스DB 경로)가 **같은 목록**을 쓴다 — 두 벌로 두면 반드시 어긋난다. */
const 재개발소분류 = ['신속통합기획', '재건축(공동)', '재건축(단독)', '재개발(주택정비형)', '재개발(도시정비형)', '주거환경개선(정비형)',
  '재정비촉진구역', '가로주택정비사업', '소규모재건축사업', '소규모재개발사업', '자율주택정비사업'];
module.exports = { 재개발소분류 };

/* 2026-11-01 사장님 "너 제안대로 ㄱㄱ" — 서울시 원본에 **경계가 완전히 같은** 구역 기록이 둘 이상인 곳(211쌍: 촉진구역 + 재개발 78 · 신속통합기획 + 재건축·재개발 60 · 미리내집 차수 37 …).
   같은 땅을 사업 종류별로 따로 올린 것이라 화면에서는 **한 줄 · 한 면**으로 보이고, 각 기록의 분류 · 추진단계는 **고르지 않고 다 보인다**(원본끼리 단계가 다른 곳이 103쌍).
   ★ 합치는 근거는 경계(geojson 원문)가 글자 하나 다르지 않을 때뿐 — 이름은 보지 않는다.
   ★ 대표(지도 색 · 이름 · 누르면 여는 기록): 실제 사업 기록(재개발 · 재건축 · 소규모 정비) → 촉진구역 → 신속통합기획 → 그 밖, 같으면 번호순. */
function 기록순위(biz) {
  const b = String(biz || '');
  if (/^재개발|^재건축|가로주택|소규모|자율주택|주거환경개선/.test(b)) return 0;
  if (b === '재정비촉진구역') return 1;
  if (b === '신속통합기획') return 2;
  return 3;
}
const 기록비교 = (a, b) => 기록순위(a.biz) - 기록순위(b.biz) || (a.present_sn < b.present_sn ? -1 : a.present_sn > b.present_sn ? 1 : 0);
/* 겹쳐보기 응답(FeatureCollection) — 같은 경계 면을 하나로. 첫 면의 자리(면적 순서)를 지키고, properties = 대표 기록 + 기록: [모든 기록](대표 먼저) */
function 같은경계합치기(fc) {
  const 묶음 = new Map(), 순서 = [];
  for (const f of fc.features) {
    const k = JSON.stringify(f.geometry);
    if (!묶음.has(k)) { 묶음.set(k, []); 순서.push(k); }
    묶음.get(k).push(f);
  }
  fc.features = 순서.map(k => {
    const fs = 묶음.get(k);
    if (fs.length === 1) return fs[0];
    const 기록 = fs.map(f => f.properties).sort(기록비교);
    return { type: 'Feature', geometry: fs[0].geometry, properties: { ...기록[0], 기록 } };
  });
  return fc;
}
module.exports.기록순위 = 기록순위;
module.exports.기록비교 = 기록비교;
module.exports.같은경계합치기 = 같은경계합치기;
