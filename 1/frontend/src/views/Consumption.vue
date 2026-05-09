<template>
  <div>
    <div class="page-header">
      <h1>📊 食材消耗追踪</h1>
      <button class="btn btn-primary" @click="openModal()">
        + 记录消耗
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">已使用</div>
        <div class="value">{{ stats.total_used }}</div>
      </div>
      <div class="stat-card">
        <div class="label">已采购</div>
        <div class="value" style="color: #48bb78;">{{ stats.total_purchased }}</div>
      </div>
      <div class="stat-card">
        <div class="label">已浪费</div>
        <div class="value" style="color: #f56565;">{{ stats.total_wasted }}</div>
      </div>
    </div>

    <div class="tabs">
      <button :class="['tab', { active: activeTab === 'records' }]" @click="activeTab = 'records'">
        消耗记录
      </button>
      <button :class="['tab', { active: activeTab === 'inventory' }]" @click="activeTab = 'inventory'">
        库存概览
      </button>
    </div>

    <div v-if="activeTab === 'records'" class="card">
      <div style="display: flex; gap: 15px; margin-bottom: 15px;">
        <select class="form-control" style="max-width: 200px;" v-model="filterType" @change="loadRecords">
          <option value="">全部类型</option>
          <option value="used">已使用</option>
          <option value="purchased">已采购</option>
          <option value="wasted">已浪费</option>
        </select>
      </div>

      <table v-if="records.length > 0">
        <thead>
          <tr>
            <th>时间</th>
            <th>食材</th>
            <th>类型</th>
            <th>数量</th>
            <th>关联菜谱</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id">
            <td>{{ formatDateTime(record.consumed_at) }}</td>
            <td><strong>{{ record.ingredient?.name }}</strong></td>
            <td>
              <span :class="getTypeBadgeClass(record.type)">
                {{ getTypeLabel(record.type) }}
              </span>
            </td>
            <td>{{ record.quantity }} {{ record.ingredient?.unit }}</td>
            <td>{{ record.recipe?.name || '-' }}</td>
            <td>{{ record.notes || '-' }}</td>
            <td>
              <button class="btn btn-danger btn-sm" @click="deleteRecord(record.id)">
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <div>暂无消耗记录</div>
      </div>
    </div>

    <div v-if="activeTab === 'inventory'" class="card">
      <table v-if="ingredients.length > 0">
        <thead>
          <tr>
            <th>食材名称</th>
            <th>单位</th>
            <th>当前库存</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ingredient in ingredients" :key="ingredient.id">
            <td><strong>{{ ingredient.name }}</strong></td>
            <td>{{ ingredient.unit }}</td>
            <td>
              <strong>{{ ingredient.current_stock }}</strong> {{ ingredient.unit }}
            </td>
            <td>
              <span :class="getStockBadgeClass(ingredient.current_stock)">
                {{ getStockLabel(ingredient.current_stock) }}
              </span>
            </td>
            <td>
              <button class="btn btn-success btn-sm" @click="quickAdd(ingredient)">
                采购入库
              </button>
              <button class="btn btn-secondary btn-sm" @click="quickUse(ingredient)">
                记录使用
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <div>暂无食材数据</div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>记录消耗</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>食材</label>
            <select class="form-control" v-model="form.ingredient_id">
              <option value="">选择食材</option>
              <option v-for="ing in ingredients" :key="ing.id" :value="ing.id">
                {{ ing.name }} (库存: {{ ing.current_stock }} {{ ing.unit }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>类型</label>
            <select class="form-control" v-model="form.type">
              <option value="used">已使用</option>
              <option value="purchased">已采购</option>
              <option value="wasted">已浪费</option>
            </select>
          </div>
          <div class="form-group">
            <label>数量</label>
            <input type="number" class="form-control" v-model.number="form.quantity" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>关联菜谱（可选）</label>
            <select class="form-control" v-model="form.recipe_id">
              <option value="">无</option>
              <option v-for="recipe in recipes" :key="recipe.id" :value="recipe.id">
                {{ recipe.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea class="form-control" v-model="form.notes" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveRecord">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getConsumptionRecords, createConsumptionRecord, deleteConsumptionRecord } from '../api/consumption'
import { getIngredients } from '../api/ingredients'
import { getRecipes } from '../api/recipes'

const activeTab = ref('records')
const records = ref([])
const ingredients = ref([])
const recipes = ref([])
const stats = ref({
  total_used: 0,
  total_purchased: 0,
  total_wasted: 0
})
const filterType = ref('')
const showModal = ref(false)
const form = ref({
  ingredient_id: '',
  type: 'used',
  quantity: 0,
  recipe_id: '',
  notes: ''
})

const loadRecords = async () => {
  const params = {}
  if (filterType.value) {
    params.type = filterType.value
  }
  const response = await getConsumptionRecords(params)
  records.value = response.data.records
  stats.value = response.data.stats
}

const loadIngredients = async () => {
  const response = await getIngredients()
  ingredients.value = response.data
}

const loadRecipes = async () => {
  const response = await getRecipes()
  recipes.value = response.data
}

const openModal = () => {
  form.value = {
    ingredient_id: '',
    type: 'used',
    quantity: 0,
    recipe_id: '',
    notes: ''
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

const saveRecord = async () => {
  const data = {
    ingredient_id: form.value.ingredient_id,
    type: form.value.type,
    quantity: form.value.quantity,
    recipe_id: form.value.recipe_id || null,
    notes: form.value.notes || null
  }
  await createConsumptionRecord(data)
  closeModal()
  loadRecords()
  loadIngredients()
}

const deleteRecord = async (id) => {
  if (confirm('确定要删除这条记录吗？')) {
    await deleteConsumptionRecord(id)
    loadRecords()
    loadIngredients()
  }
}

const quickAdd = (ingredient) => {
  form.value = {
    ingredient_id: ingredient.id,
    type: 'purchased',
    quantity: 0,
    recipe_id: '',
    notes: ''
  }
  showModal.value = true
}

const quickUse = (ingredient) => {
  form.value = {
    ingredient_id: ingredient.id,
    type: 'used',
    quantity: 0,
    recipe_id: '',
    notes: ''
  }
  showModal.value = true
}

const formatDateTime = (dateStr) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

const getTypeLabel = (type) => {
  const labels = { used: '已使用', purchased: '已采购', wasted: '已浪费' }
  return labels[type] || type
}

const getTypeBadgeClass = (type) => {
  const classes = {
    used: 'badge badge-info',
    purchased: 'badge badge-success',
    wasted: 'badge badge-danger'
  }
  return classes[type] || 'badge'
}

const getStockLabel = (stock) => {
  if (stock <= 0) return '库存不足'
  if (stock < 1) return '库存紧张'
  return '库存充足'
}

const getStockBadgeClass = (stock) => {
  if (stock <= 0) return 'badge badge-danger'
  if (stock < 1) return 'badge badge-warning'
  return 'badge badge-success'
}

onMounted(() => {
  loadRecords()
  loadIngredients()
  loadRecipes()
})
</script>

<style scoped>
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
  margin-right: 4px;
}
</style>
