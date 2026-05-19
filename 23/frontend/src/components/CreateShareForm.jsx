import { useState } from 'react'
import { shareApi } from '../services/api'

export default function CreateShareForm({ fileId, onShareCreated, onCancel }) {
  const [password, setPassword] = useState('')
  const [expireHours, setExpireHours] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = {
        file_id: fileId,
        password: password || undefined,
        expire_hours: expireHours ? parseInt(expireHours) : undefined,
        max_downloads: maxDownloads ? parseInt(maxDownloads) : undefined,
      }

      const response = await shareApi.create(data)
      if (onShareCreated) {
        onShareCreated(response.data)
      }
    } catch (err) {
      setError(err.response?.data?.detail || '创建分享链接失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          访问密码（可选）
        </label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="留空则无需密码"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          过期时间（小时，可选）
        </label>
        <select
          value={expireHours}
          onChange={(e) => setExpireHours(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">永不过期</option>
          <option value="1">1 小时</option>
          <option value="24">24 小时</option>
          <option value="72">3 天</option>
          <option value="168">7 天</option>
          <option value="720">30 天</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          最大下载次数（可选）
        </label>
        <select
          value={maxDownloads}
          onChange={(e) => setMaxDownloads(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">不限制</option>
          <option value="1">1 次</option>
          <option value="5">5 次</option>
          <option value="10">10 次</option>
          <option value="50">50 次</option>
          <option value="100">100 次</option>
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '创建中...' : '创建分享链接'}
        </button>
      </div>
    </form>
  )
}
