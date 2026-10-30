'use client';

import React from 'react';
import { FileText, Image as ImageIcon, Film, Mic, Download } from 'lucide-react';

export interface SearchResult {
  id: number;
  sender_id: number;
  receiver_id: number;
  other_id: number; // the other person in that conversation
  text: string;
  timestamp: string; // UTC, e.g. "2026-10-27 13:00:00"
  attachment?: {
    url: string;
    name: string;
    kind: 'image' | 'video' | 'file' | 'audio' | 'shared';
    size: number;
    expires_at?: string | null;
  } | null;
}

interface MessageSearchResultsProps {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error: string;
  nameOf: (userId: number) => string;
  onOpen: (result: SearchResult) => void;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Wraps every match of the query in a yellow <mark>
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-[#FEF08A] text-inherit rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

// Shows only the part of a long message around the first match
const snippet = (text: string, query: string, radius = 40) => {
  const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index <= radius) return text;
  return '…' + text.slice(index - radius);
};

const formatWhen = (ts: string) =>
  new Date(ts.replace(' ', 'T') + 'Z').toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

// List of messages found by the search; clicking one opens that chat
export const MessageSearchResults: React.FC<MessageSearchResultsProps> = ({
  query,
  results,
  loading,
  error,
  nameOf,
  onOpen,
}) => {
  const q = query.trim();

  if (q.length < 2) {
    return (
      <div className="py-8 px-6 text-center">
        <p className="text-[13px] text-[#6B7280]">
          Type at least 2 characters to search all your messages
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 px-6 text-center">
        <p className="text-[13px] text-[#DC2626]">{error}</p>
      </div>
    );
  }
  if (loading && results.length === 0) {
    return (
      <div className="py-8 px-6 text-center">
        <p className="text-[13px] text-[#6B7280]">Searching...</p>
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="py-8 px-6 text-center">
        <p className="text-[13px] text-[#6B7280]">No messages found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-3">
      <p className="px-5 py-1 text-[12px] text-[#6B7280]">
        {results.length} result{results.length === 1 ? '' : 's'}
      </p>
      {results.map((r) => {
        const fromThem = r.sender_id === r.other_id;
        const KindIcon =
          r.attachment?.kind === 'image'
            ? ImageIcon
            : r.attachment?.kind === 'video'
              ? Film
              : r.attachment?.kind === 'audio'
                ? Mic
                : r.attachment?.kind === 'shared'
                  ? Download
                  : FileText;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            className="w-full text-left px-5 py-3 border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors duration-120 focus:outline-none focus:bg-[#F8FAFC]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-[#111827] truncate">
                {nameOf(r.other_id)}
              </span>
              <span className="text-[11px] text-[#9CA3AF] shrink-0">{formatWhen(r.timestamp)}</span>
            </div>
            {r.text && (
              <p className="text-[13px] text-[#6B7280] truncate mt-0.5">
                <span>{fromThem ? `${nameOf(r.other_id)}: ` : 'You: '}</span>
                <Highlight text={snippet(r.text, q)} query={q} />
              </p>
            )}
            {r.attachment && (
              <p className="text-[12px] text-[#6B7280] truncate mt-0.5 flex items-center gap-1">
                <KindIcon size={13} className="shrink-0" />
                <span className="truncate">
                  <Highlight text={r.attachment.name} query={q} />
                </span>
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
};