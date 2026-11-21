import { addDays, compareYMD, dhakaToday, isValidYMD, weekdayOf, type HM, type YMD } from "../dates";

export interface Span {
  start: number;
  end: number;
}

export interface ParsedDeadline {
  date: YMD | null;
  time: HM | null;
  notes: string[];
  /** True when the reading is a guess the student must confirm. */
  uncertain: boolean;
  /** Character ranges of date/time phrases in the lower-cased text. */
  spans: Span[];
}

const LATIN = "a-z";
const BANGLA = "\u0980-\u09FF";
const NOT_BEFORE = `(?<![${LATIN}${BANGLA}])`;
const NOT_AFTER = `(?![${LATIN}${BANGLA}])`;

const MONTH_WORDS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  "জানুয়ারি": 1, "জানুয়ারী": 1, "ফেব্রুয়ারি": 2, "ফেব্রুয়ারী": 2, "মার্চ": 3, "এপ্রিল": 4, "মে": 5,
  "জুন": 6, "জুলাই": 7, "আগস্ট": 8, "অগাস্ট": 8, "সেপ্টেম্বর": 9, "অক্টোবর": 10, "নভেম্বর": 11,
  "ডিসেম্বর": 12,
};

const MONTH_LOOKUP = new Map(
  Object.entries(MONTH_WORDS).map(([word, month]) => [word.normalize("NFC"), month]),
);
const MONTH_ALT = [...MONTH_LOOKUP.keys()].sort((a, b) => b.length - a.length).join("|");

const WEEKDAY_WORDS: Record<string, number> = {
  sunday: 0, robibar: 0, "রবিবার": 0,
  monday: 1, sombar: 1, shombar: 1, "সোমবার": 1,
  tuesday: 2, tues: 2, mongolbar: 2, "মঙ্গলবার": 2,
  wednesday: 3, wed: 3, budhbar: 3, "বুধবার": 3,
  thursday: 4, thurs: 4, thu: 4, brihospotibar: 4, brihoshpotibar: 4, "বৃহস্পতিবার": 4,
  friday: 5, fri: 5, shukrobar: 5, sukrobar: 5, "শুক্রবার": 5,
  saturday: 6, shonibar: 6, sonibar: 6, "শনিবার": 6,
};
const WEEKDAY_LOOKUP = new Map(
  Object.entries(WEEKDAY_WORDS).map(([word, day]) => [word.normalize("NFC"), day]),
);
const WEEKDAY_ALT = [...WEEKDAY_LOOKUP.keys()].sort((a, b) => b.length - a.length).join("|");

const DEADLINE_CUE =
  /(?<![a-z])(by|due|deadline|before|until|till|within|last date|no later than|moddhe|modhe|er age|vitor|bhitor)(?![a-z])|মধ্যে|আগে/;

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** NFC-normalises and converts Bangla digits so one set of patterns covers both scripts. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}

const describe = (date: YMD) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(date.y, date.m - 1, date.d)));

interface DateCandidate extends Span {
  date: YMD;
  kind: "absolute" | "relative";
  note?: string;
}

