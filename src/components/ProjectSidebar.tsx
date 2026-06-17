'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  DollarSign,
  Truck,
  Users,
  LogOut,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  projectId: string;
  projectName: string;
}

export default function ProjectSidebar({ projectId, projectName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  const base = `/proyecto/${projectId}`;

  const navLinks = [
    { href: base, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: `${base}/inventario`, label: 'Inventario', icon: Package },
    { href: `${base}/ordenes`, label: 'Órdenes de Compra', icon: ShoppingCart },
    { href: `${base}/gastos`, label: 'Gastos', icon: DollarSign },
    { href: `${base}/proveedores`, label: 'Proveedores', icon: Truck },
    { href: `${base}/usuarios`, label: 'Usuarios', icon: Users },
  ];

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || '');
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-[#1a365d] p-2 text-white shadow-lg transition-transform active:scale-95 md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#0f2440] to-[#1a365d] text-white transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="overflow-hidden rounded-lg bg-white p-1.5">
                <Image src="/logo.jpg" alt="Logo" width={36} height={36} className="h-8 w-8 object-contain" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-wide">Acabados RO</h1>
                <div className="mt-0.5 h-0.5 w-16 bg-gradient-to-r from-[#D4A520] to-transparent" />
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 hover:bg-white/10 md:hidden"
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Project Name + Back */}
        <div className="border-b border-white/10 px-3 py-3">
          <Link
            href="/proyectos"
            onClick={() => setIsOpen(false)}
            className="mb-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            <ArrowLeft size={14} />
            Todos los Proyectos
          </Link>
          <div className="rounded-lg bg-white/8 px-3 py-2">
            <p className="truncate text-sm font-semibold text-white">{projectName}</p>
            <p className="text-xs text-[#D4A520]">Proyecto activo</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(link.href + '/');
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/60 hover:bg-white/8 hover:text-white'
                }`}
              >
                <div className={`rounded-md p-1 transition-colors ${
                  isActive
                    ? 'bg-[#D4A520]/20 text-[#D4A520]'
                    : 'text-white/50 group-hover:text-white/80'
                }`}>
                  <Icon size={18} />
                </div>
                <span>{link.label}</span>
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#D4A520]" />}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4A520]/20 text-xs font-bold text-[#D4A520]">
              {(userName || userEmail).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              {userName && <p className="truncate text-xs font-medium text-white/80">{userName}</p>}
              <p className="truncate text-xs text-white/40">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/50 transition-all hover:bg-[#8B1A1A]/30 hover:text-white"
          >
            <LogOut size={16} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
