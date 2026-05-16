<template>
  <div class="contract-setup">
    <div class="page-header">
      <h2>
        <el-icon color="#409EFF"><Setting /></el-icon>
        设置签署 - {{ contract?.title || '加载中...' }}
      </h2>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <el-card class="pdf-preview-card">
          <template #header>
            <div class="card-header">
              <span>合同预览</span>
              <div class="page-controls">
                <el-button 
                  size="small" 
                  @click="prevPage" 
                  :disabled="currentPage <= 1"
                >
                  <el-icon><ArrowLeft /></el-icon>
                  上一页
                </el-button>
                <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
                <el-button 
                  size="small" 
                  @click="nextPage" 
                  :disabled="currentPage >= totalPages"
                >
                  下一页
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </div>
            </div>
          </template>

          <div class="pdf-container" ref="pdfContainer">
            <img 
              :src="pageImageUrl" 
              :style="{ width: '100%' }"
              @load="onImageLoad"
            />
            <svg 
              class="overlay" 
              :viewBox="`0 0 ${imageWidth} ${imageHeight}`"
              @mousedown="startDrawing"
              @mousemove="updateDrawing"
              @mouseup="finishDrawing"
              @mouseleave="cancelDrawing"
            >
              <rect
                v-for="(pos, index) in currentPagePositions"
                :key="index"
                :x="pos.x"
                :y="pos.y"
                :width="pos.width"
                :height="pos.height"
                class="signature-rect existing"
              />
              <rect
                v-if="isDrawing"
                :x="drawStart.x"
                :y="drawStart.y"
                :width="drawWidth"
                :height="drawHeight"
                class="signature-rect drawing"
              />
            </svg>
          </div>

          <div class="hint">
            <el-icon><InfoFilled /></el-icon>
            在 PDF 上拖动鼠标绘制签名区域，每个签署人对应一个签名位置
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card class="signers-card">
          <template #header>
            <div class="card-header">
              <span>签署人列表</span>
              <el-button 
                size="small" 
                type="primary"
                @click="addSigner"
                :disabled="signers.length >= 10"
              >
                <el-icon><Plus /></el-icon>
                添加
              </el-button>
            </div>
          </template>

          <div class="signers-list">
            <div 
              v-for="(signer, index) in signers" 
              :key="index"
              class="signer-item"
              :class="{ active: selectedSignerIndex === index }"
              @click="selectSigner(index)"
            >
              <div class="signer-avatar">{{ index + 1 }}</div>
              <div class="signer-info">
                <el-input 
                  v-model="signer.name" 
                  placeholder="姓名"
                  size="small"
                  @click.stop
                />
                <el-input 
                  v-model="signer.email" 
                  placeholder="邮箱"
                  size="small"
                  type="email"
                  @click.stop
                />
              </div>
              <el-button 
                size="small" 
                type="danger" 
                text
                @click.stop="removeSigner(index)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div v-if="signers.length === 0" class="empty-hint">
              请添加签署人
            </div>
          </div>

          <el-divider />

          <div class="positions-info">
            <h4>已选位置 ({{ positions.length }})</h4>
            <div class="position-list">
              <div 
                v-for="(pos, index) in positions" 
                :key="index"
                class="position-item"
              >
                <span>第 {{ pos.page }} 页</span>
                <span>{{ Math.round(pos.x) }}, {{ Math.round(pos.y) }}</span>
                <el-button 
                  size="small" 
                  type="danger" 
                  text
                  @click="removePosition(index)"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </el-card>

        <el-card class="actions-card">
          <el-button 
            type="primary" 
            size="large" 
            style="width: 100%"
            :loading="submitting"
            @click="submit"
            :disabled="!canSubmit"
          >
            生成签署链接
          </el-button>
          <el-button 
            size="large" 
            style="width: 100%; margin-top: 10px"
            @click="$router.push('/contracts')"
          >
            取消
          </el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { contractApi } from '../api'

const route = useRoute()
const router = useRouter()
const contractId = route.params.id

const contract = ref(null)
const loading = ref(true)
const submitting = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const pageImageUrl = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)
const pdfContainer = ref(null)

const signers = ref([])
const positions = ref([])
const selectedSignerIndex = ref(0)

