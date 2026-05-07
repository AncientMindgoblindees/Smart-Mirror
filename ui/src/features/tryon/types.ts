export interface FashionItem {
  id: string;
  name: string;
  category: 'TOP' | 'BOTTOM' | 'HATS' | 'SHOES';
  tryOnSlot: 'shirt' | 'pants' | 'shoes' | 'hat';
  image: string;
  sourceImageId: number;
  sourceItemId: number;
}

