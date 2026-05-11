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
  InputNumber,
  Row,
  Col,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

interface Job {
  id: number
  title: string
  description: string
  department: { id: number; name: string } | null
  employment_type: string
  location: string
  salary_min: number | null
  salary_max: number | null
  requirements: string | null
  benefits: string | null
  status: string
  deadline: string | null
  created_at: string
}

const statusColor: Record<string, string> = {
  draft: 'default',
  active: 'green',
  closed: 'red',
  on_hold: 'orange',
}

const statusLabel: Record<string, string> = {
  draft: '草稿',
  active: '招聘中',
  closed: '已关闭',
  on_hold: '暂停',
}

const typeOptions = [
  { value: 'full_time', label: '全职' },
  { value: 'part_time', label: '兼职' },
  { value: 'contract', label: '合同' },
  { value: 'intern', label: '实习' },
  { value: 'temporary', label: '临时' },
]

const RecruitmentJobs = () => {
  const [data, setData] = useState<Job[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<Job | null>(null)
  const [selectedItem, setSelectedItem] = useState<Job | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [jobRes, deptRes] = await Promise.all([
        api.get('/recruitment/jobs'),
        api.get('/departments'),
      ])
      setData(jobRes.data.data || jobRes.data)
      setDepartments(deptRes.data.data || deptRes.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({ status: 'draft' })
    setModalVisible(true)
  }

  const handleEdit = (item: Job) => {
    setEditingItem(item)
    form.setFieldsValue({
      title: item.title,
      description: item.description,
      department_id: item.department?.id,
      employment_type: item.employment_type,
      location: item.location,
      salary_min: item.salary_min,
      salary_max: item.salary_max,
      requirements: item.requirements,
      benefits: item.benefits,
      status: item.status,
      deadline: item.deadline ? dayjs(item.deadline) : null,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        deadline: values.deadline?.format('YYYY-MM-DD'),
      }

      if (editingItem) {
        await api.put(`/recruitment/jobs/${editingItem.id}`, payload)
        message.success('职位更新成功')
      } else {
        await api.post('/recruitment/jobs', payload)
        message.success('职位发布成功')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/recruitment/jobs/${id}`)
      message.success('职位已删除')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '职位名称',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '部门',
      dataIndex: ['department', 'name'],
      key: 'department',
      render: (v: string) => v || '-',
    },
    {
      title: '用工类型',
      dataIndex: 'employment_type',
      key: 'employment_type',
      render: (v: string) => typeOptions.find(t => t.value === v)?.label || v,
    },
    {
      title: '工作地点',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: '薪资范围',
      key: 'salary',
      render: (_: any, record: Job) => (
        record.salary_min && record.salary_max
          ? `¥${record.salary_min.toLocaleString()} - ¥${record.salary_max.toLocaleString()}`
          : '-'
      ),
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
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
      render: (_: any, record: Job) => (
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
          <Popconfirm title="确定删除此职位？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>职位发布</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            发布新职位
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
        title={editingItem ? '编辑职位' : '发布职位'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Space.Compact block style={{ marginBottom: 16 }}>
            <Form.Item name="title" label="职位名称" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="例如：高级前端工程师" />
            </Form.Item>
          </Space.Compact>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="department_id" label="部门">
                <Select
                  options={departments.map((d: any) => ({ value: d.id, label: d.name }))}
                  placeholder="选择部门"
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="employment_type" label="用工类型" rules={[{ required: true }]}>
                <Select options={typeOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="location" label="工作地点" rules={[{ required: true }]}>
                <Input placeholder="例如：北京" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="salary_min" label="薪资下限">
                <InputNumber style={{ width: '100%' }} min={0} addonBefore="¥" placeholder="0" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="salary_max" label="薪资上限">
                <InputNumber style={{ width: '100%' }} min={0} addonBefore="¥" placeholder="0" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="deadline" label="截止日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="职位描述" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="请详细描述职位职责" />
          </Form.Item>

          <Form.Item name="requirements" label="任职要求">
            <TextArea rows={3} placeholder="请列出任职要求" />
          </Form.Item>

          <Form.Item name="benefits" label="福利待遇">
            <TextArea rows={2} placeholder="请列出福利待遇" />
          </Form.Item>

          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'active', label: '发布中' },
                { value: 'on_hold', label: '暂停' },
                { value: 'closed', label: '已关闭' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="职位详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedItem && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="职位名称" span={2}>{selectedItem.title}</Descriptions.Item>
            <Descriptions.Item label="部门">{selectedItem.department?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="用工类型">
              {typeOptions.find(t => t.value === selectedItem.employment_type)?.label}
            </Descriptions.Item>
            <Descriptions.Item label="工作地点">{selectedItem.location}</Descriptions.Item>
            <Descriptions.Item label="薪资范围">
              {selectedItem.salary_min && selectedItem.salary_max
                ? `¥${selectedItem.salary_min.toLocaleString()} - ¥${selectedItem.salary_max.toLocaleString()}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="截止日期">
              {selectedItem.deadline ? dayjs(selectedItem.deadline).format('YYYY-MM-DD') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="发布时间">
              {dayjs(selectedItem.created_at).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="职位描述" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.description}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="任职要求" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.requirements || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="福利待遇" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.benefits || '-'}</Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default RecruitmentJobs