const isDrawing = ref(false)
const drawStart = ref({ x: 0, y: 0 })
const drawEnd = ref({ x: 0, y: 0 })

const drawWidth = computed(() => drawEnd.value.x - drawStart.value.x)
const drawHeight = computed(() => drawEnd.value.y - drawStart.value.y)

const currentPagePositions = computed(() => {
  return positions.value.filter(p => p.page === currentPage.value)
})

const canSubmit = computed(() => {
  return signers.value.length > 0 &&
         positions.value.length === signers.value.length &&
         signers.value.every(s => s.name && s.email)
})

const loadContract = async () => {
  try {
    const res = await contractApi.get(contractId)
    contract.value = res.data
    totalPages.value = res.data.total_pages
    loadPageImage(currentPage.value)
  } catch (err) {
    ElMessage.error('加载合同信息失败')
  } finally {
    loading.value = false
  }
}

const loadPageImage = async (pageNum) => {
  try {
    const res = await contractApi.getPage(contractId, pageNum)
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
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    loadPageImage(currentPage.value)
  }
}

const getSvgCoords = (e) => {
  const svg = e.currentTarget
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse())
  return { x: svgP.x, y: svgP.y }
}

const startDrawing = (e) => {
  if (positions.value.length >= signers.value.length) {
    ElMessage.warning('签名位置数量已等于签署人数量，请先添加更多签署人')
    return
  }
  const coords = getSvgCoords(e)
  isDrawing.value = true
  drawStart.value = coords
  drawEnd.value = coords
}

const updateDrawing = (e) => {
  if (!isDrawing.value) return
  drawEnd.value = getSvgCoords(e)
}

const finishDrawing = (e) => {
  if (!isDrawing.value) return
  isDrawing.value = false
  
  const x = Math.min(drawStart.value.x, drawEnd.value.x)
  const y = Math.min(drawStart.value.y, drawEnd.value.y)
  const width = Math.abs(drawEnd.value.x - drawStart.value.x)
  const height = Math.abs(drawEnd.value.y - drawStart.value.y)
  
  if (width > 30 && height > 20) {
    positions.value.push({
      page: currentPage.value,
      x: x,
      y: y,
      width: width,
      height: height
    })
  }
}

const cancelDrawing = () => {
  isDrawing.value = false
}

const addSigner = () => {
  if (signers.value.length < 10) {
    signers.value.push({ name: '', email: '' })
  }
}

const removeSigner = (index) => {
  signers.value.splice(index, 1)
  if (positions.value.length > signers.value.length) {
    positions.value.pop()
  }
  if (selectedSignerIndex.value >= signers.value.length) {
    selectedSignerIndex.value = Math.max(0, signers.value.length - 1)
  }
}

const selectSigner = (index) => {
  selectedSignerIndex.value = index
}

const removePosition = (index) => {
  positions.value.splice(index, 1)
}

const submit = async () => {
  if (!canSubmit.value) {
    ElMessage.warning('请完整填写签署人信息并选择签名位置')
    return
  }

  submitting.value = true
  try {
    const data = {
      signers: signers.value,
      positions: positions.value
    }
    
    await contractApi.addSigners(contractId, data)
    ElMessage.success('签署链接已生成！')
    router.push(`/contracts/${contractId}`)
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadContract()
  addSigner()
})
</script>

<style scoped>
.contract-setup {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px 0;
  font-size: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pdf-container {
  position: relative;
  background: #f0f0f0;
  min-height: 400px;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.signature-rect {
  fill: rgba(64, 158, 255, 0.2);
  stroke: #409eff;
  stroke-width: 2;
  stroke-dasharray: 5, 5;
}

.signature-rect.drawing {
  fill: rgba(103, 194, 58, 0.2);
  stroke: #67c23a;
}

.hint {
  margin-top: 12px;
  padding: 10px;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.signers-card {
  margin-bottom: 20px;
}

.signers-list {
  max-height: 400px;
  overflow-y: auto;
}

.signer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 10px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s;
}

.signer-item:hover {
  background: #e8f4ff;
}

.signer-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.signer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #409eff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.signer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.positions-info h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #606266;
}

.position-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
}

.actions-card {
  padding: 20px;
}
</style>
