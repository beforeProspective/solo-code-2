import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '@/utils/api'

interface Notification {
  id: number
  title: string
  message: string
  type: string
  is_read: boolean
  read_at: string | null
  action_url: string | null
  data: any
  created_at: string
}

interface NotificationState {
  items: Notification[]
  unreadCount: number
  loading: boolean
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  loading: false,
}

export const fetchNotifications = createAsyncThunk<Notification[], void>(
  'notifications/fetch',
  async () => {
    const response = await api.get('/notifications')
    return response.data.data || response.data
  }
)

export const fetchUnreadCount = createAsyncThunk<number, void>(
  'notifications/unreadCount',
  async () => {
    try {
      const response = await api.get('/notifications/unread-count')
      return response.data.count || 0
    } catch {
      return 0
    }
  }
)

export const markAsRead = createAsyncThunk<number, number>(
  'notifications/markAsRead',
  async (id) => {
    await api.post(`/notifications/${id}/mark-read`)
    return id
  }
)

export const markAllAsRead = createAsyncThunk<void, void>(
  'notifications/markAllAsRead',
  async () => {
    await api.post('/notifications/mark-all-read')
  }
)

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notification = state.items.find(n => n.id === action.payload)
        if (notification) {
          notification.is_read = true
        }
        if (state.unreadCount > 0) {
          state.unreadCount -= 1
        }
      })
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.items.forEach(n => {
          n.is_read = true
        })
        state.unreadCount = 0
      })
  },
})

export default notificationSlice.reducer
