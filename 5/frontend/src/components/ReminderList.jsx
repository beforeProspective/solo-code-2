import React from 'react';
import './ReminderList.css';

function ReminderList({ reminders }) {
  const expiring = reminders.filter(r => r.status === 'expiring_soon');
  const expired = reminders.filter(r => r.status === 'expired');

  if (reminders.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon success-icon">✅</div>
        <h3>暂无保修提醒</h3>
        <p>您的所有物品保修期都还很长，请继续保持！</p>
      </div>
    );
  }

  return (
    <div className="reminders-container">
      {expired.length > 0 && (
        <div className="reminder-section">
          <h2 className="section-title expired-title">
            ⚠️ 已过期 ({expired.length})
          </h2>
          <div className="reminder-list">
            {expired.map(reminder => (
              <div key={reminder.id} className="reminder-card expired">
                <div className="reminder-status-badge expired-badge">
                  已过期
                </div>
                <div className="reminder-info">
                  <h3 className="reminder-name">{reminder.name}</h3>
                  <div className="reminder-meta">
                    <span>🏠 {reminder.room_name}</span>
                    <span>📁 {reminder.category_name}</span>
                  </div>
                  <div className="reminder-dates">
                    <div className="date-info">
                      <span className="date-label">购买日期</span>
                      <span>{reminder.purchase_date}</span>
                    </div>
                    <div className="date-info">
                      <span className="date-label">到期日期</span>
                      <span className="expired-date">{reminder.warranty_end_date}</span>
                    </div>
                  </div>
                  <div className="days-left expired-days">
                    已过期 {Math.abs(reminder.days_left)} 天
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expiring.length > 0 && (
        <div className="reminder-section">
          <h2 className="section-title warning-title">
            ⏰ 即将到期 ({expiring.length})
          </h2>
          <div className="reminder-list">
            {expiring.map(reminder => (
              <div key={reminder.id} className="reminder-card warning">
                <div className="reminder-status-badge warning-badge">
                  即将到期
                </div>
                <div className="reminder-info">
                  <h3 className="reminder-name">{reminder.name}</h3>
                  <div className="reminder-meta">
                    <span>🏠 {reminder.room_name}</span>
                    <span>📁 {reminder.category_name}</span>
                  </div>
                  <div className="reminder-dates">
                    <div className="date-info">
                      <span className="date-label">购买日期</span>
                      <span>{reminder.purchase_date}</span>
                    </div>
                    <div className="date-info">
                      <span className="date-label">到期日期</span>
                      <span className="warning-date">{reminder.warranty_end_date}</span>
                    </div>
                  </div>
                  <div className="days-left warning-days">
                    还剩 {reminder.days_left} 天
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReminderList;