interface TimeCandidate extends Span {
  time: HM | null;
  note?: string;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

function inferYear(month: number, day: number, today: YMD): number {
  const sameYear = { y: today.y, m: month, d: day };
  const daysAgo = compareYMD(today, sameYear) / 86_400_000;
  return daysAgo > 60 ? today.y + 1 : today.y;
}

function fullYear(raw: string): number {
  const year = Number(raw);
  return raw.length <= 2 ? 2000 + year : year;
}

function findAbsoluteDates(s: string, today: YMD): DateCandidate[] {
  const found: DateCandidate[] = [];
  const add = (match: RegExpExecArray, date: YMD, note?: string) => {
    const span = { start: match.index, end: match.index + match[0].length };
    if (!isValidYMD(date) || found.some((other) => overlaps(other, span))) return;
    found.push({ ...span, date, kind: "absolute", note });
  };

  for (const m of s.matchAll(/(?<![\d/.-])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) {
    add(m, { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) });
  }

  const dayMonth = new RegExp(
    String.raw`(?<![\d:.])(\d{1,2})(?:st|nd|rd|th)?[\s-]*(?:of\s+)?(${MONTH_ALT})${NOT_AFTER}\.?(?:,?\s*(\d{4})(?!\d))?`,
    "g",
  );
  for (const m of s.matchAll(dayMonth)) {
    const month = MONTH_LOOKUP.get(m[2])!;
    const day = Number(m[1]);
    add(m, { y: m[3] ? Number(m[3]) : inferYear(month, day, today), m: month, d: day });
  }

  const monthDay = new RegExp(
    String.raw`${NOT_BEFORE}(${MONTH_ALT})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?![\d:]|\.\d)(?:\s*,?\s*(\d{4})(?!\d))?`,
    "g",
  );
  for (const m of s.matchAll(monthDay)) {
    const month = MONTH_LOOKUP.get(m[1])!;
    const day = Number(m[2]);
    add(m, { y: m[3] ? Number(m[3]) : inferYear(month, day, today), m: month, d: day });
  }

  const numeric = /(?<![\d/.:-])(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2,4}))?(?![\d/:-]|\.\d)/g;
  for (const m of s.matchAll(numeric)) {
    const [first, second] = [Number(m[1]), Number(m[3])];
    // "11.59 pm" and "3-4 students" are not dates: dots and dashes need a year.
    if (m[2] !== "/" && !m[4]) continue;
    if (/^\s*[ap]\.?m/.test(s.slice(m.index + m[0].length))) continue;
    const dayFirst = !(first <= 12 && second > 12);
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    const date = { y: m[4] ? fullYear(m[4]) : inferYear(month, day, today), m: month, d: day };
    const ambiguous = first <= 12 && second <= 12 && first !== second;
    add(m, date, ambiguous ? `"${m[0]}" was read as day/month (${describe(date)}).` : undefined);
  }

  // "25 tarikh" gives a day of the month but no month.
  const dayOnly = new RegExp(String.raw`(?<![\d:./-])(\d{1,2})\s*(?:tarikh|tarik|তারিখ)${NOT_AFTER}`, "g");
  for (const m of s.matchAll(dayOnly)) {
    const day = Number(m[1]);
    let date = { y: today.y, m: today.m, d: day };
    if (compareYMD(date, today) < 0) {
      date = today.m === 12 ? { y: today.y + 1, m: 1, d: day } : { y: today.y, m: today.m + 1, d: day };
    }
    add(m, date, `"${m[0]}" has no month, so it was read as ${describe(date)}.`);
  }

  return found.sort((a, b) => a.start - b.start);
}

