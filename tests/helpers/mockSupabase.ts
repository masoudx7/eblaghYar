import crypto from "node:crypto";

export interface MockUserRecord {
  id: string;
  email: string;
  password: string;
  user_metadata: { full_name?: string };
  accessToken: string;
  refreshToken: string;
}

export class InMemorySupabaseStore {
  tables: Record<string, any[]> = {
    devices: [],
    usage_logs: [],
    consumed_purchase_tokens: [],
    legacy_zarinpal_orders: [],
    profiles: [],
    payments: [],
    web_analyses: [],
    web_usage_logs: [],
  };

  users = new Map<string, MockUserRecord>(); // id -> user
  usersByEmail = new Map<string, MockUserRecord>();
  usersByAccessToken = new Map<string, MockUserRecord>();
  usersByRefreshToken = new Map<string, MockUserRecord>();
  lastResetEmailOptions: any = null;

  reset() {
    for (const key of Object.keys(this.tables)) {
      this.tables[key] = [];
    }
    this.users.clear();
    this.usersByEmail.clear();
    this.usersByAccessToken.clear();
    this.usersByRefreshToken.clear();
    this.lastResetEmailOptions = null;
  }

  seedUser(opts: {
    id?: string;
    email: string;
    password?: string;
    fullName?: string;
    credits?: number;
    annualExpiresAt?: string | null;
    dailyAnalysesCount?: number;
    lastAnalysisDate?: string | null;
  }): MockUserRecord {
    const id = opts.id || crypto.randomUUID();
    const record: MockUserRecord = {
      id,
      email: opts.email.toLowerCase(),
      password: opts.password || "SecretPass123!",
      user_metadata: { full_name: opts.fullName || "کاربر تست" },
      accessToken: `acc_${crypto.randomUUID()}`,
      refreshToken: `ref_${crypto.randomUUID()}`,
    };
    this.users.set(id, record);
    this.usersByEmail.set(record.email, record);
    this.usersByAccessToken.set(record.accessToken, record);
    this.usersByRefreshToken.set(record.refreshToken, record);

    this.tables.profiles.push({
      id,
      email: record.email,
      full_name: record.user_metadata.full_name,
      credits: opts.credits ?? 0,
      annual_expires_at: opts.annualExpiresAt ?? null,
      daily_analyses_count: opts.dailyAnalysesCount ?? 0,
      last_analysis_date: opts.lastAnalysisDate ?? null,
      created_at: new Date().toISOString(),
    });
    return record;
  }

  seedPayment(row: Partial<any> & { product: string; status: string; amount_rials: number }) {
    const fullRow = {
      id: row.id || crypto.randomUUID(),
      user_id: row.user_id ?? null,
      device_id: row.device_id ?? null,
      product: row.product,
      amount_rials: row.amount_rials,
      authority: row.authority ?? `A00000000000000000000000000${Math.random().toString(36).slice(2, 10)}`,
      ref_id: row.ref_id ?? null,
      status: row.status,
      entitlement_token: row.entitlement_token ?? crypto.randomUUID(),
      entitlement_used: row.entitlement_used ?? false,
      granted_at: row.granted_at ?? null,
      created_at: row.created_at || new Date().toISOString(),
      paid_at: row.paid_at ?? null,
    };
    this.tables.payments.push(fullRow);
    return fullRow;
  }
}

function applyDefaults(table: string, row: any) {
  const copy = { ...row };
  const nowIso = new Date().toISOString();
  if (table === "payments") {
    if (!copy.id) copy.id = crypto.randomUUID();
    if (!copy.entitlement_token) copy.entitlement_token = crypto.randomUUID();
    if (copy.entitlement_used === undefined) copy.entitlement_used = false;
    if (!copy.created_at) copy.created_at = nowIso;
  } else if (table === "profiles") {
    if (copy.credits === undefined) copy.credits = 0;
    if (copy.daily_analyses_count === undefined) copy.daily_analyses_count = 0;
    if (!copy.created_at) copy.created_at = nowIso;
  } else if (table === "web_analyses" || table === "web_usage_logs" || table === "legacy_zarinpal_orders") {
    if (!copy.id) copy.id = crypto.randomUUID();
    if (!copy.created_at) copy.created_at = nowIso;
  } else if (table === "devices") {
    if (!copy.created_at) copy.created_at = nowIso;
  } else if (table === "usage_logs") {
    if (!copy.id) copy.id = Math.floor(Math.random() * 1_000_000_000);
    if (!copy.created_at) copy.created_at = nowIso;
  }
  return copy;
}

