import { useState, useEffect } from 'react';
import PlanetsSection from './components/PlanetsSection';
import RocketGame from './components/RocketGame';
import AstronomyCalendar from './components/AstronomyCalendar';

const TABS = [
  { id: 'planets', label: '🌍 行星探索', component: PlanetsSection },
  { id: 'rocket', label: '🚀 火箭发射', component: RocketGame },
  { id: 'calendar', label: '📅 天文日历', component: AstronomyCalendar },
];

function StarBackground() {
  const [stars, setStars] = useState([]);

  useEffect(() => {
    const newStars = [];
    for (let i = 0; i < 100; i++) {
      newStars.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 2 + 1,
        delay: Math.random() * 3,
        duration: Math.random() * 2 + 2,
      });
    }
    setStars(newStars);
  }, []);

  return (
    <div className="stars">
      {stars.map(star => (
        <div
          key={star.id}
          className="star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('planets');
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || PlanetsSection;

  return (
    <div className="app-container">
      <StarBackground />
      
      <header>
        <h1>🚀 太空探索科普站</h1>
        <p>探索宇宙奥秘，了解我们的太阳系</p>
      </header>

      <nav>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main>
        <ActiveComponent />
      </main>

      <footer style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: 'var(--text-secondary)',
        fontSize: '0.9rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        marginTop: '2rem'
      }}>
        <p>✨ 太空探索科普站 - 让每个人都能仰望星空 ✨</p>
      </footer>
    </div>
  );
}

export default App;
