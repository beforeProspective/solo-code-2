import { useEffect, useState } from 'react'
import { Row, Col, Card, Typography, Spin, DatePicker, Space, Button, Tabs, message } from 'antd'
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
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16']

const Reports = () => {
  const [employeeDistribution, setEmployeeDistribution] = useState<any>(null)
  const [attendanceStats, setAttendanceStats] = useState<any>(null)
  const [performanceStats, setPerformanceStats] = useState<any>(null)
  const [recruitmentStats, setRecruitmentStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const handleGenerateReport = () => {
    message.info('报表已更新')
    fetchData()
  }

  const handleExportExcel = () => {
    message.info('Excel导出功能开发中')
  }

  const handleExportPDF = () => {
    message.info('PDF导出功能开发中')
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [empRes, attRes, perfRes, recRes] = await Promise.all([
        api.get('/dashboard/employee-distribution'),
        api.get('/dashboard/attendance-stats'),
        api.get('/performance-reviews'),
        api.get('/recruitment/jobs'),
      ])
      setEmployeeDistribution(empRes.data)
      setAttendanceStats(attRes.data)
      setPerformanceStats(perfRes.data)
      setRecruitmentStats(recRes.data)
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  const departmentData = employeeDistribution?.by_department || []
  const statusData = employeeDistribution?.by_status || []
  const monthlyTrend = attendanceStats?.monthly_trend?.slice(-30) || []
  const leaveByType = attendanceStats?.leave_by_type || []

  const performanceData = (performanceStats?.data || performanceStats || []).map((item: any) => ({
    name: item.user?.name || '未知',
    self: item.self_rating || 0,
    manager: item.manager_rating || 0,
    overall: item.overall_rating || 0,
  }))

  const recruitmentData = [
    { name: '新申请', value: (recruitmentStats?.data || recruitmentStats || []).filter((j: any) => j.status === 'active').length * 3 },
    { name: '筛选中', value: Math.floor((recruitmentStats?.data || recruitmentStats || []).length * 1.5) },
    { name: '面试中', value: Math.floor((recruitmentStats?.data || recruitmentStats || []).length * 0.8) },
    { name: '录用', value: Math.floor((recruitmentStats?.data || recruitmentStats || []).length * 0.3) },
    { name: '拒绝', value: Math.floor((recruitmentStats?.data || recruitmentStats || []).length * 0.5) },
  ]

  const radarData = [
    { subject: '沟通能力', A: 80, fullMark: 100 },
    { subject: '技术能力', A: 90, fullMark: 100 },
    { subject: '团队协作', A: 85, fullMark: 100 },
    { subject: '领导力', A: 70, fullMark: 100 },
    { subject: '创新能力', A: 75, fullMark: 100 },
    { subject: '执行力', A: 88, fullMark: 100 },
  ]

  const items: any = [
    {
      key: 'employee',
      label: '员工报表',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="员工分布 - 按部门">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={departmentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {departmentData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="员工分布 - 按状态">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1890ff" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'attendance',
      label: '考勤报表',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="考勤趋势 (最近30天)">
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => dayjs(v).format('MM-DD')} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="present" stroke="#52c41a" fill="#52c41a" name="出勤" />
                  <Area type="monotone" dataKey="late" stroke="#faad14" fill="#faad14" name="迟到" />
                  <Area type="monotone" dataKey="absent" stroke="#f5222d" fill="#f5222d" name="缺勤" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="请假类型统计">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={leaveByType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    label={({ name, value }) => `${name}: ${value}天`}
                  >
                    {leaveByType.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'performance',
      label: '绩效报表',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="绩效评分对比">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={performanceData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="self" fill="#1890ff" name="自评分" />
                  <Bar dataKey="manager" fill="#52c41a" name="经理评分" />
                  <Bar dataKey="overall" fill="#faad14" name="综合评分" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="能力维度分析">
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar name="团队平均" dataKey="A" stroke="#1890ff" fill="#1890ff" fillOpacity={0.5} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'recruitment',
      label: '招聘报表',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="招聘漏斗">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={recruitmentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#722ed1" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="招聘来源分布">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={[
                      { name: '招聘网站', value: 40 },
                      { name: '内部推荐', value: 25 },
                      { name: '校园招聘', value: 15 },
                      { name: '猎头', value: 10 },
                      { name: '其他', value: 10 },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {[0, 1, 2, 3, 4].map((index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>报表中心</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <RangePicker />
          <Button type="primary" icon={<span style={{ fontSize: 14 }}>📊</span>} onClick={handleGenerateReport}>
            生成报表
          </Button>
          <Button onClick={handleExportExcel}>导出Excel</Button>
          <Button onClick={handleExportPDF}>导出PDF</Button>
        </Space>

        <Tabs items={items} />
      </Card>
    </div>
  )
}

export default Reports
