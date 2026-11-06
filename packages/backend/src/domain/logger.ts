export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogValue = string | number | boolean | null;

export type LogFields = Record<string, LogValue | undefined>;

export interface LogRecord {
  level: LogLevel;
  event: string;
  [field: string]: LogValue;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  with(fields: LogFields): Logger;
}

export function structuredLogger(sink: LogSink, base: LogFields = {}): Logger {
  const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
    const record: LogRecord = { level, event };
    for (const [key, value] of Object.entries({ ...base, ...fields })) {
      if (value !== undefined && key !== "level" && key !== "event") {
        record[key] = value;
      }
    }
    sink(record);
  };
  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    with: (fields) => structuredLogger(sink, { ...base, ...fields }),
  };
}

export const silentLogger: Logger = structuredLogger(() => {});

const MAX_CAUSES = 5;

export interface ErrorDescription {
  error: string;
  message: string;
  cause: string | null;
}

export function describeError(error: unknown): ErrorDescription {
  if (!(error instanceof Error)) {
    return { error: "thrown value", message: String(error), cause: null };
  }
  const causes: string[] = [];
  let cause: unknown = error.cause;
  while (cause !== undefined && causes.length < MAX_CAUSES) {
    causes.push(
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : String(cause),
    );
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return {
    error: error.name,
    message: error.message,
    cause: causes.length > 0 ? causes.join(" <- ") : null,
  };
}

export function errorFields(error: unknown): LogFields {
  const { error: name, message, cause } = describeError(error);
  return {
    error: name,
    error_message: message,
    error_cause: cause ?? undefined,
    error_stack: error instanceof Error ? error.stack : undefined,
  };
}
