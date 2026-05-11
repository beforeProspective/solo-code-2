import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { searchAPI } from '../services/api';

const Navbar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    try {
      const results = await searchAPI.search(searchQuery);
      setSearchResults(results);
      setShowResults(true);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4 shadow-sm">
      <div className="container">
        <Link className="navbar-brand" to="/">Project Manager</Link>
        
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link className="nav-link" to="/">Dashboard</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" to="/projects">Projects</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" to="/activity">Activity</Link>
            </li>
          </ul>
          
          <form className="d-flex me-3 position-relative" onSubmit={handleSearch}>
            <input
              type="text"
              className="form-control"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '250px' }}
            />
            <button className="btn btn-light ms-2" type="submit">Search</button>
            
            {showResults && searchResults && (
              <div className="position-absolute bg-white text-dark rounded shadow p-3 mt-5" style={{ zIndex: 1000, width: '400px', maxHeight: '400px', overflowY: 'auto' }}>
                <button type="button" className="btn-close position-absolute top-2 end-2" onClick={() => setShowResults(false)}></button>
                
                {searchResults.projects?.length > 0 && (
                  <div className="mb-3">
                    <h6 className="fw-bold text-primary">Projects</h6>
                    {searchResults.projects.map(p => (
                      <div key={p.id} className="py-1 border-bottom">
                        <Link to={`/projects/${p.id}`} className="text-decoration-none text-dark" onClick={() => setShowResults(false)}>
                          {p.name}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                
                {searchResults.tasks?.length > 0 && (
                  <div className="mb-3">
                    <h6 className="fw-bold text-success">Tasks</h6>
                    {searchResults.tasks.map(t => (
                      <div key={t.id} className="py-1 border-bottom">
                        <Link to={`/projects/${t.project_id}`} className="text-decoration-none text-dark" onClick={() => setShowResults(false)}>
                          {t.title} <span className="text-muted small">- {t.project_name}</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                
                {searchResults.milestones?.length > 0 && (
                  <div>
                    <h6 className="fw-bold text-warning">Milestones</h6>
                    {searchResults.milestones.map(m => (
                      <div key={m.id} className="py-1">
                        <Link to={`/projects/${m.project_id}`} className="text-decoration-none text-dark" onClick={() => setShowResults(false)}>
                          {m.name} <span className="text-muted small">- {m.project_name}</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                
                {(!searchResults.projects?.length && !searchResults.tasks?.length && !searchResults.milestones?.length) && (
                  <p className="text-muted">No results found</p>
                )}
              </div>
            )}
          </form>
          
          <ul className="navbar-nav">
            <li className="nav-item dropdown">
              <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                {user?.name} <span className="badge bg-light text-dark ms-1">{user?.role}</span>
              </a>
              <ul className="dropdown-menu dropdown-menu-end">
                <li><span className="dropdown-item-text text-muted">{user?.email}</span></li>
                <li><hr className="dropdown-divider" /></li>
                <li><button className="dropdown-item" onClick={handleLogout}>Logout</button></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
