'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProjectSidebar from '@/components/ProjectSidebar';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f2440]">
      <div className="flex flex-col items-center gap-4">
        <div className="overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
          <Image src="/logo.jpg" alt="Acabados RO" width={120} height={70} className="h-auto w-28" priority />
        </div>
        <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-[#D4A520] to-transparent" />
        <svg className="h-6 w-6 animate-spin text-[#D4A520]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: proyecto } = await supabase
        .from('proyectos')
        .select('nombre')
        .eq('id', projectId)
        .single();

      if (!proyecto) {
        router.push('/proyectos');
        return;
      }

      setProjectName(proyecto.nombre);
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login');
    });

    return () => subscription.unsubscribe();
  }, [router, projectId]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen">
      <ProjectSidebar projectId={projectId} projectName={projectName} />
      <main className="ml-0 min-h-screen flex-1 bg-gray-50/80 p-4 md:ml-64 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
