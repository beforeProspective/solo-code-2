import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import './AstronomyCalendar.css';

const CATEGORY_COLORS = {
  '流星雨': '#ff6b6b',
  '月相': '#feca57',
  '行星观测': '#48dbfb',
  '交食': '#ff9ff3',
};

const CATEGORY_ICONS = {
  '流星雨': '☄️',
  '月相': '🌙',
  '行星观测': '🪐',
  '交食': '🌑',
};

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function AstronomyCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [filterCategory, setFilterCategory] = useState(null);
  const [error, setError] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [eventsData, upcomingData] = await Promise.all([
          api.getEvents(year, month),
          api.getUpcomingEvents(5),
        ]);
        setEvents(eventsData);
        setUpcomingEvents(upcomingData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [year, month]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days = [];
    
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.event_date === dateStr);
      days.push({ day, events: dayEvents });
    }
    
    return days;
  }, [year, month, events]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const filteredEvents = useMemo(() => {
    if (!selectedDay) return [];
    if (!filterCategory) return selectedDay.events;
    return selectedDay.events.filter(e => e.category === filterCategory);
  }, [selectedDay, filterCategory]);

  const getDaysUntil = (eventDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const event = new Date(eventDate);
    event.setHours(0, 0, 0, 0);
    const diff = Math.ceil((event - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const categories = useMemo(() => {
    const cats = [...new Set(events.map(e => e.category))];
    return cats;
  }, [events]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>正在加载天文日历...</p>
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
    <section className="calendar-section">
      <h2 className="section-title">📅 天文现象日历</h2>
      
      <div className="calendar-layout">
        <div className="main-calendar">
          <div className="calendar-header">
            <button className="nav-btn" onClick={goToPreviousMonth}>
              ◀
            </button>
            <div className="month-display">
              <h3>{year}年 {MONTH_NAMES[month - 1]}</h3>
            </div>
            <button className="nav-btn" onClick={goToNextMonth}>
              ▶
            </button>
          </div>
          
          <button className="today-btn" onClick={goToToday}>
            今天
          </button>

          <div className="weekday-header">
            {WEEK_DAYS.map(day => (
              <div key={day} className="weekday">
                {day}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((dayData, index) => {
              if (!dayData) {
                return <div key={`empty-${index}`} className="calendar-day empty" />;
              }
              
              const today = new Date();
              const isToday = dayData.day === today.getDate() && 
                            month === today.getMonth() + 1 && 
                            year === today.getFullYear();
              
              const hasEvents = dayData.events.length > 0;
              const isSelected = selectedDay && 
                               selectedDay.day === dayData.day;

              return (
                <div
                  key={dayData.day}
                  className={`calendar-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => hasEvents ? setSelectedDay(dayData) : null}
                >
                  <span className="day-number">{dayData.day}</span>
                  {hasEvents && (
                    <div className="event-dots">
                      {dayData.events.slice(0, 3).map((event, i) => (
                        <span
                          key={i}
                          className="event-dot"
                          style={{ backgroundColor: CATEGORY_COLORS[event.category] || '#888' }}
                        />
                      ))}
                      {dayData.events.length > 3 && (
                        <span className="more-events">+{dayData.events.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {categories.length > 0 && (
            <div className="category-filter">
              <span className="filter-label">筛选:</span>
              <button
                className={`filter-btn ${!filterCategory ? 'active' : ''}`}
                onClick={() => setFilterCategory(null)}
              >
                全部
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`filter-btn ${filterCategory === cat ? 'active' : ''}`}
                  style={{ borderColor: CATEGORY_COLORS[cat] }}
                  onClick={() => setFilterCategory(cat)}
                >
                  {CATEGORY_ICONS[cat] || '✨'} {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar">
          <div className="upcoming-events">
            <h3>⏰ 即将到来</h3>
            {upcomingEvents.length === 0 ? (
              <p className="no-events">暂无即将到来的天文事件</p>
            ) : (
              <div className="upcoming-list">
                {upcomingEvents.map(event => {
                  const daysUntil = getDaysUntil(event.event_date);
                  return (
                    <div 
                      key={event.id} 
                      className="upcoming-item"
                      style={{ borderLeftColor: CATEGORY_COLORS[event.category] }}
                    >
                      <div className="upcoming-icon">
                        {CATEGORY_ICONS[event.category] || '✨'}
                      </div>
                      <div className="upcoming-content">
                        <div className="upcoming-title">{event.title_cn}</div>
                        <div className="upcoming-date">
                          {new Date(event.event_date).toLocaleDateString('zh-CN', {
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="upcoming-days">
                          {daysUntil === 0 ? '今天!' : 
                           daysUntil < 0 ? `已过去 ${-daysUntil} 天` : 
                           `${daysUntil} 天后`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDay && (
            <div className="day-events">
              <h3>📆 {selectedDay.day} 日</h3>
              {filteredEvents.length === 0 ? (
                <p className="no-events">该日期没有选中类型的事件</p>
              ) : (
                <div className="day-events-list">
                  {filteredEvents.map(event => (
                    <div
                      key={event.id}
                      className={`day-event-item ${selectedEvent?.id === event.id ? 'active' : ''}`}
                      style={{ borderLeftColor: CATEGORY_COLORS[event.category] }}
                      onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                    >
                      <div className="event-header">
                        <span className="event-category" style={{ color: CATEGORY_COLORS[event.category] }}>
                          {CATEGORY_ICONS[event.category] || '✨'} {event.category}
                        </span>
                      </div>
                      <h4>{event.title_cn}</h4>
                      {selectedEvent?.id === event.id && (
                        <div className="event-details">
                          <p className="event-title-en">{event.title}</p>
                          <p className="event-desc">{event.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
