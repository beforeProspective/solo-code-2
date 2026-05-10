import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { statsAPI, cabinetAPI } from '../services/api';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, cabinetsRes] = await Promise.all([
        statsAPI.getStats(),
        cabinetAPI.getAll()
      ]);
      
      if (statsRes.data.success) {
        setStats(statsRes.data.data);
      }
      if (cabinetsRes.data.success) {
        setCabinets(cabinetsRes.data.data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="card">加载中...</div>;
  }

  const utilizationChartOption = {
    title: {
      text: '机柜空间利用率',
      left: 'center',
      textStyle: { fontSize: 16 }
    },
    tooltip: {
      trigger: 'axis',
      formatter: '{b}: {c}%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: cabinets.map(c => c.name),
      axisLabel: { rotate: 0 }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { formatter: '{value}%' }
    },
    series: [{
      type: 'bar',
      data: cabinets.map(c => ({
        value: c.utilization,
        itemStyle: {
          color: c.utilization >= 80 ? '#e74c3c' : c.utilization >= 60 ? '#e67e22' : '#2ecc71'
        }
      })),
      label: {
        show: true,
        position: 'top',
        formatter: '{c}%'
      },
      barWidth: '50%'
    }]
  };

  const deviceTypeChartOption = {
    title: {
      text: '设备类型分布',
      left: 'center',
      textStyle: { fontSize: 16 }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}台 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center'
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 5,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: false,
        position: 'center'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 18,
          fontWeight: 'bold'
        }
      },
      labelLine: {
        show: false
      },
      data: (stats?.device_types || []).map((d, i) => ({
        value: d.count,
        name: d.type,
        itemStyle: {
          color: ['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c'][i % 6]
        }
      }))
    }]
  };

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.total_cabinets || 0}</div>
          <div className="stat-label">机柜总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.total_devices || 0}</div>
          <div className="stat-label">设备总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.total_connections || 0}</div>
          <div className="stat-label">网络连接数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {cabinets.length > 0 
              ? Math.round(cabinets.reduce((a, b) => a + b.utilization, 0) / cabinets.length) 
              : 0}%
          </div>
          <div className="stat-label">平均利用率</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="card">
          <ReactECharts 
            option={utilizationChartOption} 
            style={{ height: '350px' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>
        <div className="card">
          <ReactECharts 
            option={deviceTypeChartOption} 
            style={{ height: '350px' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>

      <div className="card">
        <h2>机柜详情</h2>
        <div className="cabinet-list">
          {cabinets.map(cabinet => (
            <div key={cabinet.id} className="cabinet-item">
              <div className="cabinet-name">{cabinet.name}</div>
              <div className="cabinet-location">{cabinet.location}</div>
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#666' }}>
                已用: {cabinet.used_units}U / 可用: {cabinet.available_units}U
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
    </div>
  );
}

export default Dashboard;
