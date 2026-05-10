import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import LensList from './components/LensList';
import AdapterList from './components/AdapterList';
import SamplePhotoGallery from './components/SamplePhotoGallery';
import MaintenanceList from './components/MaintenanceList';

function App() {
  const [activeTab, setActiveTab] = useState('lenses');

  return (
    <div className="app">
      <header className="app-header">
        <h1>📷 复古相机老镜头数据库</h1>
        <p className="subtitle">Vintage Camera Lens Collection Database</p>
      </header>
      
      <nav className="main-nav">
        <ul>
          <li>
            <Link 
              to="/lenses" 
              className={activeTab === 'lenses' ? 'active' : ''}
              onClick={() => setActiveTab('lenses')}
            >
              📸 镜头收藏名录
            </Link>
          </li>
          <li>
            <Link 
              to="/adapters" 
              className={activeTab === 'adapters' ? 'active' : ''}
              onClick={() => setActiveTab('adapters')}
            >
              🔌 转接环库存
            </Link>
          </li>
          <li>
            <Link 
              to="/sample-photos" 
              className={activeTab === 'photos' ? 'active' : ''}
              onClick={() => setActiveTab('photos')}
            >
              🖼️ 实拍样片库
            </Link>
          </li>
          <li>
            <Link 
              to="/maintenance" 
              className={activeTab === 'maintenance' ? 'active' : ''}
              onClick={() => setActiveTab('maintenance')}
            >
              🔧 保养提醒
            </Link>
          </li>
        </ul>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<LensList />} />
          <Route path="/lenses" element={<LensList />} />
          <Route path="/adapters" element={<AdapterList />} />
          <Route path="/sample-photos" element={<SamplePhotoGallery />} />
          <Route path="/maintenance" element={<MaintenanceList />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <p>复古相机老镜头数据库管理系统 © 2024</p>
      </footer>
    </div>
  );
}

export default App;
