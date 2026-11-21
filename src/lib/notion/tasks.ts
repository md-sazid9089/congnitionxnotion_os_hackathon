import { isFullPage, type CreatePageParameters, type PageObjectResponse } from "@notionhq/client";
import { AppError } from "../errors";
import type { Destination, SaveTaskInput, SaveTaskResult, TaskItem } from "../types";
import { isValidationError, notionClient, toAppError } from "./client";
import { listCoursePages, squash, toDhakaDue, toTaskItem, type CourseIndex, type CoursePage } from "./read";
import { findSource, requireSource, type MappedProperty, type ResolvedSource } from "./schema";

type Properties = NonNullable<CreatePageParameters["properties"]>;
type Children = NonNullable<CreatePageParameters["children"]>;

const NOT_STARTED = /^(not started|to-?do|todo|pending|backlog|open|new|upcoming)$/i;

function richText(content: string) {
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < content.length; i += 2000) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + 2000) } });
  }
  return chunks;
}

function optionNames(mapped: MappedProperty): string[] {
  const config = mapped.config;
  if (config.type === "select") return config.select.options.map((o) => o.name);
  if (config.type === "multi_select") return config.multi_select.options.map((o) => o.name);
  if (config.type === "status") return config.status.options.map((o) => o.name);
  return [];
}

/** An existing option with the same name (ignoring case), so saves reuse the workspace's own labels. */
function existingOption(mapped: MappedProperty, wanted: string): string | null {
  return optionNames(mapped).find((name) => name.toLowerCase() === wanted.toLowerCase()) ?? null;
}

export function matchCourse(input: string, pages: CoursePage[]): CoursePage | null {
  const wanted = squash(input);
  if (!wanted) return null;
  const exact = pages.find((p) => squash(p.title) === wanted);
  if (exact) return exact;
  const code = input.match(/([A-Za-z]{2,4})[\s-]?(\d{3,4})/);
  if (code) {
    const pattern = new RegExp(`${squash(code[0])}(?![0-9])`);
    const byCode = pages.find((p) => pattern.test(p.haystack));
    if (byCode) return byCode;
  }
  return (
    pages.find((p) => {
      const title = squash(p.title);
      return title.length >= 4 && (wanted.includes(title) || (wanted.length >= 4 && title.includes(wanted)));
    }) ?? null
  );
}

function relationTarget(mapped: MappedProperty | null): string | null {
  return mapped?.config.type === "relation" ? mapped.config.relation.data_source_id : null;
}

async function courseIndex(source: ResolvedSource): Promise<CourseIndex> {
  const target = relationTarget(source.map.course);
  if (!target) return new Map();
  try {
    return new Map((await listCoursePages(target)).map((p) => [p.id, p.title]));
  } catch {
    // The courses database may not be shared; tasks are still worth showing without course names.
    return new Map();
  }
}

async function listFrom(database: Destination): Promise<TaskItem[]> {
  const source = await findSource(database);
  if (!source) return [];
  const due = source.map.dueDate;
  try {
    const [response, courses] = await Promise.all([
      notionClient().dataSources.query({
        data_source_id: source.dataSourceId,
        page_size: 100,
        sorts: due
          ? [{ property: due.name, direction: "ascending" }]
          : [{ timestamp: "created_time", direction: "descending" }],
      }),
      courseIndex(source),
    ]);
    return response.results
      .filter((r): r is PageObjectResponse => r.object === "page" && isFullPage(r) && !r.in_trash)
      .map((page) => toTaskItem(page, source, database, courses));
  } catch (error) {
    throw toAppError(error, `read the ${database} database`);
  }
}

/** Tasks from both databases, soonest deadline first; items without a deadline come last. */
export async function listTasks(): Promise<TaskItem[]> {
  const results = await Promise.allSettled([listFrom("assignments"), listFrom("tasks")]);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length === results.length) throw failed[0].reason;
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).sort((a, b) => {
    if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : 0;
    return a.dueDate.slice(0, 10).localeCompare(b.dueDate.slice(0, 10)) || a.dueDate.localeCompare(b.dueDate);
  });
}

async function findDuplicate(source: ResolvedSource, input: SaveTaskInput): Promise<PageObjectResponse | null> {
  const title = source.map.title;
  if (!title) return null;
  const response = await notionClient().dataSources.query({
    data_source_id: source.dataSourceId,
    page_size: 100,
    filter: { property: title.name, title: { equals: input.title } },
  });
  const due = source.map.dueDate;
  return (
    response.results
      .filter((r): r is PageObjectResponse => r.object === "page" && isFullPage(r) && !r.in_trash)
      .find((page) => {
        const value = due ? page.properties[due.name] : undefined;
        const existing = value?.type === "date" ? (value.date ? toDhakaDue(value.date.start).slice(0, 10) : null) : null;
        return existing === (input.dueDate?.slice(0, 10) ?? null);
      }) ?? null
  );
}

interface Draft {
  properties: Properties;
  essentials: Properties;
  children: Children;
  fallbackChildren: Children;
  warnings: string[];
}

