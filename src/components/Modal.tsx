'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0f2440]/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div
        className={`animate-scale-in relative w-full ${sizeClasses[size]} rounded-2xl border border-gray-200 bg-white shadow-2xl`}
      >
        {/* Gold accent line */}
        <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-[#D4A520] via-[#E8B82E] to-[#D4A520]" />

        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <h2 className="text-lg font-bold text-[#1a365d]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
