import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

export default function ToolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tool, setTool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [borrowDays, setBorrowDays] = useState(7);
  const [borrowing, setBorrowing] = useState(false);
  const [message, setMessage] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLevel, setReportLevel] = useState('minor');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    fetchTool();
  }, [id]);

  const fetchTool = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/tools/${id}`);
      setTool(res.data);
    } catch (error) {
      console.error('获取工具详情失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBorrow = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setBorrowing(true);
    setMessage(null);

    try {
      const res = await api.post('/borrowings', {
        tool_id: tool.id,
        days: borrowDays,
      });
      setMessage({ type: 'success', text: '借阅成功！请按时归还。' });
      fetchTool();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '借阅失败，请重试',
      });
    } finally {
      setBorrowing(false);
    }
  };

  const handleReportDamage = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    setReporting(true);
    try {
      await api.post('/damage-reports', {
        tool_id: tool.id,
        damage_level: reportLevel,
        description: reportDesc,
      });
      setMessage({ type: 'success', text: '损坏报告已提交。' });
      setShowReportModal(false);
      setReportLevel('minor');
      setReportDesc('');
      fetchTool();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '提交失败，请重试',
      });
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-16">
          <h3 className="text-xl font-semibold text-gray-600">工具不存在</h3>
          <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">
            返回工具目录
          </Link>
        </div>
      </div>
    );
  }

  const statusColors = {
    available: 'bg-green-100 text-green-800',
    borrowed: 'bg-red-100 text-red-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
  };

  const statusText = {
    available: '可借',
    borrowed: '已借出',
    maintenance: '维护中',
  };

  const isOwner = user && tool.owner_id === user.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link to="/" className="text-blue-600 hover:underline mb-6 inline-block">
          ← 返回工具目录
        </Link>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="md:flex">
            <div className="md:w-1/2">
              <div className="aspect-video bg-gray-100">
                {tool.image ? (
                  <img src={tool.image} alt={tool.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-8xl text-gray-400">
                    🔧
                  </div>
                )}
              </div>
            </div>

            <div className="md:w-1/2 p-8">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl font-bold text-gray-800">{tool.name}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[tool.status]}`}>
                  {statusText[tool.status]}
                </span>
              </div>

              <div className="flex gap-2 mb-4">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {tool.category}
                </span>
                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                  状态: {tool.condition}
                </span>
              </div>

              <p className="text-gray-600 mb-6">{tool.description}</p>

              <div className="mb-6">
                <p className="text-sm text-gray-500">拥有者</p>
                <p className="font-semibold text-gray-800">{tool.owner?.name}</p>
              </div>

              {!isOwner && tool.status === 'available' && (
                <div className="space-y-4 border-t pt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      借阅天数
                    </label>
                    <select
                      value={borrowDays}
                      onChange={(e) => setBorrowDays(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => (
                        <option key={d} value={d}>{d} 天</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleBorrow}
                    disabled={borrowing}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {borrowing ? '处理中...' : '申请借阅'}
                  </button>
                </div>
              )}

              {!isOwner && tool.status === 'available' && user && (
                <button
                  onClick={() => setShowReportModal(true)}
                  className="w-full mt-4 bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold py-3 rounded-lg transition"
                >
                  报告损坏
                </button>
              )}

              {isOwner && (
                <div className="border-t pt-6">
                  <p className="text-gray-600 text-center">这是您的工具</p>
                </div>
              )}

              {tool.status === 'borrowed' && (
                <div className="border-t pt-6">
                  <p className="text-red-600 text-center">该工具已被借出</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {tool.damage_reports?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">损坏报告</h2>
            <div className="space-y-4">
              {tool.damage_reports.map((report) => (
                <div key={report.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-sm px-2 py-1 rounded ${
                        report.damage_level === 'severe' ? 'bg-red-100 text-red-800' :
                        report.damage_level === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {report.damage_level === 'severe' ? '严重' :
                         report.damage_level === 'moderate' ? '中等' : '轻微'}
                      </span>
                      <p className="mt-2 text-gray-700">{report.description}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        报告人: {report.reporter?.name}
                      </p>
                    </div>
                    <span className={`text-sm px-2 py-1 rounded ${
                      report.status === 'resolved' ? 'bg-green-100 text-green-800' :
                      report.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {report.status === 'resolved' ? '已解决' :
                       report.status === 'reviewed' ? '已审核' : '待处理'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">报告工具损坏</h2>
            <form onSubmit={handleReportDamage} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  损坏程度
                </label>
                <select
                  value={reportLevel}
                  onChange={(e) => setReportLevel(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="minor">轻微</option>
                  <option value="moderate">中等</option>
                  <option value="severe">严重</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  详细描述
                </label>
                <textarea
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="请描述损坏情况..."
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={reporting}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg disabled:opacity-50"
                >
                  {reporting ? '提交中...' : '提交报告'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
