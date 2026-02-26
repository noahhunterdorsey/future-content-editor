'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import { Variation } from '@/lib/types';

export default function ApprovedPage() {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [viewMode, setViewMode] = useState<'feed' | 'story'>('feed');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchApproved = useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/variations?status=eq.approved&order=created_at.desc`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        }
      );
      if (res.ok) {
        setVariations(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch approved:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchApproved();
  }, [fetchApproved]);

  const handleDownload = async (variationId?: string) => {
    setDownloading(true);
    try {
      const url = variationId
        ? `/api/download?variationId=${variationId}`
        : '/api/download?all=true';
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'future-ads.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      console.error('Download failed:', e);
    }
    setDownloading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Approved Assets</h1>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-bg-card rounded-lg p-1">
              <button
                onClick={() => setViewMode('feed')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'feed' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'
                }`}
              >
                4:5 Feed
              </button>
              <button
                onClick={() => setViewMode('story')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'story' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'
                }`}
              >
                9:16 Story
              </button>
            </div>

            {variations.length > 0 && (
              <button
                onClick={() => handleDownload()}
                disabled={downloading}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg
                  text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {downloading ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Preparing...
                  </>
                ) : (
                  'Download All ZIP'
                )}
              </button>
            )}
          </div>
        </div>

        {variations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-sm">No approved assets yet. Review and approve some variations first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {variations.map((variation) => {
              const imageUrl = viewMode === 'feed' ? variation.feed_url : variation.story_url;
              return (
                <div
                  key={variation.id}
                  className="bg-bg-card rounded-xl border border-border overflow-hidden group"
                >
                  <div className={`relative ${viewMode === 'feed' ? 'aspect-[4/5]' : 'aspect-[9/16]'} bg-black`}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Variation ${variation.variation_number}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                        No preview
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-success/10 text-success rounded text-xs font-medium">
                        Approved
                      </span>
                      <span className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs font-medium">
                        {variation.hook_type}
                      </span>
                    </div>

                    <p className="text-sm text-text-secondary line-clamp-2">{variation.ad_caption}</p>
                    <p className="text-xs text-text-muted font-medium">{variation.ad_headline}</p>

                    <button
                      onClick={() => handleDownload(variation.id)}
                      disabled={downloading}
                      className="w-full mt-2 py-2 bg-bg hover:bg-border/50 border border-border
                        rounded-lg text-xs font-medium transition-colors text-text-secondary hover:text-text"
                    >
                      Download ZIP
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