function findRelativeDates(s: string, today: YMD, taken: Span[]): DateCandidate[] {
  const found: DateCandidate[] = [];
  const consumed: Span[] = [...taken];
  const scan = (
    pattern: RegExp,
    resolve: (m: RegExpExecArray) => { date: YMD; note?: string } | null,
  ) => {
    for (const m of s.matchAll(pattern)) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (consumed.some((other) => overlaps(other, span))) continue;
      consumed.push(span);
      const result = resolve(m);
      if (result) found.push({ ...span, ...result, kind: "relative" });
    }
  };
  const offset = (days: number, note?: (text: string, date: YMD) => string) => (m: RegExpExecArray) => {
    const date = addDays(today, days);
    return { date, note: note?.(m[0].trim(), date) };
  };

  scan(/(?<![a-z])day after tomorrow(?![a-z])/g, offset(2));
  scan(
    new RegExp(String.raw`(?<![a-z])(?:porshu(?:din)?|porsu)(?![a-z])|(?<![${BANGLA}])পরশু(?:দিন)?(?![${BANGLA}])`, "g"),
    offset(2, (text, date) => `"${text}" was read as the day after tomorrow (${describe(date)}).`),
  );
  scan(
    /(?<![a-z])(?:tomorrow|tmrw|tmr|tomorow|2morrow|agami\s*kal(?:ke)?)(?![a-z])|আগামী\s*কাল(?:কে)?/g,
    offset(1),
  );
  // Past references are never deadlines; consuming them stops "kal" matching inside them.
  scan(/(?<![a-z])(?:yesterday|goto\s*kal(?:ke)?)(?![a-z])|গত\s*কাল(?:কে)?/g, () => null);
  scan(
    new RegExp(String.raw`(?<![a-z])(?:kalke|kaalke|kalk|kaal|kal)(?![a-z])|(?<![${BANGLA}])কাল(?:কে)?(?![${BANGLA}])`, "g"),
    offset(
      1,
      (text, date) =>
        `"${text}" can mean tomorrow or yesterday. It was read as tomorrow (${describe(date)}).`,
    ),
  );
  scan(
    new RegExp(String.raw`(?<![a-z])(?:today|tonight|tonite|ajker|ajke|ajk|aaj|aj)(?![a-z])|(?<![${BANGLA}])আজ(?:কের|কে)?(?![${BANGLA}])`, "g"),
    offset(0),
  );
  scan(
    /(?<![a-z])in\s+(\d{1,2})\s+days?(?![a-z])|(?<!\d)(\d{1,2})\s+(?:days?\s+(?:later|from now)|din\s+por[ae]?)(?![a-z])/g,
    (m) => ({ date: addDays(today, Number(m[1] ?? m[2])) }),
  );
  scan(
    /(?<![a-z])(?:next week|agami\s+sh?optah[ae]?)(?![a-z])|আগামী\s*সপ্তাহে?/g,
    offset(7, (text, date) => `"${text}" has no exact day. It was read as ${describe(date)}.`),
  );
  scan(
    new RegExp(String.raw`${NOT_BEFORE}(?:(next|this|coming|agami)\s+)?(${WEEKDAY_ALT})${NOT_AFTER}`, "g"),
    (m) => {
      const target = WEEKDAY_LOOKUP.get(m[2])!;
      let diff = (target - weekdayOf(today) + 7) % 7;
      if (diff === 0 && m[1] !== "this") diff = 7;
      const date = addDays(today, diff);
      return {
        date,
        note: m[1] === "next" ? `"${m[0]}" was read as ${describe(date)}.` : undefined,
      };
    },
  );

  return found.sort((a, b) => a.start - b.start);
}

const PART_OF_DAY: { pattern: RegExp; period: "am" | "pm" | "night" }[] = [
  { pattern: /(?<![a-z])(?:sokal|shokal|sokale|morning)(?![a-z])|সকাল/, period: "am" },
  { pattern: /(?<![a-z])(?:dupur|dupure|bikal|bikel|bikale|afternoon|sondha|shondha|evening)(?![a-z])|দুপুর|বিকাল|বিকেল|সন্ধ্যা/, period: "pm" },
  { pattern: /(?<![a-z])(?:rat|raat|rate|raate|night)(?![a-z])|(?<![\u0980-\u09FF])রাত/, period: "night" },
];

function applyPeriod(hour: number, minute: number, period: "am" | "pm" | "night"): HM | null {
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (period === "am") return { h: hour % 12, min: minute };
  if (period === "night" && hour === 12) return { h: 23, min: 59 };
  // "dupur 12 ta" is noon; other afternoon/evening/night hours are PM.
  return { h: (hour % 12) + 12, min: minute };
}

