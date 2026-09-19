(() => {
  "use strict";

  const BUILD = "DPRO-DELIVERY-OPENPROJECT-GUARD-R2-20260919";
  const NativePromise = window.Promise;
  const nativeAll = NativePromise.all.bind(NativePromise);
  const nativeRace = NativePromise.race.bind(NativePromise);

  if (NativePromise.__dproOpenProjectGuardR2Installed) return;

  const DETAIL_LOADING_TEXT = "制作内容とDPRO標準を読み込んでいます";
  const DETAIL_LABELS = [
    "制作案件本体",
    "Feature Flag",
    "制作STEP",
    "DPRO STANDARDチェック",
  ];
  const ITEM_TIMEOUT_MS = 12000;

  function timeoutAfter(ms, label) {
    return new NativePromise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label}の読み込みがタイムアウトしました。`));
      }, ms);
    });
  }

  async function resolveSequentially(items) {
    const results = [];

    for (let i = 0; i < items.length; i += 1) {
      const label = DETAIL_LABELS[i] || `詳細データ${i + 1}`;

      try {
        const result = await nativeRace([
          NativePromise.resolve(items[i]),
          timeoutAfter(ITEM_TIMEOUT_MS, label),
        ]);
        results.push(result);
      } catch (error) {
        const detail = error?.message || String(error || "不明なエラー");
        throw new Error(`${label}を取得できませんでした。${detail}`);
      }
    }

    return results;
  }

  NativePromise.all = function dproPromiseAll(iterable) {
    const items = Array.from(iterable || []);
    const loadingText =
      document.getElementById("loadingText")?.textContent || "";

    const isDeliveryProjectDetail =
      items.length === 4 &&
      loadingText.includes(DETAIL_LOADING_TEXT);

    if (!isDeliveryProjectDetail) {
      return nativeAll(items);
    }

    return resolveSequentially(items);
  };

  Object.defineProperty(NativePromise, "__dproOpenProjectGuardR2Installed", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  window.DPRO_DELIVERY_OPENPROJECT_GUARD_R2 = Object.freeze({
    build: BUILD,
    mode: "sequential-detail-load",
    itemTimeoutMs: ITEM_TIMEOUT_MS,
    labels: DETAIL_LABELS.slice(),
  });
})();
