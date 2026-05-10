import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Devices from './components/Devices';
import Cabinets from './components/Cabinets';
import Wiring from './components/Wiring';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', name: '概览', icon: '📊' },
    { id: 'cabinets', name: '机柜管理', icon: '🗄️' },
    { id: 'devices', name: '设备管理', icon: '🖥️' },
    { id: 'wiring', name: '布线规划', icon: '🔌' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'cabinets':
        return <Cabinets />;
      case 'devices':
        return <Devices />;
      case 'wiring':
        return <Wiring />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🖥️ 数据中心资产管理系统</h1>
      </header>
      
      <nav className="app-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.name}
          </button>
        ))}
      </nav>
      
      <main className="app-main">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
