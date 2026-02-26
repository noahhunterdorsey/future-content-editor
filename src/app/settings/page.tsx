'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { BrandProfile, ReferenceAd } from '@/lib/types';

export default function SettingsPage() {
  const [profile, setProfile] = useState<Partial<BrandProfile>>({});
  const [referenceAds, setReferenceAds] = useState<ReferenceAd[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchReferenceAds();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/brand-profile');
      if (res.ok) {
        setProfile(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }
  };

  const fetchReferenceAds = async () => {
    try {
      const res = await fetch('/api/reference-ads');
      if (res.ok) {
        setReferenceAds(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch reference ads:', e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/brand-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error('Save failed:', e);
    }
    setSaving(false);
  };

  const handleUploadReference = async (files: FileList) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch('/api/reference-ads', { method: 'POST', body: formData });
      } catch (e) {
        console.error('Upload failed:', e);
      }
    }
    await fetchReferenceAds();
    setUploading(false);
  };

  const handleDeleteReference = async (id: string) => {
    try {
      await fetch('/api/reference-ads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchReferenceAds();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const updateField = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const fields = [
    { key: 'brand_name', label: 'Brand Name', type: 'text' },
    { key: 'company_background', label: 'Company Background & Story', type: 'textarea' },
    { key: 'service_description', label: 'Service Description', type: 'textarea' },
    { key: 'features_benefits', label: 'Key Features & Benefits', type: 'textarea' },
    { key: 'current_offers', label: 'Current Offers', type: 'textarea' },
    { key: 'pricing_info', label: 'Pricing Info', type: 'textarea' },
    { key: 'speed_turnaround', label: 'Speed / Turnaround', type: 'text' },
    { key: 'tone_voice', label: 'Tone & Voice Notes', type: 'textarea' },
    { key: 'target_audience', label: 'Target Audience', type: 'textarea' },
    { key: 'social_proof_notes', label: 'Social Proof Style Notes', type: 'textarea' },
  ];

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-lg font-semibold mb-6">Settings</h1>

        {/* Brand Profile */}
        <section className="space-y-4 mb-10">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Brand Profile</h2>

          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={(profile as Record<string, string>)[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text
                    placeholder:text-text-muted resize-y focus:outline-none focus:border-accent transition-colors"
                />
              ) : (
                <input
                  type="text"
                  value={(profile as Record<string, string>)[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text
                    placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              )}
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg
              font-medium text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </section>

        {/* Reference Ads */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Reference Ads</h2>
          <p className="text-xs text-text-muted">
            These reference ads are sent to Claude with every generation to guide the visual style.
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {referenceAds.map((ad) => (
              <div key={ad.id} className="relative aspect-[4/5] rounded-lg overflow-hidden group">
                <img src={ad.image_url} alt="Reference ad" className="w-full h-full object-cover" />
                <button
                  onClick={() => handleDeleteReference(ad.id)}
                  className="absolute top-1 right-1 w-6 h-6 bg-danger/80 hover:bg-danger rounded-full
                    flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}

            <label className="aspect-[4/5] border-2 border-dashed border-border hover:border-border-hover
              rounded-lg flex items-center justify-center cursor-pointer transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && handleUploadReference(e.target.files)}
                className="hidden"
              />
              {uploading ? (
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}
