import type { ClothingItemRead } from '@/api/backendTypes';
import type { FashionItem } from './types';

function categoryToRefl3ct(category: string): FashionItem['category'] | null {
  const c = category.trim().toLowerCase();
  if (!c) return null;
  if (c.includes('top') || c.includes('shirt') || c.includes('jacket') || c.includes('hoodie') || c.includes('coat')) return 'TOP';
  if (c.includes('bottom') || c.includes('pants') || c.includes('short') || c.includes('skirt') || c.includes('jean')) return 'BOTTOM';
  if (c.includes('accessor') || c.includes('hat') || c.includes('shoe') || c.includes('bag') || c.includes('glass')) return 'ACCESSORIES';
  return null;
}

export function toFashionItems(rows: ClothingItemRead[]): FashionItem[] {
  const out: FashionItem[] = [];
  for (const row of rows) {
    const mapped = categoryToRefl3ct(row.category);
    if (!mapped) continue;
    for (const image of row.images ?? []) {
      out.push({
        id: `item-${row.id}-${image.id}`,
        name: row.name,
        category: mapped,
        image: image.image_url,
        sourceImageId: image.id,
        sourceItemId: row.id,
      });
    }
  }
  return out;
}

