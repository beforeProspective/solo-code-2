import { useEffect, useState } from 'react'
import { Table, Card, Tag, DatePicker, Typography, Space, Button, Spin, message } from 'antd'
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs, { Dayjs } from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

interface AttendanceRecord {
  id: number
  date: string
  clock_in: string | null
  clock_out: string | null
  status: string
  location: string | null
  user: {
    name: string
    employee?: {
      employee_code: string
    }
  }
}

const AttendanceHistory = () => {
  const [data, setData] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15, total: 0 })
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const params: any = {
        page: pagination.current,
        per_page: pagination.pageSize,
      }
      if (dateRange) {
        params.start_date = dateRange[0].format('YYYY-MM-DD')
        params.end_date = dateRange[1].format('YYYY-MM-DD')
      }
      const res = await api.get('/attendances', { params })
      const responseData = res.data.data || res.data
      setData(responseData)
      setPagination(p => ({ ...p, total: res.data.total || responseData.length }))
    } catch (error) {
      message.error('获取考勤记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [pagination.current, pagination.pageSize])

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD dddd'),
    },
    {
      title: '上班打卡',
      dataIndex: 'clock_in',
      key: 'clock_in',
      render: (v: string | null) => v || '-',
    },
    {
      title: '下班打卡',
      dataIndex: 'clock_out',
      key: 'clock_out',
      render: (v: string | null) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          present: 'green',
          absent: 'red',
          late: 'orange',
          half_day: 'blue',
          on_leave: 'purple',
        }
        const labelMap: Record<string, string> = {
          present: '出勤',
          absent: '缺勤',
          late: '迟到',
          half_day: '半天',
          on_leave: '请假',
        }
        return <Tag color={colorMap[v]}>{labelMap[v] || v}</Tag>
      },
    },
    {
      title: '地点',
      dataIndex: 'location',
      key: 'location',
      render: (v: string | null) => v || '-',
    },
  ]

  return (
    <div>
      <Title level={3}>考勤记录</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchData}
          >
            查询
          </Button>
          <Button icon={<DownloadOutlined />}>导出</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => setPagination(p => ({ ...p, current: page, pageSize })),
          }}
        />
      </Card>
    </div>
  )
}

export default AttendanceHistory
