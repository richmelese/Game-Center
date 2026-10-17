'use client';

import {
  Brush,
  CakeSlice,
  Car,
  Circle,
  Dices,
  FlaskConical,
  Ghost,
  type LucideIcon,
  Plane,
  Swords,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

const ICONS: Record<string, LucideIcon> = {
  'halloween-bubble-shooter': Ghost,
  'traffic-racer': Car,
  'kids-coloring': Brush,
  'air-combat': Plane,
  stickman: Swords,
  'professor-bubble': FlaskConical,
  'candy-match-3': CakeSlice,
  'fast-dice': Dices,
};

/** Extra zoom for icons whose artwork is circular (transparent corners) so cards stay full-bleed. */
const COVER_ZOOM: Record<string, number> = { 'kids-coloring': 1.3 };

/**
 * Game cover art. Uses the game's own icon (icon-256.png from the game's index.html,
 * stored in /public/games/<slug>.png). A blurred copy fills the frame behind it so
 * icons with rounded or bordered corners still look full-bleed. Falls back to a
 * generated cover for games without artwork.
 *
 * fit="cover"   fills the frame (catalog cards, thumbnails)
 * fit="contain" shows the whole icon on a blurred backdrop (wide banners)
 */
export function GameArt({
  slug,
  color,
  title,
  className = '',
  iconClassName = 'h-10 w-10',
  fit = 'cover',
  sizes = '(max-width: 448px) 50vw, 224px',
  priority = false,
}: {
  slug: string;
  color: string;
  title: string;
  className?: string;
  iconClassName?: string;
  fit?: 'cover' | 'contain';
  sizes?: string;
  priority?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  const src = `/games/${slug}.png`;

  if (missing) {
    const Icon = ICONS[slug] ?? Circle;
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc 55%, #0f172a)` }}
        role="img"
        aria-label={title}
      >
        <Icon className={`relative text-white drop-shadow ${iconClassName}`} strokeWidth={1.75} aria-hidden />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-200 ${className}`}>
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="scale-125 object-cover opacity-80 blur-xl"
      />
      <Image
        src={src}
        alt={title}
        fill
        sizes={sizes}
        priority={priority}
        onError={() => setMissing(true)}
        style={fit === 'cover' ? { transform: `scale(${COVER_ZOOM[slug] ?? 1.08})` } : undefined}
        className={
          fit === 'cover'
            ? 'object-cover'
            : 'object-contain p-3 drop-shadow-[0_6px_14px_rgb(0_0_0/0.35)]'
        }
      />
    </div>
  );
}
