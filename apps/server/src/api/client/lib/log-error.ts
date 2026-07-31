/**
 * Extracts only the safe-to-log fields (`message`, optional `stack`) from a
 * caught value before handing it to the logger.
 *
 * Passing a raw caught `error` straight to a Pino logger call risks
 * dumping every own enumerable property of the error onto the log line —
 * Pino's built-in `Error` handling walks all of them, not just
 * `message`/`stack`. For a `ky` `HTTPError` in particular (the shape most
 * failed outbound HTTP calls in these routes throw, e.g. the Google OAuth
 * token-exchange/userinfo calls) that includes the failed
 * `request`/`response`/`options` objects, which can carry Authorization
 * headers, OAuth tokens, or request bodies. Logging only `message` (and
 * `stack`, which is safe — just file/line info) keeps enough context to
 * debug without risking a secret landing in server logs.
 */
export const toSafeLogFields = (
  error: unknown
): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  return { message: String(error) };
};
