'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const config: Record<string, { bg: string; border: string; icon: typeof CheckCircle; iconColor: string }> = {
  success: { bg: 'bg-white', border: 'border-l-4 border-l-green-500', icon: CheckCircle, iconColor: 'text-green-500' },
  error: { bg: 'bg-white', border: 'border-l-4 border-l-[#8B1A1A]', icon: XCircle, iconColor: 'text-[#8B1A1A]' },
  info: { bg: 'bg-white', border: 'border-l-4 border-l-[#D4A520]', icon: Info, iconColor: 'text-[#D4A520]' },
};

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const { bg, border, icon: Icon, iconColor } = config[type];

  return (
    <div
      className={`animate-slide-in-right fixed right-4 top-4 z-[200] overflow-hidden rounded-lg ${bg} ${border} shadow-xl ring-1 ring-gray-100`}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <Icon size={20} className={iconColor} />
        <p className="text-sm font-medium text-gray-800">{message}</p>
        <button
          onClick={onClose}
          className="ml-3 rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-600"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      <div className={`toast-progress h-0.5 ${iconColor.replace('text-', 'bg-')}`} />
    </div>
  );
}
