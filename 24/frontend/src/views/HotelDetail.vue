<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'

const route = useRoute()
const router = useRouter()
const hotel = ref(null)
const loading = ref(true)
const selectedRoom = ref(null)
const bookingForm = ref({
  check_in: '',
  check_out: '',
  guests: 1,
})
const submitting = ref(false)
const message = ref('')
const messageType = ref('')

const isLoggedIn = computed(() => !!localStorage.getItem('token'))

const fetchHotel = async () => {
  loading.value = true
  try {
    const response = await api.hotels.getHotel(route.params.id)
    hotel.value = response.data
    if (hotel.value.rooms && hotel.value.rooms.length > 0) {
      selectedRoom.value = hotel.value.rooms[0]
    }
  } catch (error) {
    console.error('获取酒店详情失败:', error)
  } finally {
    loading.value = false
  }
}

const renderStars = (rating) => {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  return '★'.repeat(fullStars) + (hasHalfStar ? '☆' : '')
}

const calculateNights = () => {
  if (!bookingForm.value.check_in || !bookingForm.value.check_out) return 0
  const checkIn = new Date(bookingForm.value.check_in)
  const checkOut = new Date(bookingForm.value.check_out)
  const diffTime = checkOut - checkIn
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

const totalPrice = computed(() => {
  if (!selectedRoom.value) return 0
  const nights = calculateNights()
  return selectedRoom.value.price * nights
})

const submitBooking = async () => {
  if (!isLoggedIn.value) {
    router.push('/login')
    return
  }

  if (!bookingForm.value.check_in || !bookingForm.value.check_out) {
    message.value = '请选择入住和退房日期'
    messageType.value = 'error'
    return
  }

  if (calculateNights() < 1) {
    message.value = '退房日期必须晚于入住日期'
    messageType.value = 'error'
    return
  }

  submitting.value = true
  message.value = ''

  try {
    const response = await api.bookings.createBooking({
      hotel_id: hotel.value.id,
      room_id: selectedRoom.value.id,
      check_in: bookingForm.value.check_in,
      check_out: bookingForm.value.check_out,
      guests: bookingForm.value.guests,
    })

    message.value = response.data.message + ' 即将跳转到我的预订...'
    messageType.value = 'success'

    setTimeout(() => {
      router.push('/my-bookings')
    }, 2000)
  } catch (error) {
    message.value = error.response?.data?.message || '预订失败，请稍后重试'
    messageType.value = 'error'
  } finally {
    submitting.value = false
  }
}

const goBack = () => {
  router.push('/')
}

onMounted(() => {
  fetchHotel()
})
</script>

<template>
  <div class="container">
    <button @click="goBack" class="btn btn-secondary mb-4">← 返回列表</button>

    <div v-if="loading" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="hotel">
      <div class="hotel-detail-header">
        <img :src="hotel.image" :alt="hotel.name" class="hotel-main-image" />
        <div class="hotel-info">
          <h1 class="page-title">{{ hotel.name }}</h1>
          <div class="hotel-rating">
            <span class="stars">{{ renderStars(hotel.star_rating) }}</span>
            <span class="rating-text">{{ hotel.star_rating }} 星</span>
          </div>
          <p class="hotel-location">📍 {{ hotel.city }} · {{ hotel.address }}</p>
        </div>
      </div>

      <div class="hotel-detail-content">
        <div class="main-content">
          <div class="card mb-4">
            <div class="card-body">
              <h2 class="section-title">酒店介绍</h2>
              <p class="hotel-description">{{ hotel.description }}</p>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-body">
              <h2 class="section-title">酒店设施</h2>
              <div class="facilities-grid">
                <div v-for="facility in hotel.facilities" :key="facility" class="facility-item">
                  <span class="facility-icon">✓</span>
                  <span>{{ facility }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <h2 class="section-title">可选房型</h2>
              <div class="rooms-list">
                <div
                  v-for="room in hotel.rooms"
                  :key="room.id"
                  class="room-item"
                  :class="{ selected: selectedRoom?.id === room.id }"
                  @click="selectedRoom = room"
                >
                  <img :src="room.image" :alt="room.name" class="room-image" />
                  <div class="room-info">
                    <h3 class="room-name">{{ room.name }}</h3>
                    <p class="room-description">{{ room.description }}</p>
                    <div class="room-features">
                      <span>🛏️ {{ room.bed_count }} 张床</span>
                      <span>📐 {{ room.size }}㎡</span>
                    </div>
                  </div>
                  <div class="room-price">
                    <span class="price-value">¥{{ room.price }}</span>
                    <span class="price-unit">/晚</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar">
          <div class="card booking-card">
            <div class="card-body">
              <h2 class="section-title">预订信息</h2>

              <div v-if="message" :class="['alert', messageType === 'success' ? 'alert-success' : 'alert-error']">
                {{ message }}
              </div>

              <div v-if="selectedRoom" class="selected-room-info">
                <p>已选房型：<strong>{{ selectedRoom.name }}</strong></p>
              </div>

              <div class="form-group">
                <label class="form-label">入住日期</label>
                <input v-model="bookingForm.check_in" type="date" class="form-input" :min="new Date().toISOString().split('T')[0]" />
              </div>

              <div class="form-group">
                <label class="form-label">退房日期</label>
                <input v-model="bookingForm.check_out" type="date" class="form-input" :min="bookingForm.check_in || new Date().toISOString().split('T')[0]" />
              </div>

              <div class="form-group">
                <label class="form-label">入住人数</label>
                <select v-model="bookingForm.guests" class="form-select">
                  <option v-for="n in 10" :key="n" :value="n">{{ n }} 人</option>
                </select>
              </div>

              <div v-if="selectedRoom && calculateNights() > 0" class="price-summary">
                <div class="price-row">
                  <span>¥{{ selectedRoom.price }} × {{ calculateNights() }} 晚</span>
                  <span>¥{{ totalPrice }}</span>
                </div>
                <div class="price-total">
                  <span>总计</span>
                  <span class="total-amount">¥{{ totalPrice }}</span>
                </div>
              </div>

              <button
                @click="submitBooking"
                class="btn btn-primary w-full"
                :disabled="submitting || !selectedRoom"
              >
                {{ submitting ? '处理中...' : (isLoggedIn ? '立即预订' : '登录后预订') }}
              </button>

              <p v-if="!isLoggedIn" class="login-hint">
                预订需要先登录账号
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-4 {
  margin-bottom: 1.5rem;
}

.hotel-detail-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
  align-items: center;
}

.hotel-main-image {
  width: 100%;
  height: 350px;
  object-fit: cover;
  border-radius: 1rem;
}

.hotel-info h1 {
  margin-bottom: 0.5rem;
}

.hotel-rating {
  margin-bottom: 0.5rem;
}

.stars {
  color: #fbbf24;
  font-size: 1.25rem;
  margin-right: 0.5rem;
}

.rating-text {
  color: #64748b;
}

.hotel-location {
  color: #64748b;
  font-size: 1rem;
}

.hotel-detail-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

.card-body {
  padding: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1e293b;
}

.hotel-description {
  color: #475569;
  line-height: 1.75;
}

.facilities-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.facility-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #f8fafc;
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.facility-icon {
  color: #10b981;
  font-weight: bold;
}

.rooms-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.room-item {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.3s;
  align-items: center;
}

.room-item:hover {
  border-color: #cbd5e1;
}

.room-item.selected {
  border-color: #667eea;
  background-color: #f0f4ff;
}

.room-image {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 0.5rem;
}

.room-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  color: #1e293b;
}

.room-description {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 0.5rem 0;
}

.room-features {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #64748b;
}

.room-price {
  text-align: right;
}

.price-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ef4444;
}

.price-unit {
  font-size: 0.875rem;
  color: #64748b;
}

.booking-card {
  position: sticky;
  top: 2rem;
}

.selected-room-info {
  padding: 0.75rem;
  background-color: #f0f4ff;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.price-summary {
  margin: 1rem 0;
  padding: 1rem 0;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}

.price-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  color: #64748b;
}

.price-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  font-size: 1.125rem;
  font-weight: 600;
}

.total-amount {
  font-size: 1.5rem;
  color: #ef4444;
}

.w-full {
  width: 100%;
}

.login-hint {
  text-align: center;
  color: #64748b;
  font-size: 0.875rem;
  margin-top: 0.75rem;
}

@media (max-width: 1024px) {
  .hotel-detail-header,
  .hotel-detail-content {
    grid-template-columns: 1fr;
  }

  .facilities-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .room-item {
    grid-template-columns: 1fr;
  }

  .room-image {
    width: 100%;
    height: 150px;
  }

  .booking-card {
    position: static;
  }
}
</style>
