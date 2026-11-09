import * as THREE from 'three';
export const ORIGIN_THRESHOLD = 5000;
/** Floating Origin: мир «перематывается» к игроку, чтобы float32 не дрожал на больших дистанциях. */
export function rebaseWorld(playerPos: THREE.Vector3, shiftables: THREE.Object3D[], threshold = ORIGIN_THRESHOLD): boolean {
  if (playerPos.length() <= threshold) return false;
  const shift = playerPos.clone();
  for (const o of shiftables) o.position.sub(shift);
  playerPos.set(0, 0, 0);
  return true;
}