class MockQueryBuilder {
  private store: InMemorySupabaseStore;
  private table: string;
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: any = null;
  private upsertOpts: any = null;
  private filters: Array<(row: any) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private maxRows: number | null = null;
  private returnSelect = false;
  private expectMode: "many" | "single" | "maybeSingle" = "many";

  constructor(store: InMemorySupabaseStore, table: string) {
    this.store = store;
    this.table = table;
  }

  select(_cols?: string) {
    if (this.op !== "select") {
      this.returnSelect = true;
    }
    return this;
  }

  insert(rows: any) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: any) {
    this.op = "update";
    this.payload = patch;
    return this;
  }

  upsert(rows: any, opts?: any) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOpts = opts || {};
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((row) => row?.[col] === val);
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push((row) => Array.isArray(vals) && vals.includes(row?.[col]));
    return this;
  }

  is(col: string, val: any) {
    this.filters.push((row) => (val === null ? row?.[col] === null || row?.[col] === undefined : row?.[col] === val));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.maxRows = n;
    return this;
  }

  single() {
    this.expectMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.expectMode = "maybeSingle";
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: any; error: any }> {
    const rows = this.store.tables[this.table] || (this.store.tables[this.table] = []);
    const matches = (r: any) => this.filters.every((fn) => fn(r));

    if (this.op === "insert") {
      const inserted: any[] = [];
      for (const raw of this.payload) {
        if (this.table === "consumed_purchase_tokens") {
          const exists = rows.some((r) => r.purchase_token === raw.purchase_token);
          if (exists) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
        }
        if (this.table === "devices" && raw.device_id) {
          const exists = rows.some((r) => r.device_id === raw.device_id);
          if (exists) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
        }
        const item = applyDefaults(this.table, raw);
        rows.push(item);
        inserted.push({ ...item });
      }
      if (!this.returnSelect && this.expectMode === "many") {
        return { data: null, error: null };
      }
      return this.formatResult(inserted);
    }

    if (this.op === "upsert") {
      const conflictCol = this.upsertOpts?.onConflict || "id";
      const ignoreDuplicates = Boolean(this.upsertOpts?.ignoreDuplicates);
      const out: any[] = [];
      for (const raw of this.payload) {
        const idx = rows.findIndex((r) => r[conflictCol] === raw[conflictCol]);
        if (idx >= 0) {
          if (!ignoreDuplicates) {
            Object.assign(rows[idx], raw);
          }
          out.push({ ...rows[idx] });
        } else {
          const item = applyDefaults(this.table, raw);
          rows.push(item);
          out.push({ ...item });
        }
      }
      return this.formatResult(out);
    }

    if (this.op === "update") {
      const updated: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (matches(rows[i])) {
          Object.assign(rows[i], this.payload);
          updated.push({ ...rows[i] });
        }
      }
      return this.formatResult(updated);
    }

    if (this.op === "delete") {
      const remaining: any[] = [];
      const removed: any[] = [];
      for (const r of rows) {
        if (matches(r)) removed.push(r);
        else remaining.push(r);
      }
      this.store.tables[this.table] = remaining;
      return this.formatResult(removed);
    }

    let result = rows.filter(matches).map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result.sort((a, b) => {
        const va = String(a?.[col] ?? "");
        const vb = String(b?.[col] ?? "");
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    if (this.maxRows !== null) {
      result = result.slice(0, this.maxRows);
    }
    return this.formatResult(result);
  }

  private formatResult(arr: any[]) {
    if (this.expectMode === "single") {
      if (arr.length === 0) {
        return { data: null, error: { code: "PGRST116", message: "Row not found" } };
      }
      return { data: arr[0], error: null };
    }
    if (this.expectMode === "maybeSingle") {
      return { data: arr[0] ?? null, error: null };
    }
    return { data: arr, error: null };
  }
}

