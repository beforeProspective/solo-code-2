import React from 'react';
import './ItemList.css';

function ItemList({ items, onEdit, onDelete, filterRoomId, filterCategoryId, onClearFilters }) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📦</div>
        <h3>暂无物品</h3>
        <p>点击左侧"添加物品"按钮开始登记</p>
        {(filterRoomId || filterCategoryId) && (
          <button className="btn btn-primary" onClick={onClearFilters}>
            清除筛选
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {(filterRoomId || filterCategoryId) && (
        <div className="filter-info">
          <span>当前筛选：</span>
          {filterRoomId && <span className="filter-tag">房间</span>}
          {filterCategoryId && <span className="filter-tag">分类</span>}
          <button className="btn btn-secondary clear-filter-btn" onClick={onClearFilters}>
            清除筛选
          </button>
        </div>
      )}
      
      <div className="items-grid">
        {items.map(item => (
          <div key={item.id} className="item-card">
            <div className="item-image">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} />
              ) : (
                <div className="placeholder-image">📦</div>
              )}
            </div>
            <div className="item-content">
              <h3 className="item-name">{item.name}</h3>
              <div className="item-meta">
                <span className="item-tag room-tag">🏠 {item.room_name}</span>
                <span className="item-tag category-tag">📁 {item.category_name}</span>
              </div>
              <div className="item-dates">
                <div className="date-item">
                  <span className="date-label">购买日期</span>
                  <span className="date-value">{item.purchase_date}</span>
                </div>
                <div className="date-item">
                  <span className="date-label">保修到期</span>
                  <span className="date-value warranty-date">{item.warranty_end_date}</span>
                </div>
              </div>
              {item.notes && (
                <p className="item-notes">{item.notes}</p>
              )}
              <div className="item-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => onEdit(item)}
                >
                  ✏️ 编辑
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => onDelete(item.id)}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ItemList;
