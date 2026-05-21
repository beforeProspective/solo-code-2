<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()
const hotels = ref([])
const loading = ref(true)
const filters = ref({
  city: '',
  keyword: '',
  star_rating: '',
})

const fetchHotels = async () => {
  loading.value = true
  try {
    const params = {}
    if (filters.value.city) params.city = filters.value.city
    if (filters.value.keyword) params.keyword = filters.value.keyword
    if (filters.value.star_rating) params.star_rating = filters.value.star_rating

    const response = await api.hotels.getHotels(params)
    hotels.value = response.data.data || response.data
  } catch (error) {
    console.error('获取酒店列表失败:', error)
  } finally {
    loading.value = false
  }
}

const search = () => {
  fetchHotels()
}

const resetFilters = () => {
  filters.value = {
    city: '',
    keyword: '',
    star_rating: '',
  }
  fetchHotels()
}

const goToDetail = (id) => {
  router.push(`/hotel/${id}`)
}

const renderStars = (rating) => {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  return '★'.repeat(fullStars) + (hasHalfStar ? '☆' : '')
}

const getMinPrice = (hotel) => {
  if (!hotel.rooms || hotel.rooms.length === 0) return 0
  return Math.min(...hotel.rooms.map(r => r.price))
}

onMounted(() => {
  fetchHotels()
})
</script>

<template>
  <div class="container">
    <h1 class="page-title">🏨 探索精选酒店</h1>

    <div class="filter-card card">
      <div class="filter-row">
        <div class="filter-item">
          <label class="form-label">城市</label>
          <input v-model="filters.city" type="text" class="form-input" placeholder="如：北京、上海、三亚" />
        </div>
        <div class="filter-item">
          <label class="form-label">关键词</label>
          <input v-model="filters.keyword" type="text" class="form-input" placeholder="搜索酒店名称或描述" />
        </div>
        <div class="filter-item">
          <label class="form-label">最低星级</label>
          <select v-model="filters.star_rating" class="form-select">
            <option value="">全部</option>
            <option value="3">3星及以上</option>
            <option value="4">4星及以上</option>
            <option value="4.5">4.5星及以上</option>
            <option value="5">5星</option>
          </select>
        </div>
      </div>
      <div class="filter-actions">
        <button @click="search" class="btn btn-primary">🔍 搜索</button>
        <button @click="resetFilters" class="btn btn-secondary">重置</button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="hotels.length === 0" class="alert alert-info">
      暂无符合条件的酒店，请尝试其他筛选条件。
    </div>

    <div v-else class="grid grid-3">
      <div v-for="hotel in hotels" :key="hotel.id" class="card hotel-card" @click="goToDetail(hotel.id)">
        <div class="hotel-image">
          <img :src="hotel.image" :alt="hotel.name" />
        </div>
        <div class="hotel-content">
          <div class="hotel-header">
            <h3 class="hotel-name">{{ hotel.name }}</h3>
            <div class="hotel-rating">
              <span class="stars">{{ renderStars(hotel.star_rating) }}</span>
              <span class="rating-text">{{ hotel.star_rating }}</span>
            </div>
          </div>
          <p class="hotel-location">📍 {{ hotel.city }} · {{ hotel.address }}</p>
          <p class="hotel-description">{{ hotel.description.substring(0, 80) }}...</p>
          <div class="hotel-facilities">
            <span v-for="facility in hotel.facilities.slice(0, 4)" :key="facility" class="facility-tag">
              {{ facility }}
            </span>
          </div>
          <div class="hotel-footer">
            <div class="hotel-price">
              <span class="price-label">起价</span>
              <span class="price-value">¥{{ getMinPrice(hotel) }}</span>
              <span class="price-unit">/晚</span>
            </div>
            <button class="btn btn-primary">查看详情</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.filter-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.filter-item {
  flex: 1;
}

.filter-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.hotel-card {
  cursor: pointer;
}

.hotel-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.hotel-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.hotel-card:hover .hotel-image img {
  transform: scale(1.05);
}

.hotel-content {
  padding: 1.5rem;
}

.hotel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.hotel-name {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: #1e293b;
}

.hotel-rating {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stars {
  color: #fbbf24;
  font-size: 0.875rem;
}

.rating-text {
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
}

.hotel-location {
  color: #64748b;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.hotel-description {
  color: #475569;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  line-height: 1.5;
}

.hotel-facilities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.facility-tag {
  background-color: #f1f5f9;
  color: #475569;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
}

.hotel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.hotel-price {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.price-label {
  color: #64748b;
  font-size: 0.875rem;
}

.price-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ef4444;
}

.price-unit {
  color: #64748b;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
