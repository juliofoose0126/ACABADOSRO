'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const toastStyles: Record<string, { bg: string; icon: typeof CheckCircle }> = {
  success: { bg: 'bg-green-50 border-green-400 text-green-800', icon: CheckCircle },
  error: { bg: 'bg-red-50 border-red-400 text-red-800', icon: XCircle },
  info: { bg: 'bg-blue-50 border-blue-400 text-blue-800', icon: Info },
};

const iconColors: Record<string, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const { bg, icon: Icon } = toastStyles[type];

  return (
    <div
      className={`fixed right-4 top-4 z-[200] flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 ease-in-out ${bg}`}
    >
      <Icon size={20} className={iconColors[type]} />
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-2 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Cerrar notificación"
      >
        <XCircle size={16} />
      </button>
    </div>
  );
}
