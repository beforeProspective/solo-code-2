import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Wallet, CreditCard, PiggyBank, Banknote } from 'lucide-react';
import useStore from '../store/useStore';

const accountTypes = [
  { value: 'checking', label: '支票账户', icon: Wallet },
  { value: 'savings', label: '储蓄账户', icon: PiggyBank },
  { value: 'credit', label: '信用卡', icon: CreditCard },
  { value: 'cash', label: '现金', icon: Banknote },
  { value: 'digital', label: '电子账户', icon: Wallet },
];

const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function AccountsPage() {
  const accounts = useStore((state) => state.accounts);
  const addAccount = useStore((state) => state.addAccount);
  const updateAccount = useStore((state) => state.updateAccount);
  const deleteAccount = useStore((state) => state.deleteAccount);
  const fetchAccounts = useStore((state) => state.fetchAccounts);

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking',
    currency: 'CNY',
    balance: 0,
    color: '#3b82f6',
    notes: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
      } else {
        await addAccount(formData);
      }
      setShowModal(false);
      setEditingAccount(null);
      resetForm();
    } catch (error) {
      console.error('Error saving account:', error);
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: Number(account.balance),
      color: account.color || '#3b82f6',
      notes: account.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (account) => {
    if (window.confirm(`确定要删除账户 "${account.name}" 吗？`)) {
      try {
        await deleteAccount(account.id);
      } catch (error) {
        console.error('Error deleting account:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'checking',
      currency: 'CNY',
      balance: 0,
      color: '#3b82f6',
      notes: '',
    });
  };

  const getAccountIcon = (type) => {
    const found = accountTypes.find((t) => t.value === type);
    const Icon = found?.icon || Wallet;
    return <Icon size={24} />;
  };

  const getAccountTypeLabel = (type) => {
    const found = accountTypes.find((t) => t.value === type);
    return found?.label || type;
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800">账户管理</h3>
          <p className="text-gray-500 mt-1">总余额: ¥{totalBalance.toLocaleString()}</p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          添加账户
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="bg-white rounded-xl shadow-sm overflow-hidden"
          >
            <div
              className="h-2"
              style={{ backgroundColor: account.color || '#3b82f6' }}
            />
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      backgroundColor: `${account.color || '#3b82f6'}20`,
                      color: account.color || '#3b82f6',
                    }}
                  >
                    {getAccountIcon(account.type)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800">{account.name}</h4>
                    <p className="text-sm text-gray-500">
                      {getAccountTypeLabel(account.type)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(account)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-sm text-gray-500">余额</p>
                <p className="text-2xl font-bold text-gray-800">
                  ¥{Number(account.balance).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingAccount ? '编辑账户' : '添加账户'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账户名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例如：工商银行"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账户类型
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {accountTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  货币
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="CNY">人民币 (CNY)</option>
                  <option value="USD">美元 (USD)</option>
                  <option value="EUR">欧元 (EUR)</option>
                  <option value="GBP">英镑 (GBP)</option>
                  <option value="JPY">日元 (JPY)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  余额
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      balance: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  颜色
                </label>
                <div className="flex gap-2">
                  {defaultColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        formData.color === color
                          ? 'border-gray-800 scale-110'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingAccount(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingAccount ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountsPage;
