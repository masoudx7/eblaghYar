import React from 'react';
import { X, Scale } from 'lucide-react';
import { Lawyer, JudicialNoticeAnalysis, AuthUser } from '../types';
import { LawyersSection } from './LawyersSection';

interface LawyersDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLawyer: (lawyer: Lawyer) => void;
  currentAnalysis?: JudicialNoticeAnalysis | null;
  currentUser?: AuthUser | null;
}

export const LawyersDirectoryModal: React.FC<LawyersDirectoryModalProps> = ({
  isOpen,
  onClose,
  onSelectLawyer,
  currentAnalysis,
  currentUser,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#3D3B38]/60 backdrop-blur-xs animate-in fade-in duration-200 text-right">
      <div
        id="lawyers-directory-modal"
        className="relative w-full max-w-5xl bg-[#FAF8F5] rounded-3xl shadow-2xl border border-[#E5E2D9] overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="p-4 sm:p-5 border-b border-[#E5E2D9] bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#7A8C70] text-white flex items-center justify-center shadow-xs shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#3D3B38] text-base">
                بانک وکلای برگزیده و متخصص دادگستری
              </h3>
              <p className="text-xs text-[#7A7874] mt-0.5">
                جستجو، فیلتر استانی و ارتباط مستقیم با وکلای پایه یک سراسر کشور
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#7A7874] hover:text-[#3D3B38] hover:bg-[#F3F1ED] transition-colors cursor-pointer"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto">
          <LawyersSection
            currentAnalysis={currentAnalysis}
            currentUser={currentUser}
            onSelectLawyer={(lawyer) => {
              onClose();
              onSelectLawyer(lawyer);
            }}
            isEmbeddedInAnalysis={false}
          />
        </div>
      </div>
    </div>
  );
};
