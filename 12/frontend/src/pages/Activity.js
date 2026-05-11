import { useEffect, useState } from 'react';
import { dashboardAPI } from '../services/api';

const Activity = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getActivity()
      .then(data => setActivities(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center mt-5"><div className="spinner-border"></div></div>;

  const getActionIcon = (action) => {
    switch (action) {
      case 'create': return '➕';
      case 'update': return '✏️';
      case 'delete': return '🗑️';
      case 'comment': return '💬';
      case 'upload': return '📎';
      case 'update_status': return '🔄';
      case 'add_member': return '👤';
      case 'remove_member': return '👋';
      default: return '📝';
    }
  };

  return (
    <div className="container">
      <h2 className="mb-4">Activity Log</h2>
      
      {activities.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <h5>No activity yet</h5>
        </div>
      ) : (
        <div className="list-group">
          {activities.map(activity => (
            <div key={activity.id} className="list-group-item list-group-item-action">
              <div className="d-flex w-100 justify-content-between">
                <div className="d-flex align-items-center">
                  <span className="me-3 fs-4">{getActionIcon(activity.action)}</span>
                  <div>
                    <h6 className="mb-1">
                      <strong>{activity.user_name}</strong> {activity.details}
                    </h6>
                    <small className="text-muted">
                      {activity.target_type} | {activity.action}
                    </small>
                  </div>
                </div>
                <small className="text-muted">{activity.created_at}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Activity;
