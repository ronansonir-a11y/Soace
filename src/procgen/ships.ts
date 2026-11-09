import * as THREE from 'three';
/** Процедурные корабли из примитивов (CC0-модели не требуются): корпус, крылья, двигатели с эмиссией. */
export function buildShipMesh(color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x37b6ff, emissiveIntensity: 3 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.2, 6), hull); body.rotation.x = -Math.PI / 2; g.add(body);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), dark); cabin.position.set(0, 0.55, 0.4); cabin.scale.set(1, 0.6, 1.6); g.add(cabin);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), hull); wing.position.set(s * 2.0, 0, -1.4); wing.rotation.z = s * 0.1; g.add(wing);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.1, 8), dark); eng.rotation.x = Math.PI / 2; eng.position.set(s * 2.9, 0, -2.0); g.add(eng);
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.05, 1.5, 8), glow); flame.rotation.x = Math.PI / 2; flame.position.set(s * 2.9, 0, -3.2); flame.name = 'flame'; g.add(flame);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.2), hull); fin.position.set(0, 0.8, -1.8); g.add(fin);
  g.scale.setScalar(scale);
  return g;
}
export function buildStationMesh(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b95a5, metalness: 0.8, roughness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc46b, emissiveIntensity: 2.2 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 42, 10), mat); g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2.6, 8, 28), mat); ring.rotation.x = Math.PI / 2; ring.name = 'ring'; g.add(ring);
  for (let i = 0; i < 8; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.2), glow); const a = (i / 8) * Math.PI * 2; w.position.set(Math.cos(a) * 24, 0, Math.sin(a) * 24); g.add(w); }
  const dock = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 14), glow); dock.position.set(0, 0, 18); g.add(dock);
  return g;
}
