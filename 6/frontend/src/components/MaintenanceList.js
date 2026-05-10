import React, { useState, useEffect } from 'react';
import { maintenanceService, lensService } from '../services/api';

function MaintenanceList() {
  const [records, setRecords] = useState([]);
  const [lenses, setLenses] = useState([]);
  const [overdueRecords, setOverdueRecords] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filterLensId, setFilterLensId] = useState('');
  const [formData, setFormData] = useState({
    lensId: '',
    checkDate: '',
    checkType: '定期检查',
    hasMold: false,
    moldLocation: '',
    moldSeverity: '',
    notes: '',
    actionsTaken: '',
    nextCheckDate: ''
  });

  const checkTypes = ['定期检查', '防霉检查', '清洁保养', '故障维修', '其他'];
  const moldSeverities = ['轻微', '中等', '严重'];

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadRecords(),
        loadLenses(),
        loadOverdue(),
        loadReminders()
      ]);
      setError(null);
    } catch (err) {
      setError('加载数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (lensId = null) => {
    const response = await maintenanceService.getAll(lensId);
    setRecords(response.data);
  };

  const loadLenses = async () => {
    const response = await lensService.getAll();
    setLenses(response.data);
  };

  const loadOverdue = async () => {
    try {
      const response = await maintenanceService.getOverdue();
      setOverdueRecords(response.data);
    } catch (err) {
      console.error('加载逾期提醒失败:', err);
    }
  };

  const loadReminders = async () => {
    try {
      const response = await maintenanceService.getReminders(30);
      setReminders(response.data);
    } catch (err) {
      console.error('加载提醒失败:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...formData };
      
      if (selectedRecord) {
        await maintenanceService.update(selectedRecord.id, data);
      } else {
        await maintenanceService.create(data);
      }
      
      await loadAllData();
      closeModal();
    } catch (err) {
      setError('保存失败');
      console.error(err);
    }
  };

  const handleEdit = (record) => {
    setSelectedRecord(record);
    setFormData({
      lensId: record.lensId || '',
      checkDate: record.checkDate || '',
      checkType: record.checkType || '定期检查',
      hasMold: record.hasMold || false,
      moldLocation: record.moldLocation || '',
      moldSeverity: record.moldSeverity || '',
      notes: record.notes || '',
      actionsTaken: record.actionsTaken || '',
      nextCheckDate: record.nextCheckDate || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这条保养记录吗？')) {
      try {
        await maintenanceService.delete(id);
        await loadAllData();
      } catch (err) {
        setError('删除失败');
        console.error(err);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRecord(null);
    setFormData({
      lensId: '',
      checkDate: '',
      checkType: '定期检查',
      hasMold: false,
      moldLocation: '',
      moldSeverity: '',
      notes: '',
      actionsTaken: '',
      nextCheckDate: ''
    });
  };

  const handleFilterChange = (lensId) => {
    setFilterLensId(lensId);
    loadRecords(lensId || null);
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case '轻微': return '#f39c12';
      case '中等': return '#e67e22';
      case '严重': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>🔧 保养提醒</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          disabled={lenses.length === 0}
        >
          + 添加保养记录
        </button>
      </div>

      {lenses.length === 0 && (
        <div className="alert alert-warning">
          请先添加镜头，然后才能创建保养记录。
        </div>
      )}

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-number">{records.length}</div>
          <div className="stat-label">保养记录总数</div>
        </div>
        <div className="stat-card" style={{ backgroundColor: overdueRecords.length > 0 ? '#fdf2f2' : '' }}>
          <div className="stat-number" style={{ color: overdueRecords.length > 0 ? '#e74c3c' : '#3498db' }}>
            {overdueRecords.length}
          </div>
          <div className="stat-label">逾期检查</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{reminders.length}</div>
          <div className="stat-label">30天内提醒</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {records.filter(r => r.hasMold).length}
          </div>
          <div className="stat-label">发现发霉</div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {overdueRecords.length > 0 && (
        <div className="alert alert-danger">
          <strong>⚠️ 有 {overdueRecords.length} 个镜头的检查已逾期!</strong>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            {overdueRecords.slice(0, 3).map(record => (
              <li key={record.id}>
                {record.lensName} - 原定检查日期: {record.nextCheckDate}
              </li>
            ))}
            {overdueRecords.length > 3 && <li>... 还有 {overdueRecords.length - 3} 个</li>}
          </ul>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="alert alert-warning">
          <strong>📅 未来30天内有 {reminders.length} 个镜头需要检查</strong>
        </div>
      )}

      <div className="filter-section">
        <div className="form-group">
          <label>按镜头筛选</label>
          <select 
            value={filterLensId}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="">全部镜头</option>
            {lenses.map(lens => (
              <option key={lens.id} value={lens.id}>
                {lens.brand} {lens.model}
              </option>
            ))}
          </select>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>暂无保养记录</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            建议每3-6个月检查一次镜头是否发霉
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {records.map(record => (
            <div key={record.id} className="card" style={{ 
              borderLeft: record.hasMold ? `4px solid ${getSeverityColor(record.moldSeverity)}` : 'none',
              opacity: overdueRecords.some(r => r.id === record.id) ? 0.9 : 1
            }}>
              <div className="card-header">
                <h3>{record.lensName || '未知镜头'}</h3>
              </div>
              <div className="card-body">
                <p><strong>检查日期:</strong> {record.checkDate}</p>
                <p><strong>检查类型:</strong> {record.checkType}</p>
                <p>
                  <strong>发霉情况:</strong> 
                  {record.hasMold ? (
                    <span style={{ color: getSeverityColor(record.moldSeverity), fontWeight: 'bold' }}>
                      发现发霉 ({record.moldSeverity || '未注明'})
                    </span>
                  ) : (
                    <span style={{ color: '#27ae60' }}>✓ 正常</span>
                  )}
                </p>
                {record.hasMold && record.moldLocation && (
                  <p><strong>发霉位置:</strong> {record.moldLocation}</p>
                )}
                {record.nextCheckDate && (
                  <p style={{ 
                    color: overdueRecords.some(r => r.id === record.id) ? '#e74c3c' : '#f39c12',
                    fontWeight: 'bold'
                  }}>
                    <strong>下次检查:</strong> {record.nextCheckDate}
                    {overdueRecords.some(r => r.id === record.id) && ' (已逾期)'}
                  </p>
                )}
                {record.notes && <p><strong>备注:</strong> {record.notes}</p>}
                {record.actionsTaken && <p><strong>处理措施:</strong> {record.actionsTaken}</p>}
              </div>
              <div className="card-footer">
                <button 
                  className="btn btn-primary"
                  onClick={() => handleEdit(record)}
                >
                  编辑
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDelete(record.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h3>{selectedRecord ? '编辑保养记录' : '添加保养记录'}</h3>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>选择镜头 *</label>
                  <select 
                    required
                    value={formData.lensId}
                    onChange={(e) => setFormData({...formData, lensId: e.target.value})}
                  >
                    <option value="">请选择镜头</option>
                    {lenses.map(lens => (
                      <option key={lens.id} value={lens.id}>
                        {lens.brand} {lens.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>检查日期 *</label>
                  <input 
                    type="date"
                    required
                    value={formData.checkDate}
                    onChange={(e) => setFormData({...formData, checkDate: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>检查类型</label>
                  <select 
                    value={formData.checkType}
                    onChange={(e) => setFormData({...formData, checkType: e.target.value})}
                  >
                    {checkTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group checkbox-group">
                  <input 
                    type="checkbox"
                    id="hasMold"
                    checked={formData.hasMold}
                    onChange={(e) => setFormData({...formData, hasMold: e.target.checked})}
                  />
                  <label htmlFor="hasMold">发现发霉</label>
                </div>
                {formData.hasMold && (
                  <>
                    <div className="form-group">
                      <label>发霉位置</label>
                      <input 
                        type="text"
                        value={formData.moldLocation}
                        onChange={(e) => setFormData({...formData, moldLocation: e.target.value})}
                        placeholder="例如：前镜片、后镜片、光圈叶片"
                      />
                    </div>
                    <div className="form-group">
                      <label>发霉程度</label>
                      <select 
                        value={formData.moldSeverity}
                        onChange={(e) => setFormData({...formData, moldSeverity: e.target.value})}
                      >
                        <option value="">请选择</option>
                        {moldSeverities.map(severity => (
                          <option key={severity} value={severity}>{severity}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label>处理措施</label>
                  <textarea 
                    value={formData.actionsTaken}
                    onChange={(e) => setFormData({...formData, actionsTaken: e.target.value})}
                    placeholder="已采取的处理措施"
                  />
                </div>
                <div className="form-group">
                  <label>下次检查日期</label>
                  <input 
                    type="date"
                    value={formData.nextCheckDate}
                    onChange={(e) => setFormData({...formData, nextCheckDate: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>备注</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaintenanceList;
