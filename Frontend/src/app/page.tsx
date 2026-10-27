'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { DEMO_USERS, INITIAL_CONVERSATIONS, Message, User } from '../data/mockData';
import { ChatSidebar } from '../components/ChatSidebar';
import { ChatHeader } from '../components/ChatHeader';
import { MessageList } from '../components/MessageList';
import { MessageInput } from '../components/MessageInput';
import { EmptyState } from '../components/EmptyState';
import { AuthScreen, AuthUser } from '../components/AuthScreen';
import { ScheduledPanel, ScheduledItem } from '../components/ScheduledPanel';
import { DisappearingBar } from '../components/DisappearingBar';
import { SearchResult } from '../components/MessageSearchResults';

const API_URL = 'http://localhost:5000';

interface ServerMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  timestamp: string;
  expires_at?: string | null; // UTC; set when the chat has a disappearing timer
  attachment?: {
    url: string; // relative, e.g. /uploads/abc_photo.png
    name: string;
    kind: 'image' | 'video' | 'file' | 'audio';
    size: number;
  } | null;
}

// The AI assistant stays a local-only contact from the mock data
const AI_USER = DEMO_USERS.find((u) => u.isAI)!;

// Server timestamps look like "2026-10-26 04:44:37" (UTC)
const formatTime = (ts: string) =>
  new Date(ts.replace(' ', 'T') + 'Z').toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

const toMessage = (m: ServerMessage, myId: number): Message => ({
  id: `msg-${m.id}`,
  senderId: String(m.sender_id),
  text: m.text,
  timestamp: formatTime(m.timestamp),
  isOutgoing: m.sender_id === myId,
  expiresAt: m.expires_at ?? undefined,
  attachment: m.attachment
    ? { ...m.attachment, url: `${API_URL}${m.attachment.url}` }
    : undefined,
});

// Text shown in the sidebar under the contact name
const previewOf = (m: ServerMessage): string => {
  if (m.text) return m.text;
  if (m.attachment?.kind === 'image') return 'Photo';
  if (m.attachment?.kind === 'video') return 'Video';
  if (m.attachment?.kind === 'audio') return 'Voice message';
  if (m.attachment) return 'Document';
  return '';
};

const aiOnlyConversations = (): Record<string, Message[]> => ({
  [AI_USER.id]: INITIAL_CONVERSATIONS[AI_USER.id] ?? [],
});

// Uploads one file to the Python server and returns its stored id
const uploadFile = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.file_id as string;
};

