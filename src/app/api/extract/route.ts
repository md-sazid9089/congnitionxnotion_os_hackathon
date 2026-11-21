import { fail, ok, readJson } from "@/lib/errors";
import { extractTask } from "@/lib/extract";
import { validateAnnouncement } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const announcement = validateAnnouncement(await readJson(request));
    return ok(await extractTask(announcement));
  } catch (error) {
    return fail(error);
  }
}
