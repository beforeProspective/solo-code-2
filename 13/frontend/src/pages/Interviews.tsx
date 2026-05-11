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
  TimePicker,
  Row,
  Col,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

interface Interview {
  id: number
  applicant: { id: number; name: string }
  interviewer: { id: number; name: string } | null
  interview_date: string
  interview_time: string
  type: string
  location: string
  notes: string | null
  result: string | null
  feedback: string | null
  status: string
  created_at: string
}

const statusColor: Record<string, string> = {
  scheduled: 'blue',
  in_progress: 'orange',
  completed: 'green',
  cancelled: 'red',
  rescheduled: 'yellow',
}

const statusLabel: Record<string, string> = {
  scheduled: '已安排',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  rescheduled: '已改期',
}

const typeOptions = [
  { value: 'phone', label: '电话面试' },
  { value: 'video', label: '视频面试' },
  { value: 'in_person', label: '现场面试' },
  { value: 'group', label: '群面' },
  { value: 'technical', label: '技术面试' },
  { value: 'final', label: '终面' },
]

const resultOptions = [
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '未通过' },
  { value: 'pending', label: '待定' },
]

const Interviews = () => {
  const [data, setData] = useState<Interview[]>([])
  const [applicants, setApplicants] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<Interview | null>(null)
  const [selectedItem, setSelectedItem] = useState<Interview | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [intRes, appRes, empRes] = await Promise.all([
        api.get('/recruitment/interviews'),
        api.get('/recruitment/applicants'),
        api.get('/employees'),
      ])
      setData(intRes.data.data || intRes.data)
      setApplicants(appRes.data.data || appRes.data)
      setEmployees(empRes.data.data || empRes.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({ status: 'scheduled' })
    setModalVisible(true)
  }

  const handleEdit = (item: Interview) => {
    setEditingItem(item)
    form.setFieldsValue({
      applicant_id: item.applicant?.id,
      interviewer_id: item.interviewer?.id,
      interview_date: item.interview_date ? dayjs(item.interview_date) : null,
      interview_time: item.interview_time ? dayjs(item.interview_time, 'HH:mm') : null,
      type: item.type,
      location: item.location,
      notes: item.notes,
      result: item.result,
      feedback: item.feedback,
      status: item.status,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        interview_date: values.interview_date?.format('YYYY-MM-DD'),
        interview_time: values.interview_time?.format('HH:mm'),
      }

      if (editingItem) {
        await api.put(`/recruitment/interviews/${editingItem.id}`, payload)
        message.success('面试安排更新成功')
      } else {
        await api.post('/recruitment/interviews', payload)
        message.success('面试安排创建成功')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/recruitment/interviews/${id}`)
      message.success('已取消')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '候选人',
      dataIndex: ['applicant', 'name'],
      key: 'applicant',
    },
    {
      title: '面试类型',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => typeOptions.find(t => t.value === v)?.label || v,
    },
    {
      title: '日期',
      dataIndex: 'interview_date',
      key: 'interview_date',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '时间',
      dataIndex: 'interview_time',
      key: 'interview_time',
    },
    {
      title: '地点',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: '面试官',
      dataIndex: ['interviewer', 'name'],
      key: 'interviewer',
      render: (v: string) => v || '-',
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      render: (v: string | null) => {
        if (!v) return <Tag>-</Tag>
        const map: Record<string, string> = { pass: 'green', fail: 'red', pending: 'orange' }
        const labels: Record<string, string> = { pass: '通过', fail: '未通过', pending: '待定' }
        return <Tag color={map[v]}>{labels[v]}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v]}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Interview) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedItem(record)
              setDetailVisible(true)
            }}
          >
            查看
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定取消此面试安排？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>取消</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>面试安排</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            安排面试
          </Button>
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
        title={editingItem ? '编辑面试安排' : '安排面试'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="applicant_id" label="候选人" rules={[{ required: true }]}>
                <Select
                  options={applicants.map((a: any) => ({ value: a.id, label: a.name }))}
                  placeholder="选择候选人"
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="interviewer_id" label="面试官">
                <Select
                  options={employees.map((e: any) => ({ value: e.user.id, label: e.user.name }))}
                  placeholder="选择面试官"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="interview_date" label="面试日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="interview_time" label="面试时间" rules={[{ required: true }]}>
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="type" label="面试类型" rules={[{ required: true }]}>
                <Select options={typeOptions} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="location" label="面试地点" rules={[{ required: true }]}>
            <Input placeholder="例如：3楼302会议室" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="status" label="状态">
                <Select
                  options={Object.entries(statusLabel).map(([v, l]) => ({ value: v, label: l }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="result" label="面试结果">
                <Select options={resultOptions} placeholder="面试后填写" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="面试备注">
            <TextArea rows={2} placeholder="面试前准备事项" />
          </Form.Item>

          <Form.Item name="feedback" label="面试反馈">
            <TextArea rows={3} placeholder="面试后填写反馈" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="面试详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedItem && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="候选人">{selectedItem.applicant?.name}</Descriptions.Item>
            <Descriptions.Item label="面试官">{selectedItem.interviewer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="日期">
              {dayjs(selectedItem.interview_date).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="时间">{selectedItem.interview_time}</Descriptions.Item>
            <Descriptions.Item label="类型">
              {typeOptions.find(t => t.value === selectedItem.type)?.label}
            </Descriptions.Item>
            <Descriptions.Item label="地点">{selectedItem.location}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="结果">
              {selectedItem.result ? resultOptions.find(r => r.value === selectedItem.result)?.label : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.notes || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="反馈" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.feedback || '-'}</Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default Interviews
