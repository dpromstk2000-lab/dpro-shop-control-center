(() => {
  "use strict";

  const BUILD = "DPRO-DELIVERY-REQUEST-GUARD-R1-20260919";
  const originalFetch = window.fetch.bind(window);

  const TIMEOUT_MS = 12000;
  const RETRY_DELAY_MS = 350;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isSupabaseRestUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.pathname.includes("/rest/v1/");
    } catch (_) {
      return false;
    }
  }

  function rewriteStandardUrl(raw) {
    try {
      const url = new URL(raw, location.href);

      if (!url.pathname.includes("/rest/v1/cc_standard_versions")) {
        return raw;
      }

      const status = url.searchParams.get("status") || "";
      const hasStandardCode = url.searchParams.has("standard_code");

      if (status === "eq.current" && !hasStandardCode) {
        url.searchParams.set("standard_code", "eq.DPRO_STANDARD");
        return url.toString();
      }
    } catch (_) {}

    return raw;
  }

  function requestUrl(input) {
    if (input instanceof Request) return input.url;
    if (input instanceof URL) return input.toString();
    return typeof input === "string" ? input : "";
  }

  function rewriteInput(input) {
    const raw = requestUrl(input);
    const rewritten = rewriteStandardUrl(raw);

    if (!raw || rewritten === raw) return input;

    if (input instanceof Request) {
      return new Request(rewritten, input);
    }
    if (input instanceof URL) {
      return new URL(rewritten);
    }
    return rewritten;
  }

  function methodOf(input, init) {
    if (init?.method) return String(init.method).toUpperCase();
    if (input instanceof Request && input.method) return String(input.method).toUpperCase();
    return "GET";
  }

  function shouldGuard(input, init) {
    const method = methodOf(input, init);
    if (method !== "GET" && method !== "HEAD") return false;

    const url = requestUrl(input);
    return Boolean(url && isSupabaseRestUrl(url));
  }

  function makeSignal(existingSignal, timeoutMs) {
    const controller = new AbortController();
    let timeoutId = null;

    const abortFromExisting = () => {
      try {
        controller.abort(existingSignal?.reason);
      } catch (_) {
        controller.abort();
      }
    };

    if (existingSignal) {
      if (existingSignal.aborted) {
        abortFromExisting();
      } else {
        existingSignal.addEventListener("abort", abortFromExisting, { once: true });
      }
    }

    timeoutId = setTimeout(() => {
      try {
        controller.abort(new DOMException("DPRO request timeout", "TimeoutError"));
      } catch (_) {
        controller.abort();
      }
    }, timeoutMs);

    return {
      signal: controller.signal,
      cleanup() {
        if (timeoutId) clearTimeout(timeoutId);
        if (existingSignal) {
          existingSignal.removeEventListener("abort", abortFromExisting);
        }
      },
    };
  }

  async function guardedFetch(input, init = {}) {
    const rewrittenInput = rewriteInput(input);

    if (!shouldGuard(rewrittenInput, init)) {
      return originalFetch(rewrittenInput, init);
    }

    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const signalPack = makeSignal(init.signal || (rewrittenInput instanceof Request ? rewrittenInput.signal : null), TIMEOUT_MS);

      try {
        const response = await originalFetch(rewrittenInput, {
          ...init,
          signal: signalPack.signal,
        });

        signalPack.cleanup();

        // Retry once only for transient server-side errors.
        if (attempt === 0 && response.status >= 500 && response.status <= 599) {
          lastError = new Error(`DPRO REST ${response.status}`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        return response;
      } catch (error) {
        signalPack.cleanup();
        lastError = error;

        if (attempt === 0) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("DPRO REST request failed");
  }

  window.fetch = guardedFetch;

  window.DPRO_DELIVERY_REQUEST_GUARD_R1 = Object.freeze({
    build: BUILD,
    timeoutMs: TIMEOUT_MS,
    retryCount: 1,
    standardCode: "DPRO_STANDARD",
  });
})();
