export interface FashionItem {
  id: string;
  name: string;
  category: 'TOP' | 'BOTTOM' | 'ACCESSORIES';
  image: string;
  sourceImageId: number;
  sourceItemId: number;
}

