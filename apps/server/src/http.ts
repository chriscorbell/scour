export class HttpError extends Error {
  status: 400 | 404 | 409 | 500 | 502;
  details?: unknown;
  constructor(status: HttpError["status"], message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found.`);
