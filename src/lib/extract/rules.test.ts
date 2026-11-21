import { describe, expect, it } from "vitest";
import { extractWithRules } from "./rules";

// Saturday 21 November 2026, 17:00 in Dhaka.
const NOW = new Date("2026-11-21T17:00:00+06:00");
const run = (text: string) => extractWithRules(text, NOW);

describe("extractWithRules", () => {
  it("handles the spec example", () => {
    const { task } = run(
      "Everyone, CSE 4137 Soft Computing assignment must be submitted by 25 November 2026 at 11:59 PM. Submit through the university portal.",
    );
    expect(task).toMatchObject({
      title: "Soft Computing Assignment",
      course: "CSE 4137",
      category: "Assignment",
      dueDate: "2026-11-25T23:59:00+06:00",
      description: "Submit through the university portal.",
      status: "Not Started",
      needsReview: false,
      destination: "assignments",
    });
  });

  it("scenario A: English academic notice", () => {
    const { task } = run(
      "CSE 4137 Soft Computing assignment submission deadline is November 25, 2026 at 11:59 PM.",
    );
    expect(task).toMatchObject({
      title: "Soft Computing Assignment",
      course: "CSE 4137",
      category: "Assignment",
      dueDate: "2026-11-25T23:59:00+06:00",
      needsReview: false,
    });
  });

  it("scenario B: Banglish quiz with 'kalke'", () => {
    const { task } = run("Kalke amader CSE 4137 quiz ase.");
    expect(task).toMatchObject({
      title: "CSE 4137 Quiz",
      course: "CSE 4137",
      category: "Quiz",
      dueDate: "2026-11-22",
      needsReview: true,
      destination: "assignments",
    });
    expect(task?.reviewNotes.join(" ")).toMatch(/tomorrow or yesterday/);
  });

  it("scenario C: personal task", () => {
    const { task } = run("Renew my university library membership by November 28, 2026.");
    expect(task).toMatchObject({
      title: "Renew my university library membership",
      course: "",
      category: "General Task",
      dueDate: "2026-11-28",
      needsReview: false,
      destination: "tasks",
    });
  });

  it("scenario D: missing deadline is never invented", () => {
    const { task } = run("Remember to discuss the group presentation with teammates.");
    expect(task).toMatchObject({
      title: "Discuss the group presentation with teammates",
      dueDate: null,
      needsReview: true,
      destination: "tasks",
    });
    expect(task?.reviewNotes[0]).toMatch(/No deadline/);
  });

  it("scenario E: unrelated message", () => {
    const result = run("Hey everyone, how was your weekend?");
    expect(result.actionable).toBe(false);
    expect(result.task).toBeNull();
    expect(result.reason).toMatch(/No actionable item/);
  });

  it("prefers a relative deadline over an absolute issue date and flags it", () => {
    const { task } = run("Assignment issued November 20, 2026; submit by tomorrow.");
    expect(task?.dueDate).toBe("2026-11-22");
    expect(task?.needsReview).toBe(true);
  });

  it("flags a submission window with two times", () => {
    const { task } = run("Submit the assignment tomorrow between 9 AM and 5 PM.");
    expect(task?.dueDate?.slice(0, 10)).toBe("2026-11-22");
    expect(task?.needsReview).toBe(true);
  });

  it("resolves relative English dates against today in Dhaka", () => {
    expect(run("CSE 4101 quiz tomorrow at 10 am").task?.dueDate).toBe("2026-11-22T10:00:00+06:00");
    expect(run("Submit the EEE 2203 lab report by Friday").task).toMatchObject({
      category: "Lab",
      dueDate: "2026-11-27",
    });
  });

  it("reads Bangla script and Bangla digits", () => {
    const { task } = run("আগামীকাল সকাল ১০টায় CSE 4137 কুইজ");
    expect(task).toMatchObject({ category: "Quiz", dueDate: "2026-11-22T10:00:00+06:00" });
  });

  it("flags ambiguous numeric dates and clock times", () => {
    const numeric = run("MAT 2101 assignment due 05/12/2026");
    expect(numeric.task).toMatchObject({ dueDate: "2026-12-05", needsReview: true });
    const clock = run("Club meeting on 30 November 2026 at 9:30");
    expect(clock.task).toMatchObject({ category: "Meeting", dueDate: "2026-11-30T09:30:00+06:00", needsReview: true });
  });

  it("does not mistake years, months or times for course codes", () => {
    expect(run("Pay the semester fee by Nov 2026").task?.course).toBe("");
    expect(run("Project demo at 11:59 PM 2026-12-01").task?.course).toBe("");
  });
});
