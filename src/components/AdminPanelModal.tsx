import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  X,
  Search,
  UserPlus,
  Plus,
  Minus,
  RefreshCw,
  Users,
  CreditCard,
  Crown,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  KeyRound,
  User,
} from "lucide-react";
import {
  fetchAdminUsers,
  updateAdminUserCredits,
  createAdminUserAccount,
  updateAdminUserAccount,
  AdminUser,
} from "../services/adminService";

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string;
}

const toPersianDigits = (value: string | number): string => {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(value).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
};

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose, currentUserEmail }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // New user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newCredits, setNewCredits] = useState("5");
  const [isCreating, setIsCreating] = useState(false);

  // Per-user password update drawer state
  const [passwordTargetUser, setPasswordTargetUser] = useState<AdminUser | null>(null);
  const [targetNewPassword, setTargetNewPassword] = useState("");
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await fetchAdminUsers();
    setIsLoading(false);
    if (res.success && res.users) {
      setUsers(res.users);
    } else {
      setErrorMsg(res.error || "خطا در بارگذاری لیست کاربران.");
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isAdmin = currentUserEmail.toLowerCase().trim() === "masoudx7@gmail.com";
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-200 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">دسترسی غیرمجاز</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            این پنل فقط برای مدیر سیستم (masoudx7@gmail.com) قابل دسترسی است.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs hover:bg-slate-800 transition-colors cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    );
  }

  const handleAdjustCredits = async (userId: string, delta: number) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    const res = await updateAdminUserCredits(userId, delta);
    if (res.success && res.credits !== undefined) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, credits: res.credits! } : u)));
      setNoticeMsg("اعتبار کاربر با موفقیت به‌روزرسانی شد.");
      setTimeout(() => setNoticeMsg(null), 3000);
    } else {
      setErrorMsg(res.error || "خطا در تغییر اعتبار.");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    if (!newEmail || newPassword.length < 8) {
      setErrorMsg("وارد کردن ایمیل معتبر و رمز عبور حداقل ۸ کاراکتری الزامی است.");
      return;
    }

    setIsCreating(true);
    const res = await createAdminUserAccount({
      email: newEmail,
      password: newPassword,
      fullName: newFullName,
      initialCredits: parseInt(newCredits, 10) || 1,
    });
    setIsCreating(false);

    if (res.success && res.user) {
      setNoticeMsg(`کاربر ${res.user.email} با موفقیت ثبت شد.`);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewCredits("5");
      setShowCreateForm(false);
      loadUsers();
      setTimeout(() => setNoticeMsg(null), 4000);
    } else {
      setErrorMsg(res.error || "خطا در ایجاد کاربر جدید.");
    }
  };

  const handleConfirmUserEmail = async (u: AdminUser) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsUpdatingUser(true);
    const res = await updateAdminUserAccount({ userId: u.id, confirmEmail: true });
    setIsUpdatingUser(false);
    if (res.success) {
      setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, email_confirmed: true } : item)));
      setNoticeMsg(`ایمیل ${u.email} تأیید شد.`);
      setTimeout(() => setNoticeMsg(null), 3500);
    } else {
      setErrorMsg(res.error || "تأیید ایمیل انجام نشد.");
    }
  };

  const handleUpdateTargetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUser) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    if (targetNewPassword.length < 8) {
      setErrorMsg("رمز عبور جدید باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    setIsUpdatingUser(true);
    const res = await updateAdminUserAccount({
      userId: passwordTargetUser.id,
      password: targetNewPassword,
    });
    setIsUpdatingUser(false);
    if (res.success) {
      setNoticeMsg(`رمز عبور کاربر ${passwordTargetUser.email} با موفقیت تغییر یافت.`);
      setPasswordTargetUser(null);
      setTargetNewPassword("");
      setTimeout(() => setNoticeMsg(null), 4000);
    } else {
      setErrorMsg(res.error || "تغییر رمز عبور انجام نشد.");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalUsers = users.length;
  const totalCredits = users.reduce((sum, u) => sum + Number(u.credits || 0), 0);
  const activeAnnualCount = users.filter(
    (u) => u.annual_expires_at && new Date(u.annual_expires_at) > new Date()
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-[#E5E2D9] overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">پنل مدیریت ادمین ابلاغ‌یار</h2>
              <p className="text-xs text-slate-500 mt-0.5">مدیریت حساب‌های کاربری، اعتبارات و افزودن کاربر جدید</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-[#E5E2D9] text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-right">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Users className="w-5 h-5 text-blue-100" />
              </div>
              <div>
                <p className="text-[11px] text-blue-800 font-bold">کل کاربران ثبت‌شده</p>
                <p className="text-lg font-black text-blue-950 tabular-nums mt-0.5">{toPersianDigits(totalUsers)} نفر</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <CreditCard className="w-5 h-5 text-amber-100" />
              </div>
              <div>
                <p className="text-[11px] text-amber-800 font-bold">مجموع اعتبارات کل</p>
                <p className="text-lg font-black text-amber-950 tabular-nums mt-0.5">{toPersianDigits(totalCredits)} تحلیل</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Crown className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <p className="text-[11px] text-emerald-800 font-bold">اشتراک سالیانه فعال</p>
                <p className="text-lg font-black text-emerald-950 tabular-nums mt-0.5">{toPersianDigits(activeAnnualCount)} اکانت</p>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}
          {noticeMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{noticeMsg}</span>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="جستجو بر اساس ایمیل یا نام کاربر..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-500 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadUsers}
                disabled={isLoading}
                className="py-2.5 px-3.5 bg-white border border-[#E5E2D9] hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>بروزرسانی</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-blue-300" />
                <span>{showCreateForm ? "بستن فرم ثبت‌نام" : "ثبت کاربر جدید"}</span>
              </button>
            </div>
          </div>

          {/* Create User Form Drawer */}
          {showCreateForm && (
            <form onSubmit={handleCreateUser} className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E5E2D9] space-y-4 animate-in fade-in">
              <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-[#EBE8E0] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-slate-700" />
                <span>ایجاد حساب کاربری جدید توسط ادمین</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ایمیل کاربر</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full pr-9 pl-3 py-2 bg-white border border-[#E5E2D9] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-500"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">رمز عبور (حداقل ۸ کاراکتر)</label>
                  <div className="relative">
                    <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pr-9 pl-3 py-2 bg-white border border-[#E5E2D9] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-500"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">نام کامل (اختیاری)</label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="نام و نام خانوادگی"
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="w-full pr-9 pl-3 py-2 bg-white border border-[#E5E2D9] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">اعتبار اولیه (تعداد تحلیل)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newCredits}
                    onChange={(e) => setNewCredits(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E5E2D9] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-500 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="py-2 px-4 bg-white border border-[#E5E2D9] text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="py-2 px-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isCreating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>ثبت و ایجاد حساب</span>
                </button>
              </div>
            </form>
          )}

          {/* Password Reset Drawer */}
          {passwordTargetUser && (
            <form onSubmit={handleUpdateTargetPassword} className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-700" />
                  <span>تغییر رمز عبور برای <span dir="ltr" className="font-mono">{passwordTargetUser.email}</span></span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordTargetUser(null);
                    setTargetNewPassword("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  بستن
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="رمز عبور جدید (حداقل ۸ کاراکتر)"
                  value={targetNewPassword}
                  onChange={(e) => setTargetNewPassword(e.target.value)}
                  dir="ltr"
                  className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  ذخیره رمز جدید
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="border border-[#E5E2D9] rounded-2xl overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E5E2D9] text-[11px] font-black text-slate-700">
                    <th className="py-3 px-4">کاربر / ایمیل</th>
                    <th className="py-3 px-3 text-center">اعتبار باقی‌مانده</th>
                    <th className="py-3 px-3 text-center">وضعیت حساب</th>
                    <th className="py-3 px-3 text-center">تاریخ ثبت‌نام</th>
                    <th className="py-3 px-4 text-center">مدیریت اعتبار و حساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBE8E0] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                        در حال بارگذاری لیست کاربران...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                        کاربری یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isAnnual = u.annual_expires_at && new Date(u.annual_expires_at) > new Date();
                      return (
                        <tr key={u.id} className="hover:bg-[#FAF8F5]/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{u.full_name || "بدون نام"}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5" dir="ltr">
                              {u.email}
                            </p>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-black text-xs tabular-nums border border-amber-200">
                              {toPersianDigits(u.credits)} تحلیل
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {isAnnual ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                                  سالیانه فعال
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">عادی</span>
                              )}
                              {u.email_confirmed === false && (
                                <button
                                  type="button"
                                  disabled={isUpdatingUser}
                                  onClick={() => handleConfirmUserEmail(u)}
                                  className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] cursor-pointer"
                                >
                                  تأیید ایمیل
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-center text-slate-500 text-[11px] tabular-nums">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString("fa-IR") : "نامشخص"}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                title="کاهش ۱ اعتبار"
                                onClick={() => handleAdjustCredits(u.id, -1)}
                                className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="افزایش ۱ اعتبار"
                                onClick={() => handleAdjustCredits(u.id, 1)}
                                className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="افزایش ۵ اعتبار"
                                onClick={() => handleAdjustCredits(u.id, 5)}
                                className="px-2.5 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center transition-colors cursor-pointer"
                              >
                                +۵
                              </button>
                              <button
                                type="button"
                                title="تغییر رمز عبور کاربر"
                                onClick={() => {
                                  setPasswordTargetUser(u);
                                  setTargetNewPassword("");
                                }}
                                className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            مدیریت امن پایگاه داده و حساب‌های کاربری ابلاغ‌یار
          </p>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            بستن پنل
          </button>
        </div>
      </div>
    </div>
  );
};
