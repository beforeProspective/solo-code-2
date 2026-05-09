import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import ToolCard from '../components/ToolCard';

export default function MyTools() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTool, setNewTool] = useState({
    name: '',
    description: '',
    category: '',
    condition: 'good',
    image: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await api.get('/my-tools');
      setTools(res.data.data);
    } catch (error) {
      console.error('获取我的工具失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.post('/tools', newTool);
      setShowAddModal(false);
      setNewTool({ name: '', description: '', category: '', condition: 'good', image: '' });
      fetchTools();
      setMessage({ type: 'success', text: '工具添加成功！' });
    } catch (error) {
      const errors = error.response?.data?.errors;
      if (errors) {
        setMessage({ type: 'error', text: Object.values(errors).flat().join(' ') });
      } else {
        setMessage({ type: 'error', text: '添加失败，请重试' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tool) => {
    if (!window.confirm(`确定要删除"${tool.name}"吗？`)) return;

    try {
      await api.delete(`/tools/${tool.id}`);
      fetchTools();
      setMessage({ type: 'success', text: '工具已删除' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || '删除失败' });
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">我的工具</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
          >
            + 添加工具
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {tools.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <div className="text-6xl mb-4">🔧</div>
            <h3 className="text-xl font-semibold text-gray-600 mb-2">您还没有添加工具</h3>
            <p className="text-gray-500 mb-4">分享您的工具，让社区更美好</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
            >
              添加第一个工具
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {tools.map((tool) => (
              <div key={tool.id} className="relative">
                <ToolCard tool={tool} />
                <button
                  onClick={() => handleDelete(tool)}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">添加新工具</h2>

            {message && showAddModal && (
              <div className={`p-3 rounded-lg mb-4 ${
                message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  工具名称 *
                </label>
                <input
                  type="text"
                  value={newTool.name}
                  onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="例如：电钻"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类 *
                </label>
                <input
                  type="text"
                  value={newTool.category}
                  onChange={(e) => setNewTool({ ...newTool, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="例如：电动工具、手动工具"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述 *
                </label>
                <textarea
                  value={newTool.description}
                  onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="详细描述您的工具..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  状态
                </label>
                <select
                  value={newTool.condition}
                  onChange={(e) => setNewTool({ ...newTool, condition: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="good">良好</option>
                  <option value="fair">一般</option>
                  <option value="poor">较差</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  图片链接（可选）
                </label>
                <input
                  type="url"
                  value={newTool.image}
                  onChange={(e) => setNewTool({ ...newTool, image: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setMessage(null); }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? '保存中...' : '添加工具'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
