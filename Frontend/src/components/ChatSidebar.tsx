'use client';

import React, { useState } from 'react';
import { User } from '../data/mockData';
import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { UserList } from './UserList';

interface ChatSidebarProps {
  users: User[];
  selectedUserId: string | null;
  onSelectUser: (user: User) => void;
    currentUsername: string;
  onLogout: () => void;
  className?: string;
}

// Complete sidebar column containing header, search input, and user list
// Enforces desktop width 320px, tablet width 300px, and full screen on mobile.
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  users,
  selectedUserId,
  onSelectUser,
  currentUsername,
  onLogout,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <aside
      className={`h-screen w-full md:w-[300px] lg:w-[320px] bg-[#FFFFFF] border-r border-[#E5E7EB] flex flex-col shrink-0 ${className}`}
    >
      <SidebarHeader username={currentUsername} onLogout={onLogout} />
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <UserList
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={onSelectUser}
        searchQuery={searchQuery}
      />
    </aside>
  );
};
