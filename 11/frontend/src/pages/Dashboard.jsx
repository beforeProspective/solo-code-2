import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'
import { useApp } from '../contexts/AppContext'
import { sitesAPI, analyticsAPI, shareAPI } from '../api'
import { format, differenceInDays } from 'date-fns'

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b']

const Dashboard = () => {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const { selectedSite, setSelectedSite, timeRange, setTimeRangePreset, logout } = useApp()
  
  const [sites, setSites] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [realtime, setRealtime] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddSite, setShowAddSite] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [showSnippet, setShowSnippet] = useState(false)
  const [snippet, setSnippet] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [shareLink, setShareLink] = useState(null)

  const isSharedView = !!shareToken

  const loadAnalytics = useCallback(async () => {
    if (!selectedSite && !isSharedView) return
    
    setLoading(true)
    try {
      let data
      if (isSharedView) {
        data = await shareAPI.getShared(shareToken, timeRange.startDate, timeRange.endDate)
      } else {
        data = await analyticsAPI.getAnalytics(selectedSite.id, timeRange.startDate, timeRange.endDate)
      }
      setAnalytics(data)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [selectedSite, isSharedView, shareToken, timeRange])

  const loadRealtime = useCallback(async () => {
    if (!selectedSite || isSharedView) return
    
    try {
      const data = await analyticsAPI.getRealtime(selectedSite.id)
      setRealtime(data)
    } catch (err) {
      console.error('Failed to load realtime:', err)
    }
  }, [selectedSite, isSharedView])

  const loadSites = useCallback(async () => {
    if (isSharedView) return
    
    try {
      const sitesData = await sitesAPI.getAll()
      setSites(sitesData)
      
      if (sitesData.length > 0 && !selectedSite) {
        setSelectedSite(sitesData[0])
      }
    } catch (err) {
      if (err.message.includes('Unauthorized')) {
        logout()
        navigate('/login')
      }
    }
  }, [isSharedView, selectedSite, setSelectedSite, logout, navigate])

  useEffect(() => {
    loadSites()
  }, [loadSites])

  useEffect(() => {
    if (selectedSite || isSharedView) {
      loadAnalytics()
    }
  }, [loadAnalytics])

  useEffect(() => {
    if (selectedSite) {
      loadRealtime()
      const interval = setInterval(loadRealtime, 10000)
      return () => clearInterval(interval)
    }
  }, [selectedSite, loadRealtime])

  const handleAddSite = async () => {
    if (!newDomain.trim()) return
    
    try {
      const newSite = await sitesAPI.create(newDomain.trim())
      setSites([...sites, newSite])
      setSelectedSite(newSite)
      setShowAddSite(false)
      setNewDomain('')
    } catch (err) {
      setError(err.message || 'Failed to add site')
    }
  }

  const handleGetSnippet = async () => {
    if (!selectedSite) return
    
    try {
      const data = await sitesAPI.getSnippet(selectedSite.site_id)
      setSnippet(data.snippet)
      setShowSnippet(true)
    } catch (err) {
      setError(err.message || 'Failed to get snippet')
    }
  }

  const handleExportCSV = async () => {
    if (!selectedSite) return
    
    try {
      const response = await analyticsAPI.exportCSV(selectedSite.id, timeRange.startDate, timeRange.endDate)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics_${selectedSite.domain}_${format(new Date(), 'yyyyMMdd')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      setError(err.message || 'Failed to export CSV')
    }
  }

  const handleShare = async () => {
    if (!selectedSite) return
    
    try {
      const data = await shareAPI.createShare(selectedSite.id, null)
      const baseUrl = window.location.origin
      setShareLink(`${baseUrl}/share/${data.token}`)
      setShowShare(true)
    } catch (err) {
      setError(err.message || 'Failed to create share link')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!')
    })
  }

  const getTimeRangeLabel = () => {
    const days = differenceInDays(timeRange.endDate, timeRange.startDate)
    if (days === 0) return '24h'
    if (days === 7) return '7d'
    if (days === 30) return '30d'
    if (days === 90) return '90d'
    return 'Custom'
  }

  if (!isSharedView && sites.length === 0 && !loading) {
    return (
      <div>
        <nav className="navbar">
          <div className="navbar-content">
            <div className="navbar-brand">Analytics</div>
            <div className="navbar-right">
              <button className="btn btn-secondary btn-sm" onClick={logout}>Logout</button>
            </div>
          </div>
        </nav>
        
        <div className="container">
          <div className="empty-state">
            <h2>No sites added yet</h2>
            <p>Add your first website to start tracking analytics</p>
            <button className="btn btn-sm" style={{ marginTop: 20 }} onClick={() => setShowAddSite(true)}>
              Add Website
            </button>
          </div>
        </div>
        
        {showAddSite && (
          <div className="modal-overlay" onClick={() => setShowAddSite(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add Website</h2>
              <div className="form-group">
                <label>Domain</label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              {error && <div className="error">{error}</div>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowAddSite(false)}>Cancel</button>
                <button className="btn" onClick={handleAddSite}>Add Site</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-content">
          <div className="navbar-brand">Analytics</div>
          <div className="navbar-right">
            {!isSharedView && (
              <button className="btn btn-secondary btn-sm" onClick={logout}>Logout</button>
            )}
          </div>
        </div>
      </nav>

      <div className="dashboard-layout">
        {!isSharedView && (
          <aside className="sidebar">
            <h2>Your Websites</h2>
            <ul className="site-list">
              {sites.map((site) => (
                <li
                  key={site.id}
                  className={`site-item ${selectedSite?.id === site.id ? 'active' : ''}`}
                  onClick={() => setSelectedSite(site)}
                >
                  {site.domain}
                </li>
              ))}
            </ul>
            <button className="add-site-btn" onClick={() => setShowAddSite(true)}>
              + Add Website
            </button>
          </aside>
        )}

        <main className="main-content">
          {loading ? (
            <div className="loading">Loading analytics...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : analytics ? (
            <>
              <div className="page-header">
                <h1>{isSharedView ? 'Shared Analytics' : selectedSite?.domain}</h1>
                <div className="time-range-selector">
                  {['24h', '7d', '30d', '90d'].map((preset) => (
                    <button
                      key={preset}
                      className={`time-btn ${getTimeRangeLabel() === preset ? 'active' : ''}`}
                      onClick={() => setTimeRangePreset(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {!isSharedView && (
                <div className="actions-bar">
                  {realtime && (
                    <div className="realtime-badge">
                      <span className="realtime-dot"></span>
                      {realtime.active_visitors} active now
                    </div>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={handleGetSnippet}>
                    Tracking Code
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                    Export CSV
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleShare}>
                    Share
                  </button>
                </div>
              )}

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Page Views</div>
                  <div className="stat-value">{analytics.pageviews.total.toLocaleString()}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Unique Pages</div>
                  <div className="stat-value">{analytics.pageviews.unique_visitors.toLocaleString()}</div>
                </div>
              </div>

              <div className="charts-grid">
                <div className="chart-card full-width">
                  <h3>Page Views Over Time</h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.daily_stats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" stroke="#718096" />
                        <YAxis stroke="#718096" />
                        <Tooltip
                          contentStyle={{
                            background: 'white',
                            border: 'none',
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#667eea"
                          strokeWidth={3}
                          dot={{ fill: '#667eea', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="chart-card">
                  <h3>Traffic Sources</h3>
                  {analytics.referrers.length > 0 ? (
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.referrers}
                            dataKey="count"
                            nameKey="referrer"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ referrer, percent }) => `${referrer} ${(percent * 100).toFixed(0)}%`}
                          >
                            {analytics.referrers.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: 40 }}>
                      No referral data yet
                    </div>
                  )}
                </div>

                <div className="chart-card">
                  <h3>Countries</h3>
                  {analytics.countries.length > 0 ? (
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.countries} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" stroke="#718096" />
                          <YAxis dataKey="country" type="category" width={100} stroke="#718096" />
                          <Tooltip />
                          <Bar dataKey="count" fill="#667eea" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: 40 }}>
                      No country data yet
                    </div>
                  )}
                </div>

                <div className="chart-card">
                  <h3>Device Types</h3>
                  {analytics.devices.length > 0 ? (
                    <ul className="top-list">
                      {analytics.devices.map((device, index) => (
                        <li key={device.device_type} className="top-list-item">
                          <span className="top-list-name">{device.device_type}</span>
                          <span className="top-list-count">{device.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="empty-state" style={{ padding: 40 }}>
                      No device data yet
                    </div>
                  )}
                </div>

                <div className="chart-card">
                  <h3>Top Pages</h3>
                  {analytics.paths.length > 0 ? (
                    <ul className="top-list">
                      {analytics.paths.map((path) => (
                        <li key={path.path} className="top-list-item">
                          <span className="top-list-name">{path.path}</span>
                          <span className="top-list-count">{path.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="empty-state" style={{ padding: 40 }}>
                      No page data yet
                    </div>
                  )}
                </div>
              </div>

              {!isSharedView && realtime && realtime.recent_visitors.length > 0 && (
                <div className="chart-card full-width">
                  <h3>Recent Activity (Last 5 minutes)</h3>
                  <div className="realtime-list">
                    {realtime.recent_visitors.map((visitor, index) => (
                      <div key={index} className="realtime-item">
                        <span className="realtime-path">{visitor.path}</span>
                        <span className="realtime-meta">
                          {visitor.device_type} • {visitor.country}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>

      {showAddSite && (
        <div className="modal-overlay" onClick={() => setShowAddSite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Website</h2>
            <div className="form-group">
              <label>Domain</label>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddSite(false)}>Cancel</button>
              <button className="btn" onClick={handleAddSite}>Add Site</button>
            </div>
          </div>
        </div>
      )}

      {showSnippet && (
        <div className="modal-overlay" onClick={() => setShowSnippet(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Tracking Code</h2>
            <p style={{ color: '#718096', marginBottom: 16 }}>
              Add this snippet to your website's HTML, just before the &lt;/head&gt; tag.
            </p>
            <pre className="code-block">{snippet}</pre>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSnippet(false)}>Close</button>
              <button className="btn" onClick={() => copyToClipboard(snippet)}>Copy Code</button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <div className="modal-overlay" onClick={() => setShowShare(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Share Analytics</h2>
            <p style={{ color: '#718096', marginBottom: 16 }}>
              Anyone with this link can view your analytics data.
            </p>
            <pre className="code-block">{shareLink}</pre>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowShare(false)}>Close</button>
              <button className="btn" onClick={() => copyToClipboard(shareLink)}>Copy Link</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
