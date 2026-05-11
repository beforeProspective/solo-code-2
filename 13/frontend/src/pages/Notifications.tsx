import { useEffect, useState } from 'react'
import {
  List,
  Card,
  Tag,
  Button,
  Typography,
  Space,
  message,
  Empty,
  Avatar,
  Checkbox,
  Spin,
} from 'antd'
import {
  BellOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  MailOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import api from '@/utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface NotificationItem {
  id: number
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
  related_type: string | null
  related_id: number | null
}

const typeIcon: Record<string, any> = {
  info: <InfoCircleOutlined />,
  success: <CheckCircleOutlined />,
  warning: <WarningOutlined />,
  error: <ExclamationCircleOutlined />,
  mail: <MailOutlined />,
}

const typeColor: Record<string, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
  mail: 'purple',
}

const Notifications = () => {
  const [data, setData] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/notifications')
      setData(res.data.data || res.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`)
      setData(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read')
      setData(prev => prev.map(n => ({ ...n, is_read: true })))
      message.success('全部已读')
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`)
      setData(prev => prev.filter(n => n.id !== id))
      message.success('已删除')
    } catch (error) {
      message.error('删除失败')
    }
  }

  const filteredData = data.filter(n => {
    if (filter === 'unread') return !n.is_read
    if (filter === 'read') return n.is_read
    return true
  })

  return (
    <div>
      <Title level={3}>通知中心</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button.Group>
            <Button type={filter === 'all' ? 'primary' : 'default'} onClick={() => setFilter('all')}>
              全部
            </Button>
            <Button type={filter === 'unread' ? 'primary' : 'default'} onClick={() => setFilter('unread')}>
              未读
            </Button>
            <Button type={filter === 'read' ? 'primary' : 'default'} onClick={() => setFilter('read')}>
              已读
            </Button>
          </Button.Group>
          <Button icon={<CheckCircleOutlined />} onClick={handleMarkAllRead}>
            全部标记已读
          </Button>
        </Space>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : filteredData.length === 0 ? (
          <Empty description="暂无通知" />
        ) : (
          <List
            dataSource={filteredData}
            renderItem={(item) => (
              <List.Item
                style={{
                  background: item.is_read ? '#fff' : '#f0f7ff',
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 8,
                }}
                actions={[
                  !item.is_read && (
                    <Button
                      type="link"
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleMarkRead(item.id)}
                    >
                      标记已读
                    </Button>
                  ),
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(item.id)}
                  >
                    删除
                  </Button>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      style={{ backgroundColor: typeColor[item.type] }}
                      icon={typeIcon[item.type] || <BellOutlined />}
                    />
                  }
                  title={
                    <Space>
                      <Text strong={!item.is_read}>{item.title}</Text>
                      {!item.is_read && <Tag color="blue" style={{ marginLeft: 8 }}>新</Tag>}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(item.created_at).format('MM-DD HH:mm')}
                      </Text>
                    </Space>
                  }
                  description={item.message}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}

export default Notifications
