'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { Variation, CarouselSlide } from '@/lib/types';

function ReviewContent() {
  const searchParams = useSearchParams();
  const assetId = searchParams.get('asset');
  const [variations, setVariations] = useState<(Variation & { carousel_slides?: CarouselSlide[] })[]>([]);
  const [viewMode, setViewMode] = useState<'feed' | 'story'>('feed');
  const [loading, setLoading] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [activeSlide, setActiveSlide] = useState<Record<string, number>>({});

  const fetchVariations = useCallback(async () => {
    if (!assetId) {
      // Fetch all pending/ready variations
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/variations?status=eq.pending&order=created_at.desc`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setVariations(data);
        }
      } catch (e) {
        console.error('Failed to fetch variations:', e);
      }
    } else {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/variations?asset_id=eq.${assetId}&order=variation_number.asc`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();

          // Fetch carousel slides for each variation
          for (const v of data) {
            const slidesRes = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/carousel_slides?variation_id=eq.${v.id}&order=slide_number.asc`,
              {
                headers: {
                  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
                },
              }
            );
            if (slidesRes.ok) {
              v.carousel_slides = await slidesRes.json();
            }
          }

          setVariations(data);
        }
      } catch (e) {
        console.error('Failed to fetch variations:', e);
      }
    }
    setLoading(false);
  }, [assetId]);

  useEffect(() => {
    fetchVariations();
  }, [fetchVariations]);

  const handleAction = async (variationId: string, status: 'approved' | 'rejected') => {
    try {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variationId,
          status,
          notes: feedbackNotes[variationId] || '',
        }),
      });

      setVariations(prev =>
        prev.map(v => v.id === variationId ? { ...v, status } : v)
      );
    } catch (e) {
      console.error('Action failed:', e);
    }
  };

  const getImageUrl = (variation: Variation & { carousel_slides?: CarouselSlide[] }, slideIdx?: number) => {
    if (variation.carousel_slides?.length && slideIdx !== undefined) {
      const slide = variation.carousel_slides[slideIdx];
      return viewMode === 'feed' ? slide?.feed_url : slide?.story_url;
    }
    return viewMode === 'feed' ? variation.feed_url : variation.story_url;
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
          <h1 className="text-lg font-semibold">Review Variations</h1>

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
        </div>

        {variations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-sm">No variations to review. Generate some ads first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {variations.map((variation) => {
              const currentSlide = activeSlide[variation.id] || 0;
              const hasSlides = variation.carousel_slides && variation.carousel_slides.length > 0;
              const imageUrl = getImageUrl(variation, hasSlides ? currentSlide : undefined);

              return (
                <div
                  key={variation.id}
                  className={`bg-bg-card rounded-xl border overflow-hidden transition-colors ${
                    variation.status === 'approved'
                      ? 'border-success/30'
                      : variation.status === 'rejected'
                        ? 'border-danger/30'
                        : 'border-border'
                  }`}
                >
                  {/* Image Preview */}
                  <div className={`relative ${viewMode === 'feed' ? 'aspect-[4/5]' : 'aspect-[9/16]'} bg-black`}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Variation ${variation.variation_number}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                        Processing...
                      </div>
                    )}

                    {/* Carousel slide navigation */}
                    {hasSlides && (
                      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                        {variation.carousel_slides!.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveSlide(p => ({ ...p, [variation.id]: idx }))}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              currentSlide === idx ? 'bg-white' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {variation.flagged && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-warning/90 rounded text-xs font-medium text-black">
                        {variation.flag_reason || 'Flagged'}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs font-medium">
                        {variation.hook_type}
                      </span>
                      <span className="text-text-muted text-xs">#{variation.variation_number}</span>
                      {variation.status !== 'pending' && (
                        <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                          variation.status === 'approved'
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}>
                          {variation.status}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-text-secondary line-clamp-2">{variation.ad_caption}</p>
                      <p className="text-xs text-text-muted font-medium">{variation.ad_headline}</p>
                    </div>

                    {/* Feedback Notes */}
                    <textarea
                      placeholder="Notes (optional)..."
                      value={feedbackNotes[variation.id] || ''}
                      onChange={(e) => setFeedbackNotes(p => ({ ...p, [variation.id]: e.target.value }))}
                      className="w-full px-3 py-2 bg-bg rounded-lg border border-border text-xs text-text
                        placeholder:text-text-muted resize-none h-16 focus:outline-none focus:border-accent"
                    />

                    {/* Actions */}
                    {variation.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(variation.id, 'approved')}
                          className="flex-1 py-2 bg-success/10 hover:bg-success/20 text-success
                            rounded-lg text-xs font-medium transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(variation.id, 'rejected')}
                          className="flex-1 py-2 bg-danger/10 hover:bg-danger/20 text-danger
                            rounded-lg text-xs font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
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

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen">
        <Navigation />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <ReviewContent />
    </Suspense>
  );
}
