import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ItemList from './components/ItemList';
import ItemForm from './components/ItemForm';
import ReminderList from './components/ReminderList';
import RoomCategoryManager from './components/RoomCategoryManager';
import { itemsApi, roomsApi, categoriesApi, remindersApi } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('items');
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [filterRoomId, setFilterRoomId] = useState(null);
  const [filterCategoryId, setFilterCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [itemsRes, roomsRes, categoriesRes, remindersRes] = await Promise.all([
        itemsApi.getAll(),
        roomsApi.getAll(),
        categoriesApi.getAll(),
        remindersApi.getUpcoming(),
      ]);
      setItems(itemsRes.data);
      setRooms(roomsRes.data);
      setCategories(categoriesRes.data);
      setReminders(remindersRes.data);
    } catch (error) {
      console.error('加载数据失败:', error);
      alert('加载数据失败，请确保后端服务已启动');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemForm(true);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setShowItemForm(true);
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('确定要删除这个物品吗？')) return;
    try {
      await itemsApi.delete(id);
      loadAllData();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  const handleItemSaved = async () => {
    setShowItemForm(false);
    setEditingItem(null);
    loadAllData();
  };

  const handleRoomCategoryUpdated = async () => {
    loadAllData();
  };

  const handleFilterByRoom = (roomId) => {
    setFilterRoomId(roomId);
    setFilterCategoryId(null);
    setActiveTab('items');
  };

  const handleFilterByCategory = (categoryId) => {
    setFilterCategoryId(categoryId);
    setFilterRoomId(null);
    setActiveTab('items');
  };

  const getFilteredItems = () => {
    let filtered = [...items];
    if (filterRoomId) {
      filtered = filtered.filter(item => item.room_id === filterRoomId);
    }
    if (filterCategoryId) {
      filtered = filtered.filter(item => item.category_id === filterCategoryId);
    }
    return filtered;
  };

  const clearFilters = () => {
    setFilterRoomId(null);
    setFilterCategoryId(null);
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading">正在加载数据...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        reminderCount={reminders.length}
      />
      <div className="main-content">
        <Sidebar 
          rooms={rooms}
          categories={categories}
          onFilterByRoom={handleFilterByRoom}
          onFilterByCategory={handleFilterByCategory}
          onAddItem={handleAddItem}
          selectedRoomId={filterRoomId}
          selectedCategoryId={filterCategoryId}
        />
        <div className="content-area">
          {showItemForm ? (
            <ItemForm 
              item={editingItem}
              rooms={rooms}
              categories={categories}
              onSave={handleItemSaved}
              onCancel={() => {
                setShowItemForm(false);
                setEditingItem(null);
              }}
            />
          ) : activeTab === 'items' ? (
            <ItemList 
              items={getFilteredItems()}
              onEdit={handleEditItem}
              onDelete={handleDeleteItem}
              filterRoomId={filterRoomId}
              filterCategoryId={filterCategoryId}
              onClearFilters={clearFilters}
            />
          ) : activeTab === 'reminders' ? (
            <ReminderList reminders={reminders} />
          ) : activeTab === 'management' ? (
            <RoomCategoryManager 
              rooms={rooms}
              categories={categories}
              onUpdated={handleRoomCategoryUpdated}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default App;
