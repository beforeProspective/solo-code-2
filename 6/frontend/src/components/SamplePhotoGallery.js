import React, { useState, useEffect } from 'react';
import { samplePhotoService, lensService } from '../services/api';

function SamplePhotoGallery() {
  const [photos, setPhotos] = useState([]);
  const [lenses, setLenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [filterLensId, setFilterLensId] = useState('');
  const [formData, setFormData] = useState({
    lensId: '',
    title: '',
    description: '',
    imageUrl: '',
    apertureUsed: '',
    shutterSpeed: '',
    isoUsed: '',
    cameraModel: '',
    dateTaken: '',
    notes: ''
  });

  useEffect(() => {
    loadPhotos();
    loadLenses();
  }, []);

  const loadPhotos = async (lensId = null) => {
    try {
      setLoading(true);
      const response = await samplePhotoService.getAll(lensId);
      setPhotos(response.data);
      setError(null);
    } catch (err) {
      setError('加载样片数据失败');
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
        apertureUsed: formData.apertureUsed ? parseFloat(formData.apertureUsed) : null,
        shutterSpeed: formData.shutterSpeed ? parseFloat(formData.shutterSpeed) : null,
        isoUsed: formData.isoUsed ? parseInt(formData.isoUsed) : null
      };
      
      if (selectedPhoto) {
        await samplePhotoService.update(selectedPhoto.id, data);
      } else {
        await samplePhotoService.create(data);
      }
      
      loadPhotos(filterLensId || null);
      closeModal();
    } catch (err) {
      setError('保存失败');
      console.error(err);
    }
  };

  const handleEdit = (photo) => {
    setSelectedPhoto(photo);
    setFormData({
      lensId: photo.lensId || '',
      title: photo.title || '',
      description: photo.description || '',
      imageUrl: photo.imageUrl || '',
      apertureUsed: photo.apertureUsed || '',
      shutterSpeed: photo.shutterSpeed || '',
      isoUsed: photo.isoUsed || '',
      cameraModel: photo.cameraModel || '',
      dateTaken: photo.dateTaken || '',
      notes: photo.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这张样片吗？')) {
      try {
        await samplePhotoService.delete(id);
        loadPhotos(filterLensId || null);
      } catch (err) {
        setError('删除失败');
        console.error(err);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPhoto(null);
    setFormData({
      lensId: '',
      title: '',
      description: '',
      imageUrl: '',
      apertureUsed: '',
      shutterSpeed: '',
      isoUsed: '',
      cameraModel: '',
      dateTaken: '',
      notes: ''
    });
  };

  const handleFilterChange = (lensId) => {
    setFilterLensId(lensId);
    loadPhotos(lensId || null);
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>🖼️ 实拍样片库</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          disabled={lenses.length === 0}
        >
          + 上传样片
        </button>
      </div>

      {lenses.length === 0 && (
        <div className="alert alert-warning">
          请先添加镜头，然后才能上传样片。
        </div>
      )}

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-number">{photos.length}</div>
          <div className="stat-label">样片总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {new Set(photos.map(p => p.lensId)).size}
          </div>
          <div className="stat-label">使用镜头数</div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filter-section">
        <div className="form-group">
          <label>按镜头筛选</label>
          <select 
            value={filterLensId}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="">全部镜头</option>
            {lenses.map(lens => (
              <option key={lens.id} value={lens.id}>
                {lens.brand} {lens.model}
              </option>
            ))}
          </select>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="empty-state">
          <p>暂无样片数据</p>
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map(photo => (
            <div key={photo.id} className="photo-card">
              <img 
                src={photo.imageUrl} 
                alt={photo.title}
                onError={(e) => {
                  e.target.src = 'https://picsum.photos/seed/' + photo.id + '/400/300';
                }}
              />
              <div className="photo-info">
                <h4>{photo.title}</h4>
                <p><strong>镜头:</strong> {photo.lensName || '未知'}</p>
                {photo.apertureUsed && <p><strong>光圈:</strong> f/{photo.apertureUsed}</p>}
                {photo.shutterSpeed && <p><strong>快门:</strong> {photo.shutterSpeed}s</p>}
                {photo.isoUsed && <p><strong>ISO:</strong> {photo.isoUsed}</p>}
                {photo.cameraModel && <p><strong>相机:</strong> {photo.cameraModel}</p>}
                {photo.dateTaken && <p><strong>拍摄日期:</strong> {photo.dateTaken}</p>}
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleEdit(photo)}
                  >
                    编辑
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDelete(photo.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h3>{selectedPhoto ? '编辑样片' : '上传样片'}</h3>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>选择镜头 *</label>
                  <select 
                    required
                    value={formData.lensId}
                    onChange={(e) => setFormData({...formData, lensId: e.target.value})}
                  >
                    <option value="">请选择镜头</option>
                    {lenses.map(lens => (
                      <option key={lens.id} value={lens.id}>
                        {lens.brand} {lens.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>标题 *</label>
                  <input 
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>图片URL *</label>
                  <input 
                    type="url"
                    required
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
                <div className="form-group">
                  <label>描述</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>使用光圈 (f/)</label>
                  <input 
                    type="number"
                    step="0.1"
                    value={formData.apertureUsed}
                    onChange={(e) => setFormData({...formData, apertureUsed: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>快门速度 (秒)</label>
                  <input 
                    type="number"
                    step="0.001"
                    value={formData.shutterSpeed}
                    onChange={(e) => setFormData({...formData, shutterSpeed: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>ISO</label>
                  <input 
                    type="number"
                    value={formData.isoUsed}
                    onChange={(e) => setFormData({...formData, isoUsed: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>相机型号</label>
                  <input 
                    type="text"
                    value={formData.cameraModel}
                    onChange={(e) => setFormData({...formData, cameraModel: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>拍摄日期</label>
                  <input 
                    type="date"
                    value={formData.dateTaken}
                    onChange={(e) => setFormData({...formData, dateTaken: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>备注</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
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
    </div>
  );
}

export default SamplePhotoGallery;
