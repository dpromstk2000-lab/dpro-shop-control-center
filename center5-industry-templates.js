(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-17-CENTER5-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    products: [],
    features: [],
    templates: [],
    templateFeatures: [],
    implementations: [],
    selectedSystem:
      localStorage.getItem("dpro_center5_template_system") ||
      localStorage.getItem("dpro_center4_feature_system") ||
      "",
    draft: new Map(),
    templateMeta: null,
    loaded: false,
    search: "",
    levelFilter: "all",
  };

  const levels = {
    required:    { label:"必須",       short:"◎ 必須",     tone:"green", defaultOn:true,  help:"この業種では原則ON" },
    recommended: { label:"おすすめ",   short:"○ おすすめ", tone:"blue",  defaultOn:true,  help:"標準ではONを推奨" },
    optional:    { label:"任意",       short:"△ 任意",     tone:"gray",  defaultOn:false, help:"店舗により選択" },
    off:         { label:"標準OFF",    short:"OFF",        tone:"red",   defaultOn:false, help:"通常は使わない" },
  };

  const implLabels = {
    unknown:"要確認",
    implemented:"実装済",
    standard_ready:"標準部品あり",
    contract_build:"契約時実装",
    planned:"実装予定",
    not_applicable:"対象外",
  };

  const implTones = {
    implemented:"green",
    standard_ready:"blue",
    contract_build:"amber",
    planned:"amber",
    not_applicable:"red",
    unknown:"gray",
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

  function cloneJson(value) {
    try { return JSON.parse(JSON.stringify(value || {})); }
    catch { return {}; }
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  function toast(message, error=false) {
    let el = $("center5Toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "center5Toast";
      el.className = "center5-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3800);
  }

  function pill(text, tone="gray") {
    return `<span class="center5-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  function installStyle() {
    if ($("center5Style")) return;
    const style = document.createElement("style");
    style.id = "center5Style";
    style.textContent = `
      .center5-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:14px}
      .center5-head h2{margin:0;font-size:23px}.center5-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .center5-guide{padding:13px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:10px;line-height:1.75}
      .center5-warning{margin-top:9px;padding:12px 14px;border:1px solid #efd79a;border-radius:12px;background:#fff8e8;color:#7b5700;font-size:9px;line-height:1.65}
      .center5-toolbar{display:grid;grid-template-columns:minmax(260px,1.15fr) minmax(220px,1fr) 180px auto;gap:9px;align-items:center;margin:14px 0}
      .center5-toolbar select,.center5-toolbar input,.center5-meta input,.center5-meta textarea,.center5-row select,.center5-row input{min-height:42px;border:1px solid #d9e5e0;border-radius:10px;background:#fff;padding:0 11px;color:#15251f}
      .center5-meta{display:grid;grid-template-columns:1fr 140px;gap:9px;margin:11px 0}.center5-meta label{display:grid;gap:5px;color:#64736d;font-size:9px;font-weight:800}.center5-meta .full{grid-column:1/-1}.center5-meta textarea{padding:10px 11px;min-height:70px;resize:vertical}
      .center5-template-code{display:flex;gap:8px;align-items:center;margin:5px 0 12px;color:#66756f;font-size:9px}
      .center5-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:12px 0}
      .center5-metric{padding:12px;background:#fff;border:1px solid #d9e5e0;border-radius:13px}.center5-metric b,.center5-metric span{display:block}.center5-metric b{font-size:21px;color:#0b5f49}.center5-metric span{margin-top:3px;color:#66756f;font-size:9px}
      .center5-table-wrap{overflow:auto;background:#fff;border:1px solid #d9e5e0;border-radius:17px}.center5-table{width:100%;border-collapse:collapse;min-width:1050px}
      .center5-table th,.center5-table td{padding:10px 11px;border-bottom:1px solid #edf1ef;text-align:left;vertical-align:top;font-size:10px}.center5-table th{background:#f5f8f6;color:#52635c;font-size:9px;white-space:nowrap}
      .center5-feature strong{display:block;font-size:10px}.center5-feature small{display:block;margin-top:3px;color:#75827d;font-size:8px;line-height:1.5}
      .center5-level{min-width:150px}.center5-note{min-width:220px;width:100%}
      .center5-pill{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;background:#eef2f0;color:#65736d}.center5-pill.green{background:#def5ea;color:#087253}.center5-pill.blue{background:#edf6ff;color:#2568a8}.center5-pill.amber{background:#fff7e5;color:#9b6500}.center5-pill.red{background:#fff0f3;color:#b63247}
      .center5-initial{white-space:nowrap;font-size:9px;font-weight:900;color:#52635c}
      .center5-setting{min-width:180px}.center5-setting label{display:flex;align-items:center;gap:6px;font-size:9px;color:#5f6d67}.center5-setting select{min-height:35px;border:1px solid #d9e5e0;border-radius:9px;background:#fff;padding:0 8px;font-size:9px}.center5-setting input[type=checkbox]{width:17px;height:17px;accent-color:#0b5f49}
      .center5-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:12px;flex-wrap:wrap}
      .center5-empty{padding:34px;text-align:center;color:#66756f;background:#fff;border:1px dashed #bfd0c8;border-radius:15px}
      .center5-toast{position:fixed;right:18px;bottom:18px;z-index:160;padding:13px 16px;border-radius:11px;background:#0b5f49;color:#fff;box-shadow:0 16px 46px rgba(0,0,0,.2);font-size:11px;font-weight:800;opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s}.center5-toast.show{opacity:1;transform:none}.center5-toast.error{background:#a92e42}
      @media(max-width:1100px){.center5-summary{grid-template-columns:repeat(3,1fr)}.center5-toolbar{grid-template-columns:1fr 1fr}}
      @media(max-width:700px){.center5-head{display:block}.center5-toolbar,.center5-meta{grid-template-columns:1fr}.center5-meta .full{grid-column:auto}.center5-summary{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs = document.querySelector("#view-products .product-tabs");
    if (!tabs || $("product-panel-recommendations")) return false;

    const tab = document.createElement("button");
    tab.className = "product-tab";
    tab.type = "button";
    tab.dataset.productTab = "recommendations";
    tab.dataset.center5Tab = "true";
    tab.textContent = "業種おすすめ";
    tabs.appendChild(tab);

    const panel = document.createElement("section");
    panel.id = "product-panel-recommendations";
    panel.className = "product-panel hidden";
    panel.innerHTML = `
      <div class="center5-head">
        <div>
          <h2>業種別おすすめテンプレート</h2>
          <p>契約時に「何を勧めるか」を製品ごとに記録し、2店舗目以降のセットアップを速く・確実にします。</p>
        </div>
        ${pill("CENTER-5","blue")}
      </div>

      <div class="center5-guide">
        ◎必須 / ○おすすめ / △任意 / OFF を決めます。
        保存した内容は「契約セットアップ → おすすめを適用」で使われます。
      </div>
      <div class="center5-warning">
        テンプレートを変更しても、すでに契約済みのお客様のFeature設定は自動変更しません。
        既存契約を勝手に変えない安全設計です。
      </div>

      <div class="center5-toolbar">
        <select id="center5ProductSelect"><option value="">DPRO製品を選択</option></select>
        <input id="center5Search" type="search" placeholder="Feature名・説明で絞り込み">
        <select id="center5LevelFilter">
          <option value="all">すべてのおすすめ度</option>
          <option value="required">必須</option>
          <option value="recommended">おすすめ</option>
          <option value="optional">任意</option>
          <option value="off">標準OFF</option>
        </select>
        <button id="center5Reload" class="btn btn-secondary" type="button">再読込</button>
      </div>

      <div class="center5-meta">
        <label>テンプレート名
          <input id="center5TemplateName" placeholder="例：DPRO 美容室 推奨セット">
        </label>
        <label>Version
          <input id="center5TemplateVersion" value="V1.0" placeholder="V1.0">
        </label>
        <label class="full">説明
          <textarea id="center5TemplateDescription" placeholder="契約時にどのような基準で使うテンプレートか"></textarea>
        </label>
      </div>
      <div class="center5-template-code">
        <strong>Template Code:</strong>
        <span id="center5TemplateCode">—</span>
        <span id="center5TemplateState">${pill("未作成","gray")}</span>
      </div>

      <div id="center5Summary" class="center5-summary"></div>
      <div id="center5Board"></div>

      <div class="center5-actions">
        <button id="center5BaseButton" class="btn btn-secondary" type="button">DPRO共通基本から作る</button>
        <a class="btn btn-secondary" href="setup.html">契約セットアップを開く</a>
        <button id="center5Save" class="btn btn-primary" type="button">業種おすすめを保存</button>
      </div>
    `;

    const after = $("product-panel-features") || $("product-panel-rollout");
    if (after) after.insertAdjacentElement("afterend", panel);
    else tabs.insertAdjacentElement("afterend", panel);

    tab.addEventListener("click", async () => {
      $$("#view-products .product-tab").forEach((b) => b.classList.toggle("active", b === tab));
      $$("#view-products .product-panel").forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if (!state.loaded) await loadData();
    });

    $("center5ProductSelect").addEventListener("change", () => {
      state.selectedSystem = $("center5ProductSelect").value;
      localStorage.setItem("dpro_center5_template_system", state.selectedSystem);
      buildDraft();
      render();
    });
    $("center5Search").addEventListener("input", () => {
      state.search = $("center5Search").value.trim().toLowerCase();
      renderBoard();
    });
    $("center5LevelFilter").addEventListener("change", () => {
      state.levelFilter = $("center5LevelFilter").value;
      renderBoard();
    });
    $("center5Reload").addEventListener("click", loadData);
    $("center5BaseButton").addEventListener("click", applyBaseTemplate);
    $("center5Save").addEventListener("click", saveTemplate);

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
      .eq("auth_user_id",state.session.user.id)
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
      const [featuresResult, templatesResult, templateFeaturesResult, implResult] = await Promise.all([
        sb.from("cc_feature_catalog").select("*").eq("is_active",true).order("sort_order"),
        sb.from("cc_industry_templates").select("*").eq("status","current").order("updated_at",{ascending:false}),
        sb.from("cc_industry_template_features").select("*").order("sort_order"),
        sb.from("cc_system_feature_implementations").select("*").order("system_code").order("feature_code"),
      ]);
      for (const r of [featuresResult,templatesResult,templateFeaturesResult,implResult]) {
        if (r.error) throw r.error;
      }

      state.features = featuresResult.data || [];
      state.templates = templatesResult.data || [];
      state.templateFeatures = templateFeaturesResult.data || [];
      state.implementations = implResult.data || [];
      state.products = await loadProducts();
      state.loaded = true;

      const sorted = [...state.products].sort((a,b) => Number(a.product_number||999)-Number(b.product_number||999));
      const select = $("center5ProductSelect");
      select.innerHTML = '<option value="">DPRO製品を選択</option>' + sorted.map((p) =>
        `<option value="${esc(p.system_code)}">${esc(String(p.product_number||"").padStart(2,"0"))}｜${esc(p.product_name)}（${esc(p.system_code)}）</option>`
      ).join("");

      if (!state.selectedSystem || !sorted.some((p) => p.system_code === state.selectedSystem)) {
        state.selectedSystem = sorted[0]?.system_code || "";
      }
      select.value = state.selectedSystem;
      buildDraft();
      render();
      toast("業種おすすめテンプレートを読み込みました。");
    } catch (error) {
      console.error(BUILD,error);
      $("center5Board").innerHTML = `<div class="center5-empty">${esc(error.message || "テンプレートを読み込めませんでした。")}</div>`;
      toast(error.message || "読み込みに失敗しました。",true);
    }
  }

  function selectedProduct() {
    return state.products.find((p) => p.system_code === state.selectedSystem) || null;
  }

  function currentTemplate() {
    const code = String(state.selectedSystem || "").toUpperCase();
    return state.templates.find((t) =>
      String(t.system_code || "").toUpperCase() === code
    ) || null;
  }

  function baseTemplate() {
    return state.templates.find((t) => t.template_code === "DPRO_BASE_V1") || null;
  }

  function rowsForTemplate(templateCode) {
    return state.templateFeatures.filter((x) => x.template_code === templateCode);
  }

  function implFor(featureCode) {
    const code = String(state.selectedSystem || "").toUpperCase();
    return state.implementations.find((x) =>
      String(x.system_code || "").toUpperCase() === code &&
      x.feature_code === featureCode
    ) || null;
  }

  function generatedTemplateCode() {
    return `${String(state.selectedSystem || "DPRO").toUpperCase()}_V1`;
  }

  function buildDraft() {
    state.draft = new Map();
    const tpl = currentTemplate();
    const base = baseTemplate();
    const tplMap = new Map(rowsForTemplate(tpl?.template_code).map((x) => [x.feature_code,x]));
    const baseMap = new Map(rowsForTemplate(base?.template_code).map((x) => [x.feature_code,x]));

    state.features.forEach((f) => {
      const source = tplMap.get(f.feature_code) || baseMap.get(f.feature_code);
      state.draft.set(f.feature_code,{
        feature_code:f.feature_code,
        recommendation_level:source?.recommendation_level || "off",
        setting_json:cloneJson(source?.setting_json),
        note:source?.note || "",
        sort_order:Number(f.sort_order || 100),
      });
    });

    const product = selectedProduct();
    state.templateMeta = {
      template_code:tpl?.template_code || generatedTemplateCode(),
      template_name:tpl?.template_name || `DPRO ${product?.product_name || state.selectedSystem || "製品"} 推奨セット`,
      version_code:tpl?.version_code || "V1.0",
      description:tpl?.description || `${product?.product_name || state.selectedSystem || "対象製品"}の契約時おすすめ構成。DPRO共通基本を土台に、店舗ごとに最終調整する。`,
      exists:Boolean(tpl),
    };
  }

  function render() {
    if (!state.selectedSystem) {
      $("center5Board").innerHTML = '<div class="center5-empty">DPRO製品を選択してください。</div>';
      return;
    }

    $("center5TemplateName").value = state.templateMeta?.template_name || "";
    $("center5TemplateVersion").value = state.templateMeta?.version_code || "V1.0";
    $("center5TemplateDescription").value = state.templateMeta?.description || "";
    $("center5TemplateCode").textContent = state.templateMeta?.template_code || "—";
    $("center5TemplateState").innerHTML = state.templateMeta?.exists
      ? pill("登録済","green")
      : pill("新規作成","amber");

    $("center5Save").disabled = !canWrite();
    $("center5BaseButton").disabled = !canWrite();

    renderSummary();
    renderBoard();
  }

  function renderSummary() {
    const counts = {required:0,recommended:0,optional:0,off:0,initialOn:0,attention:0};

    state.features.forEach((f) => {
      const row = state.draft.get(f.feature_code);
      const level = row?.recommendation_level || "off";
      counts[level] += 1;
      if (levels[level]?.defaultOn) counts.initialOn += 1;

      const impl = implFor(f.feature_code)?.implementation_status || "unknown";
      if (["required","recommended"].includes(level) &&
          ["unknown","contract_build","planned","not_applicable"].includes(impl)) {
        counts.attention += 1;
      }
    });

    $("center5Summary").innerHTML = [
      [counts.required,"必須"],
      [counts.recommended,"おすすめ"],
      [counts.optional,"任意"],
      [counts.off,"標準OFF"],
      [counts.initialOn,"契約時初期ON"],
      [counts.attention,"要確認・制作注意"],
    ].map(([v,l]) => `<article class="center5-metric"><b>${v}</b><span>${esc(l)}</span></article>`).join("");
  }

  function visibleFeatures() {
    return state.features.filter((f) => {
      const row = state.draft.get(f.feature_code);
      if (state.levelFilter !== "all" && row?.recommendation_level !== state.levelFilter) return false;
      if (!state.search) return true;
      return `${f.feature_name||""} ${f.feature_code||""} ${f.description||""}`.toLowerCase().includes(state.search);
    });
  }

  function settingsHtml(featureCode,row) {
    const settings = row?.setting_json || {};

    if (featureCode === "reservation") {
      const current = Number(settings.public_months || 3);
      return `<label>予約公開
        <select data-center5-setting="public_months">
          ${[2,3,4,5,6].map((m) => `<option value="${m}" ${m===current?"selected":""}>${m}か月</option>`).join("")}
        </select>
      </label>`;
    }

    if (featureCode === "business_calendar") {
      const current = Number(settings.owner_edit_months || 12);
      return `<label>編集可能
        <select data-center5-setting="owner_edit_months">
          ${[6,12,18].map((m) => `<option value="${m}" ${m===current?"selected":""}>${m}か月先</option>`).join("")}
        </select>
      </label>`;
    }

    if (featureCode === "customer_photo_share") {
      const checked = settings.share_requires_owner_approval !== false;
      return `<label>
        <input type="checkbox" data-center5-setting="share_requires_owner_approval" ${checked?"checked":""}>
        店舗承認した写真だけ共有
      </label>`;
    }

    return '<span style="color:#91a099;font-size:8px">個別設定なし</span>';
  }

  function renderBoard() {
    const board = $("center5Board");
    const features = visibleFeatures();
    if (!features.length) {
      board.innerHTML = '<div class="center5-empty">条件に一致するFeatureはありません。</div>';
      return;
    }

    board.innerHTML = `
      <div class="center5-table-wrap">
        <table class="center5-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>CENTER-4実装状況</th>
              <th>おすすめ度</th>
              <th>契約時</th>
              <th>標準設定</th>
              <th>おすすめメモ</th>
            </tr>
          </thead>
          <tbody>
            ${features.map((f) => {
              const row = state.draft.get(f.feature_code);
              const level = row?.recommendation_level || "off";
              const impl = implFor(f.feature_code);
              const implStatus = impl?.implementation_status || "unknown";
              return `
                <tr data-center5-feature="${esc(f.feature_code)}">
                  <td class="center5-feature">
                    <strong>${esc(f.feature_name)}</strong>
                    <small>${esc(categoryLabels[f.category] || f.category || "")}・${esc(f.feature_code)}<br>${esc(f.description || "")}</small>
                  </td>
                  <td>
                    ${pill(implLabels[implStatus] || implStatus, implTones[implStatus] || "gray")}
                    <small style="display:block;margin-top:4px;color:#74817c">${esc(impl?.source_version || "")}</small>
                  </td>
                  <td>
                    <select class="center5-level" data-center5-level ${canWrite()?"":"disabled"}>
                      ${Object.entries(levels).map(([value,x]) =>
                        `<option value="${value}" ${value===level?"selected":""}>${esc(x.short)}</option>`
                      ).join("")}
                    </select>
                  </td>
                  <td class="center5-initial">
                    ${levels[level]?.defaultOn ? pill("初期ON","green") : pill("初期OFF","gray")}
                  </td>
                  <td class="center5-setting">
                    ${settingsHtml(f.feature_code,row)}
                  </td>
                  <td>
                    <input class="center5-note" data-center5-note value="${esc(row?.note || "")}" placeholder="契約時の確認ポイント" ${canWrite()?"":"disabled"}>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    $$("[data-center5-feature]",board).forEach((tr) => {
      const featureCode = tr.dataset.center5Feature;
      const levelSelect = tr.querySelector("[data-center5-level]");
      levelSelect?.addEventListener("change",() => {
        const row = state.draft.get(featureCode);
        if (!row) return;
        row.recommendation_level = levelSelect.value;
        renderSummary();
        renderBoard();
      });

      tr.querySelector("[data-center5-note]")?.addEventListener("input",(event) => {
        const row = state.draft.get(featureCode);
        if (row) row.note = event.target.value;
      });

      tr.querySelectorAll("[data-center5-setting]").forEach((control) => {
        control.addEventListener("change",() => {
          const row = state.draft.get(featureCode);
          if (!row) return;
          const key = control.dataset.center5Setting;
          if (control.type === "checkbox") row.setting_json[key] = control.checked;
          else if (/^-?\d+(\.\d+)?$/.test(control.value)) row.setting_json[key] = Number(control.value);
          else row.setting_json[key] = control.value;
        });
      });
    });
  }

  function applyBaseTemplate() {
    if (!canWrite()) return;
    const base = baseTemplate();
    if (!base) return toast("DPRO共通基本セットが見つかりません。",true);

    const baseMap = new Map(rowsForTemplate(base.template_code).map((x) => [x.feature_code,x]));
    state.features.forEach((f) => {
      const src = baseMap.get(f.feature_code);
      const row = state.draft.get(f.feature_code);
      if (!row) return;
      row.recommendation_level = src?.recommendation_level || "off";
      row.setting_json = cloneJson(src?.setting_json);
      row.note = src?.note || "";
    });
    render();
    toast("DPRO共通基本を土台として読み込みました。まだ保存されていません。");
  }

  function collectVisibleEdits() {
    $$("[data-center5-feature]",$("center5Board")).forEach((tr) => {
      const code = tr.dataset.center5Feature;
      const row = state.draft.get(code);
      if (!row) return;

      const level = tr.querySelector("[data-center5-level]");
      if (level) row.recommendation_level = level.value;

      const note = tr.querySelector("[data-center5-note]");
      if (note) row.note = note.value;

      tr.querySelectorAll("[data-center5-setting]").forEach((control) => {
        const key = control.dataset.center5Setting;
        if (control.type === "checkbox") row.setting_json[key] = control.checked;
        else if (/^-?\d+(\.\d+)?$/.test(control.value)) row.setting_json[key] = Number(control.value);
        else row.setting_json[key] = control.value;
      });
    });
  }

  async function saveTemplate() {
    if (!canWrite()) return toast("編集権限がありません。",true);
    if (!state.selectedSystem) return toast("製品を選択してください。",true);

    collectVisibleEdits();

    const templateName = $("center5TemplateName").value.trim();
    const versionCode = $("center5TemplateVersion").value.trim() || "V1.0";
    const description = $("center5TemplateDescription").value.trim();

    if (!templateName) return toast("テンプレート名を入力してください。",true);

    const items = state.features.map((f) => {
      const row = state.draft.get(f.feature_code);
      return {
        feature_code:f.feature_code,
        recommendation_level:row?.recommendation_level || "off",
        setting_json:cloneJson(row?.setting_json),
        note:row?.note || "",
        sort_order:Number(f.sort_order || 100),
      };
    });

    const button = $("center5Save");
    button.disabled = true;
    button.textContent = "保存中…";

    try {
      const sb = await getClient();
      const { data,error } = await sb.rpc("cc_center5_save_industry_template",{
        p_system_code:state.selectedSystem,
        p_template_code:state.templateMeta.template_code,
        p_template_name:templateName,
        p_version_code:versionCode,
        p_description:description,
        p_items:items,
      });
      if (error) throw error;

      await loadData();
      toast(
        `保存しました。必須${Number(data?.required||0)} / おすすめ${Number(data?.recommended||0)} / 任意${Number(data?.optional||0)}。既存契約は変更していません。`
      );
    } catch (error) {
      toast(error.message || "業種おすすめを保存できませんでした。",true);
    } finally {
      button.disabled = !canWrite();
      button.textContent = "業種おすすめを保存";
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  } else {
    boot();
  }
})();
