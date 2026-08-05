(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = {
    publicConfig: null,
    supabase: null,
    session: null,
    staff: null,
    overview: null,
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    support: "DPROサポート",
    technical_admin: "技術管理者",
    read_only: "閲覧専用",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function formatDate(value, includeTime = true) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ja-JP", includeTime
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(date);
  }

  function shortSha(value) {
    return value ? String(value).slice(0, 10) : "—";
  }

  function show(id) {
    ["loadingScreen", "errorScreen", "appShell"].forEach((screen) => {
      $(screen)?.classList.toggle("hidden", screen !== id);
    });
  }

  function setLoading(message) {
    $("loadingMessage").textContent = message || "処理しています。";
    show("loadingScreen");
  }

  function showError(message) {
    $("errorMessage").textContent = message || "監視画面を開けませんでした。";
    show("errorScreen");
  }

  function toast(message, error = false) {
    const element = $("toast");
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.add("hidden"), 3800);
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = text || "処理中…";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  async function api(path, options = {}) {
    const base = String(CONFIG.monitorApiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("監視APIのURLが未設定です。");
    const token = state.session?.access_token;
    if (!token) throw new Error("CONTROL CENTERへログインしてください。");
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function waitForSupabase() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (window.supabase?.createClient) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Supabase接続ライブラリを読み込めませんでした。");
  }

  async function initializeSession() {
    const controlApi = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    if (!controlApi) throw new Error("CONTROL CENTER APIが未設定です。");

    const response = await fetch(`${controlApi}/api/public-config`, { cache: "no-store" });
    const publicConfig = await response.json().catch(() => ({}));
    if (!response.ok || !publicConfig.supabaseUrl) {
      throw new Error("CONTROL CENTERの接続設定を取得できませんでした。");
    }

    state.publicConfig = publicConfig;
    await waitForSupabase();
    state.supabase = window.supabase.createClient(
      publicConfig.supabaseUrl,
      publicConfig.supabasePublishableKey || publicConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: publicConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      },
    );

    const { data: sessionData } = await state.supabase.auth.getSession();
    state.session = sessionData?.session || null;
    if (!state.session?.user) throw new Error("CONTROL CENTERへログインしてから監視画面を開いてください。");

    const { data: aalData, error: aalError } = await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aalData.currentLevel !== "aal2") {
      throw new Error("CONTROL CENTERで二段階認証を完了してください。");
    }

    const { data: staff, error: staffError } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id", state.session.user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") throw new Error("有効なDPROスタッフ権限がありません。");

    state.staff = staff;
    $("staffName").textContent = staff.display_name;
    $("staffRole").textContent = roleLabels[staff.role_key] || staff.role_key;
    $("staffInitial").textContent = (staff.display_name || "D").slice(0, 1);
    $("sideVersion").textContent = `${CONFIG.version || "CONTROL-CENTER-9"} / ${publicConfig.databaseVersion || "DB"}`;
  }

  async function loadOverview() {
    const data = await api("/api/monitor/overview");
    state.overview = data;
    render();
    return data;
  }

  async function runMonitor(websiteId = null, button = null) {
    setBusy(button, true, websiteId ? "確認中…" : "2サイト確認中…");
    try {
      const data = await api("/api/monitor/run", {
        method: "POST",
        body: JSON.stringify({ websiteId }),
      });
      state.overview = data;
      render();
      const errors = Number(data.summary?.error || 0);
      const warnings = Number(data.summary?.warning || 0);
      if (errors) toast(`監視完了：${errors}サイトで異常を確認しました。`, true);
      else if (warnings) toast(`監視完了：${warnings}サイトに確認項目があります。`);
      else toast("2サイトの公開・GitHub・相互リンクは正常です。");
    } catch (error) {
      toast(error.message || "監視を実行できませんでした。", true);
      if (error.status === 401) setTimeout(() => location.assign("index.html"), 1400);
    } finally {
      setBusy(button, false);
    }
  }

  function statusLabel(status, hasCheck = true) {
    if (!hasCheck) return "未確認";
    return { ok: "正常", warning: "要確認", error: "異常" }[status] || "未確認";
  }

  function tone(status, hasCheck = true) {
    if (!hasCheck) return "";
    return ["ok", "warning", "error"].includes(status) ? status : "";
  }

  function checkValue(ok, good, bad, unknown = "未確認") {
    if (ok === true) return `<strong class="ok">${escapeHtml(good)}</strong>`;
    if (ok === false) return `<strong class="error">${escapeHtml(bad)}</strong>`;
    return `<strong>${escapeHtml(unknown)}</strong>`;
  }

  function renderMetrics() {
    const summary = state.overview?.summary || {};
    const metrics = [
      [summary.monitored || 0, "監視対象", "DPRO自社サイト", ""],
      [summary.normal || 0, "正常", "全項目OK", ""],
      [summary.warning || 0, "要確認", "軽微な確認項目", summary.warning ? "warning" : ""],
      [summary.error || 0, "異常", "公開・リンク等", summary.error ? "error" : ""],
      [summary.mutualLinksOk || 0, "相互リンク正常", "2方向", summary.mutualLinksOk === 2 ? "" : "warning"],
      [summary.githubDeploymentsOk || 0, "Pages正常", "最新デプロイ", summary.githubDeploymentsOk === 2 ? "" : "warning"],
    ];
    $("metricGrid").innerHTML = metrics.map(([value, label, note, cls]) => `
      <article class="cc9-metric ${cls}">
        <b>${Number(value).toLocaleString("ja-JP")}</b>
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(note)}</small>
      </article>
    `).join("");
  }

  function renderSites() {
    const items = state.overview?.items || [];
    $("siteGrid").innerHTML = items.length ? items.map((item) => {
      const check = item.latestCheck;
      const summary = check?.summary || {};
      const currentStatus = check?.status || "unknown";
      const hasCheck = Boolean(check);
      const publicInfo = summary.public || {};
      const github = summary.github || {};
      const mutual = summary.mutualLink || {};
      const errors = [
        ...(summary.hardErrors || []),
        ...(summary.warnings || []),
      ];
      const publicUrl = safeUrl(item.publicUrl);
      const repoUrl = safeUrl(item.repository?.url);
      return `
        <article class="cc9-site-card status-${tone(currentStatus, hasCheck)}">
          <div class="cc9-card-head">
            <div>
              <small>${escapeHtml(item.assetKey || "DPRO SELF-OWNED ASSET")}</small>
              <h2>${escapeHtml(item.websiteName)}</h2>
              <p>${escapeHtml(item.releaseLabel || "バージョン未設定")} / ${escapeHtml(item.repository?.fullName || "GitHub未登録")}</p>
            </div>
            <span class="cc9-status ${tone(currentStatus, hasCheck)}">${statusLabel(currentStatus, hasCheck)}</span>
          </div>

          <div class="cc9-check-grid">
            <div class="cc9-check"><span>公開URL</span>${checkValue(hasCheck ? publicInfo.ok : null, `HTTP ${publicInfo.status || 200} / ${publicInfo.responseMs || 0}ms`, "公開エラー")}</div>
            <div class="cc9-check"><span>HTTPS・SSL</span>${checkValue(hasCheck ? summary.ssl?.ok : null, "正常", "異常")}</div>
            <div class="cc9-check"><span>相互リンク</span>${checkValue(hasCheck ? mutual.ok : null, "正常", "リンク未確認")}</div>
            <div class="cc9-check"><span>GitHub最新コミット</span>${checkValue(hasCheck ? github.ok : null, shortSha(github.commitSha || item.repository?.lastCommitSha), "取得エラー")}</div>
            <div class="cc9-check"><span>Pagesデプロイ</span>${checkValue(hasCheck ? github.pagesConclusion === "success" : null, "成功", github.pagesConclusion || "要確認")}</div>
            <div class="cc9-check"><span>確認用URL</span>${item.verificationUrl ? checkValue(hasCheck ? summary.verification?.ok : null, "正常", "確認エラー") : "<strong>対象なし</strong>"}</div>
          </div>

          <div class="cc9-url">公開：${publicUrl ? `<a href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener">${escapeHtml(item.publicUrl)}</a>` : "URL未設定"}</div>
          ${errors.length ? `<div class="cc9-error-list">確認項目：${errors.map(escapeHtml).join(" / ")}</div>` : ""}

          <div class="cc9-card-actions">
            ${publicUrl ? `<a class="cc9-btn cc9-btn-secondary cc9-btn-small" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener">サイトを開く</a>` : ""}
            ${repoUrl ? `<a class="cc9-btn cc9-btn-secondary cc9-btn-small" href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">GitHubを開く</a>` : ""}
            <button class="cc9-btn cc9-btn-primary cc9-btn-small" type="button" data-run-site="${escapeHtml(item.id)}">このサイトを確認</button>
            <span class="cc9-last-check">最終確認：${formatDate(check?.checked_at || item.lastPublicCheckAt)}</span>
          </div>
        </article>
      `;
    }).join("") : '<div class="cc9-empty">CONTROL-CENTER-8の自社運用資産が見つかりません。</div>';

    document.querySelectorAll("[data-run-site]").forEach((button) => {
      button.addEventListener("click", () => runMonitor(button.dataset.runSite, button));
    });
  }

  function renderHistory() {
    const items = state.overview?.items || [];
    const rows = items.map((item) => {
      const check = item.latestCheck;
      const summary = check?.summary || {};
      const github = summary.github || {};
      return `
        <tr>
          <td><strong>${escapeHtml(item.websiteName)}</strong><br>${escapeHtml(item.releaseLabel || "—")}</td>
          <td><span class="cc9-status ${tone(check?.status, Boolean(check))}">${statusLabel(check?.status, Boolean(check))}</span></td>
          <td>${summary.public?.status || "—"} / ${summary.public?.responseMs ?? "—"}ms</td>
          <td>${summary.mutualLink?.ok === true ? "正常" : summary.mutualLink?.ok === false ? "要確認" : "—"}</td>
          <td>${shortSha(github.commitSha || item.repository?.lastCommitSha)}</td>
          <td>${escapeHtml(github.pagesConclusion || "—")}</td>
          <td>${formatDate(check?.checked_at)}</td>
        </tr>
      `;
    }).join("");

    $("historyTable").innerHTML = items.length ? `
      <table class="cc9-table">
        <thead><tr><th>サイト</th><th>状態</th><th>公開応答</th><th>相互リンク</th><th>コミット</th><th>Pages</th><th>確認日時</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    ` : '<div class="cc9-empty">監視対象がありません。</div>';
  }

  function render() {
    renderMetrics();
    renderSites();
    renderHistory();
    $("lastUpdated").textContent = `最終取得：${formatDate(state.overview?.checkedAt)}`;
    $("monitorVersion").textContent = state.overview?.monitorVersion || "CONTROL-CENTER-9";
  }

  function bindEvents() {
    $("refreshButton").addEventListener("click", async () => {
      const button = $("refreshButton");
      setBusy(button, true, "更新中…");
      try {
        await loadOverview();
        toast("最新の監視結果を表示しました。");
      } catch (error) {
        toast(error.message || "更新できませんでした。", true);
      } finally {
        setBusy(button, false);
      }
    });

    $("runAllButton").addEventListener("click", () => runMonitor(null, $("runAllButton")));

    $("menuButton").addEventListener("click", () => {
      document.querySelector(".cc9-sidebar")?.classList.toggle("open");
      $("sidebarBackdrop").classList.toggle("hidden");
    });
    $("sidebarBackdrop").addEventListener("click", () => {
      document.querySelector(".cc9-sidebar")?.classList.remove("open");
      $("sidebarBackdrop").classList.add("hidden");
    });
  }

  async function init() {
    bindEvents();
    setLoading("ログイン状態と監視設定を確認しています。");
    try {
      await initializeSession();
      await loadOverview();
      show("appShell");
    } catch (error) {
      console.error("[CONTROL-CENTER-9]", error);
      showError(error.message || "監視画面を開けませんでした。");
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
