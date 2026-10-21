/* 터무니 - SQL 한 덩어리를 돌려 결과를 파일로 남기는 진단 도구
 *
 * ★ 왜 있나: 개발용 VM 은 MSSQL(1433) 에 닿지 못한다. 이 기계 안에서
 *   돌려야 한다. 넣는 글은 tools/db_probe.in.sql, 나오는 글은
 *   tools/db_probe.out.txt. GO 로 쿼리를 나눈다.
 * ★ 읽기 전용으로만 쓴다 - 고치는 SQL 은 deploy/sql 에 두고 검토를 거친다.
 */
const fs = require('fs'), path = require('path');
const { sql, getPool } = require(path.join(__dirname, '..', 'src', 'db'));
const IN = path.join(__dirname, 'db_probe.in.sql');
const OUT = path.join(__dirname, 'db_probe.out.txt');

const 줄 = [];
const 적자 = (...a) => { const s = a.join(' '); 줄.push(s); console.log(s); };

(async () => {
  try {
    const 덩어리 = fs.readFileSync(IN, 'utf8')
      .split(/^\s*GO\s*$/mi).map(x => x.trim()).filter(Boolean);
    const pool = await getPool();
    for (const q of 덩어리) {
      적자('── ' + q.split('\n')[0].slice(0, 90));
      const t0 = Date.now();
      try {
        /* ★ 읽기도 교착으로 죽는다(2026-10-20). 적재가 도는 중에 진단을 돌리면
           'Process 86 was deadlocked ... chosen as the deadlock victim' 이 난다.
           읽기는 다시 하면 그만이므로 몇 번 쉬었다 친다 - 한 번 죽었다고
           진단을 포기하면 적재 중에는 아무것도 못 본다. */
        let r, 마지막;
        for (let 번 = 1; 번 <= 4; 번++) {
          try { r = await pool.request().query(q); 마지막 = null; break; }
          catch (e) {
            마지막 = e;
            if (!/deadlock/i.test(e.message) || 번 === 4) throw e;
            적자(`   (교착 - ${번 * 2}초 쉬고 다시 ${번}/3)`);
            await new Promise(res => setTimeout(res, 번 * 2000));
          }
        }
        if (마지막) throw 마지막;
        적자('   ⏱ ' + (Date.now() - t0) + 'ms');
        const rows = r.recordset || [];
        if (!rows.length) { 적자('   (0행)'); }
        else {
          const cols = Object.keys(rows[0]);
          적자('   ' + cols.join(' | '));
          for (const row of rows.slice(0, 40))
            적자('   ' + cols.map(c => {
              const v = row[c];
              return v === null ? 'NULL' : String(v).slice(0, 40);
            }).join(' | '));
          if (rows.length > 40) 적자(`   ... 외 ${rows.length - 40}행`);
        }
      } catch (e) { 적자('   ✗ ' + e.message); }
      적자('');
    }
  } catch (e) { 적자('✗ ' + (e && e.message || e)); }
  fs.writeFileSync(OUT, 줄.join('\n'), 'utf8');
  process.exit(0);
})();
