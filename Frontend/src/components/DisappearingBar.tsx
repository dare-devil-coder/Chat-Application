'use client';

import React from 'react';
import { Timer } from 'lucide-react';

const OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '1 minute', seconds: 60 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
];

interface DisappearingBarProps {
  seconds: number;
  onChange: (seconds: number) => void;
}

// Thin bar under the chat header: choose how long new messages stay in this chat.
// The setting is shared, so both people see the same value.
export const DisappearingBar: React.FC<DisappearingBarProps> = ({ seconds, onChange }) => {
  return (
    <div className="bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 py-2 flex items-center gap-2 shrink-0">
      <Timer size={16} color={seconds > 0 ? '#2563EB' : '#6B7280'} />
      <label htmlFor="disappear-timer" className="text-[13px] text-[#6B7280]">
        Disappearing messages
      </label>
      <select
        id="disappear-timer"
        value={seconds}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-2 text-[13px] text-[#111827] outline-none focus:border-[#2563EB]"
      >
        {OPTIONS.map((o) => (
          <option key={o.seconds} value={o.seconds}>
            {o.label}
          </option>
        ))}
      </select>
      {seconds > 0 && (
        <span className="text-[12px] text-[#6B7280]">New messages will be deleted automatically</span>
      )}
    </div>
  );
};