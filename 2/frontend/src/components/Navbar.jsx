import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('退出登录失败', error);
    }
  };

  const getCreditColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">🔧</span>
            社区工具共享平台
          </Link>

          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-blue-200 transition">工具目录</Link>
            
            {user && (
              <>
                <Link to="/my-borrowings" className="hover:text-blue-200 transition">我的借阅</Link>
                <Link to="/my-tools" className="hover:text-blue-200 transition">我的工具</Link>
                <Link to="/damage-reports" className="hover:text-blue-200 transition">损坏报告</Link>
              </>
            )}

            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-blue-500 px-3 py-1 rounded-lg">
                  <span className="text-sm">{user.name}</span>
                  <span className={`text-sm font-semibold ${getCreditColor(user.credit_score)}`}>
                    信用分: {user.credit_score}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition"
                >
                  退出
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="bg-white text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg transition"
                >
                  登录
                </Link>
                <Link
                  to="/register"
                  className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg transition"
                >
                  注册
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
