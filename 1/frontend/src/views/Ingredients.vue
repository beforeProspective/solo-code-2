<template>
  <div>
    <div class="page-header">
      <h1>📦 食材管理</h1>
      <button class="btn btn-primary" @click="openModal()">
        + 添加食材
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">食材种类</div>
        <div class="value">{{ ingredients.length }}</div>
      </div>
      <div class="stat-card">
        <div class="label">库存不足</div>
        <div class="value" style="color: #f56565;">
          {{ ingredients.filter(i => i.current_stock < 1).length }}
        </div>
      </div>
    </div>

    <div class="card">
      <table v-if="ingredients.length > 0">
        <thead>
          <tr>
            <th>食材名称</th>
            <th>单位</th>
            <th>卡路里/单位</th>
            <th>蛋白质/单位</th>
            <th>当前库存</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ingredient in ingredients" :key="ingredient.id">
            <td><strong>{{ ingredient.name }}</strong></td>
            <td>{{ ingredient.unit }}</td>
            <td>{{ ingredient.calories_per_unit }} kcal</td>
            <td>{{ ingredient.protein_per_unit }} g</td>
            <td>
              <span :class="getStockBadgeClass(ingredient.current_stock)">
                {{ ingredient.current_stock }} {{ ingredient.unit }}
              </span>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" @click="openModal(ingredient)">
                编辑
              </button>
              <button class="btn btn-danger btn-sm" @click="deleteIngredient(ingredient.id)">
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <div>暂无食材，点击上方按钮添加第一个食材</div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingIngredient ? '编辑食材' : '添加食材' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>食材名称</label>
            <input type="text" class="form-control" v-model="form.name" placeholder="例如：鸡胸肉">
          </div>
          <div class="form-group">
            <label>单位</label>
            <select class="form-control" v-model="form.unit">
              <option value="g">克 (g)</option>
              <option value="ml">毫升 (ml)</option>
              <option value="个">个</option>
              <option value="片">片</option>
              <option value="勺">勺</option>
              <option value="杯">杯</option>
            </select>
          </div>
          <div class="form-group">
            <label>每单位卡路里 (kcal)</label>
            <input type="number" class="form-control" v-model.number="form.calories_per_unit" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>每单位蛋白质 (g)</label>
            <input type="number" class="form-control" v-model.number="form.protein_per_unit" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>每单位碳水化合物 (g)</label>
            <input type="number" class="form-control" v-model.number="form.carbs_per_unit" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>每单位脂肪 (g)</label>
            <input type="number" class="form-control" v-model.number="form.fat_per_unit" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>当前库存</label>
            <input type="number" class="form-control" v-model.number="form.current_stock" step="0.01" min="0">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveIngredient">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getIngredients, createIngredient, updateIngredient, deleteIngredient as apiDelete } from '../api/ingredients'

const ingredients = ref([])
const showModal = ref(false)
const editingIngredient = ref(null)
const form = ref({
  name: '',
  unit: 'g',
  calories_per_unit: 0,
  protein_per_unit: 0,
  carbs_per_unit: 0,
  fat_per_unit: 0,
  current_stock: 0
})

const loadIngredients = async () => {
  const response = await getIngredients()
  ingredients.value = response.data
}

const openModal = (ingredient = null) => {
  editingIngredient.value = ingredient
  if (ingredient) {
    form.value = { ...ingredient }
  } else {
    form.value = {
      name: '',
      unit: 'g',
      calories_per_unit: 0,
      protein_per_unit: 0,
      carbs_per_unit: 0,
      fat_per_unit: 0,
      current_stock: 0
    }
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingIngredient.value = null
}

const saveIngredient = async () => {
  if (editingIngredient.value) {
    await updateIngredient(editingIngredient.value.id, form.value)
  } else {
    await createIngredient(form.value)
  }
  closeModal()
  loadIngredients()
}

const deleteIngredient = async (id) => {
  if (confirm('确定要删除这个食材吗？')) {
    await apiDelete(id)
    loadIngredients()
  }
}

const getStockBadgeClass = (stock) => {
  if (stock <= 0) return 'badge badge-danger'
  if (stock < 1) return 'badge badge-warning'
  return 'badge badge-success'
}

onMounted(() => {
  loadIngredients()
})
</script>

<style scoped>
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
}
</style>
