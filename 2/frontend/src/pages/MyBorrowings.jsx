import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

export default function MyBorrowings() {
  const { refreshUser } = useAuth();
  const [borrowings, setBorrowings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [returningId, setReturningId] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchBorrowings();
  }, [filter]);

  const fetchBorrowings = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await api.get('/my-borrowings', { params });
      setBorrowings(res.data.data);
    } catch (error) {
      console.error('获取借阅记录失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async (borrowing) => {
    if (!window.confirm('确认归还该工具？')) return;

    setReturningId(borrowing.id);
    setMessage(null);

    try {
      const res = await api.post(`/borrowings/${borrowing.id}/return`);
      setMessage({
        type: res.data.is_late ? 'warning' : 'success',
        text: res.data.is_late
          ? `归还成功，但已逾期。信用分扣除 ${Math.abs(res.data.credit_change)} 分。`
          : `归还成功！信用分 +${res.data.credit_change}`,
      });
      fetchBorrowings();
      refreshUser();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || '归还失败',
      });
    } finally {
      setReturningId(null);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
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
        <h1 className="text-3xl font-bold text-gray-800 mb-6">我的借阅</h1>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: '全部' },
              { key: 'borrowed', label: '借阅中' },
              { key: 'returned', label: '已归还' },
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

        {borrowings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-gray-600 mb-2">暂无借阅记录</h3>
            <Link to="/" className="text-blue-600 hover:underline">
              去看看有什么工具可以借
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {borrowings.map((borrowing) => (
              <div key={borrowing.id} className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="md:flex">
                  <Link to={`/tools/${borrowing.tool_id}`} className="md:w-48 flex-shrink-0">
                    <div className="h-48 md:h-full bg-gray-100">
                      {borrowing.tool?.image ? (
                        <img
                          src={borrowing.tool.image}
                          alt={borrowing.tool.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400">
                          🔧
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="p-6 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Link to={`/tools/${borrowing.tool_id}`}>
                          <h3 className="text-xl font-semibold text-gray-800 hover:text-blue-600">
                            {borrowing.tool?.name}
                          </h3>
                        </Link>
                        <p className="text-gray-600 text-sm mt-1">
                          {borrowing.tool?.category}
                        </p>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        borrowing.status === 'returned'
                          ? 'bg-gray-100 text-gray-700'
                          : isOverdue(borrowing.due_date)
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                      }`}>
                        {borrowing.status === 'returned' ? '已归还' :
                         isOverdue(borrowing.due_date) ? '已逾期' : '借阅中'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                      <div>
                        <p className="text-gray-500">借阅时间</p>
                        <p className="font-medium text-gray-800">{formatDate(borrowing.borrowed_at)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">应还时间</p>
                        <p className={`font-medium ${
                          isOverdue(borrowing.due_date) && borrowing.status !== 'returned'
                            ? 'text-red-600' : 'text-gray-800'
                        }`}>
                          {formatDate(borrowing.due_date)}
                        </p>
                      </div>
                      {borrowing.returned_at && (
                        <div>
                          <p className="text-gray-500">归还时间</p>
                          <p className="font-medium text-gray-800">{formatDate(borrowing.returned_at)}</p>
                        </div>
                      )}
                    </div>

                    {borrowing.status === 'borrowed' && (
                      <div className="mt-4">
                        <button
                          onClick={() => handleReturn(borrowing)}
                          disabled={returningId === borrowing.id}
                          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
                        >
                          {returningId === borrowing.id ? '处理中...' : '归还工具'}
                        </button>
                        {isOverdue(borrowing.due_date) && (
                          <span className="ml-4 text-red-600 text-sm">
                            ⚠️ 已逾期，归还将扣除信用分
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
