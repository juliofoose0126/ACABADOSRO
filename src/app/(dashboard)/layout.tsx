'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f2440]">
      <div className="flex flex-col items-center gap-4">
        <div className="overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
          <Image
            src="/logo.jpg"
            alt="Acabados RO"
            width={120}
            height={70}
            className="h-auto w-28"
            priority
          />
        </div>
        <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-[#D4A520] to-transparent" />
        <svg
          className="h-6 w-6 animate-spin text-[#D4A520]"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-0 min-h-screen flex-1 bg-gray-50/80 p-4 md:ml-64 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
