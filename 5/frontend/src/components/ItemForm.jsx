import React, { useState, useEffect } from 'react';
import { itemsApi } from '../services/api';
import './ItemForm.css';

function ItemForm({ item, rooms, categories, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    purchase_date: '',
    warranty_months: 12,
    image_url: '',
    notes: '',
    room_id: rooms.length > 0 ? rooms[0].id : '',
    category_id: categories.length > 0 ? categories[0].id : '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        purchase_date: item.purchase_date,
        warranty_months: item.warranty_months,
        image_url: item.image_url || '',
        notes: item.notes || '',
        room_id: item.room_id,
        category_id: item.category_id,
      });
    }
  }, [item]);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = '请输入物品名称';
    }
    if (!formData.purchase_date) {
      newErrors.purchase_date = '请选择购买日期';
    }
    if (!formData.warranty_months || formData.warranty_months < 0) {
      newErrors.warranty_months = '请输入有效的保修期限';
    }
    if (!formData.room_id) {
      newErrors.room_id = '请选择房间';
    }
    if (!formData.category_id) {
      newErrors.category_id = '请选择分类';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'warranty_months' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      if (item) {
        await itemsApi.update(item.id, formData);
      } else {
        await itemsApi.create(formData);
      }
      onSave();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-container">
      <div className="card">
        <h2 className="form-title">
          {item ? '✏️ 编辑物品' : '➕ 添加新物品'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">物品名称 *</label>
              <input
                type="text"
                name="name"
                className={`form-input ${errors.name ? 'error' : ''}`}
                value={formData.name}
                onChange={handleChange}
                placeholder="例如：iPhone 15"
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">购买日期 *</label>
              <input
                type="date"
                name="purchase_date"
                className={`form-input ${errors.purchase_date ? 'error' : ''}`}
                value={formData.purchase_date}
                onChange={handleChange}
              />
              {errors.purchase_date && <span className="error-text">{errors.purchase_date}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">保修期限（月） *</label>
              <input
                type="number"
                name="warranty_months"
                min="0"
                className={`form-input ${errors.warranty_months ? 'error' : ''}`}
                value={formData.warranty_months}
                onChange={handleChange}
                placeholder="例如：12"
              />
              {errors.warranty_months && <span className="error-text">{errors.warranty_months}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">房间 *</label>
              <select
                name="room_id"
                className={`form-select ${errors.room_id ? 'error' : ''}`}
                value={formData.room_id}
                onChange={handleChange}
              >
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
              {errors.room_id && <span className="error-text">{errors.room_id}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">分类 *</label>
            <select
              name="category_id"
              className={`form-select ${errors.category_id ? 'error' : ''}`}
              value={formData.category_id}
              onChange={handleChange}
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            {errors.category_id && <span className="error-text">{errors.category_id}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">图片链接</label>
            <input
              type="url"
              name="image_url"
              className="form-input"
              value={formData.image_url}
              onChange={handleChange}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div className="form-group">
            <label className="form-label">备注</label>
            <textarea
              name="notes"
              className="form-textarea"
              value={formData.notes}
              onChange={handleChange}
              placeholder="添加备注信息..."
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? '保存中...' : item ? '更新物品' : '添加物品'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ItemForm;
