<template>
  <div class="flow-editor">
    <div class="editor-header">
      <div>
        <h2>{{ flow?.name || '流程编辑器' }}</h2>
        <p class="desc">{{ flow?.description || '' }}</p>
      </div>
      <div class="header-actions">
        <span class="help-text" v-if="connectingFrom">🔗 请点击目标节点的左侧输入端口完成连线，或按 ESC 取消</span>
        <button class="btn btn-secondary" @click="backToList">返回列表</button>
        <button class="btn btn-primary" @click="testFlow">测试流程</button>
      </div>
    </div>

    <div class="editor-layout">
      <div class="sidebar">
        <h3>节点类型 <span class="hint">（点击或拖拽）</span></h3>
        <div class="node-templates">
          <div class="node-template" draggable="true" 
            @dragstart="dragStart($event, 'message')"
            @click="createNodeByClick('message')">
            <span class="node-icon">💬</span>
            <span>消息节点</span>
          </div>
          <div class="node-template" draggable="true" 
            @dragstart="dragStart($event, 'input')"
            @click="createNodeByClick('input')">
            <span class="node-icon">✏️</span>
            <span>输入节点</span>
          </div>
          <div class="node-template" draggable="true" 
            @dragstart="dragStart($event, 'confirm')"
            @click="createNodeByClick('confirm')">
            <span class="node-icon">❓</span>
            <span>确认节点</span>
          </div>
          <div class="node-template" draggable="true" 
            @dragstart="dragStart($event, 'end')"
            @click="createNodeByClick('end')">
            <span class="node-icon">🏁</span>
            <span>结束节点</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="node-properties" v-if="selectedNode">
          <div class="properties-header">
            <h3>节点属性</h3>
            <button class="btn-close" @click="selectedNode = null">×</button>
          </div>
          <div class="form-group">
            <label>节点标签</label>
            <input v-model="selectedNode.label" @change="updateNode" />
          </div>
          <div class="form-group">
            <label>消息内容</label>
            <textarea v-model="selectedNode.content" @change="updateNode" rows="3"></textarea>
          </div>
          <div class="form-group" v-if="selectedNode.node_type === 'input'">
            <label>字段名称</label>
            <input v-model="selectedNode.field_name" @change="updateNode" placeholder="如: name, email" />
          </div>
          <div class="form-group">
            <label>设为起始节点</label>
            <input type="checkbox" :checked="isStartNode" @change="setStartNode" />
          </div>
          <button class="btn btn-danger" @click="deleteSelectedNode">删除节点</button>
        </div>

        <div class="node-properties" v-else-if="selectedEdge">
          <div class="properties-header">
            <h3>连线属性</h3>
            <button class="btn-close" @click="selectedEdge = null">×</button>
          </div>
          <p class="edge-info">从 {{ getNodeLabel(selectedEdge.source) }} → {{ getNodeLabel(selectedEdge.target) }}</p>
          <button class="btn btn-danger" @click="deleteSelectedEdge">删除连线</button>
        </div>

        <div class="tips" v-else>
          <h3>操作提示</h3>
          <ul>
            <li><strong>点击</strong>左侧节点快速创建</li>
            <li>或<strong>拖拽</strong>到画布指定位置</li>
            <li>点击节点右侧端口开始连线</li>
            <li>点击另一节点左侧端口完成连线</li>
            <li>点击连线可选中并删除</li>
            <li>拖拽节点可调整位置</li>
          </ul>
        </div>
      </div>

      <div class="canvas-container" 
        ref="canvasRef"
        @drop="drop" 
        @dragover="onDragOver"
        @click="onCanvasClick"
        @keydown.esc="cancelConnecting"
        tabindex="0">
        <svg class="edges-layer">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
            </marker>
            <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#4f46e5" />
            </marker>
          </defs>

          <line v-for="edge in edges" :key="edge.id"
            :x1="getEdgeStartPos(edge).x" 
            :y1="getEdgeStartPos(edge).y"
            :x2="getEdgeEndPos(edge).x" 
            :y2="getEdgeEndPos(edge).y"
            :stroke="selectedEdge?.id === edge.id ? '#4f46e5' : '#9ca3af'"
            :stroke-width="selectedEdge?.id === edge.id ? 3 : 2"
            :marker-end="selectedEdge?.id === edge.id ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'"
            class="edge-line"
            @click.stop="selectEdge(edge)" />

          <line v-if="connectingFrom && tempLineEnd"
            :x1="getConnectingStartPos().x"
            :y1="getConnectingStartPos().y"
            :x2="tempLineEnd.x"
            :y2="tempLineEnd.y"
            stroke="#4f46e5"
            stroke-width="2"
            stroke-dasharray="5,5"
            marker-end="url(#arrowhead)" />
        </svg>

        <div v-for="node in nodes" :key="node.id"
          class="flow-node"
          :class="{
            'node-message': node.node_type === 'message',
            'node-input': node.node_type === 'input',
            'node-confirm': node.node_type === 'confirm',
            'node-end': node.node_type === 'end',
            'selected': selectedNode?.id === node.id,
            'start-node': flow?.start_node_id === node.id,
            'connecting-target': connectingFrom && connectingFrom.node.id !== node.id
          }"
          :style="{ left: node.position_x + 'px', top: node.position_y + 'px' }"
          @mousedown="startDrag($event, node)"
          @click.stop="selectNode(node)">
          <div class="node-header">
            <span>{{ getNodeIcon(node.node_type) }} {{ node.label }}</span>
          </div>
          <div class="node-body">{{ node.content || '(无内容)' }}</div>
          
          <div class="port port-input" 
            :class="{ 'highlight': connectingFrom && connectingFrom.node.id !== node.id }"
            @click.stop="onInputPortClick(node)"
            title="输入端口 - 点击完成连线">
            <span class="port-label">入</span>
          </div>
          
          <div class="port port-output"
            :class="{ 'active': connectingFrom?.node.id === node.id && connectingFrom?.portType === 'output' }"
            @click.stop="onOutputPortClick(node, 'output')"
            title="输出端口 - 点击开始连线">
            <span class="port-label">出</span>
          </div>

          <div class="confirm-ports" v-if="node.node_type === 'confirm'">
            <div class="port port-yes"
              :class="{ 'active': connectingFrom?.node.id === node.id && connectingFrom?.portType === 'yes' }"
              @click.stop="onOutputPortClick(node, 'yes')"
              title="是 - 分支">
              是
            </div>
            <div class="port port-no"
              :class="{ 'active': connectingFrom?.node.id === node.id && connectingFrom?.portType === 'no' }"
              @click.stop="onOutputPortClick(node, 'no')"
              title="否 - 分支">
              否
            </div>
          </div>
        </div>

        <div class="canvas-hint" v-if="nodes.length === 0">
          💡 点击左侧节点类型快速创建，或拖拽到画布指定位置
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { flowApi } from '../api'

