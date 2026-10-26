// Data models for the chat application
// Defines user profiles and chat message structures so that UI components
// can render realistic conversation threads without needing a live backend database.

export interface Attachment {
  url: string;
  name: string;
  kind: 'image' | 'video' | 'file';
  size: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isOutgoing: boolean;
  status?: 'sent' | 'delivered' | 'read';
  attachment?: Attachment;
} 

export interface User {
  id: string;
  name: string;
  initials: string;
  isOnline: boolean;
  isAI?: boolean;
  secondaryLabel?: string;
  lastMessage: string;
  time: string;
  hasUnread?: boolean;
}

// Fixed fictional demo users required for the classroom workshop
// These ensure all 70 students see identical demo data without any real student personal info.
export const DEMO_USERS: User[] = [
  {
    id: 'chat-ai',
    name: 'Chat AI',
    initials: 'AI',
    isOnline: true,
    isAI: true,
    secondaryLabel: 'AI Assistant',
    lastMessage: 'Think of an API like a messenger between two pieces of software.',
    time: '10:30 AM',
    hasUnread: false,
  },
  {
    id: 'user-nova',
    name: 'Nova Reed',
    initials: 'NR',
    isOnline: true,
    lastMessage: 'Yes! I just finished the UI.',
    time: '10:45 AM',
    hasUnread: true,
  },
  {
    id: 'user-kai',
    name: 'Kai Rowan',
    initials: 'KR',
    isOnline: false,
    lastMessage: 'Yes, it looks clean.',
    time: '9:20 AM',
    hasUnread: false,
  },
  {
    id: 'user-mira',
    name: 'Mira Vale',
    initials: 'MV',
    isOnline: true,
    lastMessage: 'Sure, give me a minute.',
    time: 'Yesterday',
    hasUnread: false,
  },
  {
    id: 'user-eli',
    name: 'Eli Stone',
    initials: 'ES',
    isOnline: false,
    lastMessage: "Yes, I'll be there.",
    time: 'Yesterday',
    hasUnread: false,
  },
  {
    id: 'user-luna',
    name: 'Luna Hayes',
    initials: 'LH',
    isOnline: true,
    lastMessage: 'Not yet. I will now.',
    time: 'Oct 24',
    hasUnread: false,
  },
];

// Initial conversation message history matching the exact demo scenarios in the specification.
// These mock exchanges allow students to inspect chat views immediately upon selecting a user.
export const INITIAL_CONVERSATIONS: Record<string, Message[]> = {
  'user-nova': [
    {
      id: 'm-nr-1',
      senderId: 'current-user',
      text: 'Hey, are we building the chat app today?',
      timestamp: '10:44 AM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-nr-2',
      senderId: 'user-nova',
      text: 'Yes! I just finished the UI.',
      timestamp: '10:45 AM',
      isOutgoing: false,
    },
  ],
  'user-kai': [
    {
      id: 'm-kr-1',
      senderId: 'current-user',
      text: 'Did you try the new setup?',
      timestamp: '9:18 AM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-kr-2',
      senderId: 'user-kai',
      text: 'Yes, it looks clean.',
      timestamp: '9:20 AM',
      isOutgoing: false,
    },
  ],
  'user-mira': [
    {
      id: 'm-mv-1',
      senderId: 'current-user',
      text: 'Can you send me the project?',
      timestamp: '3:15 PM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-mv-2',
      senderId: 'user-mira',
      text: 'Sure, give me a minute.',
      timestamp: '3:16 PM',
      isOutgoing: false,
    },
  ],
  'user-eli': [
    {
      id: 'm-es-1',
      senderId: 'current-user',
      text: 'Are you joining the session?',
      timestamp: '11:02 AM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-es-2',
      senderId: 'user-eli',
      text: "Yes, I'll be there.",
      timestamp: '11:05 AM',
      isOutgoing: false,
    },
  ],
  'user-luna': [
    {
      id: 'm-lh-1',
      senderId: 'current-user',
      text: 'Did you test the messages?',
      timestamp: '4:20 PM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-lh-2',
      senderId: 'user-luna',
      text: 'Not yet. I will now.',
      timestamp: '4:22 PM',
      isOutgoing: false,
    },
  ],
  'chat-ai': [
    {
      id: 'm-ai-1',
      senderId: 'current-user',
      text: 'Explain APIs in simple words.',
      timestamp: '10:29 AM',
      isOutgoing: true,
      status: 'read',
    },
    {
      id: 'm-ai-2',
      senderId: 'chat-ai',
      text: 'Think of an API like a messenger between two pieces of software. You send a request, the API carries it to the other system, and brings the response back.',
      timestamp: '10:30 AM',
      isOutgoing: false,
    },
  ],
};
