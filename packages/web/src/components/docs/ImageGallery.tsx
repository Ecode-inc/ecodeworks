import { useState, useEffect, useRef, useCallback } from 'react'
import { docImageApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Modal } from '../ui/Modal'
import { Image, Upload, X, User, Tag, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getImageUrl(fileUrl: string): string {
  if (!fileUrl) return ''
  if (fileUrl.startsWith('http')) return fileUrl
  // R2 key like "이코드/docs/xxx/file.jpg" → "/api/files/이코드/docs/xxx/file.jpg"
  return `${API_BASE.replace(/\/api$/, '')}/api/files/${encodeURI(fileUrl)}`
}

interface ImageGalleryProps {
  documentId: string
}

export function ImageGallery({ documentId }: ImageGalleryProps) {
  const [images, setImages] = useState<any[]>([])
  const [selectedImage, setSelectedImage] = useState<any | null>(null)
  const [filterTag, setFilterTag] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [gridCols, setGridCols] = useState(() => {
    const saved = localStorage.getItem('imgGridCols')
    return saved ? parseInt(saved) : 4
  })
  const [dragActive, setDragActive] = useState(false)
  const [uploadTags, setUploadTags] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadImages = useCallback(async () => {
    try {
      const params: { document_id: string; tag?: string; person?: string } = { document_id: documentId }
      if (filterTag) params.tag = filterTag
      if (filterPerson) params.person = filterPerson
      const res = await docImageApi.list(params)
      setImages(res.images || [])
    } catch {
      // silently fail
    }
  }, [documentId, filterTag, filterPerson])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  // Collect unique tags and people
  const allTags = [...new Set(images.flatMap((img: any) => {
    if (!img.tags) return []
    try { return JSON.parse(img.tags) } catch { return [] }
  }))] as string[]

  const allPeople = [...new Set(images.flatMap((img: any) => {
    if (!img.people) return []
    try { return (JSON.parse(img.people) as { name: string }[]).map(p => p.name) } catch { return [] }
  }))] as string[]

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const tags = uploadTags.split(',').map(t => t.trim()).filter(Boolean)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file.type.startsWith('image/')) continue
        await docImageApi.upload(documentId, file, tags.length ? tags : undefined)
      }
      setUploadTags('')
      await loadImages()
      useToastStore.getState().addToast('success', '업로드 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '업로드 실패', e.message)
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
    if (!confirm('이미지를 삭제하시겠습니까?')) return
    try {
      await docImageApi.delete(id)
      setSelectedImage(null)
      await loadImages()
      useToastStore.getState().addToast('success', '삭제 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  const parseTags = (img: any): string[] => {
    if (!img.tags) return []
    try { return JSON.parse(img.tags) } catch { return [] }
  }

  const parsePeople = (img: any): { name: string }[] => {
    if (!img.people) return []
    try { return JSON.parse(img.people) } catch { return [] }
  }

  return (
    <div className="border-t mt-4">
      {/* Header */}
      <div className="flex items-center px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left hover:bg-gray-50 rounded -ml-2 px-2 py-1"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Image size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">이미지</span>
          {images.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {images.length}
            </span>
          )}
        </button>
        {expanded && (
          <div className="flex items-center gap-0.5 border rounded-lg px-1 py-0.5">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => { setGridCols(n); localStorage.setItem('imgGridCols', String(n)) }}
                className={`w-6 h-6 text-xs rounded ${gridCols === n ? 'bg-primary-100 text-primary-700 font-bold' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Tag/Person Filter Bar */}
          {(allTags.length > 0 || allPeople.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => { setFilterTag(''); setFilterPerson('') }}
                className={`px-2 py-0.5 text-xs rounded-full border ${!filterTag && !filterPerson ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              >
                전체
              </button>
              {allTags.map(tag => (
                <button
                  key={`tag-${tag}`}
                  onClick={() => { setFilterTag(filterTag === tag ? '' : tag); setFilterPerson('') }}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${filterTag === tag ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <Tag size={10} /> {tag}
                </button>
              ))}
              {allPeople.map(person => (
                <button
                  key={`person-${person}`}
                  onClick={() => { setFilterPerson(filterPerson === person ? '' : person); setFilterTag('') }}
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${filterPerson === person ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <User size={10} /> {person}
                </button>
              ))}
            </div>
          )}

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
              accept="image/jpeg,image/png,image/webp,image/gif"
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
                  이미지 업로드
                </button>
                <p className="text-xs text-gray-400 mt-1">또는 이미지를 드래그하여 놓으세요</p>
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="업로드 시 태그 (쉼표 구분)"
                    value={uploadTags}
                    onChange={e => setUploadTags(e.target.value)}
                    className="text-xs border rounded px-2 py-1 w-48 text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Image Grid */}
          {images.length > 0 ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
              {images.map((img: any) => (
                <div
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className="cursor-pointer group relative rounded-lg overflow-hidden border hover:border-primary-300 hover:shadow-sm transition-all"
                >
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={getImageUrl(img.file_url)}
                      alt={img.ai_description || img.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-1.5 space-y-1">
                    {parseTags(img).length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {parseTags(img).map((tag: string) => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-600 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {parsePeople(img).length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {parsePeople(img).map((p: { name: string }) => (
                          <span key={p.name} className="px-1.5 py-0.5 text-[10px] bg-green-50 text-green-600 rounded-full">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">이미지가 없습니다</p>
          )}
        </div>
      )}

      {/* Image Detail Modal */}
      {selectedImage && (
        <ImageDetailModal
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onUpdate={async (updated) => {
            setSelectedImage(updated)
            await loadImages()
          }}
          onDelete={async () => {
            await handleDelete(selectedImage.id)
          }}
        />
      )}
    </div>
  )
}

function ImageDetailModal({ image, onClose, onUpdate, onDelete }: {
  image: any
  onClose: () => void
  onUpdate: (img: any) => void
  onDelete: () => void
}) {
  const [tagInput, setTagInput] = useState('')
  const [personInput, setPersonInput] = useState('')
  const [aiDescription, setAiDescription] = useState(image.ai_description || '')
  const [saving, setSaving] = useState(false)

  const currentTags: string[] = (() => {
    if (!image.tags) return []
    try { return JSON.parse(image.tags) } catch { return [] }
  })()

  const currentPeople: { name: string }[] = (() => {
    if (!image.people) return []
    try { return JSON.parse(image.people) } catch { return [] }
  })()

  const addTags = async () => {
    if (!tagInput.trim()) return
    const newTags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    const merged = [...new Set([...currentTags, ...newTags])]
    setSaving(true)
    try {
      const res = await docImageApi.update(image.id, { tags: merged })
      onUpdate(res.image)
      setTagInput('')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '태그 추가 실패', e.message)
    } finally {
      setSaving(false)
    }
  }

  const removeTag = async (tag: string) => {
    const updated = currentTags.filter(t => t !== tag)
    setSaving(true)
    try {
      const res = await docImageApi.update(image.id, { tags: updated })
      onUpdate(res.image)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '태그 삭제 실패', e.message)
    } finally {
      setSaving(false)
    }
  }

  const addPerson = async () => {
    if (!personInput.trim()) return
    setSaving(true)
    try {
      const res = await docImageApi.tagPerson(image.id, personInput.trim())
      onUpdate(res.image)
      setPersonInput('')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '인물 태그 실패', e.message)
    } finally {
      setSaving(false)
    }
  }

  const removePerson = async (name: string) => {
    const updated = currentPeople.filter(p => p.name !== name)
    setSaving(true)
    try {
      const res = await docImageApi.update(image.id, { people: updated })
      onUpdate(res.image)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '인물 태그 삭제 실패', e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveDescription = async () => {
    setSaving(true)
    try {
      const res = await docImageApi.update(image.id, { ai_description: aiDescription })
      onUpdate(res.image)
      useToastStore.getState().addToast('success', '설명 저장 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '설명 저장 실패', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="이미지 상세" width="max-w-2xl">
      <div className="space-y-4">
        {/* Full-size image */}
        <div className="rounded-lg overflow-hidden bg-gray-100 max-h-[50vh] flex items-center justify-center">
          <img
            src={getImageUrl(image.file_url)}
            alt={image.ai_description || image.file_name}
            className="max-w-full max-h-[50vh] object-contain"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <Tag size={12} className="inline mr-1" />태그
          </label>
          <div className="flex flex-wrap gap-1 mb-2">
            {currentTags.map((tag: string) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-500" disabled={saving}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="태그 추가 (쉼표 구분)"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTags()}
              className="flex-1 text-sm border rounded-lg px-2 py-1"
            />
            <button onClick={addTags} disabled={saving} className="px-2 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50">
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* People */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <User size={12} className="inline mr-1" />인물 태그
          </label>
          <div className="flex flex-wrap gap-1 mb-2">
            {currentPeople.map((p: { name: string }) => (
              <span key={p.name} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full">
                {p.name}
                <button onClick={() => removePerson(p.name)} className="hover:text-red-500" disabled={saving}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="인물 이름"
              value={personInput}
              onChange={e => setPersonInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPerson()}
              className="flex-1 text-sm border rounded-lg px-2 py-1"
            />
            <button onClick={addPerson} disabled={saving} className="px-2 py-1 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 disabled:opacity-50">
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* AI Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">AI 설명</label>
          <textarea
            value={aiDescription}
            onChange={e => setAiDescription(e.target.value)}
            rows={3}
            className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-primary-500"
            placeholder="이미지에 대한 설명..."
          />
          <button
            onClick={saveDescription}
            disabled={saving}
            className="mt-1 px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            설명 저장
          </button>
        </div>

        {/* Delete */}
        <div className="flex justify-end pt-2 border-t">
          <button
            onClick={onDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 size={14} />
            이미지 삭제
          </button>
        </div>
      </div>
    </Modal>
  )
}
