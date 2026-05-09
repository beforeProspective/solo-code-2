<template>
  <div>
    <div class="page-header">
      <h1>📖 菜谱管理</h1>
      <button class="btn btn-primary" @click="openModal()">
        + 创建菜谱
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">菜谱总数</div>
        <div class="value">{{ recipes.length }}</div>
      </div>
      <div class="stat-card">
        <div class="label">平均卡路里/菜谱</div>
        <div class="value">{{ avgCalories }} kcal</div>
      </div>
    </div>

    <div v-if="recipes.length > 0">
      <div class="card" v-for="recipe in recipes" :key="recipe.id" style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <h3 style="margin-bottom: 10px;">{{ recipe.name }}</h3>
            <p v-if="recipe.description" style="color: #718096; margin-bottom: 10px;">{{ recipe.description }}</p>
            <p style="margin-bottom: 10px;">
              <span class="badge badge-info">{{ recipe.servings }} 人份</span>
            </p>

            <div style="margin-bottom: 15px;">
              <h4 style="font-size: 0.95rem; margin-bottom: 8px; color: #4a5568;">食材</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <span v-for="ing in recipe.ingredients" :key="ing.id" class="badge badge-info">
                  {{ ing.name }}: {{ ing.pivot.quantity }} {{ ing.unit }}
                </span>
              </div>
            </div>

            <div class="nutrition-grid" style="max-width: 400px;">
              <div class="nutrition-item">
                <div class="value">{{ recipe.total_calories }}</div>
                <div class="label">总卡路里 (kcal)</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ recipe.total_protein }}</div>
                <div class="label">总蛋白质 (g)</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ recipe.total_carbs }}</div>
                <div class="label">总碳水 (g)</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ recipe.total_fat }}</div>
                <div class="label">总脂肪 (g)</div>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-left: 20px;">
            <button class="btn btn-secondary btn-sm" @click="openModal(recipe)">编辑</button>
            <button class="btn btn-danger btn-sm" @click="deleteRecipe(recipe.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="card empty-state">
      <div>暂无菜谱，创建第一个菜谱开始管理您的饮食</div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h2>{{ editingRecipe ? '编辑菜谱' : '创建菜谱' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>菜谱名称</label>
            <input type="text" class="form-control" v-model="form.name" placeholder="例如：香煎鸡胸肉">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea class="form-control" v-model="form.description" rows="2" placeholder="简单描述这道菜..."></textarea>
          </div>
          <div class="form-group">
            <label>做法步骤</label>
            <textarea class="form-control" v-model="form.instructions" rows="3" placeholder="详细的烹饪步骤..."></textarea>
          </div>
          <div class="form-group">
            <label>份量（人份）</label>
            <input type="number" class="form-control" v-model.number="form.servings" min="1">
          </div>

          <div class="form-group">
            <label>食材</label>
            <div v-for="(ing, index) in form.ingredients" :key="index" class="ingredient-row">
              <select class="form-control" v-model="ing.id" @change="calculateNutrition">
                <option value="">选择食材</option>
                <option v-for="ingredient in allIngredients" :key="ingredient.id" :value="ingredient.id">
                  {{ ingredient.name }} ({{ ingredient.calories_per_unit }}kcal/{{ ingredient.unit }})
                </option>
              </select>
              <input type="number" class="form-control" style="max-width: 100px;" v-model.number="ing.quantity" step="0.01" min="0" placeholder="用量" @input="calculateNutrition">
              <span v-if="getIngredientUnit(ing.id)" style="min-width: 40px;">{{ getIngredientUnit(ing.id) }}</span>
              <button class="btn btn-danger btn-sm" @click="removeIngredient(index)" type="button">×</button>
            </div>
            <button class="btn btn-secondary" type="button" @click="addIngredient" style="margin-top: 10px;">
              + 添加食材
            </button>
          </div>

          <div v-if="previewNutrition.total_calories > 0" class="card" style="background: #f7fafc; margin-top: 15px;">
            <h4 style="margin-bottom: 10px; font-size: 0.95rem;">营养预览</h4>
            <div class="nutrition-grid" style="grid-template-columns: repeat(4, 1fr);">
              <div class="nutrition-item">
                <div class="value">{{ previewNutrition.total_calories }}</div>
                <div class="label">卡路里</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ previewNutrition.total_protein }}</div>
                <div class="label">蛋白质</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ previewNutrition.total_carbs }}</div>
                <div class="label">碳水</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ previewNutrition.total_fat }}</div>
                <div class="label">脂肪</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveRecipe">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getRecipes, createRecipe, updateRecipe, deleteRecipe as apiDelete } from '../api/recipes'
