import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">产品意见反馈系统</h1>
            <p className="text-indigo-200 mt-1">分享您的想法，投票支持喜欢的功能</p>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-medium">{user.username}</p>
                  {isAdmin() && (
                    <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">
                      管理员
                    </span>
                  )}
                </div>
                <button
                  onClick={logout}
                  className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
                >
                  退出登录
                </button>
              </div>
            ) : (
              <p className="text-indigo-200">请登录以提交反馈和投票</p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
