import { useState, useEffect, useRef, useCallback } from 'react'
import { docFileApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Upload, ChevronDown, ChevronRight, Trash2, Paperclip, Download } from 'lucide-react'

interface FileAttachmentsProps {
  documentId: string
}

function getFileIcon(fileName: string): { icon: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return { icon: '\u{1F4C4}', color: 'text-red-500' }
    case 'hwp': case 'hwpx': return { icon: '\u{1F4DD}', color: 'text-blue-500' }
    case 'zip': case 'rar': case '7z': return { icon: '\u{1F4E6}', color: 'text-gray-500' }
    case 'doc': case 'docx': return { icon: '\u{1F4C3}', color: 'text-blue-600' }
    case 'xls': case 'xlsx': return { icon: '\u{1F4CA}', color: 'text-green-600' }
    case 'ppt': case 'pptx': return { icon: '\u{1F4CA}', color: 'text-orange-500' }
    default: return { icon: '\u{1F4CE}', color: 'text-gray-400' }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function FileAttachments({ documentId }: FileAttachmentsProps) {
  const [files, setFiles] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    try {
      const res = await docFileApi.list(documentId)
      setFiles(res.files || [])
    } catch {
      // silently fail
    }
  }, [documentId])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < fileList.length; i++) {
        await docFileApi.upload(documentId, fileList[i])
      }
      await loadFiles()
      useToastStore.getState().addToast('success', '파일 업로드 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '파일 업로드 실패', e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('파일을 삭제하시겠습니까?')) return
    try {
      await docFileApi.delete(id)
      await loadFiles()
      useToastStore.getState().addToast('success', '파일 삭제 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '파일 삭제 실패', e.message)
    }
  }

  const getDownloadUrl = (fileUrl: string) => {
    const apiBase = import.meta.env.VITE_API_URL || '/api'
    return `${apiBase}/files/${fileUrl}`
  }

  return (
    <div className="border-t mt-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Paperclip size={16} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">첨부파일</span>
        {files.length > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
            {files.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`mb-3 border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragActive ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={e => handleUpload(e.target.files)}
              className="hidden"
            />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                업로드 중...
              </div>
            ) : (
              <div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 mx-auto px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                >
                  <Upload size={14} />
                  파일 업로드
                </button>
                <p className="text-xs text-gray-400 mt-1">또는 파일을 드래그하여 놓으세요</p>
              </div>
            )}
          </div>

          {/* File List */}
          {files.length > 0 ? (
            <div className="space-y-1">
              {files.map((file: any) => {
                const { icon, color } = getFileIcon(file.file_name)
                return (
                  <div
                    key={file.id}
                    className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className={`text-lg ${color}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={getDownloadUrl(file.file_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-800 hover:text-primary-600 hover:underline truncate block"
                      >
                        {file.file_name}
                      </a>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{formatFileSize(file.file_size || 0)}</span>
                        <span>{file.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <a
                      href={getDownloadUrl(file.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="다운로드"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">첨부파일이 없습니다</p>
          )}
        </div>
      )}
    </div>
  )
}
