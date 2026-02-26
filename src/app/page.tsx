'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { LibraryItem, AssetFormat } from '@/lib/types';

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<AssetFormat>('single_image');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/library?order=uploaded_at.desc`, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (e) {
      console.error('Failed to fetch library:', e);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const handleUpload = async (files: FileList | File[]) => {
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        await fetchLibrary();
      }
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // For single image/video, only allow 1 selection
        if (format !== 'carousel' && next.size >= 1) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selected.size) return;
    setGenerating(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryIds: Array.from(selected),
          format,
        }),
      });

      if (res.ok) {
        const { assetId } = await res.json();
        router.push(`/review?asset=${assetId}`);
      } else {
        const err = await res.json();
        alert(`Generation failed: ${err.error}`);
      }
    } catch (e) {
      console.error('Generation failed:', e);
      alert('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const selectedItems = items.filter(i => selected.has(i.id));
  const hasVideo = selectedItems.some(i => i.file_type === 'video');
  const hasImage = selectedItems.some(i => i.file_type === 'image');

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-accent bg-accent/5'
              : 'border-border hover:border-border-hover'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
            className="hidden"
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-text-secondary text-sm">Uploading...</span>
            </div>
          ) : (
            <div>
              <p className="text-text-secondary text-sm">Drop files here or click to upload</p>
              <p className="text-text-muted text-xs mt-1">JPG, PNG, WEBP, MP4</p>
            </div>
          )}
        </div>

        {/* Media Grid */}
        <div className="mt-6 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`relative aspect-square rounded-lg overflow-hidden group transition-all ${
                  isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'hover:ring-1 hover:ring-border-hover'
                }`}
              >
                {item.file_type === 'video' ? (
                  <div className="w-full h-full bg-bg-card flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                ) : (
                  <img
                    src={item.thumbnail_url || item.file_url}
                    alt={item.original_filename}
                    className="w-full h-full object-cover"
                  />
                )}

                {isSelected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                {item.file_type === 'video' && (
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                    VIDEO
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {items.length === 0 && (
          <div className="text-center py-16">
            <p className="text-text-muted text-sm">No media yet. Upload some photos or videos to get started.</p>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="fixed bottom-0 left-0 right-0 bg-bg-elevated/90 backdrop-blur-xl border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-secondary">
                Selected: {selected.size} {selected.size === 1 ? 'item' : 'items'}
              </span>

              <div className="flex items-center gap-1 bg-bg-card rounded-lg p-1">
                {(['single_image', 'video', 'carousel'] as AssetFormat[]).map((f) => {
                  const disabled = (f === 'video' && !hasVideo && selected.size > 0) ||
                                   (f === 'single_image' && hasVideo && selected.size > 0);
                  return (
                    <button
                      key={f}
                      onClick={() => !disabled && setFormat(f)}
                      disabled={disabled}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        format === f
                          ? 'bg-accent text-white'
                          : disabled
                            ? 'text-text-muted cursor-not-allowed'
                            : 'text-text-secondary hover:text-text'
                      }`}
                    >
                      {f === 'single_image' ? 'Single Image' : f === 'video' ? 'Video' : 'Carousel'}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selected.size || generating}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg
                font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
