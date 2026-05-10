<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">客户管理</h1>
        <p class="text-gray-500">管理您的客户信息</p>
      </div>
      <button @click="showModal = true" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium">
        ➕ 添加客户
      </button>
    </div>
    
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">名称</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">邮箱</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">电话</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">地址</th>
            <th class="text-left px-6 py-4 text-gray-600 font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="c in customers" :key="c.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 font-medium text-gray-800">{{ c.name }}</td>
            <td class="px-6 py-4 text-gray-600">{{ c.email || '-' }}</td>
            <td class="px-6 py-4 text-gray-600">{{ c.phone || '-' }}</td>
            <td class="px-6 py-4 text-gray-600">{{ c.address || '-' }}</td>
            <td class="px-6 py-4 space-x-2">
              <button @click="edit(c)" class="text-blue-600 hover:underline text-sm">编辑</button>
              <button @click="remove(c.id)" class="text-red-600 hover:underline text-sm">删除</button>
            </td>
          </tr>
          <tr v-if="!customers.length">
            <td colspan="5" class="px-6 py-12 text-center text-gray-400">暂无客户数据</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 m-4">
        <h2 class="text-xl font-bold mb-4">{{ editing ? '编辑客户' : '添加客户' }}</h2>
        <form @submit.prevent="save" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
            <input v-model="form.name" required class="w-full border rounded-lg px-3 py-2" placeholder="客户名称" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input v-model="form.email" type="email" class="w-full border rounded-lg px-3 py-2" placeholder="email@example.com" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">电话</label>
            <input v-model="form.phone" class="w-full border rounded-lg px-3 py-2" placeholder="联系电话" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">地址</label>
            <input v-model="form.address" class="w-full border rounded-lg px-3 py-2" placeholder="地址" />
          </div>
          <div class="flex justify-end space-x-3 pt-2">
            <button type="button" @click="closeModal" class="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { customersAPI } from '../api'

const customers = ref([])
const showModal = ref(false)
const editing = ref(null)
const form = ref({ name: '', email: '', phone: '', address: '' })

const load = async () => {
  const res = await customersAPI.getAll()
  customers.value = res.data.data
}

const closeModal = () => {
  showModal.value = false
  editing.value = null
  form.value = { name: '', email: '', phone: '', address: '' }
}

const edit = (c) => {
  editing.value = c.id
  form.value = { name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '' }
  showModal.value = true
}

const save = async () => {
  if (editing.value) {
    await customersAPI.update(editing.value, form.value)
  } else {
    await customersAPI.create(form.value)
  }
  closeModal()
  load()
}

const remove = async (id) => {
  if (!confirm('确定要删除此客户？')) return
  await customersAPI.delete(id)
  load()
}

onMounted(() => load())
</script>
