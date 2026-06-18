'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus, Trash2, Download, FileText, Upload, Camera,
  Search, Edit2, CheckCircle2, AlertCircle, X, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FacturaRO, MESES } from '@/lib/types';
import { exportMultiSheetExcel, formatCurrency, formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';

interface FacturaForm {
  fecha: string;
  documento: string;
  cliente: string;
  descripcion: string;
  folio_fiscal: string;
  subtotal: string;
  iva: string;
  total: string;
  forma_pago: string;
  cuenta: string;
}

const emptyForm: FacturaForm = {
  fecha: '',
  documento: 'FACTURA',
  cliente: '',
  descripcion: '',
  folio_fiscal: '',
  subtotal: '',
  iva: '',
  total: '',
  forma_pago: '',
  cuenta: '',
};

const TIPOS_DOCUMENTO = ['FACTURA', 'COMPLEMENTO', 'NC'] as const;
const FORMAS_PAGO = ['CREDITO', 'DEBITO', 'TRANSFERENCIA', 'EFECTIVO'] as const;

function extractCfdiFactura(text: string): Partial<FacturaForm> {
  const result: Partial<FacturaForm> = {};
  const upper = text.toUpperCase();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Fecha — ISO format first, then DD/MM/YYYY
  const isoDate = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    result.fecha = isoDate[0];
  } else {
    const dmy = text.match(/(\d{2})[/\-](\d{2})[/\-](\d{4})/);
    if (dmy) result.fecha = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  // Folio Fiscal (UUID)
  const uuidMatch = text.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
  if (uuidMatch) result.folio_fiscal = uuidMatch[0].toUpperCase();

  // Total — last match of "Total $X,XXX.XX"
  const totalMatches = [...upper.matchAll(/TOTAL\s*\$?\s*([\d,]+\.\d{2})/g)];
  if (totalMatches.length > 0) {
    result.total = totalMatches[totalMatches.length - 1][1].replace(/,/g, '');
  }

  // Subtotal
  const subtotalMatch = upper.match(/SUBTOTAL\s*\$?\s*([\d,]+\.\d{2})/);
  if (subtotalMatch) result.subtotal = subtotalMatch[1].replace(/,/g, '');

  // IVA
  const ivaMatch = upper.match(/IVA\s*\d*\.?\d*%?\s*\$?\s*([\d,]+\.\d{2})/);
  if (ivaMatch) result.iva = ivaMatch[1].replace(/,/g, '');

  // If we have subtotal but no IVA, calculate it (and vice versa)
  if (result.subtotal && result.total && !result.iva) {
    const diff = parseFloat(result.total) - parseFloat(result.subtotal);
    if (diff > 0) result.iva = diff.toFixed(2);
  }
  if (result.total && result.iva && !result.subtotal) {
    const diff = parseFloat(result.total) - parseFloat(result.iva);
    if (diff > 0) result.subtotal = diff.toFixed(2);
  }

  // Forma de pago
  if (/TRANSFERENCIA/i.test(upper)) result.forma_pago = 'TRANSFERENCIA';
  else if (/TARJETA\s*DE\s*D[EÉ]BITO|DEBITO/i.test(upper)) result.forma_pago = 'DEBITO';
  else if (/TARJETA\s*DE\s*CR[EÉ]DITO|CREDITO/i.test(upper)) result.forma_pago = 'CREDITO';
  else if (/EFECTIVO/i.test(upper)) result.forma_pago = 'EFECTIVO';

  // Documento — tipo de comprobante (FACTURA, COMPLEMENTO, NC)
  if (/COMPLEMENTO/i.test(upper)) result.documento = 'COMPLEMENTO';
  else if (/NOTA\s*DE\s*CR[EÉ]DITO/i.test(upper)) result.documento = 'NC';
  else if (/INGRESO|FACTURA|COMPROBANTE/i.test(upper)) result.documento = 'FACTURA';

  // Cliente — nombre emisor (la empresa que emite la factura)
  for (const line of lines) {
    if (/nombre\s*emisor/i.test(line) && line.includes(':')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (val.length > 2) { result.cliente = val; break; }
    }
  }
  if (!result.cliente) {
    const emisorMatch = upper.match(/NOMBRE\s*EMISOR[:\s]*([A-ZÁÉÍÓÚÑ\s]+)/);
    if (emisorMatch && emisorMatch[1].trim().length > 2) {
      result.cliente = emisorMatch[1].trim();
    }
  }

  // Descripción
  for (const line of lines) {
    if (/descripci[oó]n/i.test(line)) {
      const desc = line.replace(/^descripci[oó]n\s*/i, '').trim();
      if (desc.length > 5) { result.descripcion = desc; break; }
    }
  }
  if (!result.descripcion) {
    const descIdx = lines.findIndex((l) => /descripci[oó]n/i.test(l));
    if (descIdx >= 0 && descIdx + 1 < lines.length) {
      const nextLine = lines[descIdx + 1];
      if (nextLine.length > 5 && !/impuesto|traslado|tasa|base/i.test(nextLine)) {
        result.descripcion = nextLine;
      }
    }
  }

  // Cuenta — detect bank name
  const bancos = ['INBURSA', 'BBVA', 'BANREGIO', 'BANAMEX', 'SANTANDER', 'HSBC', 'SCOTIABANK', 'BANORTE', 'AZTECA'];
  for (const banco of bancos) {
    if (upper.includes(banco)) { result.cuenta = banco; break; }
  }

  return result;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function FacturacionPage() {
  const params = useParams();
  const projectId = params.id as string;

  const now = new Date();
  const [facturas, setFacturas] = useState<FacturaRO[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnio, setFilterAnio] = useState(now.getFullYear());
  const [filterMes, setFilterMes] = useState(0);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingFactura, setEditingFactura] = useState<FacturaRO | null>(null);
  const [deletingFactura, setDeletingFactura] = useState<FacturaRO | null>(null);
  const [form, setForm] = useState<FacturaForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + toastCounter++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('facturas_ro')
        .select('*')
        .eq('proyecto_id', projectId)
        .order('fecha', { ascending: false });

      if (filterAnio) {
        const startDate = `${filterAnio}-01-01`;
        const endDate = `${filterAnio}-12-31`;
        query = query.gte('fecha', startDate).lte('fecha', endDate);
      }

      if (filterMes > 0) {
        const start = `${filterAnio}-${String(filterMes).padStart(2, '0')}-01`;
        const endDay = new Date(filterAnio, filterMes, 0).getDate();
        const end = `${filterAnio}-${String(filterMes).padStart(2, '0')}-${endDay}`;
        query = query.gte('fecha', start).lte('fecha', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      setFacturas(data ?? []);
    } catch {
      showToast('Error al cargar facturas', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, filterAnio, filterMes, showToast]);

  useEffect(() => { fetchFacturas(); }, [fetchFacturas]);

  const filtered = facturas.filter((f) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      f.documento.toLowerCase().includes(s) ||
      (f.cliente?.toLowerCase().includes(s)) ||
      f.descripcion.toLowerCase().includes(s) ||
      (f.folio_fiscal?.toLowerCase().includes(s)) ||
      (f.forma_pago?.toLowerCase().includes(s))
    );
  });

  const totalSum = filtered.reduce((s, f) => s + f.total, 0);
  const subtotalSum = filtered.reduce((s, f) => s + f.subtotal, 0);
  const ivaSum = filtered.reduce((s, f) => s + f.iva, 0);

  const openAddModal = () => {
    setEditingFactura(null);
    setForm(emptyForm);
    setUploadFile(null);
    setShowFormModal(true);
  };

  const openEditModal = (f: FacturaRO) => {
    setEditingFactura(f);
    setForm({
      fecha: f.fecha,
      documento: f.documento,
      cliente: f.cliente ?? '',
      descripcion: f.descripcion,
      folio_fiscal: f.folio_fiscal ?? '',
      subtotal: String(f.subtotal),
      iva: String(f.iva),
      total: String(f.total),
      forma_pago: f.forma_pago ?? '',
      cuenta: f.cuenta ?? '',
    });
    setUploadFile(null);
    setShowFormModal(true);
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'subtotal' || name === 'iva') {
        const sub = parseFloat(name === 'subtotal' ? value : prev.subtotal) || 0;
        const iva = parseFloat(name === 'iva' ? value : prev.iva) || 0;
        updated.total = (sub + iva).toFixed(2);
      }
      return updated;
    });
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Solo se aceptan imágenes (JPG, PNG)', 'error');
      return;
    }
    setUploadFile(file);
    setOcrProcessing(true);
    showToast('Analizando factura... esto puede tomar unos segundos', 'success');
    try {
      const Tesseract = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(file, 'spa');
      const extracted = extractCfdiFactura(text);
      setForm((prev) => ({
        fecha: extracted.fecha || prev.fecha,
        documento: extracted.documento || prev.documento,
        cliente: extracted.cliente || prev.cliente,
        descripcion: extracted.descripcion || prev.descripcion,
        folio_fiscal: extracted.folio_fiscal || prev.folio_fiscal,
        subtotal: extracted.subtotal || prev.subtotal,
        iva: extracted.iva || prev.iva,
        total: extracted.total || prev.total,
        forma_pago: extracted.forma_pago || prev.forma_pago,
        cuenta: extracted.cuenta || prev.cuenta,
      }));
      const count = Object.values(extracted).filter(Boolean).length;
      if (count > 0) {
        showToast(`Se extrajeron ${count} dato${count !== 1 ? 's' : ''}. Verifica los campos.`, 'success');
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

  const handleSave = async () => {
    if (!form.fecha || !form.documento.trim() || !form.cliente.trim() || !form.descripcion.trim()) {
      showToast('Completa los campos obligatorios: fecha, documento, cliente y descripción', 'error');
      return;
    }

    setSaving(true);
    try {
      let storagePath: string | null = editingFactura?.storage_path ?? null;
      let nombreArchivo: string | null = editingFactura?.nombre_archivo ?? null;

      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop() || 'jpg';
        const path = `facturas/${Date.now()}_${uploadFile.name.replace(/\s/g, '_')}`;
        const { error: storageErr } = await supabase.storage
          .from('facturas-ro')
          .upload(path, uploadFile);
        if (storageErr) throw storageErr;
        storagePath = path;
        nombreArchivo = uploadFile.name;
      }

      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        fecha: form.fecha,
        documento: form.documento.trim(),
        cliente: form.cliente.trim() || null,
        descripcion: form.descripcion.trim(),
        folio_fiscal: form.folio_fiscal.trim() || null,
        subtotal: parseFloat(form.subtotal) || 0,
        iva: parseFloat(form.iva) || 0,
        total: parseFloat(form.total) || 0,
        forma_pago: form.forma_pago.trim() || null,
        cuenta: form.cuenta.trim() || null,
        nombre_archivo: nombreArchivo,
        storage_path: storagePath,
        proyecto_id: projectId,
        created_by: user?.id || null,
      };

      if (editingFactura) {
        const { error } = await supabase
          .from('facturas_ro')
          .update(payload)
          .eq('id', editingFactura.id);
        if (error) throw error;
        showToast('Factura actualizada', 'success');
      } else {
        const { error } = await supabase.from('facturas_ro').insert(payload);
        if (error) throw error;
        showToast('Factura registrada', 'success');
      }

      setShowFormModal(false);
      setEditingFactura(null);
      setForm(emptyForm);
      setUploadFile(null);
      fetchFacturas();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingFactura) return;
    setDeleting(true);
    try {
      if (deletingFactura.storage_path) {
        await supabase.storage.from('facturas-ro').remove([deletingFactura.storage_path]);
      }
      const { error } = await supabase.from('facturas_ro').delete().eq('id', deletingFactura.id);
      if (error) throw error;
      showToast('Factura eliminada', 'success');
      setShowDeleteModal(false);
      setDeletingFactura(null);
      fetchFacturas();
    } catch {
      showToast('Error al eliminar', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleViewFile = async (f: FacturaRO) => {
    if (!f.storage_path) return;
    const { data, error } = await supabase.storage
      .from('facturas-ro')
      .createSignedUrl(f.storage_path, 60);
    if (error || !data?.signedUrl) {
      showToast('Error al abrir archivo', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No hay facturas para exportar', 'error');
      return;
    }

    const headers = [
      { key: 'fecha', label: 'Fecha' },
      { key: 'documento', label: 'Documento' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'folio_fiscal', label: 'Folio Fiscal' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'iva', label: 'IVA' },
      { key: 'total', label: 'Total' },
      { key: 'forma_pago', label: 'Forma de Pago' },
      { key: 'cuenta', label: 'Cuenta' },
    ];

    const data = filtered.map((f) => ({
      fecha: formatDate(f.fecha),
      documento: f.documento,
      cliente: f.cliente ?? '',
      descripcion: f.descripcion,
      folio_fiscal: f.folio_fiscal ?? '',
      subtotal: formatCurrency(f.subtotal),
      iva: formatCurrency(f.iva),
      total: formatCurrency(f.total),
      forma_pago: f.forma_pago ?? '',
      cuenta: f.cuenta ?? '',
    }));

    data.push({
      fecha: '',
      documento: '',
      cliente: '',
      descripcion: 'TOTALES',
      folio_fiscal: '',
      subtotal: formatCurrency(subtotalSum),
      iva: formatCurrency(ivaSum),
      total: formatCurrency(totalSum),
      forma_pago: '',
      cuenta: '',
    });

    // Summary by month
    const monthHeaders = [
      { key: 'mes', label: 'Mes' },
      { key: 'cantidad', label: 'Cantidad' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'iva', label: 'IVA' },
      { key: 'total', label: 'Total' },
    ];

    const monthData: Record<string, unknown>[] = [];
    let grandQty = 0, grandSub = 0, grandIva = 0, grandTotal = 0;

    for (let m = 1; m <= 12; m++) {
      const mFacturas = filtered.filter((f) => {
        const d = new Date(f.fecha + 'T00:00:00');
        return d.getMonth() + 1 === m;
      });
      if (mFacturas.length === 0) continue;
      const mSub = mFacturas.reduce((s, f) => s + f.subtotal, 0);
      const mIva = mFacturas.reduce((s, f) => s + f.iva, 0);
      const mTotal = mFacturas.reduce((s, f) => s + f.total, 0);
      grandQty += mFacturas.length;
      grandSub += mSub;
      grandIva += mIva;
      grandTotal += mTotal;
      monthData.push({
        mes: MESES[m - 1],
        cantidad: mFacturas.length,
        subtotal: formatCurrency(mSub),
        iva: formatCurrency(mIva),
        total: formatCurrency(mTotal),
      });
    }
    monthData.push({
      mes: 'TOTAL',
      cantidad: grandQty,
      subtotal: formatCurrency(grandSub),
      iva: formatCurrency(grandIva),
      total: formatCurrency(grandTotal),
    });

    const mesLabel = filterMes > 0 ? `_${MESES[filterMes - 1]}` : '';
    const filename = `Facturacion_RO_${filterAnio}${mesLabel}`;

    exportMultiSheetExcel(
      [
        { name: 'Facturas Detalle', data, headers },
        { name: 'Resumen Mensual', data: monthData, headers: monthHeaders },
      ],
      filename,
      `Acabados RO — Facturación ${filterAnio}${filterMes > 0 ? ' ' + MESES[filterMes - 1] : ''}`
    );
    showToast('Reporte Excel exportado', 'success');
  };

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="mx-auto max-w-7xl pt-12 md:pt-0">
      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {t.message}
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a365d] sm:text-2xl">Facturación RO</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sube facturas, se analizan automáticamente y genera reportes en Excel
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] px-4 py-2.5 text-sm font-medium text-[#16a34a] transition-colors hover:bg-[#16a34a]/5"
          >
            <Download size={16} />
            Exportar Excel
          </button>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
          >
            <Plus size={16} />
            Agregar Factura
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              <Search size={12} className="mr-1 inline" />
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por documento, descripción, folio..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Mes</label>
            <select
              value={filterMes}
              onChange={(e) => setFilterMes(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value={0}>Todos</option>
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Año</label>
            <select
              value={filterAnio}
              onChange={(e) => setFilterAnio(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-l-4 border-l-blue-500 bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">Subtotal</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" /> : formatCurrency(subtotalSum)}
          </p>
        </div>
        <div className="rounded-xl border-l-4 border-l-amber-500 bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">IVA</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" /> : formatCurrency(ivaSum)}
          </p>
        </div>
        <div className="rounded-xl border-l-4 border-l-[#16a34a] bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="mt-1 text-lg font-bold text-[#16a34a]">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" /> : formatCurrency(totalSum)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{filtered.length} factura{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-12 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
            No se encontraron facturas.
          </div>
        ) : (
          filtered.map((f) => (
            <div key={f.id} className="rounded-xl border-l-4 border-l-[#1a365d] bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{f.documento}</p>
                  {f.cliente && <p className="mt-0.5 text-xs font-medium text-[#1a365d]">{f.cliente}</p>}
                  <p className="mt-0.5 text-xs text-gray-500">{f.descripcion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">{formatDate(f.fecha)}</span>
                    {f.forma_pago && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {f.forma_pago}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-base font-bold text-[#16a34a]">{formatCurrency(f.total)}</p>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <p>Subtotal: {formatCurrency(f.subtotal)}</p>
                <p>IVA: {formatCurrency(f.iva)}</p>
                {f.folio_fiscal && <p className="col-span-2 truncate">Folio: {f.folio_fiscal}</p>}
                {f.cuenta && <p className="col-span-2">Cuenta: {f.cuenta}</p>}
              </div>
              <div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-2">
                {f.storage_path && (
                  <button
                    onClick={() => handleViewFile(f)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 active:bg-blue-50"
                  >
                    Ver
                  </button>
                )}
                <button
                  onClick={() => openEditModal(f)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#1a365d] active:bg-gray-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => { setDeletingFactura(f); setShowDeleteModal(true); }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Documento</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Cliente</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Descripción</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Folio Fiscal</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Subtotal</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">IVA</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Total</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Forma Pago</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Cuenta</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <span className="inline-block h-4 w-full max-w-[100px] animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron facturas.
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map((f) => (
                    <tr key={f.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDate(f.fecha)}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">{f.documento}</td>
                      <td className="px-3 py-3 text-gray-600">{f.cliente ?? '-'}</td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-gray-600">{f.descripcion}</td>
                      <td className="max-w-[150px] truncate px-3 py-3 text-xs text-gray-500">
                        {f.folio_fiscal ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-gray-700">
                        {formatCurrency(f.subtotal)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-gray-700">
                        {formatCurrency(f.iva)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-[#16a34a]">
                        {formatCurrency(f.total)}
                      </td>
                      <td className="px-3 py-3 text-gray-600">{f.forma_pago ?? '-'}</td>
                      <td className="max-w-[120px] truncate px-3 py-3 text-gray-500">{f.cuenta ?? '-'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {f.storage_path && (
                            <button
                              onClick={() => handleViewFile(f)}
                              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                              title="Ver archivo"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(f)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => { setDeletingFactura(f); setShowDeleteModal(true); }}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 border-[#1a365d]/20 bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-3 py-3 text-right text-gray-700">TOTALES</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-gray-900">{formatCurrency(subtotalSum)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-gray-900">{formatCurrency(ivaSum)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-[#16a34a]">{formatCurrency(totalSum)}</td>
                    <td colSpan={3} className="px-3 py-3 text-xs text-gray-400">{filtered.length} facturas</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingFactura(null); setForm(emptyForm); setUploadFile(null); }}
        title={editingFactura ? 'Editar Factura' : 'Agregar Factura'}
        size="xl"
      >
        <div className="space-y-4">
          {/* OCR Upload */}
          <div className="rounded-xl border-2 border-dashed border-[#D4A520]/40 bg-[#D4A520]/5 p-4">
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
                  <svg className="h-8 w-8 animate-spin text-[#D4A520]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm font-medium text-[#D4A520]">Analizando factura...</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Camera size={24} className="text-[#D4A520]" />
                    <Upload size={20} className="text-[#D4A520]/60" />
                  </div>
                  <span className="text-sm font-medium text-[#D4A520]">
                    Subir foto de factura / CFDI
                  </span>
                  <span className="text-xs text-gray-400">
                    Se extraerán fecha, montos, folio fiscal y más automáticamente
                  </span>
                </>
              )}
            </button>
            {uploadFile && !ocrProcessing && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-green-600">
                <FileText size={12} /> {uploadFile.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Documento <span className="text-red-500">*</span>
              </label>
              <select
                name="documento"
                value={form.documento}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="cliente"
              value={form.cliente}
              onChange={handleFormChange}
              placeholder="Nombre de la empresa / proveedor"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="descripcion"
              value={form.descripcion}
              onChange={handleFormChange}
              placeholder="MATERIAL, INTERNET, TELEFONO, ALIMENTOS..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Folio Fiscal</label>
            <input
              type="text"
              name="folio_fiscal"
              value={form.folio_fiscal}
              onChange={handleFormChange}
              placeholder="UUID del CFDI"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Subtotal</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  name="subtotal"
                  value={form.subtotal}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">IVA</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  name="iva"
                  value={form.iva}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Total</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  name="total"
                  value={form.total}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Forma de Pago</label>
              <select
                name="forma_pago"
                value={form.forma_pago}
                onChange={handleFormChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              >
                <option value="">— Sin especificar —</option>
                {FORMAS_PAGO.map((fp) => (
                  <option key={fp} value={fp}>{fp}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cuenta</label>
              <input
                type="text"
                name="cuenta"
                value={form.cuenta}
                onChange={handleFormChange}
                placeholder="INBURSA, BBVA, BANREGIO..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => { setShowFormModal(false); setEditingFactura(null); setForm(emptyForm); setUploadFile(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingFactura ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingFactura(null); }}
        title="Eliminar Factura"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Eliminar la factura <span className="font-semibold text-gray-900">&ldquo;{deletingFactura?.documento}&rdquo;</span> por{' '}
            <span className="font-semibold text-gray-900">
              {deletingFactura ? formatCurrency(deletingFactura.total) : ''}
            </span>? Esta acción no se puede deshacer.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => { setShowDeleteModal(false); setDeletingFactura(null); }}
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
