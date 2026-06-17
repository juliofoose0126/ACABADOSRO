'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Truck,
  Plus,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Stats {
  totalMateriales: number;
  ordenesPendientes: number;
  totalIngresos: number;
  totalGastos: number;
  totalProveedores: number;
  lowStockCount: number;
}

export default function ProjectDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const base = `/proyecto/${projectId}`;

  const [userName, setUserName] = useState('');
  const [stats, setStats] = useState<Stats>({
    totalMateriales: 0,
    ordenesPendientes: 0,
    totalIngresos: 0,
    totalGastos: 0,
    totalProveedores: 0,
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        }

        const [materialesRes, ordenesRes, ingresosRes, gastosRes, proveedoresRes, lowStockRes] =
          await Promise.all([
            supabase.from('materiales').select('id', { count: 'exact', head: true }),
            supabase.from('ordenes_compra').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').eq('proyecto_id', projectId),
            supabase.from('ingresos').select('monto').eq('proyecto_id', projectId),
            supabase.from('gastos').select('monto').eq('proyecto_id', projectId),
            supabase.from('proveedores').select('id', { count: 'exact', head: true }),
            supabase.from('materiales').select('id', { count: 'exact', head: true }).lt('cantidad', 5),
          ]);

        const ingresoTotal = ingresosRes.data?.reduce((sum, g) => sum + (g.monto || 0), 0) ?? 0;
        const gastoTotal = gastosRes.data?.reduce((sum, g) => sum + (g.monto || 0), 0) ?? 0;

        setStats({
          totalMateriales: materialesRes.count ?? 0,
          ordenesPendientes: ordenesRes.count ?? 0,
          totalIngresos: ingresoTotal,
          totalGastos: gastoTotal,
          totalProveedores: proveedoresRes.count ?? 0,
          lowStockCount: lowStockRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  const statCards = [
    {
      label: 'Total Ingresos',
      value: stats.totalIngresos,
      icon: TrendingUp,
      format: 'currency' as const,
      color: 'from-[#16a34a] to-[#22c55e]',
      href: `${base}/ingresos`,
    },
    {
      label: 'Total Gastos',
      value: stats.totalGastos,
      icon: DollarSign,
      format: 'currency' as const,
      color: 'from-[#8B1A1A] to-[#A52222]',
      href: `${base}/gastos`,
    },
    {
      label: 'Órdenes Pendientes',
      value: stats.ordenesPendientes,
      icon: ShoppingCart,
      format: 'number' as const,
      color: 'from-[#D4A520] to-[#E8B82E]',
      href: `${base}/ordenes`,
    },
    {
      label: 'Total Materiales',
      value: stats.totalMateriales,
      icon: Package,
      format: 'number' as const,
      color: 'from-[#1a365d] to-[#2a4a7f]',
      href: `${base}/inventario`,
    },
    {
      label: 'Proveedores',
      value: stats.totalProveedores,
      icon: Truck,
      format: 'number' as const,
      color: 'from-[#1a365d] to-[#2a4a7f]',
      href: `${base}/proveedores`,
    },
  ];

  const quickActions = [
    { label: 'Registrar Ingreso', href: `${base}/ingresos`, icon: TrendingUp },
    { label: 'Registrar Gasto', href: `${base}/gastos`, icon: DollarSign },
    { label: 'Nueva Orden', href: `${base}/ordenes`, icon: ShoppingCart },
    { label: 'Nuevo Material', href: `${base}/inventario`, icon: Package },
    { label: 'Nuevo Proveedor', href: `${base}/proveedores`, icon: Truck },
  ];

  const formatValue = (value: number, format: 'number' | 'currency') => {
    if (format === 'currency') {
      return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return value.toLocaleString('es-MX');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="pt-10 md:pt-0">
      {/* Welcome Header */}
      <div className="mb-8 animate-fade-in">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#1a365d] to-[#2a4a7f] p-6 shadow-lg md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#D4A520]">
                {getGreeting()}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
                {userName || 'Administrador'}
              </h1>
              <p className="mt-2 text-sm text-white/60">
                Panel de control — Acabados RO
              </p>
            </div>
            <div className="hidden md:block">
              <TrendingUp size={48} className="text-white/20" />
            </div>
          </div>
          <div className="mt-4 h-0.5 w-full bg-gradient-to-r from-[#D4A520] via-[#E8B82E] to-transparent opacity-50" />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={() => router.push(card.href)}
              className={`card-hover animate-fade-in stagger-${idx + 1} group relative overflow-hidden rounded-xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100`}
              style={{ opacity: 0 }}
            >
              <div className={`absolute right-0 top-0 h-full w-1 bg-gradient-to-b ${card.color}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#1a365d]">
                    {loading ? (
                      <span className="inline-block h-8 w-20 animate-pulse rounded bg-gray-200" />
                    ) : (
                      formatValue(card.value, card.format)
                    )}
                  </p>
                </div>
                <div className={`rounded-xl bg-gradient-to-br ${card.color} p-2.5 shadow-sm`}>
                  <Icon size={20} className="text-white" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-400 transition-colors group-hover:text-[#D4A520]">
                <span>Ver detalle</span>
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Low Stock Alert */}
      {!loading && stats.lowStockCount > 0 && (
        <div className="mb-8 animate-fade-in">
          <button
            onClick={() => router.push(`${base}/inventario`)}
            className="card-hover flex w-full items-center gap-4 rounded-xl border border-[#D4A520]/20 bg-[#D4A520]/5 p-4 text-left transition-colors hover:border-[#D4A520]/40"
          >
            <div className="rounded-lg bg-[#D4A520]/10 p-2.5">
              <AlertTriangle size={22} className="text-[#D4A520]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a365d]">
                {stats.lowStockCount} material{stats.lowStockCount !== 1 ? 'es' : ''} con stock bajo
              </p>
              <p className="text-xs text-gray-500">
                Revisa el inventario para reabastecer
              </p>
            </div>
            <ArrowRight size={18} className="text-[#D4A520]" />
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="animate-fade-in">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
          <Plus size={16} />
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="card-hover flex flex-col items-center gap-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="rounded-xl bg-[#1a365d]/5 p-3">
                  <Icon size={22} className="text-[#1a365d]" />
                </div>
                <span className="text-xs font-medium text-gray-700">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
