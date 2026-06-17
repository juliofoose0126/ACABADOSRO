import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numeroALetras } from './numero-a-letras';

// ---------------------------------------------------------------------------
// Company constants
// ---------------------------------------------------------------------------

const EMPRESA = {
  nombre: 'MARTIN ARMANDO ROJAS PACHECO',
  rfc: 'ROPM6310199LA',
  correo: 'compras@acabadosro.com',
};

// ---------------------------------------------------------------------------
// Executive style constants for xlsx-js-style
// ---------------------------------------------------------------------------

const NAVY = '1A365D';
const LIGHT_BG = 'F8F9FA';
const TOTAL_BG = 'E2E8F0';

const borderThin = {
  top: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
};

const S = {
  title: {
    font: { bold: true, sz: 13, color: { rgb: NAVY } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  subtitle: {
    font: { sz: 9, color: { rgb: '888888' }, italic: true },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  header: {
    font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: NAVY }, patternType: 'solid' as const },
    border: borderThin,
    alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
  },
  data: {
    font: { sz: 9, name: 'Calibri' },
    border: borderThin,
    alignment: { vertical: 'center' as const },
  },
  dataAlt: {
    font: { sz: 9, name: 'Calibri' },
    fill: { fgColor: { rgb: LIGHT_BG }, patternType: 'solid' as const },
    border: borderThin,
    alignment: { vertical: 'center' as const },
  },
  totalRow: {
    font: { bold: true, sz: 10, color: { rgb: NAVY }, name: 'Calibri' },
    fill: { fgColor: { rgb: TOTAL_BG }, patternType: 'solid' as const },
    border: {
      top: { style: 'medium' as const, color: { rgb: NAVY } },
      bottom: { style: 'medium' as const, color: { rgb: NAVY } },
      left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
    },
    alignment: { vertical: 'center' as const },
  },
};

function setLetterMargins(ws: XLSX.WorkSheet) {
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
}

// ---------------------------------------------------------------------------
// Build a styled executive worksheet
// ---------------------------------------------------------------------------

function buildExecutiveSheet(
  headers: { key: string; label: string }[],
  data: Record<string, unknown>[],
  title?: string,
): XLSX.WorkSheet {
  const rows: unknown[][] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  if (title) {
    rows.push([title, ...Array(Math.max(headers.length - 1, 0)).fill('')]);
    merges.push({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } });
    r++;

    const dateStr = new Date().toLocaleDateString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    rows.push([`Generado: ${dateStr}`, ...Array(Math.max(headers.length - 1, 0)).fill('')]);
    merges.push({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } });
    r++;

    rows.push(Array(headers.length).fill(''));
    r++;
  }

  const headerRow = r;
  rows.push(headers.map((h) => h.label));
  r++;

  const dataStart = r;
  for (const row of data) {
    rows.push(headers.map((h) => row[h.key] ?? ''));
    r++;
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // --- Apply styles ---

  // Title rows
  if (title) {
    const a0 = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[a0]) ws[a0].s = S.title;
    const a1 = XLSX.utils.encode_cell({ r: 1, c: 0 });
    if (ws[a1]) ws[a1].s = S.subtitle;
  }

  // Header row
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    if (ws[addr]) ws[addr].s = S.header;
  }

  // Data rows
  for (let ri = dataStart; ri < r; ri++) {
    const isAlt = (ri - dataStart) % 2 === 1;
    const firstAddr = XLSX.utils.encode_cell({ r: ri, c: 0 });
    const firstVal = ws[firstAddr]?.v;
    const isTotalRow = typeof firstVal === 'string' &&
      (firstVal.includes('TOTAL') || firstVal === '');

    // Check if the row is a total row by looking at any cell containing TOTAL
    let rowIsTotal = false;
    for (let c = 0; c < headers.length; c++) {
      const a = XLSX.utils.encode_cell({ r: ri, c });
      const v = ws[a]?.v;
      if (typeof v === 'string' && v.includes('TOTAL')) {
        rowIsTotal = true;
        break;
      }
    }

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: ri, c });
      if (!ws[addr]) ws[addr] = { v: '', t: 's' };
      ws[addr].s = rowIsTotal ? S.totalRow : isAlt ? S.dataAlt : S.data;
    }
  }

  // Column widths — auto-fit, capped for letter paper
  ws['!cols'] = headers.map((h) => {
    const maxLen = Math.max(
      h.label.length,
      ...data.map((row) => String(row[h.key] ?? '').length),
      8,
    );
    return { wch: Math.min(maxLen + 3, 35) };
  });

  // Row heights
  ws['!rows'] = [];
  if (title) {
    ws['!rows'][0] = { hpt: 22 };
    ws['!rows'][1] = { hpt: 16 };
  }
  ws['!rows'][headerRow] = { hpt: 20 };

  if (merges.length > 0) ws['!merges'] = merges;
  setLetterMargins(ws);

  return ws;
}

