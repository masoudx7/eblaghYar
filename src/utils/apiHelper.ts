/**
 * Helper to safely make API requests and parse JSON responses.
 * Includes automatic retry for transient dev server restarts / proxy warmups.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const DEFAULT_API_BASE = "https://eblagh-yar.vercel.app";

export function getApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string" && input.startsWith("/api")) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;
    const cleanBase = baseUrl.replace(/\/+$/, "");
    return `${cleanBase}${input}`;
  }
  return input;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retriesLeft = 2
): Promise<T> {
  const resolvedInput = getApiUrl(input);
  let res: Response;
  try {
    res = await fetch(resolvedInput, init);
  } catch (networkErr: any) {
    if (retriesLeft > 0) {
      await sleep(1500);
      return safeFetchJson<T>(input, init, retriesLeft - 1);
    }
    throw new Error(
      "عدم برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کرده و روی «تلاش مجدد» بزنید."
    );
  }

  const contentType = res.headers.get("content-type") || "";

  // If response is not JSON (e.g. HTML error page from proxy/container during restart)
  if (!contentType.includes("application/json")) {
    const rawText = await res.text().catch(() => "");
    console.warn(`[API Info] Non-JSON response (${res.status}) from ${String(input)}:`, rawText.slice(0, 150));

    // Transient server restart states (404/502/503/504) -> auto-retry
    if ((res.status === 404 || res.status === 502 || res.status === 503 || res.status === 504) && retriesLeft > 0) {
      await sleep(1800);
      return safeFetchJson<T>(input, init, retriesLeft - 1);
    }

    if (res.status === 413) {
      throw new Error("حجم فایل ارسالی بیش از حد مجاز سرور است. لطفاً فایلی با حجم کمتر انتخاب فرمایید.");
    }
    if (res.status === 404) {
      throw new Error("سرور در حال بارگذاری مجدد بود. لطفاً دکمه «تلاش مجدد» را بزنید یا صفحه را رفرش فرمایید.");
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error("سرویس هوش مصنوعی در حال راه‌اندازی است. لطفاً دکمه «تلاش مجدد» را بزنید.");
    }
    throw new Error(
      "سرور در حال آماده‌سازی است. لطفاً دکمه «تلاش مجدد» را انتخاب کنید."
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error("[API Error] JSON parse failure:", parseErr);
    if (retriesLeft > 0) {
      await sleep(1500);
      return safeFetchJson<T>(input, init, retriesLeft - 1);
    }
    throw new Error("خطا در پردازش اطلاعات دریافتی از سرور. لطفاً دوباره تلاش نمایید.");
  }

  if (!res.ok) {
    // If backend reports temporary traffic spike or 503, retry automatically
    if ((res.status === 503 || data?.isTemporary) && retriesLeft > 0) {
      await sleep(2000);
      return safeFetchJson<T>(input, init, retriesLeft - 1);
    }
    const errorMsg = data?.error || data?.message || `خطا در پردازش درخواست (${res.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}

