import React, { useState, useEffect } from 'react';
import { lensService } from '../services/api';

function LensList() {
  const [lenses, setLenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLens, setSelectedLens] = useState(null);
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    mountType: '',
    focalLength: '',
    maxAperture: '',
    minAperture: '',
    productionYear: '',
    description: '',
    condition: '',
    purchasePrice: '',
    purchaseDate: '',
    serialNumber: '',
    hasAutoFocus: false
  });

  useEffect(() => {
    loadLenses();
  }, []);

  const loadLenses = async () => {
    try {
      setLoading(true);
      const response = await lensService.getAll();
      setLenses(response.data);
      setError(null);
    } catch (err) {
      setError('加载镜头数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        focalLength: parseFloat(formData.focalLength) || null,
        maxAperture: formData.maxAperture ? parseFloat(formData.maxAperture) : null,
        minAperture: formData.minAperture ? parseFloat(formData.minAperture) : null,
        productionYear: formData.productionYear ? parseInt(formData.productionYear) : null,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null
      };
      
      if (selectedLens) {
        await lensService.update(selectedLens.id, data);
      } else {
        await lensService.create(data);
      }
      
      loadLenses();
      closeModal();
    } catch (err) {
      setError('保存失败');
      console.error(err);
    }
  };

  const handleEdit = (lens) => {
    setSelectedLens(lens);
    setFormData({
      brand: lens.brand || '',
      model: lens.model || '',
      mountType: lens.mountType || '',
      focalLength: lens.focalLength || '',
      maxAperture: lens.maxAperture || '',
      minAperture: lens.minAperture || '',
      productionYear: lens.productionYear || '',
      description: lens.description || '',
      condition: lens.condition || '',
      purchasePrice: lens.purchasePrice || '',
      purchaseDate: lens.purchaseDate || '',
      serialNumber: lens.serialNumber || '',
      hasAutoFocus: lens.hasAutoFocus || false
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这个镜头吗？')) {
      try {
        await lensService.delete(id);
        loadLenses();
      } catch (err) {
        setError('删除失败');
        console.error(err);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedLens(null);
    setFormData({
      brand: '',
      model: '',
      mountType: '',
      focalLength: '',
      maxAperture: '',
      minAperture: '',
      productionYear: '',
      description: '',
      condition: '',
      purchasePrice: '',
      purchaseDate: '',
      serialNumber: '',
      hasAutoFocus: false
    });
  };

  const handleShowDetail = (lens) => {
    setSelectedLens(lens);
    setShowDetailModal(true);
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>📸 镜头收藏名录</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
        >
          + 添加镜头
        </button>
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-number">{lenses.length}</div>
          <div className="stat-label">镜头总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {lenses.filter(l => l.hasAutoFocus).length}
          </div>
          <div className="stat-label">自动对焦镜头</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {new Set(lenses.map(l => l.mountType)).size}
          </div>
          <div className="stat-label">卡口类型</div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {lenses.length === 0 ? (
        <div className="empty-state">
          <p>暂无镜头数据，请添加您的第一个镜头</p>
        </div>
      ) : (
        <div className="card-grid">
          {lenses.map(lens => (
            <div key={lens.id} className="card">
              <div className="card-header">
                <h3>{lens.brand} {lens.model}</h3>
              </div>
              <div className="card-body">
                <p><strong>焦距:</strong> {lens.focalLength}mm</p>
                <p><strong>最大光圈:</strong> f/{lens.maxAperture || '-'}</p>
                <p><strong>卡口:</strong> {lens.mountType}</p>
                <p><strong>生产年份:</strong> {lens.productionYear || '-'}</p>
                <p><strong>对焦:</strong> {lens.hasAutoFocus ? '自动对焦' : '手动对焦'}</p>
                <p><strong>购入价格:</strong> ¥{lens.purchasePrice || '-'}</p>
              </div>
              <div className="card-footer">
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleShowDetail(lens)}
                >
                  详情
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleEdit(lens)}
                >
                  编辑
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDelete(lens.id)}
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
              <h3>{selectedLens ? '编辑镜头' : '添加镜头'}</h3>
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
                    placeholder="例如：Canon, Nikon, Leica"
                  />
                </div>
                <div className="form-group">
                  <label>型号 *</label>
                  <input 
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                    placeholder="例如：EF 50mm f/1.8"
                  />
                </div>
                <div className="form-group">
                  <label>卡口类型 *</label>
                  <input 
                    type="text"
                    required
                    value={formData.mountType}
                    onChange={(e) => setFormData({...formData, mountType: e.target.value})}
                    placeholder="例如：Canon EF, Nikon F, Leica M"
                  />
                </div>
                <div className="form-group">
                  <label>焦距 (mm) *</label>
                  <input 
                    type="number"
                    required
                    step="0.1"
                    value={formData.focalLength}
                    onChange={(e) => setFormData({...formData, focalLength: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>最大光圈</label>
                  <input 
                    type="number"
                    step="0.1"
                    value={formData.maxAperture}
                    onChange={(e) => setFormData({...formData, maxAperture: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>最小光圈</label>
                  <input 
                    type="number"
                    step="0.1"
                    value={formData.minAperture}
                    onChange={(e) => setFormData({...formData, minAperture: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>生产年份</label>
                  <input 
                    type="number"
                    value={formData.productionYear}
                    onChange={(e) => setFormData({...formData, productionYear: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>序列号</label>
                  <input 
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
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
                  <label>购入价格 (¥)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({...formData, purchasePrice: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>成色</label>
                  <input 
                    type="text"
                    value={formData.condition}
                    onChange={(e) => setFormData({...formData, condition: e.target.value})}
                    placeholder="例如：9成新，有轻微使用痕迹"
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
                <div className="form-group">
                  <label>描述</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="镜头的详细描述、特点等"
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

      {showDetailModal && selectedLens && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDetailModal(false)}>
          <div className="modal detail-modal">
            <div className="modal-header">
              <h3>镜头详情</h3>
              <button className="close-btn" onClick={() => setShowDetailModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h4>基本信息</h4>
                <div className="detail-grid">
                  <div className="detail-item"><label>品牌:</label><value>{selectedLens.brand}</value></div>
                  <div className="detail-item"><label>型号:</label><value>{selectedLens.model}</value></div>
                  <div className="detail-item"><label>卡口:</label><value>{selectedLens.mountType}</value></div>
                  <div className="detail-item"><label>焦距:</label><value>{selectedLens.focalLength}mm</value></div>
                  <div className="detail-item"><label>最大光圈:</label><value>f/{selectedLens.maxAperture || '-'}</value></div>
                  <div className="detail-item"><label>最小光圈:</label><value>f/{selectedLens.minAperture || '-'}</value></div>
                  <div className="detail-item"><label>生产年份:</label><value>{selectedLens.productionYear || '-'}</value></div>
                  <div className="detail-item"><label>对焦方式:</label><value>{selectedLens.hasAutoFocus ? '自动对焦' : '手动对焦'}</value></div>
                </div>
              </div>
              <div className="detail-section">
                <h4>购入信息</h4>
                <div className="detail-grid">
                  <div className="detail-item"><label>购入日期:</label><value>{selectedLens.purchaseDate || '-'}</value></div>
                  <div className="detail-item"><label>购入价格:</label><value>¥{selectedLens.purchasePrice || '-'}</value></div>
                  <div className="detail-item"><label>序列号:</label><value>{selectedLens.serialNumber || '-'}</value></div>
                  <div className="detail-item"><label>成色:</label><value>{selectedLens.condition || '-'}</value></div>
                </div>
              </div>
              {selectedLens.description && (
                <div className="detail-section">
                  <h4>描述</h4>
                  <p>{selectedLens.description}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LensList;
