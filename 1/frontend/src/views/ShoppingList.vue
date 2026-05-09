<template>
  <div>
    <div class="page-header">
      <h1>🛒 购物清单</h1>
      <div>
        <button class="btn btn-primary" @click="generateShoppingList">
          生成本周购物清单
        </button>
      </div>
    </div>

    <div class="week-nav">
      <button @click="changeWeek(-1)">←</button>
      <div class="week-range">{{ weekStartFormatted }} - {{ weekEndFormatted }}</div>
      <button @click="changeWeek(1)">→</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">待购物品</div>
        <div class="value">{{ shoppingItems.length }}</div>
      </div>
      <div class="stat-card">
        <div class="label">已购买</div>
        <div class="value" style="color: #48bb78;">
          {{ shoppingItems.filter(i => i.purchased).length }}
        </div>
      </div>
    </div>

    <div class="card">
      <div v-if="shoppingItems.length > 0">
        <table>
          <thead>
            <tr>
              <th style="width: 40px;"></th>
              <th>食材名称</th>
              <th>需要总量</th>
              <th>现有库存</th>
              <th>需要购买</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in shoppingItems" :key="item.id" :style="{ opacity: item.purchased ? 0.5 : 1 }">
              <td>
                <input type="checkbox" :checked="item.purchased" @change="togglePurchased(item)">
              </td>
              <td>
                <strong>{{ item.ingredient?.name || item.ingredient_name }}</strong>
              </td>
              <td>{{ item.required_quantity }} {{ item.ingredient?.unit || item.unit }}</td>
              <td>
                <span :class="item.available_stock > 0 ? 'badge badge-success' : 'badge badge-warning'">
                  {{ item.available_stock }}
                </span>
              </td>
              <td>
                <strong style="color: #f56565;">{{ item.to_buy }} {{ item.ingredient?.unit || item.unit }}</strong>
              </td>
              <td>
                <button class="btn btn-success btn-sm" @click="markAsPurchased(item)" v-if="!item.purchased">
                  已购买
                </button>
                <button class="btn btn-secondary btn-sm" @click="togglePurchased(item)" v-else>
                  撤销
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        <div>暂无购物清单</div>
        <p style="margin-top: 10px;">请先在备餐日历中安排您的饮食计划，然后点击上方按钮生成购物清单</p>
      </div>
    </div>

    <div v-if="shoppingItems.length > 0" class="card" style="background: #f7fafc;">
      <h3 class="card-title">📋 购物清单汇总</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <span v-for="item in shoppingItems" :key="item.id" 
              :class="['badge', item.purchased ? 'badge-success' : 'badge-info']"
              style="font-size: 0.9rem; padding: 6px 12px;">
          <s v-if="item.purchased">{{ item.ingredient?.name || item.ingredient_name }}: {{ item.to_buy }} {{ item.ingredient?.unit || item.unit }}</s>
          <span v-else>{{ item.ingredient?.name || item.ingredient_name }}: {{ item.to_buy }} {{ item.ingredient?.unit || item.unit }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { generateShoppingList as apiGenerate, getShoppingList, markPurchased as apiMarkPurchased } from '../api/shoppingList'

const weekOffset = ref(0)
const shoppingItems = ref([])

const weekDates = computed(() => {
  const today = new Date()
  const startOfWeek = new Date(today)
  const day = today.getDay() || 7
  startOfWeek.setDate(today.getDate() - day + 1 + (weekOffset.value * 7))
  
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  
  return {
    start: startOfWeek.toISOString().split('T')[0],
    end: endOfWeek.toISOString().split('T')[0]
  }
})

const formatDate = (dateStr) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const weekStartFormatted = computed(() => formatDate(weekDates.value.start))
const weekEndFormatted = computed(() => formatDate(weekDates.value.end))

const changeWeek = (offset) => {
  weekOffset.value += offset
}

const loadShoppingList = async () => {
  const response = await getShoppingList({
    week_start: weekDates.value.start,
    week_end: weekDates.value.end
  })
  shoppingItems.value = response.data
}

const generateShoppingList = async () => {
  const response = await apiGenerate({
    week_start: weekDates.value.start,
    week_end: weekDates.value.end
  })
  shoppingItems.value = response.data.items || response.data
  alert('购物清单生成成功！')
}

const togglePurchased = async (item) => {
  if (item.id) {
    await apiMarkPurchased(item.id, !item.purchased)
  }
  item.purchased = !item.purchased
}

const markAsPurchased = async (item) => {
  if (item.id) {
    await apiMarkPurchased(item.id, true)
  }
  item.purchased = true
}

watch(weekOffset, () => {
  loadShoppingList()
})

onMounted(() => {
  loadShoppingList()
})
</script>

<style scoped>
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
}
</style>
