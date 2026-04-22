export class NetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export class TimeoutError extends Error {
  constructor(milliseconds) {
    super(`Request timed out after ${milliseconds}ms.`);
    this.name = "TimeoutError";
    this.milliseconds = milliseconds;
  }
}

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message || `Backend returned ${status}.`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function joinUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

export async function requestJson(url, options = {}) {
  const {
    method = "GET",
    body,
    timeoutMs = 8000,
    headers = {},
  } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const payload = rawText ? safeParseJson(rawText) : null;

    if (!response.ok) {
      throw new ApiError(response.status, payload?.error || response.statusText, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new TimeoutError(timeoutMs);
    }

    throw new NetworkError("Backend unreachable from this browser.", error);
  } finally {
    window.clearTimeout(timer);
  }
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return { raw: value };
  }
}
