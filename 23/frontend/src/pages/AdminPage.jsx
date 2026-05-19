import { useState, useEffect } from 'react'
import { adminApi } from '../services/api'
import { formatFileSize, formatDate } from '../utils/format'

export default function AdminPage() {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadShares()
  }, [])

  const loadShares = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await adminApi.getAllShares()
      setShares(response.data)
    } catch (err) {
      setError('加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivate = async (shareId) => {
    if (!confirm('确定要停用此分享链接吗？')) {
      return
    }
    try {
      await adminApi.deactivateShare(shareId)
      loadShares()
    } catch (err) {
      setError('操作失败，请重试')
    }
  }

  const getStatusBadge = (share) => {
    if (!share.is_active) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
          已停用
        </span>
      )
    }
    if (share.expire_at && new Date(share.expire_at) < new Date()) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-600 rounded-full">
          已过期
        </span>
      )
    }
    if (
      share.max_downloads &&
      share.download_count >= share.max_downloads
    ) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-600 rounded-full">
          下载次数已用完
        </span>
      )
    }
    return (
      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-600 rounded-full">
        有效
      </span>
    )
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 text-center">
        <div className="animate-spin w-12 h-12 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full" />
        <p className="text-gray-600">加载中...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">管理面板</h1>
        <p className="text-gray-600">查看和管理所有分享记录</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  文件名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  大小
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  分享码
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  过期时间
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  下载次数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shares.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    暂无分享记录
                  </td>
                </tr>
              ) : (
                shares.map((share) => (
                  <tr key={share.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-4 h-4 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate max-w-xs">
                            {share.original_filename}
                          </p>
                          <div className="flex items-center gap-1">
                            {share.has_password && (
                              <span className="text-xs text-yellow-600">
                                🔒 密码保护
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatFileSize(share.file_size)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 font-mono">
                      {share.share_code}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDate(share.created_at)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {share.expire_at
                        ? formatDate(share.expire_at)
                        : '永不过期'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {share.download_count}
                      {share.max_downloads ? ` / ${share.max_downloads}` : ''}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(share)}
                    </td>
                    <td className="px-4 py-4">
                      {share.is_active && (
                        <button
                          onClick={() => handleDeactivate(share.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          停用
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
