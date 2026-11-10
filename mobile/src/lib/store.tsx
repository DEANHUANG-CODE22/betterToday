import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { signIn, signOut, loadSession } from './coros/oauth';
import { syncFromCoros, type SyncReport } from './coros/sync';
import { clearAll, clearData, getMeta, loadAdviceLogs, loadDataset, saveAdviceLog, setAdviceAction, setMeta, upsertDataset, type AdviceLog } from './db';
import { addDays, toISODate } from './metrics';
import type { ReturnKind } from './advice';
import { mockDataset } from './mock';
import type { Dataset } from './types';

type Source = 'mock' | 'coros' | 'scenario';

interface DataState {
  data: Dataset;
  today: string;
  source: Source;
  loading: boolean;
  lastSync?: string;
  lastReport?: SyncReport;
  error?: string;
  dismissError: () => void;
  logs: AdviceLog[];
  /** 回归期分档，用户回答过才有值。 */
  returnKind?: ReturnKind;
  /** 这次答案对应的是哪一次中断（最后一次训练的日期）。 */
  returnKindFor?: string;
  answerReturnKind: (kind: ReturnKind, forDate: string) => Promise<void>;
  /** 清掉声明，下次中断重新问。 */
  clearReturnKind: () => Promise<void>;
  /** 演练模式：把一套造出来的数据写进库，再回首页看效果。 */
  injectScenario: (dataset: Dataset) => Promise<void>;
  sync: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  recordAdvice: (log: AdviceLog) => Promise<void>;
  actOnAdvice: (date: string, action: AdviceLog['userAction'], note?: string) => Promise<void>;
}

const empty: Dataset = { sleep: [], daily: [], activities: [], ability: [], loads: [] };
const Ctx = createContext<DataState | null>(null);

async function keepStressSeries(daily: Dataset['daily'], report: SyncReport): Promise<Dataset['daily']> {
  const prev = await loadDataset();
  const old = new Map(prev.daily.map((day) => [day.date, day.stressSeries]));
  const failed = report.errors.some((error) => error.startsWith('queryStressTimeSeries'));
  const today = toISODate(new Date());
  const windowStart = addDays(today, -6);
  return daily.map((day) => {
    if (day.stressSeries?.length) return day;
    const kept = old.get(day.date);
    if (!kept?.length) return day;
    if (failed || day.date < windowStart) return { ...day, stressSeries: kept };
    return day;
  });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(empty);
  const [source, setSource] = useState<Source>('mock');
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>();
  const [lastReport, setLastReport] = useState<SyncReport>();
  const [error, setError] = useState<string>();
  const [logs, setLogs] = useState<AdviceLog[]>([]);
  const [returnKind, setReturnKind] = useState<ReturnKind>();
  const [returnKindFor, setReturnKindFor] = useState<string>();

  const reload = useCallback(async () => {
    setData(await loadDataset());
    setLogs(await loadAdviceLogs());
  }, []);

  const seedMock = useCallback(async () => {
    await clearData();
    await upsertDataset(mockDataset());
    await setMeta('source', 'mock');
    setSource('mock');
  }, []);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      if (!(await loadSession())) {
        await seedMock();
      } else {
        const { data: fresh, report } = await syncFromCoros();
        if (fresh.daily) fresh.daily = await keepStressSeries(fresh.daily, report);
        if ((await getMeta('source')) !== 'coros') await clearData();
        await upsertDataset(fresh);
        await setMeta('source', 'coros');
        const at = new Date().toISOString();
        await setMeta('lastSync', at);
        setSource('coros');
        setLastSync(at);
        setLastReport(report);
        if (report.errors.length) setError(report.errors.join('\n'));
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reload, seedMock]);

  useEffect(() => {
    (async () => {
      try {
        const src = (await getMeta('source')) as Source | null;
        if (!src) await seedMock();
        else setSource(src);
        setLastSync((await getMeta('lastSync')) ?? undefined);
        const saved = await getMeta('returnKind');
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { kind: ReturnKind; for: string };
            setReturnKind(parsed.kind);
            setReturnKindFor(parsed.for);
          } catch {
            // 旧格式或损坏，当作没回答过，下次中断再问
          }
        }
        await reload();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [reload, seedMock]);

  const dismissError = useCallback(() => setError(undefined), []);

  const connect = useCallback(async () => {
    setError(undefined);
    try {
      await signIn();
      await sync();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sync]);

  const disconnect = useCallback(async () => {
    await signOut();
    await seedMock();
    setLastReport(undefined);
    await reload();
  }, [reload, seedMock]);

  const recordAdvice = useCallback(async (log: AdviceLog) => {
    await saveAdviceLog(log);
    setLogs(await loadAdviceLogs());
  }, []);

  const answerReturnKind = useCallback(async (kind: ReturnKind, forDate: string) => {
    await setMeta('returnKind', JSON.stringify({ kind, for: forDate }));
    setReturnKind(kind);
    setReturnKindFor(forDate);
  }, []);

  const clearReturnKind = useCallback(async () => {
    await setMeta('returnKind', '');
    setReturnKind(undefined);
    setReturnKindFor(undefined);
  }, []);

  /** 演练模式。故意不复用 sync()：它会在「数据源不是 coros」时保留旧数据，场景就串了。 */
  const injectScenario = useCallback(async (dataset: Dataset) => {
    await clearAll();
    await upsertDataset(dataset);
    await setMeta('source', 'scenario');
    setSource('scenario');
    await reload();
  }, [reload]);

  const actOnAdvice = useCallback(async (date: string, action: AdviceLog['userAction'], note?: string) => {
    await setAdviceAction(date, action, note);
    setLogs(await loadAdviceLogs());
  }, []);

  const value = useMemo(
    () => ({ data, today: toISODate(new Date()), source, loading, lastSync, lastReport, error, dismissError, logs, returnKind, returnKindFor, answerReturnKind, clearReturnKind, injectScenario, sync, connect, disconnect, recordAdvice, actOnAdvice }),
    [data, source, loading, lastSync, lastReport, error, dismissError, logs, returnKind, returnKindFor, answerReturnKind, clearReturnKind, injectScenario, sync, connect, disconnect, recordAdvice, actOnAdvice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData 必须在 DataProvider 内使用');
  return v;
}
