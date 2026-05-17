import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Header from './components/Header.jsx';
import LoginForm from './components/LoginForm.jsx';
import FeedbackForm from './components/FeedbackForm.jsx';
import StatusFilter from './components/StatusFilter.jsx';
import FeedbackList from './components/FeedbackList.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleFeedbackCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!user ? (
          <div className="py-12">
            <LoginForm />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <FeedbackForm onFeedbackCreated={handleFeedbackCreated} />
              <StatusFilter
                currentStatus={statusFilter}
                onStatusChange={setStatusFilter}
              />
            </div>
            
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  {statusFilter === 'all' ? '所有反馈' : '筛选结果'}
                </h2>
                <p className="text-sm text-gray-500">
                  按投票数倒序排列
                </p>
              </div>
              <FeedbackList
                status={statusFilter}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
