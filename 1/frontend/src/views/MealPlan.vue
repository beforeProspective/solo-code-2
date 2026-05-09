<template>
  <div>
    <div class="page-header">
      <h1>📅 备餐日历</h1>
    </div>

    <div class="week-nav">
      <button @click="changeWeek(-1)">←</button>
      <div class="week-range">{{ weekStartFormatted }} - {{ weekEndFormatted }}</div>
      <button @click="changeWeek(1)">→</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">本周计划餐数</div>
        <div class="value">{{ weekMealCount }}</div>
      </div>
      <div class="stat-card">
        <div class="label">预计总卡路里</div>
        <div class="value">{{ weekCalories }} kcal</div>
      </div>
    </div>

    <div class="card">
      <div class="calendar">
        <div class="calendar-header"></div>
        <div v-for="day in weekDates" :key="day.date" class="calendar-header">
          {{ day.weekday }}<br>
          <small>{{ day.dateFormatted }}</small>
        </div>

        <template v-for="mealType in mealTypes" :key="mealType.value">
          <div class="calendar-cell time-slot">{{ mealType.label }}</div>
          <div v-for="day in weekDates" :key="day.date + mealType.value" 
               :class="['calendar-cell', { weekend: day.isWeekend }]">
            <template v-if="getMealPlan(day.date, mealType.value)">
              <div class="meal-plan-item" @click="editMeal(getMealPlan(day.date, mealType.value), day.date, mealType.value)">
                {{ getMealPlan(day.date, mealType.value).recipe?.name || '无菜谱' }}
              </div>
            </template>
            <template v-else>
              <button class="add-meal-btn" @click="addMeal(day.date, mealType.value)">
                + 添加
              </button>
            </template>
          </div>
        </template>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingMeal ? '编辑备餐' : '添加备餐' }}</h2>
          <button class="close-btn" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>日期</label>
            <input type="date" class="form-control" v-model="form.plan_date" :disabled="!!editingMeal">
          </div>
          <div class="form-group">
            <label>餐次</label>
            <select class="form-control" v-model="form.meal_type" :disabled="!!editingMeal">
              <option v-for="mt in mealTypes" :key="mt.value" :value="mt.value">{{ mt.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>菜谱</label>
            <select class="form-control" v-model="form.recipe_id">
              <option value="">无菜谱（自由餐）</option>
              <option v-for="recipe in recipes" :key="recipe.id" :value="recipe.id">
                {{ recipe.name }} ({{ recipe.total_calories }} kcal)
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea class="form-control" v-model="form.notes" rows="2" placeholder="备注..."></textarea>
          </div>

          <div v-if="selectedRecipe" class="card" style="background: #f7fafc;">
            <h4 style="margin-bottom: 10px; font-size: 0.95rem;">菜谱营养</h4>
            <div class="nutrition-grid" style="grid-template-columns: repeat(4, 1fr);">
              <div class="nutrition-item">
                <div class="value">{{ selectedRecipe.total_calories }}</div>
                <div class="label">卡路里</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ selectedRecipe.total_protein }}</div>
                <div class="label">蛋白质</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ selectedRecipe.total_carbs }}</div>
                <div class="label">碳水</div>
              </div>
              <div class="nutrition-item">
                <div class="value">{{ selectedRecipe.total_fat }}</div>
                <div class="label">脂肪</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="editingMeal" class="btn btn-danger" @click="deleteMeal" style="margin-right: auto;">删除</button>
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveMeal">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getMealPlans, createMealPlan, updateMealPlan, deleteMealPlan as apiDelete } from '../api/mealPlans'
import { getRecipes } from '../api/recipes'

const mealTypes = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '加餐' }
]

const weekOffset = ref(0)
const mealPlans = ref([])
const recipes = ref([])
const showModal = ref(false)
const editingMeal = ref(null)
const form = ref({
  plan_date: '',
  meal_type: 'breakfast',
  recipe_id: '',
  notes: ''
})

const formatDateString = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const weekDates = computed(() => {
  const today = new Date()
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const day = startOfWeek.getDay() || 7
  startOfWeek.setDate(startOfWeek.getDate() - day + 1 + (weekOffset.value * 7))
  
  const dates = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    const dateStr = formatDateString(date)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    dates.push({
      date: dateStr,
      dateFormatted: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: weekdays[date.getDay()],
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    })
  }
  return dates
})

const weekStartFormatted = computed(() => weekDates.value[0]?.dateFormatted || '')
const weekEndFormatted = computed(() => weekDates.value[6]?.dateFormatted || '')

const weekMealCount = computed(() => {
  const weekDateStrs = weekDates.value.map(d => d.date)
  return mealPlans.value.filter(m => weekDateStrs.includes(m.plan_date) && m.recipe_id).length
})

const weekCalories = computed(() => {
  const weekDateStrs = weekDates.value.map(d => d.date)
  return mealPlans.value
    .filter(m => weekDateStrs.includes(m.plan_date) && m.recipe)
    .reduce((sum, m) => sum + Number(m.recipe.total_calories), 0)
})

const selectedRecipe = computed(() => {
  if (!form.value.recipe_id) return null
  return recipes.value.find(r => r.id === Number(form.value.recipe_id))
})

const changeWeek = (offset) => {
  weekOffset.value += offset
}

const loadMealPlans = async () => {
  if (weekDates.value.length === 0) return
  const start = weekDates.value[0].date
  const end = weekDates.value[6].date
  const response = await getMealPlans({ start_date: start, end_date: end })
  mealPlans.value = response.data.meal_plans
}

const loadRecipes = async () => {
  const response = await getRecipes()
  recipes.value = response.data
}

const getMealPlan = (date, mealType) => {
  return mealPlans.value.find(m => m.plan_date === date && m.meal_type === mealType)
}

const addMeal = (date, mealType) => {
  editingMeal.value = null
  form.value = {
    plan_date: date,
    meal_type: mealType,
    recipe_id: '',
    notes: ''
  }
  showModal.value = true
}

const editMeal = (meal, date, mealType) => {
  editingMeal.value = meal
  form.value = {
    plan_date: date,
    meal_type: mealType,
    recipe_id: meal.recipe_id || '',
    notes: meal.notes || ''
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingMeal.value = null
}

const saveMeal = async () => {
  const data = {
    plan_date: form.value.plan_date,
    meal_type: form.value.meal_type,
    recipe_id: form.value.recipe_id || null,
    notes: form.value.notes
  }

  if (editingMeal.value) {
    await updateMealPlan(editingMeal.value.id, data)
  } else {
    await createMealPlan(data)
  }
  closeModal()
  loadMealPlans()
}

const deleteMeal = async () => {
  if (editingMeal.value && confirm('确定要删除这个备餐吗？')) {
    await apiDelete(editingMeal.value.id)
    closeModal()
    loadMealPlans()
  }
}

watch(weekOffset, () => {
  loadMealPlans()
})

onMounted(() => {
  loadMealPlans()
  loadRecipes()
})
</script>