export function createMockSupabaseClients(store: InMemorySupabaseStore) {
  const buildAuthApi = () => ({
    async getUser(token: string) {
      const user = store.usersByAccessToken.get(token);
      if (!user) {
        return { data: { user: null }, error: { message: "invalid jwt" } };
      }
      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
          },
        },
        error: null,
      };
    },
    async signUp(opts: { email: string; password: string; options?: any }) {
      const email = opts.email.toLowerCase();
      if (store.usersByEmail.has(email)) {
        return {
          data: { user: { id: "dup", identities: [] }, session: null },
          error: null,
        };
      }
      const user = store.seedUser({
        email,
        password: opts.password,
        fullName: opts.options?.data?.full_name || "",
      });
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: user.user_metadata, identities: [{ id: user.id }] },
          session: {
            access_token: user.accessToken,
            refresh_token: user.refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      };
    },
    async signInWithPassword(opts: { email: string; password: string }) {
      const user = store.usersByEmail.get(opts.email.toLowerCase());
      if (!user || user.password !== opts.password) {
        return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
      }
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
          session: {
            access_token: user.accessToken,
            refresh_token: user.refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      };
    },
    async refreshSession(opts: { refresh_token: string }) {
      const user = store.usersByRefreshToken.get(opts.refresh_token);
      if (!user) {
        return { data: { user: null, session: null }, error: { message: "Invalid refresh token" } };
      }
      const newAccess = `acc_${crypto.randomUUID()}`;
      store.usersByAccessToken.delete(user.accessToken);
      user.accessToken = newAccess;
      store.usersByAccessToken.set(newAccess, user);
      return {
        data: {
          user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
          session: {
            access_token: newAccess,
            refresh_token: user.refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      };
    },
    async resetPasswordForEmail(email: string, options?: any) {
      store.lastResetEmailOptions = { email, options };
      return { data: {}, error: null };
    },
    admin: {
      async signOut(_token: string) {
        return { error: null };
      },
      async updateUserById(userId: string, attrs: { password?: string }) {
        const user = store.users.get(userId);
        if (!user) return { error: { message: "User not found" } };
        if (attrs.password) user.password = attrs.password;
        return { data: { user }, error: null };
      },
    },
  });

  const serviceClient: any = {
    from(table: string) {
      return new MockQueryBuilder(store, table);
    },
    async rpc(fnName: string, args: any) {
      if (fnName === "increment_profile_credits") {
        const prof = store.tables.profiles.find((p) => p.id === args?.p_user_id);
        if (!prof) return { error: { message: "Profile not found" } };
        prof.credits = Number(prof.credits || 0) + Number(args?.p_delta || 0);
        return { data: prof.credits, error: null };
      }
      return { error: { message: `Unknown RPC: ${fnName}` } };
    },
    auth: buildAuthApi(),
  };

  const authClient: any = {
    auth: buildAuthApi(),
  };

  return { serviceClient, authClient };
}

export function buildSampleNoticeAnalysis() {
  return {
    isJudicialNotice: true,
    rejectionReason: "",
    title: "احضاریه شعبه سوم دادیاری دادسرای عمومی و انقلاب تهران",
    urgencyLevel: "high",
    urgencyReason: "مهلت ۵ روزه برای حضور در شعبه جهت اخذ توضیح",
    summaryInSimpleWords: "شما باید ظرف ۵ روز از تاریخ ابلاغ در شعبه سوم دادیاری حاضر شوید.",
    caseDetails: {
      caseType: "کیفری",
      userRole: "مشتکی‌عنه",
      issuingAuthority: "دادسرای عمومی و انقلاب تهران - شعبه سوم دادیاری",
      caseNumber: "140391000123456",
      archiveNumber: "0300412",
      noticeNumber: "140390009988",
      noticeDate: "1403/11/10",
      subject: "اخذ توضیح",
      otherParties: ["شرکت نمونه"],
    },
    deadlines: {
      durationDays: 5,
      deadlineDescription: "۵ روز کاری جهت حضور در شعبه",
      legalBasis: "ماده ۱۶۸ قانون آیین دادرسی کیفری",
      calculationRule: "روز ابلاغ و روز اقدام محاسبه نمی‌شود",
      exactEventDate: "1403/11/16",
      exactEventTime: "09:30",
      isAttendanceRequired: true,
    },
    actionItems: [
      {
        step: 1,
        title: "حضور به موقع در شعبه",
        stage: "تحقیقات مقدماتی",
        description: "با مدارک هویتی در شعبه حاضر شوید.",
        legalReference: "ماده ۱۶۸ آ.د.ک",
        timingAdvice: "صبح قبل از ساعت ۹:۳۰",
        practicalTip: "پرینت ابلاغیه را همراه داشته باشید",
        locationOrMethod: "حضوری در شعبه سوم دادیاری",
        requiredDocuments: ["کارت ملی", "پرینت ابلاغیه"],
      },
    ],
    consequencesOfInaction: ["صدور دستور جلب در صورت عدم حضور بدون عذر موجه"],
    glossary: [{ term: "احضاریه", plainMeaning: "دعوت‌نامه رسمی مرجع قضایی برای حضور" }],
    sampleDraftLayehe: {
      title: "لایحه اعلام حضور",
      description: "نمونه اولیه لایحه",
      draftText: "بسمه تعالی، ریاست محترم شعبه...",
    },
    importantNotes: ["حتماً کد رهگیری ثنا را همراه داشته باشید."],
  };
}
