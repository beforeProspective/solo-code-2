<template>
  <div class="sign-page">
    <el-card v-if="signInfo" class="sign-card">
      <template #header>
        <div class="card-header">
          <el-icon :size="24" color="#409EFF"><EditPen /></el-icon>
          <h2>合同签署</h2>
        </div>
      </template>

      <div class="signer-info">
        <el-alert 
          type="info" 
          :closable="false"
          show-icon
        >
          <template #title>
            欢迎 <strong>{{ signInfo.signer_name }}</strong>，请仔细阅读合同并在指定位置签名
          </template>
          合同名称：{{ signInfo.contract_title }}
        </el-alert>
      </div>

      <el-divider />

      <div class="pdf-preview-section">
        <h3>合同预览</h3>
        <div class="pdf-navigation">
          <el-button 
            size="small" 
            @click="prevPage" 
            :disabled="currentPage <= 1"
          >
            <el-icon><ArrowLeft /></el-icon>
            上一页
          </el-button>
          <span>第 {{ currentPage }} / {{ signInfo.total_pages }} 页</span>
          <el-button 
            size="small" 
            @click="nextPage" 
            :disabled="currentPage >= signInfo.total_pages"
          >
            下一页
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
        <div class="pdf-container">
          <img 
            :src="pageImageUrl" 
            :style="{ width: '100%' }"
            @load="onImageLoad"
          />
        </div>
      </div>

      <el-divider />

      <div class="signature-section">
        <h3>请在下方绘制您的签名</h3>
        <div class="canvas-wrapper">
          <canvas 
            ref="signatureCanvas"
            :width="canvasWidth"
            :height="canvasHeight"
            @mousedown="startDrawing"
            @mousemove="draw"
            @mouseup="stopDrawing"
            @mouseleave="stopDrawing"
            @touchstart.prevent="handleTouchStart"
            @touchmove.prevent="handleTouchMove"
            @touchend.prevent="stopDrawing"
          ></canvas>
        </div>
        <div class="canvas-actions">
          <el-button @click="clearCanvas">
            <el-icon><RefreshRight /></el-icon>
            清除重写
          </el-button>
          <el-button 
            type="primary" 
            size="large"
            :disabled="!hasSignature || submitting"
            :loading="submitting"
            @click="submitSignature"
          >
            <el-icon><Check /></el-icon>
            确认签署
          </el-button>
        </div>
      </div>
    </el-card>

    <el-card v-else-if="error" class="error-card">
      <el-result :icon="errorIcon" :title="errorTitle" :sub-title="errorMessage">
        <template #extra>
          <el-button type="primary" @click="$router.push('/')">
            返回首页
          </el-button>
        </template>
      </el-result>
    </el-card>

    <el-skeleton v-else :rows="15" animated />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { signApi } from '../api'

const route = useRoute()
const router = useRouter()
const token = route.params.token

const signInfo = ref(null)
const error = ref(null)
const errorIcon = ref('error')
const errorTitle = ref('')
const errorMessage = ref('')

const currentPage = ref(1)
const pageImageUrl = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)

const signatureCanvas = ref(null)
const canvasWidth = 600
const canvasHeight = 200
const isDrawing = ref(false)
const hasSignature = ref(false)
const submitting = ref(false)

let ctx = null
let lastX = 0
let lastY = 0

const loadSignInfo = async () => {
  try {
    const res = await signApi.getInfo(token)
    signInfo.value = res.data
    loadPageImage(currentPage.value)
    initCanvas()
  } catch (err) {
    error.value = true
    const detail = err.response?.data?.detail || '加载失败'
    if (detail.includes('已完成签署')) {
      errorIcon.value = 'success'
      errorTitle.value = '已完成签署'
      errorMessage.value = '该合同您已完成签署，无需重复操作'
    } else if (detail.includes('已过期')) {
      errorIcon.value = 'warning'
      errorTitle.value = '链接已过期'
      errorMessage.value = '签署链接已过期，请联系发件人重新发送'
    } else {
      errorIcon.value = 'error'
      errorTitle.value = '链接无效'
      errorMessage.value = detail
    }
  }
}

const loadPageImage = async (pageNum) => {
  try {
    const res = await signApi.getPage(token, pageNum)
    const blob = new Blob([res.data], { type: 'image/png' })
    pageImageUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    ElMessage.error('加载页面失败')
  }
}

const onImageLoad = (e) => {
  imageWidth.value = e.target.naturalWidth
  imageHeight.value = e.target.naturalHeight
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadPageImage(currentPage.value)
  }
}

const nextPage = () => {
  if (currentPage.value < signInfo.value.total_pages) {
    currentPage.value++
    loadPageImage(currentPage.value)
  }
}

const initCanvas = async () => {
  await nextTick()
  const canvas = signatureCanvas.value
  if (!canvas) return
  
  ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

const getCanvasCoords = (e) => {
  const canvas = signatureCanvas.value
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height
  
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

const startDrawing = (e) => {
  isDrawing.value = true
  hasSignature.value = true
  const coords = getCanvasCoords(e)
  lastX = coords.x
  lastY = coords.y
}

const draw = (e) => {
  if (!isDrawing.value) return
  
  const coords = getCanvasCoords(e)
  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(coords.x, coords.y)
  ctx.stroke()
  lastX = coords.x
  lastY = coords.y
}

const stopDrawing = () => {
  isDrawing.value = false
}

const handleTouchStart = (e) => {
  startDrawing(e)
}

const handleTouchMove = (e) => {
  draw(e)
}

const clearCanvas = () => {
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    hasSignature.value = false
  }
}

const submitSignature = async () => {
  if (!hasSignature.value) {
    ElMessage.warning('请先绘制签名')
    return
  }

  submitting.value = true
  try {
    const canvas = signatureCanvas.value
    const signatureData = canvas.toDataURL('image/png')
    
    await signApi.submit(token, { signature_data: signatureData })
    
    ElMessage.success('签署成功！')
    
    setTimeout(() => {
      router.push('/')
    }, 2000)
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '签署失败')
  } finally {
    submitting.value = false
  }
}

onMounted(loadSignInfo)
</script>

<style scoped>
.sign-page {
  max-width: 900px;
  margin: 0 auto;
}

.sign-card {
  border-radius: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
}

.signer-info {
  margin-bottom: 20px;
}

h3 {
  margin: 0 0 15px;
  font-size: 16px;
}

.pdf-navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 15px;
}

.pdf-container {
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  min-height: 300px;
}

.canvas-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 15px;
}

canvas {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  background: white;
  cursor: crosshair;
  max-width: 100%;
  touch-action: none;
}

.canvas-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.error-card {
  max-width: 500px;
  margin: 0 auto;
}
</style>
