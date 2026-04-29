import { useEffect, useMemo, useState } from 'react';
import { Heart, Check, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FashionItem } from './types';

interface MirrorUIProps {
  items: FashionItem[];
  onSelectItem: (item: FashionItem | null, category: string) => void;
  selectedItems: Record<string, FashionItem | null>;
  favoritesCount: number;
  favoriteOutfits: Record<string, FashionItem | null>[];
  onToggleFavorite: () => void;
  onLoadFavorite: (outfit: Record<string, FashionItem | null>) => void;
  onTakePicture: () => void;
  onViewPicture: () => void;
  canViewPicture: boolean;
  onGenerate: () => void;
  onExit: () => void;
  statusText?: string | null;
  isLocked?: boolean;
  showResult?: boolean;
  onCloseResult?: () => void;
}

type NavView = 'CATEGORIES' | 'ITEMS' | 'WARDROBE';
const CATEGORIES = ['TOP', 'BOTTOM', 'ACCESSORIES'];

export default function MirrorUI({
  items,
  onSelectItem,
  selectedItems,
  favoritesCount,
  favoriteOutfits,
  onToggleFavorite,
  onLoadFavorite,
  onTakePicture,
  onViewPicture,
  canViewPicture,
  onGenerate,
  onExit,
  statusText,
  isLocked,
  showResult,
  onCloseResult,
}: MirrorUIProps) {
  const [view, setView] = useState<NavView>('CATEGORIES');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(
    () => (selectedCategory ? items.filter((item) => item.category === selectedCategory) : []),
    [items, selectedCategory],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
        return;
      }
      if (showResult) {
        if (e.key === 'Enter') onCloseResult?.();
        return;
      }
      if (isLocked) return;

      let listSize = 0;
      if (view === 'CATEGORIES') {
        listSize = CATEGORIES.length + 6; // save + wardrobe + take picture + view picture + generate + exit
      } else if (view === 'ITEMS') {
        listSize = filteredItems.length + 1;
      } else {
        listSize = favoriteOutfits.length + 1;
      }

      switch (e.key) {
        case 'ArrowUp':
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : listSize - 1));
          break;
        case 'ArrowDown':
          setActiveIndex((prev) => (prev < listSize - 1 ? prev + 1 : 0));
          break;
        case 'Enter':
          if (view === 'CATEGORIES') {
            if (activeIndex < CATEGORIES.length) {
              setSelectedCategory(CATEGORIES[activeIndex]);
              setView('ITEMS');
              setActiveIndex(0);
            } else if (activeIndex === CATEGORIES.length) {
              onToggleFavorite();
            } else if (activeIndex === CATEGORIES.length + 1) {
              setView('WARDROBE');
              setActiveIndex(0);
            } else if (activeIndex === CATEGORIES.length + 2) {
              onTakePicture();
            } else if (activeIndex === CATEGORIES.length + 3) {
              onViewPicture();
            } else if (activeIndex === CATEGORIES.length + 4) {
              onGenerate();
            } else if (activeIndex === CATEGORIES.length + 5) {
              onExit();
            }
          } else if (view === 'ITEMS') {
            if (activeIndex < filteredItems.length) {
              const item = filteredItems[activeIndex];
              const category = selectedCategory || 'TOP';
              onSelectItem(selectedItems[category]?.id === item.id ? null : item, category);
            } else {
              setView('CATEGORIES');
              setSelectedCategory(null);
              setActiveIndex(0);
            }
          } else if (view === 'WARDROBE') {
            if (activeIndex < favoriteOutfits.length) {
              onLoadFavorite(favoriteOutfits[activeIndex]);
              setView('CATEGORIES');
              setActiveIndex(0);
            } else {
              setView('CATEGORIES');
              setActiveIndex(0);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeIndex,
    favoriteOutfits,
    filteredItems,
    isLocked,
    onCloseResult,
    onExit,
    onGenerate,
    onLoadFavorite,
    onTakePicture,
    onViewPicture,
    onSelectItem,
    onToggleFavorite,
    selectedCategory,
    selectedItems,
    showResult,
    view,
  ]);

  if (isLocked) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-12">
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-between items-start">
        <div className="border-l-4 border-white pl-4">
          <h1 className="font-mono text-4xl font-black tracking-[0.4em] uppercase text-white drop-shadow-md">REFL3CT</h1>
        </div>
        <div className="glass-morphism px-4 py-2 rounded-full flex items-center space-x-4">
          <div className="flex space-x-2">
            {CATEGORIES.map((cat) => (
              <div key={cat} className={`w-2 h-2 rounded-full ${selectedItems[cat] ? 'bg-blue-500' : 'bg-white/10'}`} />
            ))}
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center space-x-2">
            <Heart className={`w-3 h-3 ${favoritesCount > 0 ? 'fill-red-500 text-red-500' : 'text-white/20'}`} />
            <span className="font-mono text-[10px] tracking-widest">{favoritesCount}</span>
          </div>
        </div>
      </motion.header>

      <div className="flex-1 flex justify-between items-center">
        {!showResult && (
          <div className="w-1/3 flex flex-col justify-center h-full">
            <AnimatePresence mode="wait">
              {selectedCategory && selectedItems[selectedCategory] ? (
                <motion.div
                  key={selectedItems[selectedCategory]!.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] uppercase text-white/40 tracking-[0.3em]">{selectedCategory} Active</span>
                    <h2 className="font-serif text-5xl italic leading-none">{selectedItems[selectedCategory]!.name}</h2>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        {!showResult && (
          <div className="relative flex flex-col items-center">
            <div className="flex flex-col space-y-3 items-end">
              {view === 'CATEGORIES' ? (
                <>
                  {CATEGORIES.map((cat, index) => (
                    <motion.div
                      key={cat}
                      animate={{ opacity: activeIndex === index ? 1 : 0.3, x: activeIndex === index ? -10 : 0 }}
                      transition={{ duration: 0.15 }}
                      className={`px-8 py-4 rounded-xl border-2 transition-all font-mono text-sm tracking-widest uppercase glass-morphism-dark ${activeIndex === index ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                    >
                      <div className="flex items-center space-x-4">
                        <span>{cat}</span>
                        {selectedItems[cat] && <Check className="w-4 h-4 text-blue-500" />}
                      </div>
                    </motion.div>
                  ))}
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length ? 1 : 0.3, x: activeIndex === CATEGORIES.length ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-3 rounded-xl border-2 transition-all font-mono text-[10px] tracking-widest uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length ? 'border-red-500 bg-red-500/10 text-white' : 'border-white/5 text-white/30'}`}
                  >
                    SAVE CURRENT LOOK
                  </motion.div>
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length + 1 ? 1 : 0.3, x: activeIndex === CATEGORIES.length + 1 ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-3 rounded-xl border-2 transition-all font-mono text-[10px] tracking-widest uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length + 1 ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    SAVED LOOKS ({favoriteOutfits.length})
                  </motion.div>
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length + 2 ? 1 : 0.3, x: activeIndex === CATEGORIES.length + 2 ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-3 rounded-xl border-2 transition-all font-mono text-[10px] tracking-widest uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length + 2 ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    TAKE PICTURE
                  </motion.div>
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length + 3 ? 1 : 0.3, x: activeIndex === CATEGORIES.length + 3 ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-3 rounded-xl border-2 transition-all font-mono text-[10px] tracking-widest uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length + 3 ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    {canViewPicture ? 'VIEW PICTURE' : 'VIEW PICTURE (LOCKED)'}
                  </motion.div>
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length + 4 ? 1 : 0.3, x: activeIndex === CATEGORIES.length + 4 ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-4 rounded-xl border-2 transition-all font-mono text-xs tracking-[0.4em] uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length + 4 ? 'border-blue-500 bg-blue-500/20 text-white shadow-2xl' : 'border-white/5 text-white/30'}`}
                  >
                    GENERATE TRY-ON
                  </motion.div>
                  <motion.div
                    animate={{ opacity: activeIndex === CATEGORIES.length + 5 ? 1 : 0.3, x: activeIndex === CATEGORIES.length + 5 ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-8 py-3 rounded-xl border-2 transition-all font-mono text-[10px] tracking-[0.2em] uppercase glass-morphism-dark ${activeIndex === CATEGORIES.length + 5 ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    EXIT TO MIRROR
                  </motion.div>
                </>
              ) : view === 'ITEMS' ? (
                <>
                  {filteredItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      animate={{ opacity: activeIndex === index ? 1 : 0.4, x: activeIndex === index ? -10 : 0 }}
                      transition={{ duration: 0.15 }}
                      className={`w-32 h-44 rounded-2xl overflow-hidden border-2 transition-all relative glass-morphism-dark ${activeIndex === index ? 'border-white' : 'border-white/10'}`}
                    >
                      <img src={item.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      {selectedItems[selectedCategory!]?.id === item.id && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center border-2 border-blue-500">
                          <Check className="w-8 h-8 text-white drop-shadow-lg" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <motion.div
                    animate={{ opacity: activeIndex === filteredItems.length ? 1 : 0.4, x: activeIndex === filteredItems.length ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-6 py-3 rounded-xl border-2 font-mono text-[10px] tracking-tighter uppercase flex items-center space-x-2 glass-morphism-dark ${activeIndex === filteredItems.length ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>BACK</span>
                  </motion.div>
                </>
              ) : (
                <>
                  {favoriteOutfits.map((outfit, index) => (
                    <motion.div
                      key={`${outfit.TOP?.id ?? 'none'}-${outfit.BOTTOM?.id ?? 'none'}-${outfit.ACCESSORIES?.id ?? 'none'}-${index}`}
                      animate={{ opacity: activeIndex === index ? 1 : 0.3, x: activeIndex === index ? -10 : 0 }}
                      transition={{ duration: 0.15 }}
                      className={`w-48 p-3 rounded-xl border-2 transition-all glass-morphism-dark ${activeIndex === index ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                    >
                      <div className="flex space-x-2 h-16 overflow-hidden">
                        {Object.values(outfit)
                          .filter(Boolean)
                          .map((item, i) => (
                            <img key={`${item!.id}-${i}`} src={item!.image} className="w-1/3 object-cover rounded opacity-80" />
                          ))}
                      </div>
                      <div className="mt-2 font-mono text-[8px] uppercase tracking-widest text-center">Look #{index + 1}</div>
                    </motion.div>
                  ))}
                  <motion.div
                    animate={{ opacity: activeIndex === favoriteOutfits.length ? 1 : 0.4, x: activeIndex === favoriteOutfits.length ? -10 : 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-6 py-3 rounded-xl border-2 font-mono text-[10px] tracking-tighter uppercase flex items-center space-x-2 glass-morphism-dark ${activeIndex === favoriteOutfits.length ? 'border-white text-white' : 'border-white/5 text-white/30'}`}
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>BACK</span>
                  </motion.div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="footer-hud flex justify-center">
        {showResult ? (
          <div className="px-8 py-3 bg-white text-black rounded-xl font-mono text-[10px] font-bold tracking-[0.5em] animate-pulse">PRESS SELECT TO RETURN</div>
        ) : (
          <div className="space-x-8 flex font-mono text-[8px] uppercase tracking-[0.3em] text-white/20">
            <span>Navigation: ▲ ▼</span>
            <span>Select: ENTER</span>
            {statusText ? <span>{statusText}</span> : null}
          </div>
        )}
      </footer>
    </div>
  );
}
