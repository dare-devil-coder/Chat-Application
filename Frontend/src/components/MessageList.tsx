'use client';

import React, { useEffect, useRef } from 'react';
import { Message } from '../data/mockData';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  highlightId?: string | null; // a message to scroll to and highlight (from search)
}

// Scrollable container for the vertical sequence of message bubbles.
// Scrolls to the newest message, or to the highlighted one after a search.
export const MessageList: React.FC<MessageListProps> = ({ messages, highlightId = null }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<string | null>(highlightId);
  highlightRef.current = highlightId;

  useEffect(() => {
    const target = highlightRef.current
      ? document.getElementById(`bubble-${highlightRef.current}`)
      : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#F8FAFC]">
      {messages.map((message) => (
        <div
          key={message.id}
          id={`bubble-${message.id}`}
          className={`-mx-2 px-2 rounded-[12px] transition-colors duration-500 ${
            message.id === highlightId ? 'bg-[#FEF9C3]' : ''
          }`}
        >
          <MessageBubble message={message} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};