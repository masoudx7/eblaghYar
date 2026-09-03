/**
 * Helper to safely make API requests and parse JSON responses.
 * Prevents "JSON.parse: unexpected character at line 1 column 1" when server
 * returns HTML (e.g. 502/503 during restart, 404, or Express error pages).
 */

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (networkErr: any) {
    throw new Error(
      "عدم برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کرده و مجدداً تلاش کنید."
    );
  }

  const contentType = res.headers.get("content-type") || "";

  // If response is not JSON (e.g. HTML error page from Vite / proxy)
  if (!contentType.includes("application/json")) {
    const rawText = await res.text().catch(() => "");
    console.error(`[API Error] Non-JSON response received from ${input}:`, rawText.slice(0, 200));

    if (res.status === 413) {
      throw new Error("حجم فایل ارسالی بیش از حد مجاز سرور است. لطفاً فایلی با حجم کمتر انتخاب فرمایید.");
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error("سرویس در حال آماده‌سازی یا راه‌اندازی است. لطفاً چند لحظه دیگر دکمه «تلاش مجدد» را بزنید.");
    }
    if (res.status === 404) {
      throw new Error("مسیر مورد نظر در سرور یافت نشد. لطفاً صفحه را تازه‌سازی کنید.");
    }
    throw new Error(
      "پاسخ دریافتی از سرور در قالب استاندارد نیست. سرور ممکن است در حال شروع به کار باشد؛ لطفاً دوباره تلاش کنید."
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error("[API Error] JSON parse failure:", parseErr);
    throw new Error("خطا در پردازش اطلاعات دریافتی از سرور. لطفاً دوباره تلاش نمایید.");
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `خطا در پردازش درخواست (${res.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}
