'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Truck,
  HardHat,
  Plus,
  ArrowRight,
  AlertTriangle,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MESES, CATEGORIAS_GASTO, TipoGasto } from '@/lib/types';
import { exportMultiSheetExcel, formatCurrency as fmtCur } from '@/lib/export-utils';

const RechartsBar = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);
const RechartsPie = dynamic(
  () => import('recharts').then((m) => m.PieChart),
  { ssr: false },
);
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });

interface Stats {
  totalMateriales: number;
  ordenesPendientes: number;
  totalIngresos: number;
  totalGastos: number;
  totalProveedores: number;
  totalEmpleados: number;
  lowStockCount: number;
}

interface MonthData {
  mes: string;
  mesNum: number;
  ingresos: number;
  gastos: number;
  balance: number;
}

interface CatData {
  name: string;
  key: string;
  value: number;
  color: string;
}

interface InventarioItem {
  nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  valor_total: number;
}

const CAT_COLORS: Record<string, string> = {
  nomina: '#3B82F6',
  seguros: '#10B981',
  materiales: '#F59E0B',
  palazuelos: '#F43F5E',
  empleados: '#06B6D4',
  otros: '#8B5CF6',
};

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ProjectDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const base = `/proyecto/${projectId}`;

  const now = new Date();
  const currentYear = now.getFullYear();

  const [userName, setUserName] = useState('');
  const [reportYear, setReportYear] = useState(currentYear);
  const [stats, setStats] = useState<Stats>({
    totalMateriales: 0,
    ordenesPendientes: 0,
    totalIngresos: 0,
    totalGastos: 0,
    totalProveedores: 0,
    totalEmpleados: 0,
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [catData, setCatData] = useState<CatData[]>([]);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        }

        const [materialesRes, ordenesRes, ingresosRes, gastosRes, proveedoresRes, empleadosRes, lowStockRes] =
          await Promise.all([
            supabase.from('materiales').select('id', { count: 'exact', head: true }),
            supabase.from('ordenes_compra').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').eq('proyecto_id', projectId),
            supabase.from('ingresos').select('monto').eq('proyecto_id', projectId),
            supabase.from('gastos').select('monto').eq('proyecto_id', projectId),
            supabase.from('proveedores').select('id', { count: 'exact', head: true }),
            supabase.from('empleados').select('id', { count: 'exact', head: true }).eq('proyecto_id', projectId).eq('estado', 'activo'),
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
          totalEmpleados: empleadosRes.count ?? 0,
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

  const fetchReportData = useCallback(async () => {
    setLoadingReport(true);
    try {
      const [ingresosRes, gastosRes, invRes] = await Promise.all([
        supabase.from('ingresos').select('monto, mes, anio').eq('proyecto_id', projectId).eq('anio', reportYear),
        supabase.from('gastos').select('monto, mes, anio, categoria').eq('proyecto_id', projectId).eq('anio', reportYear),
        supabase.from('materiales').select('nombre, unidad, cantidad, precio_unitario'),
      ]);

      const ingresos = ingresosRes.data ?? [];
      const gastos = gastosRes.data ?? [];
      const materiales = invRes.data ?? [];

      const monthly: MonthData[] = MESES.map((mes, i) => {
        const mesNum = i + 1;
        const ingMes = ingresos.filter((r) => r.mes === mesNum).reduce((s, r) => s + (r.monto || 0), 0);
        const gasMes = gastos.filter((r) => r.mes === mesNum).reduce((s, r) => s + (r.monto || 0), 0);
        return { mes: MESES_SHORT[i], mesNum, ingresos: ingMes, gastos: gasMes, balance: ingMes - gasMes };
      });
      setMonthlyData(monthly);

      const catKeys = Object.keys(CATEGORIAS_GASTO) as TipoGasto[];
      const cats: CatData[] = catKeys
        .map((key) => {
          const total = gastos.filter((g) => g.categoria === key).reduce((s, g) => s + (g.monto || 0), 0);
          return { name: CATEGORIAS_GASTO[key], key, value: total, color: CAT_COLORS[key] || '#999' };
        })
        .filter((c) => c.value > 0);
      setCatData(cats);

      const inv: InventarioItem[] = materiales
        .filter((m) => m.cantidad > 0)
        .map((m) => ({
          nombre: m.nombre,
          unidad: m.unidad,
          cantidad: Number(m.cantidad),
          precio_unitario: Number(m.precio_unitario),
          valor_total: Number(m.cantidad) * Number(m.precio_unitario),
        }))
        .sort((a, b) => b.valor_total - a.valor_total);
      setInventario(inv);

      setChartsReady(true);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoadingReport(false);
    }
  }, [projectId, reportYear]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const totalIngresosYear = monthlyData.reduce((s, m) => s + m.ingresos, 0);
  const totalGastosYear = monthlyData.reduce((s, m) => s + m.gastos, 0);
  const balanceYear = totalIngresosYear - totalGastosYear;
  const margenPct = totalIngresosYear > 0 ? ((balanceYear / totalIngresosYear) * 100) : 0;
  const totalInventarioValor = inventario.reduce((s, i) => s + i.valor_total, 0);

  const handleExportReport = async () => {
    const { data: ingresosRaw } = await supabase
      .from('ingresos').select('*').eq('proyecto_id', projectId).eq('anio', reportYear).order('fecha');
    const { data: gastosRaw } = await supabase
      .from('gastos').select('*').eq('proyecto_id', projectId).eq('anio', reportYear).order('fecha');
    const { data: materialesRaw } = await supabase
      .from('materiales').select('nombre, unidad, cantidad, precio_unitario').gt('cantidad', 0).order('nombre');

    const allIngresos = ingresosRaw ?? [];
    const allGastos = gastosRaw ?? [];
    const allMateriales = materialesRaw ?? [];

    const catKeys = Object.keys(CATEGORIAS_GASTO) as TipoGasto[];

    // Sheet 1: Resumen Ejecutivo
    const resumenHeaders = [
      { key: 'concepto', label: 'Concepto' },
      { key: 'valor', label: 'Monto' },
      { key: 'porcentaje', label: '% del Ingreso' },
    ];
    const resumenData = [
      { concepto: 'Total Ingresos', valor: fmtCur(totalIngresosYear), porcentaje: '100%' },
      ...catKeys.map((cat) => {
        const total = allGastos.filter((g) => g.categoria === cat).reduce((s, g) => s + g.monto, 0);
        const pct = totalIngresosYear > 0 ? ((total / totalIngresosYear) * 100).toFixed(1) + '%' : '0%';
        return { concepto: `(-) ${CATEGORIAS_GASTO[cat]}`, valor: fmtCur(total), porcentaje: pct };
      }),
      { concepto: 'TOTAL GASTOS', valor: fmtCur(totalGastosYear), porcentaje: totalIngresosYear > 0 ? ((totalGastosYear / totalIngresosYear) * 100).toFixed(1) + '%' : '0%' },
      { concepto: '', valor: '', porcentaje: '' },
      { concepto: 'BALANCE (Utilidad / Pérdida)', valor: fmtCur(balanceYear), porcentaje: margenPct.toFixed(1) + '%' },
      { concepto: 'Valor del Inventario', valor: fmtCur(totalInventarioValor), porcentaje: '' },
    ];

    // Sheet 2: Balance Mensual
    const balanceHeaders = [
      { key: 'mes', label: 'Mes' },
      { key: 'ingresos', label: 'Ingresos' },
      { key: 'gastos', label: 'Gastos' },
      { key: 'balance', label: 'Balance' },
      { key: 'acumulado', label: 'Balance Acumulado' },
    ];
    let acumulado = 0;
    const balanceData = monthlyData.map((m) => {
      acumulado += m.balance;
      return {
        mes: MESES[m.mesNum - 1],
        ingresos: fmtCur(m.ingresos),
        gastos: fmtCur(m.gastos),
        balance: fmtCur(m.balance),
        acumulado: fmtCur(acumulado),
      };
    });
    balanceData.push({
      mes: 'TOTAL',
      ingresos: fmtCur(totalIngresosYear),
      gastos: fmtCur(totalGastosYear),
      balance: fmtCur(balanceYear),
      acumulado: fmtCur(acumulado),
    });

    // Sheet 3: Gastos por Categoría x Mes
    const gastosMesHeaders = [
      { key: 'categoria', label: 'Categoría' },
      ...MESES.map((m, i) => ({ key: `mes_${i + 1}`, label: m })),
      { key: 'total', label: 'Total' },
    ];
    const gastosMesData = catKeys.map((cat) => {
      const row: Record<string, unknown> = { categoria: CATEGORIAS_GASTO[cat] };
      let catTotal = 0;
      for (let m = 1; m <= 12; m++) {
        const val = allGastos.filter((g) => g.categoria === cat && g.mes === m).reduce((s, g) => s + g.monto, 0);
        row[`mes_${m}`] = val > 0 ? fmtCur(val) : '$0.00';
        catTotal += val;
      }
      row.total = fmtCur(catTotal);
      return row;
    });
    const totalRow: Record<string, unknown> = { categoria: 'TOTAL GENERAL' };
    for (let m = 1; m <= 12; m++) {
      const val = allGastos.filter((g) => g.mes === m).reduce((s, g) => s + g.monto, 0);
      totalRow[`mes_${m}`] = val > 0 ? fmtCur(val) : '$0.00';
    }
    totalRow.total = fmtCur(totalGastosYear);
    gastosMesData.push(totalRow);

    // Sheet 4: Ingresos Detallados
    const ingDetHeaders = [
      { key: 'fecha', label: 'Fecha' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'monto', label: 'Monto' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'metodo', label: 'Método de Pago' },
      { key: 'factura', label: 'Factura' },
    ];
    const ingDetData = allIngresos.map((i) => ({
      fecha: i.fecha,
      concepto: i.concepto,
      monto: fmtCur(i.monto),
      cliente: i.cliente ?? '',
      metodo: i.metodo_pago ?? '',
      factura: i.factura ?? '',
    }));
    if (ingDetData.length > 0) {
      ingDetData.push({ fecha: '', concepto: 'TOTAL', monto: fmtCur(totalIngresosYear), cliente: '', metodo: '', factura: '' });
    }

    // Sheet 5: Gastos Detallados
    const gasDetHeaders = [
      { key: 'fecha', label: 'Fecha' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'monto', label: 'Monto' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'notas', label: 'Notas' },
    ];
    const gasDetData = allGastos.map((g) => ({
      fecha: g.fecha,
      categoria: CATEGORIAS_GASTO[g.categoria as TipoGasto] ?? g.categoria,
      concepto: g.concepto,
      monto: fmtCur(g.monto),
      proveedor: g.proveedor ?? '',
      notas: g.notas ?? '',
    }));
    if (gasDetData.length > 0) {
      gasDetData.push({ fecha: '', categoria: '', concepto: 'TOTAL', monto: fmtCur(totalGastosYear), proveedor: '', notas: '' });
    }

    // Sheet 6: Inventario Valorizado
    const invHeaders = [
      { key: 'nombre', label: 'Material' },
      { key: 'unidad', label: 'Unidad' },
      { key: 'cantidad', label: 'Cantidad' },
      { key: 'precio', label: 'Precio Unitario' },
      { key: 'valor', label: 'Valor Total' },
    ];
    const invData = allMateriales.map((m) => ({
      nombre: m.nombre,
      unidad: m.unidad,
      cantidad: Number(m.cantidad).toLocaleString('es-MX'),
      precio: fmtCur(Number(m.precio_unitario)),
      valor: fmtCur(Number(m.cantidad) * Number(m.precio_unitario)),
    }));
    const totalInvValue = allMateriales.reduce((s, m) => s + Number(m.cantidad) * Number(m.precio_unitario), 0);
    invData.push({ nombre: 'TOTAL INVENTARIO', unidad: '', cantidad: '', precio: '', valor: fmtCur(totalInvValue) });

    const sheets = [
      { name: 'Resumen Ejecutivo', data: resumenData, headers: resumenHeaders },
      { name: 'Balance Mensual', data: balanceData, headers: balanceHeaders },
      { name: 'Gastos por Categoría', data: gastosMesData, headers: gastosMesHeaders },
      { name: 'Ingresos Detallados', data: ingDetData, headers: ingDetHeaders },
      { name: 'Gastos Detallados', data: gasDetData, headers: gasDetHeaders },
      { name: 'Inventario Valorizado', data: invData, headers: invHeaders },
    ];

    exportMultiSheetExcel(sheets, `Reporte_Financiero_Acabados_RO_${reportYear}`, `Acabados RO — Reporte Financiero ${reportYear}`);
  };

  const fmtMoney = (v: number) =>
    `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statCards = [
    { label: 'Total Ingresos', value: stats.totalIngresos, icon: TrendingUp, format: 'currency' as const, color: 'from-[#16a34a] to-[#22c55e]', href: `${base}/ingresos` },
    { label: 'Total Gastos', value: stats.totalGastos, icon: DollarSign, format: 'currency' as const, color: 'from-[#8B1A1A] to-[#A52222]', href: `${base}/gastos` },
    { label: 'Órdenes Pendientes', value: stats.ordenesPendientes, icon: ShoppingCart, format: 'number' as const, color: 'from-[#D4A520] to-[#E8B82E]', href: `${base}/ordenes` },
    { label: 'Total Materiales', value: stats.totalMateriales, icon: Package, format: 'number' as const, color: 'from-[#1a365d] to-[#2a4a7f]', href: `${base}/inventario` },
    { label: 'Empleados Activos', value: stats.totalEmpleados, icon: HardHat, format: 'number' as const, color: 'from-[#16a34a] to-[#22c55e]', href: `${base}/empleados` },
    { label: 'Proveedores', value: stats.totalProveedores, icon: Truck, format: 'number' as const, color: 'from-[#1a365d] to-[#2a4a7f]', href: `${base}/proveedores` },
  ];

  const quickActions = [
    { label: 'Registrar Ingreso', href: `${base}/ingresos`, icon: TrendingUp },
    { label: 'Registrar Gasto', href: `${base}/gastos`, icon: DollarSign },
    { label: 'Nueva Orden', href: `${base}/ordenes`, icon: ShoppingCart },
    { label: 'Nuevo Material', href: `${base}/inventario`, icon: Package },
    { label: 'Alta Empleado', href: `${base}/empleados`, icon: HardHat },
    { label: 'Nuevo Proveedor', href: `${base}/proveedores`, icon: Truck },
  ];

  const formatValue = (value: number, format: 'number' | 'currency') => {
    if (format === 'currency') return fmtMoney(value);
    return value.toLocaleString('es-MX');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customTooltipFormatter = (value: any) => fmtMoney(Number(value));

  return (
    <div className="pt-10 md:pt-0">
      {/* Welcome Header */}
      <div className="mb-8 animate-fade-in">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#1a365d] to-[#2a4a7f] p-6 shadow-lg md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#D4A520]">{getGreeting()}</p>
              <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
                {userName || 'Administrador'}
              </h1>
              <p className="mt-2 text-sm text-white/60">Panel de control — Acabados RO</p>
            </div>
            <div className="hidden md:block">
              <TrendingUp size={48} className="text-white/20" />
            </div>
          </div>
          <div className="mt-4 h-0.5 w-full bg-gradient-to-r from-[#D4A520] via-[#E8B82E] to-transparent opacity-50" />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={() => router.push(card.href)}
              className={`card-modern animate-slide-in-up stagger-${idx + 1} group relative overflow-hidden p-5 text-left`}
              style={{ opacity: 0 }}
            >
              <div className={`absolute right-0 top-0 h-full w-1 bg-gradient-to-b ${card.color}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#1a365d]">
                    {loading ? <span className="inline-block h-8 w-20 animate-pulse rounded bg-gray-200" /> : formatValue(card.value, card.format)}
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
              <p className="text-xs text-gray-500">Revisa el inventario para reabastecer</p>
            </div>
            <ArrowRight size={18} className="text-[#D4A520]" />
          </button>
        </div>
      )}

      {/* ============================================================= */}
      {/* REPORTE FINANCIERO                                            */}
      {/* ============================================================= */}
      <div className="mb-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
            <FileSpreadsheet size={16} />
            Reporte Financiero
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={handleExportReport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
            >
              <Download size={16} />
              Descargar Reporte Excel
            </button>
          </div>
        </div>

        {/* Financial Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border-l-4 border-l-[#16a34a] card-modern bg-white p-5">
            <p className="text-xs font-medium text-gray-500">Ingresos {reportYear}</p>
            <p className="mt-1 text-2xl font-bold text-[#16a34a]">
              {loadingReport ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-gray-200" /> : fmtMoney(totalIngresosYear)}
            </p>
          </div>
          <div className="rounded-xl border-l-4 border-l-[#8B1A1A] card-modern bg-white p-5">
            <p className="text-xs font-medium text-gray-500">Gastos {reportYear}</p>
            <p className="mt-1 text-2xl font-bold text-[#8B1A1A]">
              {loadingReport ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-gray-200" /> : fmtMoney(totalGastosYear)}
            </p>
          </div>
          <div className={`rounded-xl border-l-4 ${balanceYear >= 0 ? 'border-l-[#16a34a]' : 'border-l-[#dc2626]'} card-modern bg-white p-5`}>
            <p className="text-xs font-medium text-gray-500">Balance {reportYear}</p>
            <p className={`mt-1 text-2xl font-bold ${balanceYear >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {loadingReport ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-gray-200" /> : fmtMoney(balanceYear)}
            </p>
            {!loadingReport && (
              <p className={`mt-0.5 text-xs font-medium ${balanceYear >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {balanceYear >= 0 ? 'Utilidad' : 'Pérdida'}
              </p>
            )}
          </div>
          <div className="rounded-xl border-l-4 border-l-[#D4A520] card-modern bg-white p-5">
            <p className="text-xs font-medium text-gray-500">Margen</p>
            <p className="mt-1 text-2xl font-bold text-[#D4A520]">
              {loadingReport ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-gray-200" /> : `${margenPct.toFixed(1)}%`}
            </p>
            {!loadingReport && (
              <p className="mt-0.5 text-xs text-gray-400">Inventario: {fmtMoney(totalInventarioValor)}</p>
            )}
          </div>
        </div>

        {/* Charts Row */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Bar Chart: Ingresos vs Gastos Mensual */}
          <div className="col-span-1 rounded-xl card-modern bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-[#1a365d]" />
              <h3 className="text-sm font-semibold text-gray-700">Ingresos vs Gastos Mensual — {reportYear}</h3>
            </div>
            {loadingReport ? (
              <div className="flex h-64 items-center justify-center">
                <span className="inline-block h-48 w-full animate-pulse rounded bg-gray-100" />
              </div>
            ) : chartsReady ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBar data={monthlyData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={customTooltipFormatter} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="ingresos" name="Ingresos" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gastos" name="Gastos" fill="#8B1A1A" radius={[4, 4, 0, 0]} />
                  </RechartsBar>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>

          {/* Pie Chart: Gastos por Categoría */}
          <div className="rounded-xl card-modern bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <PieChartIcon size={18} className="text-[#1a365d]" />
              <h3 className="text-sm font-semibold text-gray-700">Distribución de Gastos</h3>
            </div>
            {loadingReport ? (
              <div className="flex h-64 items-center justify-center">
                <span className="inline-block h-48 w-48 animate-pulse rounded-full bg-gray-100" />
              </div>
            ) : catData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                Sin gastos registrados
              </div>
            ) : chartsReady ? (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={catData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                        style={{ fontSize: 9 }}
                      >
                        {catData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={customTooltipFormatter} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {catData.map((c) => (
                    <div key={c.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-gray-600">{c.name}</span>
                      </div>
                      <span className="font-medium text-gray-800">{fmtMoney(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Balance Mensual Table */}
        <div className="mb-6 card-modern bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <DollarSign size={16} className="text-[#1a365d]" />
              Balance Mensual — {reportYear}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-gray-600">Mes</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Ingresos</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Gastos</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Balance</th>
                  <th className="hidden px-4 py-3 text-right font-semibold text-gray-600 sm:table-cell">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {loadingReport ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-2.5">
                          <span className="inline-block h-4 w-20 animate-pulse rounded bg-gray-200" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  (() => {
                    let acc = 0;
                    return monthlyData.map((m) => {
                      acc += m.balance;
                      const hasData = m.ingresos > 0 || m.gastos > 0;
                      return (
                        <tr key={m.mesNum} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${!hasData ? 'text-gray-300' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{MESES[m.mesNum - 1]}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-[#16a34a]">{fmtMoney(m.ingresos)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-[#8B1A1A]">{fmtMoney(m.gastos)}</td>
                          <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${m.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {fmtMoney(m.balance)}
                          </td>
                          <td className={`hidden whitespace-nowrap px-4 py-2.5 text-right font-medium sm:table-cell ${acc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmtMoney(acc)}
                          </td>
                        </tr>
                      );
                    });
                  })()
                )}
                {!loadingReport && (
                  <tr className="border-t-2 border-[#1a365d] bg-gray-50 font-bold">
                    <td className="px-4 py-3 text-[#1a365d]">TOTAL</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[#16a34a]">{fmtMoney(totalIngresosYear)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[#8B1A1A]">{fmtMoney(totalGastosYear)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${balanceYear >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtMoney(balanceYear)}</td>
                    <td className={`hidden whitespace-nowrap px-4 py-3 text-right sm:table-cell ${balanceYear >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtMoney(balanceYear)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Inventario */}
        {inventario.length > 0 && !loadingReport && (
          <div className="card-modern bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Package size={16} className="text-[#1a365d]" />
                Inventario Valorizado — Top 10
              </h3>
              <p className="text-sm font-bold text-[#1a365d]">Total: {fmtMoney(totalInventarioValor)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-gray-600">Material</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Unidad</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Cantidad</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">P. Unitario</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inventario.slice(0, 10).map((item, i) => (
                    <tr key={i} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{item.nombre}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{item.unidad}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-700">{item.cantidad.toLocaleString('es-MX')}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-600">{fmtMoney(item.precio_unitario)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-[#1a365d]">{fmtMoney(item.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="animate-fade-in">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
          <Plus size={16} />
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="card-modern flex flex-col items-center gap-3 bg-white p-5"
              >
                <div className="rounded-xl bg-[#1a365d]/5 p-3">
                  <Icon size={22} className="text-[#1a365d]" />
                </div>
                <span className="text-xs font-medium text-gray-700">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
