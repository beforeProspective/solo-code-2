<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h1 class="text-3xl font-bold text-gray-800">新建发票</h1>
      <p class="text-gray-500">创建一张新发票</p>
    </div>
    
    <div class="bg-white rounded-xl shadow p-6 space-y-6">
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">客户</label>
          <select v-model="form.customer_id" class="w-full border rounded-lg px-3 py-2">
            <option :value="null">选择客户...</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">到期日期</label>
          <input v-model="form.due_date" type="date" class="w-full border rounded-lg px-3 py-2" />
        </div>
      </div>
      
      <div>
        <div class="flex justify-between items-center mb-3">
          <label class="text-sm font-medium text-gray-700">明细项目</label>
          <button @click="addItem" class="text-sm text-blue-600 hover:underline">+ 添加项目</button>
        </div>
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-gray-50">
              <th class="text-left p-3 border text-gray-600 text-sm">描述</th>
              <th class="text-left p-3 border text-gray-600 text-sm w-24">数量</th>
              <th class="text-left p-3 border text-gray-600 text-sm w-32">单价</th>
              <th class="text-left p-3 border text-gray-600 text-sm w-32">税率</th>
              <th class="text-left p-3 border text-gray-600 text-sm w-24">小计</th>
              <th class="p-3 border w-10"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in form.items" :key="i">
              <td class="p-2 border">
                <input v-model="item.description" class="w-full border rounded px-2 py-1" placeholder="项目描述" />
              </td>
              <td class="p-2 border">
                <input v-model.number="item.quantity" type="number" min="1" class="w-full border rounded px-2 py-1 text-right" />
              </td>
              <td class="p-2 border">
                <input v-model.number="item.price" type="number" step="0.01" min="0" class="w-full border rounded px-2 py-1 text-right" />
              </td>
              <td class="p-2 border">
                <select v-model.number="item.tax_rate" class="w-full border rounded px-2 py-1">
                  <option v-for="t in taxes" :key="t.id" :value="t.rate">{{ t.name }}</option>
                </select>
              </td>
              <td class="p-2 border text-right font-medium">¥{{ itemTotal(item) }}</td>
              <td class="p-2 border text-center">
                <button v-if="form.items.length > 1" @click="removeItem(i)" class="text-red-500 hover:text-red-700">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="bg-gray-50 rounded-lg p-4">
        <div class="flex justify-between items-center">
          <span class="text-gray-600">小计:</span>
          <span class="font-medium">¥{{ subtotal }}</span>
        </div>
        <div class="flex justify-between items-center mt-2">
          <span class="text-gray-600">税额:</span>
          <span class="font-medium">¥{{ taxTotal }}</span>
        </div>
        <div class="flex justify-between items-center mt-2 text-lg border-t pt-2">
          <span class="font-bold">总计:</span>
          <span class="font-bold text-blue-600">¥{{ grandTotal }}</span>
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
        <textarea v-model="form.notes" rows="3" class="w-full border rounded-lg px-3 py-2" placeholder="备注信息..."></textarea>
      </div>
      
      <div class="flex justify-end space-x-3 pt-4">
        <button @click="$router.push('/invoices')" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button>
        <button @click="submit" :disabled="saving" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {{ saving ? '保存中...' : '创建发票' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { invoicesAPI, customersAPI, taxesAPI } from '../api'

const router = useRouter()
const customers = ref([])
const taxes = ref([])
const saving = ref(false)
const form = ref({
  customer_id: null,
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  notes: '',
  items: [{ description: '', quantity: 1, price: 0, tax_rate: 0 }]
})

const itemTotal = (item) => ((item.price || 0) * (item.quantity || 0)).toLocaleString('zh-CN', { minimumFractionDigits: 2 })

const subtotal = computed(() => 
  form.value.items.reduce((s, item) => s + (item.price || 0) * (item.quantity || 0), 0)
    .toLocaleString('zh-CN', { minimumFractionDigits: 2 })
)

const taxTotal = computed(() =>
  form.value.items.reduce((s, item) => s + (item.price || 0) * (item.quantity || 0) * (item.tax_rate || 0) / 100, 0)
    .toLocaleString('zh-CN', { minimumFractionDigits: 2 })
)

const grandTotal = computed(() =>
  form.value.items.reduce((s, item) => {
    const line = (item.price || 0) * (item.quantity || 0)
    return s + line + line * (item.tax_rate || 0) / 100
  }, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
)

const addItem = () => form.value.items.push({ description: '', quantity: 1, price: 0, tax_rate: taxes.value[0]?.rate || 0 })
const removeItem = (i) => form.value.items.splice(i, 1)

const submit = async () => {
  if (!form.value.items.some(i => i.description && i.price > 0)) {
    alert('请至少添加一个有效项目')
    return
  }
  saving.value = true
  try {
    const res = await invoicesAPI.create(form.value)
    router.push('/invoices/' + res.data.data.id)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const [custRes, taxRes] = await Promise.all([customersAPI.getAll(), taxesAPI.getAll()])
  customers.value = custRes.data.data
  taxes.value = taxRes.data.data
  if (taxes.value.length && form.value.items[0]) {
    form.value.items[0].tax_rate = taxes.value[0].rate
  }
})
</script>
