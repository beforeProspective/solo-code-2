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
  Upload,
  Row,
  Col,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

interface Applicant {
  id: number
  name: string
  email: string
  phone: string
  job_posting: { id: number; title: string } | null
  status: string
  resume_url: string | null
  cover_letter: string | null
  experience: string | null
  education: string | null
  skills: string | null
  applied_at: string
}

const statusColor: Record<string, string> = {
  new: 'blue',
  reviewing: 'orange',
  shortlisted: 'green',
  interview: 'cyan',
  offered: 'purple',
  hired: 'success',
  rejected: 'red',
  withdrawn: 'default',
}

const statusLabel: Record<string, string> = {
  new: '新申请',
  reviewing: '筛选中',
  shortlisted: '已入围',
  interview: '面试中',
  offered: '已发offer',
  hired: '已录用',
  rejected: '已拒绝',
  withdrawn: '已撤回',
}

const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({ value, label }))

const Applicants = () => {
  const [data, setData] = useState<Applicant[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<Applicant | null>(null)
  const [selectedItem, setSelectedItem] = useState<Applicant | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [appRes, jobRes] = await Promise.all([
        api.get('/recruitment/applicants'),
        api.get('/recruitment/jobs'),
      ])
      setData(appRes.data.data || appRes.data)
      setJobs(jobRes.data.data || jobRes.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({ status: 'new' })
    setModalVisible(true)
  }

  const handleEdit = (item: Applicant) => {
    setEditingItem(item)
    form.setFieldsValue({
      name: item.name,
      email: item.email,
      phone: item.phone,
      job_posting_id: item.job_posting?.id,
      status: item.status,
      cover_letter: item.cover_letter,
      experience: item.experience,
      education: item.education,
      skills: item.skills,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingItem) {
        await api.put(`/recruitment/applicants/${editingItem.id}`, values)
        message.success('简历更新成功')
      } else {
        await api.post('/recruitment/applicants', values)
        message.success('简历创建成功')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/recruitment/applicants/${id}`)
      message.success('已删除')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '应聘职位',
      dataIndex: ['job_posting', 'title'],
      key: 'job',
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v]}</Tag>,
    },
    {
      title: '申请时间',
      dataIndex: 'applied_at',
      key: 'applied_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Applicant) => (
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
          <Popconfirm title="确定删除此简历？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>简历管理</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建简历
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
        title={editingItem ? '编辑简历' : '新建简历'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="phone" label="电话" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="job_posting_id" label="应聘职位">
                <Select
                  options={jobs.map((j: any) => ({ value: j.id, label: j.title }))}
                  placeholder="选择职位"
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                <Select options={statusOptions} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="experience" label="工作经验">
            <TextArea rows={2} placeholder="描述工作经验" />
          </Form.Item>

          <Form.Item name="education" label="教育背景">
            <TextArea rows={2} placeholder="描述教育背景" />
          </Form.Item>

          <Form.Item name="skills" label="技能特长">
            <TextArea rows={2} placeholder="描述技能特长" />
          </Form.Item>

          <Form.Item name="cover_letter" label="求职信">
            <TextArea rows={3} placeholder="填写求职信" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="简历详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedItem && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="姓名">{selectedItem.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="邮箱">{selectedItem.email}</Descriptions.Item>
            <Descriptions.Item label="电话">{selectedItem.phone}</Descriptions.Item>
            <Descriptions.Item label="应聘职位">{selectedItem.job_posting?.title || '-'}</Descriptions.Item>
            <Descriptions.Item label="申请时间">
              {dayjs(selectedItem.applied_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="工作经验" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.experience || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="教育背景" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.education || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="技能特长" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.skills || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="求职信" span={2}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.cover_letter || '-'}</Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default Applicants
