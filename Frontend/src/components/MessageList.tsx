'use client';

import React, { useEffect, useRef } from 'react';
import { Message } from '../data/mockData';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
}

// Scrollable container for the vertical sequence of message bubbles
// Renders inside the #F8FAFC chat area with 24px padding and auto-scrolls to the newest message.
export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Automatically keep the latest conversation message in view
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#F8FAFC]">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
