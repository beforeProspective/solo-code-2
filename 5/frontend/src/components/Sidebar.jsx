import React from 'react';
import './Sidebar.css';

function Sidebar({ 
  rooms, 
  categories, 
  onFilterByRoom, 
  onFilterByCategory, 
  onAddItem,
  selectedRoomId,
  selectedCategoryId
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <button className="btn btn-primary add-item-btn" onClick={onAddItem}>
          ➕ 添加物品
        </button>
      </div>
      
      <div className="sidebar-section">
        <h3 className="sidebar-title">🏠 按房间</h3>
        <ul className="sidebar-list">
          <li 
            className={`sidebar-item ${!selectedRoomId ? 'active' : ''}`}
            onClick={() => onFilterByRoom(null)}
          >
            全部房间
          </li>
          {rooms.map(room => (
            <li 
              key={room.id}
              className={`sidebar-item ${selectedRoomId === room.id ? 'active' : ''}`}
              onClick={() => onFilterByRoom(room.id)}
            >
              {room.name}
            </li>
          ))}
        </ul>
      </div>
      
      <div className="sidebar-section">
        <h3 className="sidebar-title">📁 按分类</h3>
        <ul className="sidebar-list">
          <li 
            className={`sidebar-item ${!selectedCategoryId ? 'active' : ''}`}
            onClick={() => onFilterByCategory(null)}
          >
            全部分类
          </li>
          {categories.map(category => (
            <li 
              key={category.id}
              className={`sidebar-item ${selectedCategoryId === category.id ? 'active' : ''}`}
              onClick={() => onFilterByCategory(category.id)}
            >
              {category.name}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default Sidebar;
