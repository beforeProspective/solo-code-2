import { useEffect, useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  Tag,
  FolderTree,
  GitBranch,
  RefreshCw,
  Settings as SettingsIcon,
} from 'lucide-react';
import useStore from '../store/useStore';
import { dataApi, currencyApi } from '../services/api';

function SettingsPage() {
  const categories = useStore((state) => state.categories);
  const tags = useStore((state) => state.tags);
  const rules = useStore((state) => state.rules);
  const fetchCategories = useStore((state) => state.fetchCategories);
  const fetchTags = useStore((state) => state.fetchTags);
  const fetchRules = useStore((state) => state.fetchRules);
  const addCategory = useStore((state) => state.addCategory);
  const deleteCategory = useStore((state) => state.deleteCategory);
  const addTag = useStore((state) => state.addTag);
  const updateTag = useStore((state) => state.updateTag);
  const deleteTag = useStore((state) => state.deleteTag);
  const addRule = useStore((state) => state.addRule);
  const updateRule = useStore((state) => state.updateRule);
  const deleteRule = useStore((state) => state.deleteRule);

  const [activeTab, setActiveTab] = useState('categories');
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [editingRule, setEditingRule] = useState(null);

  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'expense' });
  const [tagForm, setTagForm] = useState({ name: '', color: '#3B82F6' });
  const [ruleForm, setRuleForm] = useState({
    name: '',
    pattern: '',
    category_id: '',
    tag_ids: [],
    min_amount: '',
    max_amount: '',
    priority: '10',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCategories(),
        fetchTags(),
        fetchRules(),
        loadCurrencies(),
      ]);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrencies = async () => {
    try {
      const response = await currencyApi.getAll();
      setCurrencies(response.data || []);
    } catch (error) {
      console.error('Error loading currencies:', error);
    }
  };

  const updateExchangeRates = async () => {
    try {
      await currencyApi.updateRates();
      await loadCurrencies();
    } catch (error) {
      console.error('Error updating rates:', error);
    }
  };

  const handleExportData = async (format) => {
    try {
      const response = await dataApi.export(format);
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-export.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  const handleImportData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await dataApi.import(file);
      alert('数据导入成功！');
    } catch (error) {
      console.error('Error importing data:', error);
      alert('数据导入失败');
    }
    e.target.value = '';
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      await addCategory(categoryForm);
      setShowCategoryModal(false);
      setCategoryForm({ name: '', type: 'expense' });
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleTagSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTag) {
        await updateTag(editingTag.id, tagForm);
      } else {
        await addTag(tagForm);
      }
      setShowTagModal(false);
      setEditingTag(null);
      setTagForm({ name: '', color: '#3B82F6' });
    } catch (error) {
      console.error('Error saving tag:', error);
    }
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...ruleForm,
        min_amount: ruleForm.min_amount ? parseFloat(ruleForm.min_amount) : null,
        max_amount: ruleForm.max_amount ? parseFloat(ruleForm.max_amount) : null,
        priority: parseInt(ruleForm.priority),
        category_id: ruleForm.category_id || null,
      };

      if (editingRule) {
        await updateRule(editingRule.id, data);
      } else {
        await addRule(data);
      }
      setShowRuleModal(false);
      setEditingRule(null);
      resetRuleForm();
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const handleEditTag = (tag) => {
    setEditingTag(tag);
    setTagForm({ name: tag.name, color: tag.color || '#3B82F6' });
    setShowTagModal(true);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      pattern: rule.pattern,
      category_id: rule.category_id?.toString() || '',
      tag_ids: rule.tags?.map((t) => t.id.toString()) || [],
      min_amount: rule.min_amount?.toString() || '',
      max_amount: rule.max_amount?.toString() || '',
      priority: rule.priority?.toString() || '10',
    });
    setShowRuleModal(true);
  };

  const resetRuleForm = () => {
    setRuleForm({
      name: '',
      pattern: '',
      category_id: '',
      tag_ids: [],
      min_amount: '',
      max_amount: '',
      priority: '10',
    });
  };

  const toggleTagSelection = (tagId) => {
    setRuleForm((prev) => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId.toString())
        ? prev.tag_ids.filter((id) => id !== tagId.toString())
        : [...prev.tag_ids, tagId.toString()],
    }));
  };

  const tabs = [
    { id: 'categories', label: '分类管理', icon: FolderTree },
    { id: 'tags', label: '标签管理', icon: Tag },
    { id: 'rules', label: '规则管理', icon: GitBranch },
    { id: 'currencies', label: '货币管理', icon: SettingsIcon },
    { id: 'data', label: '数据导入导出', icon: Download },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-semibold text-gray-800">系统设置</h3>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-semibold text-gray-800">收支分类</h4>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={18} />
              添加分类
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-3">收入分类</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.filter((c) => c.type === 'income').map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                  >
                    <span className="text-green-800">{category.name}</span>
                    <button
                      onClick={() => {
                        if (window.confirm('确定要删除这个分类吗？')) {
                          deleteCategory(category.id);
                        }
                      }}
                      className="text-green-600 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-sm font-medium text-gray-500 mb-3">支出分类</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.filter((c) => c.type === 'expense').map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                  >
                    <span className="text-red-800">{category.name}</span>
                    <button
                      onClick={() => {
                        if (window.confirm('确定要删除这个分类吗？')) {
                          deleteCategory(category.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-semibold text-gray-800">标签管理</h4>
            <button
              onClick={() => {
                setEditingTag(null);
                setTagForm({ name: '', color: '#3B82F6' });
                setShowTagModal(true);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={18} />
              添加标签
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-white"
                style={{ backgroundColor: tag.color || '#3B82F6' }}
              >
                <span>{tag.name}</span>
                <button
                  onClick={() => handleEditTag(tag)}
                  className="hover:bg-white/20 rounded p-1"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('确定要删除这个标签吗？')) {
                      deleteTag(tag.id);
                    }
                  }}
                  className="hover:bg-white/20 rounded p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {tags.length === 0 && (
              <p className="text-gray-400">暂无标签，点击上方按钮添加</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-semibold text-gray-800">自动分类规则</h4>
            <button
              onClick={() => {
                setEditingRule(null);
                resetRuleForm();
                setShowRuleModal(true);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={18} />
              添加规则
            </button>
          </div>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <h5 className="font-medium text-gray-800">{rule.name}</h5>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sm text-gray-500">
                      匹配模式: <code>{rule.pattern}</code>
                    </span>
                    {rule.category && (
                      <span className="text-sm text-gray-500">
                        分类: {rule.category.name}
                      </span>
                    )}
                    {rule.priority && (
                      <span className="text-sm text-gray-500">
                        优先级: {rule.priority}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditRule(rule)}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('确定要删除这个规则吗？')) {
                        deleteRule(rule.id);
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="text-gray-400 text-center py-8">
                暂无规则，创建规则可以自动为交易分类
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'currencies' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-semibold text-gray-800">货币汇率</h4>
            <button
              onClick={updateExchangeRates}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <RefreshCw size={18} />
              更新汇率
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">货币</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">代码</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">符号</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">对人民币汇率</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">最后更新</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((currency) => (
                  <tr key={currency.id} className="border-b border-gray-100">
                    <td className="py-3 px-4 text-gray-800">{currency.name}</td>
                    <td className="py-3 px-4 text-gray-600 font-mono">{currency.code}</td>
                    <td className="py-3 px-4 text-gray-600">{currency.symbol}</td>
                    <td className="py-3 px-4 text-right text-gray-800">
                      {Number(currency.rate_to_cny).toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-sm">
                      {currency.updated_at || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">数据导出</h4>
            <div className="flex gap-4">
              <button
                onClick={() => handleExportData('json')}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download size={20} />
                导出 JSON
              </button>
              <button
                onClick={() => handleExportData('csv')}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download size={20} />
                导出 CSV
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">数据导入</h4>
            <p className="text-gray-500 mb-4">
              支持 CSV、OFX、QIF 格式的财务数据文件导入
            </p>
            <label className="flex items-center justify-center gap-2 px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
              <Upload size={24} className="text-gray-400" />
              <span className="text-gray-600">点击或拖拽文件到此处</span>
              <input
                type="file"
                accept=".csv,.ofx,.qif,.json"
                onChange={handleImportData}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">添加分类</h3>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类名称
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  类型
                </label>
                <select
                  value={categoryForm.type}
                  onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="income">收入</option>
                  <option value="expense">支出</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingTag ? '编辑标签' : '添加标签'}
            </h3>
            <form onSubmit={handleTagSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标签名称
                </label>
                <input
                  type="text"
                  value={tagForm.name}
                  onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  颜色
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={tagForm.color}
                    onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={tagForm.color}
                    onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTagModal(false);
                    setEditingTag(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingTag ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 my-8">
            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {editingRule ? '编辑规则' : '添加规则'}
            </h3>
            <form onSubmit={handleRuleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  规则名称
                </label>
                <input
                  type="text"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  匹配模式
                </label>
                <input
                  type="text"
                  value={ruleForm.pattern}
                  onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：美团、外卖、工资"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  交易描述中包含此文本时触发规则（支持简单字符串匹配）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  自动分类
                </label>
                <select
                  value={ruleForm.category_id}
                  onChange={(e) => setRuleForm({ ...ruleForm, category_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">不自动分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.type === 'income' ? '收入' : '支出'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  自动打标签
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTagSelection(tag.id)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        ruleForm.tag_ids.includes(tag.id.toString())
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={{
                        backgroundColor: ruleForm.tag_ids.includes(tag.id.toString())
                          ? tag.color || '#3B82F6'
                          : undefined,
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最小金额
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ruleForm.min_amount}
                    onChange={(e) => setRuleForm({ ...ruleForm, min_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="可选"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最大金额
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={ruleForm.max_amount}
                    onChange={(e) => setRuleForm({ ...ruleForm, max_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="可选"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  优先级
                </label>
                <input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-400 mt-1">
                  数字越小优先级越高
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRuleModal(false);
                    setEditingRule(null);
                    resetRuleForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingRule ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
