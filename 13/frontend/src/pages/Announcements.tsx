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
  Empty,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'
import { useAppSelector } from '@/store'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface Announcement {
  id: number
  title: string
  content: string
  author: { id: number; name: string }
  type: string
  priority: string
  is_pinned: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
}

const typeColor: Record<string, string> = {
  notice: 'blue',
  event: 'cyan',
  policy: 'green',
  emergency: 'red',
  general: 'default',
}

const typeLabel: Record<string, string> = {
  notice: '通知',
  event: '活动',
  policy: '政策',
  emergency: '紧急',
  general: '一般',
}

const priorityColor: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
}

const priorityLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
}

const Announcements = () => {
  const [data, setData] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<Announcement | null>(null)
  const [selectedItem, setSelectedItem] = useState<Announcement | null>(null)
  const [form] = Form.useForm()
  const { user } = useAppSelector((state) => state.auth)

  const canManage = user && ['admin', 'hr'].includes(user.role)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/announcements')
      setData(res.data.data || res.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({ type: 'general', priority: 'medium', is_pinned: false })
    setModalVisible(true)
  }

  const handleEdit = (item: Announcement) => {
    setEditingItem(item)
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      type: item.type,
      priority: item.priority,
      is_pinned: item.is_pinned,
      published_at: item.published_at ? dayjs(item.published_at) : null,
      expires_at: item.expires_at ? dayjs(item.expires_at) : null,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        published_at: values.published_at?.format('YYYY-MM-DD HH:mm:ss'),
        expires_at: values.expires_at?.format('YYYY-MM-DD HH:mm:ss'),
      }

      if (editingItem) {
        await api.put(`/announcements/${editingItem.id}`, payload)
        message.success('公告更新成功')
      } else {
        await api.post('/announcements', payload)
        message.success('公告发布成功')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/announcements/${id}`)
      message.success('已删除')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, record: Announcement) => (
        <Space>
          {record.is_pinned && <Tag color="red">置顶</Tag>}
          <span>{v}</span>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => <Tag color={typeColor[v]}>{typeLabel[v]}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (v: string) => <Tag color={priorityColor[v]}>{priorityLabel[v]}</Tag>,
    },
    {
      title: '作者',
      dataIndex: ['author', 'name'],
      key: 'author',
    },
    {
      title: '发布时间',
      dataIndex: 'published_at',
      key: 'published_at',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '草稿',
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Announcement) => (
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
          {canManage && (
            <>
              <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                编辑
              </Button>
              <Popconfirm title="确定删除此公告？" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>公告与通知</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              发布公告
            </Button>
          )}
        </Space>

        {data.length === 0 ? (
          <Empty description="暂无公告" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ showSizeChanger: true }}
          />
        )}
      </Card>

      <Modal
        title={editingItem ? '编辑公告' : '发布公告'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input placeholder="请输入公告标题" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select options={Object.entries(typeLabel).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
                <Select options={Object.entries(priorityLabel).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
                <Select
                  options={[
                    { value: true, label: '是' },
                    { value: false, label: '否' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="published_at" label="发布时间">
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="expires_at" label="过期时间">
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <TextArea rows={8} placeholder="请输入公告内容" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="公告详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedItem && (
          <div>
            <Space style={{ marginBottom: 16 }}>
              {selectedItem.is_pinned && <Tag color="red">置顶</Tag>}
              <Tag color={typeColor[selectedItem.type]}>{typeLabel[selectedItem.type]}</Tag>
              <Tag color={priorityColor[selectedItem.priority]}>{priorityLabel[selectedItem.priority]}</Tag>
            </Space>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="发布者">{selectedItem.author?.name}</Descriptions.Item>
              <Descriptions.Item label="发布时间">
                {selectedItem.published_at ? dayjs(selectedItem.published_at).format('YYYY-MM-DD HH:mm') : '草稿'}
              </Descriptions.Item>
              <Descriptions.Item label="过期时间">
                {selectedItem.expires_at ? dayjs(selectedItem.expires_at).format('YYYY-MM-DD') : '永不过期'}
              </Descriptions.Item>
            </Descriptions>
            <Card style={{ marginTop: 16 }}>
              <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selectedItem.content}</Paragraph>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Announcements