// ---------------------------------------------------------------------------
// Generic single-sheet Excel export (executive format)
// ---------------------------------------------------------------------------

export function exportToExcel(
  data: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  filename: string,
  sheetName = 'Datos',
  title?: string,
) {
  const ws = buildExecutiveSheet(headers, data, title || filename.replace(/_/g, ' '));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ---------------------------------------------------------------------------
// Multi-sheet Excel export (executive format)
// ---------------------------------------------------------------------------

export function exportMultiSheetExcel(
  sheets: { name: string; data: Record<string, unknown>[]; headers: { key: string; label: string }[] }[],
  filename: string,
  title?: string,
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = buildExecutiveSheet(sheet.headers, sheet.data, title);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ---------------------------------------------------------------------------
// OC Template-matching Excel Export (executive format)
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

function setCellStyled(
  ws: XLSX.WorkSheet,
  addr: string,
  value: string | number,
  style?: Record<string, unknown>,
) {
  const cell: XLSX.CellObject = { v: value, t: typeof value === 'number' ? 'n' : 's' };
  if (style) cell.s = style;
  ws[addr] = cell;
}

export function exportOCExcel(data: OCExportData) {
  const ws: XLSX.WorkSheet = {};

  const labelStyle = {
    font: { bold: true, sz: 9, color: { rgb: NAVY } },
    alignment: { vertical: 'center' as const },
  };
  const valueStyle = {
    font: { sz: 9 },
    alignment: { vertical: 'center' as const },
  };
  const companyStyle = {
    font: { bold: true, sz: 14, color: { rgb: NAVY } },
    alignment: { vertical: 'center' as const },
  };
  const folioStyle = {
    font: { bold: true, sz: 12, color: { rgb: 'D4A520' } },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  };

  // Company header
  setCellStyled(ws, 'A1', EMPRESA.nombre, companyStyle);
  setCellStyled(ws, 'A2', `RFC: ${EMPRESA.rfc}`, valueStyle);
  setCellStyled(ws, 'A3', `CORREO: ${EMPRESA.correo}`, valueStyle);

  // Order info
  setCellStyled(ws, 'F1', 'ORDEN DE COMPRA:', labelStyle);
  setCellStyled(ws, 'G1', data.folio, folioStyle);
  setCellStyled(ws, 'F2', 'OBRA / PROYECTO:', labelStyle);
  setCellStyled(ws, 'G2', data.obra_proyecto, valueStyle);
  setCellStyled(ws, 'F3', 'FECHA DE EMISIÓN:', labelStyle);
  setCellStyled(ws, 'G3', data.fecha, valueStyle);

  // Supplier info
  setCellStyled(ws, 'A5', 'PROVEEDOR:', labelStyle);
  setCellStyled(ws, 'B5', data.proveedor_nombre, valueStyle);
  setCellStyled(ws, 'A6', 'RFC:', labelStyle);
  setCellStyled(ws, 'B6', data.proveedor_rfc, valueStyle);
  setCellStyled(ws, 'A7', 'TEL:', labelStyle);
  setCellStyled(ws, 'B7', data.proveedor_telefono, valueStyle);
  setCellStyled(ws, 'A8', 'CORREO:', labelStyle);
  setCellStyled(ws, 'B8', data.proveedor_email, valueStyle);

  setCellStyled(ws, 'F5', 'VENDEDOR:', labelStyle);
  setCellStyled(ws, 'G5', data.vendedor, valueStyle);
  setCellStyled(ws, 'F6', 'FECHA DE ENTREGA:', labelStyle);
  setCellStyled(ws, 'G6', data.fecha_entrega, valueStyle);

  // Items header (row 10)
  const itemHeaders = ['Código - SKU', 'Descripción', '', 'Unidad', 'Cantidad', 'Precio Unitario', 'Importe total'];
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  cols.forEach((col, i) => {
    if (itemHeaders[i]) {
      setCellStyled(ws, `${col}10`, itemHeaders[i], S.header);
    }
  });

  // Item rows
  const maxItems = 19;
  for (let i = 0; i < maxItems; i++) {
    const row = 11 + i;
    const isAlt = i % 2 === 1;
    const rowStyle = isAlt ? S.dataAlt : S.data;

    if (i < data.items.length) {
      const item = data.items[i];
      setCellStyled(ws, `A${row}`, item.codigo, rowStyle);
      setCellStyled(ws, `B${row}`, item.descripcion, rowStyle);
      setCellStyled(ws, `D${row}`, item.unidad, rowStyle);
      setCellStyled(ws, `E${row}`, item.cantidad, rowStyle);
      setCellStyled(ws, `F${row}`, item.precio_unitario, { ...rowStyle, numFmt: '$#,##0.00' });
      setCellStyled(ws, `G${row}`, item.importe, { ...rowStyle, numFmt: '$#,##0.00' });
    }
  }

  // Totals
  const totalLabelStyle = {
    font: { bold: true, sz: 10, color: { rgb: NAVY } },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
    fill: { fgColor: { rgb: TOTAL_BG }, patternType: 'solid' as const },
    border: borderThin,
  };
  const totalValueStyle = {
    font: { bold: true, sz: 10 },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
    fill: { fgColor: { rgb: TOTAL_BG }, patternType: 'solid' as const },
    border: borderThin,
    numFmt: '$#,##0.00',
  };

  setCellStyled(ws, 'F30', 'Subtotal', totalLabelStyle);
  setCellStyled(ws, 'G30', data.subtotal, totalValueStyle);
  setCellStyled(ws, 'F31', 'IVA (16%)', totalLabelStyle);
  setCellStyled(ws, 'G31', data.iva, totalValueStyle);
  setCellStyled(ws, 'A32', `Cantidad con letra: ${numeroALetras(data.total)}`, {
    font: { italic: true, sz: 8, color: { rgb: '666666' } },
  });
  setCellStyled(ws, 'F32', 'Total', {
    ...totalLabelStyle,
    font: { bold: true, sz: 11, color: { rgb: NAVY } },
    border: {
      top: { style: 'medium' as const, color: { rgb: NAVY } },
      bottom: { style: 'medium' as const, color: { rgb: NAVY } },
      left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
    },
  });
  setCellStyled(ws, 'G32', data.total, {
    ...totalValueStyle,
    font: { bold: true, sz: 11 },
    border: {
      top: { style: 'medium' as const, color: { rgb: NAVY } },
      bottom: { style: 'medium' as const, color: { rgb: NAVY } },
      left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
      right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
    },
  });

  // Merges
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

  // Column widths
  ws['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
  ];

  // Row heights
  ws['!rows'] = [{ hpt: 22 }];

  ws['!ref'] = 'A1:G32';
  setLetterMargins(ws);

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

  doc.setFillColor(26, 54, 93);
  doc.rect(0, 0, pageW, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(EMPRESA.nombre, 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`RFC: ${EMPRESA.rfc}`, 14, 23);
  doc.text(`Correo: ${EMPRESA.correo}`, 14, 29);

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

  totY = totY + 30;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Cantidad con letra:', 14, totY);
  doc.setFont('helvetica', 'normal');
  doc.text(numeroALetras(data.total), 14, totY + 5, { maxWidth: pageW - 28 });

  if (data.notas) {
    totY += 14;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Notas:', 14, totY);
    doc.setFont('helvetica', 'normal');
    doc.text(data.notas, 14, totY + 5, { maxWidth: pageW - 28 });
  }

  const pageH = doc.internal.pageSize.height;
  doc.setFillColor(26, 54, 93);
  doc.rect(0, pageH - 12, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('Acabados RO — Documento generado automáticamente', pageW / 2, pageH - 4, { align: 'center' });

  doc.save(`OC_${data.folio}.pdf`);
}

// ---------------------------------------------------------------------------
// Legacy PDF export
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
