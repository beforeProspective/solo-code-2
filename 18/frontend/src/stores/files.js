import { defineStore } from 'pinia'
import api from '../api'

export const useFilesStore = defineStore('files', {
  state: () => ({
    currentPath: '',
    items: [],
    selectedItems: [],
    clipboard: {
      action: null,
      items: []
    },
    searchQuery: '',
    loading: false
  }),
  
  getters: {
    breadcrumbs: (state) => {
      const parts = state.currentPath.split('/').filter(p => p)
      const crumbs = [{ name: '根目录', path: '' }]
      let current = ''
      for (const part of parts) {
        current += (current ? '/' : '') + part
        crumbs.push({ name: part, path: current })
      }
      return crumbs
    },
    
    selectedPaths: (state) => state.selectedItems.map(item => item.path)
  },
  
  actions: {
    async fetchFiles(path = '', search = '') {
      this.loading = true
      try {
        const params = new URLSearchParams()
        params.append('action', 'list')
        if (path) params.append('path', path)
        if (search) params.append('search', search)
        
        const response = await api.get(`/files?${params.toString()}`)
        this.items = response.data.items
        this.currentPath = path
        this.searchQuery = search
        this.selectedItems = []
      } catch (error) {
        console.error('Failed to fetch files:', error)
      } finally {
        this.loading = false
      }
    },
    
    selectItem(item, multi = false) {
      if (multi) {
        const index = this.selectedItems.findIndex(i => i.path === item.path)
        if (index > -1) {
          this.selectedItems.splice(index, 1)
        } else {
          this.selectedItems.push(item)
        }
      } else {
        this.selectedItems = [item]
      }
    },
    
    clearSelection() {
      this.selectedItems = []
    },
    
    async createDirectory(name) {
      try {
        await api.post('/files?action=create_directory' + (this.currentPath ? `&path=${encodeURIComponent(this.currentPath)}` : ''), { name })
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '创建失败' }
      }
    },
    
    async createFile(name, content = '') {
      try {
        await api.post('/files?action=create_file' + (this.currentPath ? `&path=${encodeURIComponent(this.currentPath)}` : ''), { name, content })
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '创建失败' }
      }
    },
    
    async deleteItems(paths) {
      try {
        await api.post('/files?action=delete', { paths })
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '删除失败' }
      }
    },
    
    async renameItem(path, newName) {
      try {
        const response = await api.post(`/files?action=rename&path=${encodeURIComponent(path)}`, { name: newName })
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true, newPath: response.data.path }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '重命名失败' }
      }
    },
    
    async editFile(path, content) {
      try {
        await api.post(`/files?action=edit&path=${encodeURIComponent(path)}`, { content })
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '编辑失败' }
      }
    },
    
    async copyItems() {
      this.clipboard = {
        action: 'copy',
        items: [...this.selectedItems]
      }
    },
    
    async cutItems() {
      this.clipboard = {
        action: 'move',
        items: [...this.selectedItems]
      }
    },
    
    async pasteItems() {
      if (!this.clipboard.action || this.clipboard.items.length === 0) {
        return { success: false, error: '剪贴板为空' }
      }
      
      try {
        const action = this.clipboard.action
        for (const item of this.clipboard.items) {
          const destPath = this.currentPath 
            ? `${this.currentPath}/${item.name}` 
            : item.name
          
          if (action === 'copy') {
            await api.post('/files?action=copy', { source: item.path, destination: destPath })
          } else {
            await api.post('/files?action=move', { source: item.path, destination: destPath })
          }
        }
        
        if (action === 'move') {
          this.clipboard = { action: null, items: [] }
        }
        
        await this.fetchFiles(this.currentPath, this.searchQuery)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || '粘贴失败' }
      }
    },
    
    getDownloadUrl(path) {
      const token = localStorage.getItem('token')
      return `/api/files?action=download&path=${encodeURIComponent(path)}&token=${token}`
    },
    
    getPreviewUrl(path) {
      const token = localStorage.getItem('token')
      return `/api/files?action=preview&path=${encodeURIComponent(path)}&token=${token}`
    },
    
    getBulkDownloadUrl(paths) {
      const token = localStorage.getItem('token')
      const pathsStr = encodeURIComponent(JSON.stringify(paths))
      return `/api/files?action=download_bulk&paths=${pathsStr}&token=${token}`
    }
  }
})
