#!/usr/bin/env node
// 全周期回放：把真实高驰数据逐日灌进 dailyAdvice，看引擎每天到底会说什么。
//
// 为什么需要它：这个项目已经出现过两次「靠推演得出错误结论」——PRD v0.4 里
// 一度写着「复训第一天会建议强度课」，真跑代码发现那天其实是「休息」。
// 建议规则只要改一行，就可能在某段时间上悄悄变错，必须能整段回放。
//
// 用法（**必须带 --experimental-strip-types**，因为要 import 应用里的 .ts）：
//
//   node --experimental-strip-types tools/replay.mjs --from 2026-09-12 --to 2026-11-03
//   node --experimental-strip-types tools/replay.mjs --from ... --to ... --refresh
//   node --experimental-strip-types tools/replay.mjs --from ... --to ... --json /tmp/data.json
//   node --experimental-strip-types tools/replay.mjs --emit-fixture 2026-10-01
//
// 环境：
//   export NODE_EXTRA_CA_CERTS=$HOME/.cursor/macos-cacerts.pem   # 访问 *.coros.com 必需
//   登录态在 tools/.coros-session.json；过期先跑 node tools/coros-probe.mjs login-cli cn
//
// 已知限制（不要当成精确值）：
//   1. queryRestingHeartRate 只能查最近 7 天，历史拿不到 —— 回放里没有静息心率。
//   2. trainingLoad 是估算：时长(分钟) × 平均心率 ÷ 100，不是 COROS 原始 Training Load。
//   3. anaerobicTE 用平均心率 ≥145 近似，不是真实无氧训练效果。
//   4. querySleepHrv 单次最多 7 天，所以要分段拉，一次回放会发十几个请求。
//   5. 每次 call 都会覆盖 docs/coros-mcp/sample-<tool>.json（probe 的既有行为）。
//
// 数据会缓存到 tools/.replay-cache.json（已 gitignore）。加了 --refresh 才重新拉。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.replay-cache.json');
const SAMPLE_DIR = path.join(ROOT, 'docs', 'coros-mcp');
const FIXTURE_DIR = path.join(ROOT, 'mobile', 'src', 'lib', '__tests__', 'fixtures');
const ADVICE_TS = path.join(ROOT, 'mobile', 'src', 'lib', 'advice.ts');

// ── 参数 ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { refresh: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--refresh') out.refresh = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--emit-fixture') out.emitFixture = argv[++i];
    else if (a === '--to-file') out.toFile = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`不认识的参数：${a}`);
  }
  return out;
}

const USAGE = `用法：
  node --experimental-strip-types tools/replay.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--refresh] [--json out]
  node --experimental-strip-types tools/replay.mjs --emit-fixture YYYY-MM-DD [--to-file path]

  --refresh        忽略缓存，重新从高驰拉数据
  --json <path>    把合并后的原始数据导出，方便别处用
  --emit-fixture   生成 mobile/…/fixtures/return-<date>.ts（默认覆盖同名文件）`;

// ── 日期 ──────────────────────────────────────────────────────────

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);
}

const iso = (d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));
const ymd = (d) => iso(d).replaceAll('-', '');

// ── 调高驰 ────────────────────────────────────────────────────────

