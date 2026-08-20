/* DPRO CONTROL CENTER / CENTER-4 safe compatibility wrapper
 * PRODUCT READY V1.0 / 2026-08-20
 *
 * The exact pre-READY CENTER-4 source is preserved locally as
 * ./center4-product-features-pre-ready-v1.js
 * and is loaded first. PRODUCT READY is additive.
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
    .then(()=>load("./center-product-ready-v1.js?v=CONTROL-CENTER-PRODUCT-READY-V1.0-20260820","data-product-ready-v1"))
    .catch((error)=>console.error("PRODUCT-READY-V1 loader",error));
})();
