export interface TransformGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TransformBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function geometryBounds(items: readonly TransformGeometry[]): TransformBounds | null {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function scaleGeometries(
  items: readonly TransformGeometry[],
  source: TransformBounds,
  target: TransformBounds,
): TransformGeometry[] {
  const scaleX = target.width / Math.max(1, source.width);
  const scaleY = target.height / Math.max(1, source.height);
  return items.map((item) => ({
    ...item,
    x: target.x + (item.x - source.x) * scaleX,
    y: target.y + (item.y - source.y) * scaleY,
    width: Math.max(10, item.width * scaleX),
    height: Math.max(10, item.height * scaleY),
  }));
}

export function rotateGeometries(
  items: readonly TransformGeometry[],
  center: { x: number; y: number },
  deltaDegrees: number,
): TransformGeometry[] {
  const radians = deltaDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return items.map((item) => {
    const itemCenterX = item.x + item.width / 2;
    const itemCenterY = item.y + item.height / 2;
    const dx = itemCenterX - center.x;
    const dy = itemCenterY - center.y;
    const nextCenterX = center.x + dx * cosine - dy * sine;
    const nextCenterY = center.y + dx * sine + dy * cosine;
    return {
      ...item,
      x: nextCenterX - item.width / 2,
      y: nextCenterY - item.height / 2,
      rotation: item.rotation + deltaDegrees,
    };
  });
}
