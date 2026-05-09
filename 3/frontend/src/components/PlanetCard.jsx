import { useState, useEffect } from 'react';
import { api } from '../services/api';
import './PlanetCard.css';

export default function PlanetCard({ planet, isSelected, onClick }) {
  const planetColors = {
    Mercury: 'from-orange-400',
    Venus: 'from-yellow-500',
    Earth: 'from-blue-400',
    Mars: 'from-red-500',
    Jupiter: 'from-amber-400',
    Saturn: 'from-yellow-300',
    Uranus: 'from-cyan-400',
    Neptune: 'from-blue-500',
  };

  const colorClass = planetColors[planet.name] || 'from-gray-400';

  return (
    <div 
      className={`planet-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="planet-visual">
      <div className={`planet-glow ${colorClass.replace('from-', '')}`}></div>
      <div className={`planet-sphere ${colorClass.replace('from-', '')}`}></div>
      </div>
      <div className="planet-info">
        <h3>{planet.name_cn}</h3>
        <h4>{planet.name}</h4>
        <p className="description">{planet.description}</p>
        <div className="planet-stats">
          <div className="stat">
            <span className="stat-label">直径</span>
            <span className="stat-value">{planet.diameter.toLocaleString()} km</span>
          </div>
          <div className="stat">
            <span className="stat-label">距太阳</span>
            <span className="stat-value">{planet.distance_from_sun} 百万 km</span>
          </div>
          <div className="stat">
            <span className="stat-label">公转周期</span>
            <span className="stat-value">{planet.orbital_period} 天</span>
          </div>
          <div className="stat">
            <span className="stat-label">卫星数</span>
            <span className="stat-value">{planet.number_of_moons} 颗</span>
          </div>
        </div>
      </div>
    </div>
  );
}
