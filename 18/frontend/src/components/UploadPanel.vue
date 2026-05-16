<template>
  <div class="upload-panel" :class="{ 'drop-zone': isDragOver }" @dragover.prevent="isDragOver = true" @dragleave="isDragOver = false" @drop.prevent="handleDrop">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <o-icon icon="cloud-upload-alt" pack="fas" size="large"></o-icon>
        <span style="margin-left: 10px;">
          拖拽文件到此处上传，或
          <o-button variant="primary" size="small" @click="triggerFileInput">
            <o-icon icon="plus" pack="fas"></o-icon>&nbsp;选择文件
          </o-button>
        </span>
        <input ref="fileInput" type="file" multiple style="display: none;" @change="handleFileSelect">
      </div>
      <div v-if="uploads.length > 0">
        <o-button variant="danger" size="small" @click="clearCompleted">
          <o-icon icon="times-circle" pack="fas"></o-icon>&nbsp;清除已完成
        </o-button>
      </div>
    </div>
    
    <div v-if="uploads.length > 0" style="margin-top: 15px;">
      <div v-for="upload in uploads" :key="upload.id" class="upload-item">
        <o-icon :icon="upload.isPaused ? 'pause-circle' : (upload.progress === 100 ? 'check-circle' : 'file-upload')" 
                :pack="upload.progress === 100 ? 'fas' : 'far'"
                :variant="upload.progress === 100 ? 'success' : (upload.error ? 'danger' : 'info')"></o-icon>
        <span style="margin-left: 10px; flex: 1;">
          {{ upload.fileName }}
          <span style="color: #999; font-size: 12px;">({{ formatSize(upload.size) }})</span>
        </span>
        <div class="upload-progress">
          <o-progress :value="upload.progress" :variant="upload.error ? 'danger' : 'primary'" size="small">
            <strong>{{ upload.progress }}%</strong>
          </o-progress>
        </div>
        <span style="margin-left: 10px; width: 80px; text-align: right; color: #999; font-size: 12px;">
          {{ upload.speed }}
        </span>
        <div style="margin-left: 10px;">
          <o-button v-if="upload.progress < 100 && !upload.error" 
                    variant="warning" size="small" 
                    @click="togglePause(upload)">
            <o-icon :icon="upload.isPaused ? 'play' : 'pause'" pack="fas"></o-icon>
          </o-button>
          <o-button v-if="upload.progress < 100" 
                    variant="danger" size="small" 
                    @click="cancelUpload(upload)">
            <o-icon icon="times" pack="fas"></o-icon>
          </o-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import Resumable from 'resumablejs'
import { useAuthStore } from '../stores/auth'
import { useFilesStore } from '../stores/files'
import api from '../api'

const authStore = useAuthStore()
const filesStore = useFilesStore()
const fileInput = ref(null)
const isDragOver = ref(false)
const uploads = ref([])
let resumable = null

function initResumable() {
  const token = localStorage.getItem('token')
  resumable = new Resumable({
    target: '/api/upload?action=chunk',
    query: { currentPath: filesStore.currentPath },
    headers: { 'Authorization': `Bearer ${token}` },
    chunkSize: 2 * 1024 * 1024,
    simultaneousUploads: 3,
    testChunks: true,
    testMethod: 'GET',
    generateUniqueIdentifier: function(file) {
      return file.size + '-' + file.name.replace(/[^0-9a-zA-Z_-]/img, '')
    }
  })
  
  resumable.on('fileAdded', function(file) {
    uploads.value.push({
      id: file.uniqueIdentifier,
      file: file,
      fileName: file.fileName,
      size: file.size,
      progress: 0,
      speed: '0 KB/s',
      isPaused: false,
      error: false
    })
    resumable.upload()
  })
  
  resumable.on('fileProgress', function(file) {
    const upload = uploads.value.find(u => u.id === file.uniqueIdentifier)
    if (upload) {
      upload.progress = Math.floor(file.progress() * 100)
      upload.speed = formatSpeed(file.averageSpeed || 0)
    }
  })
  
  resumable.on('fileSuccess', async function(file) {
    const upload = uploads.value.find(u => u.id === file.uniqueIdentifier)
    if (upload) {
      upload.progress = 100
      upload.speed = '完成'
      
      try {
        await api.post('/api/upload?action=complete', {
          fileIdentifier: file.uniqueIdentifier,
          fileName: file.fileName,
          currentPath: filesStore.currentPath
        })
        filesStore.fetchFiles(filesStore.currentPath, filesStore.searchQuery)
      } catch (e) {
        upload.error = true
        upload.speed = '合并失败'
      }
    }
  })
  
  resumable.on('fileError', function(file, message) {
    const upload = uploads.value.find(u => u.id === file.uniqueIdentifier)
    if (upload) {
      upload.error = true
      upload.speed = '上传失败'
    }
  })
  
  resumable.on('catchAll', function(event, file) {
    console.log('Resumable event:', event, file)
  })
}

watch(() => filesStore.currentPath, () => {
  if (resumable) {
    resumable.opts.query.currentPath = filesStore.currentPath
  }
})

function triggerFileInput() {
  fileInput.value.click()
}

function handleFileSelect(event) {
  if (resumable) {
    resumable.addFiles(event.target.files)
    event.target.value = ''
  }
}

function handleDrop(event) {
  isDragOver.value = false
  if (resumable && event.dataTransfer?.files) {
    resumable.addFiles(event.dataTransfer.files)
  }
}

function togglePause(upload) {
  if (upload.isPaused) {
    upload.file.resume()
    upload.isPaused = false
    upload.speed = '继续上传'
  } else {
    upload.file.pause()
    upload.isPaused = true
    upload.speed = '已暂停'
  }
}

async function cancelUpload(upload) {
  upload.file.cancel()
  try {
    await api.delete(`/upload?action=cancel&fileIdentifier=${upload.id}`)
  } catch (e) {}
  uploads.value = uploads.value.filter(u => u.id !== upload.id)
}

function clearCompleted() {
  uploads.value = uploads.value.filter(u => u.progress < 100 && !u.error)
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec === 0) return '0 KB/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
  initResumable()
})

onUnmounted(() => {
  if (resumable) {
    resumable.cancel()
  }
})
</script>
