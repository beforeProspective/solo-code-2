import { useState, useEffect } from 'react'
import { Card, Button, Row, Col, Statistic, Typography, Tag, message, Space } from 'antd'
import { ClockCircleOutlined, LoginOutlined, LogoutOutlined, CoffeeOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface TodayAttendance {
  attendance: {
    id: number
    date: string
    clock_in: string | null
    clock_out: string | null
    break_start: string | null
    break_end: string | null
    status: string
  } | null
  current_time: string
}

const AttendanceClock = () => {
  const [today, setToday] = useState<TodayAttendance | null>(null)
  const [currentTime, setCurrentTime] = useState(dayjs())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchToday()
    const timer = setInterval(() => setCurrentTime(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchToday = async () => {
    try {
      const res = await api.get<TodayAttendance>('/attendances/today')
      setToday(res.data)
    } catch (error) {
      console.error(error)
    }
  }

  const handleClockIn = async () => {
    setLoading(true)
    try {
      await api.post('/attendances/clock-in', {
        location: '办公地点',
        device_info: navigator.userAgent.slice(0, 100),
      })
      message.success('上班打卡成功！')
      fetchToday()
    } catch (error: any) {
      message.error(error.response?.data?.message || '打卡失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClockOut = async () => {
    setLoading(true)
    try {
      await api.post('/attendances/clock-out')
      message.success('下班打卡成功！')
      fetchToday()
    } catch (error: any) {
      message.error(error.response?.data?.message || '打卡失败')
    } finally {
      setLoading(false)
    }
  }

  const statusColor: Record<string, string> = {
    present: 'green',
    absent: 'red',
    late: 'orange',
    half_day: 'blue',
    on_leave: 'purple',
  }

  const canClockIn = !today?.attendance?.clock_in
  const canClockOut = today?.attendance?.clock_in && !today?.attendance?.clock_out

  return (
    <div>
      <Title level={3}>考勤打卡</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <ClockCircleOutlined style={{ fontSize: 80, color: '#1890ff' }} />
              <div style={{ fontSize: 48, fontWeight: 'bold', marginTop: 16 }}>
                {currentTime.format('HH:mm:ss')}
              </div>
              <div style={{ fontSize: 16, color: '#888', marginTop: 8 }}>
                {currentTime.format('YYYY年MM月DD日 dddd')}
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="今日状态">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="上班打卡"
                    value={today?.attendance?.clock_in || '--:--'}
                    prefix={<LoginOutlined />}
                    valueStyle={{ color: today?.attendance?.clock_in ? '#52c41a' : '#999' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="下班打卡"
                    value={today?.attendance?.clock_out || '--:--'}
                    prefix={<LogoutOutlined />}
                    valueStyle={{ color: today?.attendance?.clock_out ? '#52c41a' : '#999' }}
                  />
                </Col>
              </Row>

              {today?.attendance && (
                <div>
                  <Text>状态：</Text>
                  <Tag color={statusColor[today.attendance.status]}>
                    {today.attendance.status === 'present' ? '出勤' :
                     today.attendance.status === 'absent' ? '缺勤' :
                     today.attendance.status === 'late' ? '迟到' :
                     today.attendance.status === 'half_day' ? '半天' : today.attendance.status}
                  </Tag>
                </div>
              )}

              <Row gutter={16}>
                <Col span={12}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    icon={<LoginOutlined />}
                    onClick={handleClockIn}
                    disabled={!canClockIn}
                    loading={loading}
                  >
                    {canClockIn ? '上班打卡' : '已打卡'}
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    danger
                    icon={<LogoutOutlined />}
                    onClick={handleClockOut}
                    disabled={!canClockOut}
                    loading={loading}
                  >
                    {today?.attendance?.clock_out ? '已下班' : '下班打卡'}
                  </Button>
                </Col>
              </Row>

              {!today?.attendance?.clock_in && (
                <div style={{ textAlign: 'center', color: '#999' }}>
                  <CoffeeOutlined /> 上午 9:00 前打卡
                </div>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="标准工作时间"
              value="9:00 - 18:00"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="午休时间"
              value="12:00 - 13:00"
              prefix={<CoffeeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="本月累计出勤"
              value="22"
              suffix="天"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default AttendanceClock
