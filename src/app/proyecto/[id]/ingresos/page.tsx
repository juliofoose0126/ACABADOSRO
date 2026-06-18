'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Edit2, Trash2, Download, TrendingUp, Calendar, Camera, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Ingreso, MetodoPago, MESES, METODOS_PAGO } from '@/lib/types';
import { exportMultiSheetExcel, formatCurrency, formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';

const METODO_COLORS: Record<MetodoPago, { border: string; bg: string; text: string }> = {
  transferencia: { border: 'border-l-blue-500', bg: 'bg-blue-100', text: 'text-blue-800' },
  efectivo: { border: 'border-l-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  cheque: { border: 'border-l-amber-500', bg: 'bg-amber-100', text: 'text-amber-800' },
  otro: { border: 'border-l-purple-500', bg: 'bg-purple-100', text: 'text-purple-800' },
};

interface IngresoForm {
  concepto: string;
  monto: string;
  fecha: string;
  cliente: string;
  metodo_pago: MetodoPago;
  factura: string;
  notas: string;
}

const emptyForm: IngresoForm = {
  concepto: '',
  monto: '',
  fecha: '',
  cliente: '',
  metodo_pago: 'transferencia',
  factura: '',
  notas: '',
};

function extractCfdiIngreso(text: string): Partial<IngresoForm> {
  const result: Partial<IngresoForm> = {};
  const upper = text.toUpperCase();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const totalMatch = upper.match(/TOTAL\s*\$?\s*([\d,]+\.\d{2})/);
  if (totalMatch) result.monto = totalMatch[1].replace(/,/g, '');

  const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) result.fecha = dateMatch[0];

  const uuidMatch = text.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
  if (uuidMatch) result.factura = uuidMatch[0].toUpperCase();

  if (/TRANSFERENCIA/i.test(upper)) result.metodo_pago = 'transferencia';
  else if (/EFECTIVO/i.test(upper)) result.metodo_pago = 'efectivo';
  else if (/CHEQUE/i.test(upper)) result.metodo_pago = 'cheque';

  for (const line of lines) {
    if (/nombre\s*receptor|receptor/i.test(line) && line.includes(':')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (val.length > 2) { result.cliente = val; break; }
    }
  }
  if (!result.cliente) {
    const receptorMatch = upper.match(/NOMBRE\s*RECEPTOR[:\s]*([A-ZÁÉÍÓÚÑ\s]+)/);
    if (receptorMatch) result.cliente = receptorMatch[1].trim();
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

  const subtotalMatch = upper.match(/SUBTOTAL\s*\$?\s*([\d,]+\.\d{2})/);
  const ivaMatch = upper.match(/IVA\s*\d*\.?\d*%?\s*\$?\s*([\d,]+\.\d{2})/);
  const notaParts: string[] = [];
  if (subtotalMatch) notaParts.push(`Subtotal: $${subtotalMatch[1]}`);
  if (ivaMatch) notaParts.push(`IVA: $${ivaMatch[1]}`);
  const rfcEmisor = upper.match(/RFC\s*EMISOR[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);
  if (rfcEmisor) notaParts.push(`RFC Emisor: ${rfcEmisor[1]}`);
  const rfcReceptor = upper.match(/RFC\s*RECEPTOR[:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);
  if (rfcReceptor) notaParts.push(`RFC Receptor: ${rfcReceptor[1]}`);
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

export default function IngresosPage() {
  const params = useParams();
  const projectId = params.id as string;

  const now = new Date();
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMes, setFilterMes] = useState(0);
  const [filterAnio, setFilterAnio] = useState(now.getFullYear());
  const [filterMetodo, setFilterMetodo] = useState<MetodoPago | 'todos'>('todos');

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState<Ingreso | null>(null);
  const [deletingIngreso, setDeletingIngreso] = useState<Ingreso | null>(null);
  const [form, setForm] = useState<IngresoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

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
      const extracted = extractCfdiIngreso(text);
      setForm((prev) => ({
        concepto: extracted.concepto || prev.concepto,
        monto: extracted.monto || prev.monto,
        fecha: extracted.fecha || prev.fecha,
        cliente: extracted.cliente || prev.cliente,
        metodo_pago: extracted.metodo_pago || prev.metodo_pago,
        factura: extracted.factura || prev.factura,
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

  const fetchIngresos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('ingresos')
        .select('*')
        .eq('proyecto_id', projectId)
        .eq('anio', filterAnio)
        .order('fecha', { ascending: false });

      if (filterMes > 0) {
        query = query.eq('mes', filterMes);
      }

      if (filterMetodo !== 'todos') {
        query = query.eq('metodo_pago', filterMetodo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setIngresos(data ?? []);
    } catch (err) {
      console.error('Error fetching ingresos:', err);
      showToast('Error al cargar los ingresos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterMes, filterAnio, filterMetodo, showToast, projectId]);

  useEffect(() => {
    fetchIngresos();
  }, [fetchIngresos]);

  // Totals by método de pago
  const totalByMetodo = (m: MetodoPago) =>
    ingresos.filter((i) => i.metodo_pago === m).reduce((sum, i) => sum + i.monto, 0);

  const totals = {
    transferencia: totalByMetodo('transferencia'),
    efectivo: totalByMetodo('efectivo'),
    cheque: totalByMetodo('cheque'),
    otro: totalByMetodo('otro'),
  };
  const granTotal = totals.transferencia + totals.efectivo + totals.cheque + totals.otro;

  const openAddModal = () => {
    setEditingIngreso(null);
    setForm(emptyForm);
    setShowFormModal(true);
  };

  const openEditModal = (ingreso: Ingreso) => {
    setEditingIngreso(ingreso);
    setForm({
      concepto: ingreso.concepto,
      monto: String(ingreso.monto),
      fecha: ingreso.fecha,
      cliente: ingreso.cliente ?? '',
      metodo_pago: ingreso.metodo_pago ?? 'transferencia',
      factura: ingreso.factura ?? '',
      notas: ingreso.notas ?? '',
    });
    setShowFormModal(true);
  };

  const openDeleteModal = (ingreso: Ingreso) => {
    setDeletingIngreso(ingreso);
    setShowDeleteModal(true);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.concepto.trim() || !form.monto || !form.fecha) {
      showToast('Completa los campos obligatorios: concepto, monto y fecha', 'error');
      return;
    }
    const montoNum = parseFloat(form.monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast('El monto debe ser un número positivo', 'error');
      return;
    }

    const dateObj = new Date(form.fecha + 'T00:00:00');
    const mes = dateObj.getMonth() + 1;
    const anio = dateObj.getFullYear();

    setSaving(true);
    try {
      const payload = {
        concepto: form.concepto.trim(),
        monto: montoNum,
        fecha: form.fecha,
        mes,
        anio,
        cliente: form.cliente.trim() || null,
        metodo_pago: form.metodo_pago,
        factura: form.factura.trim() || null,
        notas: form.notas.trim() || null,
        proyecto_id: projectId,
      };

      if (editingIngreso) {
        const { error } = await supabase
          .from('ingresos')
          .update(payload)
          .eq('id', editingIngreso.id);
        if (error) throw error;
        showToast('Ingreso actualizado correctamente', 'success');
      } else {
        const { error } = await supabase.from('ingresos').insert(payload);
        if (error) throw error;
        showToast('Ingreso registrado correctamente', 'success');
      }

      setShowFormModal(false);
      setEditingIngreso(null);
      setForm(emptyForm);
      fetchIngresos();
    } catch (err) {
      console.error('Error saving ingreso:', err);
      showToast('Error al guardar el ingreso', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingIngreso) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('ingresos').delete().eq('id', deletingIngreso.id);
      if (error) throw error;
      showToast('Ingreso eliminado correctamente', 'success');
      setShowDeleteModal(false);
      setDeletingIngreso(null);
      fetchIngresos();
    } catch (err) {
      console.error('Error deleting ingreso:', err);
      showToast('Error al eliminar el ingreso', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const { data: allIngresos, error } = await supabase
        .from('ingresos')
        .select('*')
        .eq('proyecto_id', projectId)
        .eq('anio', filterAnio)
        .order('fecha', { ascending: true });

      if (error) throw error;
      if (!allIngresos || allIngresos.length === 0) {
        showToast('No hay ingresos para exportar en este año', 'error');
        return;
      }

      const metodosKeys: MetodoPago[] = ['transferencia', 'efectivo', 'cheque', 'otro'];

      const resumenHeaders = [
        { key: 'metodo', label: 'Método de Pago' },
        ...MESES.map((m, i) => ({ key: `mes_${i + 1}`, label: m })),
        { key: 'total', label: 'Total' },
      ];

      const resumenData = metodosKeys.map((met) => {
        const row: Record<string, unknown> = { metodo: METODOS_PAGO[met] };
        let metTotal = 0;
        for (let m = 1; m <= 12; m++) {
          const mesTotal = allIngresos
            .filter((i) => i.metodo_pago === met && i.mes === m)
            .reduce((sum: number, i: Ingreso) => sum + i.monto, 0);
          row[`mes_${m}`] = mesTotal > 0 ? formatCurrency(mesTotal) : '$0.00';
          metTotal += mesTotal;
        }
        row.total = formatCurrency(metTotal);
        return row;
      });

      const grandTotalRow: Record<string, unknown> = { metodo: 'TOTAL GENERAL' };
      let grandTotalSum = 0;
      for (let m = 1; m <= 12; m++) {
        const mesTotal = allIngresos
          .filter((i) => i.mes === m)
          .reduce((sum: number, i: Ingreso) => sum + i.monto, 0);
        grandTotalRow[`mes_${m}`] = mesTotal > 0 ? formatCurrency(mesTotal) : '$0.00';
        grandTotalSum += mesTotal;
      }
      grandTotalRow.total = formatCurrency(grandTotalSum);
      resumenData.push(grandTotalRow);

      const detailHeaders = [
        { key: 'mes', label: 'Mes' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'monto', label: 'Monto' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'metodo_pago', label: 'Método de Pago' },
        { key: 'factura', label: 'Factura' },
        { key: 'notas', label: 'Notas' },
      ];

      const makeDetailData = (met: MetodoPago) => {
        const items = allIngresos
          .filter((i) => i.metodo_pago === met)
          .map((i) => ({
            mes: MESES[i.mes - 1] ?? '',
            fecha: formatDate(i.fecha),
            concepto: i.concepto,
            monto: formatCurrency(i.monto),
            cliente: i.cliente ?? '',
            metodo_pago: METODOS_PAGO[i.metodo_pago as MetodoPago] ?? '',
            factura: i.factura ?? '',
            notas: i.notas ?? '',
          }));
        if (items.length > 0) {
          const metTotal = allIngresos
            .filter((i) => i.metodo_pago === met)
            .reduce((sum, i) => sum + i.monto, 0);
          items.push({
            mes: '', fecha: '', concepto: 'TOTAL', monto: formatCurrency(metTotal),
            cliente: '', metodo_pago: '', factura: '', notas: '',
          });
        }
        return items;
      };

      const sheets = [
        { name: 'Resumen Anual', data: resumenData, headers: resumenHeaders },
        { name: 'Transferencias', data: makeDetailData('transferencia'), headers: detailHeaders },
        { name: 'Efectivo', data: makeDetailData('efectivo'), headers: detailHeaders },
        { name: 'Cheques', data: makeDetailData('cheque'), headers: detailHeaders },
        { name: 'Otros', data: makeDetailData('otro'), headers: detailHeaders },
      ];

      const filename = `Reporte_Ingresos_Acabados_RO_${filterAnio}`;
      exportMultiSheetExcel(sheets, filename, `Acabados RO — Reporte de Ingresos ${filterAnio}`);
      showToast('Reporte Excel exportado correctamente', 'success');
    } catch (err) {
      console.error('Error exporting:', err);
      showToast('Error al exportar el reporte', 'error');
    }
  };

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const summaryCards = [
    { label: 'Transferencias', value: totals.transferencia, met: 'transferencia' as MetodoPago },
    { label: 'Efectivo', value: totals.efectivo, met: 'efectivo' as MetodoPago },
    { label: 'Cheques', value: totals.cheque, met: 'cheque' as MetodoPago },
    { label: 'Otros', value: totals.otro, met: 'otro' as MetodoPago },
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingresos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Administra los ingresos del proyecto
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] px-4 py-2.5 text-sm font-medium text-[#16a34a] transition-colors hover:bg-[#16a34a]/5"
          >
            <Download size={16} />
            Exportar Reporte Excel
          </button>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
          >
            <Plus size={16} />
            Registrar Ingreso
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              <Calendar size={12} className="mr-1 inline" />
              Mes
            </label>
            <select
              value={filterMes}
              onChange={(e) => setFilterMes(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            >
              <option value={0}>Todos los meses</option>
              {MESES.map((mes, i) => (
                <option key={i} value={i + 1}>{mes}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Año</label>
            <select
              value={filterAnio}
              onChange={(e) => setFilterAnio(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Método de Pago</label>
            <select
              value={filterMetodo}
              onChange={(e) => setFilterMetodo(e.target.value as MetodoPago | 'todos')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            >
              <option value="todos">Todos los métodos</option>
              {(Object.keys(METODOS_PAGO) as MetodoPago[]).map((met) => (
                <option key={met} value={met}>{METODOS_PAGO[met]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((card) => (
          <div
            key={card.met}
            className={`rounded-xl border-l-4 ${METODO_COLORS[card.met].border} bg-white p-4 shadow-sm ring-1 ring-gray-100`}
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
              <div className={`rounded-lg ${METODO_COLORS[card.met].bg} p-2`}>
                <TrendingUp size={18} className={METODO_COLORS[card.met].text} />
              </div>
            </div>
          </div>
        ))}

        {/* Gran Total */}
        <div className="rounded-xl border-l-4 border-l-[#16a34a] bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Gran Total</p>
              <p className="mt-1 text-lg font-bold text-[#16a34a]">
                {loading ? (
                  <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-200" />
                ) : (
                  formatCurrency(granTotal)
                )}
              </p>
            </div>
            <div className="rounded-lg bg-[#16a34a]/10 p-2">
              <TrendingUp size={18} className="text-[#16a34a]" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : ingresos.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-12 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
            No se encontraron ingresos para los filtros seleccionados.
          </div>
        ) : (
          ingresos.map((ingreso) => {
            const met = (ingreso.metodo_pago as MetodoPago) ?? 'otro';
            return (
              <div key={ingreso.id} className={`rounded-xl border-l-4 ${METODO_COLORS[met].border} bg-white p-4 shadow-sm ring-1 ring-gray-100`}>
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{ingreso.concepto}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${METODO_COLORS[met].bg} ${METODO_COLORS[met].text}`}>
                        {METODOS_PAGO[met]}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(ingreso.fecha)}</span>
                    </div>
                  </div>
                  <p className="text-base font-bold text-[#16a34a]">{formatCurrency(ingreso.monto)}</p>
                </div>
                {(ingreso.cliente || ingreso.factura || ingreso.notas) && (
                  <div className="mb-2 space-y-0.5 text-xs text-gray-500">
                    {ingreso.cliente && <p>Cliente: {ingreso.cliente}</p>}
                    {ingreso.factura && <p>Factura: {ingreso.factura}</p>}
                    {ingreso.notas && <p className="truncate">{ingreso.notas}</p>}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-2">
                  <button
                    onClick={() => openEditModal(ingreso)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#16a34a] transition-colors active:bg-gray-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => openDeleteModal(ingreso)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors active:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Concepto</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Monto</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Cliente</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Método</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Factura</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Notas</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <span className="inline-block h-4 w-full max-w-[120px] animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ingresos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron ingresos para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                ingresos.map((ingreso) => {
                  const met = (ingreso.metodo_pago as MetodoPago) ?? 'otro';
                  return (
                    <tr
                      key={ingreso.id}
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatDate(ingreso.fecha)}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{ingreso.concepto}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#16a34a]">
                        {formatCurrency(ingreso.monto)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ingreso.cliente ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${METODO_COLORS[met].bg} ${METODO_COLORS[met].text}`}
                        >
                          {METODOS_PAGO[met]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ingreso.factura ?? '-'}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">
                        {ingreso.notas ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(ingreso)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(ingreso)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingIngreso(null);
          setForm(emptyForm);
        }}
        title={editingIngreso ? 'Editar Ingreso' : 'Registrar Ingreso'}
        size="lg"
      >
        <div className="space-y-4">
          {/* OCR Upload — only for new ingresos */}
          {!editingIngreso && (
            <div className="rounded-xl border-2 border-dashed border-[#16a34a]/30 bg-[#16a34a]/5 p-4">
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
                    <svg className="h-8 w-8 animate-spin text-[#16a34a]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium text-[#16a34a]">Analizando imagen...</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Camera size={22} className="text-[#16a34a]" />
                      <Upload size={18} className="text-[#16a34a]/60" />
                    </div>
                    <span className="text-sm font-medium text-[#16a34a]">
                      Subir foto de factura / CFDI
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
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="concepto"
              value={form.concepto}
              onChange={handleFormChange}
              placeholder="Descripción del ingreso"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Monto <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  name="monto"
                  value={form.monto}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
              <input
                type="text"
                name="cliente"
                value={form.cliente}
                onChange={handleFormChange}
                placeholder="Nombre del cliente (opcional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Método de Pago</label>
              <select
                name="metodo_pago"
                value={form.metodo_pago}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
              >
                {(Object.keys(METODOS_PAGO) as MetodoPago[]).map((met) => (
                  <option key={met} value={met}>{METODOS_PAGO[met]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Factura</label>
            <input
              type="text"
              name="factura"
              value={form.factura}
              onChange={handleFormChange}
              placeholder="Número de factura (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
            <textarea
              name="notas"
              value={form.notas}
              onChange={handleFormChange}
              rows={3}
              placeholder="Notas adicionales (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#16a34a] focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => {
                setShowFormModal(false);
                setEditingIngreso(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingIngreso ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingIngreso(null);
        }}
        title="Eliminar Ingreso"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que deseas eliminar el ingreso{' '}
            <span className="font-semibold text-gray-900">
              &ldquo;{deletingIngreso?.concepto}&rdquo;
            </span>{' '}
            por{' '}
            <span className="font-semibold text-gray-900">
              {deletingIngreso ? formatCurrency(deletingIngreso.monto) : ''}
            </span>
            ? Esta acción no se puede deshacer.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingIngreso(null);
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
