/* 터무니 프론트 QA (2026-11-01) — 실제 사이트에서 데스크톱 · 폰 두 크기로. 쓰는 법: QA_BASE=https://teomoony.com node tools/qa_front.js (playwright 필요) */
const { chromium } = require('playwright');
const B = process.env.QA_BASE || 'https://teomoony.com';
const 결과 = [];
const 기록 = (뷰, 이름, ok, 말 = '') => { 결과.push({ 뷰, 이름, ok, 말 }); console.log(`${ok ? 'PASS' : 'FAIL'} [${뷰}] ${이름}${말 ? ' — ' + 말 : ''}`); };

async function 판(b, vp, 뷰) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const 오류 = [], 실패 = [];
  p.on('pageerror', e => 오류.push(e.message.slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_BLOCKED|vworld|Failed to load resource/i.test(m.text())) 오류.push('console: ' + m.text().slice(0, 160)); });
  p.on('response', r => { const u = r.url(); if (r.status() >= 500 && u.includes('teomoony.com')) 실패.push(`${r.status()} ${u.replace(B, '').slice(0, 120)}`); });
  const 단계 = async (이름, fn) => {
    const e0 = 오류.length, f0 = 실패.length;
    try {
      const 말 = await fn();
      const 새오류 = 오류.slice(e0), 새실패 = 실패.slice(f0);
      const ok = (말 === undefined || 말 === true || typeof 말 === 'string') && !새오류.length && !새실패.length && 말 !== false;
      기록(뷰, 이름, ok, [typeof 말 === 'string' ? 말 : '', ...새오류, ...새실패].filter(Boolean).join(' | '));
    } catch (e) { 기록(뷰, 이름, false, 'throw: ' + e.message.split('\n')[0].slice(0, 200) + ' ' + [...오류.slice(e0), ...실패.slice(f0)].join(' | ')); }
  };
  const 준비 = () => p.waitForFunction(() => typeof map !== 'undefined' && map && typeof select === 'function', null, { timeout: 60000 });
  const 넘침 = () => p.evaluate(() => { const d = document.querySelector('#detail'); return d && !d.hidden ? d.scrollWidth - d.clientWidth : 0; });
  const 상세글 = () => p.evaluate(() => (document.querySelector('#detail') || {}).innerText || '');
  const 제안 = async q => {
    await p.evaluate(() => { const el = document.querySelector('#sugg'); if (el) el.innerHTML = ''; });
    await p.fill('#q', ''); await p.type('#q', q, { delay: 20 });
    await p.waitForFunction(() => { const el = document.querySelector('#sugg'); return el && !el.hidden && el.innerText.trim().length > 0; }, null, { timeout: 15000 });
    await p.waitForTimeout(600);
    return p.evaluate(() => [...document.querySelectorAll('#sugg .sg-g')].map(g => ({ h: g.querySelector('.sg-h').innerText, 줄: [...g.querySelectorAll('.sg-it')].map(x => x.innerText.replace(/\n/g, ' / ')) })));
  };

  await 단계('홈 열기 · 숫자판', async () => {
    await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => /\d{1,3}(,\d{3})+/.test((document.querySelector('#homestats') || {}).innerText || ''), null, { timeout: 30000 });
    return (await p.locator('#homestats').innerText()).split('\n').slice(0, 4).join(' ');
  });
  await 단계('지도 탭 · 마커', async () => {
    await p.click('.tab[data-view="map"]'); await 준비();
    await p.evaluate(() => map.setView([37.5665, 126.978], 15)); await p.waitForTimeout(4000);
    const n = await p.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
    return n > 10 ? `마커 ${n}` : false;
  });
  await 단계('툴바 — 필지 · 항공 켜고 끄기', async () => {
    await p.evaluate(() => { map.setView([37.5665, 126.978], 17); }); await p.waitForTimeout(2000);
    await p.evaluate(() => { document.querySelector('#polys').click(); }); await p.waitForTimeout(3500);
    const 면 = await p.evaluate(() => (typeof parcelLayer !== 'undefined' && parcelLayer.getLayers().length) || 0);
    await p.evaluate(() => { document.querySelector('#polys').click(); document.querySelector('#sat').click(); }); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector('#sat').click());
    return 면 > 0 ? `필지 면 ${면}` : false;
  });
  for (const [ov, 제목] of [['zone', '용도지역'], ['reb', '재개발 · 재건축'], ['redev', '그 밖의 정비']]) {
    await 단계(`툴바 — 겹쳐보기 ${ov}`, async () => {
      await p.evaluate(o => document.querySelector(`.mc.ov[data-ov="${o}"]`).click(), ov); await p.waitForTimeout(3500);
      const r = await p.evaluate(() => ({ 범례: (document.querySelector('#olegend') || {}).innerText || '', 눌림: [...document.querySelectorAll('.mc.ov[aria-pressed="true"]')].map(x => x.dataset.ov) }));
      return r.범례.includes(제목) && r.눌림.length === 1 && r.눌림[0] === ov ? `범례 '${r.범례.split('\n')[0]}'` : `범례/눌림 이상: ${JSON.stringify(r).slice(0, 120)}`;
    });
  }
  await 단계('툴바 — 겹쳐보기 끄기', async () => {
    await p.evaluate(() => document.querySelector('.mc.ov[aria-pressed="true"]').click()); await p.waitForTimeout(800);
    return await p.evaluate(() => document.querySelector('#olegend').hidden) ? true : '범례가 안 닫힘';
  });
  await 단계('툴바 — 거리 재기 켜고 끄기', async () => {
    await p.click('#measure', { force: true }); await p.waitForTimeout(300);
    const on = await p.getAttribute('#measure', 'aria-pressed');
    await p.click('#measure', { force: true }); await p.waitForTimeout(300);
    const off = await p.getAttribute('#measure', 'aria-pressed');
    return on === 'true' && off === 'false' ? true : `켜짐 ${on} · 꺼짐 ${off}`;
  });

  const 찾기 = [
    ['은평', ['구', '단지']], ['장위10', ['재개발·정비']], ['장위초등학교', ['단지']], ['래미안 원베일리', ['단지']],
    ['하나스테이 광안', ['단지']], ['강남역', ['지하철역']], ['수색8', []], ['푸르지오 마크원', []],
  ];
  for (const [q, 묶음들] of 찾기) {
    await 단계(`검색 제안 '${q}'`, async () => {
      const g = await 제안(q);
      const 머리 = g.map(x => x.h.split(' ')[0]);
      const 없는 = 묶음들.filter(m => !머리.some(h => h.startsWith(m)));
      if (q === '장위10') {
        const 정 = g.find(x => x.h.startsWith('재개발'));
        if (!정 || 정.줄.length !== 1 || !/재정비촉진구역/.test(정.줄[0])) return `장위10 한 줄 아님: ${JSON.stringify(정)}`;
      }
      if (q === '장위초등학교') { const 학 = g.find(x => x.h.startsWith('학교')); if (학) return `학교 묶음이 따로 남음: ${학.줄.join(',')}`; }
      return 없는.length ? `빠진 묶음 ${없는.join(',')} · 있음 ${머리.join(',')}` : g.map(x => `${x.h.replace(/\s+/g, ' ')}: ${x.줄[0] || ''}`).join(' ‖ ').slice(0, 240);
    });
  }
  await 단계('검색 Enter 목록', async () => {
    await p.fill('#q', '장위'); await p.press('#q', 'Enter'); await p.waitForTimeout(3500);
    const t = await p.evaluate(() => (document.querySelector('#list') || {}).innerText || '');
    return /정비구역/.test(t) && /단지/.test(t) ? t.split('\n').slice(0, 3).join(' ') : `목록: ${t.slice(0, 120)}`;
  });

  /* 단지 상세 — 탭마다 */
  for (const id of [103835, 489914, 52940]) {
    await 단계(`단지 상세 ${id} 열기`, async () => {
      await p.evaluate(i => select(i, false), id);
      await p.waitForFunction(() => document.querySelectorAll('#detail .tab[data-tab]').length > 3, null, { timeout: 30000 });
      await p.waitForTimeout(1500);
      return (await p.locator('#detail h2').first().innerText()).slice(0, 40);
    });
    const 탭들 = await p.evaluate(() => [...document.querySelectorAll('#detail .tab[data-tab]')].filter(x => !x.hidden).map(x => x.dataset.tab));
    for (const t of 탭들) {
      await 단계(`  ${id} 탭 ${t}`, async () => {
        await p.evaluate(k => document.querySelector(`#detail .tab[data-tab="${k}"]`).click(), t);
        await p.waitForTimeout(2200);
        const 글 = await 상세글(), w = await 넘침();
        const 나쁨 = /서버 오류|undefined|NaN|\[object Object\]/.exec(글);
        if (나쁨) return `화면에 '${나쁨[0]}'`;
        if (w > 2) return `가로 넘침 ${w}px`;
        const 칩 = await p.evaluate(() => [...document.querySelectorAll('#detail .pane:not([hidden]) .apick, #detail .apick')].filter(x => x.offsetParent).map(x => x.innerText.replace(/\n/g, '')).slice(0, 3));
        return 칩.length ? `칩 ${칩.join(' / ').slice(0, 120)}` : true;
      });
    }
    await 단계(`  ${id} 실거래 10건 더보기`, async () => {
      if (!탭들.includes('price')) return '실거래 탭 없음';
      await p.evaluate(() => document.querySelector('#detail .tab[data-tab="price"]').click()); await p.waitForTimeout(2000);
      const 단 = p.locator('#detail [data-pickmore]:visible, #detail .moreb:visible').first();
      if (!(await 단.count())) return '더보기 없음(거래 10건 이하)';
      const 전 = await 단.innerText(); await 단.click(); await p.waitForTimeout(1500);
      const 후 = await p.locator('#detail [data-pickmore]:visible, #detail .moreb:visible').first().innerText().catch(() => '(사라짐)');
      return 전 !== 후 ? `${전.replace(/\s+/g, ' ')} → ${후.replace(/\s+/g, ' ')}` : `안 바뀜: ${전}`;
    });
  }
  await 단계('분양·청약 탭 (489914 원베일리)', async () => {
    await p.evaluate(() => select(489914, false)); await p.waitForTimeout(3000);
    await p.evaluate(() => { const t = document.querySelector('#detail .tab[data-tab="sale"]'); if (t) t.click(); }); await p.waitForTimeout(3000);
    const t = await p.evaluate(() => (document.querySelector('#detail .svbox') || {}).innerText || '');
    return /래미안/.test(t) && /전체/.test(t) ? t.split('\n').slice(0, 4).join(' ') : `분양권 칸: ${t.slice(0, 100)}`;
  });
  await 단계('대장 전 단지 900002595 (수색8)', async () => {
    await p.evaluate(() => select(900002595, false)); await p.waitForTimeout(4000);
    const t = await 상세글();
    const st = await p.evaluate(() => (document.querySelector('#detail .pstep summary') || {}).innerText || '');
    return /수색8/.test(t) && st ? `단계 '${st.replace(/\n/g, ' ')}'` : `머리/단계 이상 ${t.slice(0, 80)}`;
  });
  await 단계('정비구역 상세 장위10 (단계 · 같은 경계)', async () => {
    await p.evaluate(() => selectRedevZone('11000UQ120PS202411014477')); await p.waitForTimeout(4000);
    const t = await 상세글();
    return /같은 경계 기록/.test(t) && /착공/.test(t) && /구역 안 청약 공고/.test(t) ? true : t.slice(0, 160);
  });
  await 단계('정비구역 상세 — 같은 경계 기록 누르면 그 기록', async () => {
    await p.evaluate(() => document.querySelector('#detail [data-redevzone]').click()); await p.waitForTimeout(3500);
    const h = await p.locator('#detail h2').first().innerText();
    return h.includes('장위10구역') ? h : `열린 것: ${h}`;
  });
  await 단계('닫힌 대장 상세', async () => {
    const key = await p.evaluate(async () => { const r = await fetch('/api/closed/pins?bbox=126.90,37.55,127.00,37.62').then(x => x.json()); return (r.핀 || [])[0] && r.핀[0].site_key; });
    if (!key) return '핀 없음';
    await p.evaluate(k => 폐쇄상세(k), key); await p.waitForTimeout(4000);
    const t = await 상세글(); return t.length > 50 ? `${key} ${t.split('\n')[1] || ''}`.slice(0, 80) : `내용 짧음 ${t}`;
  });
  await 단계('학원 상세 모달', async () => {
    const no = await p.evaluate(async () => { const r = await fetch('/api/suggest?q=' + encodeURIComponent('수학학원')).then(x => x.json());
      for (const g of r.묶음 || []) for (const it of g.항목) if (it.동작 && it.동작.aid) return it.동작.aid; return null; });
    if (!no) return '학원 제안 없음';
    await p.evaluate(n => 학원상세(n), no); await p.waitForTimeout(2500);
    const t = await p.evaluate(() => [...document.querySelectorAll('.modal, [role="dialog"], #homodal')].map(x => x.innerText).join(' ').slice(0, 200));
    await p.keyboard.press('Escape');
    return /교습|과정|학원/.test(t) ? t.split('\n')[0] : `모달: ${t.slice(0, 80)}`;
  });
  await 단계('동네 고르기 — 시도 → 구 → 동', async () => {
    if (!(await p.locator('#acSido').isVisible())) return '동네 고르기 안 보임(폰 접힘)';
    await p.selectOption('#acSido', '11'); await p.waitForTimeout(2000);
    const sgg = await p.evaluate(() => [...document.querySelector('#acSgg').options].map(o => o.value).filter(Boolean));
    await p.selectOption('#acSgg', sgg.includes('11290') ? '11290' : sgg[0]); await p.waitForTimeout(2500);
    const 동 = await p.evaluate(() => [...document.querySelector('#acDong').options].filter(o => o.value).length);
    return 동 > 5 ? `구 ${sgg.length} · 동 ${동}` : `동 ${동}`;
  });
  for (const [v, 확인] of [['usage', '#usum'], ['qna', '#qlist'], ['github', '#ghbox']]) {
    await 단계(`화면 ${v}`, async () => {
      await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(3500);
      const t = await p.evaluate(s => (document.querySelector(s) || {}).innerText || '', 확인);
      return t.trim().length > 10 ? t.replace(/\s+/g, ' ').slice(0, 80) : `비어 있음`;
    });
  }
  await 단계('정책 화면 — 오늘 넣은 항목', async () => {
    await p.click('.tab[data-view="map"]'); await p.waitForTimeout(800);
    await p.evaluate(() => document.querySelector('.mc[data-pol]').click()); await p.waitForTimeout(2000);
    const t = await p.evaluate(() => (document.querySelector('#view-policy') || {}).innerText || '');
    const 찾을 = ['같은 경계 기록', '추진단계', '두 단추', '신고 단지명 탭', '구역 화면에서 뺀 것', '지도 경계'];
    const 없음 = 찾을.filter(k => !t.includes(k));
    return 없음.length ? `없음: ${없음.join(', ')}` : `항목 ${찾을.length}개 다 있음`;
  });
  await 단계('어두운 화면 바꾸기', async () => {
    await p.click('.tab[data-view="map"]'); await p.waitForTimeout(500);
    const 전 = await p.evaluate(() => document.documentElement.dataset.theme || '');
    await p.click('#theme'); await p.waitForTimeout(500);
    const 후 = await p.evaluate(() => [document.documentElement.dataset.theme || '', getComputedStyle(document.body).backgroundColor]);
    await p.click('#theme');
    return 전 !== 후[0] ? `${전 || '기본'} → ${후[0]} (${후[1]})` : `안 바뀜 ${전}`;
  });
  await 단계('없는 단지 주소 /c/999999999', async () => {
    await p.goto(B + '/c/999999999', { waitUntil: 'domcontentloaded' }); await 준비(); await p.waitForTimeout(4000);
    const t = await 상세글() + await p.evaluate(() => (document.querySelector('#toast') || {}).innerText || '');
    return /없|찾지 못|not found/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 80) : `안내 없음: ${t.slice(0, 80)}`;
  });
  if (뷰 === '폰') {
    await 단계('폰 — 상세 열면 시트 · 가로 넘침', async () => {
      await p.goto(B + '/c/103835', { waitUntil: 'domcontentloaded' }); await 준비(); await p.waitForTimeout(5000);
      const s = await p.evaluate(() => [document.querySelector('.app').dataset.sheet, document.documentElement.scrollWidth - innerWidth]);
      return s[1] > 1 ? `페이지 가로 넘침 ${s[1]}px` : `시트 ${s[0]}`;
    });
    await 단계('폰 — 툴바 버튼 보임', async () => {
      await p.evaluate(() => { if (typeof closeDetail === 'function') closeDetail(); }); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => [...document.querySelectorAll('.mapctl .mc')].map(x => { const b = x.getBoundingClientRect(); return b.width > 0 && b.bottom <= innerHeight && b.top >= 0; }));
      return r.every(Boolean) ? `${r.length}개 다 보임` : `안 보임 ${r.filter(x => !x).length}/${r.length}`;
    });
  }
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  await 판(b, { width: 1400, height: 900 }, '데스크톱');
  await 판(b, { width: 393, height: 852 }, '폰');
  await b.close();
  const 실패 = 결과.filter(x => !x.ok);
  console.log(`\n== 합계 ${결과.length} · 통과 ${결과.length - 실패.length} · 실패 ${실패.length}`);
  require('fs').writeFileSync('qa_result.json', JSON.stringify(결과, null, 1));
})();
