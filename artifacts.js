(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-ARTIFACT-1-R1-20260815";
  const BUCKET = "cc-internal-artifacts";
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    session: null,
    staff: null,
    files: [],
    artifacts: [],
  };

  function show(id) {
    ["loadingScreen", "authScreen", "errorScreen", "app"].forEach((key) => {
      $(key)?.classList.toggle("hidden", key !== id);
    });
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function text(value) { return String(value ?? "").trim(); }
  function canWrite() { return ["owner_admin", "technical_admin", "support"].includes(state.staff?.role_key); }
  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  function dateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ja-JP");
  }
  function safeSegment(value, fallback = "DPRO") {
    const v = text(value).toUpperCase().replace(/[^A-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
    return v || fallback;
  }
  function safeFileName(value) {
    return String(value || "file").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 180) || "file";
  }
  function toast(message, error = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  async function sha256(file) {
    const data = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function getClient() {
    if (state.supabase) return state.supabase;
    const base = text(CONFIG.apiBaseUrl).replace(/\/$/, "");
    if (!base) throw new Error("CONTROL CENTER API URLが見つかりません。");

    const response = await fetch(`${base}/api/public-config`, { cache: "no-store" });
    const pub = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(pub.message || pub.error || `HTTP ${response.status}`);

    state.supabase = window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey || pub.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: pub.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      }
    );

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data?.session || null;
    if (!state.session?.user) return null;

    const { data: staff, error: staffError } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id", state.session.user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") throw new Error("有効なDPROスタッフではありません。");
    state.staff = staff;
    return state.supabase;
  }

  function applyStaff() {
    const name = text(state.staff?.display_name) || state.session?.user?.email || "DPROスタッフ";
    if ($("staffName")) $("staffName").textContent = name;
    if ($("staffRole")) $("staffRole").textContent = text(state.staff?.role_key) || "authenticated";
    if ($("staffInitial")) $("staffInitial").textContent = name.slice(0, 1) || "D";
    if (!canWrite()) {
      $("uploadPanel")?.classList.add("hidden");
    }
  }

  function renderSelectedFiles() {
    const root = $("selectedFiles");
    if (!root) return;
    if (!state.files.length) {
      root.innerHTML = "";
      return;
    }
    root.innerHTML = state.files.map((file, index) => `
      <div class="selected-file">
        <b>${esc(file.name)}</b>
        <small>${esc(formatBytes(file.size))}</small>
        <button type="button" data-remove-file="${index}" aria-label="${esc(file.name)}を外す">×</button>
      </div>
    `).join("");
    root.querySelectorAll("[data-remove-file]").forEach((button) => {
      button.addEventListener("click", () => {
        state.files.splice(Number(button.dataset.removeFile), 1);
        renderSelectedFiles();
      });
    });
  }

  function onFilesPicked(fileList) {
    const files = Array.from(fileList || []);
    const tooLarge = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooLarge) {
      $("uploadMessage").textContent = `${tooLarge.name} は20MBを超えています。`;
      $("uploadMessage").className = "archive-message error";
      return;
    }
    state.files = files;
    $("uploadMessage").textContent = files.length ? `${files.length}ファイルを選択しました。` : "";
    $("uploadMessage").className = "archive-message";
    renderSelectedFiles();
  }

  async function uploadArtifacts() {
    if (!canWrite()) return toast("編集権限がありません。", true);
    if (!state.files.length) return toast("保管するファイルを選択してください。", true);

    const systemCode = safeSegment($("systemCode")?.value, "DPRO");
    const title = text($("archiveTitle")?.value);
    const versionLabel = text($("versionLabel")?.value);
    const artifactType = text($("artifactType")?.value) || "other";
    const note = text($("archiveNote")?.value);
    if (!title) return toast("保管タイトルを入力してください。", true);

    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}`;
    const bundleKey = `${systemCode}_${ymd}_${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const button = $("uploadButton");
    button.disabled = true;
    button.textContent = "CONTROL CENTERへ保管中…";
    $("uploadMessage").textContent = "SHA-256を計算し、非公開Storageへ保存しています…";
    $("uploadMessage").className = "archive-message";

    const sb = await getClient();
    let completed = 0;
    try {
      for (const file of state.files) {
        const id = crypto.randomUUID();
        const path = `${systemCode}/${ymd}/${id}_${safeFileName(file.name)}`;
        const hash = await sha256(file);
        const contentType = file.type || "application/octet-stream";

        const { error: storageError } = await sb.storage.from(BUCKET).upload(path, file, {
          contentType,
          upsert: false,
          cacheControl: "3600",
        });
        if (storageError) throw storageError;

        const { error: dbError } = await sb.from("cc_internal_artifacts").insert({
          bundle_key: bundleKey,
          artifact_type: artifactType,
          system_code: systemCode,
          title,
          version_label: versionLabel || null,
          file_name: file.name,
          storage_bucket: BUCKET,
          storage_path: path,
          mime_type: contentType,
          file_size_bytes: file.size,
          sha256: hash,
          note: note || null,
          uploaded_by: state.staff.id,
          status: "active",
        });
        if (dbError) {
          await sb.storage.from(BUCKET).remove([path]).catch(() => null);
          throw dbError;
        }
        completed += 1;
      }

      state.files = [];
      $("artifactFiles").value = "";
      renderSelectedFiles();
      $("uploadMessage").textContent = `${completed}ファイルをCONTROL CENTERへ正式保管しました。`;
      $("uploadMessage").className = "archive-message success";
      toast("CONTROL CENTERへ保管しました。");
      await loadArtifacts();
    } catch (error) {
      console.error(BUILD, error);
      $("uploadMessage").textContent = `保管を完了できませんでした：${error.message || error}`;
      $("uploadMessage").className = "archive-message error";
      toast("保管に失敗しました。", true);
    } finally {
      button.disabled = false;
      button.textContent = "CONTROL CENTERへ保管";
    }
  }

  function filteredArtifacts() {
    const q = text($("artifactSearch")?.value).toLowerCase();
    const status = text($("statusFilter")?.value) || "active";
    return state.artifacts.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return [a.system_code, a.title, a.file_name, a.version_label, a.note, a.bundle_key]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }

  function fileKind(fileName, mime) {
    const n = String(fileName || "").toLowerCase();
    if (n.endsWith(".zip")) return "ZIP";
    if (n.endsWith(".txt") || String(mime || "").startsWith("text/")) return "TXT";
    if (n.endsWith(".pdf")) return "PDF";
    if (n.endsWith(".sql")) return "SQL";
    return "FILE";
  }

  function renderArtifacts() {
    const items = filteredArtifacts();
    const active = state.artifacts.filter((a) => a.status === "active").length;
    const systems = new Set(state.artifacts.filter((a) => a.status === "active").map((a) => a.system_code)).size;
    const bytes = state.artifacts.filter((a) => a.status === "active").reduce((sum, a) => sum + Number(a.file_size_bytes || 0), 0);
    $("archiveSummary").innerHTML = `
      <article><b>${active}</b><span>保管中ファイル</span></article>
      <article><b>${systems}</b><span>システム数</span></article>
      <article><b>${esc(formatBytes(bytes))}</b><span>保管容量</span></article>
    `;

    const root = $("artifactList");
    if (!items.length) {
      root.innerHTML = '<div class="archive-empty">該当する保管資料はありません。</div>';
      return;
    }

    root.innerHTML = items.map((a) => `
      <article class="artifact-card" data-artifact-id="${esc(a.id)}">
        <div class="artifact-icon">${esc(fileKind(a.file_name, a.mime_type))}</div>
        <div class="artifact-main">
          <div class="artifact-head">
            <strong>${esc(a.title)}</strong>
            <span class="artifact-tag">${esc(a.system_code)}</span>
            <span class="artifact-tag">${esc(a.artifact_type)}</span>
            ${a.status === "archived" ? '<span class="artifact-tag">ARCHIVED</span>' : ''}
          </div>
          <div class="artifact-file">${esc(a.file_name)}</div>
          <div class="artifact-meta">
            <span>${esc(a.version_label || "Version未記載")}</span>
            <span>${esc(formatBytes(a.file_size_bytes))}</span>
            <span>${esc(dateTime(a.created_at))}</span>
            <span>${esc(a.bundle_key)}</span>
          </div>
          ${a.note ? `<div class="artifact-note">${esc(a.note)}</div>` : ""}
          ${a.sha256 ? `<div class="artifact-hash">SHA-256: ${esc(a.sha256)}</div>` : ""}
        </div>
        <div class="artifact-actions">
          <button class="btn secondary" type="button" data-open="${esc(a.id)}">開く</button>
          <button class="btn secondary" type="button" data-save="${esc(a.id)}">保存</button>
          ${canWrite() && a.status === "active" ? `<button class="btn secondary" type="button" data-archive="${esc(a.id)}">保管終了</button>` : ""}
        </div>
      </article>
    `).join("");

    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openArtifact(b.dataset.open)));
    root.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => saveArtifact(b.dataset.save)));
    root.querySelectorAll("[data-archive]").forEach((b) => b.addEventListener("click", () => archiveArtifact(b.dataset.archive)));
  }

  async function loadArtifacts() {
    const sb = await getClient();
    const { data, error } = await sb.from("cc_internal_artifacts").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    state.artifacts = data || [];
    renderArtifacts();
  }

  function artifactById(id) { return state.artifacts.find((a) => a.id === id); }

  async function openArtifact(id) {
    const a = artifactById(id);
    if (!a) return;
    const popup = window.open("about:blank", "_blank");
    try {
      const sb = await getClient();
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, 300);
      if (error) throw error;
      if (popup) popup.location.href = data.signedUrl;
      else location.href = data.signedUrl;
    } catch (error) {
      if (popup) popup.close();
      toast(error.message || "ファイルを開けませんでした。", true);
    }
  }

  async function saveArtifact(id) {
    const a = artifactById(id);
    if (!a) return;
    try {
      const sb = await getClient();
      const { data, error } = await sb.storage.from(BUCKET).download(a.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.file_name || "artifact";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast(error.message || "ファイルを保存できませんでした。", true);
    }
  }

  async function archiveArtifact(id) {
    const a = artifactById(id);
    if (!a || !canWrite()) return;
    if (!confirm(`${a.file_name}\nを「アーカイブ済み」にしますか？\nファイル本体は削除しません。`)) return;
    try {
      const sb = await getClient();
      const { error } = await sb.from("cc_internal_artifacts").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
      toast("アーカイブ済みに変更しました。");
      await loadArtifacts();
    } catch (error) {
      toast(error.message || "変更できませんでした。", true);
    }
  }

  function bind() {
    $("chooseFiles")?.addEventListener("click", () => $("artifactFiles")?.click());
    $("artifactFiles")?.addEventListener("change", (e) => onFilesPicked(e.target.files));
    $("uploadButton")?.addEventListener("click", uploadArtifacts);
    $("refreshButton")?.addEventListener("click", () => loadArtifacts().catch((e) => toast(e.message, true)));
    $("artifactSearch")?.addEventListener("input", renderArtifacts);
    $("statusFilter")?.addEventListener("change", renderArtifacts);
    $("retryButton")?.addEventListener("click", boot);
    $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
  }

  async function boot() {
    show("loadingScreen");
    try {
      const sb = await getClient();
      if (!sb || !state.session?.user) {
        show("authScreen");
        return;
      }
      applyStaff();
      bind();
      await loadArtifacts();
      show("app");
    } catch (error) {
      console.error(BUILD, error);
      if ($("errorText")) $("errorText").textContent = error.message || "保管資料を開けませんでした。";
      show("errorScreen");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
