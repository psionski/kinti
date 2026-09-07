/**
 * Service-layer error types the API boundary can classify.
 *
 * Services throw plain `Error` for genuine faults, which `handleServiceError`
 * reports as a 500. A rejected *input* is not a fault — the caller asked for
 * something the domain forbids — so it carries its own type and comes back as
 * a 400. Without the distinction, "you cannot price a deposit" is indis-
 * tinguishable from a crashed query in both the HTTP status and the logs.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
