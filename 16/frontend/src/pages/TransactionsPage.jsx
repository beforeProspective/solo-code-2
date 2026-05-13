import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Filter, Search, ArrowUpRight, ArrowDownRight, ArrowRightLeft } from 'lucide-react';
import useStore from '../store/useStore';

function TransactionsPage() {
  const transactions = useStore((state) => state.transactions);
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const tags = useStore((state) => state.tags);
  const fetchTransactions = useStore((state) => state.fetchTransactions);
  const addTransaction = useStore((state) => state.addTransaction);
  const updateTransaction = useStore((state) => state.updateTransaction);
  const deleteTransaction = useStore((state) => state.deleteTransaction);

  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    account_id: '',
  });
  const [formData, setFormData] = useState({
    type: 'expense',
    account_id: '',
    category_id: '',
    amount: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: '',
    tag_ids: [],
  });

  useEffect(() => {
    fetchTransactions(filters);
  }, [filters]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        currency: 'CNY',
        category_id: formData.category_id || null,
      };

      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, data);
      } else {
        await addTransaction(data);
      }
      setShowModal(false);
      setEditingTransaction(null);
      resetForm();
      fetchTransactions(filters);
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      type: transaction.type,
      account_id: transaction.account_id.toString(),
      category_id: transaction.category_id?.toString() || '',
      amount: transaction.amount.toString(),
      description: transaction.description || '',
      transaction_date: transaction.transaction_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      notes: transaction.notes || '',
      tag_ids: transaction.tags?.map((t) => t.id) || [],
    });
    setShowModal(true);
  };

  const handleDelete = async (transaction) => {
    if (window.confirm('确定要删除这条交易记录吗？')) {
      try {
        await deleteTransaction(transaction.id);
        fetchTransactions(filters);
      } catch (error) {
        console.error('Error deleting transaction:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'expense',
      account_id: accounts[0]?.id?.toString() || '',
      category_id: '',
      amount: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0],
      notes: '',
      tag_ids: [],
    });
  };

  const getTypeIcon = (type) => {
    if (type === 'income') return <ArrowUpRight className="text-green-500" size={20} />;
    if (type === 'expense') return <ArrowDownRight className="text-red-500" size={20} />;
    return <ArrowRightLeft className="text-blue-500" size={20} />;
  };

  const getTypeLabel = (type) => {
    if (type === 'income') return '收入';
    if (type === 'expense') return '支出';
    return '转账';
  };

  const getCategoryName = (id) => {
    return categories.find((c) => c.id === id)?.name || '-';
  };

  const getAccountName = (id) => {
    return accounts.find((a) => a.id === id)?.name || '-';
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const currentCategories = formData.type === 'income' ? incomeCategories : expenseCategories;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-gray-800">交易记录</h3>
        <button
          onClick={() => {
            setEditingTransaction(null);
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          添加交易
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm text-gray-600">筛选：</span>
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部类型</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
            <option value="transfer">转账</option>
          </select>
          <select
            value={filters.account_id}
            onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">全部账户</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                日期
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                类型
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                描述
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                账户
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                分类
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                金额
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(transaction.transaction_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(transaction.type)}
                    <span className="text-sm">{getTypeLabel(transaction.type)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {transaction.description || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {getAccountName(transaction.account_id)}
                </td>
                <td className="px-6 py-4">
                  {transaction.category ? (
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${transaction.category.color}20`,
                        color: transaction.category.color,
                      }}
                    >
                      {transaction.category.name}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  <span
                    className={
                      transaction.type === 'income'
                        ? 'text-green-600'
                        : transaction.type === 'expense'
                        ? 'text-red-600'
                        : 'text-blue-600'
                    }
                  >
                    {transaction.type === 'income' ? '+' : '-'}¥
                    {Number(transaction.amount).toLocaleString()}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => handleEdit(transaction)}
                      className="p-1 text-gray-400 hover:text-blue-600"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(transaction)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  暂无交易记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingTransaction ? '编辑交易' : '添加交易'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-4">
                <label
                  className={`flex-1 py-3 px-4 rounded-lg border-2 cursor-pointer text-center ${
                    formData.type === 'expense'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="expense"
                    checked={formData.type === 'expense'}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value, category_id: '' })
                    }
                    className="hidden"
                  />
                  支出
                </label>
                <label
                  className={`flex-1 py-3 px-4 rounded-lg border-2 cursor-pointer text-center ${
                    formData.type === 'income'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="income"
                    checked={formData.type === 'income'}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value, category_id: '' })
                    }
                    className="hidden"
                  />
                  收入
                </label>
                <label
                  className={`flex-1 py-3 px-4 rounded-lg border-2 cursor-pointer text-center ${
                    formData.type === 'transfer'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="transfer"
                    checked={formData.type === 'transfer'}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value, category_id: '' })
                    }
                    className="hidden"
                  />
                  转账
                </label>
              </div>

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
                  账户
                </label>
                <select
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">请选择账户</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {formData.type !== 'transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分类
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">请选择分类</option>
                    {currentCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日期
                </label>
                <input
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) =>
                    setFormData({ ...formData, transaction_date: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：午餐、购物等"
                />
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
                    setEditingTransaction(null);
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
                  {editingTransaction ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionsPage;
