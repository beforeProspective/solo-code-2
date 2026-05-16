<template>
  <div class="file-browser">
    <div class="toolbar">
      <div class="field has-addons">
        <p class="control">
          <o-button v-if="authStore.isEditable" variant="primary" @click="showNewFolderModal = true">
            <o-icon icon="folder-plus" pack="fas"></o-icon>&nbsp;新建文件夹
          </o-button>
        </p>
        <p class="control">
          <o-button v-if="authStore.isEditable" variant="info" @click="showNewFileModal = true">
            <o-icon icon="file-plus" pack="fas"></o-icon>&nbsp;新建文件
          </o-button>
        </p>
      </div>
      
      <div class="field has-addons">
        <p class="control">
          <o-button v-if="authStore.isEditable" :disabled="filesStore.selectedItems.length === 0" variant="warning" @click="copyItems">
            <o-icon icon="copy" pack="fas"></o-icon>&nbsp;复制 ({{ filesStore.selectedItems.length }})
          </o-button>
        </p>
        <p class="control">
          <o-button v-if="authStore.isEditable" :disabled="filesStore.selectedItems.length === 0" variant="warning" @click="cutItems">
            <o-icon icon="cut" pack="fas"></o-icon>&nbsp;剪切
          </o-button>
        </p>
        <p class="control">
          <o-button v-if="authStore.isEditable" :disabled="filesStore.clipboard.items.length === 0" variant="success" @click="pasteItems">
            <o-icon icon="paste" pack="fas"></o-icon>&nbsp;粘贴 ({{ filesStore.clipboard.items.length }})
          </o-button>
        </p>
      </div>
      
      <div class="field has-addons">
        <p class="control">
          <o-button v-if="authStore.isEditable" :disabled="filesStore.selectedItems.length === 0" variant="danger" @click="deleteSelected">
            <o-icon icon="trash" pack="fas"></o-icon>&nbsp;删除
          </o-button>
        </p>
        <p class="control">
          <o-button v-if="filesStore.selectedItems.length > 0" variant="link" @click="downloadSelected">
            <o-icon icon="download" pack="fas"></o-icon>&nbsp;下载
          </o-button>
        </p>
      </div>
      
      <div class="field" style="margin-left: auto;">
        <p class="control has-icons-right">
          <o-input v-model="searchInput" placeholder="搜索文件..." @keyup.enter="doSearch" size="small">
            <template #right>
              <o-icon icon="search" pack="fas"></o-icon>
            </template>
          </o-input>
        </p>
      </div>
    </div>
    
    <div class="breadcrumb">
      <span v-for="(crumb, index) in filesStore.breadcrumbs" :key="index" class="breadcrumb-item">
        <a href="#" @click.prevent="navigateTo(crumb.path)">{{ crumb.name }}</a>
      </span>
      <span v-if="filesStore.clipboard.items.length > 0" class="tag is-warning is-pulled-right">
        剪贴板: {{ filesStore.clipboard.items.length }} 项 ({{ filesStore.clipboard.action === 'copy' ? '复制' : '剪切' }})
      </span>
    </div>
    
    <div v-if="filesStore.loading" class="has-text-centered" style="padding: 50px;">
      <o-loading active></o-loading>
    </div>
    
    <div v-else class="file-list" @contextmenu.prevent="showContextMenu($event, null)">
      <div
        v-for="item in filesStore.items"
        :key="item.path"
        class="file-item"
        :class="{ selected: isSelected(item) }"
        @click="handleClick($event, item)"
        @dblclick="openItem(item)"
        @contextmenu.prevent="showContextMenu($event, item)"
      >
        <span class="file-icon">
          <o-icon :icon="getFileIcon(item)" :pack="item.type === 'directory' ? 'fas' : 'far'" :variant="item.type === 'directory' ? 'warning' : ''"></o-icon>
        </span>
        <span class="file-name">{{ item.name }}</span>
        <span class="file-size">{{ formatSize(item.size) }}</span>
        <span class="file-modified">{{ formatDate(item.modified) }}</span>
      </div>
      
      <div v-if="filesStore.items.length === 0" class="has-text-centered" style="padding: 50px; color: #999;">
        <o-icon icon="folder-open" pack="fas" size="large"></o-icon>
        <p>文件夹为空</p>
      </div>
    </div>
    
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click="contextMenu.visible = false">
      <div v-if="contextMenu.item" class="context-menu-item" @click="openItem(contextMenu.item)">
        <o-icon icon="folder-open" pack="fas"></o-icon> 打开
      </div>
      <div v-if="contextMenu.item && contextMenu.item.type === 'file'" class="context-menu-item" @click="openPreview(contextMenu.item)">
        <o-icon icon="eye" pack="fas"></o-icon> 预览
      </div>
      <div v-if="contextMenu.item && isTextFile(contextMenu.item) && authStore.isEditable" class="context-menu-item" @click="editItem(contextMenu.item)">
        <o-icon icon="edit" pack="fas"></o-icon> 编辑
      </div>
      <div v-if="authStore.isEditable" class="context-menu-item" @click="contextMenu.item ? renameItem(contextMenu.item) : showNewFolderModal = true">
        <o-icon :icon="contextMenu.item ? 'pencil-alt' : 'folder-plus'" pack="fas"></o-icon>
        {{ contextMenu.item ? '重命名' : '新建文件夹' }}
      </div>
      <div v-if="contextMenu.item && authStore.isEditable" class="context-menu-item" @click="copyItems([contextMenu.item])">
        <o-icon icon="copy" pack="fas"></o-icon> 复制
      </div>
      <div v-if="contextMenu.item && authStore.isEditable" class="context-menu-item" @click="cutItems([contextMenu.item])">
        <o-icon icon="cut" pack="fas"></o-icon> 剪切
      </div>
      <div v-if="filesStore.clipboard.items.length > 0 && authStore.isEditable" class="context-menu-item" @click="pasteItems">
        <o-icon icon="paste" pack="fas"></o-icon> 粘贴
      </div>
      <div v-if="contextMenu.item" class="context-menu-item" @click="downloadItem(contextMenu.item)">
        <o-icon icon="download" pack="fas"></o-icon> 下载
      </div>
      <div v-if="contextMenu.item && authStore.isEditable" class="context-menu-item" style="color: #ff3860;" @click="deleteItem(contextMenu.item)">
        <o-icon icon="trash" pack="fas"></o-icon> 删除
      </div>
    </div>
    
    <o-modal v-model:active="showNewFolderModal" title="新建文件夹" width="400">
      <o-field label="文件夹名称">
        <o-input v-model="newFolderName" placeholder="请输入文件夹名称" @keyup.enter="createFolder"></o-input>
      </o-field>
      <template #footer>
        <o-button @click="showNewFolderModal = false">取消</o-button>
        <o-button variant="primary" @click="createFolder">创建</o-button>
      </template>
    </o-modal>
    
    <o-modal v-model:active="showNewFileModal" title="新建文件" width="400">
      <o-field label="文件名称">
        <o-input v-model="newFileName" placeholder="例如: example.txt" @keyup.enter="createFile"></o-input>
      </o-field>
      <template #footer>
        <o-button @click="showNewFileModal = false">取消</o-button>
        <o-button variant="primary" @click="createFile">创建</o-button>
      </template>
    </o-modal>
    
    <o-modal v-model:active="showRenameModal" title="重命名" width="400">
      <o-field label="新名称">
        <o-input v-model="renameInput" @keyup.enter="doRename"></o-input>
      </o-field>
      <template #footer>
        <o-button @click="showRenameModal = false">取消</o-button>
        <o-button variant="primary" @click="doRename">确定</o-button>
      </template>
    </o-modal>
    
    <o-modal v-model:active="showEditModal" title="编辑文件" width="800">
      <o-field label="文件内容">
        <o-input v-model="editContent" type="textarea" rows="20"></o-input>
      </o-field>
      <template #footer>
        <o-button @click="showEditModal = false">取消</o-button>
        <o-button variant="primary" @click="saveEdit">保存</o-button>
      </template>
    </o-modal>
    
    <o-modal v-model:active="showPreviewModal" :title="previewFile?.name" class="preview-modal" width="800">
      <div class="preview-content">
        <img v-if="isImageFile(previewFile)" :src="filesStore.getPreviewUrl(previewFile?.path)" class="preview-image">
        <pre v-else class="preview-text">{{ previewContent }}</pre>
      </div>
    </o-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useFilesStore } from '../stores/files'
