(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-ALL-SYSTEM-REQUIRED-R1-20260815";
  let scheduled = false;

  function installStyle() {
    if (document.getElementById("contactRequiredR1Style")) return;

    const style = document.createElement("style");
    style.id = "contactRequiredR1Style";
    style.textContent = `
      .contact-required-r1-banner{
        margin:12px 0 16px;
        padding:12px 14px;
        border:1px solid #9fd4bd;
        border-radius:13px;
        background:#edf9f3;
        color:#315d4d;
        font-size:9px;
        line-height:1.7;
      }
      .contact-required-r1-banner strong{
        display:block;
        margin-bottom:2px;
        color:#075d45;
        font-size:10px;
      }
      [data-feature-card="contact"].contact-required-r1{
        border-color:#78c3a4 !important;
        background:#f1fbf6 !important;
        box-shadow:inset 0 0 0 1px rgba(8,112,82,.05);
      }
      .contact-required-r1-tag{
        display:inline-flex;
        align-items:center;
        min-height:22px;
        padding:3px 8px;
        border-radius:999px;
        background:#dff5ea;
        color:#087253;
        font-size:8px;
        font-weight:900;
        white-space:nowrap;
      }
      .contact-required-r1-note{
        margin-top:7px;
        color:#39705d;
        font-size:8px;
        font-weight:800;
        line-height:1.55;
      }
      #contactR1Enabled:disabled,
      [data-feature-toggle="contact"]:disabled{
        opacity:1;
        cursor:not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  function installPolicyBanner() {
    if (document.getElementById("contactRequiredR1Banner")) return;

    const anchor = document.querySelector(".policy-note");
    if (!anchor) return;

    const banner = document.createElement("div");
    banner.id = "contactRequiredR1Banner";
    banner.className = "contact-required-r1-banner";
    banner.innerHTML = `
      <strong>DPRO CONTACT｜全DPROシステム標準必須</strong>
      CONTACT本体はすべてのDPROシステムで標準ON・OFF不可です。
      LINE公式 / WEB問い合わせ / メール返信 / 画像・PDF添付は、契約内容に応じて選択できます。
    `;
    anchor.insertAdjacentElement("afterend", banner);
  }

  function lockFeatureCard() {
    const card = document.querySelector('[data-feature-card="contact"]');
    if (!card) return;

    card.classList.add("enabled", "contact-required-r1");

    const toggle = card.querySelector('[data-feature-toggle="contact"]');
    if (toggle) {
      toggle.checked = true;
      toggle.disabled = true;
      toggle.setAttribute("aria-label", "CONTACTはDPRO標準必須のためOFFにできません");
    }

    const badges = card.querySelector(".feature-badges");
    if (badges && !badges.querySelector("[data-contact-required-r1-tag]")) {
      const tag = document.createElement("span");
      tag.className = "contact-required-r1-tag";
      tag.dataset.contactRequiredR1Tag = "true";
      tag.textContent = "DPRO標準：必須";
      badges.prepend(tag);
    }

    const title = card.querySelector(".feature-title");
    if (title && !title.querySelector("[data-contact-required-r1-note]")) {
      const note = document.createElement("div");
      note.className = "contact-required-r1-note";
      note.dataset.contactRequiredR1Note = "true";
      note.textContent = "全DPROシステム共通。CONTACT本体はOFF不可。";
      title.appendChild(note);
    }
  }

  function lockContactOnboardingCard() {
    const master = document.getElementById("contactR1Enabled");
    if (!master) return;

    const changed = !master.checked;
    master.checked = true;

    if (changed) {
      master.dispatchEvent(new Event("change", { bubbles: true }));
    }

    master.disabled = true;
    master.setAttribute("aria-label", "DPRO CONTACTは全システム標準必須です");

    const card = document.getElementById("contactOnboardingR1");
    if (!card) return;

    const head = card.querySelector(".contact-r1-head > div");
    if (head && !head.querySelector("[data-contact-core-required-r1]")) {
      const tag = document.createElement("span");
      tag.className = "contact-required-r1-tag";
      tag.dataset.contactCoreRequiredR1 = "true";
      tag.textContent = "全システム標準必須";
      tag.style.marginTop = "7px";
      head.appendChild(tag);
    }

    const note = card.querySelector(".contact-r1-note");
    if (note) {
      note.textContent =
        "DPRO CONTACT本体は全DPROシステム標準必須のためOFFにできません。利用チャネルは契約内容に応じて選択できます。R1ではCloudflareをCONTROL CENTERから直接操作しません。";
    }

    const masterLabel = master.closest(".contact-r1-toggle");
    if (masterLabel) {
      const textNodes = Array.from(masterLabel.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
      textNodes.forEach((node) => {
        if (node.textContent.includes("CONTACTを利用する")) {
          node.textContent = " CONTACTを利用する（DPRO標準必須）";
        }
      });
    }
  }

  function apply() {
    installStyle();
    installPolicyBanner();
    lockFeatureCard();
    lockContactOnboardingCard();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function boot() {
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
