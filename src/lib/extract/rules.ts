import { buildDue } from "../dates";
import { defaultDestination, type Category, type ExtractionResult } from "../types";
import { normalizeText, parseDeadline, type Span } from "./dateParser";

interface CategoryRule {
  category: Category;
  pattern: RegExp;
  /** Weak rules only count when nothing stronger matched. */
  weak?: boolean;
  label?: (match: string) => string;
}

const titleCase = (text: string) =>
  text.replace(/\s+/g, " ").trim().replace(/(^|\s)([a-z])/g, (_, gap, ch) => gap + ch.toUpperCase());

// Order is priority: the first strong rule that matches wins.
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Lab",
    pattern: /(?<![a-z])lab\s*(?:reports?|tests?|finals?|exams?|quiz|assignments?|tasks?|viva|performance|evaluation)(?![a-z])|ল্যাব\s*(?:রিপোর্ট|টেস্ট)/,
    label: titleCase,
  },
  { category: "Quiz", pattern: /(?<![a-z])(?:quiz(?:zes)?|class\s*tests?|ct)(?![a-z])|কুইজ|ক্লাস\s*টেস্ট/ },
  {
    category: "Examination",
    pattern: /(?<![a-z])(?:exam(?:ination)?s?|mid[\s-]?terms?|semester finals?|final exam|viva|porikkha|porikha)(?![a-z])|পরীক্ষা|ভাইভা/,
    label: (match) => (/mid/.test(match) ? "Midterm Exam" : /viva|ভাইভা/.test(match) ? "Viva" : "Exam"),
  },
  { category: "Project", pattern: /(?<![a-z])(?:projects?|thesis|capstone)(?![a-z])|প্রজেক্ট/ },
  {
    category: "Assignment",
    pattern: /(?<![a-z])(?:assignments?|home\s?work|hw|problem set|worksheet|term paper)(?![a-z])|অ্যাসাইনমেন্ট|এসাইনমেন্ট|এ্যাসাইনমেন্ট/,
  },
  { category: "Lab", pattern: /(?<![a-z])(?:lab|sessional)(?![a-z])|ল্যাব/ },
  {
    category: "Meeting",
    pattern: /(?<![a-z])(?:meetings?|meet[\s-]?up|seminar|workshop|orientation|webinar)(?![a-z])|মিটিং|সভা/,
  },
  {
    category: "Reminder",
    pattern: /(?<![a-z])(?:remember|reminder|don'?t forget|do not forget|mone rakh\w*|mone kore)(?![a-z])|মনে রাখ/,
  },
  {
    category: "Assignment",
    weak: true,
    pattern: /(?<![a-z])(?:submit|submission|reports?|joma)(?![a-z])|জমা/,
  },
];

const ACTION_VERB =
  /(?<![a-z])(?:renew|pay|register|enrol+|complete|bring|attend|prepare|buy|send|finish|discuss|collect|apply|fill|upload|study|join|call|email|return|book|print|review|practice|contact|submit|download|install|confirm|sign|pick up|deposit|schedule|organi[sz]e|arrange|write|revise|read|korte hobe|dite hobe|ante hobe|jete hobe|ashte hobe|nite hobe|joma dao|joma dite)(?![a-z])|করতে হবে|দিতে হবে|আনতে হবে|যেতে হবে/;

const DEADLINE_WORD = /(?<![a-z])(?:by|due|deadline|before|until|till|last date|moddhe|modhe)(?![a-z])|মধ্যে/;

const COURSE_CODE = /(?<![A-Za-z0-9])([A-Za-z]{2,4})[\s-]?(\d{3,4})(?![A-Za-z0-9])/g;
const NOT_A_DEPARTMENT = new Set([
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "am", "pm", "by", "at", "on", "in", "to", "of", "is", "the", "and", "for", "room", "hall", "lab",
  "week", "slot", "sec", "day", "due", "till", "from", "date", "year", "time", "bus", "gate",
  "page", "no", "id", "roll", "sem", "term", "mark", "top", "max", "min", "tk", "bdt", "usd",
  "only", "over", "quiz", "exam", "fee", "fees", "pay", "call", "flat", "road", "ext", "rs",
]);

const NAME_STOP_WORDS = new Set([
  "is", "are", "was", "will", "must", "should", "has", "have", "had", "er", "ar", "amader",
  "tomader", "ase", "ache", "hobe", "a", "an", "the", "our", "your", "my", "next", "this", "new",
  "class", "course", "today", "tomorrow", "kal", "kalke", "ajke", "aj", "on", "at", "by", "for",
]);

const GREETING =
  /^(?:(?:hey|hi|hello|dear|attention|notice|update|fyi|guys|everyone|everybody|all|students|friends|class|vai|bhai|bro|apu|please note|reminder|assalamu alaikum|salam)\b[\s,!:.\-]*)+/i;
