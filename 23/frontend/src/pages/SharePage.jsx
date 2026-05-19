import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { downloadApi } from '../services/api'
import { formatFileSize } from '../utils/format'

export default function SharePage() {
  const { shareCode } = useParams()
  const navigate = useNavigate()
  const [fileInfo, setFileInfo] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needPassword, setNeedPassword] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    verifyShare()
  }, [shareCode])

  const verifyShare = async (pwd = '') => {
    setLoading(true)
    setError('')
    try {
      const response = await downloadApi.verify(shareCode, pwd)
      setFileInfo(response.data)
      setVerified(true)
      setNeedPassword(false)
    } catch (err) {
      if (err.response?.status === 401) {
        setNeedPassword(true)
      } else {
        setError(
          err.response?.data?.detail || '分享链接无效或已过期'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    verifyShare(password)
  }

  const handleDownload = () => {
    const url = downloadApi.getDownloadUrl(shareCode, password)
    window.location.href = url
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="animate-spin w-12 h-12 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full" />
        <p className="text-gray-600">加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">
            无法访问
          </h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (needPassword) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              此文件已加密
            </h3>
            <p className="text-gray-600 text-sm">
              请输入访问密码以下载文件
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              验证密码
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white border border-gray-200 rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            文件准备就绪
          </h3>
          <p className="text-gray-600 text-sm">
            点击下方按钮下载文件
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-blue-600"
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
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">
                {fileInfo?.filename}
              </p>
              <p className="text-sm text-gray-500">
                {formatFileSize(fileInfo?.file_size || 0)}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleDownload}
          className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
        >
          下载文件
        </button>
      </div>
    </div>
  )
}
