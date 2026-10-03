/**
 * Validates request Origin against the Host header or known development hosts
 * to mitigate CSRF attacks on mutation routes.
 */
export function validateRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // If origin is missing, check referer as fallback
    const referer = request.headers.get("referer");
    if (!referer) {
      // In same-origin form/fetch requests from some browsers or tests, origin may be omitted
      return true;
    }
    try {
      const refererUrl = new URL(referer);
      const host = request.headers.get("host");
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("host");
    if (originUrl.host === host) {
      return true;
    }

    // Allow localhost/local dev origins
    if (
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1" ||
      originUrl.hostname.endsWith(".trycloudflare.com") ||
      originUrl.hostname.endsWith(".devtunnels.ms") ||
      originUrl.hostname.endsWith(".app.github.dev")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
