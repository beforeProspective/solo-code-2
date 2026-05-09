import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

export default function DamageReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = user?.is_admin
        ? await api.get('/damage-reports', { params })
        : await api.get('/my-reports', { params });
      setReports(res.data.data);
    } catch (error) {
      console.error('获取报告列表失败', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (report, status) => {
    try {
      await api.put(`/damage-reports/${report.id}`, { status });
      fetchReports();
      setMessage({ type: 'success', text: '状态已更新' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '更新失败',
      });
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'severe': return 'bg-red-100 text-red-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  const getLevelText = (level) => {
    switch (level) {
      case 'severe': return '严重';
      case 'moderate': return '中等';
      default: return '轻微';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'reviewed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'resolved': return '已解决';
      case 'reviewed': return '已审核';
      default: return '待处理';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          {user?.is_admin ? '损坏报告管理' : '我的损坏报告'}
        </h1>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: '全部' },
              { key: 'pending', label: '待处理' },
              { key: 'reviewed', label: '已审核' },
              { key: 'resolved', label: '已解决' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-4 py-2 rounded-lg transition ${
                  filter === item.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-600 mb-2">暂无报告</h3>
            <Link to="/" className="text-blue-600 hover:underline">
              浏览工具
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow-md p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Link to={`/tools/${report.tool_id}`} className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {report.tool?.image ? (
                        <img
                          src={report.tool.image}
                          alt={report.tool.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">
                          🔧
                        </div>
                      )}
                    </Link>
                    <div>
                      <Link to={`/tools/${report.tool_id}`} className="text-lg font-semibold text-gray-800 hover:text-blue-600">
                        {report.tool?.name}
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">
                        报告人: {report.reporter?.name}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getLevelColor(report.damage_level)}`}>
                          {getLevelText(report.damage_level)}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(report.status)}`}>
                          {getStatusText(report.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">
                    {new Date(report.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>

                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700">{report.description}</p>
                </div>

                {user?.is_admin && report.status !== 'resolved' && (
                  <div className="mt-4 flex gap-2">
                    {report.status === 'pending' && (
                      <button
                        onClick={() => updateStatus(report, 'reviewed')}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-2 rounded-lg transition text-sm"
                      >
                        标记为已审核
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(report, 'resolved')}
                      className="bg-green-100 hover:bg-green-200 text-green-800 px-4 py-2 rounded-lg transition text-sm"
                    >
                      标记为已解决
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
