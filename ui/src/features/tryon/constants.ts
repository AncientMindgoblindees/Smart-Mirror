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

function categoryToTryOnSlot(category: string, name: string): FashionItem['tryOnSlot'] | null {
  const text = `${category} ${name}`.trim().toLowerCase();
  if (!text) return null;
  if (text.includes('shoe') || text.includes('sneaker') || text.includes('boot')) return 'shoes';
  if (text.includes('hat') || text.includes('cap') || text.includes('beanie')) return 'hat';
  if (text.includes('bottom') || text.includes('pants') || text.includes('short') || text.includes('skirt') || text.includes('jean')) return 'pants';
  if (text.includes('top') || text.includes('shirt') || text.includes('jacket') || text.includes('hoodie') || text.includes('coat')) return 'shirt';
  return null;
}

export function toFashionItems(rows: ClothingItemRead[]): FashionItem[] {
  const out: FashionItem[] = [];
  for (const row of rows) {
    const mapped = categoryToRefl3ct(row.category);
    const tryOnSlot = categoryToTryOnSlot(row.category, row.name);
    if (!mapped || !tryOnSlot) continue;
    for (const image of row.images ?? []) {
      out.push({
        id: `item-${row.id}-${image.id}`,
        name: row.name,
        category: mapped,
        tryOnSlot,
        image: image.image_url,
        sourceImageId: image.id,
        sourceItemId: row.id,
      });
    }
  }
  return out;
}

