/**
 * 知识层（2026-11-27，审定稿见 docs/KNOWLEDGE-DRAFT.md）。
 * 四层：数据 → 事实（advice / metrics / gauge）→ **知识（这里）** → 表达（agent / 界面）。
 * 铁律：数和判断只从事实层来，说法只从这里来；这里不算数、不下判断，「你的」一段只把事实层给的数填进模板。
 * 门槛数字和 advice.ts 现在的代码一致；规则改了，这里要跟着改（knowledge.test.ts 会核对几个关键数）。
 */
import { hrvPhrase } from './agent.ts';
import type { Confidence } from './advice.ts';
import { fmtHM } from './metrics.ts';

export type TopicId =
  | 'baseline' | 'deviation' | 'confidence' | 'plan'
  | 'hrv' | 'recovery' | 'restingHr' | 'sleep' | 'stress'
  | 'acwr' | 'tsb' | 'hard' | 'return' | 'zones' | 'feel';

export interface Source {
  label: string;
  url?: string;
}

/** 事实层给的数。页面算好传进来，缺的就不填，「你的」那段自己会说没有。 */
export interface Facts {
  today?: string;
  sleep?: { date: string; totalMin: number; avg28Min?: number; deepMin: number; lightMin: number; remMin: number; awakeMin: number };
  hrv?: { date: string; value: number; base?: number; low?: number; high?: number };
  restingHr?: { value: number; avg28?: number };
  recovery?: { date: string; score?: number; level?: string; fullH?: number };
  stress?: { date: string; avg?: number; missingHours?: number };
  acwr?: number;
  tsb?: number;
  hard?: { n7: number; sinceDays?: number };
  confidence?: { level: Confidence; tip?: string };
  plan?: { word: string; duration: string; zones: string };
  /** 已经连续偏离的项（detectAnomalies 的 message）。 */
  deviations?: string[];
  feel?: { today?: number; avg?: number; n: number };
}

export interface Topic {
  id: TopicId;
  title: string;
  what: string;
  forRunning: string;
  changes: string;
  /** 什么时候该找医生；不适用的为空。 */
  doctor?: string;
  sources: Source[];
  /** 「你的」一段：只用 facts 里的数。没有可说的返回空。 */
  yours: (f: Facts) => string | undefined;
}

const md = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
const r = (v: number) => Math.round(v);
const CONF = { high: '高', medium: '中', low: '低' } as const;

