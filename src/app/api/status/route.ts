import { fail, ok } from "@/lib/errors";
import { connectionStatus } from "@/lib/notion/status";

export async function GET() {
  try {
    return ok(await connectionStatus());
  } catch (error) {
    return fail(error);
  }
}
