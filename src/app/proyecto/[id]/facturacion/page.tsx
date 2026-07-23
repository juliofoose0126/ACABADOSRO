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

const DOCUMENTO_BADGE: Record<string, string> = {
  FACTURA: 'badge-success',
  COMPLEMENTO: 'badge-info',
  NC: 'badge-danger',
};

function findValueNearLabel(lines: string[], labelPattern: RegExp, maxDistance = 3): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(labelPattern);
    if (!m) continue;
    // Value on same line after the label
    const afterLabel = line.substring(m.index! + m[0].length).trim().replace(/^[:\s]+/, '');
    if (afterLabel.length > 1) return afterLabel;
    // Value on next lines
    for (let j = 1; j <= maxDistance && i + j < lines.length; j++) {
      const next = lines[i + j].trim();
      if (next.length > 1 && !/^[-─═]+$/.test(next)) return next;
    }
  }
  return null;
}

function cleanAmount(s: string): string {
  return s.replace(/[$,\s]/g, '').replace(/^0+(\d)/, '$1');
}

function extractCfdiFactura(text: string): Partial<FacturaForm> {
  const result: Partial<FacturaForm> = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const allText = lines.join(' ');
  const allUpper = allText.toUpperCase();

  // ── FECHA ──
  // Priority: "Fecha Expedición/Emisión" > "Fecha Timbrado" > any date with label > any ISO date
  const fechaLabeled = allText.match(
    /[Ff]echa\s*(?:de\s*)?(?:[Ee]xpedici[oó]n|[Ee]misi[oó]n)[:\s]*(\d{4}[-/]\d{2}[-/]\d{2}(?:T\d{2}:\d{2}:\d{2})?)/
  );
  if (fechaLabeled) {
    result.fecha = fechaLabeled[1].substring(0, 10).replace(/\//g, '-');
  }
  if (!result.fecha) {
    const fechaLabeled2 = allText.match(
      /[Ff]echa\s*(?:de\s*)?(?:[Ee]xpedici[oó]n|[Ee]misi[oó]n)[:\s]*(\d{2})[/\-.](\d{2})[/\-.](\d{4})/
    );
    if (fechaLabeled2) result.fecha = `${fechaLabeled2[3]}-${fechaLabeled2[2]}-${fechaLabeled2[1]}`;
  }
  if (!result.fecha) {
    // Any labeled fecha
    const fechaAny = allText.match(/[Ff]echa[:\s]+(\d{4})-(\d{2})-(\d{2})/);
    if (fechaAny) result.fecha = `${fechaAny[1]}-${fechaAny[2]}-${fechaAny[3]}`;
  }
  if (!result.fecha) {
    // ISO datetime
    const isoDate = text.match(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}/);
    if (isoDate) result.fecha = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }
  if (!result.fecha) {
    // Standalone ISO date
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) result.fecha = iso[0];
  }
  if (!result.fecha) {
    // DD/MM/YYYY
    const dmy = text.match(/(\d{2})[/\-.](\d{2})[/\-.](\d{4})/);
    if (dmy) result.fecha = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  // ── FOLIO FISCAL ──
  // Look near "Folio Fiscal" label first, then any UUID
  const folioLabeled = allText.match(
    /[Ff]olio\s*[Ff]iscal\s*(?:del?\s*SAT)?[:\s]*([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/
  );
  if (folioLabeled) {
    result.folio_fiscal = folioLabeled[1].toUpperCase();
  } else {
    const uuid = text.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/);
    if (uuid) result.folio_fiscal = uuid[0].toUpperCase();
  }

  // ── MONTOS ──
  // Strategy: scan each line for labeled amounts to avoid confusion with line-item amounts
  const amountRe = /\$?\s*([\d,]+\.\d{2})/;
  let foundSubtotal = '', foundIva = '', foundTotal = '';

  for (const line of lines) {
    const lineUp = line.toUpperCase();

    // Skip line-item rows (contain quantity + unit price patterns)
    if (/^\d+\s+\d/.test(line) && !/SUBTOTAL|TOTAL|I\.?V\.?A/i.test(lineUp)) continue;

    const amt = line.match(amountRe);
    if (!amt) continue;
    const val = cleanAmount(amt[1]);

    // SUBTOTAL — must say "subtotal" or "sub total" but NOT "total de impuestos"
    if (/\bSUB\s*-?\s*TOTAL\b/i.test(lineUp) && !/IMPUESTO/i.test(lineUp)) {
      foundSubtotal = val;
    }
    // IVA — "IVA", "I.V.A.", "Impuesto Trasladado", "Total Impuestos Trasladados"
    else if (/\bI\.?V\.?A\.?\b|IMPUESTOS?\s*TRASLADADOS?|TOTAL\s*DE\s*IMPUESTOS/i.test(lineUp) && !/SUBTOTAL/i.test(lineUp)) {
      if (!foundIva || parseFloat(val) > parseFloat(foundIva)) foundIva = val;
    }
    // TOTAL — "Total" alone on a line (not subtotal, not "total de impuestos")
    else if (/\bTOTAL\b/i.test(lineUp) && !/\bSUB\s*-?\s*TOTAL\b/i.test(lineUp) && !/IMPUESTO|TRASLADADO|RETENCI/i.test(lineUp)) {
      foundTotal = val;
    }
  }

  if (foundSubtotal) result.subtotal = foundSubtotal;
  if (foundIva) result.iva = foundIva;
  if (foundTotal) result.total = foundTotal;

  // Fallback: look in joined text with strict labeled patterns
  if (!result.subtotal) {
    const m = allUpper.match(/\bSUB\s*-?\s*TOTAL\b[:\s]*\$?\s*([\d,]+\.\d{2})/);
    if (m) result.subtotal = cleanAmount(m[1]);
  }
  if (!result.iva) {
    const m = allUpper.match(/\bI\.?V\.?A\.?\b[^$\d]*\$?\s*([\d,]+\.\d{2})/);
    if (m) result.iva = cleanAmount(m[1]);
  }
  if (!result.total) {
    // Match "Total" that is NOT preceded by "sub" and NOT followed by "impuesto"
    const totalMatches = [...allUpper.matchAll(/(?<!SUB\s*)(?<!SUB)\bTOTAL\b(?!\s*(?:DE\s*)?IMPUESTO)[:\s]*\$?\s*([\d,]+\.\d{2})/g)];
    if (totalMatches.length > 0) {
      result.total = cleanAmount(totalMatches[totalMatches.length - 1][1]);
    }
  }

  // Calculate missing value from other two
  const sub = result.subtotal ? parseFloat(result.subtotal) : NaN;
  const iva = result.iva ? parseFloat(result.iva) : NaN;
  const tot = result.total ? parseFloat(result.total) : NaN;
  if (!isNaN(sub) && !isNaN(tot) && isNaN(iva)) {
    const d = tot - sub;
    if (d >= 0) result.iva = d.toFixed(2);
  }
  if (!isNaN(tot) && !isNaN(iva) && isNaN(sub)) {
    const d = tot - iva;
    if (d > 0) result.subtotal = d.toFixed(2);
  }
  if (!isNaN(sub) && !isNaN(iva) && isNaN(tot)) {
    result.total = (sub + iva).toFixed(2);
  }

  // ── TIPO DE COMPROBANTE ──
  // "Tipo de Comprobante: I - Ingreso", "Efecto del Comprobante: Ingreso"
  const tipoLine = findValueNearLabel(lines, /tipo\s*(?:de\s*)?comprobante/i);
  if (tipoLine) {
    const tu = tipoLine.toUpperCase();
    if (/\bP\b|PAGO|COMPLEMENTO/i.test(tu)) result.documento = 'COMPLEMENTO';
    else if (/\bE\b|EGRESO|NOTA\s*DE\s*CR[EÉ]DITO/i.test(tu)) result.documento = 'NC';
    else if (/\bI\b|INGRESO/i.test(tu)) result.documento = 'FACTURA';
  }
  if (!result.documento) {
    if (/COMPLEMENTO\s*(?:DE\s*)?PAGO/i.test(allUpper)) result.documento = 'COMPLEMENTO';
    else if (/NOTA\s*DE\s*CR[EÉ]DITO/i.test(allUpper)) result.documento = 'NC';
    else if (/EFECTO[:\s]*INGRESO|\bFACTURA\b|COMPROBANTE\s*(?:FISCAL|DE\s*INGRESO)/i.test(allUpper)) result.documento = 'FACTURA';
  }

  // ── FORMA DE PAGO ──
  // Look for labeled value first: "Forma de Pago: 03 - Transferencia electrónica"
  const fpLine = findValueNearLabel(lines, /forma\s*(?:de\s*)?pago/i);
  const fpText = fpLine ? fpLine.toUpperCase() : allUpper;
  // Also check "Método de Pago" for PPD/PUE
  const metodoLine = findValueNearLabel(lines, /m[eé]todo\s*(?:de\s*)?pago/i);

  if (/03|TRANSFERENCIA|SPEI/i.test(fpText)) result.forma_pago = 'TRANSFERENCIA';
  else if (/04|TARJETA.*CR[EÉ]DITO/i.test(fpText)) result.forma_pago = 'CREDITO';
  else if (/28|TARJETA.*D[EÉ]BITO/i.test(fpText)) result.forma_pago = 'DEBITO';
  else if (/01|EFECTIVO/i.test(fpText)) result.forma_pago = 'EFECTIVO';
  // If fpLine was used and matched, skip broad search
  if (!result.forma_pago) {
    if (/TRANSFERENCIA|SPEI/i.test(allUpper)) result.forma_pago = 'TRANSFERENCIA';
    else if (/TARJETA.*D[EÉ]BITO/i.test(allUpper)) result.forma_pago = 'DEBITO';
    else if (/TARJETA.*CR[EÉ]DITO/i.test(allUpper)) result.forma_pago = 'CREDITO';
  }

  // ── CLIENTE ──
  // In CFDI: Emisor = who issues the invoice, Receptor = who receives it
  // For "Facturación RO" (RO's own invoices), Cliente = Receptor
  // But if the user uploads a supplier invoice, we detect and use Emisor
  let emisorName = '';
  let receptorName = '';

  // Extract Emisor name
  const emisorVal = findValueNearLabel(lines, /(?:nombre|raz[oó]n\s*social)\s*(?:del?\s*)?emisor/i);
  if (emisorVal) {
    emisorName = emisorVal.replace(/RFC[:\s]*[A-ZÑ&].*/i, '').replace(/R[eé]gimen.*/i, '').trim();
  }
  if (!emisorName) {
    for (const line of lines) {
      if (/emisor/i.test(line) && /nombre|raz[oó]n/i.test(line)) {
        const v = line.replace(/.*(?:nombre|raz[oó]n\s*social)\s*(?:del?\s*)?emisor\s*[:\s]*/i, '').trim();
        if (v.length > 2) { emisorName = v.replace(/RFC.*/i, '').trim(); break; }
      }
    }
  }

  // Extract Receptor name
  const receptorVal = findValueNearLabel(lines, /(?:nombre|raz[oó]n\s*social)\s*(?:del?\s*)?receptor/i);
  if (receptorVal) {
    receptorName = receptorVal.replace(/RFC[:\s]*[A-ZÑ&].*/i, '').replace(/R[eé]gimen.*/i, '').replace(/Uso\s*(?:de\s*)?CFDI.*/i, '').trim();
  }
  if (!receptorName) {
    for (const line of lines) {
      if (/receptor/i.test(line) && /nombre|raz[oó]n/i.test(line)) {
        const v = line.replace(/.*(?:nombre|raz[oó]n\s*social)\s*(?:del?\s*)?receptor\s*[:\s]*/i, '').trim();
        if (v.length > 2) { receptorName = v.replace(/RFC.*/i, '').replace(/Uso\s*(?:de\s*)?CFDI.*/i, '').trim(); break; }
      }
    }
  }

  // Decide: if Emisor is "ACABADOS" (our company), Cliente = Receptor; otherwise Cliente = Emisor
  const isOwnInvoice = /ACABADOS/i.test(emisorName);
  if (isOwnInvoice && receptorName.length > 2) {
    result.cliente = receptorName;
  } else if (emisorName.length > 2) {
    result.cliente = emisorName;
  } else if (receptorName.length > 2) {
    result.cliente = receptorName;
  }

  // Fallback: find any company name with SA DE CV, S DE RL patterns
  if (!result.cliente) {
    const saMatch = allText.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{3,}(?:S\.?\s*A\.?\s*(?:DE\s*C\.?\s*V\.?)?|S\.?\s*(?:DE\s*)?R\.?\s*L\.?\s*(?:DE\s*C\.?\s*V\.?)?))/);
    if (saMatch) result.cliente = saMatch[1].trim().replace(/\s+/g, ' ');
  }

  // ── DESCRIPCIÓN ──
  // Look for "Descripción" or "Concepto" in the conceptos section, not in headers
  const noiseRe = /^(CANTIDAD|UNIDAD|CLAVE|VALOR\s*UNIT|IMPORTE|DESCUENTO|No\.|PRECIO|TASA|BASE|IMPUESTO|TRASLADO|RETENCI)/i;

  // Strategy: find "Descripción" or "Concepto" label, get value on same/next line
  let descFound = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip table headers that just say "Descripción" as a column name
    if (/^(?:CLAVE|No\.)\s/.test(line) && /descripci[oó]n/i.test(line)) continue;
    if (/^descripci[oó]n$/i.test(line.replace(/[:\s]/g, ''))) {
      // Label only — check next line
      if (i + 1 < lines.length && !noiseRe.test(lines[i + 1]) && lines[i + 1].length > 3) {
        descFound = lines[i + 1];
        break;
      }
      continue;
    }
    const descMatch = line.match(/(?:descripci[oó]n|concepto)\s*[:\s]+(.+)/i);
    if (descMatch) {
      let d = descMatch[1].trim();
      d = d.replace(/(?:CANTIDAD|UNIDAD|VALOR\s*UNIT|IMPORTE|CLAVE|DESCUENTO|No\s*Identificaci).*$/i, '').trim();
      if (d.length > 3 && !noiseRe.test(d)) { descFound = d; break; }
    }
  }
  if (!descFound) {
    // Fallback: look for labeled concepto
    const conceptoVal = findValueNearLabel(lines, /concepto/i);
    if (conceptoVal && conceptoVal.length > 3 && !noiseRe.test(conceptoVal)) {
      descFound = conceptoVal;
    }
  }
  if (descFound) result.descripcion = descFound;

  // ── CUENTA ──
  // Look near "Cuenta", "Banco", "Número de Cuenta" labels first
  const cuentaLine = findValueNearLabel(lines, /(?:banco|n[uú]mero\s*de\s*cuenta|cuenta\s*(?:bancaria|beneficiari))/i);
  const bancoAliases: Record<string, string> = {
    BANCOMER: 'BBVA', CITIBANAMEX: 'BANAMEX', BAJIO: 'BANBAJIO', 'BANBAJÍO': 'BANBAJIO',
  };
  const bancoNames = [
    'INBURSA', 'BBVA', 'BANCOMER', 'BANREGIO', 'BANAMEX', 'CITIBANAMEX',
    'SANTANDER', 'HSBC', 'SCOTIABANK', 'BANORTE', 'AZTECA', 'MULTIVA',
    'BANBAJIO', 'BANBAJÍO', 'BAJIO', 'MONEX', 'BANSI', 'AFIRME', 'MIFEL',
    'INTERCAM', 'INVEX', 'ACTINVER', 'CIBanco',
  ];

  const searchBanks = (source: string) => {
    const up = source.toUpperCase();
    for (const b of bancoNames) {
      if (up.includes(b)) return bancoAliases[b] || b;
    }
    return null;
  };

  if (cuentaLine) {
    const banco = searchBanks(cuentaLine);
    if (banco) result.cuenta = banco;
  }
  if (!result.cuenta) {
    const banco = searchBanks(allText);
    if (banco) result.cuenta = banco;
  }

  // ── FALLBACK: money amounts from $X,XXX.XX patterns ──
  if (!result.total && !result.subtotal) {
    const moneyMatches = [...allText.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
    if (moneyMatches.length > 0) {
      const amounts = moneyMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
      amounts.sort((a, b) => b - a);
      const unique = [...new Set(amounts)];
      if (unique.length >= 1) result.total = unique[0].toFixed(2);
      if (unique.length >= 3) {
        result.subtotal = unique[1].toFixed(2);
        result.iva = unique[2].toFixed(2);
      } else if (unique.length === 2) {
        result.subtotal = unique[1].toFixed(2);
        const diff = unique[0] - unique[1];
        if (diff > 0) result.iva = diff.toFixed(2);
      }
    }
  }

  console.log('CFDI extraction results:', result);
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

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      showToast('Solo se aceptan imágenes (JPG, PNG) o documentos PDF', 'error');
      return;
    }

    setUploadFile(file);
    setOcrProcessing(true);
    showToast(
      isPdf ? 'Leyendo PDF... extrayendo datos' : 'Analizando imagen... esto puede tomar unos segundos',
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
          // Sort by Y descending (top→bottom), then X ascending (left→right)
          textItems.sort((a: any, b: any) => {
            const dy = b.transform[5] - a.transform[5];
            if (Math.abs(dy) > 3) return dy;
            return a.transform[4] - b.transform[4];
          });
          // Group items into lines by Y proximity
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
          // Join each line's items; add ":" separator when a label item ends without one
          const pageLines = lineGroups.map(g => {
            const parts = g.texts.filter(t => t.trim());
            return parts.join(' ');
          });
          pages.push(pageLines.join('\n'));
        }
        text = pages.join('\n');
        console.log('PDF extracted (%d chars):\n%s', text.length, text.substring(0, 1000));
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
        console.log('OCR extracted (%d chars):\n%s', text.length, text.substring(0, 1000));
      }

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
        showToast(`Se extrajeron ${count} dato${count !== 1 ? 's' : ''} del ${isPdf ? 'PDF' : 'imagen'}. Verifica los campos.`, 'success');
      } else {
        showToast('No se pudieron extraer datos claros. Ingresa manualmente.', 'error');
      }
    } catch (err) {
      console.error('OCR/PDF error:', err);
      showToast('Error al analizar el archivo. Intenta con otro formato.', 'error');
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
            className={`animate-slide-in-right flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
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
      <div className="mb-6 flex flex-col gap-4 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a365d] to-[#2a4a7f] shadow-md">
            <FileText className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Facturación RO</h1>
            <p className="mt-1 text-sm text-gray-500">
              Sube facturas, se analizan automáticamente y genera reportes en Excel
            </p>
          </div>
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
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
          >
            <Plus size={16} />
            Agregar Factura
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 card-modern rounded-xl bg-white p-4">
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
        <div className="card-modern animate-slide-in-up stagger-1 rounded-xl border-l-4 border-l-blue-500 bg-white p-4" style={{ opacity: 0 }}>
          <p className="text-xs font-medium text-gray-500">Subtotal</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" /> : formatCurrency(subtotalSum)}
          </p>
        </div>
        <div className="card-modern animate-slide-in-up stagger-2 rounded-xl border-l-4 border-l-amber-500 bg-white p-4" style={{ opacity: 0 }}>
          <p className="text-xs font-medium text-gray-500">IVA</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" /> : formatCurrency(ivaSum)}
          </p>
        </div>
        <div className="card-modern animate-slide-in-up stagger-3 rounded-xl border-l-4 border-l-[#16a34a] bg-white p-4" style={{ opacity: 0 }}>
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
            <div key={i} className="animate-pulse card-modern rounded-xl bg-white p-4">
              <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center card-modern rounded-xl bg-white py-12 text-sm text-gray-400">
            No se encontraron facturas.
          </div>
        ) : (
          filtered.map((f, idx) => (
            <div
              key={f.id}
              className="card-modern animate-slide-in-up rounded-xl border-l-4 border-l-[#1a365d] bg-white p-4"
              style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s`, opacity: 0 }}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${DOCUMENTO_BADGE[f.documento] || 'badge-info'}`}>
                    {f.documento}
                  </span>
                  {f.cliente && <p className="mt-1 text-xs font-medium text-[#1a365d]">{f.cliente}</p>}
                  <p className="mt-0.5 text-xs text-gray-500">{f.descripcion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">{formatDate(f.fecha)}</span>
                    {f.forma_pago && (
                      <span className="badge-info rounded-full px-2.5 py-0.5 text-xs font-semibold">
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
      <div className="hidden overflow-hidden card-modern rounded-xl bg-white md:block">
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
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${DOCUMENTO_BADGE[f.documento] || 'badge-info'}`}>
                          {f.documento}
                        </span>
                      </td>
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
                      <td className="px-3 py-3">
                        {f.forma_pago ? (
                          <span className="badge-info inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold">
                            {f.forma_pago}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
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
                  <tr className="border-t-2 border-[#1a365d] bg-gray-50 font-semibold">
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
          <div className="rounded-xl border-2 border-dashed border-[#D4A520]/40 bg-[#D4A520]/5 p-4 transition-colors hover:border-[#D4A520]/60 hover:bg-[#D4A520]/10">
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
              disabled={ocrProcessing}
              className="flex w-full flex-col items-center gap-2 text-center"
            >
              {ocrProcessing ? (
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
                    <Camera size={24} className="text-[#D4A520]" />
                    <FileText size={22} className="text-[#D4A520]/80" />
                    <Upload size={20} className="text-[#D4A520]/60" />
                  </div>
                  <span className="text-sm font-medium text-[#D4A520]">
                    Subir foto o PDF de factura / CFDI
                  </span>
                  <span className="text-xs text-gray-400">
                    Acepta imágenes (JPG, PNG) y documentos PDF — extrae datos automáticamente
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
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
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
              className="btn-danger rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
