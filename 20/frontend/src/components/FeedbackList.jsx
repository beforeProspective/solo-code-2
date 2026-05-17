import React, { useState, useEffect } from 'react';
import { feedbackAPI } from '../services/api.js';
import FeedbackCard from './FeedbackCard.jsx';

export default function FeedbackList({ status, refreshTrigger }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeedbacks = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await feedbackAPI.getFeedbacks(status);
      setFeedbacks(data);
    } catch (err) {
      setError('加载失败，请刷新页面重试');
      console.error('Failed to load feedbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [status, refreshTrigger]);

  const handleUpdate = (updatedFeedback) => {
    setFeedbacks((prev) =>
      prev.map((f) => (f.id === updatedFeedback.id ? updatedFeedback : f))
    );
  };

  const handleDelete = (feedbackId) => {
    setFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  if (feedbacks.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 text-lg">暂无反馈</p>
        <p className="text-gray-400 text-sm mt-1">成为第一个提交建议的人吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedbacks.map((feedback) => (
        <FeedbackCard
          key={feedback.id}
          feedback={feedback}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
