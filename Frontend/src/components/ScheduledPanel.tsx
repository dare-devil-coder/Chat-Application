'use client';

import React from 'react';
import { Clock, X } from 'lucide-react';

export interface ScheduledItem {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  send_at: string; // UTC, e.g. "2026-10-27 13:00:00"
  status: string;
}

interface ScheduledPanelProps {
  items: ScheduledItem[];
  onCancel: (id: number) => void;
}

// Server times are UTC; show them in the viewer's local time
const formatWhen = (ts: string) =>
  new Date(ts.replace(' ', 'T') + 'Z').toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

// Small list above the input showing messages that are waiting to be sent
export const ScheduledPanel: React.FC<ScheduledPanelProps> = ({ items, onCancel }) => {
  if (items.length === 0) return null;

  return (
    <div className="bg-[#FFFFFF] border-t border-[#E5E7EB] px-6 py-2 max-h-[132px] overflow-y-auto shrink-0">
      <p className="text-[12px] font-medium text-[#6B7280] mb-1">
        Scheduled ({items.length})
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-[13px] text-[#111827]">
            <Clock size={14} color="#6B7280" className="shrink-0" />
            <span className="truncate flex-1">{item.text}</span>
            <span className="text-[12px] text-[#6B7280] shrink-0">{formatWhen(item.send_at)}</span>
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              title="Cancel scheduled message"
              aria-label="Cancel scheduled message"
              className="w-6 h-6 rounded hover:bg-[#F8FAFC] flex items-center justify-center shrink-0"
            >
              <X size={14} color="#6B7280" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};