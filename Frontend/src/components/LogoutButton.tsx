'use client';

import React from 'react';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  onLogout: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ onLogout }) => {
  return (
    <button
      type="button"
      title="Log out"
      aria-label="Log out"
      className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-[#F8FAFC] rounded-lg transition-colors duration-120 focus:outline-none focus:ring-1 focus:ring-[#E5E7EB]"
      onClick={onLogout}
    >
      <LogOut size={18} color="#6B7280" />
    </button>
  );
};