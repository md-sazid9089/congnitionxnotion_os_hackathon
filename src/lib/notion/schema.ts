import { isFullDataSource, isFullDatabase, type DataSourceObjectResponse } from "@notionhq/client";
import { AppError } from "../errors";
import { configuredId, isNotFound, notionClient, propertyOverrides, toAppError, type DatabaseKey } from "./client";

export type PropertyConfig = DataSourceObjectResponse["properties"][string];

export const FIELDS = ["title", "dueDate", "status", "category", "course", "description", "source"] as const;
export type Field = (typeof FIELDS)[number];

export interface MappedProperty {
  name: string;
  type: PropertyConfig["type"];
  config: PropertyConfig;
}

export type PropertyMap = Record<Field, MappedProperty | null>;

export interface ResolvedSource {
  key: DatabaseKey;
  dataSourceId: string;
  title: string;
  url: string;
  discovered: boolean;
  map: PropertyMap;
}

/** Which property types can hold each field, in order of preference, and the names that suggest it. */
const RULES: Record<Field, { types: PropertyConfig["type"][]; names: RegExp[] }> = {
  title: { types: ["title"], names: [/./] },
  dueDate: { types: ["date"], names: [/due|deadline/i, /date|when|time/i, /./] },
  status: {
    types: ["status", "select", "checkbox"],
    names: [/^status$/i, /status|state|progress|stage/i, /^(done|completed?|finished|submitted)\??$/i],
  },
  category: { types: ["select", "multi_select"], names: [/^(type|category|kind)$/i, /type|category|kind|tag/i] },
  course: {
    types: ["relation", "select", "multi_select", "rich_text"],
    names: [/^(course|class|subject)s?$/i, /course|class|subject|module/i],
  },
  description: { types: ["rich_text"], names: [/^(description|details?|notes?)$/i, /descri|detail|note|summary/i] },
  source: { types: ["rich_text"], names: [/source|original|announcement|message|raw/i] },
};

const TITLE_HINTS: Record<DatabaseKey, RegExp> = {
  assignments: /assignment|homework|coursework|exam|deadline/i,
  tasks: /task|to-?do/i,
  courses: /course|class|subject|module/i,
};

export function mapProperties(
  properties: Record<string, PropertyConfig>,
  overrides: Record<string, string> = {},
): PropertyMap {
  const all = Object.values(properties);
  const used = new Set<string>();
  const map = {} as PropertyMap;

  for (const field of FIELDS) {
    const rule = RULES[field];
    let found: PropertyConfig | undefined;
    const override = overrides[field];
    if (override) {
      found = all.find((p) => p.name.toLowerCase() === override.toLowerCase());
      if (!found) {
        throw new AppError(
          "invalid_property_map",
          `NOTION_PROPERTY_MAP points "${field}" at "${override}", which this database does not have.`,
          500,
          `Available properties: ${all.map((p) => p.name).join(", ")}.`,
        );
      }
    } else {
      search: for (const pattern of rule.names) {
        for (const type of rule.types) {
          found = all.find((p) => p.type === type && !used.has(p.name) && pattern.test(p.name));
          if (found) break search;
        }
      }
    }
    if (found) used.add(found.name);
    map[field] = found ? { name: found.name, type: found.type, config: found } : null;
  }
  return map;
}

function plainTitle(source: DataSourceObjectResponse): string {
  return source.title.map((t) => t.plain_text).join("").trim() || "Untitled";
}

async function retrieveDataSource(id: string): Promise<DataSourceObjectResponse | null> {
  const notion = notionClient();
  try {
    const database = await notion.databases.retrieve({ database_id: id });
    if (isFullDatabase(database) && database.data_sources.length > 0) {
      const source = await notion.dataSources.retrieve({ data_source_id: database.data_sources[0].id });
      return isFullDataSource(source) ? source : null;
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    const source = await notion.dataSources.retrieve({ data_source_id: id });
    return isFullDataSource(source) ? source : null;
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return null;
  }
}

/** Finds a shared database by its title when no ID is configured. */
async function discover(key: DatabaseKey): Promise<DataSourceObjectResponse | null> {
  const response = await notionClient().search({
    filter: { property: "object", value: "data_source" },
    page_size: 100,
  });
  const candidates = response.results.filter(
    (r): r is DataSourceObjectResponse => r.object === "data_source" && isFullDataSource(r) && !r.in_trash,
  );
  return candidates.find((c) => TITLE_HINTS[key].test(plainTitle(c))) ?? null;
}

const TTL_MS = 60_000;
const cache = new Map<DatabaseKey, { at: number; token: string; value: ResolvedSource | null }>();

export function clearSchemaCache(): void {
  cache.clear();
}

/** Returns the data source for a database, or null when none is configured or shared. */
export async function findSource(key: DatabaseKey): Promise<ResolvedSource | null> {
  const token = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY ?? "";
  const hit = cache.get(key);
  if (hit && hit.token === token && Date.now() - hit.at < TTL_MS) return hit.value;

  const { value: id, envName } = configuredId(key);
  let source: DataSourceObjectResponse | null;
  try {
    source = id ? await retrieveDataSource(id) : await discover(key);
  } catch (error) {
    throw toAppError(error, `read the ${key} database`);
  }
  if (id && !source) {
    throw new AppError(
      "notion_not_found",
      `Notion could not find the ${key} database from ${envName}.`,
      404,
      "Check the ID, and share that database (or its parent page) with the integration.",
    );
  }
  const value: ResolvedSource | null = source
    ? {
        key,
        dataSourceId: source.id,
        title: plainTitle(source),
        url: source.url,
        discovered: !id,
        map: mapProperties(source.properties, propertyOverrides(key)),
      }
    : null;
  cache.set(key, { at: Date.now(), token, value });
  return value;
}

export async function requireSource(key: DatabaseKey): Promise<ResolvedSource> {
  const source = await findSource(key);
  if (!source) {
    const { envName } = configuredId(key);
    throw new AppError(
      "notion_database_missing",
      `No ${key} database is connected.`,
      404,
      `Set ${envName} in .env.local, or share a database whose name contains "${key.slice(0, -1)}" with the integration.`,
    );
  }
  return source;
}
