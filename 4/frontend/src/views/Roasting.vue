<template>
  <div class="roasting-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>烘焙曲线记录</span>
          <el-button type="primary" @click="openDialog">
            <el-icon><Plus /></el-icon>
            新增烘焙记录
          </el-button>
        </div>
      </template>
      <el-table :data="roastingList" stripe border>
        <el-table-column prop="batch_number" label="批次号" width="140" />
        <el-table-column prop="green_bean_name" label="生豆名称" width="180" />
        <el-table-column prop="roast_date" label="烘焙日期" width="160">
          <template #default="{ row }">
            {{ formatDate(row.roast_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="roast_level" label="烘焙度" width="100" />
        <el-table-column prop="roaster_model" label="烘焙机" width="120" />
        <el-table-column prop="input_weight" label="入豆(g)" width="90">
          <template #default="{ row }">
            {{ Number(row.input_weight).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="output_weight" label="出豆(g)" width="90">
          <template #default="{ row }">
            {{ row.output_weight ? Number(row.output_weight).toFixed(0) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="weight_loss" label="失重率(%)" width="100">
          <template #default="{ row }">
            {{ row.weight_loss !== null ? row.weight_loss : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="drop_time" label="总时间(秒)" width="100" />
        <el-table-column prop="drop_temp" label="下豆温度(℃)" width="110" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewChart(row)">查看曲线</el-button>
            <el-button type="primary" link @click="editRoasting(row)">编辑</el-button>
            <el-button type="danger" link @click="deleteRoasting(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑烘焙记录' : '新增烘焙记录'"
      width="800px"
    >
      <el-form :model="formData" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="批次号" required>
              <el-input v-model="formData.batch_number" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生豆" required>
              <el-select v-model="formData.green_bean" placeholder="请选择" style="width: 100%">
                <el-option
                  v-for="bean in beansList"
                  :key="bean.id"
                  :label="bean.name"
                  :value="bean.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="烘焙日期" required>
              <el-date-picker
                v-model="formData.roast_date"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="烘焙机型号">
              <el-input v-model="formData.roaster_model" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="烘焙度">
              <el-input v-model="formData.roast_level" placeholder="浅烘/中烘/深烘" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入豆重量(g)" required>
              <el-input-number v-model="formData.input_weight" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="出豆重量(g)">
              <el-input-number v-model="formData.output_weight" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入豆温度(℃)">
              <el-input-number v-model="formData.charge_temp" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">关键时间点</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="脱水结束(秒)">
              <el-input-number v-model="formData.dry_end_time" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="一爆开始(秒)">
              <el-input-number v-model="formData.fc_start_time" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="一爆结束(秒)">
              <el-input-number v-model="formData.fc_end_time" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="二爆开始(秒)">
              <el-input-number v-model="formData.sc_start_time" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="下豆时间(秒)" required>
              <el-input-number v-model="formData.drop_time" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="下豆温度(℃)" required>
              <el-input-number v-model="formData.drop_temp" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="烘焙笔记">
          <el-input type="textarea" v-model="formData.notes" :rows="3" />
        </el-form-item>
        <el-divider content-position="left">温度点数据</el-divider>
        <el-form-item label="添加温度点">
          <el-input-number v-model="newTempPoint.time" placeholder="时间(秒)" :min="0" style="width: 150px; margin-right: 10px" />
          <el-input-number v-model="newTempPoint.temperature" placeholder="温度(℃)" :precision="2" :min="0" style="width: 150px; margin-right: 10px" />
          <el-button type="primary" @click="addTempPoint">添加</el-button>
        </el-form-item>
        <el-table :data="formData.temperature_points" border size="small">
          <el-table-column type="index" label="序号" width="60" />
          <el-table-column prop="time_seconds" label="时间(秒)" />
          <el-table-column prop="temperature" label="温度(℃)" />
          <el-table-column label="操作" width="100">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeTempPoint($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRoasting">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="chartVisible"
      title="烘焙曲线图表"
      width="900px"
    >
      <div ref="chartRef" style="width: 100%; height: 500px"></div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { roastingAPI, beansAPI } from '../api'

const roastingList = ref([])
const beansList = ref([])
const dialogVisible = ref(false)
const chartVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const chartRef = ref(null)
let chartInstance = null

const newTempPoint = reactive({
  time: 0,
  temperature: 0
})

const formData = reactive({
  batch_number: '',
  green_bean: null,
  roast_date: '',
  roaster_model: '',
  roast_level: '',
  input_weight: null,
  output_weight: null,
  charge_temp: null,
  dry_end_time: null,
  dry_end_temp: null,
  fc_start_time: null,
  fc_start_temp: null,
  fc_end_time: null,
  fc_end_temp: null,
  sc_start_time: null,
  sc_start_temp: null,
  drop_time: null,
  drop_temp: null,
  notes: '',
  temperature_points: []
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const loadData = async () => {
  try {
    const [roastingRes, beansRes] = await Promise.all([
      roastingAPI.getAll(),
      beansAPI.getAll()
    ])
    roastingList.value = roastingRes.data.results || roastingRes.data
    beansList.value = beansRes.data.results || beansRes.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const openDialog = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const editRoasting = (row) => {
  resetForm()
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, row)
  formData.green_bean = row.green_bean
  formData.temperature_points = row.temperature_points ? [...row.temperature_points] : []
  dialogVisible.value = true
}

const resetForm = () => {
  Object.assign(formData, {
    batch_number: '',
    green_bean: null,
    roast_date: '',
    roaster_model: '',
    roast_level: '',
    input_weight: null,
    output_weight: null,
    charge_temp: null,
    dry_end_time: null,
    dry_end_temp: null,
    fc_start_time: null,
    fc_start_temp: null,
    fc_end_time: null,
    fc_end_temp: null,
    sc_start_time: null,
    sc_start_temp: null,
    drop_time: null,
    drop_temp: null,
    notes: '',
    temperature_points: []
  })
}

const addTempPoint = () => {
  if (newTempPoint.temperature > 0) {
    formData.temperature_points.push({
      time_seconds: newTempPoint.time,
      temperature: newTempPoint.temperature
    })
    formData.temperature_points.sort((a, b) => a.time_seconds - b.time_seconds)
    newTempPoint.time = 0
    newTempPoint.temperature = 0
  }
}

const removeTempPoint = (index) => {
  formData.temperature_points.splice(index, 1)
}

const saveRoasting = async () => {
  try {
    if (!formData.batch_number || !formData.green_bean || !formData.roast_date ||
        formData.input_weight === null || formData.drop_time === null || formData.drop_temp === null) {
      ElMessage.warning('请填写必填字段')
      return
    }
    if (isEdit.value) {
      await roastingAPI.update(currentId.value, formData)
      ElMessage.success('更新成功')
    } else {
      await roastingAPI.create(formData)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteRoasting = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除批次 ${row.batch_number} 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await roastingAPI.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const viewChart = async (row) => {
  chartVisible.value = true
  await nextTick()
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)
  
  const detail = await roastingAPI.getById(row.id)
  const points = detail.data.temperature_points || []
  
  const option = {
    title: {
      text: `烘焙曲线 - ${row.batch_number}`,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      name: '时间(秒)',
      data: points.map(p => p.time_seconds)
    },
    yAxis: {
      type: 'value',
      name: '温度(℃)'
    },
    series: [{
      name: '温度',
      type: 'line',
      smooth: true,
      data: points.map(p => Number(p.temperature)),
      markLine: {
        data: [
          row.fc_start_time ? { xAxis: row.fc_start_time, label: { formatter: '一爆开始' } } : null,
          row.sc_start_time ? { xAxis: row.sc_start_time, label: { formatter: '二爆开始' } } : null
        ].filter(Boolean)
      }
    }]
  }
  
  chartInstance.setOption(option)
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
