// Creates Courses, Assignments and Tasks databases under a Notion page that is
// shared with the integration, for workspaces that do not have them yet.
// Usage: npm run notion:setup -- <parent page URL or ID>
import { Client } from "@notionhq/client";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const parentArg = process.argv[2];
if (!token || !parentArg) {
  console.error("Set NOTION_TOKEN in .env.local and pass the parent page URL or ID.");
  process.exit(1);
}
const match = parentArg.replace(/-/g, "").match(/[0-9a-f]{32}/i);
if (!match) {
  console.error("Could not find a Notion page ID in:", parentArg);
  process.exit(1);
}

const PAGE_TITLE = "CampusCatch Student OS";
const notion = new Client({ auth: token, logLevel: "error" });
const text = (content) => [{ type: "text", text: { content } }];
const options = (names) => ({ select: { options: names.map((name) => ({ name })) } });

try {
  const children = await notion.blocks.children.list({ block_id: match[0], page_size: 100 });
  const existing = children.results.find(
    (b) => b.type === "child_page" && b.child_page.title === PAGE_TITLE,
  );
  if (existing) {
    console.error(`"${PAGE_TITLE}" already exists under this page (${existing.id}). Nothing created.`);
    process.exit(1);
  }

  const page = await notion.pages.create({
    parent: { type: "page_id", page_id: match[0] },
    properties: { title: { title: text(PAGE_TITLE) } },
  });

  const create = async (title, properties) => {
    const db = await notion.databases.create({
      parent: { type: "page_id", page_id: page.id },
      title: text(title),
      is_inline: true,
      initial_data_source: { properties },
    });
    return { databaseId: db.id, dataSourceId: db.data_sources[0].id };
  };

  const courses = await create("Courses", {
    Name: { title: {} },
    Code: { rich_text: {} },
    Instructor: { rich_text: {} },
    Semester: { rich_text: {} },
  });
  const shared = {
    Name: { title: {} },
    "Due Date": { date: {} },
    Status: { status: {} },
    Course: { relation: { data_source_id: courses.dataSourceId, single_property: {} } },
    Description: { rich_text: {} },
    Source: { rich_text: {} },
  };
  const assignments = await create("Assignments", {
    ...shared,
    Type: options(["Assignment", "Quiz", "Examination", "Lab", "Project"]),
  });
  const tasks = await create("Tasks", {
    ...shared,
    Category: options(["Meeting", "General Task", "Reminder"]),
  });

  console.log(`Created "${PAGE_TITLE}": ${page.url}`);
  console.log("\nAdd these to .env.local:");
  console.log(`NOTION_COURSES_DB_ID=${courses.databaseId}`);
  console.log(`NOTION_ASSIGNMENTS_DB_ID=${assignments.databaseId}`);
  console.log(`NOTION_TASKS_DB_ID=${tasks.databaseId}`);
} catch (error) {
  console.error("Notion setup failed:", error.code ?? "", error.message ?? error);
  process.exit(1);
}
