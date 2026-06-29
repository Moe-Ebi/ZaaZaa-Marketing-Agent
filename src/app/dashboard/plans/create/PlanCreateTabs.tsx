'use client';

import { useState } from 'react';
import { PlanWizard } from './PlanWizard';
import { UploadPlanForm } from './UploadPlanForm';

type Tab = 'generate' | 'upload';

export function PlanCreateTabs() {
  const [tab, setTab] = useState<Tab>('generate');

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
        {([['generate', 'Generate with AI'], ['upload', 'Upload existing']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 transition ${tab === t ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'generate' ? <PlanWizard /> : <UploadPlanForm />}
    </div>
  );
}
