import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts';
import { TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3, Calendar } from 'lucide-react';
import { reportApi } from '../services/api';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const [trendData, setTrendData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [netWorthData, setNetWorthData] = useState([]);
  const [accountBalances, setAccountBalances] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [period]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [trendRes, categoryRes, netWorthRes, balancesRes, summaryRes] = await Promise.all([
        reportApi.trend({ period }),
        reportApi.byCategory({ period, type: 'expense' }),
        reportApi.netWorth({ period }),
        reportApi.accountBalances(),
        reportApi.summary({ period }),
      ]);

      const trendData = (trendRes.data || []).map((item) => ({
        ...item,
        label: item.period || item.label,
      }));
      const netWorthData = (netWorthRes.data || []).map((item) => ({
        ...item,
        label: item.period || item.label,
      }));
      const summaryData = summaryRes.data ? {
        ...summaryRes.data,
        net_worth: summaryRes.data.net_worth ?? summaryRes.data.total_assets,
      } : null;

      setTrendData(trendData);
      setCategoryData(categoryRes.data || []);
      setNetWorthData(netWorthData);
      setAccountBalances(balancesRes.data || []);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `¥${Number(value || 0).toLocaleString()}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-800">{label}</p>
          {payload.map((item, index) => (
            <p key={index} style={{ color: item.color }}>
              {item.name}: {formatCurrency(item.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'week': return '本周';
      case 'month': return '本月';
      case 'quarter': return '本季度';
      case 'year': return '今年';
      default: return '本月';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-gray-800">财务报表</h3>
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-gray-500" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="quarter">本季度</option>
            <option value="year">今年</option>
          </select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-lg">
                <TrendingUp className="text-green-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{getPeriodLabel()}收入</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.income)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-50 rounded-lg">
                <TrendingDown className="text-red-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{getPeriodLabel()}支出</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.expense)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <TrendingUp className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">净收入</p>
                <p className={`text-2xl font-bold ${Number(summary.net) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.net)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-50 rounded-lg">
                <BarChart3 className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">净资产</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary.net_worth)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">收支趋势</h4>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v) => `¥${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="income"
                name="收入"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="expense"
                name="支出"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">支出分类</h4>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  labelLine={{ stroke: '#9CA3AF' }}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-400">
              <PieChartIcon size={48} className="opacity-50" />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">净资产变化</h4>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={netWorthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v) => `¥${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="net_worth"
                name="净资产"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={{ fill: '#8B5CF6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">账户余额</h4>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={accountBalances} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" stroke="#6B7280" fontSize={12} tickFormatter={(v) => `¥${v}`} />
              <YAxis dataKey="name" type="category" stroke="#6B7280" fontSize={12} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="balance" name="余额" radius={[0, 4, 4, 0]}>
                {accountBalances.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h4 className="text-lg font-semibold text-gray-800 mb-4">支出分类明细</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">分类</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">金额</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">交易笔数</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">占比</th>
              </tr>
            </thead>
            <tbody>
              {categoryData.map((item, index) => {
                const total = categoryData.reduce((sum, i) => sum + Number(i.total), 0);
                const percentage = total > 0 ? (Number(item.total) / total) * 100 : 0;
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-gray-800">{item.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 text-gray-800">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="text-right py-3 px-4 text-gray-500">
                      {item.count} 笔
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-sm ${
                        percentage > 30 ? 'bg-red-100 text-red-800' :
                        percentage > 15 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {categoryData.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ReportsPage;
