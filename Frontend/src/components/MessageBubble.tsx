'use client';

import React from 'react';
import { Check, FileText, Timer } from 'lucide-react';
import { Message } from '../data/mockData';
import { formatSize } from '../lib/formatSize';

interface MessageBubbleProps {
  message: Message;
}

// Server times are UTC; show them in the viewer's local time
const formatExpiry = (ts: string) =>
  new Date(ts.replace(' ', 'T') + 'Z').toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

// Single message bubble. Shows the attachment (photo, video or document card)
// above the text/caption when the message has one.
export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isOutgoing = message.isOutgoing;
  const attachment = message.attachment;
  const isMedia = attachment?.kind === 'image' || attachment?.kind === 'video';
  const isAudio = attachment?.kind === 'audio';

  return (
    <div
      className={`flex flex-col mb-3 ${
        isOutgoing ? 'items-end' : 'items-start'
      }`}
    >
      <div
        className={`max-w-[70%] px-[14px] py-[10px] rounded-[14px] text-[14px] leading-[1.5] break-words ${
          isMedia ? 'w-[320px]' : isAudio ? 'w-[300px]' : ''
        } ${
          isOutgoing
            ? 'bg-[#2563EB] text-[#FFFFFF] animate-send'
            : 'bg-[#F1F5F9] text-[#111827] animate-receive'
        }`}
      >
        {message.isAuto && (
          <span className="block text-[11px] font-medium opacity-70 mb-1">Auto-reply</span>
        )}

        {attachment?.kind === 'image' && (
          <a href={attachment.url} target="_blank" rel="noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.name}
              className="rounded-[10px] w-full max-h-[320px] object-cover"
            />
          </a>
        )}

        {attachment?.kind === 'video' && (
          <video
            src={attachment.url}
            controls
            preload="metadata"
            className="rounded-[10px] w-full max-h-[320px] bg-black"
          />
        )}

        {attachment?.kind === 'audio' && (
          <audio
            src={attachment.url}
            controls
            preload="metadata"
            className="w-full h-10"
          />
        )}

        {attachment?.kind === 'file' && (
          <a
            href={`${attachment.url}?download=1`}
            title="Download"
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 min-w-[220px] ${
              isOutgoing ? 'bg-white/15' : 'bg-white'
            }`}
          >
            <FileText size={22} color={isOutgoing ? '#FFFFFF' : '#2563EB'} />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium truncate">{attachment.name}</span>
              <span className={`block text-[12px] ${isOutgoing ? 'text-white/80' : 'text-[#6B7280]'}`}>
                {formatSize(attachment.size)}
              </span>
            </span>
          </a>
        )}

        {message.text && (
          <p className={`whitespace-pre-wrap font-normal ${attachment ? 'mt-2' : ''}`}>
            {message.text}
          </p>
        )}
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
        {message.expiresAt && (
          <span
            className="flex items-center text-[#9CA3AF]"
            title={`Disappears ${formatExpiry(message.expiresAt)}`}
            aria-label="Disappearing message"
          >
            <Timer size={11} />
          </span>
        )}
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