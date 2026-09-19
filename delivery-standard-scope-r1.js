(() => {
  "use strict";

  const BUILD = "DPRO-STANDARD-SCOPE-R1-20260919";
  const root = window.supabase;

  if (!root?.createClient || root.__dproStandardScopeR1Installed) return;

  const originalCreateClient = root.createClient.bind(root);

  function wrapBuilder(builder, context) {
    if (!builder || typeof builder !== "object") return builder;

    return new Proxy(builder, {
      get(target, prop) {
        if (prop === "then" && typeof target.then === "function") {
          return target.then.bind(target);
        }

        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;

        return (...args) => {
          let next = value.apply(target, args);

          if (context.table === "cc_standard_versions" && prop === "eq") {
            const [column, expected] = args;

            if (column === "standard_code") {
              context.hasStandardCode = true;
            }

            if (
              column === "status" &&
              expected === "current" &&
              !context.hasStandardCode &&
              next &&
              typeof next.eq === "function"
            ) {
              next = next.eq("standard_code", "DPRO_STANDARD");
              context.hasStandardCode = true;
            }
          }

          return next && typeof next === "object"
            ? wrapBuilder(next, context)
            : next;
        };
      },
    });
  }

  root.createClient = (...args) => {
    const client = originalCreateClient(...args);

    return new Proxy(client, {
      get(target, prop) {
        if (prop === "from") {
          return (table) => {
            const builder = target.from(table);

            if (table !== "cc_standard_versions") {
              return builder;
            }

            return wrapBuilder(builder, {
              table,
              hasStandardCode: false,
            });
          };
        }

        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  Object.defineProperty(root, "__dproStandardScopeR1Installed", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  window.DPRO_STANDARD_SCOPE_R1 = Object.freeze({
    build: BUILD,
    standardCode: "DPRO_STANDARD",
  });
})();
