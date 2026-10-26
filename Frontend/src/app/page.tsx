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

const API_URL = 'http://localhost:5000';

interface ServerMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  timestamp: string;
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
});

const aiOnlyConversations = (): Record<string, Message[]> => ({
  [AI_USER.id]: INITIAL_CONVERSATIONS[AI_USER.id] ?? [],
});

export default function ChatApp() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<User[]>([AI_USER]);
  const [conversations, setConversations] = useState<Record<string, Message[]>>(
    aiOnlyConversations()
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const selectedUserIdRef = useRef<string | null>(null);
  selectedUserIdRef.current = selectedUserId;

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;
  const currentMessages = selectedUserId ? conversations[selectedUserId] || [] : [];

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
            isOnline: false, // placeholder until we track online users
            lastMessage: '',
            time: '',
            hasUnread: false,
          }));
        setUsers([AI_USER, ...others]);
      })
      .catch((err) => console.error('Could not load users', err));
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
                lastMessage: m.text,
                time: msg.timestamp,
                hasUnread: !msg.isOutgoing && selectedUserIdRef.current !== otherId,
              }
            : u
        )
      );
    });

    socket.on('error message', (e: { error: string }) => alert(e.error));

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
  };

  const handleSendMessage = (text: string) => {
    if (!selectedUserId || !currentUser) return;

    // Real users: send over the socket; the server saves it and echoes it back
    if (!selectedUser?.isAI) {
      socketRef.current?.emit('private message', {
        sender_id: currentUser.id,
        receiver_id: Number(selectedUserId),
        text,
      });
      return;
    }

    // Chat AI: unchanged local demo behaviour
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

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, hasUnread: false } : u)));

    if (user.isAI || !currentUser) return;

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
                ? { ...u, lastMessage: last.text, time: formatTime(last.timestamp) }
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
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={handleSelectUser}
        currentUsername={currentUser.username}
        onLogout={handleLogout}
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
            <MessageList messages={currentMessages} />
            <MessageInput onSendMessage={handleSendMessage} />
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </main>
  );
}