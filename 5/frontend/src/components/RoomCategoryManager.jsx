import React, { useState } from 'react';
import { roomsApi, categoriesApi } from '../services/api';
import './RoomCategoryManager.css';

function RoomCategoryManager({ rooms, categories, onUpdated }) {
  const [activeTab, setActiveTab] = useState('rooms');
  const [newRoomName, setNewRoomName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    setLoading(true);
    try {
      await roomsApi.create({ name: newRoomName.trim() });
      setNewRoomName('');
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoom = async (room) => {
    if (!editingRoom.trim()) return;
    setLoading(true);
    try {
      await roomsApi.update(room.id, { name: editingRoom.trim() });
      setEditingRoom(null);
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (room) => {
    if (!window.confirm(`确定要删除房间"${room.name}"吗？`)) return;
    setLoading(true);
    try {
      await roomsApi.delete(room.id);
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setLoading(true);
    try {
      await categoriesApi.create({ name: newCategoryName.trim() });
      setNewCategoryName('');
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCategory = async (category) => {
    if (!editingCategory.trim()) return;
    setLoading(true);
    try {
      await categoriesApi.update(category.id, { name: editingCategory.trim() });
      setEditingCategory(null);
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`确定要删除分类"${category.name}"吗？`)) return;
    setLoading(true);
    try {
      await categoriesApi.delete(category.id);
      onUpdated();
    } catch (error) {
      alert(error.response?.data?.error || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="manager-container">
      <div className="manager-tabs">
        <button
          className={`manager-tab ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          🏠 房间管理
        </button>
        <button
          className={`manager-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          📁 分类管理
        </button>
      </div>

      {activeTab === 'rooms' ? (
        <div className="manager-content">
          <div className="add-section">
            <h3>添加新房间</h3>
            <div className="add-form">
              <input
                type="text"
                className="form-input"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="输入房间名称..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddRoom()}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleAddRoom}
                disabled={loading}
              >
                添加
              </button>
            </div>
          </div>

          <div className="list-section">
            <h3>现有房间 ({rooms.length})</h3>
            <div className="item-list">
              {rooms.map(room => (
                <div key={room.id} className="list-item">
                  {editingRoom === room.id ? (
                    <div className="edit-form">
                      <input
                        type="text"
                        className="form-input"
                        defaultValue={room.name}
                        autoFocus
                        onKeyPress={(e) => e.key === 'Enter' && handleUpdateRoom(room)}
                        onBlur={() => setEditingRoom(null)}
                        ref={(input) => {
                          if (input && editingRoom === room.id) {
                            input.focus();
                            input.select();
                          }
                        }}
                        onChange={(e) => {
                          const target = e.target;
                          handleUpdateRoom(room).then(() => {
                            if (editingRoom === room.id) {
                              setEditingRoom(target.value);
                            }
                          }).catch(() => {});
                          setEditingRoom(target.value);
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <span className="item-name">🏠 {room.name}</span>
                      <div className="item-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => setEditingRoom(room.id)}
                        >
                          编辑
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleDeleteRoom(room)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="manager-content">
          <div className="add-section">
            <h3>添加新分类</h3>
            <div className="add-form">
              <input
                type="text"
                className="form-input"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="输入分类名称..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleAddCategory}
                disabled={loading}
              >
                添加
              </button>
            </div>
          </div>

          <div className="list-section">
            <h3>现有分类 ({categories.length})</h3>
            <div className="item-list">
              {categories.map(category => (
                <div key={category.id} className="list-item">
                  {editingCategory === category.id ? (
                    <div className="edit-form">
                      <input
                        type="text"
                        className="form-input"
                        defaultValue={category.name}
                        autoFocus
                        onKeyPress={(e) => e.key === 'Enter' && handleUpdateCategory(category)}
                        onBlur={() => setEditingCategory(null)}
                        onChange={(e) => setEditingCategory(e.target.value)}
                      />
                    </div>
                  ) : (
                    <>
                      <span className="item-name">📁 {category.name}</span>
                      <div className="item-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => setEditingCategory(category.id)}
                        >
                          编辑
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleDeleteCategory(category)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoomCategoryManager;
