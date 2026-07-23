'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Edit2, Trash2, Download, DollarSign, Calendar, Camera, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Gasto, TipoGasto, MESES, CATEGORIAS_GASTO } from '@/lib/types';
import { exportMultiSheetExcel, formatCurrency, formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';

const CATEGORIA_COLORS: Record<TipoGasto, { border: string; bg: string; text: string; badge: string }> = {
  nomina: { border: 'border-l-blue-500', bg: 'bg-blue-100', text: 'text-blue-800', badge: 'badge-info' },
  seguros: { border: 'border-l-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800', badge: 'badge-success' },
  materiales: { border: 'border-l-amber-500', bg: 'bg-amber-100', text: 'text-amber-800', badge: 'badge-warning' },
  palazuelos: { border: 'border-l-rose-500', bg: 'bg-rose-100', text: 'text-rose-800', badge: 'badge-danger' },
  empleados: { border: 'border-l-cyan-500', bg: 'bg-cyan-100', text: 'text-cyan-800', badge: 'badge-info' },
  otros: { border: 'border-l-purple-500', bg: 'bg-purple-100', text: 'text-purple-800', badge: 'badge-warning' },
};

interface GastoForm {
  categoria: TipoGasto;
  concepto: string;
  monto: string;
  fecha: string;
  proveedor: string;
  notas: string;
}

const emptyForm: GastoForm = {
  categoria: 'nomina',
  concepto: '',
  monto: '',
  fecha: '',
  proveedor: '',
  notas: '',
};

function extractCfdiGasto(text: string): Partial<GastoForm> {
  const result: Partial<GastoForm> = {};
  const upper = text.toUpperCase();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const totalMatch = upper.match(/TOTAL\s*\$?\s*([\d,]+\.\d{2})/);
  if (totalMatch) result.monto = totalMatch[1].replace(/,/g, '');

  const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) result.fecha = dateMatch[0];

  for (const line of lines) {
    if (/nombre\s*emisor|emisor/i.test(line) && line.includes(':')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (val.length > 2) { result.proveedor = val; break; }
    }
  }
  if (!result.proveedor) {
    const emisorMatch = upper.match(/NOMBRE\s*EMISOR[:\s]*([A-ZÁÉÍÓÚÑ\s]+)/);
    if (emisorMatch) result.proveedor = emisorMatch[1].trim();
  }

  for (const line of lines) {
    if (/descripci[oó]n/i.test(line)) {
      const desc = line.replace(/^descripci[oó]n\s*/i, '').trim();
      if (desc.length > 5) { result.concepto = desc; break; }
    }
  }
  if (!result.concepto) {
    const descIdx = lines.findIndex((l) => /descripci[oó]n/i.test(l));
    if (descIdx >= 0 && descIdx + 1 < lines.length) {
      const nextLine = lines[descIdx + 1];
      if (nextLine.length > 5 && !/impuesto|traslado|tasa|base/i.test(nextLine)) {
        result.concepto = nextLine;
      }
    }
  }

  if (/MATERIAL|TABLAROCA|CEMENTO|ARENA|GRAVA|PINTURA|FERRET|PLOMER/i.test(upper)) {
    result.categoria = 'materiales';
  } else if (/N[OÓ]MINA|SALARIO|SUELDO/i.test(upper)) {
    result.categoria = 'nomina';
  } else if (/SEGURO|IMSS|INFONAVIT|LEGAL|P[OÓ]LIZA/i.test(upper)) {
    result.categoria = 'seguros';
  } else if (/PALAZUELOS/i.test(upper)) {
    result.categoria = 'palazuelos';
  }

  const notaParts: string[] = [];
  const subtotalMatch = upper.match(/SUBTOTAL\s*\$?\s*([\d,]+\.\d{2})/);
  const ivaMatch = upper.match(/IVA\s*\d*\.?\d*%?\s*\$?\s*([\d,]+\.\d{2})/);
  if (subtotalMatch) notaParts.push(`Subtotal: $${subtotalMatch[1]}`);
  if (ivaMatch) notaParts.push(`IVA: $${ivaMatch[1]}`);
  const rfcEmisor = upper.match(/RFC\s*EMISOR[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);
  if (rfcEmisor) notaParts.push(`RFC Emisor: ${rfcEmisor[1]}`);
  const uuidMatch = text.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
  if (uuidMatch) notaParts.push(`Folio Fiscal: ${uuidMatch[0].toUpperCase()}`);
  const folioMatch = upper.match(/FOLIO[:\s]*(\d+)/);
  if (folioMatch) notaParts.push(`Folio: ${folioMatch[1]}`);
  if (notaParts.length > 0) result.notas = notaParts.join(' | ');

  return result;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function GastosPage() {
  const params = useParams();
  const projectId = params.id as string;

  const now = new Date();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMes, setFilterMes] = useState(0);
  const [filterAnio, setFilterAnio] = useState(now.getFullYear());
  const [filterCategoria, setFilterCategoria] = useState<TipoGasto | 'todos'>('todos');

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null);
  const [deletingGasto, setDeletingGasto] = useState<Gasto | null>(null);
  const [form, setForm] = useState<GastoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastIdCounter = 0;

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + (toastIdCounter++);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Solo se aceptan imágenes (JPG, PNG)', 'error');
      return;
    }
    setOcrProcessing(true);
    showToast('Analizando imagen... esto puede tomar unos segundos', 'success');
    try {
      const Tesseract = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(file, 'spa');
      const extracted = extractCfdiGasto(text);
      setForm((prev) => ({
        categoria: extracted.categoria || prev.categoria,
        concepto: extracted.concepto || prev.concepto,
        monto: extracted.monto || prev.monto,
        fecha: extracted.fecha || prev.fecha,
        proveedor: extracted.proveedor || prev.proveedor,
        notas: extracted.notas || prev.notas,
      }));
      const count = Object.values(extracted).filter(Boolean).length;
      if (count > 0) {
        showToast(`Se extrajeron ${count} dato${count !== 1 ? 's' : ''} de la imagen. Verifica los campos.`, 'success');
      } else {
        showToast('No se pudieron extraer datos claros. Ingresa manualmente.', 'error');
      }
    } catch {
      showToast('Error al analizar la imagen', 'error');
    } finally {
      setOcrProcessing(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('gastos')
        .select('*')
        .eq('proyecto_id', projectId)
        .eq('anio', filterAnio)
        .order('fecha', { ascending: false });

      if (filterMes > 0) {
        query = query.eq('mes', filterMes);
      }

      if (filterCategoria !== 'todos') {
        query = query.eq('categoria', filterCategoria);
      }

      const { data, error } = await query;
      if (error) throw error;
      setGastos(data ?? []);
    } catch (err) {
      console.error('Error fetching gastos:', err);
      showToast('Error al cargar los gastos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterMes, filterAnio, filterCategoria, showToast, projectId]);

  useEffect(() => {
    fetchGastos();
  }, [fetchGastos]);

  // Totals
  const totalByCategoria = (cat: TipoGasto) =>
    gastos.filter((g) => g.categoria === cat).reduce((sum, g) => sum + g.monto, 0);

  const totals = {
    nomina: totalByCategoria('nomina'),
    seguros: totalByCategoria('seguros'),
    materiales: totalByCategoria('materiales'),
    palazuelos: totalByCategoria('palazuelos'),
    empleados: totalByCategoria('empleados'),
    otros: totalByCategoria('otros'),
  };
  const granTotal = Object.values(totals).reduce((sum, v) => sum + v, 0);

  // Form handlers
  const openAddModal = () => {
    setEditingGasto(null);
    setForm(emptyForm);
    setShowFormModal(true);
  };

  const openEditModal = (gasto: Gasto) => {
    setEditingGasto(gasto);
    setForm({
      categoria: gasto.categoria,
      concepto: gasto.concepto,
      monto: String(gasto.monto),
      fecha: gasto.fecha,
      proveedor: gasto.proveedor ?? '',
      notas: gasto.notas ?? '',
    });
    setShowFormModal(true);
  };

  const openDeleteModal = (gasto: Gasto) => {
    setDeletingGasto(gasto);
    setShowDeleteModal(true);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      // Auto-set mes and anio when fecha changes
      if (name === 'fecha' && value) {
        const dateObj = new Date(value + 'T00:00:00');
        if (!isNaN(dateObj.getTime())) {
          // mes and anio are derived on save, not stored in form
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    // Validation
    if (!form.categoria || !form.concepto.trim() || !form.monto || !form.fecha) {
      showToast('Completa los campos obligatorios: categoria, concepto, monto y fecha', 'error');
      return;
    }
    const montoNum = parseFloat(form.monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast('El monto debe ser un numero positivo', 'error');
      return;
    }

    // Derive mes and anio from fecha
    const dateObj = new Date(form.fecha + 'T00:00:00');
    const mes = dateObj.getMonth() + 1;
    const anio = dateObj.getFullYear();

    setSaving(true);
    try {
      const payload = {
        categoria: form.categoria,
        concepto: form.concepto.trim(),
        monto: montoNum,
        fecha: form.fecha,
        mes,
        anio,
        proveedor: form.proveedor.trim() || null,
        notas: form.notas.trim() || null,
        proyecto_id: projectId,
      };

      if (editingGasto) {
        const { error } = await supabase
          .from('gastos')
          .update(payload)
          .eq('id', editingGasto.id);
        if (error) throw error;
        showToast('Gasto actualizado correctamente', 'success');
      } else {
        const { error } = await supabase.from('gastos').insert(payload);
        if (error) throw error;
        showToast('Gasto registrado correctamente', 'success');
      }

      setShowFormModal(false);
      setEditingGasto(null);
      setForm(emptyForm);
      fetchGastos();
    } catch (err) {
      console.error('Error saving gasto:', err);
      showToast('Error al guardar el gasto', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGasto) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('gastos').delete().eq('id', deletingGasto.id);
      if (error) throw error;
      showToast('Gasto eliminado correctamente', 'success');
      setShowDeleteModal(false);
      setDeletingGasto(null);
      fetchGastos();
    } catch (err) {
      console.error('Error deleting gasto:', err);
      showToast('Error al eliminar el gasto', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Excel export — always exports the full year with monthly breakdown + summary
  const handleExport = async () => {
    try {
      const { data: allGastos, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('proyecto_id', projectId)
        .eq('anio', filterAnio)
        .order('fecha', { ascending: true });

      if (error) throw error;
      if (!allGastos || allGastos.length === 0) {
        showToast('No hay gastos para exportar en este año', 'error');
        return;
      }

      const categoriasKeys: TipoGasto[] = ['nomina', 'seguros', 'materiales', 'palazuelos', 'empleados', 'otros'];

      // Sheet 1: Resumen Anual — rows per category, columns per month + total
      const resumenHeaders = [
        { key: 'categoria', label: 'Categoría' },
        ...MESES.map((m, i) => ({ key: `mes_${i + 1}`, label: m })),
        { key: 'total', label: 'Total' },
      ];

      const resumenData = categoriasKeys.map((cat) => {
        const row: Record<string, unknown> = { categoria: CATEGORIAS_GASTO[cat] };
        let catTotal = 0;
        for (let m = 1; m <= 12; m++) {
          const mesTotal = allGastos
            .filter((g) => g.categoria === cat && g.mes === m)
            .reduce((sum: number, g: Gasto) => sum + g.monto, 0);
          row[`mes_${m}`] = mesTotal > 0 ? formatCurrency(mesTotal) : '$0.00';
          catTotal += mesTotal;
        }
        row.total = formatCurrency(catTotal);
        return row;
      });

      const grandTotalRow: Record<string, unknown> = { categoria: 'TOTAL GENERAL' };
      let grandTotalSum = 0;
      for (let m = 1; m <= 12; m++) {
        const mesTotal = allGastos
          .filter((g) => g.mes === m)
          .reduce((sum: number, g: Gasto) => sum + g.monto, 0);
        grandTotalRow[`mes_${m}`] = mesTotal > 0 ? formatCurrency(mesTotal) : '$0.00';
        grandTotalSum += mesTotal;
      }
      grandTotalRow.total = formatCurrency(grandTotalSum);
      resumenData.push(grandTotalRow);

      // Detail headers for per-category sheets
      const detailHeaders = [
        { key: 'mes', label: 'Mes' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'monto', label: 'Monto' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'notas', label: 'Notas' },
      ];

      const makeDetailData = (cat: TipoGasto) => {
        const items = allGastos
          .filter((g) => g.categoria === cat)
          .map((g) => ({
            mes: MESES[g.mes - 1] ?? '',
            fecha: formatDate(g.fecha),
            concepto: g.concepto,
            monto: formatCurrency(g.monto),
            proveedor: g.proveedor ?? '',
            notas: g.notas ?? '',
          }));
        if (items.length > 0) {
          const catTotal = allGastos
            .filter((g) => g.categoria === cat)
            .reduce((sum, g) => sum + g.monto, 0);
          items.push({
            mes: '',
            fecha: '',
            concepto: 'TOTAL',
            monto: formatCurrency(catTotal),
            proveedor: '',
            notas: '',
          });
        }
        return items;
      };

      const sheets = [
        { name: 'Resumen Anual', data: resumenData, headers: resumenHeaders },
        { name: 'Nóminas', data: makeDetailData('nomina'), headers: detailHeaders },
        { name: 'Legales', data: makeDetailData('seguros'), headers: detailHeaders },
        { name: 'Materiales', data: makeDetailData('materiales'), headers: detailHeaders },
        { name: 'Palazuelos', data: makeDetailData('palazuelos'), headers: detailHeaders },
        { name: 'Empleados', data: makeDetailData('empleados'), headers: detailHeaders },
        { name: 'Otros Gastos', data: makeDetailData('otros'), headers: detailHeaders },
      ];

      const filename = `Reporte_Gastos_Acabados_RO_${filterAnio}`;
      exportMultiSheetExcel(sheets, filename, `Acabados RO — Reporte de Gastos ${filterAnio}`);
      showToast('Reporte Excel exportado correctamente', 'success');
    } catch (err) {
      console.error('Error exporting:', err);
      showToast('Error al exportar el reporte', 'error');
    }
  };

  // Year range for filter
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const summaryCards = [
    { label: 'Total Nóminas', value: totals.nomina, cat: 'nomina' as TipoGasto },
    { label: 'Total Legales', value: totals.seguros, cat: 'seguros' as TipoGasto },
    { label: 'Total Materiales', value: totals.materiales, cat: 'materiales' as TipoGasto },
    { label: 'Total Palazuelos', value: totals.palazuelos, cat: 'palazuelos' as TipoGasto },
    { label: 'Total Empleados', value: totals.empleados, cat: 'empleados' as TipoGasto },
    { label: 'Total Otros', value: totals.otros, cat: 'otros' as TipoGasto },
  ];

  return (
    <div className="pt-10 md:pt-0">
      {/* Toast notifications */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-in rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-4 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B1A1A] to-[#A52222] shadow-md">
            <DollarSign className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Administra los gastos de Acabados RO
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="btn-secondary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            <Download size={16} />
            Exportar Reporte Excel
          </button>
          <button
            onClick={openAddModal}
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            <Plus size={16} />
            Registrar Gasto
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card-modern mb-6 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              <Calendar size={12} className="mr-1 inline" />
              Mes
            </label>
            <select
              value={filterMes}
              onChange={(e) => setFilterMes(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value={0}>Todos los meses</option>
              {MESES.map((mes, i) => (
                <option key={i} value={i + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Ano
            </label>
            <select
              value={filterAnio}
              onChange={(e) => setFilterAnio(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Categoria
            </label>
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value as TipoGasto | 'todos')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value="todos">Todas las categorias</option>
              {(Object.keys(CATEGORIAS_GASTO) as TipoGasto[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORIAS_GASTO[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map((card, idx) => (
          <div
            key={card.cat}
            className={`card-modern animate-slide-in-up border-l-4 ${CATEGORIA_COLORS[card.cat].border} bg-white p-4`}
            style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s`, opacity: 0 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">{card.label}</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {loading ? (
                    <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-200" />
                  ) : (
                    formatCurrency(card.value)
                  )}
                </p>
              </div>
              <div className={`rounded-lg ${CATEGORIA_COLORS[card.cat].bg} p-2`}>
                <DollarSign size={18} className={CATEGORIA_COLORS[card.cat].text} />
              </div>
            </div>
          </div>
        ))}

        {/* Gran Total */}
        <div
          className="card-modern animate-slide-in-up border-l-4 border-l-[#1a365d] bg-white p-4"
          style={{ animationDelay: `${Math.min(summaryCards.length, 8) * 0.05}s`, opacity: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Gran Total</p>
              <p className="mt-1 text-lg font-bold text-[#1a365d]">
                {loading ? (
                  <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-200" />
                ) : (
                  formatCurrency(granTotal)
                )}
              </p>
            </div>
            <div className="rounded-lg bg-[#1a365d]/10 p-2">
              <DollarSign size={18} className="text-[#1a365d]" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-modern animate-pulse bg-white p-4">
                <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : gastos.length === 0 ? (
          <div className="card-modern flex items-center justify-center bg-white py-12 text-sm text-gray-400">
            No se encontraron gastos para los filtros seleccionados.
          </div>
        ) : (
          gastos.map((gasto) => (
            <div key={gasto.id} className={`card-modern border-l-4 ${CATEGORIA_COLORS[gasto.categoria].border} bg-white p-4`}>
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{gasto.concepto}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${CATEGORIA_COLORS[gasto.categoria].badge}`}>
                      {CATEGORIAS_GASTO[gasto.categoria]}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(gasto.fecha)}</span>
                  </div>
                </div>
                <p className="text-base font-bold text-gray-900">{formatCurrency(gasto.monto)}</p>
              </div>
              {(gasto.proveedor || gasto.notas) && (
                <div className="mb-2 space-y-0.5 text-xs text-gray-500">
                  {gasto.proveedor && <p>Proveedor: {gasto.proveedor}</p>}
                  {gasto.notas && <p className="truncate">{gasto.notas}</p>}
                </div>
              )}
              <div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-2">
                <button
                  onClick={() => openEditModal(gasto)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#1a365d] transition-colors active:bg-gray-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => openDeleteModal(gasto)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors active:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="card-modern hidden overflow-hidden bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Categoria</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Concepto</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Monto</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Proveedor</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Notas</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <span className="inline-block h-4 w-full max-w-[120px] animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : gastos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron gastos para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                gastos.map((gasto) => (
                  <tr
                    key={gasto.id}
                    className="border-b border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {formatDate(gasto.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${CATEGORIA_COLORS[gasto.categoria].badge}`}
                      >
                        {CATEGORIAS_GASTO[gasto.categoria]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{gasto.concepto}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(gasto.monto)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{gasto.proveedor ?? '-'}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">
                      {gasto.notas ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(gasto)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteModal(gasto)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Gasto Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingGasto(null);
          setForm(emptyForm);
        }}
        title={editingGasto ? 'Editar Gasto' : 'Registrar Gasto'}
        size="lg"
      >
        <div className="space-y-4">
          {/* OCR Upload — only for new gastos */}
          {!editingGasto && (
            <div className="rounded-xl border-2 border-dashed border-[#1a365d]/30 bg-[#1a365d]/5 p-4">
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleOcrUpload}
              />
              <button
                type="button"
                onClick={() => ocrInputRef.current?.click()}
                disabled={ocrProcessing}
                className="flex w-full flex-col items-center gap-2 text-center"
              >
                {ocrProcessing ? (
                  <>
                    <svg className="h-8 w-8 animate-spin text-[#1a365d]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium text-[#1a365d]">Analizando imagen...</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Camera size={22} className="text-[#1a365d]" />
                      <Upload size={18} className="text-[#1a365d]/60" />
                    </div>
                    <span className="text-sm font-medium text-[#1a365d]">
                      Subir foto de factura / comprobante
                    </span>
                    <span className="text-xs text-gray-400">
                      Se extraerán los datos automáticamente
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Categoria <span className="text-red-500">*</span>
            </label>
            <select
              name="categoria"
              value={form.categoria}
              onChange={handleFormChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              {(Object.keys(CATEGORIAS_GASTO) as TipoGasto[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORIAS_GASTO[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="concepto"
              value={form.concepto}
              onChange={handleFormChange}
              placeholder="Descripcion del gasto"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Monto <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  name="monto"
                  value={form.monto}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="fecha"
                value={form.fecha}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Proveedor
            </label>
            <input
              type="text"
              name="proveedor"
              value={form.proveedor}
              onChange={handleFormChange}
              placeholder="Nombre del proveedor (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notas
            </label>
            <textarea
              name="notas"
              value={form.notas}
              onChange={handleFormChange}
              rows={3}
              placeholder="Notas adicionales (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => {
                setShowFormModal(false);
                setEditingGasto(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingGasto ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingGasto(null);
        }}
        title="Eliminar Gasto"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            Estas seguro de que deseas eliminar el gasto{' '}
            <span className="font-semibold text-gray-900">
              &ldquo;{deletingGasto?.concepto}&rdquo;
            </span>{' '}
            por{' '}
            <span className="font-semibold text-gray-900">
              {deletingGasto ? formatCurrency(deletingGasto.monto) : ''}
            </span>
            ? Esta accion no se puede deshacer.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingGasto(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
