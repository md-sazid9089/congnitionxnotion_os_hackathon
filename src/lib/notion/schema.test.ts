import { describe, expect, it } from "vitest";
import { toDhakaDue } from "./read";
import { mapProperties, type PropertyConfig } from "./schema";
import { matchCourse } from "./tasks";

function props(entries: Record<string, string>): Record<string, PropertyConfig> {
  return Object.fromEntries(
    Object.entries(entries).map(([name, type]) => [name, { id: name, name, type, description: null, [type]: {} }]),
  ) as unknown as Record<string, PropertyConfig>;
}

const names = (map: ReturnType<typeof mapProperties>) =>
  Object.fromEntries(Object.entries(map).map(([field, property]) => [field, property?.name ?? null]));

describe("mapProperties", () => {
  it("maps a typical Student OS assignments database", () => {
    const map = mapProperties(
      props({ Name: "title", "Due Date": "date", Status: "status", Type: "select", Course: "relation", Notes: "rich_text" }),
    );
    expect(names(map)).toEqual({
      title: "Name",
      dueDate: "Due Date",
      status: "Status",
      category: "Type",
      course: "Course",
      description: "Notes",
      source: null,
    });
  });

  it("works with differently named properties and leaves missing ones unmapped", () => {
    const map = mapProperties(props({ Task: "title", Deadline: "date", Done: "checkbox", Created: "created_time" }));
    expect(names(map)).toEqual({
      title: "Task",
      dueDate: "Deadline",
      status: "Done",
      category: null,
      course: null,
      description: null,
      source: null,
    });
  });

  it("prefers a due date over other date properties", () => {
    const map = mapProperties(props({ Name: "title", "Start Date": "date", Due: "date" }));
    expect(map.dueDate?.name).toBe("Due");
  });

  it("does not use one select for both status and category", () => {
    const map = mapProperties(props({ Name: "title", Status: "select" }));
    expect(map.status?.name).toBe("Status");
    expect(map.category).toBeNull();
  });

  it("applies explicit overrides and rejects unknown property names", () => {
    const schema = props({ Name: "title", Kind: "select", Area: "select" });
    expect(mapProperties(schema, { category: "area" }).category?.name).toBe("Area");
    expect(() => mapProperties(schema, { dueDate: "Nope" })).toThrow(/does not have/);
  });
});

describe("matchCourse", () => {
  const pages = [
    { id: "1", title: "Soft Computing", haystack: "softcomputingcse4137" },
    { id: "2", title: "CSE 4101 - Compiler Design", haystack: "cse4101compilerdesign" },
  ];

  it("matches by course code stored in any text property", () => {
    expect(matchCourse("CSE 4137", pages)?.id).toBe("1");
    expect(matchCourse("cse-4101", pages)?.id).toBe("2");
  });

  it("matches by course name", () => {
    expect(matchCourse("Soft Computing", pages)?.id).toBe("1");
    expect(matchCourse("Compiler Design", pages)?.id).toBe("2");
  });

  it("returns null rather than guessing", () => {
    expect(matchCourse("EEE 2201", pages)).toBeNull();
    expect(matchCourse("CSE 413", pages)).toBeNull();
    expect(matchCourse("", pages)).toBeNull();
  });
});

describe("toDhakaDue", () => {
  it("keeps date-only values and converts datetimes to Dhaka time", () => {
    expect(toDhakaDue("2026-11-25")).toBe("2026-11-25");
    expect(toDhakaDue("2026-11-25T17:59:00.000Z")).toBe("2026-11-25T23:59:00+06:00");
    expect(toDhakaDue("2026-11-25T23:59:00.000+06:00")).toBe("2026-11-25T23:59:00+06:00");
  });
});
