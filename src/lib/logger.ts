type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const entry = {
    level,
    message,
    context,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    // In production you would send this to Sentry/DataDog/etc.
    // eslint-disable-next-line no-console
    console.error(entry);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(entry);
  } else {
    // eslint-disable-next-line no-console
    console.log(entry);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext, error?: unknown) => log("warn", message, context, error),
  error: (message: string, error?: unknown, context?: LogContext) => log("error", message, context, error),
};

export function safeAsync<T>(promise: Promise<T>, context?: LogContext): Promise<[T | null, Error | null]> {
  return promise
    .then((data) => [data, null] as [T, null])
    .catch((err) => {
      logger.error("safeAsync caught error", err, context);
      return [null, err instanceof Error ? err : new Error(String(err))] as [null, Error];
    });
}
