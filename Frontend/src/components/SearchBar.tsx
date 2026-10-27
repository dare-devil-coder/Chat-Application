'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Search input placed below the sidebar header.
// Used both for filtering people and for searching messages.
export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search people...',
}) => {
  return (
    <div className="mx-4 mb-3 shrink-0">
      <div className="h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-3 flex items-center gap-2 focus-within:border-[#2563EB] transition-colors duration-120">
        <Search size={18} color="#6B7280" className="shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[14px] text-[#111827] placeholder-[#6B7280] outline-none font-normal"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[12px] text-[#9CA3AF] hover:text-[#111827] px-1"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};