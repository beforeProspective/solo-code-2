import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, FileText, Check, AlertCircle } from 'lucide-react';
import useStore from '../store/useStore';

function BillsPage() {
  const bills = useStore((state) => state.bills);
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const fetchBills = useStore((state) => state.fetchBills);
  const addBill = useStore((state) => state.addBill);
  const updateBill = useStore((state) => state.updateBill);
  const deleteBill = useStore((state) => state.deleteBill);
  const markBillAsPaid = useStore((state) => state.markBillAsPaid);

  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    due_date: new Date().toISOString().split('T')[0],
    frequency: 'monthly',
    category_id: '',
    account_id: '',
    notes: '',
  });

  useEffect(() => {
    fetchBills();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        category_id: formData.category_id || null,
        account_id: formData.account_id || null,
      };

      if (editingBill) {
        await updateBill(editingBill.id, data);
      } else {
        await addBill(data);
      }
      setShowModal(false);
      setEditingBill(null);
      resetForm();
    } catch (error) {
      console.error('Error saving bill:', error);
    }
  };

  const handleEdit = (bill) => {
    setEditingBill(bill);
    setFormData({
      name: bill.name,
      amount: bill.amount.toString(),
      due_date: bill.due_date,
      frequency: bill.frequency,
      category_id: bill.category_id?.toString() || '',
      account_id: bill.account_id?.toString() || '',
      notes: bill.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (bill) => {
    if (window.confirm(`确定要删除账单 "${bill.name}" 吗？`)) {
      try {
        await deleteBill(bill.id);
      } catch (error) {
        console.error('Error deleting bill:', error);
      }
    }
  };

  const handleMarkPaid = async (bill) => {
    try {
      await markBillAsPaid(bill.id);
    } catch (error) {
      console.error('Error marking bill as paid:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      due_date: new Date().toISOString().split('T')[0],
      frequency: 'monthly',
      category_id: '',
      account_id: '',
      notes: '',
    });
  };

  const getCategoryName = (id) => {
    return categories.find((c) => c.id === id)?.name || '未分类';
  };

  const getAccountName = (id) => {
    return accounts.find((a) => a.id === id)?.name || '未指定';
  };

  const getFrequencyLabel = (frequency) => {
    const labels = {
      one_time: '一次性',
      weekly: '每周',
      monthly: '每月',
      quarterly: '每季度',
      yearly: '每年',
    };
    return labels[frequency] || frequency;
  };

  const getStatusColor = (bill) => {
    if (bill.is_paid) return 'bg-green-100 text-green-800';
    const dueDate = new Date(bill.due_date);
    const today = new Date();
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'bg-red-100 text-red-800';
    if (diffDays <= 3) return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };

  const getStatusText = (bill) => {
    if (bill.is_paid) return '已支付';
    const dueDate = new Date(bill.due_date);
    const today = new Date();
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
    if (diffDays === 0) return '今天到期';
    return `${diffDays} 天后到期`;
  };

  const billsList = bills?.bills || bills || [];
  const upcomingCount = bills?.upcoming_count || (bills?.upcoming ? bills.upcoming.length : 0);
  const overdueCount = bills?.overdue_count || (bills?.overdue ? bills.overdue.length : 0);
  const totalThisMonth = bills?.total_this_month || (billsList.length > 0 
    ? billsList.reduce((sum, b) => sum + (Number(b.amount) || 0), 0) 
    : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-gray-800">账单管理</h3>
        <button
          onClick={() => {
            setEditingBill(null);
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          添加账单
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <AlertCircle className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">本月总支出</p>
              <p className="text-2xl font-bold text-gray-800">¥{Number(totalThisMonth).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-50 rounded-lg">
              <AlertCircle className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">即将到期</p>
              <p className="text-2xl font-bold text-gray-800">{upcomingCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 rounded-lg">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">已逾期</p>
              <p className="text-2xl font-bold text-gray-800">{overdueCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h4 className="font-semibold text-gray-800">账单列表</h4>
        </div>
        <div className="divide-y divide-gray-100">
          {billsList.map((bill) => (
            <div key={bill.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${bill.is_paid ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <FileText className={bill.is_paid ? 'text-green-600' : 'text-gray-600'} size={24} />
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-800">{bill.name}</h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-500">
                        {getCategoryName(bill.category_id)} · {getAccountName(bill.account_id)}
                      </span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-sm text-gray-500">{getFrequencyLabel(bill.frequency)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-800">¥{Number(bill.amount).toLocaleString()}</p>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(bill)}`}>
                        {getStatusText(bill)}
                      </span>
                      <span className="text-xs text-gray-400">
                        到期日: {bill.due_date}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!bill.is_paid && (
                      <button
                        onClick={() => handleMarkPaid(bill)}
                        className="p-1 text-green-500 hover:text-green-700"
                        title="标记为已支付"
                      >
                        <Check size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(bill)}
                      className="p-1 text-gray-400 hover:text-blue-600"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(bill)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {billsList.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>暂无账单，点击上方按钮添加</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingBill ? '编辑账单' : '添加账单'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账单名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：房租"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    金额
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
                    到期日期
                  </label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  频率
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="one_time">一次性</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="quarterly">每季度</option>
                  <option value="yearly">每年</option>
                </select>
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
                  <option value="">选择分类</option>
                  {categories.filter((c) => c.type === 'expense').map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  支付账户
                </label>
                <select
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">选择账户</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
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
                    setEditingBill(null);
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
                  {editingBill ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillsPage;
