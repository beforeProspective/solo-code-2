import { useState, useEffect } from 'react';
import { api } from '../services/api';
import PlanetCard from './PlanetCard';
import './PlanetsSection.css';

export default function PlanetsSection() {
  const [planets, setPlanets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlanets = async () => {
      try {
        const data = await api.getPlanets();
        setPlanets(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPlanets();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>正在加载行星数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
      <p>加载失败: {error}</p>
      </div>
    );
  }

  return (
    <section className="planets-section">
      <h2 className="section-title">🌍 太阳系行星探索</h2>
      <p className="section-subtitle">点击卡片了解更多</p>
      <div className="planets-grid">
        {planets.map(planet => (
          <PlanetCard
            key={planet.id}
            planet={planet}
            isSelected={selectedId === planet.id}
            onClick={() => setSelectedId(selectedId === planet.id ? null : planet.id)}
          />
        ))}
      </div>
    </section>
  );
}