const route = useRoute()
const router = useRouter()

const flow = ref(null)
const nodes = ref([])
const edges = ref([])
const selectedNode = ref(null)
const selectedEdge = ref(null)
const draggingNode = ref(null)
const dragOffset = ref({ x: 0, y: 0 })
const connectingFrom = ref(null)
const tempLineEnd = ref(null)
const canvasRef = ref(null)
const dragNodeType = ref(null)

const isStartNode = computed(() => {
  return flow.value?.start_node_id === selectedNode.value?.id
})

const loadFlow = async () => {
  try {
    const res = await flowApi.get(route.params.id)
    flow.value = res.data
    nodes.value = res.data.nodes || []
    edges.value = res.data.edges || []
  } catch (e) {
    console.error('加载流程失败', e)
  }
}

const dragStart = (e, type) => {
  e.dataTransfer.setData('nodeType', type)
  e.dataTransfer.effectAllowed = 'copy'
  dragNodeType.value = type
}

const createNodeByClick = async (nodeType) => {
  const offsetX = 50 + nodes.value.length * 30
  const offsetY = 50 + nodes.value.length * 30
  
  const nodeData = {
    id: `node_${Date.now()}`,
    node_type: nodeType,
    label: getDefaultLabel(nodeType),
    content: getDefaultContent(nodeType),
    field_name: nodeType === 'input' ? 'field_' + Date.now() : null,
    position_x: offsetX,
    position_y: offsetY,
    flow_id: parseInt(route.params.id)
  }

  try {
    const res = await flowApi.addNode(route.params.id, nodeData)
    nodes.value.push(res.data)
    selectedNode.value = res.data
    selectedEdge.value = null
  } catch (e) {
    console.error('添加节点失败', e)
    alert('添加节点失败，请重试')
  }
}

