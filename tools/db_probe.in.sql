/* 1. 서울 25구 - gold 단지와 좌표 (build 25구 결과 확인) */
SELECT 구 = sigungu_cd,
       단지 = COUNT(*),
       좌표있음 = SUM(CASE WHEN centroid_lat IS NOT NULL THEN 1 ELSE 0 END)
  FROM gold.complex
 WHERE is_active = 1 AND sigungu_cd LIKE '11%'
 GROUP BY sigungu_cd
 ORDER BY sigungu_cd
GO
/* 2. 실거래 - 전체 행수와 기간 */
SELECT 행수 = COUNT(*),
       구수 = COUNT(DISTINCT sgg_cd),
       처음 = MIN(deal_ymd),
       끝 = MAX(deal_ymd)
  FROM silver.rtms_trade
GO
/* 3. 실거래 - 종목별 */
SELECT 종목 = trade_kind, 행수 = COUNT(*)
  FROM silver.rtms_trade
 GROUP BY trade_kind
 ORDER BY COUNT(*) DESC
GO
/* 4. 필지 - 서울 구별 (뒷줄 cadastral 진행도) */
SELECT 구 = LEFT(pnu, 5), 필지 = COUNT(*)
  FROM silver.cadastral_parcel
 WHERE pnu LIKE '11%'
 GROUP BY LEFT(pnu, 5)
 ORDER BY LEFT(pnu, 5)
GO
/* 5. 학구도 - 시도별 (135건이 맞는 수인지) */
SELECT 시도 = sd_cd, 학구 = COUNT(*)
  FROM silver.school_zone
 GROUP BY sd_cd
 ORDER BY sd_cd
GO
/* 6. 교착 누적 - 서버 시작 뒤 전체 (늘었는지 보는 기준점) */
SELECT 교착누적 = cntr_value
  FROM sys.dm_os_performance_counters
 WHERE counter_name LIKE N'Number of Deadlocks/sec%'
   AND instance_name = '_Total'
