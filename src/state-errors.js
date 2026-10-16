export class StateWriteConflictError extends Error {
  constructor(message = "Persistent state changed during this request. Reload the latest state and retry.", options) {
    super(message, options);
    this.name = "StateWriteConflictError";
    this.code = "state_write_conflict";
  }
}
