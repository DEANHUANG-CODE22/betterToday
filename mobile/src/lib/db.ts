import * as SQLite from 'expo-sqlite';
import type { AdviceAction, AdviceKind, Confidence } from './advice';
import type { Ability, Activity, Dataset, DailyHealth, SleepNight, TrainingLoadDay } from './types';

export interface AdviceLog {
  date: string;
  kind: AdviceKind;
  title: string;
  duration: string;
  zones: string;
  narrative: string;
  confidence: Confidence;
  userAction?: AdviceAction;
  note?: string;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  dbPromise ??= (async () => {
    const db = await openWithRetry();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sleep (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ability (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, start_time TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS load_day (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS advice_log (date TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS activity_start ON activity (start_time);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    return db;
  })().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

// web 端（OPFS）上一页面实例可能尚未释放文件句柄，短暂重试即可
async function openWithRetry(attempts = 8): Promise<SQLite.SQLiteDatabase> {
  for (let i = 0; ; i++) {
    try {
      return await SQLite.openDatabaseAsync('nowornever.db');
    } catch (e) {
      if (i >= attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
}

export async function upsertDataset(data: Partial<Dataset>) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const s of data.sleep ?? []) await db.runAsync('INSERT OR REPLACE INTO sleep VALUES (?, ?)', s.date, JSON.stringify(s));
    for (const d of data.daily ?? []) await db.runAsync('INSERT OR REPLACE INTO daily VALUES (?, ?)', d.date, JSON.stringify(d));
    for (const a of data.ability ?? []) await db.runAsync('INSERT OR REPLACE INTO ability VALUES (?, ?)', a.date, JSON.stringify(a));
    for (const a of data.activities ?? [])
      await db.runAsync('INSERT OR REPLACE INTO activity VALUES (?, ?, ?)', a.id, a.startTime, JSON.stringify(a));
    for (const row of data.loads ?? []) await db.runAsync('INSERT OR REPLACE INTO load_day VALUES (?, ?)', row.date, JSON.stringify(row));
  });
}

async function all<T>(sql: string): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(sql);
  return rows.map((r) => JSON.parse(r.json) as T);
}

export async function loadDataset(): Promise<Dataset> {
  const [sleep, daily, ability, activities, loads] = await Promise.all([
    all<SleepNight>('SELECT json FROM sleep ORDER BY date'),
    all<DailyHealth>('SELECT json FROM daily ORDER BY date'),
    all<Ability>('SELECT json FROM ability ORDER BY date'),
    all<Activity>('SELECT json FROM activity ORDER BY start_time DESC'),
    all<TrainingLoadDay>('SELECT json FROM load_day ORDER BY date'),
  ]);
  return { sleep, daily, ability, activities, loads };
}

export async function loadAdviceLogs(): Promise<AdviceLog[]> {
  return all<AdviceLog>('SELECT json FROM advice_log ORDER BY date');
}

export async function saveAdviceLog(log: AdviceLog) {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ json: string }>('SELECT json FROM advice_log WHERE date = ?', log.date);
  const prev = existing ? (JSON.parse(existing.json) as AdviceLog) : undefined;
  const next: AdviceLog = { ...log, userAction: log.userAction ?? prev?.userAction, note: log.note ?? prev?.note };
  await db.runAsync('INSERT OR REPLACE INTO advice_log VALUES (?, ?)', log.date, JSON.stringify(next));
}

export async function setAdviceAction(date: string, userAction: AdviceLog['userAction'], note?: string) {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ json: string }>('SELECT json FROM advice_log WHERE date = ?', date);
  if (!existing) {
    // 当天还没有建议行（启动瞬间就点、或当天记录写入失败）时不能静默丢弃：
    // 以前这里直接 return，按钮一整天都是死的，而且没有任何迹象（2026-11-05 修）。
    const stub: AdviceLog = { date, kind: 'unknown', title: '—', duration: '--', zones: '--', narrative: '', confidence: 'low', userAction, note };
    await db.runAsync('INSERT OR REPLACE INTO advice_log VALUES (?, ?)', date, JSON.stringify(stub));
    return;
  }
  const prev = JSON.parse(existing.json) as AdviceLog;
  await db.runAsync('INSERT OR REPLACE INTO advice_log VALUES (?, ?)', date, JSON.stringify({ ...prev, userAction, note: note ?? prev.note }));
}

export async function clearData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM sleep; DELETE FROM daily; DELETE FROM ability; DELETE FROM activity; DELETE FROM load_day;');
}

/** 演练模式用：数据表和 advice_log 一起清，避免昨天的动作串到今天。 */
export async function clearAll() {
  const db = await getDb();
  await db.execAsync(
    'DELETE FROM sleep; DELETE FROM daily; DELETE FROM ability; DELETE FROM activity; DELETE FROM load_day; DELETE FROM advice_log;',
  );
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO meta VALUES (?, ?)', key, value);
}
