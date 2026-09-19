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

  // ---------------------------------------------------------------------------
  // FACTORY V2.0 integration bridge (2026-09-19)
  // - Adds the mandatory pre-deployment audit entry point to delivery.html.
  // - Adds a second UI guard to CENTER-8 GO LIVE. DB triggers remain authoritative.
  // ---------------------------------------------------------------------------
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));

  function installFactoryV2Style() {
    if (document.getElementById("factoryV2BridgeStyle")) return;
    const style = document.createElement("style");
    style.id = "factoryV2BridgeStyle";
    style.textContent = `
      .fv2-entry{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap}
      .fv2-gate-banner{margin:0 0 14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:#f8fafc;color:#334155}
      .fv2-gate-banner strong{display:block;font-size:14px;margin-bottom:4px}
      .fv2-gate-banner span{display:block;font-size:12px;line-height:1.55}
      .fv2-gate-banner a{display:inline-block;margin-top:7px;font-weight:800;color:#0f766e;text-decoration:none}
      .fv2-gate-banner.ready{border-color:#86efac;background:#f0fdf4;color:#166534}
      .fv2-gate-banner.blocked{border-color:#fbbf24;background:#fffbeb;color:#92400e}
      .fv2-gate-banner.legacy{border-color:#cbd5e1;background:#f8fafc;color:#475569}
    `;
    document.head.appendChild(style);
  }

  function installFactoryV2Entry() {
    installFactoryV2Style();
    const actions = document.querySelector(".page-head .head-actions");
    if (!actions || actions.querySelector("[data-factory-v2-entry]")) return false;
    const link = document.createElement("a");
    link.className = "btn secondary fv2-entry";
    link.href = "factory-v2.html";
    link.dataset.factoryV2Entry = "true";
    link.textContent = "FACTORY V2 導入前監査";
    actions.insertAdjacentElement("afterbegin", link);
    return true;
  }

  let gateTimer = null;
  let gateBusy = false;
  let lastGateProject = "";
  let lastGateAt = 0;

  function scheduleFactoryGateCheck(force = false) {
    clearTimeout(gateTimer);
    gateTimer = setTimeout(() => refreshFactoryGate(force), 120);
  }

  async function refreshFactoryGate(force = false) {
    if (gateBusy) return;
    const select = document.getElementById("c8ProjectSelect");
    const board = document.getElementById("c8Board");
    if (!select || !board) return;
    const projectId = select.value;
    if (!projectId) return;

    const now = Date.now();
    if (!force && projectId === lastGateProject && now - lastGateAt < 1500) return;
    gateBusy = true;
    try {
      const sb = await getClient();
      if (!sb) return;
      const { data, error } = await sb.rpc("cc_factory_v2_gate", {
        p_project_id: projectId,
        p_stage: "final",
      });
      if (error) return;

      lastGateProject = projectId;
      lastGateAt = Date.now();

      let banner = document.getElementById("c8FactoryV2Gate");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "c8FactoryV2Gate";
        board.insertAdjacentElement("beforebegin", banner);
      }

      const required = data?.audit_exists === true || data?.required === true;
      const ready = data?.ready === true;
      const pre = Number(data?.prebuild_done || 0);
      const preTotal = Number(data?.prebuild_total || 0);
      const fin = Number(data?.final_done || 0);
      const finTotal = Number(data?.final_total || 0);
      const cls = !required ? "legacy" : ready ? "ready" : "blocked";
      const title = !required
        ? "FACTORY V2：既存レガシー案件（監査未適用）"
        : ready
          ? "FACTORY V2：FINAL PASS"
          : "FACTORY V2：FINAL Gate未完了";
      const detail = !required
        ? "この既存案件は自動Gateの対象外です。必要な場合のみV2監査へ明示的に移行します。"
        : ready
          ? `PREBUILD ${pre}/${preTotal}・FINAL ${fin}/${finTotal}。FACTORY V2最終Gateを通過しています。`
          : `PREBUILD ${pre}/${preTotal}・FINAL ${fin}/${finTotal}。Runtime Truth / Regression / Customer Deployment / Smoke Testを完了してください。`;
      const signature = `${cls}|${title}|${detail}|${projectId}`;
      if (banner.dataset.signature !== signature) {
        banner.className = `fv2-gate-banner ${cls}`;
        banner.dataset.signature = signature;
        banner.innerHTML = `<strong>${esc(title)}</strong><span>${esc(detail)}</span><a href="factory-v2.html?project=${encodeURIComponent(projectId)}">FACTORY V2監査を開く →</a>`;
      }

      // Never enable CENTER-8 from here; only add an additional disable when V2 requires it.
      const activate = document.getElementById("c8Activate");
      if (activate && required && !ready) {
        activate.disabled = true;
        activate.title = "FACTORY V2.0 FINAL Gate未完了";
      }
    } catch (error) {
      console.warn("FACTORY V2 gate bridge skipped", error);
    } finally {
      gateBusy = false;
    }
  }

  installFactoryV2Entry();

  document.addEventListener("change", (event) => {
    if (event.target?.id === "c8ProjectSelect") scheduleFactoryGateCheck(true);
  }, true);

  const observer = new MutationObserver(() => {
    installFactoryV2Entry();
    if (document.getElementById("c8ProjectSelect")) scheduleFactoryGateCheck(false);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
