'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Plus, Trash2, Upload, Camera, FileText, AlertCircle, CheckCircle2, X, ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Proveedor, Material } from '@/lib/types';
import { parseItemsFromText, validateAndCorrectItems, type ParsedItem } from '@/lib/parse-items';
import Modal from '@/components/Modal';

interface FormData {
  numero_orden: string;
  proveedor_id: string;
  proveedor_custom: string;
  fecha: string;
  fecha_entrega: string;
  items: DetalleItem[];
}

interface DetalleItem extends ParsedItem {
  id: string;
  material_id: string | null;
  codigo_item: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function GenerarOrdenPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  const [form, setForm] = useState<FormData>({
    numero_orden: '',
    proveedor_id: '',
    proveedor_custom: '',
    fecha: new Date().toISOString().split('T')[0],
    fecha_entrega: '',
    items: [],
  });

  const [editingItem, setEditingItem] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + toastCounter++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    fetchProveedores();
    fetchMateriales();
  }, []);

  const fetchProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre');
      if (error) throw error;
      setProveedores(data ?? []);
    } catch {
      showToast('Error al cargar proveedores', 'error');
    }
  };

  const fetchMateriales = async () => {
    try {
      const { data, error } = await supabase
        .from('materiales')
        .select('*')
        .order('nombre');
      if (error) throw error;
      setMateriales(data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      showToast('Solo se aceptan imágenes (JPG, PNG) o documentos PDF', 'error');
      return;
    }

    setProcessing(true);
    showToast(
      isPdf ? 'Leyendo PDF...' : 'Analizando imagen... esto puede tomar unos segundos',
      'success'
    );

    try {
      let text = '';

      if (isPdf) {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const textItems = content.items.filter((item: any) => 'str' in item);
          textItems.sort((a: any, b: any) => {
            const dy = b.transform[5] - a.transform[5];
            if (Math.abs(dy) > 3) return dy;
            return a.transform[4] - b.transform[4];
          });
          const lineGroups: { texts: string[]; y: number }[] = [];
          for (const item of textItems) {
            const str = (item as any).str;
            const y = (item as any).transform[5];
            const lastGroup = lineGroups[lineGroups.length - 1];
            if (lastGroup && Math.abs(y - lastGroup.y) <= 3) {
              lastGroup.texts.push(str);
            } else {
              lineGroups.push({ texts: [str], y });
            }
          }
          const pageLines = lineGroups.map(g => {
            const parts = g.texts.filter(t => t.trim());
            return parts.join(' ');
          });
          pages.push(pageLines.join('\n'));
        }
        text = pages.join('\n');
      } else {
        const Tesseract = await import('tesseract.js');
        const { data: { text: ocrText } } = await Tesseract.recognize(file, 'spa+eng', {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round((m.progress || 0) * 100);
              if (pct % 25 === 0) console.log(`OCR progress: ${pct}%`);
            }
          },
        });
        text = ocrText;
      }

      const parsedItems = parseItemsFromText(text);
      const validated = validateAndCorrectItems(parsedItems);

      if (validated.length === 0) {
        showToast('No se detectaron items en el documento. Agrega manualmente.', 'error');
      } else {
        const newItems: DetalleItem[] = validated.map((item) => ({
          id: `temp_${Date.now()}_${Math.random()}`,
          material_id: null,
          codigo_item: '',
          ...item,
        }));
        setForm((prev) => ({ ...prev, items: newItems }));
        showToast(`Se detectaron ${validated.length} item(s). Puedes editarlos antes de guardar.`, 'success');
      }
    } catch (err) {
      console.error('OCR error:', err);
      showToast('Error al analizar el archivo', 'error');
    } finally {
      setProcessing(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (id: string, field: keyof DetalleItem, value: any) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'cantidad' || field === 'precio_unitario'
                ? parseFloat(value) || 0
                : value,
              subtotal:
                field === 'cantidad' ? (parseFloat(value) || 0) * item.precio_unitario
                : field === 'precio_unitario' ? item.cantidad * (parseFloat(value) || 0)
                : item.subtotal,
            }
          : item
      ),
    }));
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, {
        id: `temp_${Date.now()}`,
        material_id: null,
        codigo_item: '',
        descripcion: '',
        cantidad: 1,
        unidad: 'pza',
        precio_unitario: 0,
        subtotal: 0,
      }],
    }));
  };

  const handleDeleteItem = (id: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }));
  };

  const handleSave = async () => {
    if (!form.numero_orden.trim()) {
      showToast('Ingresa el número de orden', 'error');
      return;
    }

    if (!form.proveedor_id && !form.proveedor_custom.trim()) {
      showToast('Selecciona o ingresa el proveedor', 'error');
      return;
    }

    if (form.items.length === 0) {
      showToast('Agrega al menos un item', 'error');
      return;
    }

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const subtotal = form.items.reduce((sum, item) => sum + item.subtotal, 0);
      const iva = subtotal * 0.16;
      const total = subtotal + iva;

      const ordenPayload = {
        numero_orden: form.numero_orden.trim(),
        proveedor_id: form.proveedor_id || null,
        fecha: form.fecha,
        fecha_entrega: form.fecha_entrega || null,
        estado: 'pendiente' as const,
        subtotal,
        iva,
        total,
        proyecto_id: projectId,
        created_by: user?.id || null,
      };

      const { data: orden, error: ordenError } = await supabase
        .from('ordenes_compra')
        .insert(ordenPayload)
        .select()
        .single();

      if (ordenError) throw ordenError;

      const detalles = form.items.map((item) => ({
        orden_id: orden.id,
        material_id: item.material_id,
        codigo_item: item.codigo_item.trim() || null,
        descripcion_item: item.descripcion.trim(),
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));

      const { error: detalleError } = await supabase
        .from('ordenes_compra_detalle')
        .insert(detalles);

      if (detalleError) throw detalleError;

      showToast('Orden de compra creada exitosamente', 'success');
      setTimeout(() => router.push(`/proyecto/${projectId}/ordenes`), 1500);
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const totalSum = form.items.reduce((s, item) => s + item.subtotal, 0);
  const ivaSum = totalSum * 0.16;
  const grandTotal = totalSum + ivaSum;

  return (
    <div className="mx-auto max-w-6xl pt-12 md:pt-0">
      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-in-up flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'success' ? 'badge-success' : 'badge-danger'
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
      <div className="mb-6 flex animate-fade-in items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a365d] to-[#2a4a7f] shadow-md">
          <FileText className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1a365d]">Generar Orden de Compra</h1>
          <p className="mt-1 text-sm text-gray-500">Sube una cotización para extraer items automáticamente</p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="card-modern mb-6 animate-slide-in-up p-6" style={{ opacity: 0 }}>
        <input
          ref={ocrInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={handleOcrUpload}
        />
        <button
          type="button"
          onClick={() => ocrInputRef.current?.click()}
          disabled={processing}
          className="group flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[#D4A520]/40 bg-[#D4A520]/5 p-8 transition-colors hover:border-[#D4A520] hover:bg-[#D4A520]/10 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <svg className="h-8 w-8 animate-spin text-[#D4A520]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium text-[#D4A520]">Analizando documento...</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Camera size={24} className="text-[#D4A520] transition-transform group-hover:scale-110" />
                <FileText size={22} className="text-[#D4A520]/80" />
                <Upload size={20} className="text-[#D4A520]/60" />
              </div>
              <span className="text-sm font-medium text-[#D4A520]">Subir cotización o factura</span>
              <span className="text-xs text-gray-400">
                Sube una imagen o PDF — se extraerán los items automáticamente
              </span>
            </>
          )}
        </button>
      </div>

      {/* Form */}
      <div className="card-modern mb-6 animate-slide-in-up stagger-1 p-6" style={{ opacity: 0 }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Número de Orden <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="numero_orden"
              value={form.numero_orden}
              onChange={handleFormChange}
              placeholder="OC-001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Proveedor <span className="text-red-500">*</span>
            </label>
            <select
              name="proveedor_id"
              value={form.proveedor_id}
              onChange={handleFormChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value="">— Seleccionar proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha</label>
            <input
              type="date"
              name="fecha"
              value={form.fecha}
              onChange={handleFormChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha Entrega</label>
            <input
              type="date"
              name="fecha_entrega"
              value={form.fecha_entrega}
              onChange={handleFormChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card-modern mb-6 animate-slide-in-up stagger-2" style={{ opacity: 0 }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-3 font-semibold text-gray-600">Descripción</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Cantidad</th>
                <th className="px-3 py-3 font-semibold text-gray-600">Unidad</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Precio Unit.</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Subtotal</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {form.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    <FileText size={28} className="mx-auto mb-2 text-gray-300" />
                    Sube una cotización o agrega items manualmente
                  </td>
                </tr>
              ) : (
                form.items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="animate-fade-in border-b border-gray-100 transition-colors hover:bg-gray-50"
                    style={{ animationDelay: `${Math.min(idx, 10) * 0.04}s`, opacity: 0 }}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.descripcion}
                        onChange={(e) => handleItemChange(item.id, 'descripcion', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-[#1a365d] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => handleItemChange(item.id, 'cantidad', e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-[#1a365d] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={item.unidad}
                        onChange={(e) => handleItemChange(item.id, 'unidad', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-[#1a365d] focus:outline-none"
                      >
                        <option value="pza">Pza</option>
                        <option value="kg">Kg</option>
                        <option value="lt">Lt</option>
                        <option value="m">M</option>
                        <option value="caja">Caja</option>
                        <option value="rollo">Rollo</option>
                        <option value="paq">Paq</option>
                        <option value="tn">Tn</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                        <input
                          type="number"
                          value={item.precio_unitario}
                          onChange={(e) => handleItemChange(item.id, 'precio_unitario', e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-gray-300 py-1 pl-6 pr-2 text-right text-sm focus:border-[#1a365d] focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">
                      ${item.subtotal.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="btn-danger rounded-lg p-1.5"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-100 px-3 py-3">
          <button
            onClick={handleAddItem}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#1a365d] transition-colors hover:text-[#2a4a7f]"
          >
            <Plus size={16} />
            Agregar Item
          </button>
        </div>
      </div>

      {/* Totals */}
      {form.items.length > 0 && (
        <div className="mb-6 grid animate-slide-in-up grid-cols-1 gap-4 sm:grid-cols-3" style={{ opacity: 0 }}>
          <div className="card-modern border-l-4 border-l-gray-300 p-4">
            <p className="text-xs font-medium text-gray-500">Subtotal</p>
            <p className="mt-1 text-lg font-bold text-gray-900">${totalSum.toFixed(2)}</p>
          </div>
          <div className="card-modern border-l-4 border-l-[#D4A520] p-4">
            <p className="text-xs font-medium text-gray-500">IVA (16%)</p>
            <p className="mt-1 text-lg font-bold text-gray-900">${ivaSum.toFixed(2)}</p>
          </div>
          <div className="card-modern border-l-4 border-l-[#16a34a] p-4">
            <p className="text-xs font-medium text-gray-500">Total</p>
            <p className="mt-1 text-lg font-bold text-[#16a34a]">${grandTotal.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex animate-fade-in gap-3" style={{ opacity: 0 }}>
        <button
          onClick={() => router.back()}
          className="btn-secondary rounded-lg px-4 py-2.5 text-sm"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={processing || form.items.length === 0}
          className="btn-primary rounded-lg px-4 py-2.5 text-sm"
        >
          {processing ? 'Guardando...' : 'Crear Orden de Compra'}
        </button>
      </div>
    </div>
  );
}
