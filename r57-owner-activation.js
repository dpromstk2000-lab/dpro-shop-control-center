/* DPRO #57: ephemeral owner activation for internal operator. No credentials or tokens persisted by this page. */
(() => {
  'use strict';
  const CC_API = 'https://dpro-shop-control-center-api.dpromstk2000.workers.dev';
  const AUTH_API = 'https://dpro-owner-auth-general.dpromstk2000.workers.dev';
  const identity = Object.freeze({systemCode: 'MAINTENANCE', facilityCode: 'r57-dpro-internal'});
  const facilityName = 'DPRO MAINTENANCE 内部検証';
  const $ = (name) => document.getElementById(name);
  let client = null;
  let inviteToken = null;
  let verifiedGrant = null;
  let ownerPhone = null;
  const steps = ['issue', 'phoneStep', 'otpStep', 'passwordStep', 'done'];
  const status = (text, state = 'warn') => { const el = $('status'); el.textContent = text; el.className = 'status ' + state; };
  const show = (step) => { steps.forEach((name) => { $(name).hidden = name !== step; }); };
  const busy = async (button, fn) => {
    button.disabled = true;
    try { await fn(); } catch (error) {
      const code = String(error?.code || '').replace(/[^A-Z0-9_]/gi, '').slice(0, 60);
      status((error?.message || '処理を完了できませんでした。') + (code ? `（${code}）` : ''), 'err');
    } finally { button.disabled = false; }
  };
  async function post(path, data, bearer) {
    let response;
    try {
      response = await fetch(AUTH_API + path, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(data),
      });
    } catch {
      throw Object.assign(new Error('共通認証APIとの通信が拒否されました。CORS・ネットワークの設定確認が必要です。'), {code:'AUTH_NETWORK'});
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      throw Object.assign(new Error(result.message || '認証処理が失敗しました。'), {code:result.error || `HTTP_${response.status}`});
    }
    return result;
  }
  async function init() {
    if (!window.supabase?.createClient) throw new Error('ログイン用ライブラリを読み込めませんでした。');
    const response = await fetch(CC_API + '/api/public-config', {cache:'no-store'});
    if (!response.ok) throw new Error('CONTROL CENTERの公開設定を取得できませんでした。');
    const config = await response.json();
    const apiKey = config.supabasePublishableKey || config.supabaseAnonKey;
    if (!config.supabaseUrl || !apiKey) throw new Error('CONTROL CENTERの認証設定を取得できませんでした。');
    client = window.supabase.createClient(config.supabaseUrl, apiKey, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false,
        storageKey: config.sessionStorageKey || 'dpro-control-center-auth-v1' },
    });
    const {data:{session},error:sessionError} = await client.auth.getSession();
    if (sessionError || !session) throw new Error('CONTROL CENTERにログインし、再度この画面を開いてください。');
    const {data:{user},error:userError} = await client.auth.getUser();
    if (userError || !user) throw new Error('管理者ログインを検証できませんでした。');
    const {data:aal,error:aalError} = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || aal?.currentLevel !== 'aal2') throw new Error('CONTROL CENTERで二段階認証を完了してください。');
    const {data:staff,error:staffError} = await client.from('cc_staff')
      .select('role_key,status').eq('auth_user_id',user.id).eq('status','active').maybeSingle();
    if (staffError || !staff || !['owner_admin','technical_admin'].includes(staff.role_key))
      throw new Error('招待発行の管理者権限がありません。');
    status('管理者ログイン・二段階認証・権限の確認に成功しました。次のボタンで内部検証用の招待を発行できます。', 'ok');
    show('issue');
  }
  $('issueBtn').addEventListener('click', () => busy($('issueBtn'), async () => {
    if (inviteToken) throw new Error('招待は発行済みです。');
    const ownerName = $('ownerName').value.trim();
    if (ownerName.length < 1 || ownerName.length > 80) throw new Error('登録者の表示名を入力してください。');
    const {data:{session}} = await client.auth.getSession();
    if (!session?.access_token) throw new Error('CONTROL CENTERへ再ログインしてください。');
    const result = await post('/admin/activation/invite',
      {...identity,facilityName,ownerName,expiresInHours:24},session.access_token);
    if (typeof result.activationToken !== 'string' || result.activationToken.length < 20)
      throw new Error('招待の発行結果を確認できませんでした。');
    inviteToken = result.activationToken;
    status('招待の発行が成功しました。続けて、SMSを受信できる携帯番号を入力してください。', 'ok');
    show('phoneStep');
  }));
  $('smsBtn').addEventListener('click', () => busy($('smsBtn'), async () => {
    if (!inviteToken) throw new Error('招待を発行してください。');
    const number = $('phone').value.trim();
    if (!/^(?:\+81|0)[0-9\-\s０-９ー‐‑‒–—―−]{8,22}$/.test(number))
      throw new Error('有効な携帯電話番号を入力してください。');
    const data = await post('/auth/activation/sms/request',
      {...identity,activationToken:inviteToken,phone:number});
    ownerPhone = number;
    $('phone').value = '';
    status('確認コードをSMSで送信しました。届いた6桁のコードを入力してください。', 'ok');
    show('otpStep');
  }));
  $('verifyBtn').addEventListener('click', () => busy($('verifyBtn'), async () => {
    const code = $('otp').value.trim();
    if (!/^\d{6}$/.test(code)) throw new Error('SMSの6桁のコードを入力してください。');
    const data = await post('/auth/activation/sms/verify',
      {...identity,activationToken:inviteToken,phone:ownerPhone,token:code});
    if (!data.verified || typeof data.verificationToken !== 'string' || !data.verificationToken)
      throw new Error('SMS本人確認が完了しませんでした。');
    verifiedGrant = data.verificationToken;
    $('otp').value = '';
    ownerPhone = null;
    status('SMS本人確認が成功しました。12文字以上の本番用パスワードを設定してください。', 'ok');
    show('passwordStep');
  }));
  $('passwordBtn').addEventListener('click', () => busy($('passwordBtn'), async () => {
    if (!verifiedGrant) throw new Error('SMSの本人確認が必要です。');
    const p = $('password').value;
    const p2 = $('passwordConfirm').value;
    if (p.length < 12 || p.length > 128 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p))
      throw new Error('12文字以上で英字と数字を組み合わせてください。');
    if (p !== p2) throw new Error('パスワードが一致しません。');
    const result = await post('/auth/password/set',
      {...identity,verificationToken:verifiedGrant,password:p,rememberMe:false});
    $('password').value = '';
    $('passwordConfirm').value = '';
    verifiedGrant = null;
    inviteToken = null;
    if (typeof result.sessionToken === 'string' && result.sessionToken) {
      await post('/auth/logout',{},result.sessionToken).catch(() => null);
    }
    status('正式なオーナーアカウントの初期設定が完了しました。ここから先はMAINTENANCE本番D1の会社別権限を接続します。', 'ok');
    show('done');
  }));
  init().catch((e) => status(e.message || '管理者認証を検証できませんでした。', 'err'));
})();
