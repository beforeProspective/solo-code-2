import React, { useState, useEffect } from 'react';
import { feedbackAPI } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_CONFIG = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  planned: { label: '计划中', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  'in-progress': { label: '进行中', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800 border-red-200' },
};

export default function FeedbackCard({ feedback, onUpdate, onDelete }) {
  const { user, isAdmin } = useAuth();
  const [voted, setVoted] = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (user) {
      checkVoteStatus();
    }
  }, [user, feedback.id]);

  const checkVoteStatus = async () => {
    try {
      const result = await feedbackAPI.hasVoted(feedback.id);
      setVoted(result.voted);
    } catch (err) {
      console.error('Failed to check vote status:', err);
    }
  };

  const handleVote = async () => {
    if (!user || voteLoading) return;
    
    setVoteLoading(true);
    try {
      if (voted) {
        const updated = await feedbackAPI.unvoteFeedback(feedback.id);
        setVoted(false);
        if (onUpdate) onUpdate(updated);
      } else {
        const updated = await feedbackAPI.voteFeedback(feedback.id);
        setVoted(true);
        if (onUpdate) onUpdate(updated);
      }
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setVoteLoading(false);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      const updated = await feedbackAPI.updateStatus(feedback.id, status);
      if (onUpdate) onUpdate(updated);
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await feedbackAPI.deleteFeedback(feedback.id);
      if (onDelete) onDelete(feedback.id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const statusConfig = STATUS_CONFIG[feedback.status] || STATUS_CONFIG.pending;

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-100">
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <button
            onClick={handleVote}
            disabled={!user || voteLoading}
            className={`flex flex-col items-center justify-center w-16 h-20 rounded-lg transition-all ${
              voted
                ? 'bg-indigo-100 text-indigo-600 border-2 border-indigo-300'
                : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-500 border-2 border-transparent'
            } ${!user ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <svg
              className="w-6 h-6 mb-1"
              fill={voted ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="font-bold text-lg">{feedback.votes}</span>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-lg font-semibold text-gray-800 truncate">
              {feedback.title}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              {isAdmin() && (
                <div className="relative">
                  <button
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  {showStatusMenu && (
                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-xl border z-10">
                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <button
                          key={key}
                          onClick={() => handleStatusChange(key)}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                            feedback.status === key ? 'bg-gray-50 font-medium' : ''
                          }`}
                        >
                          {config.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4 line-clamp-3">
            {feedback.description}
          </p>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {feedback.author_name || '匿名'}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {new Date(feedback.created_at).toLocaleDateString('zh-CN')}
              </span>
            </div>

            {isAdmin() && !deleteConfirm && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                删除
              </button>
            )}
            {isAdmin() && deleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-red-500 text-sm">确认删除？</span>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  确认
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
