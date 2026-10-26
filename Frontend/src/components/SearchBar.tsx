'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

// User discovery search bar placed directly below the sidebar header
// Filters the user list in real-time with clean 10px rounded borders
// and strict color tokens matching the specification.
export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  return (
    <div className="mx-4 mb-4 shrink-0">
      <div className="h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-3 flex items-center gap-2 focus-within:border-[#2563EB] transition-colors duration-120">
        <Search size={18} color="#6B7280" className="shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search people..."
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