function callProbe(tool, args) {
  execFileSync(process.execPath, [path.join(HERE, 'coros-probe.mjs'), 'call', tool, JSON.stringify(args)], {
    stdio: 'ignore',
    env: process.env,
  });
  const file = path.join(SAMPLE_DIR, `sample-${tool}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const text = raw?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error(`${tool} 没有返回 text`);
  // probe 里外层还套了一层 JSON 字符串
  return text.trim().startsWith('"') ? JSON.parse(text) : text;
}

/** `30:13` 是分:秒，`1:04:36` 才是时:分:秒。搞反会把训练负荷放大 60 倍。 */
function toMinutes(s) {
  const p = s.split(':').map(Number);
  return p.length === 2 ? p[0] + p[1] / 60 : p[0] * 60 + p[1] + p[2] / 60;
}

function parseSportRecords(text) {
  const out = [];
  for (const block of text.split(/\n(?=\d+\. )/)) {
    const head = block.match(/^\d+\. (.+?) — (\d{4}-\d{2}-\d{2})/);
    if (!head) continue;
    const dur = block.match(/Duration: ([\d:]+)/);
    const dist = block.match(/Distance: ([\d.]+) km/);
    const hr = block.match(/Avg HR: (\d+)/);
    out.push({
      date: head[2],
      kind: head[1],
      sport: /Hike|Walk/i.test(head[1]) ? 'walk'
        : /Cycl|Bike/i.test(head[1]) ? 'bike'
        : /Swim/i.test(head[1]) ? 'swim'
        : /Strength/i.test(head[1]) ? 'strength'
        : 'run',
      minutes: dur ? toMinutes(dur[1]) : 0,
      distanceM: dist ? Math.round(Number(dist[1]) * 1000) : 0,
      avgHr: hr ? Number(hr[1]) : undefined,
    });
  }
  return out;
}

function parseSleepOverview(text) {
  const out = {};
  for (const block of text.split(/\n\n(?=2026-)/)) {
    const date = block.match(/^(\d{4}-\d{2}-\d{2})/);
    const ms = block.match(/Main Sleep \(asleep\): (?:(\d+)h )?(\d+)min/);
    if (date && ms) out[date[1]] = Number(ms[1] ?? 0) * 60 + Number(ms[2]);
  }
  return out;
}

function parseSleepHrv(text) {
  const out = {};
  for (const m of text.matchAll(/(\d{4}-\d{2}-\d{2}):\n\s+HRV Avg: (\d+) ms/g)) out[m[1]] = Number(m[2]);
  return out;
}

function fetchData(from, to) {
  // 回放要用到 28 天基线，往前多拉 42 天
  const fetchFrom = addDays(from, -42);
  const acts = parseSportRecords(
    callProbe('querySportRecords', { startDate: ymd(fetchFrom), endDate: ymd(to), limit: 100 }),
  ).sort((a, b) => a.date.localeCompare(b.date)); // 接口是倒序返回的，这里统一成正序

  const sleep = {};
  const cursor = new Date(`${fetchFrom}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const mStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const mEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const s = mStart < new Date(`${fetchFrom}T00:00:00Z`) ? new Date(`${fetchFrom}T00:00:00Z`) : mStart;
    const e = mEnd > end ? end : mEnd;
    Object.assign(sleep, parseSleepOverview(callProbe('querySleepOverview', { startDate: ymd(s), endDate: ymd(e) })));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  }

  const hrv = {};
  for (let d = fetchFrom; d <= to; d = addDays(d, 7)) {
    const chunkEnd = addDays(d, 6) > to ? to : addDays(d, 6);
    Object.assign(hrv, parseSleepHrv(callProbe('querySleepHrv', { startDate: ymd(d), endDate: ymd(chunkEnd) })));
  }

  return { fetchedAt: new Date().toISOString(), from: fetchFrom, to, acts, sleep, hrv };
}

function loadData(from, to, refresh) {
  if (!refresh && fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (cached.from <= addDays(from, -42) && cached.to >= to) {
      process.stderr.write(`用缓存 ${CACHE}（拉取于 ${cached.fetchedAt}，加 --refresh 可重拉）\n`);
      return cached;
    }
    process.stderr.write('缓存范围不够，重新拉。\n');
  }
  process.stderr.write(`从高驰拉数据 ${addDays(from, -42)} ~ ${to} …\n`);
  const data = fetchData(from, to);
  fs.writeFileSync(CACHE, JSON.stringify(data, null, 2));
  return data;
}

// ── 组装 Dataset ──────────────────────────────────────────────────

function toActivity(a, i) {
  return {
    id: `a-${a.date}-${i}`,
    startTime: `${a.date}T07:00:00`,
    sport: a.sport,
    name: a.sport,
    distanceM: a.distanceM,
    durationS: Math.round(a.minutes * 60),
    avgHr: a.avgHr,
    trainingLoad: Math.round(a.minutes * (a.avgHr ?? 120) / 100),
    anaerobicTE: (a.avgHr ?? 0) >= 145 ? 3 : 1,
  };
}

function datasetUpTo(data, date) {
  const sleep = Object.keys(data.sleep)
    .filter((d) => d <= date)
    .sort()
    .map((d) => ({
      date: d, bedtime: '', wakeTime: '', totalMin: data.sleep[d],
      deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, hrv: data.hrv[d],
    }));
  const activities = data.acts.filter((a) => a.date <= date).map(toActivity);
  return { sleep, daily: [], activities, ability: [] };
}

