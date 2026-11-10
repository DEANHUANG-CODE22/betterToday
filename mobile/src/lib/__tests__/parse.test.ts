/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActivityDetail, parseDailyBlocks, parseFitness, parseHrvAssessment, parseHrvAssessmentDetail, parseLaps, parseMetricNearDate, parseRecovery, parseRecoveryStatus, parseSleepOverview, parseSportRecords, parseStressTimeSeries, parseTrainingLoadAssessment, parseWellnessCheck } from '../coros/parse.ts';
import { daySlots, filledSlots, heartSlots } from '../daySeries.ts';

const SPORT = `
1. Outdoor Run — 2026-10-29
   Time Window: startTimestamp=1793278391 | endTimestamp=1793279071
   Duration: 11:21 | Distance: 2.00 km
   Average Pace: 5:40 /km | Avg HR: 142 bpm | Calories: 129 kcal
   LabelId: 481379969474265088 | SportType: 100
`;

test('解析运动记录摘要', () => {
  const [a] = parseSportRecords(SPORT);
  assert.equal(a.id, '481379969474265088');
  assert.equal(a.name, 'Run');
  assert.equal(a.sport, 'run');
  assert.equal(a.distanceM, 2000);
  assert.equal(a.durationS, 11 * 60 + 21);
  assert.equal(a.avgHr, 142);
});

test('解析运动详情', () => {
  const detail = parseActivityDetail(`
Sport(9807) Activity Details
Workout Time: 2:12:38
Distance: 12.03 km
Average Heart Rate: 76 bpm
`);
  assert.equal(detail.avgHr, 76);
  assert.equal(detail.distanceM, 12030);
});

test('解析分圈，距离单位是厘米', () => {
  const laps = parseLaps(`{"lapGroups":[{"laps":[{"lapIndex":1,"distance":100000,"time":360.41,"avgHr":143,"avgCadence":155}]}]}`);
  assert.equal(laps[0].distanceM, 1000);
  assert.equal(laps[0].durationS, 360);
  assert.equal(laps[0].avgHr, 143);
});

const SLEEP = `
Sleep Overview

2026-10-15
Sleep Score: 91
Daily Sleep: 7h 57min (incl. naps)
Main Sleep (asleep): 7h 57min
Deep Sleep Ratio: 27%
Light Sleep Ratio: 41%
REM Ratio: 31%
Awake Time: 5 min
Main Sleep Window: 2026-10-15 00:28 - 2026-10-15 08:30
`;

test('解析睡眠概览', () => {
  const [night] = parseSleepOverview(SLEEP);
  assert.equal(night.date, '2026-10-15');
  assert.equal(night.totalMin, 7 * 60 + 57);
  assert.equal(night.deepMin, Math.round(477 * 0.27));
  assert.equal(night.awakeMin, 5);
  assert.equal(night.bedtime.includes('00:28'), true);
  assert.equal(night.sleepScore, 91);
});

test('补全睡眠、HRV、恢复和每日健康里已经返回的字段', () => {
  const [night] = parseSleepOverview(`2026-11-02\nSleep Score: 86\nMain Sleep (asleep): 6h 29min\nAwake Time: 18 min\nAwake Count (>5 min): 1\nNaps Total: 0 min\n`);
  assert.equal(night.awakeCount, 1);
  assert.equal(night.napsMin, 0);
  const [hrv] = parseHrvAssessmentDetail('2026-11-03:\n  HRV Avg: 57 ms — Normal\n  Normal Range: 39 - 67 ms\n  Baseline: 53 ms\n\nSleep HRV Time Series\n2026-11-03:\n  hrv=24 ms');
  assert.equal(hrv.value, 57);
  assert.equal(hrv.status, 'Normal');
  assert.equal(hrv.low, 39);
  assert.equal(hrv.high, 67);
  assert.equal(hrv.baseline, 53);
  assert.deepEqual(parseRecoveryStatus('Recovery: 100%\nLevel: Fresh\nEstimated Full Recovery: 0h'), { percent: 100, level: 'Fresh', hours: 0 });
  const day = parseDailyBlocks('--- 20261029 ---\nSteps: 8,603 | Calories: 286 kcal | Exercise: 12 min | Floors: 6\n  Sleep HR: Avg 53 bpm | Min 48 bpm | Max 68 bpm\n')[0];
  assert.equal(day.steps, 8603);
  assert.equal(day.activeKcal, 286);
  assert.equal(day.exerciseMin, 12);
  assert.equal(day.floors, 6);
  assert.equal(day.sleepHrAvg, 53);
  assert.equal(day.sleepHrMin, 48);
  assert.equal(day.sleepHrMax, 68);
  assert.deepEqual(parseWellnessCheck('note\n2026-11-01\nSpO2: 97%\nRespiration Rate: 14.5'), { date: '2026-11-01', spo2: 97, respiration: 14.5 });
  assert.deepEqual(parseWellnessCheck('no wellness fields here'), {});
});

