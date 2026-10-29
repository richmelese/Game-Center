/**
 * telebirr SuperApp mini-app bridge.
 * Inside the SuperApp the H5 page asks the host app for an auth token, which the backend
 * exchanges for the customer's identity (POST /auth/telebirr). Outside the SuperApp
 * (normal browser) this resolves to null and the customer logs in with a phone OTP.
 * The exact bridge contract must be confirmed during telebirr onboarding (proposal 4.2).
 */
declare global {
  interface Window {
    consumerapp?: { evaluate: (payload: string) => void };
    handleinitDataCallback?: (data: string) => void;
  }
}

export const isInSuperApp = () => typeof window !== 'undefined' && !!window.consumerapp;

export function requestTelebirrAuthToken(timeoutMs = 8000): Promise<string | null> {
  const appId = import.meta.env.VITE_TELEBIRR_MINIAPP_ID;
  if (!isInSuperApp() || !appId) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    window.handleinitDataCallback = (data: string) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data);
        resolve(parsed?.token ?? parsed?.authToken ?? null);
      } catch {
        resolve(typeof data === 'string' && data ? data : null);
      }
    };
    window.consumerapp!.evaluate(
      JSON.stringify({
        functionName: 'js_fun_h5GetAccessToken',
        params: { appid: appId, functionCallBackName: 'handleinitDataCallback' },
      }),
    );
  });
}

/**
 * telebirr SuperApp native in-app payment bridge (trade_type InApp).
 *
 * NOT YET WIRED: unlike requestTelebirrAuthToken above, no reference implementation for
 * the native pay call exists yet — the bridge function name and its parameter shape are
 * both unconfirmed. This throws until it's filled in from telebirr's native payment SDK
 * docs; callers should catch it and fall back to the web H5 checkout, which is confirmed
 * working end to end against telebirr's sandbox.
 */
export function payWithTelebirrNative(_nativeRawRequest: string): Promise<void> {
  return Promise.reject(
    new Error(
      'payWithTelebirrNative is not implemented — needs the SuperApp native pay bridge function name and parameters from telebirr’s SDK docs',
    ),
  );
}
