import { useEffect, useState } from 'react'
import { Card, Typography, Spin, Tree, Empty, Avatar, Tag, Space, List } from 'antd'
import { TeamOutlined, UserOutlined } from '@ant-design/icons'
import api from '@/utils/api'

const { Title, Text } = Typography

interface OrgNode {
  id: number
  name: string
  description: string | null
  manager: { id: number; name: string } | null
  parent_id: number | null
  children?: OrgNode[]
  employees: {
    id: number
    name: string
    title: string | null
  }[]
}

const OrgChart = () => {
  const [treeData, setTreeData] = useState<OrgNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await api.get('/employees/org-chart')
      setTreeData(res.data || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const convertToTreeNodes = (nodes: OrgNode[]): any[] => {
    return nodes.map(node => ({
      key: node.id,
      title: (
        <div style={{ padding: '4px 0' }}>
          <Space>
            <TeamOutlined />
            <strong>{node.name}</strong>
            {node.manager && (
              <Tag color="blue">{node.manager.name}</Tag>
            )}
            <Tag>{node.employees.length}人</Tag>
          </Space>
        </div>
      ),
      children: node.children ? convertToTreeNodes(node.children) : [],
      data: node,
    }))
  }

  const handleSelect = (selectedKeys: React.Key[], info: any) => {
    if (info.node) {
      setSelectedNode(info.node.data as OrgNode)
    }
  }

  return (
    <div>
      <Title level={3}>组织结构图</Title>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>
          <Card style={{ flex: 1 }} title="组织架构">
            {treeData.length === 0 ? (
              <Empty description="暂无组织结构数据" />
            ) : (
              <Tree
                defaultExpandAll
                onSelect={handleSelect}
                treeData={convertToTreeNodes(treeData)}
              />
            )}
          </Card>

          <Card style={{ width: 400 }} title={selectedNode ? selectedNode.name : '部门详情'}>
            {selectedNode ? (
              <div>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>部门描述</Text>
                  <Text type="secondary">{selectedNode.description || '暂无描述'}</Text>

                  <Text strong>部门经理</Text>
                  <Text>{selectedNode.manager?.name || '未指定'}</Text>

                  <Text strong>部门员工 ({selectedNode.employees.length}人)</Text>
                  <List
                    dataSource={selectedNode.employees}
                    renderItem={(emp) => (
                      <List.Item>
                        <Space>
                          <Avatar icon={<UserOutlined />} />
                          <div>
                            <div>{emp.name}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {emp.title || '员工'}
                            </Text>
                          </div>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Space>
              </div>
            ) : (
              <Empty description="请选择一个部门查看详情" />
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

export default OrgChart
