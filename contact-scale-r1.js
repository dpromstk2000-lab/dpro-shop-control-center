(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-SCALE-R1-20260815";
  const RETENTION_TARGET = 200;
  const $ = (id) => document.getElementById(id);

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
      @media(max-width:720px){.dc-scale-r1-status{align-items:flex-start;flex-direction:column}}
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
    setTimeout(update, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }

  console.info(BUILD, { retentionTarget:RETENTION_TARGET });
})();
