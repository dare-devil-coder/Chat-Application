'use client';

import React, { useState } from 'react';

export interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthScreenProps {
  apiUrl: string;
  onAuthenticated: (user: AuthUser) => void;
}

// Login / register card shown before the chat UI
export const AuthScreen: React.FC<AuthScreenProps> = ({ apiUrl, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const post = async (path: string) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data as AuthUser;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') await post('/api/register');
      const user = await post('/api/login');
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full h-11 px-3 rounded-lg border border-[#E5E7EB] bg-white text-[14px] text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#2563EB]';

  return (
    <main className="h-screen w-full flex items-center justify-center bg-[#F8FAFC] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] bg-white border border-[#E5E7EB] rounded-xl p-6 space-y-4"
      >
        <h1 className="text-[24px] font-bold text-[#111827] tracking-tight">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h1>

        <input
          className={inputClass}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        {error && <p className="text-[13px] text-[#DC2626]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-medium disabled:opacity-60 transition-colors"
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Register'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="w-full text-[13px] text-[#2563EB] hover:text-[#1D4ED8]"
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Log in'}
        </button>
      </form>
    </main>
  );
};