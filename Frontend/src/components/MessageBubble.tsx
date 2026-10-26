'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { Message } from '../data/mockData';

interface MessageBubbleProps {
  message: Message;
}

// Single message bubble component adhering to strict padding, radius, and color tokens
// Includes subtle entrance animation (180ms ease-out for outgoing, 220ms ease-out for incoming)
// and a minimal checkmark read indicator for outgoing items.
export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isOutgoing = message.isOutgoing;

  return (
    <div
      className={`flex flex-col mb-3 ${
        isOutgoing ? 'items-end' : 'items-start'
      }`}
    >
      <div
        className={`max-w-[70%] px-[14px] py-[10px] rounded-[14px] text-[14px] leading-[1.5] break-words ${
          isOutgoing
            ? 'bg-[#2563EB] text-[#FFFFFF] animate-send'
            : 'bg-[#F1F5F9] text-[#111827] animate-receive'
        }`}
      >
        <p className="whitespace-pre-wrap font-normal">{message.text}</p>
      </div>

      {/* Metadata row with timestamp and subtle read indicator */}
      <div
        className={`flex items-center gap-1 mt-1 px-1 ${
          isOutgoing ? 'justify-end' : 'justify-start'
        }`}
      >
        <span className="text-[11px] text-[#9CA3AF] select-none font-normal">
          {message.timestamp}
        </span>
        {isOutgoing && (
          <span
            className="flex items-center text-[#9CA3AF]"
            title="Read"
            aria-label="Read message indicator"
          >
            <Check size={12} className="stroke-[2.5]" />
          </span>
        )}
      </div>
    </div>
  );
};
