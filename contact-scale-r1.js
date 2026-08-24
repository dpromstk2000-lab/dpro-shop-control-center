(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-SCALE-R2-REPLY-UX-20260824";
  const RETENTION_TARGET = 200;
  const $ = (id) => document.getElementById(id);

  const replyUx = {
    drafts: new Map(),
    currentKey: "",
    bypassSubmit: false,
    lastFocusedElement: null,
    switching: false,
  };

  function intText(id) {
    const raw = String($(id)?.textContent || "").replace(/[^\d-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function installStyle() {
    if ($("dproContactScaleR1Style")) return;
    const style = document.createElement("style");
    style.id = "dproContactScaleR1Style";
    style.textContent = `
      .dc-scale-r1-status{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:8px 10px;border:1px solid #d7e7e1;border-radius:10px;
        background:#f7fbf9;font-size:11px;line-height:1.45;color:#4b625b;
      }
      .dc-scale-r1-status strong{color:#0b5f49;font-size:11px}
      .dc-scale-r1-status.warn{border-color:#f0d8a1;background:#fff9ec;color:#79540a}
      .dc-scale-r1-status.warn strong{color:#8b5a00}
      .dc-scale-r1-note{display:block;margin-top:3px;font-size:9px;color:#71837d}

      .dc-reply-ux-toolbar{
        display:flex;align-items:center;gap:8px;margin:0 0 8px;
      }
      .dc-reply-ux-toolbar .dc-reply-expand{
        min-height:34px;padding:0 11px;border:1px solid #cfe1da;border-radius:9px;
        background:#f8fcfa;color:#0b5f49;font-size:11px;font-weight:900;cursor:pointer;
      }
      .dc-reply-ux-toolbar .dc-reply-expand:hover{background:#eaf7f1}
      .dc-reply-ux-toolbar .dc-reply-expand:disabled{opacity:.5;cursor:not-allowed}
      .dc-reply-ux-spacer{flex:1}
      .dc-reply-draft-state{font-size:9px;color:#72837c;white-space:nowrap}
      .dc-reply-draft-state.has-draft{color:#0b5f49;font-weight:900}
      .dc-reply-counter{font-size:10px;color:#60736b;white-space:nowrap;font-variant-numeric:tabular-nums}
      .dc-composer textarea#replyText{
        min-height:154px;max-height:320px;resize:vertical;
        transition:min-height .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      .dc-composer textarea#replyText:focus{min-height:180px}

      .dc-reply-modal{
        position:fixed;inset:0;z-index:10000;display:grid;place-items:center;
        padding:18px;background:rgba(4,35,27,.55);backdrop-filter:blur(3px);
      }
      .dc-reply-modal.dc-hidden{display:none!important}
      .dc-reply-dialog{
        width:min(1180px,100%);max-height:92vh;display:flex;flex-direction:column;
        background:#fff;border:1px solid #d7e5df;border-radius:20px;
        box-shadow:0 30px 90px rgba(0,0,0,.28);overflow:hidden;
      }
      .dc-reply-dialog--confirm{width:min(820px,100%)}
      .dc-reply-modal-head{
        min-height:62px;padding:12px 16px;display:flex;align-items:center;gap:12px;
        border-bottom:1px solid #d9e5df;background:#fbfdfc;
      }
      .dc-reply-modal-head>div{min-width:0}
      .dc-reply-modal-head strong{display:block;font-size:15px;color:#14271f}
      .dc-reply-modal-head small{display:block;margin-top:3px;font-size:10px;color:#6d7e77}
      .dc-reply-close{
        margin-left:auto;width:38px;height:38px;border:1px solid #d7e5df;border-radius:10px;
        background:#fff;color:#0b5f49;font-size:20px;line-height:1;cursor:pointer;
      }
      .dc-reply-editor-grid{
        min-height:0;display:grid;grid-template-columns:minmax(320px,.85fr) minmax(0,1.15fr);flex:1;
      }
      .dc-reply-history-panel,.dc-reply-editor-panel{min-width:0;min-height:0;padding:16px;overflow:auto}
      .dc-reply-history-panel{border-right:1px solid #d9e5df;background:#f4f9f7}
      .dc-reply-panel-title{margin:0 0 10px;font-size:11px;font-weight:900;color:#0b5f49;letter-spacing:.04em}
      .dc-reply-history{display:flex;flex-direction:column;gap:9px;pointer-events:none}
      .dc-reply-history .dc-message{max-width:92%}
      .dc-reply-history-empty{padding:30px 12px;text-align:center;color:#71837d;font-size:12px}
      .dc-reply-editor-panel{display:flex;flex-direction:column;background:#fff}
      .dc-reply-editor-textarea{
        width:100%;min-height:390px;flex:1;padding:16px;border:1px solid #cfded7;border-radius:14px;
        outline:none;resize:none;font:inherit;font-size:14px;line-height:1.8;color:#14271f;background:#fff;
      }
      .dc-reply-editor-textarea:focus{border-color:#118465;box-shadow:0 0 0 3px rgba(17,132,101,.09)}
      .dc-reply-editor-meta{margin-top:8px;display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#6d7e77}
      .dc-reply-modal-foot{
        padding:12px 16px;display:flex;align-items:center;justify-content:flex-end;gap:9px;
        border-top:1px solid #d9e5df;background:#fbfdfc;
      }
      .dc-reply-modal-foot .dc-btn{min-width:112px}
      .dc-reply-confirm-body{padding:18px;overflow:auto}
      .dc-reply-confirm-summary{
        display:grid;grid-template-columns:90px 1fr;gap:7px 12px;padding:12px 14px;
        border:1px solid #dbe7e2;border-radius:12px;background:#f8fbfa;font-size:11px;
      }
      .dc-reply-confirm-summary dt{margin:0;color:#71837d;font-weight:800}
      .dc-reply-confirm-summary dd{margin:0;color:#14271f;font-weight:900;word-break:break-word}
      .dc-reply-confirm-label{margin:16px 0 7px;font-size:11px;font-weight:900;color:#0b5f49}
      .dc-reply-confirm-preview{
        margin:0;max-height:360px;overflow:auto;padding:15px;border:1px solid #cfded7;border-radius:13px;
        background:#fff;white-space:pre-wrap;word-break:break-word;font:inherit;font-size:13px;line-height:1.75;color:#14271f;
      }
      .dc-reply-confirm-note{margin:10px 2px 0;font-size:10px;color:#7a5c16}
      body.dc-reply-modal-open{overflow:hidden}

      @media(max-width:820px){
        .dc-reply-editor-grid{display:block;overflow:auto}
        .dc-reply-history-panel{max-height:34vh;border-right:0;border-bottom:1px solid #d9e5df}
        .dc-reply-editor-textarea{min-height:300px}
        .dc-composer textarea#replyText{min-height:132px;max-height:260px}
      }
      @media(max-width:720px){
        .dc-scale-r1-status{align-items:flex-start;flex-direction:column}
        .dc-reply-modal{padding:8px}
        .dc-reply-dialog{max-height:96vh;border-radius:15px}
        .dc-reply-modal-foot{flex-wrap:wrap}
        .dc-reply-modal-foot .dc-btn{flex:1}
        .dc-reply-confirm-summary{grid-template-columns:70px 1fr}
        .dc-reply-draft-state{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureStatus() {
    const tools = document.querySelector(".dc-thread-tools");
    if (!tools) return null;
    let box = $("dproContactScaleR1Status");
    if (!box) {
      box = document.createElement("div");
      box.id = "dproContactScaleR1Status";
      box.className = "dc-scale-r1-status";
      tools.insertAdjacentElement("afterend", box);
    }
    return box;
  }

  function update() {
    const box = ensureStatus();
    if (!box) return;

    const open = intText("metricOpen");
    const closed = intText("metricClosed");
    const supportHistory = open + closed;
    const over = Math.max(0, supportHistory - RETENTION_TARGET);

    box.classList.toggle("warn", over > 0);
    box.innerHTML = `
      <span>
        <strong>対応履歴 ${supportHistory}件 / 自動整理基準 ${RETENTION_TARGET}件</strong>
        <span class="dc-scale-r1-note">新着順。古い「対応完了・既読・添付なし」から自動整理します。</span>
      </span>
      <span>${over > 0
        ? `保護中の会話があるため +${over}件保持`
        : "対応中・未読・添付ありは保護"
      }</span>
    `;

    const search = $("threadSearch");
    if (search) {
      search.placeholder = `名前・メッセージで検索（直近${RETENTION_TARGET}件）`;
      search.title = `自動整理基準${RETENTION_TARGET}件。対応中・未読・添付ありは保護されます。`;
    }
  }

  function currentChannelLabel() {
    const meta = String($("conversationMeta")?.textContent || "").trim();
    const first = meta.split("/")[0]?.trim().toUpperCase();
    if (first === "WEB" || first === "LINE") return first;
    const sendLabel = String($("sendButton")?.textContent || "");
    return sendLabel.includes("メール") ? "WEB" : "LINE";
  }

  function getDraftKey() {
    const name = String($("conversationName")?.textContent || "").trim();
    if (!name || $("conversation")?.classList.contains("dc-hidden")) return "";
    return `${currentChannelLabel()}::${name}`;
  }

  function selectedAttachmentCount() {
    return document.querySelectorAll("#attachmentSelection .dc-selected-file").length;
  }

  function selectedAttachmentNames() {
    return Array.from(document.querySelectorAll("#attachmentSelection .dc-selected-file b"))
      .map((el) => String(el.textContent || "").replace(/^📎\s*/, "").trim())
      .filter(Boolean);
  }

  function updateReplyCounter() {
    const textarea = $("replyText");
    const counter = $("dproReplyCounter");
    if (!textarea || !counter) return;
    const max = Number(textarea.maxLength) > 0 ? Number(textarea.maxLength) : 5000;
    counter.textContent = `${textarea.value.length.toLocaleString("ja-JP")} / ${max.toLocaleString("ja-JP")}`;
  }

  function autoSizeReply() {
    const textarea = $("replyText");
    if (!textarea) return;
    const min = window.innerWidth <= 820 ? 132 : 154;
    const max = window.innerWidth <= 820 ? 260 : 320;
    textarea.style.height = "auto";
    const next = Math.min(max, Math.max(min, textarea.scrollHeight || min));
    textarea.style.height = `${next}px`;
    textarea.style.overflowY = (textarea.scrollHeight || 0) > max ? "auto" : "hidden";
  }

  function updateDraftState() {
    const stateEl = $("dproReplyDraftState");
    if (!stateEl) return;
    const value = String($("replyText")?.value || "");
    const hasDraft = Boolean(value);
    stateEl.classList.toggle("has-draft", hasDraft);
    stateEl.textContent = hasDraft ? "一時下書き保存中" : "この画面内で下書き保持";
  }

  function saveDraftForKey(key) {
    if (!key) return;
    const value = String($("replyText")?.value || "");
    if (value) replyUx.drafts.set(key, value);
    else replyUx.drafts.delete(key);
  }

  function syncDraftContext({ force = false } = {}) {
    const textarea = $("replyText");
    if (!textarea) return;
    const key = getDraftKey();
    if (!key) return;
    if (!force && key === replyUx.currentKey) return;

    replyUx.currentKey = key;
    textarea.value = replyUx.drafts.get(key) || "";
    updateReplyCounter();
    updateDraftState();
    autoSizeReply();
  }

  function prepareThreadSwitch() {
    const textarea = $("replyText");
    if (!textarea) return;
    if (replyUx.currentKey) saveDraftForKey(replyUx.currentKey);
    textarea.value = "";
    replyUx.currentKey = "";
    updateReplyCounter();
    updateDraftState();
    autoSizeReply();
    replyUx.switching = true;
    clearTimeout(prepareThreadSwitch.timer);
    prepareThreadSwitch.timer = setTimeout(() => {
      replyUx.switching = false;
      syncDraftContext({ force: true });
    }, 220);
  }

  function buildToolbar() {
    const composer = document.querySelector(".dc-composer");
    const textarea = $("replyText");
    if (!composer || !textarea || $("dproReplyUxToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "dproReplyUxToolbar";
    toolbar.className = "dc-reply-ux-toolbar";
    toolbar.innerHTML = `
      <button id="dproReplyExpand" class="dc-reply-expand" type="button">↗ 大きく編集</button>
      <span class="dc-reply-ux-spacer"></span>
      <span id="dproReplyDraftState" class="dc-reply-draft-state">この画面内で下書き保持</span>
      <span id="dproReplyCounter" class="dc-reply-counter">0 / 5,000</span>
    `;
    composer.insertBefore(toolbar, textarea);
  }

  function buildEditorModal() {
    if ($("dproReplyEditorModal")) return;
    const modal = document.createElement("div");
    modal.id = "dproReplyEditorModal";
    modal.className = "dc-reply-modal dc-hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "dproReplyEditorTitle");
    modal.innerHTML = `
      <div class="dc-reply-dialog">
        <div class="dc-reply-modal-head">
          <div>
            <strong id="dproReplyEditorTitle">返信を大きく編集</strong>
            <small id="dproReplyEditorSub">問い合わせ内容を見ながら返信文を確認できます</small>
          </div>
          <button id="dproReplyEditorClose" class="dc-reply-close" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="dc-reply-editor-grid">
          <section class="dc-reply-history-panel" aria-label="問い合わせ履歴">
            <p class="dc-reply-panel-title">問い合わせ・会話履歴</p>
            <div id="dproReplyHistory" class="dc-reply-history"></div>
          </section>
          <section class="dc-reply-editor-panel" aria-label="返信編集">
            <p class="dc-reply-panel-title">返信内容</p>
            <textarea id="dproReplyLargeText" class="dc-reply-editor-textarea" maxlength="5000" placeholder="返信を入力してください"></textarea>
            <div class="dc-reply-editor-meta">
              <span>Ctrl / ⌘ + Enter で送信前確認へ</span>
              <span id="dproReplyLargeCounter">0 / 5,000</span>
            </div>
          </section>
        </div>
        <div class="dc-reply-modal-foot">
          <button id="dproReplyEditorCancel" class="dc-btn dc-secondary" type="button">閉じる</button>
          <button id="dproReplyEditorReview" class="dc-btn dc-primary" type="button">送信前確認へ</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function buildConfirmModal() {
    if ($("dproReplyConfirmModal")) return;
    const modal = document.createElement("div");
    modal.id = "dproReplyConfirmModal";
    modal.className = "dc-reply-modal dc-hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "dproReplyConfirmTitle");
    modal.innerHTML = `
      <div class="dc-reply-dialog dc-reply-dialog--confirm">
        <div class="dc-reply-modal-head">
          <div>
            <strong id="dproReplyConfirmTitle">送信前に内容を確認</strong>
            <small>宛先・本文・添付を確認してから送信します</small>
          </div>
          <button id="dproReplyConfirmClose" class="dc-reply-close" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="dc-reply-confirm-body">
          <dl class="dc-reply-confirm-summary">
            <dt>宛先</dt><dd id="dproReplyConfirmName">—</dd>
            <dt>送信方法</dt><dd id="dproReplyConfirmChannel">—</dd>
            <dt>添付</dt><dd id="dproReplyConfirmAttachments">なし</dd>
          </dl>
          <p class="dc-reply-confirm-label">返信本文</p>
          <pre id="dproReplyConfirmPreview" class="dc-reply-confirm-preview"></pre>
          <p class="dc-reply-confirm-note">この内容で送信します。送信後は取り消せないため、最後に全文をご確認ください。</p>
        </div>
        <div class="dc-reply-modal-foot">
          <button id="dproReplyConfirmEdit" class="dc-btn dc-secondary" type="button">編集に戻る</button>
          <button id="dproReplyConfirmSend" class="dc-btn dc-primary" type="button">送信する</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function cloneHistory() {
    const target = $("dproReplyHistory");
    const source = $("messageList");
    if (!target) return;
    target.innerHTML = "";
    const messages = source ? Array.from(source.children).filter((el) => el.classList?.contains("dc-message")) : [];
    if (!messages.length) {
      target.innerHTML = `<div class="dc-reply-history-empty">表示できる会話履歴がありません。</div>`;
      return;
    }
    for (const message of messages) {
      const clone = message.cloneNode(true);
      clone.querySelectorAll("button,a").forEach((el) => {
        el.removeAttribute("href");
        el.removeAttribute("data-attachment-open");
        el.removeAttribute("data-attachment-download");
        el.setAttribute("tabindex", "-1");
      });
      target.appendChild(clone);
    }
    target.scrollTop = target.scrollHeight;
  }

  function syncLargeCounter() {
    const editor = $("dproReplyLargeText");
    const counter = $("dproReplyLargeCounter");
    if (!editor || !counter) return;
    const max = Number(editor.maxLength) > 0 ? Number(editor.maxLength) : 5000;
    counter.textContent = `${editor.value.length.toLocaleString("ja-JP")} / ${max.toLocaleString("ja-JP")}`;
  }

  function syncLargeToBase() {
    const editor = $("dproReplyLargeText");
    const textarea = $("replyText");
    if (!editor || !textarea) return;
    textarea.value = editor.value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setModalOpen(open) {
    document.body.classList.toggle("dc-reply-modal-open", open);
  }

  function openEditor() {
    const textarea = $("replyText");
    const modal = $("dproReplyEditorModal");
    const editor = $("dproReplyLargeText");
    if (!textarea || !modal || !editor || textarea.disabled) return;

    replyUx.lastFocusedElement = document.activeElement;
    cloneHistory();
    editor.value = textarea.value;
    $("dproReplyEditorSub").textContent = `${currentChannelLabel()} / ${String($("conversationName")?.textContent || "問い合わせ").trim()}`;
    syncLargeCounter();
    modal.classList.remove("dc-hidden");
    setModalOpen(true);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  function closeEditor({ focusBase = true } = {}) {
    const modal = $("dproReplyEditorModal");
    if (!modal || modal.classList.contains("dc-hidden")) return;
    syncLargeToBase();
    modal.classList.add("dc-hidden");
    if ($("dproReplyConfirmModal")?.classList.contains("dc-hidden")) setModalOpen(false);
    if (focusBase) requestAnimationFrame(() => $("replyText")?.focus());
  }

  function openConfirm() {
    const textarea = $("replyText");
    const modal = $("dproReplyConfirmModal");
    if (!textarea || !modal) return;

    const attachments = selectedAttachmentNames();
    $("dproReplyConfirmName").textContent = String($("conversationName")?.textContent || "問い合わせ").trim() || "問い合わせ";
    $("dproReplyConfirmChannel").textContent = currentChannelLabel() === "WEB" ? "メール返信" : "LINE返信";
    $("dproReplyConfirmAttachments").textContent = attachments.length ? `${attachments.length}件：${attachments.join("、")}` : "なし";
    $("dproReplyConfirmPreview").textContent = textarea.value || "（本文なし・添付のみ）";
    $("dproReplyConfirmSend").textContent = String($("sendButton")?.textContent || "送信する").trim() || "送信する";

    $("dproReplyEditorModal")?.classList.add("dc-hidden");
    modal.classList.remove("dc-hidden");
    setModalOpen(true);
    requestAnimationFrame(() => $("dproReplyConfirmSend")?.focus());
  }

  function closeConfirm({ focusBase = true } = {}) {
    const modal = $("dproReplyConfirmModal");
    if (!modal || modal.classList.contains("dc-hidden")) return;
    modal.classList.add("dc-hidden");
    if ($("dproReplyEditorModal")?.classList.contains("dc-hidden")) setModalOpen(false);
    if (focusBase) requestAnimationFrame(() => $("replyText")?.focus());
  }

  function reviewFromEditor() {
    syncLargeToBase();
    const textValue = String($("replyText")?.value || "").trim();
    if (!textValue && selectedAttachmentCount() === 0) {
      $("replyText")?.focus();
      return;
    }
    if (replyUx.currentKey) saveDraftForKey(replyUx.currentKey);
    openConfirm();
  }

  function returnToEditor() {
    closeConfirm({ focusBase: false });
    openEditor();
  }

  function watchSendResult(key, beforeText, beforeAttachmentCount) {
    const started = Date.now();
    const timer = setInterval(() => {
      const textNow = String($("replyText")?.value || "");
      const attachmentsNow = selectedAttachmentCount();
      const textCleared = Boolean(beforeText) && !textNow;
      const attachmentsCleared = beforeAttachmentCount > 0 && attachmentsNow === 0;
      if (textCleared || attachmentsCleared) {
        clearInterval(timer);
        if (key) replyUx.drafts.delete(key);
        updateDraftState();
        updateReplyCounter();
        autoSizeReply();
        return;
      }
      if (Date.now() - started > 20000) clearInterval(timer);
    }, 250);
  }

  function confirmAndSend() {
    const form = $("replyForm");
    const sendButton = $("sendButton");
    const textarea = $("replyText");
    if (!form || !sendButton || !textarea || sendButton.disabled || textarea.disabled) return;

    const key = replyUx.currentKey || getDraftKey();
    const beforeText = textarea.value;
    const beforeAttachmentCount = selectedAttachmentCount();
    replyUx.bypassSubmit = true;
    closeConfirm({ focusBase: false });
    form.requestSubmit(sendButton);
    watchSendResult(key, beforeText, beforeAttachmentCount);
  }

  function interceptSubmit(event) {
    if (replyUx.bypassSubmit) {
      replyUx.bypassSubmit = false;
      return;
    }

    const textarea = $("replyText");
    const sendButton = $("sendButton");
    if (!textarea || !sendButton || textarea.disabled || sendButton.disabled) return;

    const hasText = Boolean(String(textarea.value || "").trim());
    const hasAttachments = selectedAttachmentCount() > 0;
    if (!hasText && !hasAttachments) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (replyUx.currentKey) saveDraftForKey(replyUx.currentKey);
    openConfirm();
  }

  function bindReplyUx() {
    const textarea = $("replyText");
    const form = $("replyForm");
    if (!textarea || !form || form.dataset.dproReplyUxBound === "1") return;
    form.dataset.dproReplyUxBound = "1";

    buildToolbar();
    buildEditorModal();
    buildConfirmModal();

    form.addEventListener("submit", interceptSubmit, true);
    textarea.addEventListener("input", () => {
      if (replyUx.currentKey) saveDraftForKey(replyUx.currentKey);
      updateReplyCounter();
      updateDraftState();
      autoSizeReply();
    });
    textarea.addEventListener("focus", autoSizeReply);
    textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        form.requestSubmit($("sendButton"));
      }
    });

    $("dproReplyExpand")?.addEventListener("click", openEditor);
    $("dproReplyEditorClose")?.addEventListener("click", () => closeEditor());
    $("dproReplyEditorCancel")?.addEventListener("click", () => closeEditor());
    $("dproReplyEditorReview")?.addEventListener("click", reviewFromEditor);
    $("dproReplyLargeText")?.addEventListener("input", () => {
      syncLargeCounter();
      syncLargeToBase();
    });
    $("dproReplyLargeText")?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        reviewFromEditor();
      }
    });

    $("dproReplyConfirmClose")?.addEventListener("click", () => closeConfirm());
    $("dproReplyConfirmEdit")?.addEventListener("click", returnToEditor);
    $("dproReplyConfirmSend")?.addEventListener("click", confirmAndSend);

    $("threadList")?.addEventListener("click", (event) => {
      if (event.target.closest?.(".dc-thread-item")) prepareThreadSwitch();
    }, true);
    $("mobileBackButton")?.addEventListener("click", prepareThreadSwitch, true);

    const conversationObserver = new MutationObserver(() => {
      if (!replyUx.switching) syncDraftContext();
      const disabled = Boolean(textarea.disabled);
      if ($("dproReplyExpand")) $("dproReplyExpand").disabled = disabled;
    });
    [$("conversationName"), $("conversationMeta"), $("conversation"), $("sendButton")]
      .filter(Boolean)
      .forEach((target) => conversationObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "disabled"],
      }));

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("dproReplyConfirmModal")?.classList.contains("dc-hidden")) {
        event.preventDefault();
        closeConfirm();
        return;
      }
      if (!$("dproReplyEditorModal")?.classList.contains("dc-hidden")) {
        event.preventDefault();
        closeEditor();
      }
    });

    window.addEventListener("resize", () => requestAnimationFrame(autoSizeReply));

    updateReplyCounter();
    updateDraftState();
    autoSizeReply();
    syncDraftContext({ force: true });
  }

  function observe() {
    const targets = [
      $("metricOpen"),
      $("metricClosed"),
      $("threadList"),
      document.querySelector(".dc-thread-tools"),
    ].filter(Boolean);

    const observer = new MutationObserver(update);
    for (const target of targets) {
      observer.observe(target, { childList:true, subtree:true, characterData:true });
    }

    $("refreshButton")?.addEventListener("click", () => setTimeout(update, 350));
    document.addEventListener("change", (event) => {
      if (["statusFilter", "unreadOnly"].includes(event.target?.id || "")) {
        setTimeout(update, 100);
      }
    });
  }

  function boot() {
    installStyle();
    update();
    observe();
    bindReplyUx();
    setTimeout(() => {
      update();
      bindReplyUx();
    }, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }

  console.info(BUILD, {
    retentionTarget: RETENTION_TARGET,
    replyUx: ["autosize", "large-editor", "send-confirm", "session-drafts", "character-counter"],
  });
})();
