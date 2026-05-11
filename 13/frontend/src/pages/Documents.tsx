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
  Upload,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileZipOutlined,
} from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'
import { useAppSelector } from '@/store'

const { Title, Text } = Typography

interface DocumentItem {
  id: number
  title: string
  description: string | null
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  category: { id: number; name: string } | null
  uploaded_by: { id: number; name: string }
  is_public: boolean
  downloads: number
  created_at: string
}

const fileTypeIcon: Record<string, any> = {
  pdf: <FilePdfOutlined />,
  doc: <FileTextOutlined />,
  docx: <FileTextOutlined />,
  xls: <FileExcelOutlined />,
  xlsx: <FileExcelOutlined />,
  ppt: <FileTextOutlined />,
  pptx: <FileTextOutlined />,
  jpg: <FileImageOutlined />,
  jpeg: <FileImageOutlined />,
  png: <FileImageOutlined />,
  zip: <FileZipOutlined />,
  rar: <FileZipOutlined />,
  txt: <FileTextOutlined />,
}

const Documents = () => {
  const [data, setData] = useState<DocumentItem[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<DocumentItem | null>(null)
  const [form] = Form.useForm()
  const { user } = useAppSelector((state) => state.auth)

  const canManage = user && ['admin', 'hr', 'manager'].includes(user.role)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [docRes, catRes] = await Promise.all([
        api.get('/documents'),
        api.get('/documents/categories'),
      ])
      setData(docRes.data.data || docRes.data)
      setCategories(catRes.data || catRes)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({ is_public: false })
    setModalVisible(true)
  }

  const handleEdit = (item: DocumentItem) => {
    setEditingItem(item)
    form.setFieldsValue({
      title: item.title,
      description: item.description,
      category_id: item.category?.id,
      is_public: item.is_public,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingItem) {
        await api.put(`/documents/${editingItem.id}`, values)
        message.success('文档更新成功')
      } else {
        message.success('请通过上传按钮添加文件')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/documents/${id}`)
      message.success('已删除')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const handleDownload = async (item: DocumentItem) => {
    try {
      const res = await api.get(`/documents/${item.id}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = item.file_name
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (error) {
      message.error('下载失败')
    }
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return fileTypeIcon[ext] || <FileTextOutlined />
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, record: DocumentItem) => (
        <Space>
          {getFileIcon(record.file_name)}
          <span>{v}</span>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: ['category', 'name'],
      key: 'category',
      render: (v: string) => v ? <Tag icon={<FolderOpenOutlined />}>{v}</Tag> : '-',
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (v: number) => formatSize(v),
    },
    {
      title: '上传者',
      dataIndex: ['uploaded_by', 'name'],
      key: 'uploaded_by',
    },
    {
      title: '下载次数',
      dataIndex: 'downloads',
      key: 'downloads',
    },
    {
      title: '公开',
      dataIndex: 'is_public',
      key: 'is_public',
      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag color="default">否</Tag>,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DocumentItem) => (
        <Space>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
            下载
          </Button>
          {canManage && (
            <>
              <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                编辑
              </Button>
              <Popconfirm title="确定删除此文档？" onConfirm={() => handleDelete(record.id)}>
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
      <Title level={3}>文档管理</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          {canManage && (
            <>
              <Upload
                action="/api/documents/upload"
                headers={{ Authorization: `Bearer ${localStorage.getItem('token')}` }}
                method="post"
                name="file"
                data={{ title: '上传文件', is_public: false }}
                onChange={(info) => {
                  if (info.file.status === 'done') {
                    message.success('文件上传成功')
                    fetchData()
                  } else if (info.file.status === 'error') {
                    message.error('文件上传失败')
                  }
                }}
              >
                <Button type="primary" icon={<UploadOutlined />}>
                  上传文件
                </Button>
              </Upload>
            </>
          )}
        </Space>

        {data.length === 0 ? (
          <Empty description="暂无文档" />
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
        title={editingItem ? '编辑文档' : '添加文档'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="文件名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="category_id" label="分类">
            <Select
              options={categories.map((c: any) => ({ value: c.id, label: c.name }))}
              placeholder="选择分类"
            />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="is_public" label="公开访问" valuePropName="checked">
            <Select
              options={[
                { value: true, label: '是 (所有用户可见)' },
                { value: false, label: '否 (仅特定用户可见)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Documents
