(() => {
  "use strict";

  const VERSION = "DPRO-CONTACT-SCROLL-STABLE-R1-20260919";
  const BOTTOM_THRESHOLD_PX = 96;

  let messageList = null;
  let observer = null;
  let preserveReaderPosition = false;
  let savedScrollTop = 0;
  let restorePending = false;
  let forceBottomOnce = false;
  let installTimer = null;

  function nearBottom(list) {
    if (!list) return true;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    return remaining <= BOTTOM_THRESHOLD_PX;
  }

  function rememberUserPosition() {
    if (!messageList || restorePending) return;
    preserveReaderPosition = !nearBottom(messageList);
    if (preserveReaderPosition) {
      savedScrollTop = messageList.scrollTop;
    }
  }

  function scheduleRestoreAfterCoreRender() {
    if (!messageList) return;

    if (forceBottomOnce) {
      forceBottomOnce = false;
      preserveReaderPosition = false;
      return;
    }

    if (!preserveReaderPosition) return;

    const target = savedScrollTop;
    restorePending = true;

    // contact-v1.js scrolls to the bottom in requestAnimationFrame().
    // Two frames ensure this restore runs after that core auto-scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          if (!messageList || !preserveReaderPosition) return;
          const maxScrollTop = Math.max(0, messageList.scrollHeight - messageList.clientHeight);
          messageList.scrollTop = Math.min(target, maxScrollTop);
          savedScrollTop = messageList.scrollTop;
        } finally {
          restorePending = false;
        }
      });
    });
  }

  function markIntentionalBottom() {
    forceBottomOnce = true;
    preserveReaderPosition = false;
  }

  function install() {
    messageList = document.getElementById("messageList");
    if (!messageList) return false;

    messageList.addEventListener("scroll", rememberUserPosition, { passive: true });

    // Wheel/touch/keyboard movement is user intent; remember immediately.
    messageList.addEventListener("wheel", () => setTimeout(rememberUserPosition, 0), { passive: true });
    messageList.addEventListener("touchmove", () => setTimeout(rememberUserPosition, 0), { passive: true });

    observer = new MutationObserver(() => {
      scheduleRestoreAfterCoreRender();
    });

    observer.observe(messageList, {
      childList: true,
      subtree: true,
    });

    // Opening another customer should still start at the latest message.
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("#threadList .dc-thread-item")) {
        markIntentionalBottom();
      }
      if (event.target.closest?.("#sendButton")) {
        markIntentionalBottom();
      }
    }, true);

    document.getElementById("replyForm")?.addEventListener("submit", markIntentionalBottom, true);

    // Keyboard scrolling inside the message pane.
    messageList.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        setTimeout(rememberUserPosition, 0);
      }
    });

    window.DPRO_CONTACT_SCROLL_STABLE = Object.freeze({
      version: VERSION,
      isPreserving: () => preserveReaderPosition,
    });

    return true;
  }

  function boot() {
    if (install()) return;
    let attempts = 0;
    installTimer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 50) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 100);
  }

  window.addEventListener("beforeunload", () => {
    if (observer) observer.disconnect();
    if (installTimer) clearInterval(installTimer);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
