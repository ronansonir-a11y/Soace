import * as THREE from 'three';
/** Корона звезды: fresnel + шум, аддитивный блендинг. */
export function starMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(vN, V)), 2.2);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + vW.x * 0.05);
      gl_FragColor = vec4(uColor * (0.75 + fr * 2.4) * pulse + fr * vec3(1.0,0.6,0.25), 1.0); }`,
    transparent: false,
  });
}
/** Атмосферное рассеивание (упрощённый Rayleigh): голубой fresnel-ободок. */
export function atmosphereMaterial(color = 0x4da6ff): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(vN, V)), 3.0); gl_FragColor = vec4(uColor * fr * 1.6, fr * 0.9); }`,
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  });
}
/** Щит: fresnel + расходящаяся волна от точки удара (uHit / uHitTime). */
export function shieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: new THREE.Vector3(0, 0, 1) }, uHitTime: { value: -10 }, uStrength: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vL = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uHit; uniform float uHitTime; uniform float uStrength; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(vN, V)), 2.0);
      float age = uTime - uHitTime; float wave = 0.0;
      if (age >= 0.0 && age < 1.2) { float d = distance(normalize(vL), normalize(uHit)); wave = smoothstep(0.25, 0.0, abs(d - age * 1.4)) * (1.0 - age / 1.2); }
      vec3 col = vec3(0.35, 0.75, 1.0) * (fr * 0.55 + wave * 2.2) * uStrength;
      gl_FragColor = vec4(col, clamp(fr * 0.5 + wave, 0.0, 1.0) * uStrength); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
/** Туннель варпа: полноэкранный шейдер перехода между системами. */
export const WARP_FRAG = `uniform float uT; varying vec2 vUv;
  void main(){ vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
  float streaks = sin(a * 24.0 + sin(r * 18.0 - uT * 22.0) * 2.0) * 0.5 + 0.5;
  float tunnel = smoothstep(0.75, 0.05, r) * (0.35 + streaks * 0.85);
  vec3 col = mix(vec3(0.02,0.0,0.10), vec3(0.35,0.75,1.0), tunnel) + vec3(1.0) * smoothstep(0.16, 0.0, r) * uT;
  gl_FragColor = vec4(col, 1.0); }`;
