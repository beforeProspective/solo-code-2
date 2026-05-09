<template>
  <div class="cupping-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>杯测品鉴记录</span>
          <el-button type="primary" @click="openDialog">
            <el-icon><Plus /></el-icon>
            新增杯测记录
          </el-button>
        </div>
      </template>
      <el-table :data="cuppingList" stripe border>
        <el-table-column prop="roast_batch_number" label="烘焙批次" width="140" />
        <el-table-column prop="roast_bean_name" label="生豆名称" min-width="180" />
        <el-table-column prop="cupping_date" label="杯测日期" width="160">
          <template #default="{ row }">
            {{ formatDate(row.cupping_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="cupper" label="杯测师" width="100" />
        <el-table-column prop="aroma" label="香气" width="80" />
        <el-table-column prop="flavor" label="风味" width="80" />
        <el-table-column prop="aftertaste" label="余韵" width="80" />
        <el-table-column prop="acidity" label="酸度" width="80" />
        <el-table-column prop="body" label="醇厚度" width="80" />
        <el-table-column prop="balance" label="平衡感" width="80" />
        <el-table-column prop="total_score" label="总分" width="90">
          <template #default="{ row }">
            <el-tag :type="getScoreType(row.total_score)">
              {{ row.total_score ? Number(row.total_score).toFixed(2) : '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row)">详情</el-button>
            <el-button type="primary" link @click="editCupping(row)">编辑</el-button>
            <el-button type="danger" link @click="deleteCupping(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑杯测记录' : '新增杯测记录'"
      width="800px"
    >
      <el-form :model="formData" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="烘焙批次" required>
              <el-select v-model="formData.roast_profile" placeholder="请选择" style="width: 100%">
                <el-option
                  v-for="roast in roastingList"
                  :key="roast.id"
                  :label="`${roast.batch_number} - ${roast.green_bean_name || ''}`"
                  :value="roast.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="杯测日期" required>
              <el-date-picker
                v-model="formData.cupping_date"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="杯测师">
          <el-input v-model="formData.cupper" />
        </el-form-item>
        <el-divider content-position="left">冲煮参数</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="冲煮方式">
              <el-input v-model="formData.brew_method" placeholder="手冲/意式/爱乐压" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="粉水比">
              <el-input v-model="formData.brew_ratio" placeholder="1:15" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="研磨度">
              <el-input v-model="formData.grind_size" placeholder="中细研磨" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="水温(℃)">
              <el-input-number v-model="formData.water_temp" :precision="2" :min="0" :max="100" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="冲煮时间">
              <el-input v-model="formData.brew_time" placeholder="2:30" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">评分 (0-10)</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="香气">
              <el-rate v-model="formData.aroma" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="风味">
              <el-rate v-model="formData.flavor" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="余韵">
              <el-rate v-model="formData.aftertaste" :max="10" allow-half />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="酸度">
              <el-rate v-model="formData.acidity" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="醇厚度">
              <el-rate v-model="formData.body" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="平衡感">
              <el-rate v-model="formData.balance" :max="10" allow-half />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="一致性">
              <el-rate v-model="formData.uniformity" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="干净度">
              <el-rate v-model="formData.clean_cup" :max="10" allow-half />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="甜感">
              <el-rate v-model="formData.sweetness" :max="10" allow-half />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="综合评价">
          <el-rate v-model="formData.overall" :max="10" allow-half />
        </el-form-item>
        <el-form-item label="风味描述">
          <el-input type="textarea" v-model="formData.flavor_notes" :rows="3" placeholder="例如：柑橘、焦糖、巧克力" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input type="textarea" v-model="formData.notes" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCupping">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="杯测详情"
      width="600px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="烘焙批次">{{ currentDetail.roast_batch_number }}</el-descriptions-item>
        <el-descriptions-item label="生豆名称">{{ currentDetail.roast_bean_name }}</el-descriptions-item>
        <el-descriptions-item label="杯测日期">{{ formatDate(currentDetail.cupping_date) }}</el-descriptions-item>
        <el-descriptions-item label="杯测师">{{ currentDetail.cupper || '-' }}</el-descriptions-item>
        <el-descriptions-item label="冲煮方式">{{ currentDetail.brew_method || '-' }}</el-descriptions-item>
        <el-descriptions-item label="粉水比">{{ currentDetail.brew_ratio || '-' }}</el-descriptions-item>
        <el-descriptions-item label="研磨度">{{ currentDetail.grind_size || '-' }}</el-descriptions-item>
        <el-descriptions-item label="水温">{{ currentDetail.water_temp || '-' }} ℃</el-descriptions-item>
        <el-descriptions-item label="冲煮时间">{{ currentDetail.brew_time || '-' }}</el-descriptions-item>
        <el-descriptions-item label="总分">
          <el-tag :type="getScoreType(currentDetail.total_score)">{{ currentDetail.total_score || '-' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="香气" :span="2">{{ currentDetail.aroma || '-' }}</el-descriptions-item>
        <el-descriptions-item label="风味">{{ currentDetail.flavor || '-' }}</el-descriptions-item>
        <el-descriptions-item label="余韵">{{ currentDetail.aftertaste || '-' }}</el-descriptions-item>
        <el-descriptions-item label="酸度">{{ currentDetail.acidity || '-' }}</el-descriptions-item>
        <el-descriptions-item label="醇厚度">{{ currentDetail.body || '-' }}</el-descriptions-item>
        <el-descriptions-item label="平衡感">{{ currentDetail.balance || '-' }}</el-descriptions-item>
        <el-descriptions-item label="一致性">{{ currentDetail.uniformity || '-' }}</el-descriptions-item>
        <el-descriptions-item label="干净度">{{ currentDetail.clean_cup || '-' }}</el-descriptions-item>
        <el-descriptions-item label="甜感">{{ currentDetail.sweetness || '-' }}</el-descriptions-item>
        <el-descriptions-item label="综合评价">{{ currentDetail.overall || '-' }}</el-descriptions-item>
        <el-descriptions-item label="风味描述" :span="2">{{ currentDetail.flavor_notes || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentDetail.notes || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cuppingAPI, roastingAPI } from '../api'

const cuppingList = ref([])
const roastingList = ref([])
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const currentDetail = ref({})

const formData = reactive({
  roast_profile: null,
  cupping_date: '',
  cupper: '',
  brew_method: '',
  brew_ratio: '',
  grind_size: '',
  water_temp: null,
  brew_time: '',
  aroma: null,
  flavor: null,
  aftertaste: null,
  acidity: null,
  body: null,
  balance: null,
  uniformity: null,
  clean_cup: null,
  sweetness: null,
  overall: null,
  flavor_notes: '',
  notes: ''
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const getScoreType = (score) => {
  if (!score) return 'info'
  if (score >= 85) return 'success'
  if (score >= 70) return 'warning'
  return 'danger'
}

const loadData = async () => {
  try {
    const [cuppingRes, roastingRes] = await Promise.all([
      cuppingAPI.getAll(),
      roastingAPI.getAll()
    ])
    cuppingList.value = cuppingRes.data.results || cuppingRes.data
    roastingList.value = roastingRes.data.results || roastingRes.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const openDialog = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const viewDetail = (row) => {
  currentDetail.value = row
  detailVisible.value = true
}

const editCupping = (row) => {
  resetForm()
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, row)
  formData.roast_profile = row.roast_profile
  dialogVisible.value = true
}

const resetForm = () => {
  Object.assign(formData, {
    roast_profile: null,
    cupping_date: '',
    cupper: '',
    brew_method: '',
    brew_ratio: '',
    grind_size: '',
    water_temp: null,
    brew_time: '',
    aroma: null,
    flavor: null,
    aftertaste: null,
    acidity: null,
    body: null,
    balance: null,
    uniformity: null,
    clean_cup: null,
    sweetness: null,
    overall: null,
    flavor_notes: '',
    notes: ''
  })
}

const saveCupping = async () => {
  try {
    if (!formData.roast_profile || !formData.cupping_date) {
      ElMessage.warning('请填写必填字段')
      return
    }
    if (isEdit.value) {
      await cuppingAPI.update(currentId.value, formData)
      ElMessage.success('更新成功')
    } else {
      await cuppingAPI.create(formData)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteCupping = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该杯测记录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await cuppingAPI.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
