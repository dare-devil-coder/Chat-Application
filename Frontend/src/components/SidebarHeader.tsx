'use client';

import React from 'react';
import { LogoutButton } from './LogoutButton';

interface SidebarHeaderProps {
  username: string;
  onLogout: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ username, onLogout }) => {
  return (
    <div className="h-[72px] px-5 flex items-center justify-between border-b border-[#F1F5F9] shrink-0">
      <div>
        <h1 className="text-[24px] font-bold text-[#111827] leading-none tracking-tight">
          Chats
        </h1>
        <p className="text-[12px] text-[#6B7280] mt-1">Signed in as {username}</p>
      </div>
      <LogoutButton onLogout={onLogout} />
    </div>
  );
};