const LEAD_IN =
  /^(?:(?:please|pls|plz|kindly|remember to|remember that|remember|don'?t forget to|do not forget to|you (?:need|have) to|we (?:need|have) to|i (?:need|have) to|need to|have to|make sure to|make sure you|just a reminder to)\b[\s,:]*)+/i;
const TRAILING =
  /(?:[\s,;:\-–]+(?:is|are|by|on|at|due|before|until|till|the|deadline|will be|will|be|within|in|to|ase|ache|hobe|and|for|from|submission deadline))+$/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+(?=[A-Z\u0980-\u09FF"'(])|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function removeSpans(text: string, spans: Span[], offset: number): string {
  const local = spans
    .map((span) => ({ start: span.start - offset, end: span.end - offset }))
    .filter((span) => span.end > 0 && span.start < text.length)
    .sort((a, b) => b.start - a.start);
  let out = text;
  for (const span of local) {
    const before = out
      .slice(0, Math.max(0, span.start))
      .replace(/(?:\b(?:by|on|at|before|until|till|due|due on|within|from)\s*)+$/i, "");
    out = `${before} ${out.slice(Math.min(out.length, span.end))}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

function cleanSentence(sentence: string): string {
  let out = sentence.replace(/[.!?।\s]+$/, "");
  for (let pass = 0; pass < 3; pass += 1) {
    out = out.replace(GREETING, "").replace(LEAD_IN, "").replace(TRAILING, "").trim();
  }
  out = out.replace(/^[,;:\-–\s]+|[,;:\-–\s]+$/g, "");
  if (out.length > 90) out = `${out.slice(0, 87).trimEnd()}...`;
  return out ? out[0].toUpperCase() + out.slice(1) : "";
}

function findCourse(text: string): { code: string; end: number } | null {
  const matches = [...text.matchAll(COURSE_CODE)].filter(
    (m) => !NOT_A_DEPARTMENT.has(m[1].toLowerCase()),
  );
  // Codes are normally written in capitals, so an upper-case match is the safer pick.
  const match = matches.find((m) => m[1] === m[1].toUpperCase()) ?? matches[0];
  if (!match) return null;
  return { code: `${match[1].toUpperCase()} ${match[2]}`, end: match.index + match[0].length };
}

function courseNameBetween(text: string): string {
  const words = text.replace(/[():\-–,]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return "";
  const plain = words.every((word) => /^[A-Za-z&]+$/.test(word));
  const stopped = words.some((word) => NAME_STOP_WORDS.has(word.toLowerCase()));
  return plain && !stopped ? words.join(" ") : "";
}

export function extractWithRules(rawText: string, now: Date = new Date()): ExtractionResult {
  const text = normalizeText(rawText).trim();
  const lower = text.toLowerCase();
  const deadline = parseDeadline(text, now);

  const matches = CATEGORY_RULES.map((rule) => ({ rule, match: rule.pattern.exec(lower) })).filter(
    (entry): entry is { rule: CategoryRule; match: RegExpExecArray } => entry.match !== null,
  );
  const strong = matches.find((entry) => !entry.rule.weak);
  const course = findCourse(text);
  const weak = matches.find((entry) => entry.rule.weak);
  const hit = strong ?? (course ? weak : undefined);

  const isQuestion = /\?\s*$/.test(text);
  const hasAction = ACTION_VERB.test(lower) && !isQuestion;
  const hasDeadline = DEADLINE_WORD.test(lower) && deadline.date !== null;
  if (!hit && !hasAction && !hasDeadline) {
    return {
      actionable: false,
      task: null,
      engine: "rules",
      reason:
        "No actionable item was detected. The message does not mention a task, a deadline, or an academic event.",
    };
  }

  const category: Category = hit?.rule.category ?? "General Task";
  const sentences = splitSentences(text);
  const compactCode = course?.code.toLowerCase().replace(" ", "");
  const informative = (sentence: string) => {
    const s = sentence.toLowerCase();
    if (hit?.rule.pattern.test(s) || ACTION_VERB.test(s)) return true;
    return compactCode ? s.replace(/[\s-]/g, "").includes(compactCode) : false;
  };
  const primary = sentences.find(informative) ?? sentences[0] ?? text;
  const primaryStart = text.indexOf(primary);

  let label: string = category === "Examination" ? "Exam" : category;
  if (hit?.rule.label) label = hit.rule.label(hit.match[0]);
  if (hit) {
    // "Quiz 2" keeps its number, unless that number is really part of a date or time.
    const start = hit.match.index + hit.match[0].length;
    const after = lower.slice(start);
    const numbered = /^\s*#?\s*(\d{1,2})(?![\d:./-])/.exec(after);
    if (numbered) {
      const span = { start, end: start + numbered[0].length };
      const partOfDate = deadline.spans.some((other) => other.start < span.end && span.start < other.end);
      const hasUnit = /^\s*(?:ta|tay|tarikh|am|pm|st|nd|rd|th)(?![a-z])/.test(after.slice(numbered[0].length));
      if (!partOfDate && !hasUnit) label = `${label} ${numbered[1]}`;
    }
  }

  let title = "";
  const academic = defaultDestination(category) === "assignments";
  if (academic && course && hit && hit.match.index >= course.end) {
    const name = courseNameBetween(text.slice(course.end, hit.match.index));
    title = `${name || course.code} ${label}`;
  } else if (academic && course) {
    title = `${course.code} ${label}`;
  } else {
    title = cleanSentence(removeSpans(primary, deadline.spans, primaryStart));
    if (title.split(/\s+/).length < 2 && hit) title = label;
  }

  const description = sentences
    .filter((sentence) => sentence !== primary)
    .filter((sentence) => sentence.replace(GREETING, "").replace(/[.!?।\s]/g, "").length > 0)
    .join(" ");

  const reviewNotes = [...deadline.notes];
  if (!deadline.date) {
    reviewNotes.unshift("No deadline was found in the message. Add one or confirm it has none.");
  }
  if (!title) reviewNotes.push("No clear title was found. Add one before saving.");

  return {
    actionable: true,
    engine: "rules",
    task: {
      title,
      course: course?.code ?? "",
      category,
      dueDate: deadline.date ? buildDue(deadline.date, deadline.time) : null,
      description,
      status: "Not Started",
      needsReview: deadline.uncertain || !deadline.date || !title,
      reviewNotes,
      destination: defaultDestination(category),
      source: rawText.trim(),
    },
  };
}
