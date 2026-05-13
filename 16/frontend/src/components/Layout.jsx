import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  PiggyBank,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Bell,
  User,
} from 'lucide-react';
import useStore from '../store/useStore';

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/accounts', label: '账户', icon: Wallet },
  { path: '/transactions', label: '交易', icon: Receipt },
  { path: '/budgets', label: '预算', icon: PiggyBank },
  { path: '/bills', label: '账单', icon: FileText },
  { path: '/reports', label: '报表', icon: BarChart3 },
  { path: '/settings', label: '设置', icon: Settings },
];

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const bills = useStore((state) => state.bills);
  const fetchBills = useStore((state) => state.fetchBills);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const overdueCount = bills?.overdue_count || 0;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-lg flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-blue-600">财务管理</h1>
        </div>
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <button
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.label}</span>
                    {item.path === '/bills' && overdueCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {overdueCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {navItems.find((item) => location.pathname === item.path)?.label || '仪表盘'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              <Bell size={20} />
              {overdueCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User size={18} className="text-blue-600" />
              </div>
              <span className="text-gray-700 font-medium">{user?.name}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