import api from '../api'

const authStore = useAuthStore()
const filesStore = useFilesStore()

const searchInput = ref('')
const showNewFolderModal = ref(false)
const showNewFileModal = ref(false)
const showRenameModal = ref(false)
const showEditModal = ref(false)
const showPreviewModal = ref(false)
const newFolderName = ref('')
const newFileName = ref('')
const renameInput = ref('')
const editContent = ref('')
const previewFile = ref(null)
const previewContent = ref('')
const editingItem = ref(null)
const contextMenuItem = ref(null)

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null
})

function isSelected(item) {
  return filesStore.selectedItems.some(i => i.path === item.path)
}

function handleClick(event, item) {
  console.log('Clicked item:', item)
  filesStore.selectItem(item, event.ctrlKey || event.metaKey)
  console.log('Selected items:', filesStore.selectedItems)
  hideContextMenu()
}

function openItem(item) {
  if (item.type === 'directory') {
    filesStore.fetchFiles(item.path, filesStore.searchQuery)
  } else {
    openPreview(item)
  }
  hideContextMenu()
}

function navigateTo(path) {
  filesStore.fetchFiles(path, filesStore.searchQuery)
}

function getFileIcon(item) {
  if (item.type === 'directory') return 'folder'
  const ext = item.name.split('.').pop().toLowerCase()
  const iconMap = {
    pdf: 'file-pdf',
    doc: 'file-word', docx: 'file-word',
    xls: 'file-excel', xlsx: 'file-excel',
    ppt: 'file-powerpoint', pptx: 'file-powerpoint',
    jpg: 'file-image', jpeg: 'file-image', png: 'file-image', gif: 'file-image', webp: 'file-image',
    zip: 'file-archive', rar: 'file-archive', '7z': 'file-archive',
    mp3: 'file-audio', wav: 'file-audio',
    mp4: 'file-video', avi: 'file-video',
    txt: 'file-alt', md: 'file-alt',
    html: 'file-code', css: 'file-code', js: 'file-code', json: 'file-code'
  }
  return iconMap[ext] || 'file'
}

