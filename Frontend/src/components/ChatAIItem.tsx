'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { User } from '../data/mockData';

interface ChatAIItemProps {
  user: User;
  isSelected: boolean;
  onSelect: (user: User) => void;
}

// Dedicated visual treatment for the built-in Chat AI assistant
// Renders a distinct 12px rounded container with Bot icon, indigo accent,
// and 'AI Assistant' label, while maintaining the minimal design language.
export const ChatAIItem: React.FC<ChatAIItemProps> = ({
  user,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      onClick={() => onSelect(user)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(user);
        }
      }}
      className={`h-[68px] px-4 py-3 flex items-center rounded-[8px] cursor-pointer transition-colors duration-120 mx-2 mb-1 select-none ${
        isSelected
          ? 'bg-[#EEF2FF]'
          : 'bg-transparent hover:bg-[#F8FAFC]'
      }`}
    >
      {/* 40px x 40px specialized container with 12px radius, #EEF2FF background and #C7D2FE border */}
      <div className="relative shrink-0 mr-3">
        <div className="w-10 h-10 rounded-[12px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center justify-center relative">
          <Bot size={20} color="#4F46E5" />
          {/* Subtle micro AI badge tag inside the bottom-right corner */}
          <span className="absolute -bottom-1 -right-1 px-1 py-[1px] bg-[#4F46E5] text-white text-[9px] font-bold rounded-[4px] leading-none tracking-tight">
            AI
          </span>
        </div>
      </div>

      {/* AI details and last message preview */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[15px] font-semibold text-[#111827] truncate">
              {user.name}
            </span>
            <span className="text-[12px] text-[#6B7280] font-normal shrink-0">
              {user.secondaryLabel || 'AI Assistant'}
            </span>
          </div>
          <span className="text-[12px] text-[#9CA3AF] shrink-0 ml-2">
            {user.time}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[#6B7280] truncate leading-tight">
            {user.lastMessage}
          </p>
        </div>
      </div>
    </div>
  );
};
