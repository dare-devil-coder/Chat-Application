'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Film, Clock, Mic, Trash2 } from 'lucide-react';
import { formatSize } from '../lib/formatSize';
import { MAX_LARGE_MB, EXPIRY_OPTIONS, DEFAULT_EXPIRY, needsLink } from '../lib/files';
import { CommandInfo } from '../lib/commands';

const MAX_MB = 25; // limit for a voice message (it is sent as a normal attachment)

const MAX_VOICE_SECONDS = 300; // a voice message stops automatically after 5 minutes

// Pick an audio format this browser can record (Chrome/Firefox: webm or ogg, Safari: mp4)
const pickMimeType = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) =>
    MediaRecorder.isTypeSupported(t)
  ) ?? '';

// File extension the server recognises as audio
const extensionFor = (mime: string) =>
  mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'weba';

interface MessageInputProps {
  onSendMessage: (text: string, file?: File, expiresIn?: number) => void | Promise<void>;
  uploadProgress?: number | null; // 0-100 while a large file is being uploaded
  commands?: CommandInfo[]; // slash commands offered by the server
  onRunCommand?: (input: string) => void | Promise<void>;
  prefill?: { text: string; nonce: number } | null; // puts text into the box (from a command result)
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
  uploadProgress = null,
  commands = [],
  onRunCommand,
  prefill = null,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [expiresIn, setExpiresIn] = useState(DEFAULT_EXPIRY); // lifetime of a download link
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // A command result can fill the message box ("Use this text", a suggested reply)
  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      textInputRef.current?.focus();
    }
  }, [prefill]);

  // While the text is only "/something", list the commands that match it
  const typingCommand = text.startsWith('/') && !text.includes(' ');
  const commandMatches = typingCommand
    ? commands.filter((c) => c.name.startsWith(text.slice(1).toLowerCase()))
    : [];

  // --- voice recording ---
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

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
    if (picked.size > MAX_LARGE_MB * 1024 * 1024) {
      alert(`File is too large (maximum ${MAX_LARGE_MB} MB)`);
      return;
    }
    setFile(picked);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !file) || disabled) return;

    // "/improve hello" runs a command instead of sending a message
    // (a text that starts with "/" but is not a known command is sent normally)
    const commandName = trimmed.startsWith('/') ? trimmed.slice(1).split(/\s+/)[0].toLowerCase() : '';
    if (!file && onRunCommand && commandName && commands.some((c) => c.name === commandName)) {
      onRunCommand(trimmed);
      setText('');
      return;
    }

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

    onSendMessage(trimmed, file ?? undefined, file && needsLink(file) ? expiresIn : undefined);
    setText('');
    setFile(null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('Voice recording is not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // turn the microphone off
        if (cancelledRef.current) return;
        const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) return;
        if (blob.size > MAX_MB * 1024 * 1024) {
          alert(`Voice message is too large (maximum ${MAX_MB} MB)`);
          return;
        }
        const voiceFile = new File([blob], `voice-message.${extensionFor(type)}`, { type });
        onSendMessage('', voiceFile);
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      alert('Microphone access was denied or is not available');
    }
  };

  // send = true: stop and send the recording, send = false: throw it away
  const finishRecording = (send: boolean) => {
    cancelledRef.current = !send;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
  };

  // Stop automatically after the maximum length
  useEffect(() => {
    if (recording && seconds >= MAX_VOICE_SECONDS) finishRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, recording]);

  // Release the microphone if the component disappears while recording
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      {/* Progress of a large upload */}
      {uploadProgress !== null && (
        <div className="px-6 pt-3">
          <p className="text-[12px] text-[#6B7280] mb-1">Uploading... {uploadProgress}%</p>
          <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
            <div
              className="h-full bg-[#2563EB] transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

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
            <p className="text-[12px] text-[#6B7280]">
              {formatSize(file.size)}
              {needsLink(file) && ' · will be sent as a download link'}
            </p>
          </div>
          {needsLink(file) && (
            <label className="flex items-center gap-2 text-[12px] text-[#6B7280] shrink-0">
              Link valid for
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
                className="h-8 bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-2 text-[12px] text-[#111827] outline-none focus:border-[#2563EB]"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.seconds} value={o.seconds}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
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

      {/* Command suggestions while typing "/" */}
      {commandMatches.length > 0 && (
        <ul className="px-6 pt-3 space-y-1">
          {commandMatches.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => {
                  setText(`/${c.name} `);
                  textInputRef.current?.focus();
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC] flex items-baseline gap-3"
              >
                <span className="text-[13px] font-medium text-[#2563EB]">/{c.name}</span>
                <span className="text-[12px] text-[#6B7280] truncate">{c.description}</span>
              </button>
            </li>
          ))}
        </ul>
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

      {recording ? (
        /* Recording bar: replaces the text box while the microphone is on */
        <div className="h-[76px] px-6 py-4 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-[#DC2626] animate-pulse shrink-0" />
          <span className="text-[14px] text-[#111827] tabular-nums">
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
          </span>
          <span className="text-[13px] text-[#6B7280] flex-1">Recording voice message...</span>
          <button
            type="button"
            onClick={() => finishRecording(false)}
            title="Discard recording"
            aria-label="Discard recording"
            className="w-[44px] h-[44px] rounded-[10px] flex items-center justify-center hover:bg-[#F8FAFC] transition-colors duration-120"
          >
            <Trash2 size={20} color="#DC2626" />
          </button>
          <button
            type="button"
            onClick={() => finishRecording(true)}
            title="Send voice message"
            aria-label="Send voice message"
            className="w-[44px] h-[44px] bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] flex items-center justify-center transition-colors duration-120"
          >
            <Send size={18} color="#FFFFFF" />
          </button>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="h-[76px] px-6 py-4 flex items-center gap-3"
      >
        <input
          ref={fileInputRef}
          type="file"
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

        {/* Record a voice message */}
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          title="Record a voice message"
          aria-label="Record a voice message"
          className="w-[44px] h-[44px] rounded-[10px] flex items-center justify-center shrink-0 hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors duration-120"
        >
          <Mic size={20} color="#6B7280" />
        </button>

        <input
          ref={textInputRef}
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
      )}
    </div>
  );
};