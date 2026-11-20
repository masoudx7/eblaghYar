import { getApiUrl } from "../utils/apiHelper";

export interface WebAuthSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}

export interface WebUserProfile {
  id: string;
  email: string;
  full_name: string;
  credits: number;
  annual_expires_at: string | null;
  is_annual_active: boolean;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  created_at?: string | null;
}

export interface WebAuthResponse {
  success: boolean;
  requiresEmailVerification?: boolean;
  message?: string;
  error?: string;
  session?: WebAuthSession | null;
  user?: WebUserProfile | null;
}

const WEB_SESSION_STORAGE_KEY = "eblaghyar_web_auth_session";

export function getStoredWebSession(): WebAuthSession | null {
  try {
    const raw = localStorage.getItem(WEB_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string" && parsed.access_token.trim()) {
      return {
        access_token: parsed.access_token,
        refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : "",
        expires_at: typeof parsed.expires_at === "number" ? parsed.expires_at : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWebSession(session: WebAuthSession | null): void {
  try {
    if (!session || !session.access_token) {
      localStorage.removeItem(WEB_SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(WEB_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("Failed to persist web session:", e);
  }
}

export function clearWebSession(): void {
  try {
    localStorage.removeItem(WEB_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface WebAuthError extends Error {
  code?: string;
}

function createWebAuthError(message: string, code?: string): WebAuthError {
  const err = new Error(message) as WebAuthError;
  if (code) err.code = code;
  return err;
}

function translateRedirectErrorDescription(rawDesc: string, rawCode?: string | null): string {
  const combined = `${rawCode || ""} ${rawDesc}`.toLowerCase();
  if (combined.includes("otp_expired") || combined.includes("expired") || combined.includes("invalid")) {
    return "لینک تأیید یا بازیابی رمز منقضی یا نامعتبر شده است. لطفاً دوباره درخواست دهید.";
  }
  if (combined.includes("access_denied")) {
    return "دسترسی از طریق لینک ایمیل تأیید نشد. لطفاً دوباره تلاش کنید.";
  }
  return "اعتبارسنجی لینک ایمیل انجام نشد. لطفاً دوباره درخواست دهید.";
}

/**
 * Inspects URL hash/query params on return from Supabase email verification/recovery redirect,
 * persists tokens locally if present, and cleans the URL without any direct call to supabase.co.
 */
export function consumeWebAuthRedirectParams(): {
  authNotice: string | null;
  authError: string | null;
  hasTokens: boolean;
  isRecoveryMode: boolean;
  pendingOtp: { tokenHash: string; type: string } | null;
} {
  if (typeof window === "undefined") {
    return { authNotice: null, authError: null, hasTokens: false, isRecoveryMode: false, pendingOtp: null };
  }

  let authNotice: string | null = null;
  let authError: string | null = null;
  let hasTokens = false;
  let isRecoveryMode = false;
  let pendingOtp: { tokenHash: string; type: string } | null = null;

  try {
    const url = new URL(window.location.href);
    const authParam = url.searchParams.get("auth");
    const typeParam = url.searchParams.get("type");
    const tokenHashParam = url.searchParams.get("token_hash");
    const queryError = url.searchParams.get("error");
    const queryErrorCode = url.searchParams.get("error_code");
    const queryErrorDesc = url.searchParams.get("error_description");

    const rawHash = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
    const hashParams = rawHash ? new URLSearchParams(rawHash) : null;
    const hashError = hashParams?.get("error") || null;
    const hashErrorCode = hashParams?.get("error_code") || null;
    const hashErrorDesc = hashParams?.get("error_description") || null;

    if (hashError || hashErrorDesc || queryError || queryErrorDesc) {
      authError = translateRedirectErrorDescription(
        hashErrorDesc || queryErrorDesc || hashError || queryError || "",
        hashErrorCode || queryErrorCode
      );
    } else if (hashParams && hashParams.get("access_token")) {
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token") || "";
      const expiresAtRaw = hashParams.get("expires_at");
      const type = hashParams.get("type") || typeParam;

      if (accessToken) {
        saveWebSession({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAtRaw ? Number(expiresAtRaw) : null,
        });
        hasTokens = true;
      }

      if (type === "recovery" || authParam === "recovery") {
        isRecoveryMode = true;
        authNotice = "لینک بازیابی تأیید شد. لطفاً رمز عبور جدید حساب خود را ثبت کنید.";
      } else if (type === "signup" || authParam === "verified") {
        authNotice = "ایمیل شما با موفقیت تأیید شد و حساب کاربری شما فعال است.";
      }
    } else if (tokenHashParam) {
      pendingOtp = {
        tokenHash: tokenHashParam,
        type: typeParam || (authParam === "recovery" ? "recovery" : "signup"),
      };
    } else if (authParam === "verified") {
      authNotice = "ایمیل شما تأیید شد. اکنون می‌توانید وارد حساب کاربری خود شوید.";
    } else if (authParam === "recovery" || typeParam === "recovery") {
      isRecoveryMode = true;
      authNotice = "لینک بازیابی تأیید شد. لطفاً رمز عبور جدید حساب خود را ثبت کنید.";
    }

    const shouldCleanUrl = Boolean(
      authParam ||
        typeParam ||
        tokenHashParam ||
        queryError ||
        queryErrorCode ||
        queryErrorDesc ||
        (hashParams && (hashParams.get("access_token") || hashError || hashErrorDesc))
    );
    if (shouldCleanUrl) {
      url.searchParams.delete("auth");
      url.searchParams.delete("type");
      url.searchParams.delete("token_hash");
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  } catch {
    // ignore URL parse issues
  }

  return { authNotice, authError, hasTokens, isRecoveryMode, pendingOtp };
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractApiErrorMessage(data: any, res: Response, fallback: string): string {
  if (data?.error === "RATE_LIMIT_EXCEEDED" && typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (typeof data?.error === "string" && data.error.trim() && data.error !== "RATE_LIMIT_EXCEEDED" && data.error !== "SERVER_ERROR") {
    return data.error.trim();
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (res.status === 429) {
    return "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً دقایقی دیگر دوباره تلاش کنید.";
  }
  if (res.status >= 500) {
    return "خطای موقت در سرور احراز هویت. لطفاً لحظاتی دیگر دوباره تلاش کنید.";
  }
  return fallback;
}

async function safeAuthFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw createWebAuthError("خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.");
  }
}

export async function webRegister(
  fullName: string,
  email: string,
  password: string,
  turnstileToken?: string | null
): Promise<WebAuthResponse> {
  const res = await safeAuthFetch(getApiUrl("/api/web/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName,
      email,
      password,
      ...(turnstileToken ? { turnstileToken } : {}),
    }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "ثبت‌نام با خطا مواجه شد. لطفاً دوباره تلاش کنید."),
      data?.code
    );
  }
  if (data.session?.access_token) {
    saveWebSession(data.session);
  }
  return data;
}

export async function webLogin(email: string, password: string): Promise<WebAuthResponse> {
  const res = await safeAuthFetch(getApiUrl("/api/web/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success || !data?.session?.access_token) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "ورود به حساب انجام نشد. لطفاً اطلاعات را بررسی کنید."),
      data?.code
    );
  }
  saveWebSession(data.session);
  return data;
}

export async function webResendVerification(
  email: string,
  turnstileToken?: string | null
): Promise<{ success: boolean; message: string }> {
  const res = await safeAuthFetch(getApiUrl("/api/web/auth/resend-verification"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      ...(turnstileToken ? { turnstileToken } : {}),
    }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "ارسال مجدد ایمیل تأیید با خطا مواجه شد."),
      data?.code
    );
  }
  return {
    success: true,
    message: data.message || "لینک تأیید جدید به ایمیل شما ارسال شد.",
  };
}

export async function webVerifyOtp(
  tokenHash: string,
  type: string
): Promise<{ success: boolean; type: string; user: WebUserProfile | null }> {
  const res = await safeAuthFetch(getApiUrl("/api/web/auth/verify-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenHash, type }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success || !data?.session?.access_token) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "تأیید لینک ایمیل ناموفق بود یا لینک منقضی شده است."),
      data?.code
    );
  }
  saveWebSession(data.session);
  return {
    success: true,
    type: data.type || type,
    user: data.user || null,
  };
}

export async function webForgotPassword(
  email: string,
  turnstileToken?: string | null
): Promise<{ success: boolean; message: string }> {
  const res = await safeAuthFetch(getApiUrl("/api/web/auth/forgot-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      ...(turnstileToken ? { turnstileToken } : {}),
    }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "ارسال ایمیل بازیابی رمز با خطا مواجه شد."),
      data?.code
    );
  }
  return {
    success: true,
    message: data.message || "لینک بازیابی رمز عبور به ایمیل شما ارسال شد.",
  };
}

export async function webUpdatePassword(
  password: string
): Promise<{ success: boolean; message: string }> {
  const session = getStoredWebSession();
  if (!session?.access_token) {
    throw createWebAuthError("توکن بازیابی یافت نشد. لطفاً دوباره روی لینک ایمیل بازیابی کلیک کنید.");
  }

  let res = await safeAuthFetch(getApiUrl("/api/web/auth/update-password"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ password, refresh_token: session.refresh_token || undefined }),
  });

  if (res.status === 401 && session.refresh_token) {
    const refreshed = await webRefreshSession(session.refresh_token);
    if (refreshed?.session?.access_token) {
      res = await safeAuthFetch(getApiUrl("/api/web/auth/update-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshed.session.access_token}`,
        },
        body: JSON.stringify({ password, refresh_token: refreshed.session.refresh_token || undefined }),
      });
    }
  }

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw createWebAuthError(
      extractApiErrorMessage(data, res, "تغییر رمز عبور انجام نشد. لطفاً دوباره تلاش کنید."),
      data?.code
    );
  }
  return {
    success: true,
    message: data.message || "رمز عبور جدید با موفقیت ثبت شد.",
  };
}

export async function fetchWebConfig(): Promise<{ turnstileSiteKey: string | null }> {
  try {
    const res = await fetch(getApiUrl("/api/web/config"), { method: "GET" });
    const data = await parseJsonSafe(res);
    if (res.ok && data?.success) {
      return {
        turnstileSiteKey: typeof data.turnstileSiteKey === "string" && data.turnstileSiteKey ? data.turnstileSiteKey : null,
      };
    }
  } catch {
    // ignore
  }
  return { turnstileSiteKey: null };
}

export async function webRefreshSession(refreshToken: string): Promise<WebAuthResponse | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch(getApiUrl("/api/web/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data?.success || !data?.session?.access_token) {
      return null;
    }
    saveWebSession(data.session);
    return data;
  } catch {
    return null;
  }
}

export async function webFetchMe(): Promise<WebUserProfile | null> {
  const session = getStoredWebSession();
  if (!session?.access_token) {
    return null;
  }

  try {
    const res = await fetch(getApiUrl("/api/web/auth/me"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const data = await parseJsonSafe(res);

    if (res.ok && data?.success && data?.user) {
      return data.user as WebUserProfile;
    }

    if (res.status === 401 && session.refresh_token) {
      const refreshed = await webRefreshSession(session.refresh_token);
      if (refreshed?.user) {
        return refreshed.user;
      }
      clearWebSession();
      return null;
    }

    if (res.status === 401) {
      clearWebSession();
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export type WebProductKey = "single" | "pack_5" | "pack_10" | "annual";

export interface WebProductsMap {
  single: {
    amountRials: number;
    credits: number;
    label: string;
  };
  pack_5: {
    amountRials: number;
    credits: number;
    label: string;
  };
  pack_10: {
    amountRials: number;
    credits: number;
    label: string;
  };
  annual: {
    amountRials: number;
    dailyLimit: number;
    durationDays: number;
    label: string;
  };
}

export const DEFAULT_WEB_PRODUCTS: WebProductsMap = {
  single: {
    amountRials: 690000,
    credits: 1,
    label: "تحلیل تکی ابلاغیه (نسخه وب)",
  },
  pack_5: {
    amountRials: 2390000,
    credits: 5,
    label: "بسته ۵ عددی تحلیل ابلاغیه (نسخه وب)",
  },
  pack_10: {
    amountRials: 3690000,
    credits: 10,
    label: "بسته ۱۰ عددی تحلیل ابلاغیه (نسخه وب)",
  },
  annual: {
    amountRials: 3990000,
    dailyLimit: 3,
    durationDays: 365,
    label: "اشتراک یک‌ساله وب ابلاغ‌یار (تا ۳ تحلیل در روز)",
  },
};

export interface WebPaymentRequestResult {
  success: boolean;
  order_id: string;
  authority: string;
  product: WebProductKey;
  amount_rials: number;
  paymentUrl: string;
}

export interface WebPaymentStatusResponse {
  success: boolean;
  order_id: string;
  product: WebProductKey;
  status: "pending" | "paid" | "failed";
  amount_rials: number;
  ref_id: string | null;
  paid_at: string | null;
  entitlement_token: string | null;
  entitlement_used: boolean;
}

export interface WebPaymentReceipt {
  order_id: string;
  product: WebProductKey;
  ref_id: string | null;
  paid_at: string | null;
}

const WEB_ENTITLEMENT_STORAGE_KEY = "eblaghyar_web_entitlement_token";
const WEB_RECEIPT_STORAGE_KEY = "eblaghyar_web_last_payment_receipt";
const WEB_LAST_PENDING_ORDER_KEY = "eblaghyar_web_last_pending_order_id";
const WEB_AI_TOOLS_UNTIL_KEY = "eblaghyar_web_ai_tools_until";

export function getStoredWebAiToolsUntil(): string | null {
  try {
    const val = localStorage.getItem(WEB_AI_TOOLS_UNTIL_KEY);
    if (!val || !val.trim()) return null;
    const ms = new Date(val.trim()).getTime();
    if (!Number.isFinite(ms) || ms <= Date.now()) {
      localStorage.removeItem(WEB_AI_TOOLS_UNTIL_KEY);
      return null;
    }
    return val.trim();
  } catch {
    return null;
  }
}

export function saveWebAiToolsUntil(isoString: string | null): void {
  try {
    if (!isoString || !isoString.trim()) {
      localStorage.removeItem(WEB_AI_TOOLS_UNTIL_KEY);
      return;
    }
    localStorage.setItem(WEB_AI_TOOLS_UNTIL_KEY, isoString.trim());
  } catch {
    // ignore
  }
}

export function clearWebAiToolsUntil(): void {
  try {
    localStorage.removeItem(WEB_AI_TOOLS_UNTIL_KEY);
  } catch {
    // ignore
  }
}

export function getLastPendingWebOrderId(): string | null {
  try {
    const val = localStorage.getItem(WEB_LAST_PENDING_ORDER_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function saveLastPendingWebOrderId(orderId: string | null): void {
  try {
    if (!orderId || !orderId.trim()) {
      localStorage.removeItem(WEB_LAST_PENDING_ORDER_KEY);
      return;
    }
    localStorage.setItem(WEB_LAST_PENDING_ORDER_KEY, orderId.trim());
  } catch {
    // ignore
  }
}

export function clearLastPendingWebOrderId(): void {
  try {
    localStorage.removeItem(WEB_LAST_PENDING_ORDER_KEY);
  } catch {
    // ignore
  }
}

export function getWebAiHeaders(deviceId?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const session = getStoredWebSession();
  const entitlement = getStoredEntitlementToken();
  const resolvedDeviceId =
    deviceId || (typeof localStorage !== "undefined" ? localStorage.getItem("eblaghyar_device_id") || "" : "");

  if (resolvedDeviceId) {
    headers["x-device-id"] = resolvedDeviceId;
  }
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (entitlement) {
    headers["x-entitlement-token"] = entitlement;
  }
  return headers;
}

export function getStoredEntitlementToken(): string | null {
  try {
    const token = localStorage.getItem(WEB_ENTITLEMENT_STORAGE_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function saveEntitlementToken(token: string | null): void {
  try {
    if (!token || !token.trim()) {
      localStorage.removeItem(WEB_ENTITLEMENT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(WEB_ENTITLEMENT_STORAGE_KEY, token.trim());
  } catch (e) {
    console.warn("Failed to persist web entitlement token:", e);
  }
}

export function clearEntitlementToken(): void {
  try {
    localStorage.removeItem(WEB_ENTITLEMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getStoredWebPaymentReceipt(): WebPaymentReceipt | null {
  try {
    const raw = localStorage.getItem(WEB_RECEIPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.order_id === "string" && typeof parsed.product === "string") {
      return {
        order_id: parsed.order_id,
        product: parsed.product as WebProductKey,
        ref_id: parsed.ref_id ? String(parsed.ref_id) : null,
        paid_at: parsed.paid_at ? String(parsed.paid_at) : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWebPaymentReceipt(receipt: WebPaymentReceipt | null): void {
  try {
    if (!receipt) {
      localStorage.removeItem(WEB_RECEIPT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(WEB_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    // ignore
  }
}

export function clearWebPaymentReceipt(): void {
  try {
    localStorage.removeItem(WEB_RECEIPT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function consumeWebPaymentRedirectParams(): {
  paymentStatus: "success" | "failed" | null;
  orderId: string | null;
} {
  if (typeof window === "undefined") {
    return { paymentStatus: null, orderId: null };
  }

  try {
    const url = new URL(window.location.href);
    const payment = url.searchParams.get("payment");
    const orderId = url.searchParams.get("order_id");

    if (payment === "success" || payment === "failed") {
      url.searchParams.delete("payment");
      url.searchParams.delete("order_id");
      window.history.replaceState({}, document.title, url.pathname + url.search);
      return {
        paymentStatus: payment,
        orderId: orderId?.trim() || null,
      };
    }
  } catch {
    // ignore URL parse errors
  }

  return { paymentStatus: null, orderId: null };
}

export async function fetchWebProducts(): Promise<WebProductsMap | null> {
  try {
    const res = await fetch(getApiUrl("/api/web/products"), {
      method: "GET",
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data?.success || !data?.products) {
      return null;
    }
    return data.products as WebProductsMap;
  } catch {
    return null;
  }
}

export async function requestWebPayment(
  product: WebProductKey,
  deviceId: string
): Promise<WebPaymentRequestResult> {
  const performRequest = async (accessToken?: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    return fetch(getApiUrl("/api/web/payment/request"), {
      method: "POST",
      headers,
      body: JSON.stringify({ product, deviceId }),
    });
  };

  const session = getStoredWebSession();
  let res = await performRequest(session?.access_token);

  if (res.status === 401 && session?.refresh_token) {
    const refreshed = await webRefreshSession(session.refresh_token);
    if (refreshed?.session?.access_token) {
      res = await performRequest(refreshed.session.access_token);
    }
  }

  const data = await parseJsonSafe(res);

  if (res.status === 401) {
    const err = new Error(
      data?.error || "برای خرید این بسته یا اشتراک ابتدا باید وارد حساب کاربری خود شوید."
    ) as Error & { code?: string };
    err.code = "AUTH_REQUIRED";
    throw err;
  }

  if (!res.ok || !data?.success || !data?.paymentUrl) {
    throw new Error(data?.error || "ایجاد تراکنش پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.");
  }

  return data as WebPaymentRequestResult;
}

export async function fetchWebPaymentStatus(
  orderId: string,
  deviceId: string
): Promise<WebPaymentStatusResponse | null> {
  if (!orderId) return null;
  try {
    const session = getStoredWebSession();
    const headers: Record<string, string> = {};
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const params = new URLSearchParams({ order_id: orderId });
    if (deviceId) {
      params.set("deviceId", deviceId);
    }

    const res = await fetch(getApiUrl(`/api/web/payment/status?${params.toString()}`), {
      method: "GET",
      headers,
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data?.success) {
      return null;
    }
    return data as WebPaymentStatusResponse;
  } catch {
    return null;
  }
}

export async function recheckWebPayment(
  orderId: string,
  deviceId: string
): Promise<WebPaymentStatusResponse & { message?: string }> {
  const performRequest = async (accessToken?: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return fetch(getApiUrl("/api/web/payment/recheck"), {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: orderId, deviceId }),
    });
  };

  const session = getStoredWebSession();
  let res = await performRequest(session?.access_token);
  if (res.status === 401 && session?.refresh_token) {
    const refreshed = await webRefreshSession(session.refresh_token);
    if (refreshed?.session?.access_token) {
      res = await performRequest(refreshed.session.access_token);
    }
  }

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || data?.error || "بررسی مجدد وضعیت پرداخت انجام نشد.");
  }
  return data as WebPaymentStatusResponse & { message?: string };
}

export interface WebOrderItem {
  order_id: string;
  product: WebProductKey;
  amount_rials: number;
  status: "pending" | "paid" | "failed";
  ref_id: string | null;
  created_at: string;
  paid_at: string | null;
  granted?: boolean;
  entitlement_used: boolean;
  entitlement_token: string | null;
}

export async function fetchWebOrders(deviceId: string, orderId?: string): Promise<WebOrderItem[]> {
  const performRequest = async (accessToken?: string | null) => {
    const headers: Record<string, string> = {};
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const params = new URLSearchParams();
    if (deviceId) params.set("deviceId", deviceId);
    if (orderId) params.set("order_id", orderId);
    const queryStr = params.toString();
    return fetch(getApiUrl(`/api/web/orders${queryStr ? `?${queryStr}` : ""}`), {
      method: "GET",
      headers,
    });
  };

  const session = getStoredWebSession();
  let res = await performRequest(session?.access_token);
  if (res.status === 401 && session?.refresh_token) {
    const refreshed = await webRefreshSession(session.refresh_token);
    if (refreshed?.session?.access_token) {
      res = await performRequest(refreshed.session.access_token);
    }
  }

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || "دریافت فهرست سفارش‌ها با خطا مواجه شد.");
  }
  return Array.isArray(data.orders) ? (data.orders as WebOrderItem[]) : [];
}

export interface WebSavedAnalysisRow {
  id: string;
  file_name: string;
  title: string;
  summary: string;
  authority: string;
  urgency: "high" | "medium" | "low";
  analysis_json: any;
  created_at: string;
}

export async function fetchWebAnalyses(): Promise<WebSavedAnalysisRow[] | null> {
  const session = getStoredWebSession();
  if (!session?.access_token) return null;

  try {
    let res = await fetch(getApiUrl("/api/web/analyses"), {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 401 && session.refresh_token) {
      const refreshed = await webRefreshSession(session.refresh_token);
      if (refreshed?.session?.access_token) {
        res = await fetch(getApiUrl("/api/web/analyses"), {
          method: "GET",
          headers: { Authorization: `Bearer ${refreshed.session.access_token}` },
        });
      }
    }
    const data = await parseJsonSafe(res);
    if (!res.ok || !data?.success || !Array.isArray(data.analyses)) {
      return null;
    }
    return data.analyses as WebSavedAnalysisRow[];
  } catch {
    return null;
  }
}

export async function deleteWebAnalysis(id: string): Promise<void> {
  const session = getStoredWebSession();
  if (!session?.access_token || !id) return;
  try {
    await fetch(getApiUrl(`/api/web/analyses/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // ignore
  }
}

export async function clearWebAnalyses(): Promise<void> {
  const session = getStoredWebSession();
  if (!session?.access_token) return;
  try {
    await fetch(getApiUrl("/api/web/analyses"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // ignore
  }
}

export async function webLogout(): Promise<void> {
  const session = getStoredWebSession();
  try {
    if (session?.access_token) {
      await fetch(getApiUrl("/api/web/auth/logout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ access_token: session.access_token }),
      }).catch(() => {});
    }
  } finally {
    clearWebSession();
    clearWebAiToolsUntil();
  }
}
