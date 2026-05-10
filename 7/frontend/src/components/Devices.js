import { useState, useEffect } from 'react';
import { deviceAPI, cabinetAPI, labelAPI } from '../services/api';

function Devices() {
  const [devices, setDevices] = useState([]);
  const [cabinets, setCabinets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labelHtml, setLabelHtml] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    type: '服务器',
    model: '',
    serial_number: '',
    cabinet_id: '',
    unit_start: '',
    unit_height: 1,
    ip_address: '',
    status: 'active'
  });

  const deviceTypes = ['服务器', '交换机', '路由器', '存储', '防火墙', '其他'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [devicesRes, cabinetsRes] = await Promise.all([
        deviceAPI.getAll(),
        cabinetAPI.getAll()
      ]);
      
      if (devicesRes.data.success) {
        setDevices(devicesRes.data.data);
      }
      if (cabinetsRes.data.success) {
        setCabinets(cabinetsRes.data.data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadData();
      return;
    }
    setLoading(true);
    try {
      const res = await deviceAPI.search(searchQuery);
      if (res.data.success) {
        setDevices(res.data.data);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDeviceSelection = (id) => {
    setSelectedDevices(prev => 
      prev.includes(id) 
        ? prev.filter(d => d !== id)
        : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedDevices.length === devices.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(devices.map(d => d.id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        await deviceAPI.update(editingDevice.id, formData);
      } else {
        await deviceAPI.create(formData);
      }
      setShowModal(false);
      setEditingDevice(null);
      loadData();
    } catch (error) {
      console.error('保存失败:', error);
      window.alert('保存失败');
    }
  };

  const openEditModal = (device) => {
    setEditingDevice(device);
    setFormData({
      name: device.name,
      type: device.type || '服务器',
      model: device.model || '',
      serial_number: device.serial_number || '',
      cabinet_id: device.cabinet_id || '',
      unit_start: device.unit_start || '',
      unit_height: device.unit_height || 1,
      ip_address: device.ip_address || '',
      status: device.status || 'active'
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingDevice(null);
    setFormData({
      name: '',
      type: '服务器',
      model: '',
      serial_number: '',
      cabinet_id: '',
      unit_start: '',
      unit_height: 1,
      ip_address: '',
      status: 'active'
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此设备吗？')) return;
    try {
      await deviceAPI.delete(id);
      loadData();
    } catch (error) {
      console.error('删除失败:', error);
      window.alert('删除失败');
    }
  };

  const generateLabels = async () => {
    if (selectedDevices.length === 0) {
      window.alert('请先选择设备');
      return;
    }
    try {
      const res = await labelAPI.generate(selectedDevices);
      if (res.data.success) {
        const labelWindow = window.open('', '_blank');
        if (labelWindow) {
          labelWindow.document.write(res.data.data.html_content);
          labelWindow.document.close();
        } else {
          window.alert('请允许弹出窗口以查看标签');
          setLabelHtml(res.data.data.html_content);
        }
      }
    } catch (error) {
      console.error('生成标签失败:', error);
      window.alert('生成标签失败');
    }
  };

  const getTypeBadgeClass = (type) => {
    const map = {
      '服务器': 'badge-server',
      '交换机': 'badge-switch',
      '路由器': 'badge-router',
      '存储': 'badge-storage',
      '防火墙': 'badge-firewall'
    };
    return map[type] || 'badge-server';
  };

  return (
    <div>
      <div className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>设备管理</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-success" onClick={generateLabels}>
              🖨️ 打印标签 ({selectedDevices.length})
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>
              + 添加设备
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            placeholder="搜索设备名称、型号、序列号、IP地址..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? '搜索中...' : '🔍 搜索'}
          </button>
          {searchQuery && (
            <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); loadData(); }}>
              重置
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedDevices.length === devices.length && devices.length > 0}
                    onChange={selectAll}
                  />
                </th>
                <th>ID</th>
                <th>设备名称</th>
                <th>类型</th>
                <th>型号</th>
                <th>序列号</th>
                <th>IP地址</th>
                <th>机柜</th>
                <th>U位</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    暂无设备数据
                  </td>
                </tr>
              ) : (
                devices.map(device => (
                  <tr key={device.id} className={`device-row ${selectedDevices.includes(device.id) ? 'selected' : ''}`}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedDevices.includes(device.id)}
                        onChange={() => toggleDeviceSelection(device.id)}
                      />
                    </td>
                    <td>{device.id}</td>
                    <td>{device.name}</td>
                    <td>
                      <span className={`badge ${getTypeBadgeClass(device.type)}`}>
                        {device.type}
                      </span>
                    </td>
                    <td>{device.model}</td>
                    <td>{device.serial_number}</td>
                    <td style={{ fontFamily: 'monospace' }}>{device.ip_address}</td>
                    <td>{device.cabinet_name || '-'}</td>
                    <td>
                      {device.unit_start ? `${device.unit_start}U - ${device.unit_start + device.unit_height - 1}U (${device.unit_height}U)` : '-'}
                    </td>
                    <td>
                      <button 
                        className="btn btn-primary" 
                        style={{ marginRight: '5px', padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => openEditModal(device)}
                      >
                        编辑
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => handleDelete(device.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingDevice ? '编辑设备' : '添加设备'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>设备名称 *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>设备类型</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                >
                  {deviceTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>型号</label>
                <input 
                  type="text" 
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>序列号</label>
                <input 
                  type="text" 
                  value={formData.serial_number}
                  onChange={(e) => setFormData({...formData, serial_number: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>IP地址</label>
                <input 
                  type="text" 
                  value={formData.ip_address}
                  onChange={(e) => setFormData({...formData, ip_address: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>机柜</label>
                <select 
                  value={formData.cabinet_id}
                  onChange={(e) => setFormData({...formData, cabinet_id: e.target.value})}
                >
                  <option value="">未分配</option>
                  {cabinets.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.location}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>起始U位</label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.unit_start}
                    onChange={(e) => setFormData({...formData, unit_start: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>占用U数</label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.unit_height}
                    onChange={(e) => setFormData({...formData, unit_height: parseInt(e.target.value) || 1})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Devices;