// ── 显示 ──────────────────────────────────────────────────────────

/** 中日韩字符按 2 列算，否则终端里对不齐。 */
function width(s) {
  let w = 0;
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  return w;
}
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

// ── 主流程 ────────────────────────────────────────────────────────

async function main() {
  if (!process.execArgv.includes('--experimental-strip-types')) {
    console.error('缺少 --experimental-strip-types。请用：node --experimental-strip-types tools/replay.mjs …');
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.emitFixture && !(args.from && args.to))) {
    console.log(USAGE);
    return;
  }

  const { dailyAdvice } = await import(pathToFileURL(ADVICE_TS).href);

  // 生成 fixture
  if (args.emitFixture) {
    const date = args.emitFixture;
    const data = loadData(date, date, args.refresh);
    const acts = data.acts.filter((a) => a.date <= date);
    const last = acts.at(-1)?.date;
    const gap = last ? daysBetween(last, date) : undefined;
    const lines = [
      `// 真实数据快照 —— ${date}${gap != null ? `（距上次训练 ${gap} 天）` : ''}`,
      '//',
      `// 由 tools/replay.mjs --emit-fixture ${date} 生成，不要手改。`,
      '// 数据源：COROS MCP（querySportRecords / querySleepOverview / querySleepHrv）',
      `// 拉取时间：${data.fetchedAt}`,
      '//',
      '// 已知偏差（不要当成精确值）',
      '//   1. trainingLoad 是估算：时长(分钟) × 平均心率 ÷ 100。不是 COROS 原始 Training Load。',
      '//   2. deepMin / lightMin / remMin / awakeMin 填 0：查询结果只给了总时长。',
      '//   3. anaerobicTE 用平均心率 ≥145 判定，是近似。',
      '',
      "import type { Activity, Dataset, SleepNight } from '../../types.ts';",
      '',
      `export const RETURN_DATE = '${date}';`,
      '',
      'export const ACTIVITIES: Activity[] = [',
      ...acts.map((a, i) => {
        const x = toActivity(a, i);
        return `  { id: '${x.id}', startTime: '${x.startTime}', sport: '${x.sport}', name: '${x.name}', distanceM: ${x.distanceM}, durationS: ${x.durationS}, avgHr: ${x.avgHr}, trainingLoad: ${x.trainingLoad}, anaerobicTE: ${x.anaerobicTE} },`;
      }),
      '];',
      '',
      'export const SLEEP: SleepNight[] = [',
      ...Object.keys(data.sleep).filter((d) => d <= date).sort().map((d) =>
        `  { date: '${d}', bedtime: '${d}T01:00:00', wakeTime: '${d}T07:00:00', totalMin: ${data.sleep[d]}, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, hrv: ${data.hrv[d] ?? 'undefined'} },`),
      '];',
      '',
      'export const returnSnapshot: Dataset = {',
      '  sleep: SLEEP,',
      '  daily: [],',
      '  activities: ACTIVITIES,',
      '  ability: [],',
      '};',
      '',
    ];
    const target = args.toFile ?? path.join(FIXTURE_DIR, `return-${date}.ts`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, lines.join('\n'));
    console.error(`写出 ${target}`);
    return;
  }

  // 回放
  const data = loadData(args.from, args.to, args.refresh);
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(data, null, 2));
    console.error(`导出 ${args.json}`);
  }

  const rows = [];
  for (let d = args.from; d <= args.to; d = addDays(d, 1)) {
    const a = dailyAdvice(datasetUpTo(data, d), d);
    rows.push({ date: d, kind: a.kind, confidence: a.confidence, title: a.title });
  }

  console.log(`${pad('日期', 12)}${pad('kind', 11)}${pad('把握', 7)}标题`);
  console.log('-'.repeat(64));
  for (const r of rows) console.log(`${pad(r.date, 12)}${pad(r.kind, 11)}${pad(r.confidence, 7)}${r.title}`);

  const bad = rows.filter((r) => r.kind === 'intensity');
  const byKind = rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});
  console.log(`\n共 ${rows.length} 天：` + Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' / '));
  console.log(`强度课：${bad.length ? bad.map((r) => r.date).join(', ') : '无'}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
