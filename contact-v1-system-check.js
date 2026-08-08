(() => {
  "use strict";

  const SYSTEM_CHECK_VERSION = "DPRO-CONTACT-1-SYSTEM-CHECK-20260808";
  const EXPECTED_WORKER = "DPRO-CONTACT-1-WORKER-20260808-R2";
  const EXPECTED_DB = "DPRO-CONTACT-1-DB-20260808-R1";
  const EXPECTED_DESIGN = "DPRO-CONTACT-1.0-DESIGN-20260808";

  const CONFIG = window.DPRO_CONTACT_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  let accessToken = "";
  let lastResult = null;
  let supabaseClient = null;

  function text(v, fallback = "") {
    const s = String(v ?? "").trim();
    return s || fallback;
  }

  function setMessage(message, bad = false) {
    const el = $("authMessage");
    el.textContent = message;
    el.style.color = bad ? "#a72e41" : "";
  }

  function apiBase() {
    return text(CONFIG.apiBaseUrl).replace(/\/$/, "");
  }

  async function ensureSupabaseLibrary() {
    if (window.supabase?.createClient) return;
    const src = text(
      CONFIG.auth?.supabaseJsUrl,
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
    );
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Supabase JSを読み込めませんでした"));
      document.head.appendChild(script);
    });
  }

  async function resolvePublicAuthConfig() {
    const auth = CONFIG.auth || {};
    let result = {
      supabaseUrl: text(auth.supabaseUrl),
      supabasePublishableKey: text(auth.supabasePublishableKey),
      sessionStorageKey: text(auth.sessionStorageKey),
    };

    if (text(auth.publicConfigUrl)) {
      const response = await fetch(auth.publicConfigUrl, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `公開設定 HTTP ${response.status}`);
      result.supabaseUrl = text(data.supabaseUrl, result.supabaseUrl);
      result.supabasePublishableKey = text(
        data.supabasePublishableKey || data.supabaseAnonKey,
        result.supabasePublishableKey
      );
      result.sessionStorageKey = text(data.sessionStorageKey, result.sessionStorageKey);
    }

    if (!result.supabaseUrl || !result.supabasePublishableKey) {
      throw new Error("Supabase公開設定が不足しています");
    }
    return result;
  }

  async function resolveToken() {
    const mode = text(CONFIG.auth?.mode, "supabase");

    if (mode === "adapter") {
      const adapter = window.DPRO_CONTACT_AUTH;
      if (!adapter || typeof adapter.getAccessToken !== "function") {
        throw new Error("DPRO_CONTACT_AUTH.getAccessToken() がありません");
      }
      return text(await adapter.getAccessToken());
    }

    await ensureSupabaseLibrary();
    const publicAuth = await resolvePublicAuthConfig();
    supabaseClient = window.supabase.createClient(
      publicAuth.supabaseUrl,
      publicAuth.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          ...(publicAuth.sessionStorageKey ? { storageKey: publicAuth.sessionStorageKey } : {}),
        }
      }
    );

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return text(data?.session?.access_token);
  }

  async function runCheck() {
    if (!apiBase()) {
      setMessage("contact-config.js の apiBaseUrl が未設定です。", true);
      return;
    }

    if (!accessToken) {
      accessToken = await resolveToken();
    }

    if (!accessToken) {
      setMessage("ログインセッションがありません。先にDPRO管理画面へログインしてください。", true);
      return;
    }

    const button = $("runButton");
    button.disabled = true;
    button.textContent = "検査中…";
    setMessage("DPRO CONTACTを一括検査しています…");

    try {
      const response = await fetch(`${apiBase()}/api/contact/system-check`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        cache: "no-store"
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `System Check HTTP ${response.status}`);
      }

      lastResult = data;
      render(data);
      setMessage(
        data.ok
          ? "一括検査が完了しました。重要項目はすべて正常です。"
          : "一括検査が完了しました。FAIL項目を確認してください。",
        !data.ok
      );
    } catch (error) {
      setMessage(`検査できませんでした：${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = "一括チェック";
    }
  }

  function render(data) {
    $("summary").classList.remove("hidden");
    $("checkGrid").classList.remove("hidden");
    $("details").classList.remove("hidden");

    $("overall").textContent = data.ok ? "PASS" : "FAIL";
    $("overall").style.color = data.ok ? "#087a55" : "#b63247";
    $("workerVersion").textContent = text(data.worker?.version, "—");
    $("dbVersion").textContent = text(data.database?.meta?.moduleVersion, "—");
    $("webhookState").textContent = webhookLabel(data.channel);

    const definitions = [
      ["workerVersion", "Workerバージョン", data.worker?.version === EXPECTED_WORKER, EXPECTED_WORKER],
      ["databaseVersion", "DBバージョン", data.checks?.databaseVersion === true && data.database?.meta?.moduleVersion === EXPECTED_DB, EXPECTED_DB],
      ["tableSecurity", "RLS・DB権限", data.checks?.tableSecurity === true, "5テーブル / RLS ON / browser SELECT禁止"],
      ["anonDirectAccessBlocked", "anon直接アクセス", data.checks?.anonDirectAccessBlocked === true, "ブロック必須"],
      ["authenticatedDirectAccessBlocked", "authenticated直接アクセス", data.checks?.authenticatedDirectAccessBlocked === true, "ブロック必須"],
      ["environmentComplete", "Variables / Secrets", data.checks?.environmentComplete === true, "必要項目の存在のみ検査"],
      ["corsExplicit", "CORS", data.checks?.corsExplicit === true, "ワイルドカード禁止"],
      ["encryptionRoundTrip", "暗号化", data.checks?.encryptionRoundTrip === true, "AES-GCM 往復検査"],
      ["channelExists", "LINEチャネル", data.checks?.channelExists === true, text(data.channel?.status, "missing")],
      ["lineCredential", "LINE Access Token", data.checks?.lineCredential === true, data.line?.skipped ? "LINE無効のためスキップ" : text(data.line?.displayName, "API疎通")],
    ];

    const grid = $("checkGrid");
    grid.innerHTML = "";
    for (const [, label, pass, detail] of definitions) {
      const div = document.createElement("article");
      div.className = `sc-check ${pass ? "ok" : "bad"}`;
      div.innerHTML = `
        <span class="sc-icon">${pass ? "PASS" : "FAIL"}</span>
        <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>
      `;
      grid.appendChild(div);
    }

    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const warningBox = $("warningBox");
    warningBox.classList.toggle("hidden", warnings.length === 0);
    warningBox.textContent = warnings.length ? `注意\n${warnings.join("\n")}` : "";

    const details = [
      ["System Check", text(data.systemCheckVersion, SYSTEM_CHECK_VERSION)],
      ["Design", text(data.worker?.designVersion, "—")],
      ["Tenant", text(data.tenant?.tenantCode, "—")],
      ["System", text(data.tenant?.systemCode, "—")],
      ["Channel", text(data.tenant?.channelCode, "—")],
      ["Channel status", text(data.channel?.status, "—")],
      ["Last webhook", text(data.channel?.lastWebhookAt, "未受信")],
      ["Webhook age", data.channel?.webhookAgeMinutes == null ? "—" : `${data.channel.webhookAgeMinutes}分`],
      ["Delivery failures / 24h", String(data.delivery?.failedLast24h ?? "—")],
      ["CORS origins", Array.isArray(data.cors?.origins) ? data.cors.origins.join(", ") : "—"],
      ["Operator role", text(data.operator?.roleKey, "—")],
      ["Checked at", text(data.checkedAt, "—")],
    ];

    const dl = $("detailList");
    dl.innerHTML = "";
    for (const [key, value] of details) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      dl.append(dt, dd);
    }

    $("rawJson").textContent = JSON.stringify(data, null, 2);
    $("checkedAt").textContent = text(data.checkedAt, "未実行");
  }

  function webhookLabel(channel) {
    const state = text(channel?.webhookState, "never");
    if (state === "recent") return "24h以内";
    if (state === "stale") return "24h超";
    return "未受信";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  $("runButton").addEventListener("click", () => runCheck().catch((e) => setMessage(e.message, true)));
  $("toggleRaw").addEventListener("click", () => {
    const raw = $("rawJson");
    const hidden = raw.classList.toggle("hidden");
    $("toggleRaw").textContent = hidden ? "JSONを表示" : "JSONを隠す";
  });

  $("backLink").href = "contact-v1.html";

  resolveToken()
    .then((token) => {
      accessToken = token;
      if (token) {
        setMessage("ログイン確認済み。一括チェックを実行できます。");
      } else {
        setMessage("ログインセッションがありません。", true);
      }
    })
    .catch((error) => setMessage(`認証確認エラー：${error.message}`, true));
})();
