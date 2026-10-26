'use client';

import React from 'react';
import { User } from '../data/mockData';
import { UserListItem } from './UserListItem';
import { ChatAIItem } from './ChatAIItem';

interface UserListProps {
  users: User[];
  selectedUserId: string | null;
  onSelectUser: (user: User) => void;
  searchQuery: string;
}

// User list container in the sidebar
// Handles rendering both regular peer accounts and the AI assistant,
// filtering the collection dynamically when the search bar is used.
export const UserList: React.FC<UserListProps> = ({
  users,
  selectedUserId,
  onSelectUser,
  searchQuery,
}) => {
  // Filter users by search term (case-insensitive name or message matching)
  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  if (filteredUsers.length === 0) {
    return (
      <div className="py-8 px-4 text-center">
        <p className="text-[13px] text-[#6B7280]">No matching users found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-0.5 pb-3">
      {filteredUsers.map((user) => {
        if (user.isAI) {
          return (
            <ChatAIItem
              key={user.id}
              user={user}
              isSelected={selectedUserId === user.id}
              onSelect={onSelectUser}
            />
          );
        }

        return (
          <UserListItem
            key={user.id}
            user={user}
            isSelected={selectedUserId === user.id}
            onSelect={onSelectUser}
          />
        );
      })}
    </div>
  );
};
