'use client';

import React from 'react';
import { Reply } from 'lucide-react';
import { LogoutButton } from './LogoutButton';

interface SidebarHeaderProps {
  username: string;
  onLogout: () => void;
  onOpenAutoReply: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  username,
  onLogout,
  onOpenAutoReply,
}) => {
  return (
    <div className="h-[72px] px-5 flex items-center justify-between border-b border-[#F1F5F9] shrink-0">
      <div>
        <h1 className="text-[24px] font-bold text-[#111827] leading-none tracking-tight">
          Chats
        </h1>
        <p className="text-[12px] text-[#6B7280] mt-1">Signed in as {username}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenAutoReply}
          title="Auto-reply rules"
          aria-label="Auto-reply rules"
          className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-[#F8FAFC] rounded-lg transition-colors duration-120 focus:outline-none focus:ring-1 focus:ring-[#E5E7EB]"
        >
          <Reply size={18} color="#6B7280" />
        </button>
        <LogoutButton onLogout={onLogout} />
      </div>
    </div>
  );
};