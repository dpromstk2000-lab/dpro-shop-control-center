(() => {
  "use strict";
  // CENTER-3: delivery.htmlの旧Feature Flag操作後もCENTER-2の
  // 依存関係・制作タスク同期を実行する互換レイヤー。
  if (document.body?.dataset.cc11DeliveryPage !== "true") return;

  let clientPromise = null;

  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      const cfg = window.DPRO_CONTROL_CENTER_CONFIG || {};
      const base = String(cfg.apiBaseUrl || "").replace(/\/$/, "");
      const response = await fetch(`${base}/api/public-config`, { cache:"no-store" });
      const pub = await response.json();
      if (!response.ok || !window.supabase?.createClient) return null;
      return window.supabase.createClient(
        pub.supabaseUrl,
        pub.supabasePublishableKey || pub.supabaseAnonKey,
        {
          auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:false,
            storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1",
          }
        }
      );
    })();
    return clientPromise;
  }

  let timer = null;

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-feature]");
    if (!input) return;

    const projectCode = document.querySelector("#detailContent .project-code")?.textContent?.trim();
    if (!projectCode) return;

    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const sb = await getClient();
        if (!sb) return;
        const { data: project } = await sb
          .from("cc_delivery_projects")
          .select("id")
          .eq("project_code", projectCode)
          .maybeSingle();
        if (!project?.id) return;

        await sb.rpc("cc_center2_refresh_project", { p_project_id:project.id });
      } catch (error) {
        console.warn("CENTER-3 compatibility refresh skipped", error);
      }
    }, 1800);
  }, true);
})();
