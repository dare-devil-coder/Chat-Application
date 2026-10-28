'use client';

import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';

interface Rule {
  id: number;
  keyword: string;
  reply: string;
  enabled: boolean;
}

interface AutoReplyModalProps {
  apiUrl: string;
  userId: number;
  onClose: () => void;
}

// Pop-up where the user manages their keyword auto-reply rules
export const AutoReplyModal: React.FC<AutoReplyModalProps> = ({ apiUrl, userId, onClose }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [keyword, setKeyword] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/api/autoreply/${userId}`)
      .then((r) => r.json())
      .then((list: Rule[]) => setRules(list))
      .catch(() => setError('Could not load your rules'))
      .finally(() => setLoading(false));
  }, [apiUrl, userId]);

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/autoreply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, keyword, reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the rule');
      setRules((prev) => [...prev, data as Rule]);
      setKeyword('');
      setReply('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the rule');
    }
  };

  const toggleRule = async (rule: Rule) => {
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/autoreply/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the rule');
      setRules((prev) => prev.map((r) => (r.id === rule.id ? (data as Rule) : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the rule');
    }
  };

  const deleteRule = async (rule: Rule) => {
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/autoreply/${rule.id}?user_id=${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not delete the rule');
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the rule');
    }
  };

  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-[#E5E7EB] bg-white text-[14px] text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#2563EB]';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Auto-reply rules"
        className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-white rounded-xl border border-[#E5E7EB] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[18px] font-bold text-[#111827]">Auto-reply rules</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-[#F8FAFC] flex items-center justify-center"
          >
            <X size={18} color="#6B7280" />
          </button>
        </div>
        <p className="text-[13px] text-[#6B7280] mb-4">
          When someone sends you a message containing a keyword, the reply is sent automatically
          (at most once a minute per person, and never to another auto-reply).
        </p>

        {/* Existing rules */}
        {loading ? (
          <p className="text-[13px] text-[#6B7280] mb-4">Loading...</p>
        ) : rules.length === 0 ? (
          <p className="text-[13px] text-[#6B7280] mb-4">You have no rules yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-start gap-3 border border-[#E5E7EB] rounded-[10px] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule)}
                  title={rule.enabled ? 'Turn off' : 'Turn on'}
                  aria-label={`Enable rule for ${rule.keyword}`}
                  className="mt-1 shrink-0"
                />
                <div className={`min-w-0 flex-1 ${rule.enabled ? '' : 'opacity-50'}`}>
                  <p className="text-[13px] text-[#111827] break-words">
                    If the message contains <strong>&ldquo;{rule.keyword}&rdquo;</strong>
                  </p>
                  <p className="text-[13px] text-[#6B7280] break-words">Reply: {rule.reply}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteRule(rule)}
                  title="Delete rule"
                  aria-label="Delete rule"
                  className="w-7 h-7 rounded hover:bg-[#F8FAFC] flex items-center justify-center shrink-0"
                >
                  <Trash2 size={15} color="#DC2626" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* New rule */}
        <form onSubmit={addRule} className="space-y-2 border-t border-[#F1F5F9] pt-4">
          <p className="text-[13px] font-medium text-[#111827]">Add a rule</p>
          <input
            className={inputClass}
            placeholder="Keyword (for example: price)"
            value={keyword}
            maxLength={50}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Automatic reply"
            value={reply}
            maxLength={500}
            onChange={(e) => setReply(e.target.value)}
          />
          {error && <p className="text-[13px] text-[#DC2626]">{error}</p>}
          <button
            type="submit"
            disabled={!keyword.trim() || !reply.trim()}
            className="w-full h-10 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-medium disabled:opacity-50 transition-colors"
          >
            Add rule
          </button>
        </form>
      </div>
    </div>
  );
};