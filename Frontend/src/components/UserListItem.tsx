'use client';

import React from 'react';
import { User } from '../data/mockData';

interface UserListItemProps {
  user: User;
  isSelected: boolean;
  onSelect: (user: User) => void;
}

// Sidebar list item for normal student/peer users
// Adheres strictly to the 68px row height, 40px circle avatar with initials,
// and 8px status indicators for online, offline, and unread states.
export const UserListItem: React.FC<UserListItemProps> = ({
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
      className={`h-[68px] px-4 py-3 flex items-center rounded-[8px] cursor-pointer transition-colors duration-120 mx-2 select-none ${
        isSelected
          ? 'bg-[#EFF6FF]'
          : 'bg-transparent hover:bg-[#F8FAFC]'
      }`}
    >
      {/* 40px circle avatar with initials and online/offline status dot */}
      <div className="relative shrink-0 mr-3">
        <div className="w-10 h-10 rounded-full bg-[#E5E7EB] flex items-center justify-center text-[14px] font-semibold text-[#374151]">
          {user.initials}
        </div>
        {/* 8px status indicator: online green #22C55E or offline gray #9CA3AF */}
        <span
          className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white"
          style={{
            backgroundColor: user.isOnline ? '#22C55E' : '#9CA3AF',
          }}
          aria-label={user.isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* User details and last message preview */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[15px] font-semibold text-[#111827] truncate">
            {user.name}
          </span>
          <span className="text-[12px] text-[#9CA3AF] shrink-0 ml-2">
            {user.time}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[#6B7280] truncate leading-tight">
            {user.lastMessage}
          </p>
          {/* Subtle 8px blue unread indicator dot (no numerical counter) */}
          {user.hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0 ml-2"
              title="Unread message"
            />
          )}
        </div>
      </div>
    </div>
  );
};