const onDragOver = (e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

const drop = async (e) => {
  e.preventDefault()
  let nodeType = dragNodeType.value || e.dataTransfer.getData('nodeType')
  dragNodeType.value = null
  
  if (!nodeType) {
    console.warn('无法获取拖拽的节点类型')
    return
  }

  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left - 80
  const y = e.clientY - rect.top - 40

  const nodeData = {
    id: `node_${Date.now()}`,
    node_type: nodeType,
    label: getDefaultLabel(nodeType),
    content: getDefaultContent(nodeType),
    field_name: nodeType === 'input' ? 'field_' + Date.now() : null,
    position_x: Math.max(0, x),
    position_y: Math.max(0, y),
    flow_id: parseInt(route.params.id)
  }

  try {
    const res = await flowApi.addNode(route.params.id, nodeData)
    nodes.value.push(res.data)
  } catch (e) {
    console.error('添加节点失败', e)
    alert('添加节点失败，请重试')
  }
}

const getDefaultLabel = (type) => {
  const labels = { message: '消息', input: '输入', confirm: '确认', end: '结束' }
  return labels[type] || '节点'
}

const getDefaultContent = (type) => {
  const contents = {
    message: '欢迎使用聊天表单',
    input: '请输入您的信息',
    confirm: '确认提交吗？',
    end: '感谢您的参与！'
  }
  return contents[type] || ''
}

const getNodeIcon = (type) => {
  const icons = { message: '💬', input: '✏️', confirm: '❓', end: '🏁' }
  return icons[type] || '📦'
}

const getNodeLabel = (nodeId) => {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.label || '未知节点'
}

const startDrag = (e, node) => {
  if (e.target.classList.contains('port') || e.target.closest('.port')) return
  
  draggingNode.value = node
  dragOffset.value = {
    x: e.clientX - node.position_x,
    y: e.clientY - node.position_y
  }
  selectedNode.value = node
  selectedEdge.value = null

  const onMove = (ev) => {
    if (draggingNode.value) {
      draggingNode.value.position_x = Math.max(0, ev.clientX - dragOffset.value.x)
      draggingNode.value.position_y = Math.max(0, ev.clientY - dragOffset.value.y)
    }
  }

  const onUp = async () => {
    if (draggingNode.value) {
      try {
        await flowApi.updateNode(draggingNode.value.id, {
          position_x: draggingNode.value.position_x,
          position_y: draggingNode.value.position_y
        })
      } catch (e) {
        console.error('更新节点位置失败', e)
      }
    }
    draggingNode.value = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const selectNode = (node) => {
  if (!connectingFrom.value) {
    selectedNode.value = node
    selectedEdge.value = null
  }
}

const selectEdge = (edge) => {
  selectedEdge.value = edge
  selectedNode.value = null
}

const onOutputPortClick = (node, portType) => {
  if (connectingFrom.value && connectingFrom.value.node.id === node.id && connectingFrom.value.portType === portType) {
    connectingFrom.value = null
    tempLineEnd.value = null
  } else {
    connectingFrom.value = { node, portType }
    selectedNode.value = null
    selectedEdge.value = null
  }
}

const onInputPortClick = (node) => {
  if (connectingFrom.value && connectingFrom.value.node.id !== node.id) {
    createEdge(connectingFrom.value.node, node, connectingFrom.value.portType)
    connectingFrom.value = null
    tempLineEnd.value = null
  }
}

const onCanvasClick = (e) => {
  if (e.target === canvasRef.value || e.target.classList.contains('edges-layer')) {
    selectedNode.value = null
    selectedEdge.value = null
  }
}

const cancelConnecting = () => {
  connectingFrom.value = null
  tempLineEnd.value = null
}

const onMouseMove = (e) => {
  if (connectingFrom.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    tempLineEnd.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }
}

const updateNode = async () => {
  if (!selectedNode.value) return
  try {
    await flowApi.updateNode(selectedNode.value.id, {
      label: selectedNode.value.label,
      content: selectedNode.value.content,
      field_name: selectedNode.value.field_name
    })
  } catch (e) {
    console.error('更新节点失败', e)
  }
}

const setStartNode = async () => {
  if (!selectedNode.value) return
  try {
    await flowApi.update(route.params.id, {
      start_node_id: selectedNode.value.id
    })
    flow.value.start_node_id = selectedNode.value.id
  } catch (e) {
    console.error('设置起始节点失败', e)
  }
}

const deleteSelectedNode = async () => {
  if (!selectedNode.value) return
  if (confirm('确定删除此节点吗？相关连线也会被删除。')) {
    try {
      await flowApi.deleteNode(selectedNode.value.id)
      nodes.value = nodes.value.filter(n => n.id !== selectedNode.value.id)
      edges.value = edges.value.filter(e => e.source !== selectedNode.value.id && e.target !== selectedNode.value.id)
      selectedNode.value = null
    } catch (e) {
      console.error('删除节点失败', e)
    }
  }
}

const deleteSelectedEdge = async () => {
  if (!selectedEdge.value) return
  if (confirm('确定删除此连线吗？')) {
    try {
      await flowApi.deleteEdge(selectedEdge.value.id)
      edges.value = edges.value.filter(e => e.id !== selectedEdge.value.id)
      selectedEdge.value = null
    } catch (e) {
      console.error('删除连线失败', e)
    }
  }
}

const getEdgeStartPos = (edge) => {
  const node = nodes.value.find(n => n.id === edge.source)
  if (!node) return { x: 0, y: 0 }
  
  if (edge.source_handle === 'yes') {
    return { x: node.position_x + 160, y: node.position_y + 50 }
  } else if (edge.source_handle === 'no') {
    return { x: node.position_x + 160, y: node.position_y + 80 }
  }
  return { x: node.position_x + 160, y: node.position_y + 50 }
}

const getEdgeEndPos = (edge) => {
  const node = nodes.value.find(n => n.id === edge.target)
  if (!node) return { x: 0, y: 0 }
  return { x: node.position_x, y: node.position_y + 50 }
}

const getConnectingStartPos = () => {
  if (!connectingFrom.value) return { x: 0, y: 0 }
  const node = connectingFrom.value.node
  const portType = connectingFrom.value.portType
  
  if (portType === 'yes') {
    return { x: node.position_x + 160, y: node.position_y + 50 }
  } else if (portType === 'no') {
    return { x: node.position_x + 160, y: node.position_y + 80 }
  }
  return { x: node.position_x + 160, y: node.position_y + 50 }
}

const createEdge = async (source, target, sourceHandle) => {
  const existingEdge = edges.value.find(e => 
    e.source === source.id && 
    e.target === target.id && 
    e.source_handle === (sourceHandle === 'output' ? null : sourceHandle)
  )
  if (existingEdge) {
    alert('该连线已存在')
    return
  }

  const edgeData = {
    id: `edge_${Date.now()}`,
    source: source.id,
    target: target.id,
    source_handle: sourceHandle === 'output' ? null : sourceHandle,
    flow_id: parseInt(route.params.id)
  }
  try {
    const res = await flowApi.addEdge(route.params.id, edgeData)
    edges.value.push(res.data)
  } catch (e) {
    console.error('创建连线失败', e)
  }
}

const backToList = () => {
  router.push('/')
}

const testFlow = () => {
  router.push('/chat?flowId=' + route.params.id)
}

onMounted(() => {
  loadFlow()
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelConnecting()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
})
</script>

<style scoped>
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.editor-header h2 {
  font-size: 22px;
  color: #1f2937;
  margin-bottom: 4px;
}

.desc {
  color: #6b7280;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.help-text {
  color: #4f46e5;
  font-size: 13px;
  background: #eef2ff;
  padding: 6px 12px;
  border-radius: 6px;
}

.editor-layout {
  display: flex;
  gap: 20px;
  height: calc(100vh - 180px);
}

.sidebar {
  width: 280px;
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
}

.sidebar h3 {
  font-size: 14px;
  color: #374151;
  margin-bottom: 12px;
}

.sidebar h3 .hint {
  font-size: 12px;
  font-weight: normal;
  color: #9ca3af;
}

.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 20px 0;
}

.node-templates {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-template {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: grab;
  font-size: 14px;
  transition: all 0.2s;
}

.node-template:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.node-icon {
  font-size: 18px;
}

.properties-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 4px;
}

.btn-close:hover {
  color: #4b5563;
}

.node-properties .form-group {
  margin-bottom: 12px;
}

.node-properties label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #6b7280;
}

.node-properties input,
.node-properties textarea {
  width: 100%;
  font-size: 13px;
}

.node-properties .btn-danger {
  width: 100%;
  margin-top: 8px;
}

.edge-info {
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 12px;
  word-break: break-all;
}

.tips ul {
  list-style: none;
  padding: 0;
}

.tips li {
  padding: 6px 0;
  padding-left: 20px;
  position: relative;
  font-size: 13px;
  color: #6b7280;
}

.tips li::before {
  content: '•';
  position: absolute;
  left: 8px;
  color: #4f46e5;
}

.canvas-container {
  flex: 1;
  background: white;
  border-radius: 8px;
  position: relative;
  overflow: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-height: 500px;
  outline: none;
}

.edges-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 2000px;
  height: 2000px;
  pointer-events: none;
}

