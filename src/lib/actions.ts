// Shared shape and error handling for server actions used with useActionState.
import { unstable_rethrow } from "next/navigation";
import { GENERIC_ERROR, isAppError } from "./errors";
import { logger } from "./logger";

export type FormState =
  | {
      error?: string;
      ok?: string;
      /** Non-secret field values to restore after an error (React resets forms after actions). */
      values?: Record<string, string>;
    }
  | undefined;

const log = logger.child({ module: "actions" });

/**
 * Runs an action body and converts failures into FormState:
 *   - AppError        -> its public message
 *   - redirect() etc. -> re-thrown so Next.js can handle them
 *   - anything else   -> logged, generic message
 */
export async function runAction(
  name: string,
  body: () => Promise<FormState | void>,
  values?: Record<string, string>,
): Promise<FormState> {
  try {
    return (await body()) ?? undefined;
  } catch (err) {
    unstable_rethrow(err);
    if (isAppError(err)) {
      if (err.code !== "VALIDATION") log.info("action.rejected", { action: name, code: err.code });
      return { error: err.publicMessage, values };
    }
    log.error("action.failed", { action: name, err });
    return { error: GENERIC_ERROR, values };
  }
}
