import { useEffect, useMemo, useRef } from 'react';
import { dailyAdvice, returnKindPrompt, yesterdaySentence, type AdviceMemory } from '@/lib/advice';
import { addDays, detectAnomalies } from '@/lib/metrics';
import { scheduleMorning } from '@/lib/notify';
import { activitiesOn, issuedAdvice, settle } from '@/lib/settle';
import { useData } from '@/lib/store';

/** 当天建议的计算，以及落库、早间通知。任意 Tab 挂上都会跑，不依赖人先打开「运动」。 */
export function useTodayAdvice(options?: { persist?: boolean }) {
  const persist = options?.persist !== false;
  const { data, today, logs, returnKind, returnKindFor, recordAdvice, actOnAdvice, answerReturnKind } = useData();
  const memory = useMemo<AdviceMemory>(() => {
    const recent = logs.filter((log) => log.date < today);
    const yesterday = recent.find((log) => log.date === addDays(today, -1));
    return {
      recentKinds: recent.map((log) => log.kind),
      yesterdayAction: yesterday?.userAction,
      returnKind,
    };
  }, [logs, today, returnKind]);
  const advice = useMemo(() => dailyAdvice(data, today, memory), [data, today, memory]);
  const prompt = useMemo(() => returnKindPrompt(data.activities, today, returnKindFor), [data.activities, today, returnKindFor]);
  const anomalies = useMemo(() => detectAnomalies(data.daily, data.sleep, today), [data.daily, data.sleep, today]);
  const todayLog = logs.find((log) => log.date === today);
  const todayActs = useMemo(() => activitiesOn(data.activities, today), [data.activities, today]);
  const settlement = useMemo(
    () => settle(issuedAdvice(advice, todayLog), data.activities, today, todayLog?.userAction, todayLog?.note),
    [advice, data.activities, today, todayLog],
  );
  const showSettlement = todayActs.length > 0 || !!todayLog?.userAction;
  const yesterdayLog = logs.find((log) => log.date === addDays(today, -1));
  const yesterday = yesterdayLog ? yesterdaySentence(yesterdayLog.title, yesterdayLog.userAction, yesterdayLog.note) : undefined;
  const acted = logs.filter((log) => log.userAction);
  const hitRate = acted.length >= 7
    ? `近 ${Math.min(7, acted.length)} 次建议，${acted.slice(-7).filter((log) => log.userAction === 'followed').length} 次你照做了`
    : undefined;
  const morningBody = useRef('');
  const bodyText = `${advice.title}。${advice.zones}`;
  useEffect(() => { morningBody.current = bodyText; }, [bodyText]);

  useEffect(() => {
    if (!persist) return;
    const saved = logs.find((log) => log.date === today);
    const frozen = !!saved && (!!saved.userAction || todayActs.length > 0);
    if (!frozen && (!saved || saved.kind !== advice.kind || saved.title !== advice.title || saved.confidence !== advice.confidence)) {
      void recordAdvice({
        date: today,
        kind: advice.kind,
        title: advice.title,
        duration: advice.duration,
        zones: advice.zones,
        narrative: advice.narrative,
        confidence: advice.confidence,
      });
    }
    void scheduleMorning(morningBody.current, false);
  }, [advice, logs, persist, recordAdvice, today, todayActs.length]);

  return {
    advice: {
      ...advice,
      reasons: anomalies[0] ? advice.reasons.filter((reason) => reason !== anomalies[0].message) : advice.reasons,
    },
    settlement,
    showSettlement,
    todayActs,
    todayLog,
    yesterday,
    hitRate,
    morningBody,
    prompt,
    actOnAdvice,
    answerReturnKind,
    returnKindFor,
    today,
  };
}
