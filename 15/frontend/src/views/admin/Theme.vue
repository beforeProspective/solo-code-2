<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">主题设置</h1>

    <div class="bg-white rounded-lg shadow p-6">
      <form @submit.prevent="saveTheme">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">网站名称</label>
            <input v-model="form.site_name" type="text" class="w-full px-3 py-2 border rounded-lg" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input v-model="form.logo" type="text" placeholder="https://..." class="w-full px-3 py-2 border rounded-lg" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">主色调</label>
            <div class="flex gap-2">
              <input v-model="form.primary_color" type="color" class="w-12 h-10 rounded" />
              <input v-model="form.primary_color" type="text" class="flex-1 px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">次要颜色</label>
            <div class="flex gap-2">
              <input v-model="form.secondary_color" type="color" class="w-12 h-10 rounded" />
              <input v-model="form.secondary_color" type="text" class="flex-1 px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">背景颜色</label>
            <div class="flex gap-2">
              <input v-model="form.background_color" type="color" class="w-12 h-10 rounded" />
              <input v-model="form.background_color" type="text" class="flex-1 px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">页眉颜色</label>
            <div class="flex gap-2">
              <input v-model="form.header_color" type="color" class="w-12 h-10 rounded" />
              <input v-model="form.header_color" type="text" class="flex-1 px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">页脚文字</label>
            <input v-model="form.footer_text" type="text" class="w-full px-3 py-2 border rounded-lg" />
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">自定义 HTML</label>
            <textarea
              v-model="form.custom_html"
              rows="4"
              placeholder="自定义 HTML 代码（可选）"
              class="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            ></textarea>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            type="submit"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >保存设置</button>
        </div>
      </form>
    </div>

    <div class="mt-8">
      <h2 class="text-lg font-semibold mb-4">预览</h2>
      <div class="rounded-lg overflow-hidden shadow" :style="{ backgroundColor: form.background_color }">
        <div class="py-4 px-6 text-white" :style="{ backgroundColor: form.header_color }">
          <span class="text-xl font-bold">{{ form.site_name || 'Status Page' }}</span>
        </div>
        <div class="p-6">
          <div class="bg-white rounded-lg p-4 shadow-sm">
            <div class="flex items-center gap-2" :style="{ color: form.primary_color }">
              <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: form.primary_color }"></span>
              <span class="font-medium">示例组件 - 正常运行</span>
            </div>
          </div>
        </div>
        <div class="py-3 px-6 text-center text-sm" :style="{ backgroundColor: '#f3f4f6', color: '#6b7280' }">
          {{ form.footer_text || '© 2024 Status Page' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useStatusStore } from '@/stores/status'
import { useAdminStore } from '@/stores/admin'

const statusStore = useStatusStore()
const adminStore = useAdminStore()

const form = ref({
  site_name: 'Status Page',
  logo: '',
  primary_color: '#3B82F6',
  secondary_color: '#1E40AF',
  background_color: '#F3F4F6',
  header_color: '#1F2937',
  footer_text: '© 2024 Status Page',
  custom_html: ''
})

const saveTheme = async () => {
  try {
    await adminStore.updateTheme(form.value)
    await statusStore.fetchTheme()
    alert('主题设置已保存')
  } catch (e) {
    alert('保存失败')
  }
}

onMounted(async () => {
  await statusStore.fetchTheme()
  Object.assign(form.value, statusStore.theme)
})
</script>
