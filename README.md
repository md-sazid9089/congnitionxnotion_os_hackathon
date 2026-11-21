# CampusCatch

CampusCatch turns pasted class announcements into confirmed tasks in a Notion Student OS workspace.

Built for the Cognition × Notion Student OS hackathon.

## The student problem

Deadlines reach students as chat messages, emails and notices, often in mixed English, Bangla and Banglish. Copying each one into Notion by hand is slow, so many never get there and are missed.

## What it does

Paste announcement → extract → review and edit → save to Notion → see upcoming tasks.

- **Extraction**: title, course code, category, deadline and description from one pasted message.
- **Languages**: English, Bangla script, and common Banglish date words (`kalke`, `porshu`, `agami`, `tarikh`, `5 ta`).
- **Categories**: Assignment, Quiz, Examination, Lab, Project, Meeting, General Task, Reminder.
- **Honest dates**: relative dates resolve against today in Asia/Dhaka. A missing or ambiguous deadline is left empty or flagged for confirmation, never invented.
- **Review first**: every field is editable, and nothing reaches Notion until you press Save.
- **Real Notion sync**: Save creates a page through the official Notion API and shows its link only after Notion confirms it.
- **Upcoming tasks**: the dashboard reads your Assignments and Tasks databases live, with overdue, today and soon indicators.
- **Unrelated messages**: small talk is recognised and reported as "no task found".

## How it extends Notion Student OS

Student OS already has Assignments, Tasks and Courses databases. CampusCatch is a capture layer in front of them:

- Academic items (assignment, quiz, exam, lab, project) go to **Assignments**; everything else goes to **Tasks**. You can switch before saving.
- The course is linked to the matching page in **Courses** when the database has a course relation and a match exists.
- The original message is stored in the page body, so the source is never lost.
- It reads each database's real schema instead of assuming property names, so renamed or missing properties do not break saving.

## How Devin was used

The app was built in a Devin session from the hackathon brief: scaffolding the Next.js project, writing the date parser and extraction rules with tests, building the Notion layer against the installed SDK's types, building the UI, and checking it in a browser.

## Technology

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4
- `@notionhq/client` 5, the official Notion SDK (data source API)
- Vitest for unit tests
- Optional: any OpenAI-compatible chat API for extraction

There is no database and no separate backend. The Notion token is read only by server-side route handlers.

## Setup

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in NOTION_TOKEN
npm run dev                  # http://localhost:3000
```

### Connect Notion

1. Duplicate the Student OS template into your own workspace.
2. Create an internal integration at <https://www.notion.so/profile/integrations> with read, update and insert content capabilities. Copy its secret into `NOTION_TOKEN`.
3. Open your Student OS page, then `•••` → **Connections** → add the integration. Sharing the parent page shares its databases.
4. Restart `npm run dev`. The header shows which databases were found and which properties were matched.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NOTION_TOKEN` | Yes | Internal integration secret. Server-side only. |
| `NOTION_ASSIGNMENTS_DB_ID` | No | Assignments database ID or URL. Found by name when empty. |
| `NOTION_TASKS_DB_ID` | No | Tasks database ID or URL. Found by name when empty. |
| `NOTION_COURSES_DB_ID` | No | Courses database ID or URL. Used for the status panel. |
| `NOTION_PROPERTY_MAP` | No | JSON override of which property holds each field. |
| `LLM_API_KEY` | No | Enables AI extraction. `OPENAI_API_KEY` also works. |
| `LLM_BASE_URL` | No | OpenAI-compatible base URL. Default `https://api.openai.com/v1`. |
| `LLM_MODEL` | No | Default `gpt-4o-mini`. |

Without Notion credentials the app still extracts and lets you review; saving and the task list show a clear "not connected" state.

## Testing

```bash
npm test          # unit tests: extraction scenarios, schema mapping, course matching
npm run lint
npm run typecheck
npm run build
```

Scenarios covered by the extraction tests:

| Input | Expected |
| --- | --- |
| `CSE 4137 Soft Computing assignment submission deadline is November 25, 2026 at 11:59 PM.` | Assignment, CSE 4137, 25 Nov 2026 23:59 |
| `Kalke amader CSE 4137 quiz ase.` | Quiz, CSE 4137, tomorrow, flagged for review |
| `Renew my university library membership by November 28, 2026.` | General Task, 28 Nov 2026, saved to Tasks |
| `Remember to discuss the group presentation with teammates.` | No deadline, flagged for review |
| `Hey everyone, how was your weekend?` | No task found |

To check the Notion round trip by hand: extract any sample, press **Save to Notion**, open the returned link, then confirm the item appears under **Upcoming in Notion**.

## Architecture

```
src/
  app/
    page.tsx                 UI entry
    api/extract/route.ts     POST  announcement -> extracted task
    api/tasks/route.ts       GET   upcoming tasks, POST create a Notion page
    api/status/route.ts      GET   connection and schema check
  components/                Capture panel, review card, dashboard, connection panel
  lib/
    extract/                 dateParser (dates and times), rules (category, course, title), llm (optional)
    notion/
      client.ts              SDK client, env config, error mapping
      schema.ts              Finds databases, maps fields to real property names and types
      read.ts                Notion page -> task item, course lookup
      tasks.ts               List tasks, duplicate check, create page
      status.ts              Connection report for the UI
    dates.ts                 Asia/Dhaka date helpers
    validation.ts            Request validation
```

How a save works:

1. The route validates the body and resolves the target database's data source and schema.
2. Fields are written only to properties that exist, using the property's own type (status, select, checkbox, relation and so on). Anything without a home goes in the page body.
3. If the same title and deadline already exist, the API returns a 409 and the UI offers "Save anyway".
4. If Notion rejects an optional property, the save is retried with the title and deadline only, and the UI shows a warning.
5. The UI shows the page link only from Notion's success response, then reloads the dashboard from Notion.

## Known limitations

- The built-in parser recognises a fixed set of date, time and category phrases. Free-form or unusual Bangla and Banglish wording needs the optional LLM, and should still be reviewed.
- One task per pasted message.
- All dates are treated as Asia/Dhaka time.
- The dashboard reads the first 100 entries of each database.
- Databases are found by name when IDs are not set. Set the IDs if your names differ.
- A Notion `status` property only accepts existing options, so "Not Started" is used when an equivalent option exists and Notion's default otherwise.
- No sign-in: the app uses one integration token and is meant to run locally or as a personal deployment.

## Future improvements

- Several tasks from one long announcement.
- Mark tasks done from the dashboard.
- Reminders before deadlines.
- Notion OAuth so each student connects their own workspace.
- Capture from a browser extension or a chat bot.

## License

MIT
