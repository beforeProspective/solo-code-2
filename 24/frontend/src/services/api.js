import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default {
  auth: {
    register(data) {
      return api.post('/register', data)
    },
    login(data) {
      return api.post('/login', data)
    },
    logout() {
      return api.post('/logout')
    },
    getUser() {
      return api.get('/user')
    },
  },
  hotels: {
    getHotels(params = {}) {
      return api.get('/hotels', { params })
    },
    getHotel(id) {
      return api.get(`/hotels/${id}`)
    },
  },
  rooms: {
    getRooms(params = {}) {
      return api.get('/rooms', { params })
    },
    getRoom(id) {
      return api.get(`/rooms/${id}`)
    },
  },
  bookings: {
    getBookings() {
      return api.get('/bookings')
    },
    createBooking(data) {
      return api.post('/bookings', data)
    },
    getBooking(id) {
      return api.get(`/bookings/${id}`)
    },
    cancelBooking(id) {
      return api.post(`/bookings/${id}/cancel`)
    },
  },
}
