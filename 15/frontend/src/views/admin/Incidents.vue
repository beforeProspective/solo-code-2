<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">事件管理</h1>
      <button
        @click="showModal = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >+ 新建事件</button>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">标题</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">影响</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="incident in adminStore.incidents" :key="incident.id">
            <td class="px-6 py-4">
              <div class="font-medium text-gray-900">{{ incident.title }}</div>
              <div class="text-sm text-gray-500">{{ incident.description }}</div>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-1 rounded"
                :class="statusClass(incident.status)"
              >{{ statusText(incident.status) }}</span>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-1 rounded"
                :class="impactClass(incident.impact)"
              >{{ impactText(incident.impact) }}</span>
            </td>
            <td class="px-6 py-4 text-gray-600 text-sm">{{ formatDate(incident.created_at) }}</td>
            <td class="px-6 py-4">
              <div class="flex items-center gap-2">
                <button
                  @click="addUpdate(incident)"
                  class="text-blue-600 hover:text-blue-800 text-sm"
                >添加更新</button>
                <button
                  @click="deleteIncident(incident.id)"
                  class="text-red-600 hover:text-red-800 text-sm"
                >删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!adminStore.incidents.length">
            <td colspan="5" class="px-6 py-8 text-center text-gray-500">
              暂无事件
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 class="text-xl font-bold mb-4">新建事件</h2>
        <form @submit.prevent="saveIncident">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input v-model="form.title" type="text" class="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea v-model="form.description" rows="3" class="w-full px-3 py-2 border rounded-lg"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select v-model="form.status" class="w-full px-3 py-2 border rounded-lg">
                <option value="investigating">调查中</option>
                <option value="identified">已确认</option>
                <option value="monitoring">监控中</option>
                <option value="resolved">已解决</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">影响</label>
              <select v-model="form.impact" class="w-full px-3 py-2 border rounded-lg">
                <option value="none">无</option>
                <option value="minor">轻微</option>
                <option value="major">严重</option>
                <option value="critical">危急</option>
              </select>
            </div>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">影响组件（可选）</label>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="comp in adminStore.components"
                :key="comp.id"
                class="flex items-center gap-1 text-sm"
              >
                <input type="checkbox" :value="comp.id" v-model="selectedComponents" />
                {{ comp.name }}
              </label>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 text-gray-600 hover:text-gray-800"
            >取消</button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >创建</button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showUpdateModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 class="text-xl font-bold mb-4">添加事件更新</h2>
        <form @submit.prevent="saveUpdate">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <select v-model="updateForm.status" class="w-full px-3 py-2 border rounded-lg">
              <option value="investigating">调查中</option>
              <option value="identified">已确认</option>
              <option value="monitoring">监控中</option>
              <option value="resolved">已解决</option>
            </select>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">更新内容</label>
            <textarea v-model="updateForm.content" rows="4" class="w-full px-3 py-2 border rounded-lg" required></textarea>
          </div>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              @click="showUpdateModal = false"
              class="px-4 py-2 text-gray-600 hover:text-gray-800"
            >取消</button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

const showModal = ref(false)
const showUpdateModal = ref(false)
const currentIncident = ref(null)
const selectedComponents = ref([])

const form = ref({
  title: '',
  description: '',
  status: 'investigating',
  impact: 'none'
})

const updateForm = ref({
  status: 'investigating',
  content: ''
})

const statusClass = (status) => {
  if (status === 'resolved') return 'bg-green-100 text-green-800'
  if (status === 'monitoring') return 'bg-blue-100 text-blue-800'
  if (status === 'identified') return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

const statusText = (status) => {
  if (status === 'resolved') return '已解决'
  if (status === 'monitoring') return '监控中'
  if (status === 'identified') return '已确认'
  if (status === 'investigating') return '调查中'
  return status
}

const impactClass = (impact) => {
  if (impact === 'critical') return 'bg-red-100 text-red-800'
  if (impact === 'major') return 'bg-orange-100 text-orange-800'
  if (impact === 'minor') return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-800'
}

const impactText = (impact) => {
  if (impact === 'critical') return '危急'
  if (impact === 'major') return '严重'
  if (impact === 'minor') return '轻微'
  return '无'
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const closeModal = () => {
  showModal.value = false
  form.value = {
    title: '',
    description: '',
    status: 'investigating',
    impact: 'none'
  }
  selectedComponents.value = []
}

const saveIncident = async () => {
  try {
    const data = { ...form.value }
    if (selectedComponents.value.length > 0) {
      data.components = selectedComponents.value.map(id => ({ id }))
    }
    await adminStore.createIncident(data)
    await adminStore.fetchIncidents(false)
    closeModal()
  } catch (e) {
    alert('创建失败')
  }
}

const addUpdate = (incident) => {
  currentIncident.value = incident
  updateForm.value = {
    status: incident.status,
    content: ''
  }
  showUpdateModal.value = true
}

const saveUpdate = async () => {
  try {
    await adminStore.addIncidentUpdate(currentIncident.value.id, updateForm.value)
    await adminStore.fetchIncidents(false)
    showUpdateModal.value = false
  } catch (e) {
    alert('添加更新失败')
  }
}

const deleteIncident = async (id) => {
  if (confirm('确定删除此事件？')) {
    try {
      await adminStore.deleteIncident(id)
      await adminStore.fetchIncidents(false)
    } catch (e) {
      alert('删除失败')
    }
  }
}

onMounted(async () => {
  await Promise.all([
    adminStore.fetchIncidents(false),
    adminStore.fetchComponents()
  ])
})
</script>