export default function ChatApp() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<User[]>([AI_USER]);
  const [conversations, setConversations] = useState<Record<string, Message[]>>(
    aiOnlyConversations()
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  // Disappearing-messages timer (in seconds) per chat, keyed by the other person's id
  const [timers, setTimers] = useState<Record<string, number>>({});
  // Message to scroll to and highlight after the user opens a search result
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const selectedUserIdRef = useRef<string | null>(null);
  selectedUserIdRef.current = selectedUserId;

  // Merge live presence into the user list (the AI is always shown as online)
  const usersWithPresence = users.map((u) =>
    u.isAI ? u : { ...u, isOnline: onlineIds.includes(Number(u.id)) }
  );
  const selectedUser = usersWithPresence.find((u) => u.id === selectedUserId) || null;
  const currentMessages = selectedUserId ? conversations[selectedUserId] || [] : [];
  // Pending scheduled messages for the chat that is open
  const scheduledForChat = scheduled.filter((s) => String(s.receiver_id) === selectedUserId);

  // 1) Restore login for this browser tab (sessionStorage is per-tab,
  //    so two tabs can be logged in as two different users)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('chat-user');
      if (saved) setCurrentUser(JSON.parse(saved));
    } catch {
      /* ignore bad data */
    }
    setAuthChecked(true);
  }, []);

  // 2) Load the real user list once logged in
  useEffect(() => {
    if (!currentUser) return;
    fetch(`${API_URL}/api/users`)
      .then((r) => r.json())
      .then((list: AuthUser[]) => {
        const others: User[] = list
          .filter((u) => u.id !== currentUser.id)
          .map((u) => ({
            id: String(u.id),
            name: u.username,
            initials: u.username.slice(0, 2).toUpperCase(),
            isOnline: false, // replaced by live presence below
            lastMessage: '',
            time: '',
            hasUnread: false,
          }));
        setUsers([AI_USER, ...others]);
      })
      .catch((err) => console.error('Could not load users', err));
  }, [currentUser]);

  // 2b) Load my pending scheduled messages
  useEffect(() => {
    if (!currentUser) return;
    fetch(`${API_URL}/api/scheduled/${currentUser.id}`)
      .then((r) => r.json())
      .then((list: ScheduledItem[]) => setScheduled(list))
      .catch((err) => console.error('Could not load scheduled messages', err));
  }, [currentUser]);

  // 3) Socket connection: join my private room, receive private messages
  useEffect(() => {
    if (!currentUser) return;

    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { user_id: currentUser.id });
    });

    socket.on('private message', (m: ServerMessage) => {
      const otherId = String(m.sender_id === currentUser.id ? m.receiver_id : m.sender_id);
      const msg = toMessage(m, currentUser.id);

      setConversations((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), msg],
      }));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === otherId
            ? {
                ...u,
                lastMessage: previewOf(m),
                time: msg.timestamp,
                hasUnread: !msg.isOutgoing && selectedUserIdRef.current !== otherId,
              }
            : u
        )
      );
    });

    socket.on('error message', (e: { error: string }) => alert(e.error));

    socket.on('presence', (p: { online: number[] }) => setOnlineIds(p.online));

    // Messages whose disappearing timer ran out are removed from every open screen
    socket.on('messages expired', (e: { ids: number[] }) => {
      const gone = new Set(e.ids.map((id) => `msg-${id}`));
      setConversations((prev) => {
        const next: Record<string, Message[]> = {};
        for (const [chatId, list] of Object.entries(prev)) {
          next[chatId] = list.filter((m) => !gone.has(m.id));
        }
        return next;
      });
    });

    // Either person changed the timer of a chat
    socket.on('timer changed', (e: { user_a: number; user_b: number; seconds: number }) => {
      const otherId = String(e.user_a === currentUser.id ? e.user_b : e.user_a);
      setTimers((prev) => ({ ...prev, [otherId]: e.seconds }));
    });

    // The server tells me when one of my scheduled messages has been sent
    socket.on('scheduled sent', (e: { id: number }) =>
      setScheduled((prev) => prev.filter((s) => s.id !== e.id))
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser]);

  const handleAuthenticated = (user: AuthUser) => {
    sessionStorage.setItem('chat-user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('chat-user');
    setCurrentUser(null);
    setUsers([AI_USER]);
    setConversations(aiOnlyConversations());
    setSelectedUserId(null);
    setOnlineIds([]);
    setScheduled([]);
    setTimers({});
    setHighlightId(null);
  };

  const handleSendMessage = async (text: string, file?: File) => {
    if (!selectedUserId || !currentUser) return;

    // Real users: upload the file first (if any), then send over the socket.
    // The server saves the message and echoes it back to both people.
    if (!selectedUser?.isAI) {
      let fileId: string | undefined;
      if (file) {
        setUploading(true);
        try {
          fileId = await uploadFile(file);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Upload failed');
          return;
        } finally {
          setUploading(false);
        }
      }
      socketRef.current?.emit('private message', {
        sender_id: currentUser.id,
        receiver_id: Number(selectedUserId),
        text,
        file_id: fileId,
      });
      return;
    }

    // Chat AI: local demo behaviour, text only
    if (file) {
      alert('Chat AI cannot receive files');
      return;
    }

    const timeString = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      senderId: 'current-user',
      text,
      timestamp: timeString,
      isOutgoing: true,
      status: 'read',
    };

    setConversations((prev) => ({
      ...prev,
      [selectedUserId]: [...(prev[selectedUserId] || []), newMessage],
    }));
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId
          ? { ...u, lastMessage: text, time: timeString, hasUnread: false }
          : u
      )
    );

    setTimeout(() => {
      const aiReply: Message = {
        id: `ai-msg-${Date.now()}`,
        senderId: 'chat-ai',
        text: `Here is a clear explanation regarding "${text}": in computer systems, clean modular components help you scale quickly and avoid coupling errors.`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }),
        isOutgoing: false,
      };
      setConversations((prev) => ({
        ...prev,
        [selectedUserId]: [...(prev[selectedUserId] || []), aiReply],
      }));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? { ...u, lastMessage: aiReply.text, time: aiReply.timestamp }
            : u
        )
      );
    }, 500);
  };

  const handleScheduleMessage = async (text: string, sendAtIso: string) => {
    if (!selectedUserId || !currentUser) return;
    if (selectedUser?.isAI) {
      alert('Messages to Chat AI cannot be scheduled');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/scheduled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser.id,
          receiver_id: Number(selectedUserId),
          text,
          send_at: sendAtIso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not schedule the message');
      setScheduled((prev) =>
        [...prev, data as ScheduledItem].sort((a, b) => a.send_at.localeCompare(b.send_at))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not schedule the message');
    }
  };

  const handleCancelScheduled = async (id: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/api/scheduled/${id}?user_id=${currentUser.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not cancel');
      }
      setScheduled((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not cancel');
    }
  };

  const handleChangeTimer = async (seconds: number) => {
    if (!selectedUserId || !currentUser) return;
    try {
      const res = await fetch(
        `${API_URL}/api/chats/${currentUser.id}/${selectedUserId}/timer`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, seconds }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not change the timer');
      }
      // No local update needed: the server sends a 'timer changed' event to both people
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not change the timer');
    }
  };

  // Search all of my messages (and file names) on the server
  const searchMessages = async (query: string, kind: string): Promise<SearchResult[]> => {
    if (!currentUser) return [];
    const params = new URLSearchParams({ user_id: String(currentUser.id), q: query });
    if (kind) params.set('kind', kind);
    const res = await fetch(`${API_URL}/api/search?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    return data.results as SearchResult[];
  };

  // Open the chat that contains a search result and highlight that message
  const handleOpenSearchResult = (result: SearchResult) => {
    const user = users.find((u) => u.id === String(result.other_id));
    if (!user) return;
    setHighlightId(`msg-${result.id}`);
    handleSelectUser(user);
    setTimeout(() => setHighlightId(null), 4000);
  };

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, hasUnread: false } : u)));

    if (user.isAI || !currentUser) return;

    // Load this chat's disappearing-messages setting
    fetch(`${API_URL}/api/chats/${currentUser.id}/${user.id}/timer`)
      .then((r) => r.json())
      .then((d: { seconds: number }) => setTimers((prev) => ({ ...prev, [user.id]: d.seconds })))
      .catch((err) => console.error('Could not load timer', err));

    // Load saved history for this conversation from the database
    fetch(`${API_URL}/api/messages/${currentUser.id}/${user.id}?size=1000`)
      .then((r) => r.json())
      .then((data: { messages: ServerMessage[] }) => {
        setConversations((prev) => ({
          ...prev,
          [user.id]: data.messages.map((m) => toMessage(m, currentUser.id)),
        }));
        const last = data.messages[data.messages.length - 1];
        if (last) {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === user.id
                ? { ...u, lastMessage: previewOf(last), time: formatTime(last.timestamp) }
                : u
            )
          );
        }
      })
      .catch((err) => console.error('Could not load history', err));
  };

  // Hooks are all above this line; now decide what to render
  if (!authChecked) return null;

  if (!currentUser) {
    return <AuthScreen apiUrl={API_URL} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="h-screen w-full flex overflow-hidden bg-[#F8FAFC]">
      <ChatSidebar
        users={usersWithPresence}
        selectedUserId={selectedUserId}
        onSelectUser={handleSelectUser}
        currentUsername={currentUser.username}
        onLogout={handleLogout}
        onSearchMessages={searchMessages}
        onOpenSearchResult={handleOpenSearchResult}
        className={`${selectedUserId ? 'hidden md:flex' : 'flex'}`}
      />

      <section
        className={`flex-1 h-screen flex-col bg-[#F8FAFC] min-w-0 ${
          selectedUserId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {selectedUser ? (
          <>
            <ChatHeader user={selectedUser} onBack={() => setSelectedUserId(null)} />
            {!selectedUser.isAI && (
              <DisappearingBar
                seconds={timers[selectedUser.id] ?? 0}
                onChange={handleChangeTimer}
              />
            )}
            <MessageList messages={currentMessages} highlightId={highlightId} />
            <ScheduledPanel items={scheduledForChat} onCancel={handleCancelScheduled} />
            <MessageInput
              onSendMessage={handleSendMessage}
              onScheduleMessage={handleScheduleMessage}
              disabled={uploading}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  );
}