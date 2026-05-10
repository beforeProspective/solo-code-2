import { useState, useEffect } from 'react';
import { cabinetAPI } from '../services/api';

function Cabinets() {
  const [cabinets, setCabinets] = useState([]);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await cabinetAPI.getAll();
      if (res.data.success) {
        setCabinets(res.data.data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCabinetDetail = async (id) => {
    try {
      const res = await cabinetAPI.getById(id);
      if (res.data.success) {
        setSelectedCabinet(res.data.data);
      }
    } catch (error) {
      console.error('加载机柜详情失败:', error);
    }
  };

  const renderCabinetVisual = (cabinet) => {
    const totalUnits = cabinet.total_units || 42;
    const occupiedUnits = new Set();
    
    (cabinet.devices || []).forEach(device => {
      for (let i = device.unit_start; i < device.unit_start + device.unit_height; i++) {
        occupiedUnits.add(i);
      }
    });

    const units = [];
    for (let i = totalUnits; i >= 1; i--) {
      const isOccupied = occupiedUnits.has(i);
      const device = (cabinet.devices || []).find(d => 
        i >= d.unit_start && i < d.unit_start + d.unit_height && i === d.unit_start
      );
      
      units.push(
        <div 
          key={i} 
          className={`cabinet-unit ${isOccupied ? 'occupied' : ''}`}
          title={device ? `${device.name} (${device.model})` : `${i}U - 空闲`}
        >
          {i}
        </div>
      );
    }
    return units;
  };

  if (loading) {
    return <div className="card">加载中...</div>;
  }

  return (
    <div>
      <div className="card">
        <h2>机柜列表</h2>
        <div className="cabinet-list">
          {cabinets.map(cabinet => (
            <div 
              key={cabinet.id} 
              className="cabinet-item"
              onClick={() => loadCabinetDetail(cabinet.id)}
              style={{ border: selectedCabinet?.id === cabinet.id ? '2px solid #3498db' : 'none' }}
            >
              <div className="cabinet-name">{cabinet.name}</div>
              <div className="cabinet-location">{cabinet.location}</div>
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#666' }}>
                {cabinet.used_units}U / {cabinet.total_units}U 已用
              </div>
              <div className="progress-bar">
                <div 
                  className={`progress-fill ${cabinet.utilization >= 80 ? 'very-high' : cabinet.utilization >= 60 ? 'high' : ''}`}
                  style={{ width: `${cabinet.utilization}%` }}
                />
              </div>
              <div style={{ marginTop: '5px', fontWeight: '600', color: '#333' }}>
                {cabinet.utilization}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedCabinet && (
        <div className="card">
          <h2>机柜详情: {selectedCabinet.name}</h2>
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
            <div>
              <h4 style={{ marginBottom: '15px' }}>机柜U位视图</h4>
              <div className="cabinet-visual">
                {renderCabinetVisual(selectedCabinet)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h4 style={{ marginBottom: '15px' }}>设备列表</h4>
              {(selectedCabinet.devices || []).length === 0 ? (
                <p style={{ color: '#999' }}>此机柜暂无设备</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>U位</th>
                      <th>设备名称</th>
                      <th>类型</th>
                      <th>型号</th>
                      <th>IP地址</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCabinet.devices
                      .sort((a, b) => b.unit_start - a.unit_start)
                      .map(device => (
                        <tr key={device.id}>
                          <td>
                            {device.unit_start}U - {device.unit_start + device.unit_height - 1}U
                          </td>
                          <td>{device.name}</td>
                          <td>{device.type}</td>
                          <td>{device.model}</td>
                          <td style={{ fontFamily: 'monospace' }}>{device.ip_address}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cabinets;
