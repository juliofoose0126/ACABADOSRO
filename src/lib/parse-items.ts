export interface ParsedItem {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal: number;
}

function cleanNumber(s: string): number {
  const cleaned = s.replace(/[$,\s]/g, '').replace(/^0+(\d)/, '$1');
  return parseFloat(cleaned) || 0;
}

export function parseItemsFromText(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let inItemsSection = false;
  const itemRows: string[] = [];

  // Detectar inicio de sección de items
  const conceptosIdx = lines.findIndex(l => /^(?:CONCEPTO|DESCRIPCI[OÓ]N|ITEM|ART[ÍI]CULO)/i.test(l));
  if (conceptosIdx >= 0) inItemsSection = true;

  for (let i = conceptosIdx >= 0 ? conceptosIdx + 1 : 0; i < lines.length; i++) {
    const line = lines[i];

    // Detener en líneas de totales
    if (/^(?:SUBTOTAL|SUB\s*TOTAL|IVA|IMPUESTO|TOTAL|GRAN\s*TOTAL)/i.test(line)) break;

    // Línea vacía o solo separadores — ignorar
    if (!line || /^[-═─]+$/.test(line)) continue;

    // Si es una línea de item (contiene números y moneda o cantidad)
    if (/([\d,]+\.?\d*)\s+(?:pza|kg|lt|m|caja|rollo|paq|und|tn|l|mts?)(?:\s|$)/i.test(line) ||
        /\$\s*[\d,]+\.?\d+/.test(line)) {
      itemRows.push(line);
    }
  }

  // Parsear cada línea de item
  for (const row of itemRows) {
    const item = parseItemRow(row);
    if (item && item.descripcion) {
      items.push(item);
    }
  }

  return items;
}

function parseItemRow(row: string): ParsedItem | null {
  // Patrones: DESCRIPCION CANTIDAD UNIDAD PRECIO_UNITARIO SUBTOTAL
  // Ejemplo: "Polín Galy Acanalado 100 pza $7943.85 $794,385.45"

  const moneyPattern = /\$?\s*([\d,]+\.?\d{2})/g;
  const qtyPattern = /([\d.]+)\s+(?:pza|kg|lt|m|caja|rollo|paq|und|tn|l|mts?)/i;

  const moneyMatches = [...row.matchAll(moneyPattern)];
  const qtyMatch = row.match(qtyPattern);

  if (!qtyMatch || moneyMatches.length < 1) return null;

  const cantidad = parseFloat(qtyMatch[1]);
  const unidad = qtyMatch[0].replace(/^[\d.]+\s*/, '').trim().toLowerCase();

  // Extraer descripción (todo antes de la cantidad)
  const qtyIdx = row.indexOf(qtyMatch[0]);
  const descripcion = row.substring(0, qtyIdx).trim();

  if (!descripcion) return null;

  let precio_unitario = 0;
  let subtotal = 0;

  if (moneyMatches.length >= 2) {
    precio_unitario = cleanNumber(moneyMatches[moneyMatches.length - 2][1]);
    subtotal = cleanNumber(moneyMatches[moneyMatches.length - 1][1]);
  } else if (moneyMatches.length === 1) {
    subtotal = cleanNumber(moneyMatches[0][1]);
    precio_unitario = cantidad > 0 ? subtotal / cantidad : 0;
  }

  // Validación básica
  if (cantidad <= 0 || (precio_unitario <= 0 && subtotal <= 0)) {
    return null;
  }

  return {
    descripcion,
    cantidad,
    unidad,
    precio_unitario: Math.max(precio_unitario, 0),
    subtotal: Math.max(subtotal, 0),
  };
}

export function validateAndCorrectItems(items: ParsedItem[]): ParsedItem[] {
  return items.map(item => {
    // Si falta precio unitario, calcular desde subtotal
    if (item.precio_unitario === 0 && item.subtotal > 0 && item.cantidad > 0) {
      item.precio_unitario = item.subtotal / item.cantidad;
    }
    // Si falta subtotal, calcular desde precio unitario
    if (item.subtotal === 0 && item.precio_unitario > 0 && item.cantidad > 0) {
      item.subtotal = item.precio_unitario * item.cantidad;
    }
    return item;
  });
}
