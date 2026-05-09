import React from 'react';
import './Header.css';

function Header({ activeTab, onTabChange, reminderCount }) {
  const tabs = [
    { id: 'items', label: '物品列表', icon: '📦' },
    { id: 'reminders', label: '保修提醒', icon: '🔔', badge: reminderCount },
    { id: 'management', label: '管理设置', icon: '⚙️' },
  ];

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <span className="logo-icon">🏠</span>
          <h1>家庭物品追踪器</h1>
        </div>
        <nav className="nav-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
              {tab.badge > 0 && (
                <span className="badge">{tab.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Header;
