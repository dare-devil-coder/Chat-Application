'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { User } from '../data/mockData';

interface ChatHeaderProps {
  user: User;
  onBack?: () => void;
}

// Top bar of the active conversation area
// Displays the contact's avatar, active name, and status (Online/Offline or AI Assistant)
// constrained to 72px height and 16px 24px padding.
export const ChatHeader: React.FC<ChatHeaderProps> = ({ user, onBack }) => {
  return (
    <header className="h-[72px] bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile back navigation button to return to the sidebar */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden mr-1 text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
            aria-label="Back to conversations"
          >
            Chats
          </button>
        )}

        {/* Specialized AI avatar or student initials avatar */}
        {user.isAI ? (
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-[12px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center justify-center">
              <Bot size={20} color="#4F46E5" />
            </div>
          </div>
        ) : (
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#E5E7EB] flex items-center justify-center text-[14px] font-semibold text-[#374151]">
              {user.initials}
            </div>
            {/* 8px online/offline indicator dot */}
            <span
              className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white"
              style={{
                backgroundColor: user.isOnline ? '#22C55E' : '#9CA3AF',
              }}
            />
          </div>
        )}

        {/* Contact Name & Status metadata */}
        <div className="flex flex-col">
          <h2 className="text-[15px] font-semibold text-[#111827] leading-tight">
            {user.name}
          </h2>
          <span className="text-[12px] text-[#6B7280] leading-tight">
            {user.isAI ? 'AI Assistant' : user.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
};
