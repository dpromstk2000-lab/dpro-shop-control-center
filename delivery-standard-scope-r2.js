(() => {
  "use strict";

  const BUILD = "DPRO-STANDARD-SCOPE-R2-20260919";
  const originalFetch = window.fetch.bind(window);

  function rewrite(input) {
    try {
      const raw =
        input instanceof Request ? input.url :
        input instanceof URL ? input.toString() :
        typeof input === "string" ? input :
        "";

      if (!raw) return input;

      const url = new URL(raw, location.href);

      // Only touch Supabase REST reads of cc_standard_versions.
      if (!url.pathname.includes("/rest/v1/cc_standard_versions")) return input;

      const status = url.searchParams.get("status") || "";
      const hasStandardCode = url.searchParams.has("standard_code");

      if (status === "eq.current" && !hasStandardCode) {
        url.searchParams.set("standard_code", "eq.DPRO_STANDARD");

        if (input instanceof Request) {
          return new Request(url.toString(), input);
        }
        if (input instanceof URL) {
          return new URL(url.toString());
        }
        return url.toString();
      }
    } catch (_) {
      // Fail open: if URL parsing ever fails, use the original request unchanged.
    }

    return input;
  }

  window.fetch = function(input, init) {
    return originalFetch(rewrite(input), init);
  };

  window.DPRO_STANDARD_SCOPE_R2 = Object.freeze({
    build: BUILD,
    standardCode: "DPRO_STANDARD",
    mode: "fetch-url-scope-only",
  });
})();
