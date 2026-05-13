<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">组件管理</h1>
      <button
        @click="showModal = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >+ 新建组件</button>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">分组</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="component in adminStore.components" :key="component.id">
            <td class="px-6 py-4">
              <div class="font-medium text-gray-900">{{ component.name }}</div>
              <div class="text-sm text-gray-500">{{ component.description }}</div>
            </td>
            <td class="px-6 py-4 text-gray-600">{{ component.group_name || '-' }}</td>
            <td class="px-6 py-4">
              <span
                class="flex items-center gap-1 text-sm"
                :class="statusTextColor(component.status)"
              >
                <span class="w-2 h-2 rounded-full" :class="statusColor(component.status)"></span>
                {{ statusText(component.status) }}
              </span>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center gap-2">
                <select
                  :value="component.status"
                  @change="updateStatus(component.id, $event.target.value)"
                  class="text-sm border rounded px-2 py-1"
                >
                  <option value="operational">正常</option>
                  <option value="degraded">性能下降</option>
                  <option value="partial_outage">部分故障</option>
                  <option value="major_outage">完全故障</option>
                </select>
                <button
                  @click="editComponent(component)"
                  class="text-blue-600 hover:text-blue-800 text-sm"
                >编辑</button>
                <button
                  @click="deleteComponent(component.id)"
                  class="text-red-600 hover:text-red-800 text-sm"
                >删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!adminStore.components.length">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500">
              暂无组件，点击"新建组件"开始
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 class="text-xl font-bold mb-4">
          {{ editingComponent ? '编辑组件' : '新建组件' }}
        </h2>
        <form @submit.prevent="saveComponent">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              v-model="form.description"
              rows="2"
              class="w-full px-3 py-2 border rounded-lg"
            ></textarea>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">分组</label>
            <input
              v-model="form.group_name"
              type="text"
              placeholder="例如：API、前端、数据库"
              class="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">初始状态</label>
            <select v-model="form.status" class="w-full px-3 py-2 border rounded-lg">
              <option value="operational">正常运行</option>
              <option value="degraded">性能下降</option>
              <option value="partial_outage">部分故障</option>
              <option value="major_outage">完全故障</option>
            </select>
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
const editingComponent = ref(null)
const form = ref({
  name: '',
  description: '',
  group_name: '',
  status: 'operational'
})

const statusColor = (status) => {
  if (status === 'operational') return 'bg-green-500'
  if (status === 'degraded') return 'bg-yellow-500'
  if (status === 'partial_outage') return 'bg-orange-500'
  if (status === 'major_outage') return 'bg-red-500'
  return 'bg-green-500'
}

const statusTextColor = (status) => {
  if (status === 'operational') return 'text-green-600'
  if (status === 'degraded') return 'text-yellow-600'
  if (status === 'partial_outage') return 'text-orange-600'
  if (status === 'major_outage') return 'text-red-600'
  return 'text-green-600'
}

const statusText = (status) => {
  if (status === 'operational') return '正常运行'
  if (status === 'degraded') return '性能下降'
  if (status === 'partial_outage') return '部分故障'
  if (status === 'major_outage') return '完全故障'
  return status
}

const editComponent = (component) => {
  editingComponent.value = component
  form.value = {
    name: component.name,
    description: component.description || '',
    group_name: component.group_name || '',
    status: component.status
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingComponent.value = null
  form.value = {
    name: '',
    description: '',
    group_name: '',
    status: 'operational'
  }
}

const saveComponent = async () => {
  try {
    if (editingComponent.value) {
      await adminStore.updateComponent(editingComponent.value.id, form.value)
    } else {
      await adminStore.createComponent(form.value)
    }
    await adminStore.fetchComponents()
    closeModal()
  } catch (e) {
    alert('保存失败')
  }
}

const updateStatus = async (id, status) => {
  try {
    await adminStore.updateComponentStatus(id, status)
    await adminStore.fetchComponents()
  } catch (e) {
    alert('更新失败')
  }
}

const deleteComponent = async (id) => {
  if (confirm('确定删除此组件？')) {
    try {
      await adminStore.deleteComponent(id)
      await adminStore.fetchComponents()
    } catch (e) {
      alert('删除失败')
    }
  }
}

onMounted(async () => {
  await adminStore.fetchComponents()
})
</script>
