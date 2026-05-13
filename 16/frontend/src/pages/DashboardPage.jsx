import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import useStore from '../store/useStore';
import { reportApi } from '../services/api';

function StatCard({ title, value, icon: Icon, trend, trendValue, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">¥{value.toLocaleString()}</p>
          {trendValue && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              {trend === 'up' ? (
                <ArrowUpRight size={16} className="text-green-500" />
              ) : (
                <ArrowDownRight size={16} className="text-red-500" />
              )}
              <span className={trend === 'up' ? 'text-green-500' : 'text-red-500'}>
                {trendValue}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function DashboardPage() {
  const summary = useStore((state) => state.summary);
  const accounts = useStore((state) => state.accounts);
  const fetchAll = useStore((state) => state.fetchAll);
  const [trendData, setTrendData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const [trendRes, categoryRes] = await Promise.all([
        reportApi.trend(),
        reportApi.byCategory(),
      ]);
      setTrendData(trendRes.data);
      setCategoryData(categoryRes.data);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalAssets = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="总收入"
          value={summary?.income || 0}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="总支出"
          value={summary?.expense || 0}
          icon={TrendingDown}
          color="red"
        />
        <StatCard
          title="净资产"
          value={summary?.net || 0}
          icon={Wallet}
          color="blue"
        />
        <StatCard
          title="总资产"
          value={totalAssets}
          icon={Receipt}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">收支趋势</h3>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-gray-400">
              加载中...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="收入"
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="支出"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">支出分类</h3>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-gray-400">
              加载中...
            </div>
          ) : (
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="total"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {categoryData.slice(0, 5).map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm text-gray-600">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800">
                      ¥{item.total.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">账户余额</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={accounts.map(a => ({ name: a.name, balance: Number(a.balance) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip />
              <Bar dataKey="balance" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">热门分类</h3>
          <div className="space-y-4">
            {summary?.top_categories?.slice(0, 5)?.map((cat, index) => (
              <div key={cat.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">{cat.name}</span>
                  <span className="text-sm font-medium text-gray-800">
                    ¥{cat.total.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, (cat.total / (summary?.top_categories?.[0]?.total || 1)) * 100)}%`,
                      backgroundColor: cat.color || COLORS[index % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
