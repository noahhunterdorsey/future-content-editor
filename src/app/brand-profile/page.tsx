'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { BrandProfile } from '@/lib/types';

const FIELDS = [
  {
    key: 'brand_name',
    label: 'Brand Name',
    type: 'text',
    hint: 'The name of your brand used in ad copy.',
  },
  {
    key: 'company_background',
    label: 'Company Background & Story',
    type: 'textarea',
    hint: 'Who you are, your mission, and what makes you different. This helps the AI write copy that sounds authentic.',
  },
  {
    key: 'service_description',
    label: 'Service Description',
    type: 'textarea',
    hint: 'What you offer — the core service or product in a nutshell.',
  },
  {
    key: 'features_benefits',
    label: 'Key Features & Benefits',
    type: 'textarea',
    hint: 'List the main features and benefits. Use line breaks or dashes. These get pulled into ad copy directly.',
  },
  {
    key: 'current_offers',
    label: 'Current Offers',
    type: 'textarea',
    hint: 'Any active promotions, discounts, or limited-time deals to highlight in ads.',
  },
  {
    key: 'pricing_info',
    label: 'Pricing Info',
    type: 'textarea',
    hint: 'Key pricing points. Specific numbers work best in ads (e.g. "$2.50 per order").',
  },
  {
    key: 'speed_turnaround',
    label: 'Speed / Turnaround',
    type: 'text',
    hint: 'How fast you deliver, ship, or onboard. Speed claims appear in at least 2 of 5 ad variations.',
  },
  {
    key: 'tone_voice',
    label: 'Tone & Voice',
    type: 'textarea',
    hint: 'How your brand sounds. This directly shapes the copywriting style across all generated ads.',
  },
  {
    key: 'target_audience',
    label: 'Target Audience',
    type: 'textarea',
    hint: 'Who your ads are speaking to. Be specific — the AI tailors hooks and pain points to this audience.',
  },
  {
    key: 'social_proof_notes',
    label: 'Social Proof Style Notes',
    type: 'textarea',
    hint: 'How testimonials and social proof should be formatted (e.g. name formats, tone, attribution style).',
  },
];

export default function BrandProfilePage() {
  const [profile, setProfile] = useState<Partial<BrandProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchProfile();
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
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/brand-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setDirty(false);
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('error');
    }
    setSaving(false);
  };

  const updateField = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaveStatus('idle');
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading brand profile...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold mb-1">Brand Profile</h1>
          <p className="text-sm text-text-secondary">
            This information is sent to the AI with every ad generation. The more specific you are, the better your ad copy will be.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-text mb-1.5">
                {field.label}
              </label>
              {field.hint && (
                <p className="text-xs text-text-muted mb-2">{field.hint}</p>
              )}
              {field.type === 'textarea' ? (
                <textarea
                  value={(profile as Record<string, string>)[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  rows={5}
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
        </div>

        {/* Save bar */}
        <div className="sticky bottom-0 pt-4 pb-6 mt-8 bg-bg border-t border-border -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg
                font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            {saveStatus === 'saved' && (
              <span className="text-sm text-success flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved
              </span>
            )}

            {saveStatus === 'error' && (
              <span className="text-sm text-danger">Failed to save. Try again.</span>
            )}

            {dirty && saveStatus === 'idle' && (
              <span className="text-xs text-text-muted">Unsaved changes</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
