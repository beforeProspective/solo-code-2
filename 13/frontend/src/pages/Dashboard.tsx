import { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin } from 'antd'
import {
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  ShoppingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title } = Typography

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']

interface DashboardStats {
  employees: {
    total: number
    new_hires: number
    terminations: number
    departments: number
  }
  attendance: {
    present_today: number
    absent_today: number
    attendance_rate: number
  }
  leave_requests: {
    pending: number
    approved_this_month: number
  }
  recruitment: {
    active_jobs: number
    new_applicants: number
    interviews_this_month: number
  }
  performance: {
    pending_reviews: number
    completed_reviews: number
  }
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [employeeDistribution, setEmployeeDistribution] = useState<any>(null)
  const [attendanceStats, setAttendanceStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, distRes, attRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/employee-distribution'),
          api.get('/dashboard/attendance-stats'),
        ])
        setStats(statsRes.data)
        setEmployeeDistribution(distRes.data)
        setAttendanceStats(attRes.data)
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  const attendanceColumns = [
    { title: '日期', dataIndex: 'date', key: 'date' },
    { title: '出勤', dataIndex: 'present', key: 'present', render: (v: number) => <Tag color="green">{v}</Tag> },
    { title: '缺勤', dataIndex: 'absent', key: 'absent', render: (v: number) => <Tag color="red">{v}</Tag> },
    { title: '迟到', dataIndex: 'late', key: 'late', render: (v: number) => <Tag color="orange">{v}</Tag> },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>仪表盘</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="员工总数"
              value={stats?.employees.total || 0}
              prefix={<TeamOutlined />}
              suffix={<span style={{ fontSize: 14, color: '#888' }}>人</span>}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              本月新入职: <Tag color="green">{stats?.employees.new_hires || 0}</Tag>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日出勤率"
              value={stats?.attendance.attendance_rate || 0}
              precision={2}
              prefix={<CalendarOutlined />}
              suffix="%"
              valueStyle={{ color: stats && stats.attendance.attendance_rate >= 90 ? '#3f8600' : '#cf1322' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              出勤: {stats?.attendance.present_today || 0} 人 | 缺勤: {stats?.attendance.absent_today || 0} 人
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="待审批请假"
              value={stats?.leave_requests.pending || 0}
              prefix={<FileTextOutlined />}
              suffix="个"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              本月已批准: <Tag color="blue">{stats?.leave_requests.approved_this_month || 0}</Tag>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="招聘进行中"
              value={stats?.recruitment.active_jobs || 0}
              prefix={<ShoppingOutlined />}
              suffix="个职位"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              本月新简历: <Tag color="purple">{stats?.recruitment.new_applicants || 0}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="员工分布 - 按部门">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={employeeDistribution?.by_department || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {(employeeDistribution?.by_department || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="本月考勤趋势">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={attendanceStats?.monthly_trend?.slice(-14) || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => dayjs(v).format('MM-DD')} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#52c41a" name="出勤" />
                <Line type="monotone" dataKey="late" stroke="#faad14" name="迟到" />
                <Line type="monotone" dataKey="absent" stroke="#f5222d" name="缺勤" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="员工分布 - 按状态">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={employeeDistribution?.by_status || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#1890ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="请假类型统计 (本月)">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={attendanceStats?.leave_by_type || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name}: ${value}天`}
                >
                  {(attendanceStats?.leave_by_type || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="最近考勤记录">
            <Table
              columns={attendanceColumns}
              dataSource={attendanceStats?.monthly_trend?.slice(-7) || []}
              rowKey="date"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
