(() => {
  "use strict";

  const BUILD = "DPRO-CONTROL-CENTER-FACTORY-V2-GATE-R1-20260919";
  const EXPECTED_FACTORY_VERSION = "V2.0";
  const EXPECTED_PACKAGE_SHA = "2e8b7cb07e33fe861b0c4829af197962560e2e62226bc6340d43436f254d2137";
  const EXPECTED_LOCK_SHA = "ccf25b5f0bc7250e4080d8f561314a53338dcfaec44fb14c138da65b4b06ec59";

  const state = {
    supabase: null,
    session: null,
    staff: null,
    projects: [],
    overview: [],
    selectedProjectId: "",
    brushup: null,
  };

  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => $(id)?.classList.toggle("hidden", !visible);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
  const fmt = (value) => value ? new Date(value).toLocaleString("ja-JP") : "—";
  const shortHash = (value) => value ? `${String(value).slice(0,12)}…${String(value).slice(-8)}` : "—";

  function toast(message, error = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `fv2-toast${error ? " error" : ""}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => show("toast", false), 4200);
  }

  async function publicConfig() {
    const cfg = window.DPRO_CONTROL_CENTER_CONFIG || {};
    const base = String(cfg.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("CONTROL CENTER API設定を確認できません。");
    const response = await fetch(`${base}/api/public-config`, { cache:"no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "公開設定を取得できませんでした。");
    return data;
  }

  function projectById(id) {
    return state.projects.find((p) => p.id === id) || null;
  }

  function overviewById(id) {
    return state.overview.find((x) => x.project_id === id) || null;
  }

  function identityOk(audit) {
    return audit?.factory_version === EXPECTED_FACTORY_VERSION
      && audit?.factory_package_sha256 === EXPECTED_PACKAGE_SHA
      && audit?.factory_lock_record_sha256 === EXPECTED_LOCK_SHA;
  }

  async function boot() {
    try {
      $("loadingText").textContent = `${BUILD} / 接続確認中…`;
      const pub = await publicConfig();
      if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");

      state.supabase = window.supabase.createClient(
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

      const { data:{ session } } = await state.supabase.auth.getSession();
      state.session = session;
      if (!session) {
        show("loadingPanel", false); show("authNotice", true); return;
      }

      const { data:staff, error:staffError } = await state.supabase
        .from("cc_staff")
        .select("id,display_name,role_key,status")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff || staff.status !== "active" || !["owner_admin","technical_admin","support"].includes(staff.role_key)) {
        show("loadingPanel", false); show("authNotice", true);
        $("authNotice").querySelector("p").textContent = "この監査画面に必要なDPROスタッフ権限がありません。";
        return;
      }
      state.staff = staff;

      bind();
      await loadBase();
      show("loadingPanel", false);
      show("appPanel", true);
    } catch (error) {
      $("loadingText").textContent = error?.message || "FACTORY V2監査を読み込めませんでした。";
      toast(error?.message || "初期化に失敗しました。", true);
    }
  }

  function bind() {
    $("projectSelect").addEventListener("change", async (event) => {
      state.selectedProjectId = event.target.value;
      syncUrl();
      await loadSelected();
    });
    $("reloadButton").addEventListener("click", async () => {
      await loadBase(true);
      toast("FACTORY V2監査状態を更新しました。");
    });
    $("enrollButton").addEventListener("click", enrollLegacy);
  }

  async function loadBase(keepSelection = false) {
    const previous = keepSelection ? state.selectedProjectId : "";
    const [projectsResult, overviewResult] = await Promise.all([
      state.supabase
        .from("cc_v_delivery_project_overview_v2")
        .select("id,project_code,project_name,client_code,client_name,effective_system_code,effective_system_name,standard_version,status,created_at,updated_at")
        .order("updated_at", { ascending:false }),
      state.supabase.rpc("cc_factory_v2_list_overview"),
    ]);
    if (projectsResult.error) throw projectsResult.error;
    if (overviewResult.error) throw overviewResult.error;
    state.projects = projectsResult.data || [];
    state.overview = Array.isArray(overviewResult.data) ? overviewResult.data : [];

    renderProjectOptions();

    const queryId = new URLSearchParams(location.search).get("project") || "";
    const candidate = previous || queryId;
    state.selectedProjectId = state.projects.some((p) => p.id === candidate) ? candidate : "";
    $("projectSelect").value = state.selectedProjectId;
    await loadSelected();
  }

  function renderProjectOptions() {
    const options = state.projects.map((p) => {
      const ov = overviewById(p.id);
      const gate = !ov ? "既存・V2未適用" : ov.final_ready ? "FINAL PASS" : ov.prebuild_ready ? "PREBUILD PASS" : "V2監査中";
      const system = p.effective_system_name || p.effective_system_code || "製品未設定";
      return `<option value="${esc(p.id)}">${esc(p.client_name)}｜${esc(p.project_name)}｜${esc(system)}｜${esc(gate)}</option>`;
    }).join("");
    $("projectSelect").innerHTML = `<option value="">制作案件を選択</option>${options}`;
  }

  function syncUrl() {
    const url = new URL(location.href);
    if (state.selectedProjectId) url.searchParams.set("project", state.selectedProjectId);
    else url.searchParams.delete("project");
    history.replaceState(null, "", url);
  }

  async function loadSelected() {
    state.brushup = null;
    const id = state.selectedProjectId;
    show("projectSummary", Boolean(id));
    show("legacyPanel", false);
    show("auditPanel", false);
    setMetrics(null);
    if (!id) {
      $("projectSummary").innerHTML = "";
      return;
    }

    const p = projectById(id);
    const ov = overviewById(id);
    $("projectSummary").innerHTML = [
      `<span><strong>${esc(p?.client_name || "—")}</strong></span>`,
      `<span>制作：<strong>${esc(p?.project_code || "—")}</strong></span>`,
      `<span>製品：<strong>${esc(p?.effective_system_name || p?.effective_system_code || "未設定")}</strong></span>`,
      `<span>DPRO STANDARD：<strong>${esc(p?.standard_version || "—")}</strong></span>`,
      `<span>案件状態：<strong>${esc(p?.status || "—")}</strong></span>`,
    ].join("");

    if (!ov) {
      show("legacyPanel", true);
      return;
    }

    await openAudit(id);
  }

  async function enrollLegacy() {
    const id = state.selectedProjectId;
    if (!id) return;
    if (!confirm("この既存案件をFACTORY V2.0監査対象にします。以後、PREBUILD / FINAL Gateが適用されます。よろしいですか？")) return;
    const button = $("enrollButton");
    button.disabled = true; button.textContent = "V2監査を開始中…";
    try {
      const { data, error } = await state.supabase.rpc("cc_factory_v2_get_brushup", { p_project_id:id });
      if (error) throw error;
      state.brushup = data;
      await refreshOverview();
      show("legacyPanel", false);
      show("auditPanel", true);
      renderAudit();
      toast("FACTORY V2.0監査対象に移行しました。");
    } catch (error) {
      toast(error?.message || "V2監査を開始できませんでした。", true);
    } finally {
      button.disabled = false; button.textContent = "この案件をV2監査対象にする";
    }
  }

  async function refreshOverview() {
    const { data, error } = await state.supabase.rpc("cc_factory_v2_list_overview");
    if (error) throw error;
    state.overview = Array.isArray(data) ? data : [];
    renderProjectOptions();
    $("projectSelect").value = state.selectedProjectId;
  }

  async function openAudit(id) {
    const { data, error } = await state.supabase.rpc("cc_factory_v2_get_brushup", { p_project_id:id });
    if (error) throw error;
    state.brushup = data;
    show("auditPanel", true);
    renderAudit();
  }

  function setMetrics(summary) {
    $("metricPrebuild").textContent = summary ? `${Number(summary.prebuild_done || 0)}/${Number(summary.prebuild_total || 0)}` : "—";
    $("metricFinal").textContent = summary ? `${Number(summary.final_done || 0)}/${Number(summary.final_total || 0)}` : "—";
    $("metricAction").textContent = summary ? String(Number(summary.action_required || 0)) : "—";
  }

  function renderAudit() {
    const data = state.brushup || {};
    const audit = data.audit || {};
    const summary = data.summary || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const ok = identityOk(audit);
    setMetrics(summary);

    $("identityPill").className = `fv2-pill ${ok ? "ready" : "danger"}`;
    $("identityPill").textContent = ok ? "IDENTITY PASS" : "IDENTITY MISMATCH";
    $("identityGrid").innerHTML = [
      ["FACTORY VERSION", audit.factory_version || "—"],
      ["PACKAGE SHA256", shortHash(audit.factory_package_sha256)],
      ["FINAL LOCK SHA256", shortHash(audit.factory_lock_record_sha256)],
      ["監査作成", fmt(audit.created_at)],
      ["最終更新", fmt(audit.updated_at)],
      ["Project ID", audit.project_id || "—"],
    ].map(([label,value]) => `<article><small>${esc(label)}</small><code>${esc(value)}</code></article>`).join("");

    const preReady = Boolean(summary.prebuild_ready && ok);
    const finalReady = Boolean(summary.final_ready && ok);
    const preDone = Number(summary.prebuild_done || 0), preTotal = Number(summary.prebuild_total || 0);
    const finDone = Number(summary.final_done || 0), finTotal = Number(summary.final_total || 0);

    $("prebuildPill").className = `fv2-pill ${preReady ? "ready" : "blocked"}`;
    $("prebuildPill").textContent = preReady ? `PASS ${preDone}/${preTotal}` : `${preDone}/${preTotal}`;
    $("finalPill").className = `fv2-pill ${finalReady ? "ready" : "blocked"}`;
    $("finalPill").textContent = finalReady ? `PASS ${finDone}/${finTotal}` : `${finDone}/${finTotal}`;
    show("prebuildNext", preReady);
    show("finalNext", finalReady);
    show("finalLockNotice", !preReady);

    renderItems("prebuildItems", items.filter((x) => x.stage === "prebuild"), false);
    renderItems("finalItems", items.filter((x) => x.stage === "final"), !preReady);
  }

  function renderItems(hostId, items, locked) {
    const host = $(hostId);
    host.innerHTML = items.map((item) => {
      const status = item.status || "pending";
      const statusLabel = status === "pass" ? "PASS" : status === "action_required" ? "要対応" : status === "na" ? "N/A" : "未確認";
      const disabled = locked ? "disabled" : "";
      return `
        <article class="fv2-item" data-item-code="${esc(item.item_code)}" data-status="${esc(status)}" aria-disabled="${locked ? "true" : "false"}">
          <div class="fv2-item-head">
            <div><span class="fv2-item-code">${esc(item.item_code)}</span><h3>${esc(item.title)}</h3></div>
            <span class="fv2-pill ${status === "pass" ? "ready" : status === "action_required" ? "blocked" : "neutral"}">${esc(statusLabel)}</span>
          </div>
          <p class="fv2-item-detail">${esc(item.detail)}</p>
          <div class="fv2-item-grid">
            <label><span>判定</span><select data-field="status" ${disabled}>
              <option value="pending" ${status === "pending" ? "selected" : ""}>未確認</option>
              <option value="pass" ${status === "pass" ? "selected" : ""}>PASS</option>
              <option value="action_required" ${status === "action_required" ? "selected" : ""}>要対応</option>
              <option value="na" ${status === "na" ? "selected" : ""}>N/A</option>
            </select></label>
            <label><span>メモ / 判断理由</span><textarea data-field="note" ${disabled} placeholder="差分・N/A理由・対応内容">${esc(item.note || "")}</textarea></label>
            <label><span>Evidence *</span><textarea data-field="evidence" ${disabled} placeholder="Git SHA / URL / version / QA結果 / 確認根拠">${esc(item.evidence || "")}</textarea></label>
            <button class="btn secondary fv2-save" type="button" data-save-item="${esc(item.item_code)}" ${disabled}>保存</button>
          </div>
        </article>`;
    }).join("");

    host.querySelectorAll("[data-save-item]").forEach((button) => {
      button.addEventListener("click", () => saveItem(button.dataset.saveItem, button));
    });
  }

  async function saveItem(itemCode, button) {
    const card = button.closest(".fv2-item");
    const status = card.querySelector('[data-field="status"]').value;
    const note = card.querySelector('[data-field="note"]').value.trim();
    const evidence = card.querySelector('[data-field="evidence"]').value.trim();

    if (status === "pass" && !evidence) return toast("PASSにはEvidenceを入力してください。", true);
    if (status === "na" && !note) return toast("N/Aには判断理由を入力してください。", true);
    if (status === "action_required" && !note) return toast("要対応には対応内容を入力してください。", true);

    const old = button.textContent;
    button.disabled = true; button.textContent = "保存中…";
    try {
      const { data, error } = await state.supabase.rpc("cc_factory_v2_update_item", {
        p_project_id: state.selectedProjectId,
        p_item_code: itemCode,
        p_status: status,
        p_note: note || null,
        p_evidence: evidence || null,
      });
      if (error) throw error;
      state.brushup = data;
      await refreshOverview();
      renderAudit();
      toast(`${itemCode} を保存しました。`);
    } catch (error) {
      toast(error?.message || "監査項目を保存できませんでした。", true);
    } finally {
      button.disabled = false; button.textContent = old;
    }
  }

  window.addEventListener("DOMContentLoaded", boot, { once:true });
})();
