import { useState, useEffect, useCallback, useRef } from 'react';
import './RocketGame.css';

const GAME_STATE = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  LAUNCHING: 'launching',
  SUCCESS: 'success',
  FAILED: 'failed',
};

const MISSIONS = [
  { name: '月球轨道任务', difficulty: 'easy', seconds: 15, description: '执行绕月飞行任务' },
  { name: '火星探测任务', difficulty: 'medium', seconds: 10, description: '向火星发送探测器' },
  { name: '深空探索任务', difficulty: 'hard', seconds: 5, description: '探索太阳系外空间' },
];

export default function RocketGame() {
  const [gameState, setGameState] = useState(GAME_STATE.IDLE);
  const [countdown, setCountdown] = useState(0);
  const [selectedMission, setSelectedMission] = useState(null);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState('');
  const [rocketPosition, setRocketPosition] = useState(0);
  const [stars, setStars] = useState([]);
  const countdownRef = useRef(null);
  const launchIntervalRef = useRef(null);

  useEffect(() => {
    const newStars = [];
    for (let i = 0; i < 50; i++) {
      newStars.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 3 + 1,
        delay: Math.random() * 2,
      });
    }
    setStars(newStars);
  }, []);

  const startLaunch = useCallback((mission) => {
    setSelectedMission(mission);
    setCountdown(mission.seconds);
    setGameState(GAME_STATE.COUNTDOWN);
    setMessage('准备发射...');
    setRocketPosition(0);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setGameState(GAME_STATE.LAUNCHING);
          setMessage('🚀 发射！');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (gameState === GAME_STATE.LAUNCHING) {
      launchIntervalRef.current = setInterval(() => {
        setRocketPosition(prev => {
          if (prev >= 100) {
            clearInterval(launchIntervalRef.current);
            const bonus = selectedMission.difficulty === 'easy' ? 100 : 
                         selectedMission.difficulty === 'medium' ? 200 : 300;
            setScore(s => s + bonus);
            setGameState(GAME_STATE.SUCCESS);
            setMessage(`🎉 任务成功！获得 ${bonus} 分`);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
    }

    return () => {
      if (launchIntervalRef.current) {
        clearInterval(launchIntervalRef.current);
      }
    };
  }, [gameState, selectedMission]);

  const abortLaunch = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    if (launchIntervalRef.current) {
      clearInterval(launchIntervalRef.current);
    }
    setGameState(GAME_STATE.FAILED);
    setMessage('❌ 发射中止！');
  };

  const resetGame = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    if (launchIntervalRef.current) {
      clearInterval(launchIntervalRef.current);
    }
    setGameState(GAME_STATE.IDLE);
    setSelectedMission(null);
    setCountdown(0);
    setMessage('');
    setRocketPosition(0);
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return '#4ade80';
      case 'medium': return '#fbbf24';
      case 'hard': return '#f87171';
      default: return '#fff';
    }
  };

  return (
    <section className="rocket-game">
      <h2 className="section-title">🚀 火箭发射模拟器</h2>
      
      <div className="game-header">
        <div className="score-display">
          <span>总分</span>
          <span className="score">{score}</span>
        </div>
        {(gameState === GAME_STATE.SUCCESS || gameState === GAME_STATE.FAILED) && (
          <button className="reset-btn" onClick={resetGame}>
            重新开始
          </button>
        )}
      </div>

      <div className="game-area">
        <div className="space-background">
          {stars.map(star => (
            <div
              key={star.id}
              className="background-star"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="launch-pad-area">
          <div 
            className="rocket-container"
            style={{ transform: `translateY(${-rocketPosition * 3}px)` }}
          >
            <div className={`rocket ${gameState === GAME_STATE.LAUNCHING || gameState === GAME_STATE.COUNTDOWN ? 'launched' : ''}`}>
              <div className="rocket-body">
                <div className="rocket-tip"></div>
                <div className="rocket-mid"></div>
                <div className="rocket-window"></div>
                <div className="rocket-bottom"></div>
                <div className="rocket-fin left-fin"></div>
                <div className="rocket-fin right-fin"></div>
              </div>
              {(gameState === GAME_STATE.LAUNCHING || (gameState === GAME_STATE.COUNTDOWN && countdown <= 3)) && (
                <div className="rocket-flame">
                  <div className="flame-inner"></div>
                  <div className="flame-outer"></div>
                </div>
              )}
            </div>
          </div>
          
          <div className="launch-pad"></div>
        </div>

        <div className="control-panel">
          {gameState === GAME_STATE.IDLE && (
            <div className="mission-select">
              <h3>选择发射任务</h3>
              <div className="mission-list">
                {MISSIONS.map(mission => (
                  <button
                    key={mission.name}
                    className="mission-btn"
                    onClick={() => startLaunch(mission)}
                  >
                    <div className="mission-name">{mission.name}</div>
                    <div className="mission-desc">{mission.description}</div>
                    <div className="mission-meta">
                      <span style={{ color: getDifficultyColor(mission.difficulty) }}>
                        {mission.difficulty === 'easy' ? '简单' : 
                         mission.difficulty === 'medium' ? '中等' : '困难'}
                      </span>
                      <span>{mission.seconds}秒倒计时</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === GAME_STATE.COUNTDOWN && (
            <div className="countdown-display">
              <div className="mission-info">
                <span>任务: {selectedMission?.name}</span>
              </div>
              <div className="countdown-number">{countdown}</div>
              <div className="countdown-text">{message}</div>
              <button className="abort-btn" onClick={abortLaunch}>
                中止发射
              </button>
            </div>
          )}

          {gameState === GAME_STATE.LAUNCHING && (
            <div className="launching-display">
              <div className="mission-info">
                <span>任务: {selectedMission?.name}</span>
              </div>
              <div className="launch-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${rocketPosition}%` }}
                  />
                </div>
                <div className="progress-text">{Math.round(rocketPosition)}%</div>
              </div>
              <div className="launch-text">{message}</div>
            </div>
          )}

          {(gameState === GAME_STATE.SUCCESS || gameState === GAME_STATE.FAILED) && (
            <div className="result-display">
              <div className={`result-icon ${gameState}`}>
                {gameState === GAME_STATE.SUCCESS ? '🌟' : '💥'}
              </div>
              <div className="result-text">{message}</div>
              {selectedMission && (
                <div className="mission-summary">
                  任务: {selectedMission.name}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
