import { createContext, useContext, useState, useCallback } from 'react'
import { subDays, endOfDay, startOfDay } from 'date-fns'

const AppContext = createContext()

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [selectedSite, setSelectedSite] = useState(null)
  const [timeRange, setTimeRange] = useState({
    startDate: startOfDay(subDays(new Date(), 7)),
    endDate: endOfDay(new Date())
  })
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'))

  const setTimeRangePreset = useCallback((preset) => {
    const now = new Date()
    switch (preset) {
      case '24h':
        setTimeRange({
          startDate: subDays(now, 1),
          endDate: now
        })
        break
      case '7d':
        setTimeRange({
          startDate: startOfDay(subDays(now, 7)),
          endDate: endOfDay(now)
        })
        break
      case '30d':
        setTimeRange({
          startDate: startOfDay(subDays(now, 30)),
          endDate: endOfDay(now)
        })
        break
      case '90d':
        setTimeRange({
          startDate: startOfDay(subDays(now, 90)),
          endDate: endOfDay(now)
        })
        break
      default:
        break
    }
  }, [])

  const login = useCallback((token, userData) => {
    localStorage.setItem('access_token', token)
    setUser(userData)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    setUser(null)
    setSelectedSite(null)
    setIsAuthenticated(false)
  }, [])

  const value = {
    user,
    setUser,
    selectedSite,
    setSelectedSite,
    timeRange,
    setTimeRange,
    setTimeRangePreset,
    isAuthenticated,
    login,
    logout
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}
