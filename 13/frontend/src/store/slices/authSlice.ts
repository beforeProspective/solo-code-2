import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '@/utils/api'

interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'hr' | 'manager' | 'employee'
  employee?: {
    id: number
    employee_code: string
    department?: {
      id: number
      name: string
    }
    position?: {
      id: number
      title: string
    }
  }
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,
}

interface LoginCredentials {
  email: string
  password: string
}

interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export const login = createAsyncThunk<AuthResponse, LoginCredentials>(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post<AuthResponse>('/login', credentials)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '登录失败')
    }
  }
)

export const logout = createAsyncThunk<void, void>(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await api.post('/logout')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    } catch (error) {
      return rejectWithValue('退出失败')
    }
  }
)

export const getCurrentUser = createAsyncThunk<User, void>(
  'auth/getCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<{ user: User }>('/me')
      return response.data.user
    } catch (error) {
      return rejectWithValue('获取用户信息失败')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.token = action.payload.access_token
        state.user = action.payload.user
        localStorage.setItem('token', action.payload.access_token)
        localStorage.setItem('user', JSON.stringify(action.payload.user))
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false
        state.token = null
        state.user = null
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload
        localStorage.setItem('user', JSON.stringify(action.payload))
      })
  },
})

export const { clearError } = authSlice.actions
export default authSlice.reducer
