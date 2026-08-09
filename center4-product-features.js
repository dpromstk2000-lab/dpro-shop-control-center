(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-16-CENTER4-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    products: [],
    features: [],
    rows: [],
    summaries: [],
    selectedSystem: localStorage.getItem("dpro_center4_feature_system") || "",
    statusFilter: "all",
    search: "",
    loaded: false,
  };

  const statuses = {
    unknown: { label:"要確認", tone:"gray", help:"まだ製品原本を確認していない" },
    implemented: { label:"実装済", tone:"green", help:"現在の製品原本に実装済み" },
    standard_ready: { label:"標準部品あり", tone:"blue", help:"共通部品を契約時に適用できる" },
    contract_build: { label:"契約時実装", tone:"amber", help:"契約内容に応じて追加制作する" },
    planned: { label:"実装予定", tone:"amber", help:"将来の標準実装予定" },
    not_applicable: { label:"対象外", tone:"red", help:"この製品では通常利用しない" },
  };

  const categoryLabels = {
    security:"認証・セキュリティ",
    customer:"お客様機能",
    operation:"店舗運用",
    integration:"外部連携",
    system:"業種専用",
    general:"共通",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function toast(message, error=false) {
    let el = $("center4Toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "center4Toast";
      el.className = "center4-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  function installStyle() {
    if ($("center4Style")) return;
    const style = document.createElement("style");
    style.id = "center4Style";
    style.textContent = `
      .center4-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:14px}
      .center4-head h2{margin:0;font-size:23px}.center4-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .center4-toolbar{display:grid;grid-template-columns:minmax(260px,1.2fr) minmax(220px,1fr) 190px auto;gap:9px;align-items:center;margin:14px 0}
      .center4-toolbar select,.center4-toolbar input,.center4-row select,.center4-row input{min-height:42px;border:1px solid #d9e5e0;border-radius:10px;background:#fff;padding:0 11px;color:#15251f}
      .center4-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:12px 0}
      .center4-metric{padding:12px;background:#fff;border:1px solid #d9e5e0;border-radius:13px}
      .center4-metric b,.center4-metric span{display:block}.center4-metric b{font-size:21px;color:#0b5f49}.center4-metric span{margin-top:3px;color:#66756f;font-size:9px}
      .center4-guide{padding:13px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:10px;line-height:1.7}
      .center4-table-wrap{overflow:auto;background:#fff;border:1px solid #d9e5e0;border-radius:17px}
      .center4-table{width:100%;border-collapse:collapse;min-width:920px}
      .center4-table th,.center4-table td{padding:10px 11px;border-bottom:1px solid #edf1ef;text-align:left;vertical-align:top;font-size:10px}
      .center4-table th{background:#f5f8f6;color:#52635c;font-size:9px;white-space:nowrap}
      .center4-feature strong{display:block;font-size:10px}.center4-feature small{display:block;margin-top:3px;color:#75827d;font-size:8px;line-height:1.5}
      .center4-status{min-width:145px}.center4-version{min-width:150px}.center4-note{min-width:260px;width:100%}
      .center4-pill{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;background:#eef2f0;color:#65736d}
      .center4-pill.green{background:#def5ea;color:#087253}.center4-pill.blue{background:#edf6ff;color:#2568a8}.center4-pill.amber{background:#fff7e5;color:#9b6500}.center4-pill.red{background:#fff0f3;color:#b63247}
      .center4-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:12px}
      .center4-empty{padding:34px;text-align:center;color:#66756f;background:#fff;border:1px dashed #bfd0c8;border-radius:15px}
      .center4-toast{position:fixed;right:18px;bottom:18px;z-index:150;padding:13px 16px;border-radius:11px;background:#0b5f49;color:#fff;box-shadow:0 16px 46px rgba(0,0,0,.2);font-size:11px;font-weight:800;opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s}.center4-toast.show{opacity:1;transform:none}.center4-toast.error{background:#a92e42}
      @media(max-width:1100px){.center4-summary{grid-template-columns:repeat(3,1fr)}.center4-toolbar{grid-template-columns:1fr 1fr}}
      @media(max-width:700px){.center4-head{display:block}.center4-toolbar{grid-template-columns:1fr}.center4-summary{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs = document.querySelector("#view-products .product-tabs");
    if (!tabs || $("product-panel-features")) return false;

    const tab = document.createElement("button");
    tab.className = "product-tab";
    tab.type = "button";
    tab.dataset.productTab = "features";
    tab.dataset.center4Tab = "true";
    tab.textContent = "Feature実装状況";
    tabs.appendChild(tab);

    const panel = document.createElement("section");
    panel.id = "product-panel-features";
    panel.className = "product-panel hidden";
    panel.innerHTML = `
      <div class="center4-head">
        <div>
          <h2>製品別 Feature 実装状況</h2>
          <p>予約・写真・共通認証などが「実装済／標準部品／契約時実装」のどれかを製品原本ごとに記録します。</p>
        </div>
        <span class="center4-pill blue">CENTER-4</span>
      </div>
      <div class="center4-guide">
        「要確認」は未登録の状態です。推測で実装済みにせず、現在の製品原本を確認したものだけ登録します。
        保存すると、その製品を使っている契約案件の制作タスクも自動で再計算されます。
      </div>
      <div class="center4-toolbar">
        <select id="center4ProductSelect"><option value="">DPRO製品を選択</option></select>
        <input id="center4Search" type="search" placeholder="Feature名・説明で絞り込み">
        <select id="center4StatusFilter">
          <option value="all">すべての状態</option>
          <option value="unknown">要確認のみ</option>
          <option value="implemented">実装済</option>
          <option value="standard_ready">標準部品あり</option>
          <option value="contract_build">契約時実装</option>
          <option value="planned">実装予定</option>
          <option value="not_applicable">対象外</option>
        </select>
        <button id="center4Reload" class="btn btn-secondary" type="button">再読込</button>
      </div>
      <div id="center4Summary" class="center4-summary"></div>
      <div id="center4Board"></div>
      <div class="center4-actions">
        <button id="center4Save" class="btn btn-primary" type="button">Feature実装状況を保存</button>
      </div>
    `;

    const currentPanel = $("product-panel-rollout");
    if (currentPanel) currentPanel.insertAdjacentElement("afterend", panel);
    else tabs.insertAdjacentElement("afterend", panel);

    tab.addEventListener("click", async () => {
      $$("#view-products .product-tab").forEach((b) => b.classList.toggle("active", b === tab));
      $$("#view-products .product-panel").forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if (!state.loaded) await loadData();
    });

    $("center4ProductSelect").addEventListener("change", () => {
      state.selectedSystem = $("center4ProductSelect").value;
      localStorage.setItem("dpro_center4_feature_system", state.selectedSystem);
      render();
    });
    $("center4Search").addEventListener("input", () => {
      state.search = $("center4Search").value.trim().toLowerCase();
      renderBoard();
    });
    $("center4StatusFilter").addEventListener("change", () => {
      state.statusFilter = $("center4StatusFilter").value;
      renderBoard();
    });
    $("center4Reload").addEventListener("click", loadData);
    $("center4Save").addEventListener("click", saveMatrix);

    return true;
  }

  async function getClient() {
    if (state.supabase) return state.supabase;
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-config`, { cache:"no-store" });
    const pub = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(pub.message || pub.error || `HTTP ${response.status}`);
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めません。");

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

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    state.session = sessionData.session;
    if (!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");

    const { data: aalData } = await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== "aal2") throw new Error("二段階認証を完了してください。");

    const { data: staff, error: staffError } = await state.supabase
      .from("cc_staff")
      .select("id,role_key,status")
      .eq("auth_user_id", state.session.user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") throw new Error("有効なDPROスタッフではありません。");
    state.staff = staff;
    return state.supabase;
  }

  async function loadProducts() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/products/overview`, {
      cache:"no-store",
      headers:{ authorization:`Bearer ${state.session?.access_token || ""}` }
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.products) ? data.products : [];
  }

  async function loadData() {
    try {
      const sb = await getClient();
      const [featuresResult, rowsResult, summariesResult] = await Promise.all([
        sb.from("cc_feature_catalog").select("*").eq("is_active",true).order("sort_order"),
        sb.from("cc_system_feature_implementations").select("*").order("system_code").order("feature_code"),
        sb.from("cc_v_system_feature_implementation_summary").select("*").order("system_code"),
      ]);
      for (const r of [featuresResult, rowsResult, summariesResult]) if (r.error) throw r.error;

      state.features = featuresResult.data || [];
      state.rows = rowsResult.data || [];
      state.summaries = summariesResult.data || [];
      state.products = await loadProducts();
      state.loaded = true;

      const select = $("center4ProductSelect");
      const sorted = [...state.products].sort((a,b) => Number(a.product_number||999)-Number(b.product_number||999));
      select.innerHTML = '<option value="">DPRO製品を選択</option>' + sorted.map((p) =>
        `<option value="${esc(p.system_code)}">${esc(String(p.product_number||"").padStart(2,"0"))}｜${esc(p.product_name)}（${esc(p.system_code)}）</option>`
      ).join("");

      if (!state.selectedSystem || !sorted.some((p) => p.system_code === state.selectedSystem)) {
        state.selectedSystem = sorted[0]?.system_code || "";
      }
      select.value = state.selectedSystem;
      render();
      toast("Feature実装状況を読み込みました。");
    } catch (error) {
      console.error(BUILD, error);
      $("center4Board").innerHTML = `<div class="center4-empty">${esc(error.message || "Feature実装状況を読み込めませんでした。")}</div>`;
      toast(error.message || "読み込みに失敗しました。", true);
    }
  }

  function rowMapForSelected() {
    return new Map(
      state.rows
        .filter((x) => String(x.system_code||"").toUpperCase() === String(state.selectedSystem||"").toUpperCase())
        .map((x) => [x.feature_code,x])
    );
  }

  function render() {
    renderSummary();
    renderBoard();
    const save = $("center4Save");
    if (save) save.disabled = !canWrite() || !state.selectedSystem;
  }

  function renderSummary() {
    const map = rowMapForSelected();
    const counts = {
      unknown:0, implemented:0, standard_ready:0, contract_build:0, planned:0, not_applicable:0
    };
    state.features.forEach((f) => {
      const status = map.get(f.feature_code)?.implementation_status || "unknown";
      counts[status] = (counts[status] || 0) + 1;
    });

    $("center4Summary").innerHTML = [
      [counts.unknown,"要確認"],
      [counts.implemented,"実装済"],
      [counts.standard_ready,"標準部品"],
      [counts.contract_build,"契約時実装"],
      [counts.planned,"実装予定"],
      [counts.not_applicable,"対象外"],
    ].map(([v,l]) => `<article class="center4-metric"><b>${v}</b><span>${l}</span></article>`).join("");
  }

  function filteredFeatures() {
    const map = rowMapForSelected();
    return state.features.filter((f) => {
      const row = map.get(f.feature_code);
      const status = row?.implementation_status || "unknown";
      if (state.statusFilter !== "all" && status !== state.statusFilter) return false;
      if (!state.search) return true;
      return `${f.feature_name||""} ${f.feature_code||""} ${f.description||""}`.toLowerCase().includes(state.search);
    });
  }

  function renderBoard() {
    const board = $("center4Board");
    if (!state.selectedSystem) {
      board.innerHTML = '<div class="center4-empty">DPRO製品を選択してください。</div>';
      return;
    }
    const map = rowMapForSelected();
    const features = filteredFeatures();
    if (!features.length) {
      board.innerHTML = '<div class="center4-empty">条件に一致するFeatureはありません。</div>';
      return;
    }

    board.innerHTML = `
      <div class="center4-table-wrap">
        <table class="center4-table">
          <thead><tr><th>Feature</th><th>現在の判定</th><th>実装状況</th><th>確認Version</th><th>確認メモ</th></tr></thead>
          <tbody>
            ${features.map((f) => {
              const row = map.get(f.feature_code) || {};
              const status = row.implementation_status || "unknown";
              const def = statuses[status] || statuses.unknown;
              return `
                <tr data-center4-feature="${esc(f.feature_code)}">
                  <td class="center4-feature">
                    <strong>${esc(f.feature_name)}</strong>
                    <small>${esc(categoryLabels[f.category] || f.category || "")}・${esc(f.feature_code)}<br>${esc(f.description || "")}</small>
                  </td>
                  <td><span class="center4-pill ${esc(def.tone)}">${esc(def.label)}</span><br><small>${esc(def.help)}</small></td>
                  <td>
                    <select class="center4-status" data-center4-status ${canWrite()?"":"disabled"}>
                      ${Object.entries(statuses).map(([value,x]) => `<option value="${value}" ${value===status?"selected":""}>${esc(x.label)}</option>`).join("")}
                    </select>
                  </td>
                  <td><input class="center4-version" data-center4-version value="${esc(row.source_version || "")}" placeholder="例：HAIR-15" ${canWrite()?"":"disabled"}></td>
                  <td><input class="center4-note" data-center4-note value="${esc(row.evidence_note || "")}" placeholder="確認内容・根拠" ${canWrite()?"":"disabled"}></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function saveMatrix() {
    if (!canWrite()) return toast("編集権限がありません。", true);
    if (!state.selectedSystem) return toast("製品を選択してください。", true);

    const button = $("center4Save");
    button.disabled = true;
    button.textContent = "保存・契約案件を再計算中…";

    try {
      const visibleEdits = new Map();
      $$("[data-center4-feature]", $("center4Board")).forEach((tr) => {
        visibleEdits.set(tr.dataset.center4Feature, {
          feature_code: tr.dataset.center4Feature,
          implementation_status: tr.querySelector("[data-center4-status]")?.value || "unknown",
          source_version: tr.querySelector("[data-center4-version]")?.value?.trim() || "",
          evidence_note: tr.querySelector("[data-center4-note]")?.value?.trim() || "",
        });
      });

      // フィルタ中でも非表示Featureを消さない。
      const currentMap = rowMapForSelected();
      const items = state.features.map((f) => {
        if (visibleEdits.has(f.feature_code)) return visibleEdits.get(f.feature_code);
        const row = currentMap.get(f.feature_code);
        return {
          feature_code:f.feature_code,
          implementation_status:row?.implementation_status || "unknown",
          source_version:row?.source_version || "",
          evidence_note:row?.evidence_note || "",
        };
      });

      const sb = await getClient();
      const { data, error } = await sb.rpc("cc_center4_save_system_feature_matrix", {
        p_system_code: state.selectedSystem,
        p_items: items,
      });
      if (error) throw error;

      await loadData();
      toast(`保存しました。契約案件 ${Number(data?.projects_refreshed || 0)}件を再計算しました。`);
    } catch (error) {
      toast(error.message || "Feature実装状況を保存できませんでした。", true);
    } finally {
      button.disabled = !canWrite() || !state.selectedSystem;
      button.textContent = "Feature実装状況を保存";
    }
  }

  function boot() {
    installStyle();
    if (installPanel()) return;

    const observer = new MutationObserver(() => {
      if (installPanel()) observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(() => observer.disconnect(),12000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
