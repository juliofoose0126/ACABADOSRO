'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Credenciales incorrectas. Intente de nuevo.');
        return;
      }

      router.replace('/dashboard');
    } catch {
      setError('Ocurrió un error. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f2440]">
        <svg className="h-8 w-8 animate-spin text-[#D4A520]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f2440] px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-[#0f2440] via-[#1a365d]/90 to-[#0f2440]" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 overflow-hidden rounded-2xl bg-white p-5 shadow-2xl">
            <Image
              src="/logo.jpg"
              alt="Acabados RO"
              width={220}
              height={130}
              className="h-auto w-52"
              priority
            />
          </div>
          <div className="gold-line mx-auto mt-2 w-32" />
          <p className="mt-3 text-xs font-medium tracking-[0.3em] text-[#D4A520]">
            SISTEMA DE ADMINISTRACIÓN
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="animate-fade-in stagger-1" style={{ opacity: 0 }}>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-white/80"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@acabadosro.com"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 transition-all focus:border-[#D4A520] focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#D4A520]/30"
              />
            </div>

            <div className="animate-fade-in stagger-2" style={{ opacity: 0 }}>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-white/80"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 pr-11 text-sm text-white placeholder:text-white/40 transition-all focus:border-[#D4A520] focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#D4A520]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="animate-scale-in rounded-lg border border-[#8B1A1A]/40 bg-[#8B1A1A]/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="animate-fade-in stagger-3 pt-1" style={{ opacity: 0 }}>
              <button
                type="submit"
                disabled={loading}
                className="btn-gold flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold tracking-wide disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <LogIn size={18} />
                )}
                <span>{loading ? 'Iniciando sesión...' : 'INICIAR SESIÓN'}</span>
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/25">
          © 2025 Acabados RO. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
