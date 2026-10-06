import { useEffect, useRef } from 'react';
import { armorLookPiece, armorPieceName, type ArmorRoll } from '../../domain/armor';
import { ARMOR_ICON_BOX, drawArmorIcon } from '../../engine/armorArt';
import { paintPortrait, portraitStyle } from '../portrait';

interface Props {
  /** The piece to draw (its look depends only on set, slot and rarity). */
  piece: Pick<ArmorRoll, 'set' | 'slot' | 'rarity'>;
  /** Rendered box in CSS pixels (square). */
  size?: number;
}

/**
 * One armor piece's item icon, drawn by `engine/armorArt` and finished by the
 * figure compositor like a portrait. Framed to the slot's `ARMOR_ICON_BOX`.
 */
export function ArmorIcon({ piece, size = 48 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { set, slot, rarity } = piece;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    const box = ARMOR_ICON_BOX[slot];
    const s = (size * 0.84) / Math.max(box.w, box.h);
    const look = armorLookPiece({ set, rarity });
    const style = {
      ...portraitStyle(look.cloth),
      rimAlpha: 0.35,
      shading: 0.6,
      headY: box.y,
      feetY: box.y + box.h,
      box: { x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 },
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2 - (box.x + box.w / 2) * s, size / 2 - (box.y + box.h / 2) * s);
    ctx.scale(s, s);
    paintPortrait(ctx, (g) => drawArmorIcon(g, slot, look), style, `armor|${set}:${slot}:${rarity}`, 0);
  }, [set, slot, rarity, size]);

  return (
    <canvas
      ref={ref}
      className="armor-icon"
      style={{ width: size, height: size }}
      role="img"
      aria-label={armorPieceName(piece)}
    />
  );
}
