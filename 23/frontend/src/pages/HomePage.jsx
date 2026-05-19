import { useState } from 'react'
import FileUpload from '../components/FileUpload'
import CreateShareForm from '../components/CreateShareForm'
import ShareLinkDisplay from '../components/ShareLinkDisplay'
import { formatFileSize, formatDate } from '../utils/format'

export default function HomePage() {
  const [uploadedFile, setUploadedFile] = useState(null)
  const [share, setShare] = useState(null)
  const [showShareForm, setShowShareForm] = useState(false)

  const handleUploadSuccess = (file) => {
    setUploadedFile(file)
    setShare(null)
    setShowShareForm(true)
  }

  const handleShareCreated = (shareData) => {
    setShare(shareData)
    setShowShareForm(false)
  }

  const handleReset = () => {
    setUploadedFile(null)
    setShare(null)
    setShowShareForm(false)
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          上传并分享文件
        </h1>
        <p className="text-gray-600">
          上传文件，快速生成分享链接，支持过期时间和密码保护
        </p>
      </div>

      {!uploadedFile ? (
        <FileUpload onUploadSuccess={handleUploadSuccess} />
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600"
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
                <div>
                  <h3 className="font-medium text-gray-900">
                    {uploadedFile.original_filename}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(uploadedFile.file_size)} · 上传于{' '}
                    {formatDate(uploadedFile.upload_time)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                重新上传
              </button>
            </div>
          </div>

          {showShareForm && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                创建分享链接
              </h3>
              <CreateShareForm
                fileId={uploadedFile.id}
                onShareCreated={handleShareCreated}
                onCancel={handleReset}
              />
            </div>
          )}

          {share && <ShareLinkDisplay share={share} />}
        </div>
      )}
    </div>
  )
}
