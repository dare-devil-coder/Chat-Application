'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

// Fixed bottom input bar for authoring and sending chat messages
// Includes strictly the required text input and Send button with exact dimensions:
// 44px input height, 10px radius, and 44x44px primary blue send button.
export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="h-[76px] bg-[#FFFFFF] border-t border-[#E5E7EB] px-6 py-4 flex items-center gap-3 shrink-0"
    >
      {/* 44px text input field with #F8FAFC background and 10px radius */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] text-[#111827] placeholder-[#6B7280] outline-none focus:border-[#2563EB] transition-colors duration-120 font-normal disabled:opacity-50"
      />

      {/* 44px x 44px primary blue send button with Lucide Send icon */}
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        title="Send message"
        aria-label="Send message"
        className="w-[44px] h-[44px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:hover:bg-[#2563EB] text-[#FFFFFF] rounded-[10px] flex items-center justify-center shrink-0 transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1"
      >
        <Send size={18} color="#FFFFFF" />
      </button>
    </form>
  );
};
