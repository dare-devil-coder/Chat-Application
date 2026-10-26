'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';

// Minimal centered placeholder shown when no active conversation is selected
// Strictly adheres to Section 14 requirements: simple MessageCircle icon,
// designated heading, and subtitle without any decorative illustration.
export const EmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8FAFC] text-center select-none">
      <div className="w-12 h-12 flex items-center justify-center mb-3 text-[#9CA3AF]">
        <MessageCircle size={48} strokeWidth={1.5} color="#9CA3AF" />
      </div>
      <h3 className="text-[18px] font-semibold text-[#111827] mb-1">
        Select a chat to start messaging
      </h3>
      <p className="text-[14px] text-[#6B7280] max-w-sm">
        Search for someone and start a conversation.
      </p>
    </div>
  );
};
