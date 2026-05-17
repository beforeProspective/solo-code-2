<template>
  <div class="flow-list">
    <div class="header">
      <h2>对话流程管理</h2>
      <button class="btn btn-primary" @click="showCreateModal = true">
        + 新建流程
      </button>
    </div>

    <div class="flow-grid" v-if="flows.length > 0">
      <div class="flow-card" v-for="flow in flows" :key="flow.id">
        <div class="flow-card-header">
          <h3>{{ flow.name }}</h3>
          <div class="flow-actions">
            <button class="btn btn-secondary" @click="editFlow(flow.id)">编辑</button>
            <button class="btn btn-secondary" @click="viewSubmissions(flow.id)">数据</button>
            <button class="btn btn-danger" @click="deleteFlow(flow.id)">删除</button>
          </div>
        </div>
        <p class="flow-desc">{{ flow.description || '暂无描述' }}</p>
        <div class="flow-meta">
          <span>创建时间: {{ formatDate(flow.created_at) }}</span>
        </div>
      </div>
    </div>

    <div class="empty" v-else>
      <p>暂无对话流程，点击上方按钮创建第一个流程</p>
    </div>

    <div class="modal" v-if="showCreateModal">
      <div class="modal-content">
        <h3>新建对话流程</h3>
        <div class="form-group">
          <label>流程名称</label>
          <input v-model="newFlow.name" placeholder="请输入流程名称" />
        </div>
        <div class="form-group">
          <label>流程描述</label>
          <textarea v-model="newFlow.description" placeholder="请输入流程描述" rows="3"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCreateModal = false">取消</button>
          <button class="btn btn-primary" @click="createFlow">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { flowApi } from '../api'

const router = useRouter()
const flows = ref([])
const showCreateModal = ref(false)
const newFlow = ref({ name: '', description: '' })

const loadFlows = async () => {
  try {
    const res = await flowApi.list()
    flows.value = res.data
  } catch (e) {
    console.error('加载流程失败', e)
  }
}

const createFlow = async () => {
  if (!newFlow.value.name.trim()) {
    alert('请输入流程名称')
    return
  }
  try {
    const res = await flowApi.create(newFlow.value)
    showCreateModal.value = false
    newFlow.value = { name: '', description: '' }
    router.push(`/flow/${res.data.id}`)
  } catch (e) {
    console.error('创建流程失败', e)
  }
}

const editFlow = (id) => {
  router.push(`/flow/${id}`)
}

const viewSubmissions = (id) => {
  router.push(`/submissions/${id}`)
}

const deleteFlow = async (id) => {
  if (confirm('确定要删除此流程吗？')) {
    try {
      await flowApi.delete(id)
      loadFlows()
    } catch (e) {
      console.error('删除流程失败', e)
    }
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadFlows()
})
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  font-size: 24px;
  color: #1f2937;
}

.flow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.flow-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.flow-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.flow-card-header h3 {
  font-size: 18px;
  color: #1f2937;
}

.flow-actions {
  display: flex;
  gap: 8px;
}

.flow-actions .btn {
  padding: 4px 12px;
  font-size: 12px;
}

.flow-desc {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 12px;
  min-height: 40px;
}

.flow-meta {
  font-size: 12px;
  color: #9ca3af;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  max-width: 90%;
}

.modal-content h3 {
  margin-bottom: 16px;
  color: #1f2937;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #374151;
}

.form-group input,
.form-group textarea {
  width: 100%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
