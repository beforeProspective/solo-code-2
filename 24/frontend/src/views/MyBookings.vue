<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()
const bookings = ref([])
const loading = ref(true)
const message = ref('')
const messageType = ref('')

const fetchBookings = async () => {
  loading.value = true
  try {
    const response = await api.bookings.getBookings()
    bookings.value = response.data.data || response.data
  } catch (error) {
    console.error('获取预订列表失败:', error)
  } finally {
    loading.value = false
  }
}

const cancelBooking = async (id) => {
  if (!confirm('确定要取消此预订吗？')) return

  try {
    const response = await api.bookings.cancelBooking(id)
    message.value = response.data.message
    messageType.value = 'success'
    fetchBookings()

    setTimeout(() => {
      message.value = ''
    }, 3000)
  } catch (error) {
    message.value = error.response?.data?.message || '取消失败，请稍后重试'
    messageType.value = 'error'
  }
}

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const calculateNights = (checkIn, checkOut) => {
  const checkInDate = new Date(checkIn)
  const checkOutDate = new Date(checkOut)
  const diffTime = checkOutDate - checkInDate
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

const goToHotel = (hotelId) => {
  router.push(`/hotel/${hotelId}`)
}

onMounted(() => {
  fetchBookings()
})
</script>

<template>
  <div class="container">
    <h1 class="page-title">📋 我的预订</h1>

    <div v-if="message" :class="['alert', messageType === 'success' ? 'alert-success' : 'alert-error']">
      {{ message }}
    </div>

    <div v-if="loading" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="bookings.length === 0" class="card">
      <div class="empty-state">
        <p class="empty-icon">🏨</p>
        <h3>暂无预订记录</h3>
        <p>您还没有任何预订，去探索我们的精选酒店吧！</p>
        <button @click="router.push('/')" class="btn btn-primary mt-4">浏览酒店</button>
      </div>
    </div>

    <div v-else class="bookings-list">
      <div v-for="booking in bookings" :key="booking.id" class="card booking-card">
        <div class="booking-header">
          <div class="booking-status">
            <span :class="['badge', booking.status === 'confirmed' ? 'badge-confirmed' : 'badge-cancelled']">
              {{ booking.status === 'confirmed' ? '✓ 已确认' : '✕ 已取消' }}
            </span>
            <span class="booking-id">订单号: #{{ booking.id }}</span>
          </div>
          <span class="booking-date">预订时间: {{ formatDate(booking.created_at) }}</span>
        </div>

        <div class="booking-content">
          <img :src="booking.hotel.image" :alt="booking.hotel.name" class="booking-image" />
          <div class="booking-info">
            <h3 class="hotel-name" @click="goToHotel(booking.hotel.id)">{{ booking.hotel.name }}</h3>
            <p class="hotel-location">📍 {{ booking.hotel.city }} · {{ booking.hotel.address }}</p>
            <p class="room-name">房型: {{ booking.room.name }}</p>
            <div class="booking-dates">
              <div class="date-item">
                <span class="date-label">入住</span>
                <span class="date-value">{{ formatDate(booking.check_in) }}</span>
              </div>
              <div class="date-arrow">→</div>
              <div class="date-item">
                <span class="date-label">退房</span>
                <span class="date-value">{{ formatDate(booking.check_out) }}</span>
              </div>
              <div class="date-item">
                <span class="date-label">共</span>
                <span class="date-value">{{ calculateNights(booking.check_in, booking.check_out) }} 晚</span>
              </div>
              <div class="date-item">
                <span class="date-label">入住</span>
                <span class="date-value">{{ booking.guests }} 人</span>
              </div>
            </div>
          </div>
          <div class="booking-price-section">
            <div class="total-price">
              <span class="price-label">总计</span>
              <span class="price-value">¥{{ booking.total_price }}</span>
            </div>
            <button
              v-if="booking.status === 'confirmed'"
              @click="cancelBooking(booking.id)"
              class="btn btn-danger"
            >
              取消预订
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mt-4 {
  margin-top: 1rem;
}

.empty-state {
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #1e293b;
}

.empty-state p {
  color: #64748b;
}

.bookings-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.booking-card {
  overflow: hidden;
}

.booking-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.booking-status {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.booking-id {
  color: #64748b;
  font-size: 0.875rem;
}

.booking-date {
  color: #64748b;
  font-size: 0.875rem;
}

.booking-content {
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: 1.5rem;
  padding: 1.5rem;
  align-items: center;
}

.booking-image {
  width: 200px;
  height: 120px;
  object-fit: cover;
  border-radius: 0.5rem;
}

.hotel-name {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: #1e293b;
  cursor: pointer;
}

.hotel-name:hover {
  color: #667eea;
}

.hotel-location {
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 0.5rem 0;
}

.room-name {
  color: #475569;
  margin: 0 0 1rem 0;
}

.booking-dates {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.date-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.date-label {
  font-size: 0.75rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.date-value {
  font-weight: 500;
  color: #1e293b;
}

.date-arrow {
  color: #94a3b8;
  font-size: 1.25rem;
}

.booking-price-section {
  text-align: right;
}

.total-price {
  margin-bottom: 1rem;
}

.price-label {
  display: block;
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.price-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #ef4444;
}

@media (max-width: 768px) {
  .booking-header {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .booking-content {
    grid-template-columns: 1fr;
  }

  .booking-image {
    width: 100%;
    height: 180px;
  }

  .booking-dates {
    flex-wrap: wrap;
    gap: 1rem;
  }

  .booking-price-section {
    text-align: left;
  }
}
</style>
