import { useState, useEffect } from 'react';
import { connectionAPI, deviceAPI } from '../services/api';
import ReactECharts from 'echarts-for-react';

function Wiring() {
  const [connections, setConnections] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    source_device_id: '',
    source_port: '',
    target_device_id: '',
    target_port: '',
    connection_type: '网络',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [connRes, devRes] = await Promise.all([
        connectionAPI.getAll(),
        deviceAPI.getAll()
      ]);
      
      if (connRes.data.success) {
        setConnections(connRes.data.data);
      }
      if (devRes.data.success) {
        setDevices(devRes.data.data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (parseInt(formData.source_device_id) === parseInt(formData.target_device_id)) {
        window.alert('源设备和目标设备不能相同');
        return;
      }
      await connectionAPI.create(formData);
      setShowModal(false);
      setFormData({
        source_device_id: '',
        source_port: '',
        target_device_id: '',
        target_port: '',
        connection_type: '网络',
        notes: ''
      });
      loadData();
    } catch (error) {
      console.error('保存失败:', error);
      window.alert('保存失败');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除此连接吗？')) return;
    try {
      await connectionAPI.delete(id);
      loadData();
    } catch (error) {
      console.error('删除失败:', error);
      window.alert('删除失败');
    }
  };

  const getNetworkGraphOption = () => {
    const deviceMap = new Map(devices.map(d => [d.id, d]));
    const nodes = devices.map((d, i) => ({
      id: d.id.toString(),
      name: d.name,
      symbolSize: 50,
      category: ['服务器', '交换机', '路由器', '存储', '防火墙', '其他'].indexOf(d.type) || 0,
      value: d.type,
      itemStyle: {
        color: ['#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e74c3c', '#95a5a6'][[
          '服务器', '交换机', '路由器', '存储', '防火墙', '其他'].indexOf(d.type)] || '#95a5a6'
      }
    }));

    const links = connections.map(c => ({
      source: c.source_device_id.toString(),
      target: c.target_device_id.toString(),
      name: `${c.source_port} → ${c.target_port}`,
      lineStyle: {
        width: 2,
        curveness: 0.1
      }
    }));

    return {
      title: {
        text: '网络拓扑图',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        formatter: function(params) {
          if (params.dataType === 'edge') {
            return `连接: ${params.name}`;
          }
          const dev = deviceMap.get(parseInt(params.data.id));
          return `${params.name}<br/>类型: ${dev?.type || '未知'}<br/>IP: ${dev?.ip_address || '-'}`;
        }
      },
      legend: {
        data: ['服务器', '交换机', '路由器', '存储', '防火墙', '其他'],
        bottom: 10
      },
      series: [{
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        force: {
          repulsion: 400,
          edgeLength: 120,
          gravity: 0.1
        },
        label: {
          show: true,
          position: 'bottom',
          fontSize: 12
        },
        edgeLabel: {
          show: true,
          formatter: '{c}',
          fontSize: 10
        },
        edgeSymbol: ['circle', 'arrow'],
        edgeSymbolSize: [4, 10],
        data: nodes,
        links: links,
        categories: [
          { name: '服务器' },
          { name: '交换机' },
          { name: '路由器' },
          { name: '存储' },
          { name: '防火墙' },
          { name: '其他' }
        ]
      }]
    };
  };

  if (loading) {
    return <div className="card">加载中...</div>;
  }

  return (
    <div>
      <div className="card">
        <h2>网络拓扑</h2>
        <ReactECharts 
          option={getNetworkGraphOption()} 
          style={{ height: '450px' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>布线连接</h2>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + 添加连接
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>源设备</th>
                <th>源端口</th>
                <th>目标设备</th>
                <th>目标端口</th>
                <th>类型</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    暂无连接数据
                  </td>
                </tr>
              ) : (
                connections.map(conn => (
                  <tr key={conn.id}>
                    <td>{conn.id}</td>
                    <td>{conn.source_name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{conn.source_port}</td>
                    <td>{conn.target_name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{conn.target_port}</td>
                    <td>{conn.connection_type}</td>
                    <td>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => handleDelete(conn.id)}
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
            <h3>添加布线连接</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>源设备</label>
                  <select 
                    required
                    value={formData.source_device_id}
                    onChange={(e) => setFormData({...formData, source_device_id: e.target.value})}
                  >
                    <option value="">请选择</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>源端口</label>
                  <input 
                    type="text" 
                    required
                    placeholder="如: eth0, Gi1/0/1"
                    value={formData.source_port}
                    onChange={(e) => setFormData({...formData, source_port: e.target.value})}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>目标设备</label>
                  <select 
                    required
                    value={formData.target_device_id}
                    onChange={(e) => setFormData({...formData, target_device_id: e.target.value})}
                  >
                    <option value="">请选择</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>目标端口</label>
                  <input 
                    type="text" 
                    required
                    placeholder="如: Gi1/0/24"
                    value={formData.target_port}
                    onChange={(e) => setFormData({...formData, target_port: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>连接类型</label>
                <select 
                  value={formData.connection_type}
                  onChange={(e) => setFormData({...formData, connection_type: e.target.value})}
                >
                  <option value="网络">网络</option>
                  <option value="光纤">光纤</option>
                  <option value="电源">电源</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="form-group">
                <label>备注</label>
                <textarea 
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
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

export default Wiring;
