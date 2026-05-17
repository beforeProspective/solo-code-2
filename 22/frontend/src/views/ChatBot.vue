<template>
  <div class="chat-page">
    <div class="chat-container">
      <div class="chat-header">
        <h2>🤖 聊天表单</h2>
        <div class="flow-selector" v-if="flows.length > 0">
          <select v-model="selectedFlowId" @change="startNewChat">
            <option value="">选择对话流程</option>
            <option v-for="flow in flows" :key="flow.id" :value="flow.id">
              {{ flow.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="chat-messages" ref="messagesContainer">
        <div v-if="!selectedFlowId && flows.length > 0" class="welcome-hint">
          请从上方选择一个对话流程开始
        </div>
        <div v-if="flows.length === 0" class="welcome-hint">
          暂无可用的对话流程，请先在后台创建
        </div>

        <div v-for="(msg, idx) in messages" :key="idx"
          class="message"
          :class="msg.type">
          <div class="message-avatar">
            {{ msg.type === 'bot' ? '🤖' : '👤' }}
          </div>
          <div class="message-content">
            <p>{{ msg.content }}</p>
          </div>
        </div>

        <div v-if="isTyping" class="message bot">
          <div class="message-avatar">🤖</div>
          <div class="message-content typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div class="chat-input" v-if="selectedFlowId && !isCompleted">
        <input v-model="inputValue"
          @keyup.enter="sendMessage"
          :placeholder="inputPlaceholder"
          :disabled="isTyping || !currentMessage?.is_question" />
        <button class="btn btn-primary"
          @click="sendMessage"
          :disabled="isTyping || !currentMessage?.is_question || !inputValue.trim()">
          发送
        </button>
      </div>

      <div class="chat-actions" v-if="isCompleted">
        <button class="btn btn-primary" @click="startNewChat">重新开始</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { flowApi, chatApi } from '../api'

const route = useRoute()
const flows = ref([])
const selectedFlowId = ref('')
const messages = ref([])
const inputValue = ref('')
const isTyping = ref(false)
const isCompleted = ref(false)
const currentMessage = ref(null)
const sessionId = ref('')
const collectedData = ref({})
const messagesContainer = ref(null)

const inputPlaceholder = ref('请输入消息...')

const loadFlows = async () => {
  try {
    const res = await flowApi.list()
    flows.value = res.data
    if (route.query.flowId) {
      selectedFlowId.value = parseInt(route.query.flowId)
      startChat()
    }
  } catch (e) {
    console.error('加载流程失败', e)
  }
}

const generateSessionId = () => {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

const startNewChat = () => {
  if (!selectedFlowId.value) return
  messages.value = []
  collectedData.value = {}
  isCompleted.value = false
  currentMessage.value = null
  sessionId.value = generateSessionId()
  startChat()
}

const startChat = async () => {
  if (!selectedFlowId.value) return
  isTyping.value = true
  try {
    const res = await chatApi.start(selectedFlowId.value, sessionId.value)
    await nextTick()
    isTyping.value = false
    currentMessage.value = res.data.message
    addBotMessage(res.data.message.content)
    scrollToBottom()
    if (!res.data.message.is_question) {
      setTimeout(() => sendAutoContinue(), 800)
    }
  } catch (e) {
    isTyping.value = false
    addBotMessage('抱歉，启动对话失败，请稍后重试')
    console.error(e)
  }
}

const sendMessage = async () => {
  if (!inputValue.value.trim() || isTyping.value || !currentMessage.value?.is_question) return

  const userText = inputValue.value.trim()
  addUserMessage(userText)
  inputValue.value = ''
  isTyping.value = true

  try {
    const res = await chatApi.next({
      flow_id: selectedFlowId.value,
      session_id: sessionId.value,
      current_node_id: currentMessage.value.node_id,
      answer: userText,
      collected_data: collectedData.value
    })

    await nextTick()
    isTyping.value = false

    if (res.data.is_completed) {
      isCompleted.value = true
      currentMessage.value = null
      addBotMessage(res.data.message.content)
    } else {
      if (currentMessage.value.field_name) {
        collectedData.value[currentMessage.value.field_name] = userText
      }
      currentMessage.value = res.data.message
      addBotMessage(res.data.message.content)
      if (!res.data.message.is_question) {
        setTimeout(() => sendAutoContinue(), 800)
      }
    }
    scrollToBottom()
  } catch (e) {
    isTyping.value = false
    addBotMessage('抱歉，处理消息失败，请稍后重试')
    console.error(e)
  }
}

const sendAutoContinue = async () => {
  isTyping.value = true
  try {
    const res = await chatApi.next({
      flow_id: selectedFlowId.value,
      session_id: sessionId.value,
      current_node_id: currentMessage.value.node_id,
      answer: null,
      collected_data: collectedData.value
    })

    await nextTick()
    isTyping.value = false

    if (res.data.is_completed) {
      isCompleted.value = true
      currentMessage.value = null
      addBotMessage(res.data.message.content)
    } else {
      currentMessage.value = res.data.message
      addBotMessage(res.data.message.content)
      if (!res.data.message.is_question) {
        setTimeout(() => sendAutoContinue(), 800)
      }
    }
    scrollToBottom()
  } catch (e) {
    isTyping.value = false
    addBotMessage('抱歉，处理消息失败，请稍后重试')
    console.error(e)
  }
}

const addBotMessage = (content) => {
  messages.value.push({ type: 'bot', content })
}

const addUserMessage = (content) => {
  messages.value.push({ type: 'user', content })
}

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

onMounted(() => {
  loadFlows()
})
</script>

<style scoped>
.chat-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 120px);
}

.chat-container {
  width: 100%;
  max-width: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.chat-header {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h2 {
  font-size: 18px;
}

.flow-selector select {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 14px;
}

.flow-selector select option {
  color: #333;
}

.chat-messages {
  height: 450px;
  overflow-y: auto;
  padding: 20px;
  background: #f9fafb;
}

.welcome-hint {
  text-align: center;
  color: #9ca3af;
  padding: 40px 20px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: #dbeafe;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  line-height: 1.5;
}

.message.user .message-content {
  background: #4f46e5;
  color: white;
}

.message-content p {
  margin: 0;
  word-break: break-word;
}

.typing {
  display: flex;
  gap: 4px;
  padding: 16px 20px;
}

.typing span {
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.typing span:nth-child(1) { animation-delay: -0.32s; }
.typing span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.chat-input {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.chat-input input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}

.chat-input input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.chat-actions {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}
</style>
