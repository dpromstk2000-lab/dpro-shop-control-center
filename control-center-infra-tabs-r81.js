(() => {
  "use strict";

  const VERSION = "CONTROL-CENTER-INFRA-TABS-R81.1-20261006";
  if (window.__DPRO_CC_INFRA_TABS_R811__ === VERSION) return;
  window.__DPRO_CC_INFRA_TABS_R811__ = VERSION;

  const VALID = new Set(["systems", "supabase", "workers", "github", "releases", "health"]);

  function show(tab, updateUrl = true) {
    if (!VALID.has(tab)) return false;

    document.querySelectorAll(".infrastructure-tab").forEach((button) => {
      const active = button.dataset.infraTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll(".infra-panel").forEach((panel) => {
      panel.classList.add("hidden");
    });

    const target = document.getElementById(`infra-panel-${tab}`);
    if (!target) return false;
    target.classList.remove("hidden");

    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("infra_tab", tab);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    document.documentElement.dataset.ccInfraTab = tab;
    return true;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".infrastructure-tab[data-infra-tab]");
    if (!button) return;

    const tab = button.dataset.infraTab || "";
    if (!VALID.has(tab)) return;

    show(tab, true);
  }, true);

  function restore() {
    const tab = new URLSearchParams(location.search).get("infra_tab");
    if (VALID.has(tab)) show(tab, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restore, { once: true });
  } else {
    restore();
  }
})();