async function buildDraft(source: ResolvedSource, input: SaveTaskInput): Promise<Draft> {
  const { map } = source;
  const properties: Properties = {};
  const essentials: Properties = {};
  const warnings: string[] = [];
  const bodyNotes: string[] = [];

  if (!map.title) {
    throw new AppError("notion_schema", `The ${source.title} database has no title property.`, 500);
  }
  properties[map.title.name] = essentials[map.title.name] = { title: richText(input.title) };

  if (input.dueDate) {
    if (map.dueDate) {
      properties[map.dueDate.name] = essentials[map.dueDate.name] = { date: { start: input.dueDate } };
    } else {
      warnings.push(`"${source.title}" has no date property, so the deadline was written in the page body.`);
      bodyNotes.push(`Deadline: ${input.dueDate}`);
    }
  }

  const status = map.status;
  if (status?.type === "checkbox") {
    properties[status.name] = { checkbox: false };
  } else if (status?.type === "status") {
    const option = optionNames(status).find((name) => NOT_STARTED.test(name));
    // Status options cannot be created through the API; without a match Notion applies its default.
    if (option) properties[status.name] = { status: { name: option } };
  } else if (status?.type === "select") {
    const option = optionNames(status).find((name) => NOT_STARTED.test(name)) ?? "Not Started";
    properties[status.name] = { select: { name: option } };
  }

  const category = map.category;
  if (category?.type === "select") {
    properties[category.name] = { select: { name: existingOption(category, input.category) ?? input.category } };
  } else if (category?.type === "multi_select") {
    properties[category.name] = {
      multi_select: [{ name: existingOption(category, input.category) ?? input.category }],
    };
  } else {
    bodyNotes.push(`Category: ${input.category}`);
  }

  if (input.course) {
    const course = map.course;
    const target = relationTarget(course);
    if (course && target) {
      let match: CoursePage | null = null;
      try {
        match =
          matchCourse(input.course, await listCoursePages(target)) ??
          matchCourse(input.course, await listCoursePages(target, true));
      } catch {
        warnings.push("The Courses database is not shared with the integration, so the course was not linked.");
      }
      if (match) {
        properties[course.name] = { relation: [{ id: match.id }] };
      } else {
        if (!warnings.length || !warnings[warnings.length - 1].startsWith("The Courses database")) {
          warnings.push(`No course matching "${input.course}" was found in Notion, so the course was not linked.`);
        }
        bodyNotes.push(`Course: ${input.course}`);
      }
    } else if (course?.type === "select") {
      properties[course.name] = { select: { name: existingOption(course, input.course) ?? input.course } };
    } else if (course?.type === "multi_select") {
      properties[course.name] = { multi_select: [{ name: existingOption(course, input.course) ?? input.course }] };
    } else if (course?.type === "rich_text") {
      properties[course.name] = { rich_text: richText(input.course) };
    } else {
      bodyNotes.push(`Course: ${input.course}`);
    }
  }

  if (input.description && map.description) {
    properties[map.description.name] = { rich_text: richText(input.description) };
  }
  if (input.source && map.source) {
    properties[map.source.name] = { rich_text: richText(input.source.slice(0, 2000)) };
  }

  const paragraph = (content: string) => ({ paragraph: { rich_text: richText(content) } });
  const footer: Children = [];
  if (input.source) {
    footer.push({ heading_3: { rich_text: richText("Original announcement") } });
    footer.push({ quote: { rich_text: richText(input.source) } });
  }
  footer.push({
    paragraph: {
      rich_text: [{ type: "text", text: { content: "Captured with CampusCatch" }, annotations: { italic: true, color: "gray" } }],
    },
  });
  const children: Children = [];
  if (input.description && !map.description) children.push(paragraph(input.description));
  for (const note of bodyNotes) children.push(paragraph(note));
  children.push(...footer);

  // Used when Notion rejects a property: every reviewed detail goes in the page body instead.
  const allNotes = new Set([`Category: ${input.category}`, ...(input.course ? [`Course: ${input.course}`] : []), ...bodyNotes]);
  const fallbackChildren: Children = [
    ...(input.description ? [paragraph(input.description)] : []),
    ...[...allNotes].map(paragraph),
    ...footer,
  ];

  return { properties, essentials, children, fallbackChildren, warnings };
}

/** Creates a real page in the chosen Notion database. Resolves only after Notion confirms the page. */
export async function createTask(input: SaveTaskInput): Promise<SaveTaskResult> {
  const source = await requireSource(input.destination);
  const notion = notionClient();
  try {
    if (!input.force) {
      const duplicate = await findDuplicate(source, input);
      if (duplicate) {
        throw new AppError(
          "duplicate_task",
          `"${input.title}" with the same deadline is already in ${source.title}.`,
          409,
          "Save again to add it anyway.",
          { url: duplicate.url },
        );
      }
    }

    const draft = await buildDraft(source, input);
    const parent = { type: "data_source_id" as const, data_source_id: source.dataSourceId };
    let page;
    try {
      page = await notion.pages.create({ parent, properties: draft.properties, children: draft.children });
    } catch (error) {
      if (!isValidationError(error)) throw error;
      // A property did not accept its value: keep the save alive with the title and deadline only.
      page = await notion.pages.create({ parent, properties: draft.essentials, children: draft.fallbackChildren });
      draft.warnings.push(
        `Notion rejected a property, so only the title and deadline were set as properties and the other details were written in the page body: ${error.message}`,
      );
    }
    if (!isFullPage(page)) {
      throw new AppError("notion_error", "Notion created the page but did not return its details.", 502);
    }
    const item = toTaskItem(page, source, input.destination, await courseIndex(source));
    return { page: { id: page.id, url: page.url }, item, warnings: draft.warnings };
  } catch (error) {
    throw toAppError(error, `save to the ${input.destination} database`);
  }
}
