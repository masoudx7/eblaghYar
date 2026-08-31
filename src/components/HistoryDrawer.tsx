import React from "react";
import { X, Trash2, Clock, FileText, ArrowLeft, AlertTriangle } from "lucide-react";
import { AnalysisHistoryItem } from "../types";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: AnalysisHistoryItem[];
  onSelectHistoryItem: (item: AnalysisHistoryItem) => void;
  onClearHistory: () => void;
  onDeleteHistoryItem: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectHistoryItem,
  onClearHistory,
  onDeleteHistoryItem,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col border-r border-[#E5E2D9]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5E2D9] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#7A8C70]" />
            <h3 className="font-bold text-[#4A4844] text-base">
              تاریخچه تحلیل‌های شما
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBFAF7]/40">
          {history.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <FileText className="w-10 h-10 text-[#D1CEC4] mx-auto" />
              <p className="text-sm font-semibold text-[#4A4844]">
                هنوز ابلاغیه‌ای تحلیل نشده است
              </p>
              <p className="text-xs text-[#7A7874]">
                پس از تحلیل هر فایل پی‌دی‌اف یا متن، سوابق آن در مرورگر شما ذخیره خواهد شد.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl border border-[#E5E2D9] hover:border-[#7A8C70] hover:bg-[#F0F4EF]/40 transition-all group relative bg-white shadow-xs"
              >
                <div
                  onClick={() => {
                    onSelectHistoryItem(item);
                    onClose();
                  }}
                  className="cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#3D3B38] line-clamp-1 group-hover:text-[#5A6D52]">
                      {item.analysis?.title || item.fileName}
                    </span>
                    <span className="text-[10px] text-[#A8A59D] shrink-0">
                      {item.date}
                    </span>
                  </div>

                  <p className="text-xs text-[#5C5A55] line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-[#7A7874]">
                      {item.authority}
                    </span>
                    <span className="text-[#5A6D52] font-semibold flex items-center gap-1 group-hover:-translate-x-1 transition-transform">
                      <span>مشاهده</span>
                      <ArrowLeft className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHistoryItem(item.id);
                  }}
                  className="absolute top-3 left-3 p-1 rounded-lg text-[#D1CEC4] hover:text-[#8B4513] hover:bg-[#FAF0ED] transition-colors cursor-pointer"
                  title="حذف از تاریخچه"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-[#E5E2D9] bg-[#FAF8F5] flex items-center justify-between">
            <button
              onClick={onClearHistory}
              className="flex items-center gap-1.5 text-xs text-[#8B4513] hover:text-[#70360D] font-semibold hover:bg-[#FAF0ED] px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>پاک‌سازی تمام تاریخچه</span>
            </button>
            <span className="text-xs text-[#7A7874]">
              {history.length} مورد ذخیره شده
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