import { getIngredients } from '../api/ingredients'

const recipes = ref([])
const allIngredients = ref([])
const showModal = ref(false)
const editingRecipe = ref(null)

const form = ref({
  name: '',
  description: '',
  instructions: '',
  servings: 1,
  ingredients: []
})

const previewNutrition = ref({
  total_calories: 0,
  total_protein: 0,
  total_carbs: 0,
  total_fat: 0
})

const avgCalories = computed(() => {
  if (recipes.value.length === 0) return 0
  const total = recipes.value.reduce((sum, r) => sum + Number(r.total_calories), 0)
  return Math.round(total / recipes.value.length)
})

const loadRecipes = async () => {
  const response = await getRecipes()
  recipes.value = response.data
}

const loadIngredients = async () => {
  const response = await getIngredients()
  allIngredients.value = response.data
}

const openModal = (recipe = null) => {
  editingRecipe.value = recipe
  if (recipe) {
    form.value = {
      name: recipe.name,
      description: recipe.description || '',
      instructions: recipe.instructions || '',
      servings: recipe.servings,
      ingredients: recipe.ingredients.map(ing => ({
        id: ing.id,
        quantity: ing.pivot.quantity
      }))
    }
  } else {
    form.value = {
      name: '',
      description: '',
      instructions: '',
      servings: 1,
      ingredients: []
    }
  }
  calculateNutrition()
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingRecipe.value = null
}

const addIngredient = () => {
  form.value.ingredients.push({ id: '', quantity: 0 })
}

const removeIngredient = (index) => {
  form.value.ingredients.splice(index, 1)
  calculateNutrition()
}

const getIngredientUnit = (id) => {
  const ing = allIngredients.value.find(i => i.id === Number(id))
  return ing ? ing.unit : ''
}

const calculateNutrition = () => {
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0

  form.value.ingredients.forEach(item => {
    if (!item.id || !item.quantity) return
    const ing = allIngredients.value.find(i => i.id === Number(item.id))
    if (ing) {
      calories += ing.calories_per_unit * item.quantity
      protein += ing.protein_per_unit * item.quantity
      carbs += ing.carbs_per_unit * item.quantity
      fat += ing.fat_per_unit * item.quantity
    }
  })

  previewNutrition.value = {
    total_calories: Math.round(calories * 100) / 100,
    total_protein: Math.round(protein * 100) / 100,
    total_carbs: Math.round(carbs * 100) / 100,
    total_fat: Math.round(fat * 100) / 100
  }
}

const saveRecipe = async () => {
  const validIngredients = form.value.ingredients.filter(i => i.id && i.quantity > 0)
  
  const data = {
    name: form.value.name,
    description: form.value.description,
    instructions: form.value.instructions,
    servings: form.value.servings,
    ingredients: validIngredients
  }

  if (editingRecipe.value) {
    await updateRecipe(editingRecipe.value.id, data)
  } else {
    await createRecipe(data)
  }
  closeModal()
  loadRecipes()
}

const deleteRecipe = async (id) => {
  if (confirm('确定要删除这个菜谱吗？')) {
    await apiDelete(id)
    loadRecipes()
  }
}

onMounted(() => {
  loadRecipes()
  loadIngredients()
})
</script>

<style scoped>
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
}
</style>