const SRC = {
  hrvReview: { label: 'Shaffer & Ginsberg 2017，An Overview of Heart Rate Variability Metrics and Norms（Frontiers in Public Health）', url: 'https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2017.00258' },
  corosHrv: { label: '高驰：What is HRV?', url: 'https://coros.com/us/stories/coros-metrics/c/what-is-hrv' },
  corosRecoveryWidget: { label: '高驰：Understanding the Recovery Widget', url: 'https://support.coros.com/hc/en-us/articles/15406707571732-Understanding-the-Recovery-Widget' },
  corosRecovery: { label: '高驰：Your COROS Recovery Metrics Explained', url: 'https://coros.com/us/stories/coros-metrics/c/your-coros-recovery-metrics-explained' },
  corosStress: { label: '高驰：Daily Stress', url: 'https://support.coros.com/hc/en-us/articles/22933434857108-Daily-Stress' },
  mayoHr: { label: 'Mayo Clinic：Heart rate: What\'s normal?', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/expert-answers/heart-rate/faq-20057979' },
  sleepConsensus: { label: 'Watson et al. 2015，AASM / SRS 成人睡眠时长共识', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/' },
  gabbett: { label: 'Gabbett 2016，The training—injury prevention paradox（BJSM）', url: 'https://bjsm.bmj.com/content/50/5/273.abstract' },
  ffm: { label: '体能—疲劳模型综述（Sports Medicine – Open, 2022）', url: 'https://link.springer.com/article/10.1186/s40798-022-00426-x' },
  rules: { label: 'betterToday 的判断规则' },
  self: { label: '你自己记的，没有外部来源' },
  corosZones: { label: '沿用高驰手表里的区间设置' },
} satisfies Record<string, Source>;

export const TOPICS: Record<TopicId, Topic> = {
  baseline: {
    id: 'baseline',
    title: '平时范围',
    what: '拿你自己最近的数当尺子。App 里说的「平时」就是这个：这一天之前 28 天（不含当天）的平均。手表自己也给 HRV 的基线，App 写作「手表基线」，和它分开。另外也看前 7 天的平均，用来说「最近」。',
    forRunning: '同一个数，放在不同的人身上意思完全不同。HRV 50 对一个人是好的一晚，对另一个人是差的一晚。所以 App 不拿教科书的数比，只拿你自己的平时比。规则里每个「偏高 / 偏低」都是相对这把尺子说的。',
    changes: '平时本身也会慢慢变。练得更多、换季、生病一段时间之后，28 天的平均都会跟着移。所以它是「最近的你」，不是「理想的你」。',
    sources: [SRC.hrvReview],
    yours: (f) => {
      const parts = [
        f.hrv?.base != null ? `HRV 平时 ${r(f.hrv.base)}` : '',
        f.restingHr?.avg28 != null ? `静息心率平时 ${r(f.restingHr.avg28)}` : '',
        f.sleep?.avg28Min != null ? `睡眠平时 ${fmtHM(r(f.sleep.avg28Min))}` : '',
      ].filter(Boolean);
      return parts.length ? `你的${parts.join('，')}。` : '我的数还不到 28 天，平时范围还不稳。';
    },
  },
  deviation: {
    id: 'deviation',
    title: '偏离',
    what: '这一天的数离开了你的平时，超过一定比例。不同指标的比例不同：静息心率 5%，HRV 7%（建议页）或 10%（连续偏离），压力 20%，睡眠时长 12%。',
    forRunning: '一天的偏离 App 只陈述，不下结论。连续 3 天同方向偏离（静息心率偏高、压力偏高、HRV 偏低、睡眠偏短，任意一项）才会进建议，当天排休息。',
    changes: '喝酒、晚睡、生病初期、高温、高海拔、出差倒时差、一次很重的训练、经期，都可能让一两项指标偏离。偏离说明身体在应付什么，不说明是什么。',
    doctor: '偏离持续多天，同时身体明显不舒服（比如胸闷、心慌、头晕、发烧），去看医生，不要等 App 的数。',
    sources: [SRC.rules, SRC.hrvReview],
    yours: (f) => (f.deviations?.length ? `${f.deviations.join('；')}。` : '最近没有哪项连续 3 天偏离你的平时。'),
  },
  confidence: {
    id: 'confidence',
    title: '把握',
    what: '我对今天这条建议有多确定，三格：高、中、低。',
    forRunning: '数据缺得越多，把握越低。昨夜没有睡眠记录、近 7 天睡眠不到 3 晚、近 28 天算不出负荷比、近 28 天有对不上的训练记录：任意一项都会让把握降到低；昨夜没有睡眠时，不给强度课。有睡眠但没测到 HRV：最高到中。两条依据互相打架（比如 HRV 不错但只睡了不到 6.5 小时）：降一档；打架两条以上直接低。',
    changes: '戴表睡觉、按时同步，把握就会回来。',
    sources: [SRC.rules],
    yours: (f) => (f.confidence ? `今天把握${CONF[f.confidence.level]}${f.confidence.tip ? `：${f.confidence.tip}` : '。'}` : undefined),
  },
  plan: {
    id: 'plan',
    title: '今天怎么排',
    what: '每天的建议是四档之一：强度（可以上一次强度课）、有氧（Z2 为主，不顶阈值）、休息（0–20 或 0–30 分钟，想动就散步）、回归期（中断之后慢慢回来）。',
    forRunning: '先挡后放：1. 中断 7 天以上 → 回归期，先于一切。2. 负荷比超过 1.5，或状态值低于 −30 → 今天别跑。3. 连续 3 天偏离、HRV 偏低且睡不到 6.5 小时、恢复档位低（分数低于 45）→ 今天别上强度。4. 同时满足：恢复档位好（70 分及以上）、近 7 天强度课不超过 1 次、状态值高于 −10（或没有）、离上次强度至少 2 天 → 可以上强度。5. 其余 → 有氧。中断 4–6 天回来的那天，强度课强制降成有氧。',
    changes: '每天同步之后重算。当天点过按钮或已经有训练记录，建议就不再变，改成结算。',
    sources: [SRC.rules],
    yours: (f) => (f.plan ? `今天${f.plan.word}：${f.plan.duration}，${f.plan.zones}。` : undefined),
  },
  hrv: {
    id: 'hrv',
    title: '夜间 HRV',
    what: '心率变异性，心跳和心跳之间的间隔有多不均匀。睡着的时候测，排除了白天活动的干扰。高驰手表给的是一晚的平均值，以及一个「正常范围」。',
    forRunning: 'HRV 比你平时高，通常说明身体放松、恢复得好；比平时低，通常说明身体在应付压力（训练、睡眠不足、生病、喝酒）。规则里：HRV 比你 28 日平时低超过 7% 且睡不到 6.5 小时，当天排休息；手表恢复分不在时，它也参与估算恢复。只看这一晚不下结论。',
    changes: '年龄、性别、体能都会让每个人的 HRV 差很多，所以只和自己比。短期会让它变低的：重训练、晚睡、喝酒、生病初期、高温、紧张。',
    doctor: 'HRV 本身不用来诊断（高驰也这样说）。连续多晚明显低于平时，同时感觉不舒服，去看医生。',
    sources: [SRC.hrvReview, SRC.corosHrv],
    yours: (f) => (f.hrv ? `${md(f.hrv.date)}：${hrvPhrase(r(f.hrv.value), f.hrv.base != null ? r(f.hrv.base) : undefined, f.hrv.low, f.hrv.high).text}` : '我还没看到夜间 HRV。'),
  },
  recovery: {
    id: 'recovery',
    title: '手表恢复分',
    what: '高驰手表给的恢复分，0–100，以及一个档位（充沛、良好等）和预计完全恢复要几小时。它是手表算的，App 只读，不改。',
    forRunning: '规则把恢复分分三档：70 及以上「好」，45–69「中」，45 以下「差」。「差」当天排休息；只有「好」才可能上强度。手表没给恢复分的那天，我会用 HRV、静息心率、睡眠估一个分顶上（从 75 起，按它们和你平时的差加减），只在我这里用来分档；界面上的恢复表仍写「没有」，不把估的分当成手表的。',
    changes: '高驰说明，恢复计时主要按你的基础体能和训练负荷估算，不看睡眠、HRV、日常压力和肌肉疲劳；和你的感觉不一致时，高驰建议相信感觉。',
    sources: [SRC.corosRecoveryWidget, SRC.corosRecovery],
    yours: (f) => {
      if (f.recovery?.score == null) return '这一晚手表没给恢复分。';
      const full = f.recovery.fullH == null ? '' : f.recovery.fullH === 0 ? '，已经完全恢复' : `，预计 ${f.recovery.fullH} 小时后完全恢复`;
      return `手表给的恢复分 ${r(f.recovery.score)}${f.recovery.level ? `（${f.recovery.level}）` : ''}，${md(f.recovery.date)}${full}。`;
    },
  },
  restingHr: {
    id: 'restingHr',
    title: '静息心率',
    what: '完全放松时一分钟心跳多少次。手表一般在睡眠中或早上取。',
    forRunning: '比平时高，通常说明身体比平时费劲（没恢复、要生病、睡不好、脱水）。规则里：比你平时高超过 5% 写进依据；连续 3 天偏高当天排休息。',
    changes: '耐力训练会让静息心率慢慢降低，练得好的跑者常常低于 60。短期升高：晚睡、喝酒、咖啡因、高温、脱水、生病初期。',
    doctor: '成年人静息心率通常在 60–100；耐力运动员可以更低。如果你不是长期训练的人、却经常低于 60，或者心率特别快或特别慢的同时有头晕、胸痛、晕倒、气短，去看医生。',
    sources: [SRC.mayoHr],
    yours: (f) => {
      if (!f.restingHr) return '我还没看到静息心率。';
      const v = r(f.restingHr.value);
      if (f.restingHr.avg28 == null) return `静息心率 ${v}。`;
      const base = r(f.restingHr.avg28);
      const d = v - base;
      return Math.abs(d) <= Math.max(1, base * 0.05) ? `静息心率 ${v}，和你平时的 ${base} 差不多。` : `静息心率 ${v}，比你平时的 ${base} ${d > 0 ? '高' : '低'} ${Math.abs(d)}。`;
    },
  },
  sleep: {
    id: 'sleep',
    title: '睡眠时长与分期',
    what: '手表记下的一晚睡了多久（扣掉清醒），以及深睡、浅睡、REM、清醒各占多少分钟。分期是按总分钟算的比例，不是逐段时间轴。',
    forRunning: '睡眠是恢复的主要来源。规则里：昨夜没有睡眠记录不给强度课；睡不到 6.5 小时写进依据，并和 HRV 偏低一起时排休息；睡到 7.5 小时以上写「睡够了」。',
    changes: '作息、咖啡因、酒精、晚间训练、压力、卧室温度。手表的分期是估算，和睡眠实验室的结果会有出入。',
    doctor: '成年人建议每晚 7 小时以上。长期睡不够、白天困得影响生活，或者打鼾很响、有人说你睡着时会憋气，去看医生（睡眠门诊）。',
    sources: [SRC.sleepConsensus],
    yours: (f) => {
      if (!f.sleep) return '我还没看到睡眠记录。';
      const s = f.sleep;
      const which = s.date === f.today ? '昨夜' : `${md(s.date)}醒来，`;
      return `${which}睡了 ${fmtHM(s.totalMin)}${s.avg28Min != null ? `，你平时 ${fmtHM(r(s.avg28Min))}` : ''}。深睡 ${fmtHM(s.deepMin)}、浅睡 ${fmtHM(s.lightMin)}、REM ${fmtHM(s.remMin)}、清醒 ${fmtHM(s.awakeMin)}。`;
    },
  },
  stress: {
    id: 'stress',
    title: '压力',
    what: '高驰手表按心率和 HRV 估的压力，0–100，大约每 5 分钟一个点，和你自己的平时比。高驰把它分成 0–25、26–50、51–75、76–100 四段。App 的压力表盘按这四段上色，但不写「放松」「高」这类评价。',
    forRunning: '压力连续 3 天比你平时高超过 20%，当天排休息。单日的压力只陈述。',
    changes: '工作、睡眠不足、生病、喝咖啡、高温、刚运动完都会让它升高。高驰说明基线大约需要一周才稳定；整天的值需要至少连续戴 16 小时，包括夜里。',
    doctor: '长期压力大、影响睡眠和生活，找医生或心理专业人员。',
    sources: [SRC.corosStress],
    yours: (f) => {
      if (f.stress?.avg == null) return '这一天我没看到压力。';
      return `${md(f.stress.date)}压力日均 ${r(f.stress.avg)}（0–100）${f.stress.missingHours ? `，有 ${f.stress.missingHours} 个小时没采到` : ''}。`;
    },
  },
  acwr: {
    id: 'acwr',
    title: '负荷比',
    what: '短期负荷（最近一周）除以长期负荷（最近几周的平均）。大于 1 说明最近练得比你习惯的多。App 优先用高驰给的负荷（3 天内的才算），没有时用训练记录自己算。',
    forRunning: '负荷比超过 1.5，当天「今天别跑」。负荷涨得太快比练得多更容易出问题；但练得太少也不是越安全。',
    changes: '一周加量太猛、比赛周、伤停回来那几天（长期负荷小，比值容易虚高）。',
    sources: [SRC.gabbett],
    yours: (f) => (f.acwr != null ? `负荷比 ${(Math.round(f.acwr * 10) / 10).toFixed(1)}（短期 / 长期），规则的停训线是 1.5。` : '近 28 天算不出负荷比，今天不谈加量。'),
  },
  tsb: {
    id: 'tsb',
    title: '状态值',
    what: '长期负荷减短期负荷（体能减疲劳）。负数说明最近的疲劳压过了体能，正数说明有余量。App 优先用高驰给的长短期负荷，没有时用训练记录按 7 天和 42 天的时间常数自己算。',
    forRunning: '低于 −30 当天别跑；低于 −10 不上强度课。',
    changes: '连续几天的大训练量会让它往下走；休息、减量会让它回升。它是模型估的，不是测出来的。',
    sources: [SRC.ffm],
    yours: (f) => (f.tsb != null ? `状态值 ${r(f.tsb)}。规则：低于 −30 先停，低于 −10 不上强度。` : '我还算不出状态值。'),
  },
  hard: {
    id: 'hard',
    title: '强度课',
    what: 'App 怎么认一次训练「算强度」：无氧训练效果 3 及以上，或者心率在 Z4、Z5 的时间占这次训练的 25% 以上。',
    forRunning: '规则里两条和它有关：近 7 天强度课超过 1 次，今天不再排强度；离上次强度不到 2 天，今天不再排强度。',
    changes: '间歇、阈值跑、比赛通常都会被认成强度课；长距离慢跑一般不会，除非心率长时间偏高（天热、上坡多）。',
    sources: [SRC.rules],
    yours: (f) => (f.hard ? `近 7 天你有 ${f.hard.n7} 次强度课${f.hard.sinceDays != null ? `，上一次是 ${f.hard.sinceDays} 天前` : '，更早的记录里也没有'}。` : undefined),
  },
  return: {
    id: 'return',
    title: '回归期',
    what: '中断训练 7 天以上之后的一段「慢慢回来」的时间。长短看你说的中断原因：主动休息或轻伤 10 天，1–2 周 14 天，3–4 周 21 天，更久的（骨性、术后）42 天；不回答按 21 天算。',
    forRunning: '回归期里不排强度课，每周总时长有上限：第一周是中断前周均的 70%（没受伤、主动休息）或 50%（受伤），之后每周最多加 15%。出回归期要量回来了：期满之后，连续两个 7 天的量都回到中断前的 65% 以上；或者期满再过 7 天、近 7 天练了 3 次、量到 50% 以上也放行。中断 4–6 天不进回归期，但回来那天的强度课会降成有氧。',
    changes: '你在设置里或运动页提问卡里说的中断原因，会改变回归期的长短；不会改变当天的建议。',
    doctor: '因为受伤中断的，回来之前先确认伤好了；回来后疼痛加重、关节肿，停下来去看医生。',
    sources: [SRC.rules],
    yours: (f) => (f.plan?.word === '回归期' ? `今天回归期：${f.plan.duration}，${f.plan.zones}。` : undefined),
  },
  zones: {
    id: 'zones',
    title: '心率区间（Z1–Z5）',
    what: '按心率把强度分成五段。Z1 很轻松，Z2 能说完整句子的轻松有氧，Z3 有点吃力，Z4 接近阈值，Z5 很吃力。区间的边界来自高驰手表的设置。',
    forRunning: '建议里的「Z2 为主」「主课 Z4 或 Z5」都是这套区间；强度课的认定也用 Z4、Z5 的时间占比。',
    changes: '区间按你的最大心率或阈值心率算，在手表里改了设置，区间就变。天热、脱水、没睡好时，同样的配速心率会更高。',
    doctor: '运动中出现胸痛、明显心慌、头晕要晕倒，马上停下，必要时就医。',
    sources: [SRC.corosZones],
    yours: () => undefined,
  },
  feel: {
    id: 'feel',
    title: '早上感觉',
    what: '你每天早上给自己打的分，1 到 5，「很累」到「很好」。是你自己记的，不是 App 算的。',
    forRunning: '现在不进规则，只记下来，在「每日记录」里和当天的建议、照没照做、次日 HRV 放在一起看。以后规则要调整时，它是最直接的对照。',
    changes: '睡眠、昨天练了什么、生活里的事。和手表的数不一致很正常：手表看不到的东西，你自己知道。',
    doctor: '连续很多天都很累，休息也不见好，去看医生。',
    sources: [SRC.self],
    yours: (f) => {
      if (!f.feel) return undefined;
      const head = f.feel.today != null ? `今天早上你记的是 ${f.feel.today} / 5。` : '今天早上还没记。';
      return f.feel.n > 0 && f.feel.avg != null ? `${head}最近 ${f.feel.n} 天平均 ${f.feel.avg.toFixed(1)}。` : head;
    },
  },
};

/** 每一页「问一句」里列哪些条目。非决策页不放「今天怎么排」（许可语只在运动页）。 */
export const PAGE_TOPICS = {
  sleep: ['sleep', 'hrv', 'recovery', 'baseline', 'deviation', 'feel'],
  daily: ['restingHr', 'stress', 'baseline', 'deviation'],
  sport: ['plan', 'confidence', 'acwr', 'tsb', 'hard', 'recovery', 'return', 'zones'],
} as const satisfies Record<string, readonly TopicId[]>;