.edges-layer line {
  pointer-events: stroke;
  cursor: pointer;
}

.edge-line {
  transition: all 0.2s;
}

.flow-node {
  position: absolute;
  width: 160px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: move;
  user-select: none;
  transition: all 0.2s;
  z-index: 10;
}

.flow-node:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.flow-node.selected {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.flow-node.start-node {
  border-color: #10b981;
}

.flow-node.start-node::before {
  content: '起点';
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #10b981;
  color: white;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
}

.flow-node.connecting-target {
  border-color: #4f46e5;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0); }
}

.node-message { border-left: 4px solid #3b82f6; }
.node-input { border-left: 4px solid #f59e0b; }
.node-confirm { border-left: 4px solid #8b5cf6; }
.node-end { border-left: 4px solid #ef4444; }

.node-header {
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px 6px 0 0;
}

.node-body {
  padding: 10px 12px;
  font-size: 12px;
  color: #6b7280;
  min-height: 36px;
  word-break: break-word;
}

.port {
  position: absolute;
  width: 28px;
  height: 28px;
  background: #4f46e5;
  border: 3px solid white;
  border-radius: 50%;
  cursor: crosshair;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.port:hover {
  transform: scale(1.2);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.port.active {
  background: #10b981;
  animation: blink 1s infinite;
}

.port.highlight {
  background: #10b981;
  transform: scale(1.3);
  animation: blink 0.5s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.port-label {
  color: white;
  font-size: 10px;
  font-weight: bold;
}

.port-input {
  left: -14px;
  top: 50%;
  transform: translateY(-50%);
}

.port-input:hover {
  transform: translateY(-50%) scale(1.2);
}

.port-output {
  right: -14px;
  top: 50%;
  transform: translateY(-50%);
}

.port-output:hover {
  transform: translateY(-50%) scale(1.2);
}

.port-output.active {
  transform: translateY(-50%) scale(1.2);
}

.confirm-ports {
  position: absolute;
  right: -40px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.port-yes,
.port-no {
  position: static;
  width: 32px;
  height: 24px;
  border-radius: 4px;
  font-size: 11px;
  border: 2px solid white;
}

.port-yes {
  background: #10b981;
}

.port-no {
  background: #ef4444;
}

.canvas-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #9ca3af;
  font-size: 16px;
  text-align: center;
}
</style>