test('解析单次详情里的配速、步幅和功率，且无氧行不会被当成有氧', () => {
  const detail = parseActivityDetail(`
Average Pace: 11:09 /km
Moving Average Pace: 9:27 /km
Adjusted Pace: 11:10 /km
Best Kilometer: 7:25 /km
Average Stride Length: 0.74 m
Average Power: 100 W
Elevation Gain / Loss: 9 m / 10 m
Calories: 125 kcal
Aerobic TE: 0.7
Anaerobic TE: 0.0
Performance: Below Average
`);
  assert.equal(detail.avgPaceSecPerKm, 11 * 60 + 9);
  assert.equal(detail.movingPaceSecPerKm, 9 * 60 + 27);
  assert.equal(detail.adjustedPaceSecPerKm, 11 * 60 + 10);
  assert.equal(detail.bestKmPaceSecPerKm, 7 * 60 + 25);
  assert.equal(detail.avgStrideM, 0.74);
  assert.equal(detail.avgPower, 100);
  assert.equal(detail.elevGainM, 9);
  assert.equal(detail.elevLossM, 10);
  assert.equal(detail.calories, 125);
  assert.equal(detail.aerobicTE, 0.7);
  assert.equal(detail.anaerobicTE, 0);
  assert.equal(detail.performance, 'Below Average');
  assert.equal(parseActivityDetail('Anaerobic TE: 1.2').aerobicTE, undefined);
});

test('解析日期旁边的指标、恢复和体能', () => {
  assert.deepEqual(parseMetricNearDate('2026-10-15\nAverage HRV: 58 ms', 'HRV'), [{ date: '2026-10-15', value: 58 }]);
  assert.equal(parseRecovery('Recovery: 92%\nLevel: good'), 92);
  const fit = parseFitness('VO2max: 56\nRunning Level: 74\nThreshold Pace: 5:07 /km\n5 km Prediction: 24:37\nHalf Marathon Prediction: 1:55:24\nMarathon Prediction: 4:03:32');
  assert.equal(fit.vo2max, 56);
  assert.equal(fit.runningFitness, 74);
  assert.equal(fit.thresholdPaceSecPerKm, 5 * 60 + 7);
  assert.equal(fit.racePredictionsS?.['5k'], 24 * 60 + 37);
  assert.equal(fit.racePredictionsS?.half, 1 * 3600 + 55 * 60 + 24);
  assert.equal(fit.racePredictionsS?.full, 4 * 3600 + 3 * 60 + 32);
  assert.deepEqual(parseHrvAssessment('2026-10-30:\n  HRV Avg: 50 ms — Normal\n\nSleep HRV Time Series\n2026-10-30:\n  hrv=24 ms'), [{ date: '2026-10-30', value: 50 }]);
  assert.equal(parseDailyBlocks('--- 20261029 ---\nSteps: 8,603 | Calories: 286 kcal\nStress: Avg 28')[0].steps, 8603);
  const loads = parseTrainingLoadAssessment(`
2026-10-28
Load Impact: 55
Base Fitness: 61
Intensity Trend: 90%
Comment: 负荷偏低

--- 20261029 ---
Short-term Load: 58
Long-term Load: 63
Load Ratio: 0.92
`);
  assert.equal(loads[0].date, '2026-10-28');
  assert.equal(loads[0].shortTerm, 55);
  assert.equal(loads[0].ratio, 0.9);
  assert.equal(loads[1].shortTerm, 58);
  assert.equal(loads[1].ratio, 0.92);
});

test('压力时间序列按 5 分钟分组，心率为 0 不当成采样', () => {
  const t0 = Date.UTC(2026, 10, 8, 1, 0, 0) / 1000;
  const days = parseStressTimeSeries(`
Stress Time Series — last 1 days
========================

2026-11-08:
  timestamp=${t0}, timezone=32, stress=21, score=2, stressHrv=0, stressHr=0
  timestamp=${t0 + 300}, timezone=32, stress=28, score=2, stressHrv=0, stressHr=54
2026-11-07:
  timestamp=${t0 - 86400}, timezone=32, stress=10, score=1, stressHrv=0, stressHr=0
`);
  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-11-08');
  assert.equal(days[0].points[0].stress, 21);
  assert.equal(days[0].points[0].hr, undefined);
  assert.equal(days[0].points[1].hr, 54);
  const slots = daySlots(days[0].points.map((point) => ({ t: point.t, value: point.stress })), 0);
  assert.equal(slots[12], 21);
  assert.equal(slots[13], 28);
  assert.equal(filledSlots(heartSlots(days[0].points, 0)), 1);
});