function formatSize(bytes) {
  if (bytes === 0) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

function isTextFile(item) {
  const ext = item.name.split('.').pop().toLowerCase()
  const textExts = ['txt', 'md', 'html', 'css', 'js', 'json', 'xml', 'csv', 'php', 'py', 'java', 'c', 'cpp', 'h', 'sh', 'bat', 'ini', 'conf', 'log']
  return textExts.includes(ext)
}

function isImageFile(item) {
  if (!item) return false
  const ext = item.name.split('.').pop().toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
}

async function doSearch() {
  await filesStore.fetchFiles(filesStore.currentPath, searchInput.value)
}

async function createFolder() {
  if (!newFolderName.value.trim()) return
  const result = await filesStore.createDirectory(newFolderName.value.trim())
  if (result.success) {
    showNewFolderModal.value = false
    newFolderName.value = ''
  } else {
    alert(result.error)
  }
}

async function createFile() {
  if (!newFileName.value.trim()) return
  const result = await filesStore.createFile(newFileName.value.trim(), '')
  if (result.success) {
    showNewFileModal.value = false
    newFileName.value = ''
  } else {
    alert(result.error)
  }
}

function renameItem(item) {
  contextMenuItem.value = item
  renameInput.value = item.name
  showRenameModal.value = true
  hideContextMenu()
}

async function doRename() {
  if (!renameInput.value.trim() || !contextMenuItem.value) return
  const result = await filesStore.renameItem(contextMenuItem.value.path, renameInput.value.trim())
  if (result.success) {
    showRenameModal.value = false
    contextMenuItem.value = null
  } else {
    alert(result.error)
  }
}

async function editItem(item) {
  editingItem.value = item
  try {
    const response = await api.get(`/files?action=preview&path=${encodeURIComponent(item.path)}`)
    editContent.value = response.data
    showEditModal.value = true
  } catch (e) {
    alert('无法读取文件')
  }
  hideContextMenu()
}

async function saveEdit() {
  if (!editingItem.value) return
  const result = await filesStore.editFile(editingItem.value.path, editContent.value)
  if (result.success) {
    showEditModal.value = false
    editingItem.value = null
  } else {
    alert(result.error)
  }
}

async function openPreview(item) {
  previewFile.value = item
  if (!isImageFile(item)) {
    try {
      const response = await api.get(`/files?action=preview&path=${encodeURIComponent(item.path)}`)
      previewContent.value = response.data
    } catch (e) {
      previewContent.value = '无法预览此文件'
    }
  }
  showPreviewModal.value = true
  hideContextMenu()
}

function copyItems(items = null) {
  if (items) {
    filesStore.selectedItems = items
  }
  filesStore.copyItems()
  hideContextMenu()
}

function cutItems(items = null) {
  if (items) {
    filesStore.selectedItems = items
  }
  filesStore.cutItems()
  hideContextMenu()
}

async function pasteItems() {
  const result = await filesStore.pasteItems()
  if (!result.success) {
    alert(result.error)
  }
  hideContextMenu()
}

function deleteItem(item) {
  if (confirm(`确定要删除 "${item.name}" 吗？`)) {
    filesStore.deleteItems([item.path])
  }
  hideContextMenu()
}

function deleteSelected() {
  if (filesStore.selectedItems.length === 0) return
  if (confirm(`确定要删除选中的 ${filesStore.selectedItems.length} 项吗？`)) {
    filesStore.deleteItems(filesStore.selectedPaths)
  }
}

function downloadItem(item) {
  window.open(filesStore.getDownloadUrl(item.path), '_blank')
  hideContextMenu()
}

function downloadSelected() {
  if (filesStore.selectedItems.length === 0) return
  if (filesStore.selectedItems.length === 1) {
    window.open(filesStore.getDownloadUrl(filesStore.selectedItems[0].path), '_blank')
  } else {
    window.open(filesStore.getBulkDownloadUrl(filesStore.selectedPaths), '_blank')
  }
}

function showContextMenu(event, item) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item
  }
}

function hideContextMenu() {
  contextMenu.value.visible = false
}

function handleGlobalClick() {
  hideContextMenu()
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>
