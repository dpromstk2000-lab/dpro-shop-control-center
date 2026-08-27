/* DPRO CONTROL CENTER / CENTER-4 safe compatibility wrapper
 * PRODUCT READY V1.1 UX + CONTROL-CENTER-4 R2 workstream status / 2026-08-27
 *
 * Existing CENTER-4 Feature implementation logic is preserved and loaded first.
 * PRODUCT READY V1.1 fixes in-progress audit visibility and duplicate-audit prevention.
 * R2 adds read-only Product Ready formal lock + Tutorial reference status display.
 */
(() => {
  "use strict";

  const load = (src, marker) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[${marker}="true"]`)) return resolve();
    const s=document.createElement("script");
    s.src=src;
    s.async=false;
    s.setAttribute(marker,"true");
    s.onload=resolve;
    s.onerror=()=>reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

  load("./center4-product-features-pre-ready-v1.js?v=CONTROL-CENTER-16-CENTER4-20260809","data-center4-pre-ready")
    .then(()=>load("./center-product-ready-v1.js?v=CONTROL-CENTER-PRODUCT-READY-V1.1-UX-20260820","data-product-ready-v11"))
    .then(()=>load("./center4-workstream-status.js?v=CONTROL-CENTER-4-R2-20260827","data-center4-workstream-status"))
    .catch((error)=>console.error("CONTROL-CENTER-4 loader",error));
})();
