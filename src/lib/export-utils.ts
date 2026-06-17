import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numeroALetras } from './numero-a-letras';

// ---------------------------------------------------------------------------
// Company constants (fixed on every OC)
// ---------------------------------------------------------------------------

const EMPRESA = {
  nombre: 'MARTIN ARMANDO ROJAS PACHECO',
  rfc: 'ROPM6310199LA',
  correo: 'compras@acabadosro.com',
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function exportToExcel(
  data: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  filename: string,
  sheetName = 'Datos'
) {
  const wsData = [
    headers.map((h) => h.label),
    ...data.map((row) => headers.map((h) => row[h.key] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = headers.map((h) => ({
    wch: Math.max(
      h.label.length,
      ...data.map((row) => String(row[h.key] ?? '').length)
    ) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportMultiSheetExcel(
  sheets: { name: string; data: Record<string, unknown>[]; headers: { key: string; label: string }[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const wsData = [
      sheet.headers.map((h) => h.label),
      ...sheet.data.map((row) => sheet.headers.map((h) => row[h.key] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = sheet.headers.map((h) => ({
      wch: Math.max(
        h.label.length,
        ...sheet.data.map((row) => String(row[h.key] ?? '').length),
        10
      ) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ---------------------------------------------------------------------------
// OC Template-matching Excel Export
// ---------------------------------------------------------------------------

export interface OCExportData {
  folio: string;
  obra_proyecto: string;
  fecha: string;
  proveedor_nombre: string;
  proveedor_rfc: string;
  proveedor_telefono: string;
  proveedor_email: string;
  vendedor: string;
  fecha_entrega: string;
  items: {
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
    importe: number;
  }[];
  subtotal: number;
  iva: number;
  total: number;
  notas: string | null;
}

function setCell(ws: XLSX.WorkSheet, addr: string, value: string | number, bold = false) {
  const cell: XLSX.CellObject = { v: value, t: typeof value === 'number' ? 'n' : 's' };
  if (bold) {
    cell.s = { font: { bold: true } };
  }
  ws[addr] = cell;
}

export function exportOCExcel(data: OCExportData) {
  const ws: XLSX.WorkSheet = {};

  // --- Company header (fixed) ---
  setCell(ws, 'A1', EMPRESA.nombre, true);
  setCell(ws, 'A2', `RFC: ${EMPRESA.rfc}`);
  setCell(ws, 'A3', `CORREO: ${EMPRESA.correo}`);

  // --- Order info ---
  setCell(ws, 'F1', 'ORDEN DE COMPRA:', true);
  setCell(ws, 'G1', data.folio, true);
  setCell(ws, 'F2', 'OBRA / PROYECTO:');
  setCell(ws, 'G2', data.obra_proyecto);
  setCell(ws, 'F3', 'FECHA DE EMISIÓN:');
  setCell(ws, 'G3', data.fecha);

  // --- Supplier info ---
  setCell(ws, 'A5', 'PROVEEDOR:', true);
  setCell(ws, 'B5', data.proveedor_nombre);
  setCell(ws, 'A6', 'RFC:');
  setCell(ws, 'B6', data.proveedor_rfc);
  setCell(ws, 'A7', 'TEL:');
  setCell(ws, 'B7', data.proveedor_telefono);
  setCell(ws, 'A8', 'CORREO:');
  setCell(ws, 'B8', data.proveedor_email);

  setCell(ws, 'F5', 'VENDEDOR:');
  setCell(ws, 'G5', data.vendedor);
  setCell(ws, 'F6', 'FECHA DE ENTREGA:');
  setCell(ws, 'G6', data.fecha_entrega);

  // --- Items header (row 10) ---
  setCell(ws, 'A10', 'Código - SKU', true);
  setCell(ws, 'B10', 'Descripción', true);
  setCell(ws, 'D10', 'Unidad', true);
  setCell(ws, 'E10', 'Cantidad', true);
  setCell(ws, 'F10', 'Precio Unitario', true);
  setCell(ws, 'G10', 'Importe total', true);

  // --- Item rows (11-29, up to 19 items) ---
  const maxItems = 19;
  for (let i = 0; i < maxItems; i++) {
    const row = 11 + i;
    if (i < data.items.length) {
      const item = data.items[i];
      setCell(ws, `A${row}`, item.codigo);
      setCell(ws, `B${row}`, item.descripcion);
      setCell(ws, `D${row}`, item.unidad);
      setCell(ws, `E${row}`, item.cantidad);
      setCell(ws, `F${row}`, item.precio_unitario);
      setCell(ws, `G${row}`, item.importe);
    }
  }

  // --- Totals ---
  setCell(ws, 'F30', 'Subtotal', true);
  setCell(ws, 'G30', data.subtotal);
  setCell(ws, 'F31', 'IVA (16%)', true);
  setCell(ws, 'G31', data.iva);
  setCell(ws, 'A32', `Cantidad con letra: ${numeroALetras(data.total)}`);
  setCell(ws, 'F32', 'Total', true);
  setCell(ws, 'G32', data.total);

  // --- Merges (matching template) ---
  ws['!merges'] = [
    XLSX.utils.decode_range('A1:C1'),
    XLSX.utils.decode_range('A2:B2'),
    XLSX.utils.decode_range('A3:B3'),
    XLSX.utils.decode_range('B10:C10'),
    XLSX.utils.decode_range('A32:E32'),
    XLSX.utils.decode_range('B5:C5'),
    XLSX.utils.decode_range('B6:C6'),
    XLSX.utils.decode_range('B7:C7'),
    XLSX.utils.decode_range('B8:C8'),
    ...Array.from({ length: maxItems }, (_, i) =>
      XLSX.utils.decode_range(`B${11 + i}:C${11 + i}`)
    ),
    XLSX.utils.decode_range('B30:C30'),
    XLSX.utils.decode_range('B31:C31'),
  ];

  // --- Column widths ---
  ws['!cols'] = [
    { wch: 14 },  // A - Codigo
    { wch: 22 },  // B - Descripcion (merged with C)
    { wch: 8 },   // C
    { wch: 10 },  // D - Unidad
    { wch: 10 },  // E - Cantidad
    { wch: 16 },  // F - Precio
    { wch: 16 },  // G - Importe
  ];

  // --- Set range ---
  ws['!ref'] = 'A1:G32';

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OC');
  XLSX.writeFile(wb, `OC_${data.folio}.xlsx`);
}

// ---------------------------------------------------------------------------
// OC Template-matching PDF Export
// ---------------------------------------------------------------------------

export function exportOCPDF(data: OCExportData) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.width;

  // --- Navy header bar ---
  doc.setFillColor(26, 54, 93);
  doc.rect(0, 0, pageW, 42, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(EMPRESA.nombre, 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`RFC: ${EMPRESA.rfc}`, 14, 23);
  doc.text(`Correo: ${EMPRESA.correo}`, 14, 29);

  // Order number on right
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEN DE COMPRA', pageW - 14, 14, { align: 'right' });
  doc.setFontSize(14);
  doc.setTextColor(212, 165, 32);
  doc.text(data.folio, pageW - 14, 22, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  if (data.obra_proyecto) {
    doc.text(`Obra: ${data.obra_proyecto}`, pageW - 14, 30, { align: 'right' });
  }
  doc.text(`Fecha: ${data.fecha}`, pageW - 14, 37, { align: 'right' });

  // --- Supplier info ---
  let y = 52;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);

  const labelX = 14;
  const valX = 45;
  const rightLabelX = 120;
  const rightValX = 155;

  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.proveedor_nombre, valX, y);

  doc.setFont('helvetica', 'bold');
  doc.text('VENDEDOR:', rightLabelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.vendedor || '-', rightValX, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('RFC:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.proveedor_rfc || '-', valX, y);

  doc.setFont('helvetica', 'bold');
  doc.text('FECHA ENTREGA:', rightLabelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.fecha_entrega || '-', rightValX, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('TEL:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.proveedor_telefono || '-', valX, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('CORREO:', labelX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.proveedor_email || '-', valX, y);
  y += 10;

  // --- Items table ---
  autoTable(doc, {
    startY: y,
    head: [['Código', 'Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'Importe']],
    body: data.items.map((item) => [
      item.codigo || '-',
      item.descripcion,
      item.unidad,
      item.cantidad.toString(),
      `$${item.precio_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      `$${item.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [26, 54, 93], fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 55 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 30;
  let totY = finalY + 8;

  // --- Totals box ---
  const boxX = pageW - 80;
  const boxW = 66;
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(boxX, totY - 4, boxW, 28, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', boxX + 4, totY + 2);
  doc.text(`$${data.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, boxX + boxW - 4, totY + 2, { align: 'right' });

  doc.text('IVA (16%):', boxX + 4, totY + 9);
  doc.text(`$${data.iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, boxX + boxW - 4, totY + 9, { align: 'right' });

  doc.setDrawColor(26, 54, 93);
  doc.line(boxX + 4, totY + 13, boxX + boxW - 4, totY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', boxX + 4, totY + 20);
  doc.text(`$${data.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, boxX + boxW - 4, totY + 20, { align: 'right' });

  // --- Amount in words ---
  totY = totY + 30;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Cantidad con letra:', 14, totY);
  doc.setFont('helvetica', 'normal');
  doc.text(numeroALetras(data.total), 14, totY + 5, { maxWidth: pageW - 28 });

  // --- Notes ---
  if (data.notas) {
    totY += 14;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas:', 14, totY);
    doc.setFont('helvetica', 'normal');
    doc.text(data.notas, 14, totY + 5, { maxWidth: pageW - 28 });
  }

  // --- Footer bar ---
  const pageH = doc.internal.pageSize.height;
  doc.setFillColor(26, 54, 93);
  doc.rect(0, pageH - 12, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('Acabados RO — Documento generado automáticamente', pageW / 2, pageH - 4, { align: 'center' });

  doc.save(`OC_${data.folio}.pdf`);
}

// ---------------------------------------------------------------------------
// Legacy PDF export (kept for backward compat but delegates to new fn)
// ---------------------------------------------------------------------------

export function exportOrdenCompraPDF(orden: {
  numero_orden: string;
  fecha: string;
  fecha_entrega?: string | null;
  proveedor: string;
  contacto?: string;
  telefono?: string;
  notas?: string | null;
  items: { descripcion: string; cantidad: number; unidad: string; precio_unitario: number; subtotal: number }[];
  subtotal: number;
  iva: number;
  total: number;
}) {
  exportOCPDF({
    folio: orden.numero_orden,
    obra_proyecto: '',
    fecha: orden.fecha,
    proveedor_nombre: orden.proveedor,
    proveedor_rfc: '',
    proveedor_telefono: orden.telefono || '',
    proveedor_email: '',
    vendedor: orden.contacto || '',
    fecha_entrega: orden.fecha_entrega || '',
    items: orden.items.map((i) => ({
      codigo: '',
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      importe: i.subtotal,
    })),
    subtotal: orden.subtotal,
    iva: orden.iva,
    total: orden.total,
    notas: orden.notas ?? null,
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
