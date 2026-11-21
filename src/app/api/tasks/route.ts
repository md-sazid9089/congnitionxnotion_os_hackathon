import { fail, ok, readJson } from "@/lib/errors";
import { createTask, listTasks } from "@/lib/notion/tasks";
import { validateSaveInput } from "@/lib/validation";

export async function GET() {
  try {
    return ok({ tasks: await listTasks() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = validateSaveInput(await readJson(request));
    return ok(await createTask(input), 201);
  } catch (error) {
    return fail(error);
  }
}
