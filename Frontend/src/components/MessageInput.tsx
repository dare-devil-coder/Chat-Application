'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Film, Clock } from 'lucide-react';
import { formatSize } from '../lib/formatSize';

const MAX_MB = 25;
const ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,' +
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

interface MessageInputProps {
  onSendMessage: (text: string, file?: File) => void | Promise<void>;
  onScheduleMessage?: (text: string, sendAtIso: string) => void | Promise<void>;
  disabled?: boolean;
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the user's local time
const toLocalInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Bottom bar: attach button, optional preview of the chosen file, text box and Send.
// When a file is chosen, the text box becomes the caption for that file.
export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onScheduleMessage,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Make a small preview for images and clean it up afterwards
  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // allows choosing the same file again later
    if (!picked) return;
    if (picked.size > MAX_MB * 1024 * 1024) {
      alert(`File is too large (maximum ${MAX_MB} MB)`);
      return;
    }
    setFile(picked);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !file) || disabled) return;

    // Scheduled send: needs text, a time in the future, and no file (text only for now)
    if (showSchedule && scheduleAt && onScheduleMessage) {
      if (file) {
        alert('Scheduled messages can only contain text');
        return;
      }
      const when = new Date(scheduleAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        alert('Please pick a time in the future');
        return;
      }
      onScheduleMessage(trimmed, when.toISOString());
      setText('');
      setScheduleAt('');
      setShowSchedule(false);
      return;
    }

    onSendMessage(trimmed, file ?? undefined);
    setText('');
    setFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isScheduling = showSchedule && scheduleAt !== '';
  const canSend = (text.trim() !== '' || file !== null) && !disabled;

  return (
    <div className="bg-[#FFFFFF] border-t border-[#E5E7EB] shrink-0">
      {/* Preview of the file that is about to be sent */}
      {file && (
        <div className="px-6 pt-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-[10px] bg-[#F1F5F9] flex items-center justify-center overflow-hidden shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            ) : file.type.startsWith('video/') ? (
              <Film size={20} color="#6B7280" />
            ) : (
              <FileText size={20} color="#6B7280" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[#111827] truncate">{file.name}</p>
            <p className="text-[12px] text-[#6B7280]">{formatSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            title="Remove file"
            aria-label="Remove file"
            className="w-8 h-8 rounded-lg hover:bg-[#F8FAFC] flex items-center justify-center"
          >
            <X size={16} color="#6B7280" />
          </button>
        </div>
      )}

      {/* Pick when the message should be sent */}
      {showSchedule && (
        <div className="px-6 pt-3 flex items-center gap-3">
          <Clock size={16} color="#6B7280" />
          <label htmlFor="schedule-at" className="text-[13px] text-[#6B7280]">
            Send at
          </label>
          <input
            id="schedule-at"
            type="datetime-local"
            value={scheduleAt}
            min={toLocalInputValue(new Date())}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="h-9 bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-3 text-[13px] text-[#111827] outline-none focus:border-[#2563EB]"
          />
          <button
            type="button"
            onClick={() => {
              setShowSchedule(false);
              setScheduleAt('');
            }}
            className="text-[13px] text-[#6B7280] hover:text-[#111827]"
          >
            Cancel
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="h-[76px] px-6 py-4 flex items-center gap-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach a photo, video or document"
          aria-label="Attach a file"
          className="w-[44px] h-[44px] rounded-[10px] flex items-center justify-center shrink-0 hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors duration-120"
        >
          <Paperclip size={20} color="#6B7280" />
        </button>

        {/* Schedule button */}
        {onScheduleMessage && (
          <button
            type="button"
            onClick={() => setShowSchedule((open) => !open)}
            disabled={disabled}
            title="Schedule message"
            aria-label="Schedule message"
            className={`w-[44px] h-[44px] rounded-[10px] flex items-center justify-center shrink-0 hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors duration-120 ${
              showSchedule ? 'bg-[#EFF6FF]' : ''
            }`}
          >
            <Clock size={20} color={showSchedule ? '#2563EB' : '#6B7280'} />
          </button>
        )}

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={file ? 'Add a caption...' : 'Type a message...'}
          disabled={disabled}
          className="flex-1 h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] text-[#111827] placeholder-[#6B7280] outline-none focus:border-[#2563EB] transition-colors duration-120 font-normal disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!canSend}
          title={isScheduling ? 'Schedule message' : 'Send message'}
          aria-label={isScheduling ? 'Schedule message' : 'Send message'}
          className="w-[44px] h-[44px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:hover:bg-[#2563EB] text-[#FFFFFF] rounded-[10px] flex items-center justify-center shrink-0 transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1"
        >
          {isScheduling ? <Clock size={18} color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
        </button>
      </form>
    </div>
  );
};