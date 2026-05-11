import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../services/api';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getStats()
      .then(data => setStats(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center mt-5"><div className="spinner-border"></div></div>;

  return (
    <div className="container">
      <h2 className="mb-4">Dashboard</h2>
      
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card text-white bg-primary">
            <div className="card-body">
              <h5 className="card-title">Projects</h5>
              <h2 className="card-text">{stats?.projects || 0}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-white bg-info">
            <div className="card-body">
              <h5 className="card-title">Total Tasks</h5>
              <h2 className="card-text">{stats?.tasks || 0}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-white bg-success">
            <div className="card-body">
              <h5 className="card-title">Completed</h5>
              <h2 className="card-text">{stats?.completed || 0}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-white bg-warning">
            <div className="card-body">
              <h5 className="card-title">Completion Rate</h5>
              <h2 className="card-text">{stats?.completion_rate || 0}%</h2>
            </div>
          </div>
        </div>
      </div>
      
      <div className="row">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Recent Tasks</h5>
            </div>
            <div className="card-body">
              {stats?.recent_tasks?.length === 0 ? (
                <p className="text-muted">No tasks yet</p>
              ) : (
                <div className="list-group list-group-flush">
                  {stats?.recent_tasks?.map(task => (
                    <Link 
                      key={task.id}
                      to={`/projects/${task.project_id}`}
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    >
                      <span>{task.title}</span>
                      <span className={`badge ${
                        task.status === 'completed' ? 'bg-success' :
                        task.status === 'in_progress' ? 'bg-warning' : 'bg-secondary'
                      }`}>
                        {task.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card">
            <div className="card-header bg-danger text-white">
              <h5 className="mb-0">Overdue Tasks</h5>
            </div>
            <div className="card-body">
              {stats?.overdue_tasks?.length === 0 ? (
                <p className="text-muted">No overdue tasks</p>
              ) : (
                <div className="list-group list-group-flush">
                  {stats?.overdue_tasks?.map(task => (
                    <Link 
                      key={task.id}
                      to={`/projects/${task.project_id}`}
                      className="list-group-item list-group-item-action"
                    >
                      <div className="d-flex justify-content-between">
                        <span className="text-danger fw-bold">{task.title}</span>
                        <small className="text-muted">{task.due_date}</small>
                      </div>
                      <small className="text-muted">{task.project_name}</small>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
