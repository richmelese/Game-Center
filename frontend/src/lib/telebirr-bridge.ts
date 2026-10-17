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
  const appId = process.env.NEXT_PUBLIC_TELEBIRR_MINIAPP_ID;
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
