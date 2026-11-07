/** postgres.js puts the SQLSTATE in `code`; Drizzle may wrap the error in `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}
