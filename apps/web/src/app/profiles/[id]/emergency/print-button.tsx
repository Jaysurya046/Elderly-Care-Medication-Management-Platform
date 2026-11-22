'use client';

import * as React from 'react';
import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.print();
        }
      }}
      className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-lg min-h-[48px] flex items-center gap-2 shadow-sm transition-colors"
    >
      <Printer className="w-5 h-5" />
      <span>Print Card</span>
    </button>
  );
}
