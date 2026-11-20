import { getApiUrl } from "../utils/apiHelper";
import { getStoredWebSession, webRefreshSession } from "./webAuth";

export interface AdminUser {
  id: string;
  email: string;
  full_name?: string | null;
  credits: number;
  annual_expires_at?: string | null;
  last_analysis_date?: string | null;
  daily_analyses_count?: number;
  created_at?: string | null;
  email_confirmed?: boolean;
}

async function adminAuthorizedFetch(path: string, init: RequestInit = {}): Promise<any> {
  const session = getStoredWebSession();
  const token = session?.access_token;
  if (!token) {
    return { success: false, error: "توکن احراز هویت یافت نشد." };
  }

  const perform = (accessToken: string) =>
    fetch(getApiUrl(path), {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  try {
    let res = await perform(token);
    if (res.status === 401 && session.refresh_token) {
      const refreshed = await webRefreshSession(session.refresh_token);
      if (refreshed?.session?.access_token) {
        res = await perform(refreshed.session.access_token);
      }
    }
    const data = await res.json().catch(() => null);
    if (!data) {
      return { success: false, error: "پاسخ نامعتبر از سرور دریافت شد." };
    }
    return data;
  } catch {
    return { success: false, error: "خطا در برقراری ارتباط با سرور." };
  }
}

export async function fetchAdminUsers(): Promise<{ success: boolean; users?: AdminUser[]; error?: string }> {
  return adminAuthorizedFetch("/api/admin/users");
}

export async function updateAdminUserCredits(
  userId: string,
  delta?: number,
  absoluteCredits?: number
): Promise<{ success: boolean; credits?: number; error?: string }> {
  return adminAuthorizedFetch("/api/admin/users/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, delta, absoluteCredits }),
  });
}

export async function createAdminUserAccount(userData: {
  email: string;
  password: string;
  fullName?: string;
  initialCredits?: number;
}): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  return adminAuthorizedFetch("/api/admin/users/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
}

export async function updateAdminUserAccount(payload: {
  userId: string;
  password?: string;
  confirmEmail?: boolean;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  return adminAuthorizedFetch("/api/admin/users/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
