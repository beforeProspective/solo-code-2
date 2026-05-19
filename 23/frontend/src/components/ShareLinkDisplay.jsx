import { useState } from 'react'
import { formatDate, formatFileSize } from '../utils/format'

export default function ShareLinkDisplay({ share }) {
  const [copied, setCopied] = useState(false)

  const shareUrl = `${window.location.origin}/share/${share.share_code}`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-green-800">分享链接已创建</h3>
          <p className="text-sm text-green-600 mt-1">
            文件：{share.file.original_filename} ({formatFileSize(share.file.file_size)})
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={shareUrl}
            readOnly
            className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700"
          />
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
          >
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium">创建时间：</span>
            {formatDate(share.created_at)}
          </p>
          {share.expire_at && (
            <p>
              <span className="font-medium">过期时间：</span>
              {formatDate(share.expire_at)}
            </p>
          )}
          {share.max_downloads && (
            <p>
              <span className="font-medium">最大下载次数：</span>
              {share.max_downloads} 次
            </p>
          )}
          {share.has_password && (
            <p className="text-yellow-600">
              <span className="font-medium">注意：</span>
              此分享链接已设置密码保护
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
