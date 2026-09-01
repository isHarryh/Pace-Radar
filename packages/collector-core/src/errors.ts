export class RequestError extends Error {
  constructor(
    public readonly statusCode: string,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}
