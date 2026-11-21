import { isFullPage, type PageObjectResponse } from "@notionhq/client";
import { TZ_OFFSET } from "../dates";
import type { Destination, TaskItem } from "../types";
import { notionClient } from "./client";
import type { MappedProperty, ResolvedSource } from "./schema";

type PageProperty = PageObjectResponse["properties"][string];

const DONE_NAMES = /^(done|completed?|finished|submitted|closed|archived)$/i;
const pad = (n: number) => String(n).padStart(2, "0");

/** Notion date values as Dhaka deadlines: date-only stays as is, datetimes are shifted to +06:00. */
export function toDhakaDue(start: string): string {
  if (start.length <= 10) return start;
  const instant = new Date(start);
  if (Number.isNaN(instant.getTime())) return start.slice(0, 10);
  const t = new Date(instant.getTime() + 6 * 60 * 60 * 1000);
  const day = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return `${day}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00${TZ_OFFSET}`;
}

export function plainText(property: PageProperty | undefined): string {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return property.title.map((t) => t.plain_text).join("").trim();
    case "rich_text":
      return property.rich_text.map((t) => t.plain_text).join("").trim();
    case "select":
      return property.select?.name ?? "";
    case "status":
      return property.status?.name ?? "";
    case "multi_select":
      return property.multi_select.map((o) => o.name).join(", ");
    default:
      return "";
  }
}

export function pageTitle(page: PageObjectResponse): string {
  const title = Object.values(page.properties).find((p) => p.type === "title");
  return plainText(title) || "Untitled";
}

function isCompleted(property: PageProperty | undefined, mapped: MappedProperty | null): boolean {
  if (!property || !mapped) return false;
  if (property.type === "checkbox") return property.checkbox;
  if (property.type === "select") return DONE_NAMES.test(property.select?.name ?? "");
  if (property.type === "status" && property.status) {
    const config = mapped.config;
    if (config.type === "status") {
      const group = config.status.groups.find((g) => g.option_ids.includes(property.status!.id));
      if (group) return /complete|done/i.test(group.name);
    }
    return DONE_NAMES.test(property.status.name);
  }
  return false;
}

function statusLabel(property: PageProperty | undefined): string | null {
  if (!property) return null;
  if (property.type === "checkbox") return property.checkbox ? "Done" : "Not done";
  return plainText(property) || null;
}

/** Titles of related course pages, keyed by page ID. */
export type CourseIndex = Map<string, string>;

export function toTaskItem(
  page: PageObjectResponse,
  source: ResolvedSource,
  database: Destination,
  courses: CourseIndex,
): TaskItem {
  const prop = (mapped: MappedProperty | null) => (mapped ? page.properties[mapped.name] : undefined);
  const due = prop(source.map.dueDate);
  const course = prop(source.map.course);

  let courseName: string | null = null;
  if (course?.type === "relation") {
    const names = course.relation.map((r) => courses.get(r.id.replace(/-/g, ""))).filter(Boolean);
    courseName = names.length ? names.join(", ") : null;
  } else {
    courseName = plainText(course) || null;
  }

  const status = prop(source.map.status);
  return {
    id: page.id,
    url: page.url,
    title: plainText(prop(source.map.title)) || "Untitled",
    course: courseName,
    category: plainText(prop(source.map.category)) || null,
    dueDate: due?.type === "date" && due.date ? toDhakaDue(due.date.start) : null,
    status: statusLabel(status),
    completed: isCompleted(status, source.map.status),
    database,
  };
}

export interface CoursePage {
  id: string;
  title: string;
  /** Title plus every text property, lower-cased with punctuation removed, for matching course codes. */
  haystack: string;
}

export const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "");

const TTL_MS = 60_000;
const courseCache = new Map<string, { at: number; pages: CoursePage[] }>();

export function clearCourseCache(): void {
  courseCache.clear();
}

/** Pages of a courses data source (first 100), used to show and to link course relations. */
export async function listCoursePages(dataSourceId: string, fresh = false): Promise<CoursePage[]> {
  const hit = courseCache.get(dataSourceId);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.pages;
  const response = await notionClient().dataSources.query({ data_source_id: dataSourceId, page_size: 100 });
  const pages = response.results
    .filter((r): r is PageObjectResponse => r.object === "page" && isFullPage(r))
    .map((page) => ({
      id: page.id.replace(/-/g, ""),
      title: pageTitle(page),
      haystack: squash(Object.values(page.properties).map(plainText).join(" ")),
    }));
  courseCache.set(dataSourceId, { at: Date.now(), pages });
  return pages;
}
