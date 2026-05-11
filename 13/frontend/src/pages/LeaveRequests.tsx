import { useEffect, useState } from 'react'
import {
  Table,
  Card,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Typography,
  Space,
  message,
  Popconfirm,
  Divider,
  Descriptions,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs, { Dayjs } from 'dayjs'
import { useAppSelector } from '@/store'

const { Title, Text } = Typography
const { TextArea } = Input
const { RangePicker } = DatePicker

interface LeaveRecord {
  id: number
  user_id: number
  leave_type: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: string
  approver_comment: string | null
  user: { name: string }
  approver?: { name: string }
  created_at: string
}

const leaveTypeOptions = [
  { value: 'annual', label: '年假' },
  { value: 'sick', label: '病假' },
  { value: 'personal', label: '事假' },
  { value: 'maternity', label: '产假' },
  { value: 'paternity', label: '陪产假' },
  { value: 'unpaid', label: '无薪假' },
  { value: 'other', label: '其他' },
]

const statusColor: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
}

const statusLabel: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
}

const LeaveRequests = () => {
  const [data, setData] = useState<LeaveRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LeaveRecord | null>(null)
  const [form] = Form.useForm()
  const { user } = useAppSelector((state) => state.auth)

  const isManager = user && ['admin', 'hr', 'manager'].includes(user.role)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/leave-requests')
      setData(res.data.data || res.data)
    } catch (error) {
      message.error('获取请假记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (values: any) => {
    try {
      const startDate = values.date_range[0] as Dayjs
      const endDate = values.date_range[1] as Dayjs

      await api.post('/leave-requests', {
        leave_type: values.leave_type,
        start_date: startDate.format('YYYY-MM-DD'),
        end_date: endDate.format('YYYY-MM-DD'),
        reason: values.reason,
        approver_id: user?.id,
      })

      message.success('请假申请提交成功')
      setModalVisible(false)
      form.resetFields()
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '提交失败')
    }
  }

  const handleApprove = async (id: number, comment: string) => {
    try {
      await api.post(`/leave-requests/${id}/approve`, { approver_comment: comment })
      message.success('批准成功')
      fetchData()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleReject = async (id: number, comment: string) => {
    try {
      await api.post(`/leave-requests/${id}/reject`, { approver_comment: comment })
      message.success('已拒绝')
      fetchData()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/leave-requests/${id}`)
      message.success('已撤回')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '申请人',
      dataIndex: ['user', 'name'],
      key: 'user',
    },
    {
      title: '请假类型',
      dataIndex: 'leave_type',
      key: 'leave_type',
      render: (v: string) => {
        const option = leaveTypeOptions.find(o => o.value === v)
        return option?.label || v
      },
    },
    {
      title: '时间范围',
      key: 'range',
      render: (_: any, record: LeaveRecord) => (
        <span>
          {dayjs(record.start_date).format('YYYY-MM-DD')} ~ {dayjs(record.end_date).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      title: '天数',
      dataIndex: 'total_days',
      key: 'total_days',
      render: (v: number) => `${v} 天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v]}</Tag>,
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: LeaveRecord) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedItem(record)
              setDetailVisible(true)
            }}
          >
            详情
          </Button>

          {isManager && record.status === 'pending' && (
            <>
              <Button
                type="link"
                icon={<CheckOutlined />}
                onClick={() => {
                  let comment = ''
                  Modal.confirm({
                    title: '批准此请假申请？',
                    icon: <CheckOutlined style={{ color: 'green' }} />,
                    okText: '批准',
                    cancelText: '取消',
                    content: (
                      <div style={{ marginTop: 16 }}>
                        <Text type="secondary">审批意见（可选）：</Text>
                        <Input.TextArea
                          rows={2}
                          placeholder="请输入审批意见"
                          onChange={(e) => {
                            comment = e.target.value
                          }}
                        />
                      </div>
                    ),
                    onOk: () => handleApprove(record.id, comment || ''),
                  })
                }}
              >
                批准
              </Button>

              <Button
                type="link"
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  let comment = ''
                  Modal.confirm({
                    title: '拒绝此请假申请？',
                    icon: <CloseOutlined style={{ color: 'red' }} />,
                    okText: '拒绝',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    content: (
                      <div style={{ marginTop: 16 }}>
                        <Text type="secondary">拒绝原因：</Text>
                        <Input.TextArea
                          rows={2}
                          placeholder="请输入拒绝原因"
                          onChange={(e) => {
                            comment = e.target.value
                          }}
                        />
                      </div>
                    ),
                    onOk: () => handleReject(record.id, comment),
                  })
                }}
              >
                拒绝
              </Button>
            </>
          )}

          {record.status === 'pending' && (
            <Popconfirm
              title="确定要撤回此申请吗？"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>撤回</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>请假申请</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            申请请假
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title="申请请假"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="提交"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="leave_type"
            label="请假类型"
            rules={[{ required: true, message: '请选择请假类型' }]}
          >
            <Select options={leaveTypeOptions} placeholder="请选择" />
          </Form.Item>

          <Form.Item
            name="date_range"
            label="时间范围"
            rules={[{ required: true, message: '请选择时间范围' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="请假原因"
            rules={[{ required: true, message: '请填写请假原因' }]}
          >
            <TextArea rows={4} placeholder="请详细描述请假原因" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="请假详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedItem && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="申请人">{selectedItem.user.name}</Descriptions.Item>
            <Descriptions.Item label="请假类型">
              {leaveTypeOptions.find(o => o.value === selectedItem.leave_type)?.label}
            </Descriptions.Item>
            <Descriptions.Item label="开始日期">
              {dayjs(selectedItem.start_date).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="结束日期">
              {dayjs(selectedItem.end_date).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="总天数">{selectedItem.total_days} 天</Descriptions.Item>
            <Descriptions.Item label="请假原因">{selectedItem.reason}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="审批人">
              {selectedItem.approver?.name || '待指定'}
            </Descriptions.Item>
            {selectedItem.approver_comment && (
              <Descriptions.Item label="审批意见">
                {selectedItem.approver_comment}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default LeaveRequests
