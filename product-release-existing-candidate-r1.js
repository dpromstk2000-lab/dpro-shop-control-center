(() => {
  "use strict";

  const BUILD = "DPRO-PRODUCT-RELEASE-EXISTING-CANDIDATE-R1-20260924";
  const TARGET_VIEW = "cc_v_product_development_overview";
  const CANDIDATE_RPC = "cc_product_release_candidates_list";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(BUILD, "Supabase client library is not ready.");
    return;
  }

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = function (...args) {
    const client = originalCreateClient(...args);
    const originalFrom = client.from.bind(client);

    return new Proxy(client, {
      get(target, prop) {
        if (prop === "from") {
          return function (table) {
            if (table !== TARGET_VIEW) {
              return originalFrom(table);
            }

            return {
              select() {
                return {
                  async order() {
                    const result = await client.rpc(CANDIDATE_RPC);
                    if (result.error) return { data: null, error: result.error };
                    return {
                      data: Array.isArray(result.data) ? result.data : [],
                      error: null
                    };
                  }
                };
              }
            };
          };
        }

        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  };

  console.info(BUILD, "Existing catalog Product Release candidates enabled.");
})();
