'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  FolderOpen, Upload, Download, Trash2, FileText,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DocumentoRO, TipoDocRO, TIPOS_DOC_RO, MESES } from '@/lib/types';
import Modal from '@/components/Modal';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const DOC_ICONS: Record<TipoDocRO, string> = {
  constancia_fiscal: '📋',
  declaracion_mensual: '📊',
  pago_imss: '🏥',
  pago_infonavit: '🏠',
  recibos_nomina: '💰',
  estado_cuenta: '🏦',
};

export default function DocumentosROPage() {
  const params = useParams();
  const projectId = params.id as string;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [anio, setAnio] = useState(currentYear);
  const [documentos, setDocumentos] = useState<DocumentoRO[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [uploading, setUploading] = useState<TipoDocRO | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + toastCounter++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const fetchDocumentos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('documentos_ro')
      .select('*')
      .eq('anio', anio)
      .order('mes')
      .order('tipo');

    if (!error && data) setDocumentos(data);
    setLoading(false);
  }, [anio]);

  useEffect(() => { fetchDocumentos(); }, [fetchDocumentos]);

  const docsForMonth = (mes: number) => documentos.filter((d) => d.mes === mes);
  const docCountForMonth = (mes: number) => docsForMonth(mes).length;

  const monthDocs = selectedMonth !== null ? docsForMonth(selectedMonth) : [];

  const getDocForType = (tipo: TipoDocRO): DocumentoRO | undefined =>
    monthDocs.find((d) => d.tipo === tipo);

  const handleUpload = async (tipo: TipoDocRO, file: File) => {
    if (!selectedMonth) return;
    setUploading(tipo);

    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${anio}/${selectedMonth}/${tipo}_${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('documentos-ro')
        .upload(path, file);

      if (storageError) throw storageError;

      const existing = getDocForType(tipo);
      if (existing) {
        await supabase.storage.from('documentos-ro').remove([existing.storage_path]);
        await supabase.from('documentos_ro').delete().eq('id', existing.id);
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { error: dbError } = await supabase.from('documentos_ro').insert({
        tipo,
        mes: selectedMonth,
        anio,
        nombre_archivo: file.name,
        storage_path: path,
        created_by: user?.id || null,
      });

      if (dbError) throw dbError;

      showToast('Documento subido correctamente', 'success');
      await fetchDocumentos();
    } catch (err: any) {
      showToast(err.message || 'Error al subir documento', 'error');
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (doc: DocumentoRO) => {
    const { data, error } = await supabase.storage
      .from('documentos-ro')
      .createSignedUrl(doc.storage_path, 60);

    if (error || !data?.signedUrl) {
      showToast('Error al descargar', 'error');
      return;
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = doc.nombre_archivo;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (doc: DocumentoRO) => {
    setDeleting(doc.id);
    try {
      await supabase.storage.from('documentos-ro').remove([doc.storage_path]);
      await supabase.from('documentos_ro').delete().eq('id', doc.id);
      showToast('Documento eliminado', 'success');
      await fetchDocumentos();
    } catch {
      showToast('Error al eliminar', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const monthProgress = (mes: number) => {
    const count = docCountForMonth(mes);
    const total = Object.keys(TIPOS_DOC_RO).length;
    return { count, total, pct: Math.round((count / total) * 100) };
  };

  const isCurrentMonth = (mes: number) => anio === currentYear && mes === currentMonth;
  const isPastMonth = (mes: number) => anio < currentYear || (anio === currentYear && mes < currentMonth);

  return (
    <div className="mx-auto max-w-6xl pt-12 md:pt-0">
      {/* Toast notifications */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex animate-slide-in-right items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'success' ? 'bg-gradient-to-r from-green-600 to-green-500' : 'bg-gradient-to-r from-red-600 to-red-500'
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
      <div className="mb-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a365d] to-[#2a4a7f] shadow-md">
              <FolderOpen className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1a365d] sm:text-2xl">Documentos RO</h1>
              <p className="mt-1 text-sm text-gray-500">
                Documentos mensuales de la empresa
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Year selector */}
      <div className="mb-6 flex animate-fade-in items-center justify-center gap-4">
        <button
          onClick={() => setAnio((y) => y - 1)}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#1a365d]/30 hover:text-[#1a365d] hover:shadow-md"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="min-w-[80px] rounded-lg bg-white px-4 py-1.5 text-center text-lg font-bold text-[#1a365d] shadow-sm ring-1 ring-gray-100">{anio}</span>
        <button
          onClick={() => setAnio((y) => y + 1)}
          disabled={anio >= currentYear}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#1a365d]/30 hover:text-[#1a365d] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Month grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="h-8 w-8 animate-spin text-[#1a365d]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {MESES.map((nombre, idx) => {
            const mes = idx + 1;
            const { count, total, pct } = monthProgress(mes);
            const isCurrent = isCurrentMonth(mes);
            const isPast = isPastMonth(mes);
            const hasAll = count === total;

            return (
              <button
                key={mes}
                onClick={() => setSelectedMonth(mes)}
                style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s`, opacity: 0 }}
                className={`group relative flex animate-scale-in flex-col items-center rounded-xl border-2 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  isCurrent
                    ? 'border-[#D4A520] bg-[#D4A520]/5 shadow-md'
                    : hasAll
                    ? 'border-green-300 bg-green-50'
                    : isPast && count === 0
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-2 right-2 rounded-full bg-gradient-to-r from-[#D4A520] to-[#E8B82E] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    ACTUAL
                  </span>
                )}

                <FolderOpen
                  size={28}
                  className={`mb-2 ${
                    hasAll
                      ? 'text-green-500'
                      : isCurrent
                      ? 'text-[#D4A520]'
                      : count > 0
                      ? 'text-[#1a365d]'
                      : 'text-gray-300'
                  }`}
                />

                <span className="text-sm font-semibold text-[#1a365d]">{nombre}</span>

                <div className="mt-2 flex w-full items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        hasAll ? 'bg-green-500' : count > 0 ? 'bg-[#D4A520]' : 'bg-gray-200'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-gray-400">
                    {count}/{total}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex animate-fade-in flex-wrap items-center justify-center gap-4 rounded-xl bg-white/70 px-4 py-3 text-xs text-gray-500 shadow-sm ring-1 ring-gray-100">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-green-300 bg-green-50" />
          Completo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-[#D4A520] bg-[#D4A520]/10" />
          Mes Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-200 bg-white" />
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-red-200 bg-red-50" />
          Sin documentos
        </span>
      </div>

      {/* Month detail modal */}
      <Modal
        isOpen={selectedMonth !== null}
        onClose={() => setSelectedMonth(null)}
        title={selectedMonth ? `${MESES[selectedMonth - 1]} ${anio}` : ''}
        size="lg"
      >
        {selectedMonth !== null && (
          <div className="space-y-3">
            <p className="mb-4 text-sm text-gray-500">
              Sube o descarga los documentos del mes. Cada tipo acepta un archivo.
            </p>

            {(Object.keys(TIPOS_DOC_RO) as TipoDocRO[]).map((tipo, idx) => {
              const doc = getDocForType(tipo);
              const isUploading = uploading === tipo;
              const isDeleting = deleting === doc?.id;

              return (
                <div
                  key={tipo}
                  style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s`, opacity: 0 }}
                  className={`flex animate-slide-in-up flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all sm:flex-row sm:items-center ${
                    doc ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-gray-100">{DOC_ICONS[tipo]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1a365d]">
                        {TIPOS_DOC_RO[tipo]}
                      </p>
                      {doc ? (
                        <p className="truncate text-xs text-green-600">
                          <FileText size={12} className="mr-1 inline" />
                          {doc.nombre_archivo}
                        </p>
                      ) : (
                        <span className="badge-warning mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold">Sin archivo</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {doc && (
                      <>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white"
                        >
                          <Download size={14} />
                          <span className="hidden sm:inline">Descargar</span>
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={!!isDeleting}
                          className="btn-danger rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </>
                    )}

                    <label
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        doc
                          ? 'border border-[#D4A520] text-[#D4A520] hover:-translate-y-0.5 hover:bg-[#D4A520]/10'
                          : 'btn-gold'
                      } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      {isUploading ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Upload size={14} />
                      )}
                      <span className="hidden sm:inline">{doc ? 'Reemplazar' : 'Subir'}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.xml"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(tipo, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