function findTimes(s: string, dateSpans: Span[]): TimeCandidate[] {
  const found: TimeCandidate[] = [];
  const add = (m: RegExpExecArray, time: HM | null, note?: string) => {
    const span = { start: m.index, end: m.index + m[0].length };
    if ([...dateSpans, ...found].some((other) => overlaps(other, span))) return;
    found.push({ ...span, time, note });
  };
  const period = PART_OF_DAY.find((entry) => entry.pattern.test(s))?.period;

  for (const m of s.matchAll(/(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/g)) {
    const time = applyPeriod(Number(m[1]), Number(m[2] ?? 0), m[3].startsWith("a") ? "am" : "pm");
    if (time) add(m, time);
  }

  for (const m of s.matchAll(/(?<![\d:./-])(\d{1,2}):(\d{2})(?![\d:])/g)) {
    const [hour, minute] = [Number(m[1]), Number(m[2])];
    if (hour > 23 || minute > 59) continue;
    if (hour >= 13 || hour === 0) add(m, { h: hour, min: minute });
    else if (period) add(m, applyPeriod(hour, minute, period));
    else {
      add(
        m,
        { h: hour, min: minute },
        `"${m[0]}" has no AM/PM. It was read as ${hour}:${m[2]} ${hour === 12 ? "PM" : "AM"}.`,
      );
    }
  }

  const banglish = new RegExp(String.raw`(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(?:tay|tar|ta|টায়|টার|টা)${NOT_AFTER}`, "g");
  for (const m of s.matchAll(banglish)) {
    const [hour, minute] = [Number(m[1]), Number(m[2] ?? 0)];
    if (period) add(m, applyPeriod(hour, minute, period));
    else add(m, null, `"${m[0]}" does not say morning or evening, so the time was left empty.`);
  }

  for (const m of s.matchAll(/(?<![a-z])noon(?![a-z])/g)) add(m, { h: 12, min: 0 });
  for (const m of s.matchAll(/(?<![a-z])(?:midnight|end of (?:the )?day|eod)(?![a-z])/g)) {
    add(m, { h: 23, min: 59 });
  }

  for (const m of s.matchAll(/(?<![a-z])at\s+(\d{1,2})(?![\d:.\/-])/g)) {
    add(m, null, `"${m[0]}" has no AM/PM, so the time was left empty.`);
  }

  return found.sort((a, b) => a.start - b.start);
}

function pickDate(s: string, candidates: DateCandidate[]): DateCandidate {
  // A cue just before a date ("submit by tomorrow") is stronger than one after it.
  const before = (c: DateCandidate) => DEADLINE_CUE.test(s.slice(Math.max(0, c.start - 30), c.start));
  const after = (c: DateCandidate) => DEADLINE_CUE.test(s.slice(c.end, c.end + 20));
  return candidates.find(before) ?? candidates.find(after) ?? candidates[0];
}

export function parseDeadline(normalizedText: string, now: Date = new Date()): ParsedDeadline {
  const s = normalizedText.toLowerCase();
  const today = dhakaToday(now);
  const notes: string[] = [];
  let uncertain = false;

  const absolute = findAbsoluteDates(s, today);
  const relative = findRelativeDates(s, today, absolute);
  const pool = [...absolute, ...relative];
  const dateSpans: Span[] = [...absolute, ...relative];

  let date: YMD | null = null;
  if (pool.length > 0) {
    const chosen = pickDate(s, pool);
    date = chosen.date;
    if (chosen.note) {
      notes.push(chosen.note);
      uncertain = true;
    }
    const distinct = new Set(pool.map((candidate) => compareYMD(candidate.date, { y: 1970, m: 1, d: 1 })));
    if (distinct.size > 1) {
      notes.push(`Several dates were found. ${describe(date)} was used.`);
      uncertain = true;
    }
  }

  const times = findTimes(s, dateSpans);
  const timed = times.find((candidate) => candidate.time) ?? null;
  let time: HM | null = timed?.time ?? null;
  const distinctTimes = new Set(times.filter((c) => c.time).map((c) => `${c.time!.h}:${c.time!.min}`));
  if (distinctTimes.size > 1) {
    notes.push("Several times were found. Check that the right one was used.");
    uncertain = true;
  }
  for (const candidate of timed ? [timed] : times) {
    if (candidate.note) {
      notes.push(candidate.note);
      uncertain = true;
    }
  }

  if (!date && time) {
    notes.push("A time was found but no date, so the deadline was left empty.");
    uncertain = true;
    time = null;
  }

  if (date && compareYMD(date, today) < 0) {
    notes.push(`${describe(date)} is already in the past. Check the date.`);
    uncertain = true;
  }

  return { date, time, notes, uncertain, spans: [...dateSpans, ...times] };
}
