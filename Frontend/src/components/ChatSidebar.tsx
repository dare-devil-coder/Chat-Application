'use client';

import React, { useState, useEffect } from 'react';
import { User } from '../data/mockData';
import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { UserList } from './UserList';
import { MessageSearchResults, SearchResult } from './MessageSearchResults';

interface ChatSidebarProps {
  users: User[];
  selectedUserId: string | null;
  onSelectUser: (user: User) => void;
  currentUsername: string;
  onLogout: () => void;
  onSearchMessages: (query: string, kind: string) => Promise<SearchResult[]>;
  onOpenSearchResult: (result: SearchResult) => void;
  className?: string;
}

const KIND_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Photos', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'file' },
  { label: 'Voice', value: 'audio' },
];

// Complete sidebar column: header, a switch between "People" and "Messages"
// search, the search box, and either the contact list or the message results.
// Enforces desktop width 320px, tablet width 300px, and full screen on mobile.
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  users,
  selectedUserId,
  onSelectUser,
  currentUsername,
  onLogout,
  onSearchMessages,
  onOpenSearchResult,
  className = '',
}) => {
  const [mode, setMode] = useState<'people' | 'messages'>('people');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [kind, setKind] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search the server 300 ms after the user stops typing (debounce)
  useEffect(() => {
    if (mode !== 'messages') return;
    const q = messageQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await onSearchMessages(q, kind);
        if (!cancelled) {
          setResults(found);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError(err instanceof Error ? err.message : 'Search failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onSearchMessages changes on every render, so it is left out on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageQuery, kind, mode]);

  const nameOf = (userId: number) =>
    users.find((u) => u.id === String(userId))?.name ?? 'Unknown';

  return (
    <aside
      className={`h-screen w-full md:w-[300px] lg:w-[320px] bg-[#FFFFFF] border-r border-[#E5E7EB] flex flex-col shrink-0 ${className}`}
    >
      <SidebarHeader username={currentUsername} onLogout={onLogout} />

      {/* Switch: search people or search messages */}
      <div className="mx-4 mb-3 mt-3 flex gap-1 bg-[#F1F5F9] p-1 rounded-[10px] shrink-0">
        {(['people', 'messages'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 h-8 rounded-[8px] text-[13px] font-medium transition-colors duration-120 ${
              mode === m ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            {m === 'people' ? 'People' : 'Messages'}
          </button>
        ))}
      </div>

      {mode === 'people' ? (
        <>
          <SearchBar value={peopleQuery} onChange={setPeopleQuery} placeholder="Search people..." />
          <UserList
            users={users}
            selectedUserId={selectedUserId}
            onSelectUser={onSelectUser}
            searchQuery={peopleQuery}
          />
        </>
      ) : (
        <>
          <SearchBar
            value={messageQuery}
            onChange={setMessageQuery}
            placeholder="Search messages and files..."
          />
          <div className="mx-4 mb-2 flex gap-2 flex-wrap shrink-0">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setKind(f.value)}
                className={`h-7 px-3 rounded-full text-[12px] border transition-colors duration-120 ${
                  kind === f.value
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'bg-white border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <MessageSearchResults
            query={messageQuery}
            results={results}
            loading={loading}
            error={error}
            nameOf={nameOf}
            onOpen={onOpenSearchResult}
          />
        </>
      )}
    </aside>
  );
};