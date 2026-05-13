<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">指标管理</h1>
      <button
        @click="showModal = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >+ 新建指标</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="metric in adminStore.metrics"
        :key="metric.id"
        class="bg-white rounded-lg shadow p-4"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-semibold text-gray-800">{{ metric.name }}</h3>
            <p class="text-sm text-gray-500">{{ metric.description }}</p>
          </div>
          <button
            @click="deleteMetric(metric.id)"
            class="text-red-600 hover:text-red-800 text-sm"
          >删除</button>
        </div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-gray-500">
            {{ metric.visible ? '在公开页面显示' : '仅管理后台可见' }}
          </span>
          <button
            @click="toggleVisible(metric)"
            class="text-xs"
            :class="metric.visible ? 'text-green-600' : 'text-gray-400'"
          >
            {{ metric.visible ? '显示' : '隐藏' }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model.number="newPointValue[metric.id]"
            type="number"
            placeholder="数值"
            class="flex-1 px-2 py-1 text-sm border rounded"
          />
          <button
            @click="addPoint(metric)"
            class="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >添加数据点</button>
        </div>
      </div>

      <div
        v-if="!adminStore.metrics.length"
        class="col-span-full bg-white rounded-lg shadow p-8 text-center text-gray-500"
      >
        暂无指标，点击"新建指标"开始
      </div>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 class="text-xl font-bold mb-4">新建指标</h2>
        <form @submit.prevent="saveMetric">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input v-model="form.name" type="text" class="w-full px-3 py-2 border rounded-lg" required />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <input v-model="form.description" type="text" class="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">后缀</label>
            <input
              v-model="form.suffix"
              type="text"
              placeholder="例如：ms, %, requests/s"
              class="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">默认值</label>
            <input v-model.number="form.default_value" type="number" class="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div class="mb-6">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.visible" />
              在公开页面显示
            </label>
          </div>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              @click="showModal = false"
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

const showModal = ref(false)
const newPointValue = reactive({})

const form = ref({
  name: '',
  description: '',
  suffix: '',
  default_value: 0,
  visible: true,
  order: 0
})

const saveMetric = async () => {
  try {
    await adminStore.createMetric(form.value)
    await adminStore.fetchMetrics()
    showModal.value = false
    form.value = { name: '', description: '', suffix: '', default_value: 0, visible: true, order: 0 }
  } catch (e) {
    alert('创建失败')
  }
}

const toggleVisible = async (metric) => {
  try {
    await adminStore.updateMetric(metric.id, { visible: !metric.visible })
    await adminStore.fetchMetrics()
  } catch (e) {
    alert('更新失败')
  }
}

const addPoint = async (metric) => {
  const value = newPointValue[metric.id]
  if (value === undefined || value === null) return
  try {
    await adminStore.addMetricPoint(metric.id, { value })
    newPointValue[metric.id] = null
    alert('数据点已添加')
  } catch (e) {
    alert('添加失败')
  }
}

const deleteMetric = async (id) => {
  if (confirm('确定删除此指标？')) {
    try {
      await adminStore.deleteMetric(id)
      await adminStore.fetchMetrics()
    } catch (e) {
      alert('删除失败')
    }
  }
}

onMounted(async () => {
  await adminStore.fetchMetrics()
})
</script>
