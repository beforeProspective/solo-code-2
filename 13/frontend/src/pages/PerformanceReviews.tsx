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
  Descriptions,
  Rate,
  Steps,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs, { Dayjs } from 'dayjs'
import { useAppSelector } from '@/store'

const { Title, Text } = Typography
const { TextArea } = Input

interface Review {
  id: number
  user: { id: number; name: string }
  reviewer: { id: number; name: string } | null
  period: string
  type: string
  goals: string | null
  self_rating: number | null
  self_comments: string | null
  manager_rating: number | null
  manager_comments: string | null
  overall_rating: number | null
  status: string
  created_at: string
}

const statusColor: Record<string, string> = {
  draft: 'default',
  self_assessment: 'blue',
  manager_review: 'orange',
  completed: 'green',
}

const statusLabel: Record<string, string> = {
  draft: '草稿',
  self_assessment: '自评中',
  manager_review: '经理评估中',
  completed: '已完成',
}

const typeOptions = [
  { value: 'annual', label: '年度评估' },
  { value: 'mid_year', label: '年中评估' },
  { value: 'quarterly', label: '季度评估' },
  { value: 'probation', label: '试用期评估' },
]

const periodOptions = ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2024'].map(p => ({ value: p, label: p }))

const PerformanceReviews = () => {
  const [data, setData] = useState<Review[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Review | null>(null)
  const [form] = Form.useForm()
  const { user } = useAppSelector((state) => state.auth)

  const isManager = user && ['admin', 'hr', 'manager'].includes(user.role)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [reviewRes, empRes] = await Promise.all([
        api.get('/performance-reviews'),
        api.get('/employees'),
      ])
      setData(reviewRes.data.data || reviewRes.data)
      setEmployees(empRes.data.data || empRes.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      await api.post('/performance-reviews', {
        user_id: values.user_id,
        reviewer_id: values.reviewer_id,
        period: values.period,
        type: values.type,
        goals: values.goals,
      })
      message.success('绩效评估创建成功')
      setModalVisible(false)
      form.resetFields()
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '创建失败')
    }
  }

  const handleSelfSubmit = async (id: number, rating: number, comments: string) => {
    try {
      await api.post(`/performance-reviews/${id}/self-assess`, {
        self_rating: rating,
        self_comments: comments,
      })
      message.success('自评提交成功')
      fetchData()
    } catch (error) {
      message.error('提交失败')
    }
  }

  const handleManagerSubmit = async (id: number, rating: number, comments: string) => {
    try {
      await api.post(`/performance-reviews/${id}/manager-review`, {
        manager_rating: rating,
        manager_comments: comments,
      })
      message.success('评估提交成功')
      fetchData()
    } catch (error) {
      message.error('提交失败')
    }
  }

  const columns = [
    {
      title: '员工',
      dataIndex: ['user', 'name'],
      key: 'user',
    },
    {
      title: '评估类型',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => typeOptions.find(t => t.value === v)?.label || v,
    },
    {
      title: '评估周期',
      dataIndex: 'period',
      key: 'period',
    },
    {
      title: '自评分',
      dataIndex: 'self_rating',
      key: 'self_rating',
      render: (v: number | null) => v ? <Rate disabled value={v / 2} /> : '-',
    },
    {
      title: '经理评分',
      dataIndex: 'manager_rating',
      key: 'manager_rating',
      render: (v: number | null) => v ? <Rate disabled value={v / 2} /> : '-',
    },
    {
      title: '综合评分',
      dataIndex: 'overall_rating',
      key: 'overall_rating',
      render: (v: number | null) => v ? `${v}/10` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v]}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Review) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setSelectedItem(record)
              setDetailVisible(true)
            }}
          >
            详情
          </Button>

          {record.status === 'self_assessment' && user?.id === record.user.id && (
            <Button
              type="link"
              onClick={() => {
                setSelectedItem(record)
                Modal.confirm({
                  title: '提交自评',
                  icon: <CheckOutlined />,
                  content: (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <Text>自评分数 (1-10分):</Text>
                        <br />
                        <Rate
                          defaultValue={record.self_rating ? record.self_rating / 2 : 0}
                          onChange={(v) => selfRatingRef.current = v * 2}
                        />
                      </div>
                      <div>
                        <Text>自评评语:</Text>
                        <TextArea
                          rows={3}
                          defaultValue={record.self_comments || ''}
                          onChange={(e) => selfCommentsRef.current = e.target.value}
                        />
                      </div>
                    </div>
                  ),
                  onOk: () => handleSelfSubmit(
                    record.id,
                    (selfRatingRef.current as any) || record.self_rating || 5,
                    (selfCommentsRef.current as any) || ''
                  ),
                })
              }}
            >
              提交自评
            </Button>
          )}

          {isManager && record.status === 'manager_review' && (
            <Button
              type="link"
              onClick={() => {
                Modal.confirm({
                  title: '经理评估',
                  icon: <CheckOutlined />,
                  content: (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <Text>评分 (1-10分):</Text>
                        <br />
                        <Rate
                          defaultValue={record.manager_rating ? record.manager_rating / 2 : 0}
                          onChange={(v) => managerRatingRef.current = v * 2}
                        />
                      </div>
                      <div>
                        <Text>评估评语:</Text>
                        <TextArea
                          rows={3}
                          defaultValue={record.manager_comments || ''}
                          onChange={(e) => managerCommentsRef.current = e.target.value}
                        />
                      </div>
                    </div>
                  ),
                  onOk: () => handleManagerSubmit(
                    record.id,
                    (managerRatingRef.current as any) || record.manager_rating || 5,
                    (managerCommentsRef.current as any) || ''
                  ),
                })
              }}
            >
              经理评估
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const selfRatingRef = { current: 5 }
  const selfCommentsRef = { current: '' }
  const managerRatingRef = { current: 5 }
  const managerCommentsRef = { current: '' }

  const steps = [
    { title: '创建', status: 'finish' as const },
    { title: '自评', status: 'process' as const },
    { title: '经理评估', status: 'wait' as const },
    { title: '完成', status: 'wait' as const },
  ]

  return (
    <div>
      <Title level={3}>绩效评估</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          {isManager && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              创建评估
            </Button>
          )}
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ showSizeChanger: true }}
        />
      </Card>

      <Modal
        title="创建绩效评估"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="user_id" label="被评估人" rules={[{ required: true }]}>
            <Select
              options={employees.map((e: any) => ({ value: e.user.id, label: e.user.name }))}
              placeholder="选择员工"
            />
          </Form.Item>

          <Form.Item name="reviewer_id" label="评估人(经理)" rules={[{ required: true }]}>
            <Select
              options={employees.map((e: any) => ({ value: e.user.id, label: e.user.name }))}
              placeholder="选择经理"
            />
          </Form.Item>

          <Form.Item name="period" label="评估周期" rules={[{ required: true }]}>
            <Select options={periodOptions} placeholder="选择周期" />
          </Form.Item>

          <Form.Item name="type" label="评估类型" rules={[{ required: true }]}>
            <Select options={typeOptions} placeholder="选择类型" />
          </Form.Item>

          <Form.Item name="goals" label="绩效目标">
            <TextArea rows={4} placeholder="请填写本周期的绩效目标" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="绩效评估详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedItem && (
          <div>
            <Steps
              current={
                selectedItem.status === 'draft' ? 0 :
                selectedItem.status === 'self_assessment' ? 1 :
                selectedItem.status === 'manager_review' ? 2 : 3
              }
              items={steps}
              style={{ marginBottom: 24 }}
            />

            <Descriptions bordered column={2}>
              <Descriptions.Item label="被评估人">{selectedItem.user.name}</Descriptions.Item>
              <Descriptions.Item label="评估人">{selectedItem.reviewer?.name || '待指定'}</Descriptions.Item>
              <Descriptions.Item label="评估类型">
                {typeOptions.find(t => t.value === selectedItem.type)?.label}
              </Descriptions.Item>
              <Descriptions.Item label="评估周期">{selectedItem.period}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="综合评分">
                {selectedItem.overall_rating ? `${selectedItem.overall_rating}/10` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="绩效目标" span={2}>
                {selectedItem.goals || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="自评分" span={2}>
                {selectedItem.self_rating ? (
                  <div>
                    <Rate disabled value={selectedItem.self_rating / 2} />
                    <div style={{ marginTop: 8 }}>{selectedItem.self_comments || '-'}</div>
                  </div>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="经理评分" span={2}>
                {selectedItem.manager_rating ? (
                  <div>
                    <Rate disabled value={selectedItem.manager_rating / 2} />
                    <div style={{ marginTop: 8 }}>{selectedItem.manager_comments || '-'}</div>
                  </div>
                ) : '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PerformanceReviews
