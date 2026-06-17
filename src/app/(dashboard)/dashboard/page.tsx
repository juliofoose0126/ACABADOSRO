'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ShoppingCart, DollarSign, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Stats {
  totalMateriales: number;
  ordenesPendientes: number;
  gastosMes: number;
  totalProveedores: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalMateriales: 0,
    ordenesPendientes: 0,
    gastosMes: 0,
    totalProveedores: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const [materialesRes, ordenesRes, gastosRes, proveedoresRes] =
          await Promise.all([
            supabase.from('materiales').select('id', { count: 'exact', head: true }),
            supabase
              .from('ordenes_compra')
              .select('id', { count: 'exact', head: true })
              .eq('estado', 'pendiente'),
            supabase
              .from('gastos')
              .select('monto')
              .eq('mes', currentMonth)
              .eq('anio', currentYear),
            supabase.from('proveedores').select('id', { count: 'exact', head: true }),
          ]);

        const gastoTotal =
          gastosRes.data?.reduce((sum, g) => sum + (g.monto || 0), 0) ?? 0;

        setStats({
          totalMateriales: materialesRes.count ?? 0,
          ordenesPendientes: ordenesRes.count ?? 0,
          gastosMes: gastoTotal,
          totalProveedores: proveedoresRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      label: 'Total Materiales',
      value: stats.totalMateriales,
      icon: Package,
      format: 'number' as const,
    },
    {
      label: 'Órdenes Pendientes',
      value: stats.ordenesPendientes,
      icon: ShoppingCart,
      format: 'number' as const,
    },
    {
      label: 'Gastos del Mes',
      value: stats.gastosMes,
      icon: DollarSign,
      format: 'currency' as const,
    },
    {
      label: 'Proveedores',
      value: stats.totalProveedores,
      icon: Truck,
      format: 'number' as const,
    },
  ];

  const quickActions = [
    { label: 'Nuevo Material', href: '/inventario?action=nuevo' },
    { label: 'Nueva Orden', href: '/ordenes?action=nueva' },
    { label: 'Registrar Gasto', href: '/gastos?action=nuevo' },
  ];

  const formatValue = (value: number, format: 'number' | 'currency') => {
    if (format === 'currency') {
      return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return value.toLocaleString('es-MX');
  };

  return (
    <div className="pt-10 md:pt-0">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bienvenido al panel de administración de Acabados RO
        </p>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
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
                <div className="rounded-lg bg-[#1a365d]/10 p-3">
                  <Icon size={24} className="text-[#1a365d]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Acciones Rápidas
        </h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className="rounded-lg bg-[#1a365d] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
