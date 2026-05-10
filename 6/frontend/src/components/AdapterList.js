import React, { useState, useEffect } from 'react';
import { adapterService, lensService } from '../services/api';

function AdapterList() {
  const [adapters, setAdapters] = useState([]);
  const [lenses, setLenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState(null);
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    fromMount: '',
    toMount: '',
    description: '',
    hasAutoFocus: false,
    hasInfinityFocus: false,
    purchasePrice: '',
    purchaseDate: '',
    quantity: 1,
    condition: ''
  });
  const [filterFromMount, setFilterFromMount] = useState('');
  const [filterToMount, setFilterToMount] = useState('');
  const [compatibleLenses, setCompatibleLenses] = useState([]);
  const [showCompatibility, setShowCompatibility] = useState(false);

  useEffect(() => {
    loadAdapters();
    loadLenses();
  }, []);

  const loadAdapters = async () => {
    try {
      setLoading(true);
      const response = await adapterService.getAll();
      setAdapters(response.data);
      setError(null);
    } catch (err) {
      setError('加载转接环数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLenses = async () => {
    try {
      const response = await lensService.getAll();
      setLenses(response.data);
    } catch (err) {
      console.error('加载镜头失败:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        quantity: parseInt(formData.quantity) || 1
      };
      
      if (selectedAdapter) {
        await adapterService.update(selectedAdapter.id, data);
      } else {
        await adapterService.create(data);
      }
      
      loadAdapters();
      closeModal();
    } catch (err) {
      setError('保存失败');
      console.error(err);
    }
  };

  const handleEdit = (adapter) => {
    setSelectedAdapter(adapter);
    setFormData({
      brand: adapter.brand || '',
      model: adapter.model || '',
      fromMount: adapter.fromMount || '',
      toMount: adapter.toMount || '',
      description: adapter.description || '',
      hasAutoFocus: adapter.hasAutoFocus || false,
      hasInfinityFocus: adapter.hasInfinityFocus || false,
      purchasePrice: adapter.purchasePrice || '',
      purchaseDate: adapter.purchaseDate || '',
      quantity: adapter.quantity || 1,
      condition: adapter.condition || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这个转接环吗？')) {
      try {
        await adapterService.delete(id);
        loadAdapters();
      } catch (err) {
        setError('删除失败');
        console.error(err);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedAdapter(null);
    setFormData({
      brand: '',
      model: '',
      fromMount: '',
      toMount: '',
      description: '',
      hasAutoFocus: false,
      hasInfinityFocus: false,
      purchasePrice: '',
      purchaseDate: '',
      quantity: 1,
      condition: ''
    });
  };

  const checkCompatibility = (adapter) => {
    const compatible = lenses.filter(lens => lens.mountType === adapter.fromMount);
    setCompatibleLenses({
      adapter,
      lenses: compatible
    });
    setShowCompatibility(true);
  };

  const filteredAdapters = adapters.filter(adapter => {
    const matchesFrom = !filterFromMount || adapter.fromMount === filterFromMount;
    const matchesTo = !filterToMount || adapter.toMount === filterToMount;
    return matchesFrom && matchesTo;
  });

  const allMounts = [...new Set([
    ...adapters.map(a => a.fromMount),
    ...adapters.map(a => a.toMount),
    ...lenses.map(l => l.mountType)
  ])].filter(Boolean);

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>🔌 转接环库存</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
        >
          + 添加转接环
        </button>
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-number">{adapters.length}</div>
          <div className="stat-label">转接环类型</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {adapters.reduce((sum, a) => sum + a.quantity, 0)}
          </div>
          <div className="stat-label">总数量</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {adapters.filter(a => a.hasAutoFocus).length}
          </div>
          <div className="stat-label">支持自动对焦</div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filter-section">
        <div className="form-group">
          <label>镜头卡口 (From)</label>
          <select 
            value={filterFromMount}
            onChange={(e) => setFilterFromMount(e.target.value)}
          >
            <option value="">全部</option>
            {allMounts.map(mount => (
              <option key={mount} value={mount}>{mount}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>相机卡口 (To)</label>
          <select 
            value={filterToMount}
            onChange={(e) => setFilterToMount(e.target.value)}
          >
            <option value="">全部</option>
            {allMounts.map(mount => (
              <option key={mount} value={mount}>{mount}</option>
            ))}
          </select>
        </div>
        <button 
          className="btn btn-secondary"
          onClick={() => {
            setFilterFromMount('');
            setFilterToMount('');
          }}
        >
          清除筛选
        </button>
      </div>

      {filteredAdapters.length === 0 ? (
        <div className="empty-state">
          <p>暂无转接环数据</p>
        </div>
      ) : (
        <div className="card-grid">
          {filteredAdapters.map(adapter => (
            <div key={adapter.id} className="card">
              <div className="card-header">
                <h3>{adapter.brand} {adapter.model}</h3>
              </div>
              <div className="card-body">
                <p><strong>转接方向:</strong> {adapter.fromMount} → {adapter.toMount}</p>
                <p><strong>自动对焦:</strong> {adapter.hasAutoFocus ? '✓ 支持' : '✗ 不支持'}</p>
                <p><strong>无限远对焦:</strong> {adapter.hasInfinityFocus ? '✓ 支持' : '✗ 不支持'}</p>
                <p><strong>库存数量:</strong> {adapter.quantity} 个</p>
                <p><strong>购入价格:</strong> ¥{adapter.purchasePrice || '-'}</p>
                <p><strong>成色:</strong> {adapter.condition || '-'}</p>
              </div>
              <div className="card-footer">
                <button 
                  className="btn btn-secondary"
                  onClick={() => checkCompatibility(adapter)}
                >
                  查看适配
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleEdit(adapter)}
                >
                  编辑
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDelete(adapter.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h3>{selectedAdapter ? '编辑转接环' : '添加转接环'}</h3>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>品牌 *</label>
                  <input 
                    type="text"
                    required
                    value={formData.brand}
                    onChange={(e) => setFormData({...formData, brand: e.target.value})}
                    placeholder="例如：Metabones, Fotodiox, K&F Concept"
                  />
                </div>
                <div className="form-group">
                  <label>型号 *</label>
                  <input 
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>镜头卡口 (From) *</label>
                  <input 
                    type="text"
                    required
                    value={formData.fromMount}
                    onChange={(e) => setFormData({...formData, fromMount: e.target.value})}
                    placeholder="例如：Canon EF, Nikon F, Leica M"
                  />
                </div>
                <div className="form-group">
                  <label>相机卡口 (To) *</label>
                  <input 
                    type="text"
                    required
                    value={formData.toMount}
                    onChange={(e) => setFormData({...formData, toMount: e.target.value})}
                    placeholder="例如：Sony E, Fujifilm X, Micro Four Thirds"
                  />
                </div>
                <div className="form-group">
                  <label>库存数量</label>
                  <input 
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>购入价格 (¥)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({...formData, purchasePrice: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>购入日期</label>
                  <input 
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>成色</label>
                  <input 
                    type="text"
                    value={formData.condition}
                    onChange={(e) => setFormData({...formData, condition: e.target.value})}
                  />
                </div>
                <div className="form-group checkbox-group">
                  <input 
                    type="checkbox"
                    id="hasAutoFocus"
                    checked={formData.hasAutoFocus}
                    onChange={(e) => setFormData({...formData, hasAutoFocus: e.target.checked})}
                  />
                  <label htmlFor="hasAutoFocus">支持自动对焦</label>
                </div>
                <div className="form-group checkbox-group">
                  <input 
                    type="checkbox"
                    id="hasInfinityFocus"
                    checked={formData.hasInfinityFocus}
                    onChange={(e) => setFormData({...formData, hasInfinityFocus: e.target.checked})}
                  />
                  <label htmlFor="hasInfinityFocus">支持无限远对焦</label>
                </div>
                <div className="form-group">
                  <label>描述</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCompatibility && compatibleLenses && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCompatibility(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>适配镜头列表</h3>
              <button className="close-btn" onClick={() => setShowCompatibility(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                <strong>{compatibleLenses.adapter.brand} {compatibleLenses.adapter.model}</strong>
                <br />
                {compatibleLenses.adapter.fromMount} → {compatibleLenses.adapter.toMount}
              </div>
              
              {compatibleLenses.lenses.length === 0 ? (
                <p className="empty-state">暂无 {compatibleLenses.adapter.fromMount} 卡口的镜头</p>
              ) : (
                <div>
                  <p>以下镜头可以使用此转接环:</p>
                  <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
                    {compatibleLenses.lenses.map(lens => (
                      <li key={lens.id} style={{ marginBottom: '0.5rem' }}>
                        {lens.brand} {lens.model} ({lens.focalLength}mm, f/{lens.maxAperture})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCompatibility(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdapterList;
