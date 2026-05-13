import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, PiggyBank } from 'lucide-react';
import useStore from '../store/useStore';

function BudgetsPage() {
  const budgets = useStore((state) => state.budgets);
  const categories = useStore((state) => state.categories);
  const fetchBudgets = useStore((state) => state.fetchBudgets);
  const addBudget = useStore((state) => state.addBudget);
  const updateBudget = useStore((state) => state.updateBudget);
  const deleteBudget = useStore((state) => state.deleteBudget);

  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    amount: '',
    currency: 'CNY',
    period: 'monthly',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    notes: '',
  });

  useEffect(() => {
    fetchBudgets();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        category_id: formData.category_id || null,
      };

      if (editingBudget) {
        await updateBudget(editingBudget.id, data);
      } else {
        await addBudget(data);
      }
      setShowModal(false);
      setEditingBudget(null);
      resetForm();
    } catch (error) {
      console.error('Error saving budget:', error);
    }
  };

  const handleEdit = (budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      category_id: budget.category_id?.toString() || '',
      amount: budget.amount.toString(),
      currency: budget.currency,
      period: budget.period,
      year: budget.year,
      month: budget.month || new Date().getMonth() + 1,
      notes: budget.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (budget) => {
    if (window.confirm(`确定要删除预算 "${budget.name}" 吗？`)) {
      try {
        await deleteBudget(budget.id);
      } catch (error) {
        console.error('Error deleting budget:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category_id: '',
      amount: '',
      currency: 'CNY',
      period: 'monthly',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      notes: '',
    });
  };

  const getCategoryName = (id) => {
    return categories.find((c) => c.id === id)?.name || '全部分类';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-gray-800">预算管理</h3>
        <button
          onClick={() => {
            setEditingBudget(null);
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          添加预算
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {budgets.map((budget) => {
          const percentage = budget.percentage || 0;
          const isOver = percentage > 100;

          return (
            <div key={budget.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <PiggyBank className="text-purple-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">{budget.name}</h4>
                    <p className="text-sm text-gray-500">
                      {getCategoryName(budget.category_id)} · {budget.period === 'monthly' ? '月度' : '年度'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(budget)}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(budget)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">已花费</span>
                  <span className={isOver ? 'text-red-600 font-medium' : 'text-gray-800'}>
                    ¥{Number(budget.spent).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">预算</span>
                  <span className="text-gray-800">¥{Number(budget.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">剩余</span>
                  <span className={isOver ? 'text-red-600' : 'text-green-600'}>
                    ¥{Number(budget.remaining).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">进度</span>
                  <span className={isOver ? 'text-red-600' : 'text-gray-600'}>
                    {percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      isOver ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {budgets.length === 0 && (
          <div className="col-span-full bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <PiggyBank size={48} className="mx-auto mb-4 opacity-50" />
            <p>暂无预算，点击上方按钮添加</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingBudget ? '编辑预算' : '添加预算'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预算名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：餐饮预算"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">全部分类</option>
                  {categories.filter((c) => c.type === 'expense').map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预算金额
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  周期
                </label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="monthly">月度</option>
                  <option value="yearly">年度</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingBudget(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingBudget ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetsPage;
