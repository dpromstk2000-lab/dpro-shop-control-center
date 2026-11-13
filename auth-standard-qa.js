/* DPRO CC AUTH STANDARD / STAGED QA PORTAL V1.2.0
 * No owner authentication, impersonation, or production business APIs.
 * Uses existing CENTRAL Supabase session + MFA for display gating;
 * target QA Worker independently enforces Cloudflare Access and D1 grants.
 */
(() => {
  'use strict';
  const CC_API = 'https://dpro-shop-control-center-api.dpromstk2000.workers.dev';
  const ROLES = new Set(['owner_admin','technical_admin','support']);
  const $ = id => document.getElementById(id);
  let locked = false;
  const setStatus = msg => { $('auth-status').textContent = msg; };
  const disable = msg => { $('qa-link').hidden = true; $('qa-disabled').hidden = false; $('qa-disabled').textContent = msg; };
  const allow = () => { $('qa-link').hidden = false; $('qa-disabled').hidden = true; };

  async function check() {
    if (locked) return;
    locked = true;
    $('recheck').disabled = true;
    disable('本人確認中です。');
    setStatus('CONTROL CENTERの本人確認を行っています。');
    try {
      if (typeof window.supabase?.createClient !== 'function') throw Error('SUPABASE_LIBRARY_NOT_READY');
      const res = await fetch(`${CC_API}/api/public-config`, {cache:'no-store',credentials:'omit',redirect:'error'});
      if (!res.ok) throw Error('CC_CONFIG_UNAVAILABLE');
      const cfg = await res.json();
      if (!cfg?.supabaseUrl || !(cfg.supabasePublishableKey || cfg.supabaseAnonKey)) throw Error('CC_CONFIG_INVALID');
      const client = window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey || cfg.supabaseAnonKey, {
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:cfg.sessionStorageKey || 'dpro-control-center-auth-v1'}
      });
      const {data:userData,error:userError} = await client.auth.getUser();
      if (userError || !userData?.user?.id) {setStatus('CONTROL CENTERにログインしてください。');disable('CONTROL CENTERでログインしてから再確認してください。');return;}
      const {data:aal,error:aalError} = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError || aal?.currentLevel !== 'aal2') {setStatus('CONTROL CENTERの二段階認証が必要です。');disable('CONTROL CENTER側でMFAを完了してください。');return;}
      const {data:staff,error:staffError} = await client.from('cc_staff').select('auth_user_id,role_key,status').eq('auth_user_id',userData.user.id).maybeSingle();
      if (staffError || !staff || staff.status !== 'active' || !ROLES.has(staff.role_key) || staff.auth_user_id !== userData.user.id) {
        setStatus('有効なDPRO管理者権限を確認できませんでした。');disable('担当管理者に権限を確認してください。');return;
      }
      setStatus('CONTROL CENTERのログイン・MFA・スタッフ権限を確認しました。');
      allow();
    } catch (_) {
      setStatus('認証状態を確認できませんでした。CONTROL CENTERでログイン後、再確認してください。');
      disable('認証の確認に失敗したため、隔離QAへの入口は非表示です。');
    } finally {
      locked = false;
      $('recheck').disabled = false;
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('recheck').addEventListener('click',check);
    check();
  }, {once:true});
})();
