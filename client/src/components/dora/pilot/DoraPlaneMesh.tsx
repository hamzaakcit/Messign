import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DORA_COLORS, PLANE_GEOMETRY as PG } from './dora3dConfig';

interface DoraPlaneMeshProps {
  /** GLB model URL — when provided, used instead of the fallback procedural mesh. */
  glbUrl?: string;
  /** Disable auto-rotation (e.g. for prefers-reduced-motion). */
  reduceMotion?: boolean;
}

/**
 * Procedural low-poly paper plane matching PilotPlaneSVG silhouette,
 * with aviator hat dome and goggle lenses.
 * If a GLB asset is available, load it via useGLTF from the parent and
 * render <primitive> instead — this fallback is intentionally self-contained.
 */
export function DoraPlaneMesh({ reduceMotion = false }: DoraPlaneMeshProps): JSX.Element {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_state, delta) => {
    if (reduceMotion || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.35;
  });

  const bodyGeom = useMemo(() => {
    const { nose, upperWing, center, lowerWing, thickness: t } = PG;
    const verts = new Float32Array([
      // Upper half — top face
      nose[0], nose[1], t,
      upperWing[0], upperWing[1], t,
      center[0], center[1], t,
      // Upper half — bottom face
      nose[0], nose[1], -t,
      center[0], center[1], -t,
      upperWing[0], upperWing[1], -t,
      // Lower half — top face
      nose[0], nose[1], t,
      center[0], center[1], t,
      lowerWing[0], lowerWing[1], t,
      // Lower half — bottom face
      nose[0], nose[1], -t,
      lowerWing[0], lowerWing[1], -t,
      center[0], center[1], -t,
    ]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  const wingGeom = useMemo(() => {
    const { nose, upperWing, center, lowerWing } = PG;
    const dihedral = 0.1;
    const verts = new Float32Array([
      // Upper wing (angled up slightly for dihedral)
      nose[0], nose[1], 0,
      upperWing[0], upperWing[1], dihedral,
      center[0], center[1], 0,
      // Lower wing (angled down for symmetry)
      nose[0], nose[1], 0,
      center[0], center[1], 0,
      lowerWing[0], lowerWing[1], -dihedral,
    ]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DORA_COLORS.blue,
        metalness: 0.15,
        roughness: 0.45,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const wingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DORA_COLORS.cyan,
        metalness: 0.1,
        roughness: 0.5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    [],
  );

  const hatMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DORA_COLORS.hatDark,
        roughness: 0.7,
        metalness: 0.05,
      }),
    [],
  );

  const lensMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DORA_COLORS.lensCyan,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7,
      }),
    [],
  );

  const goggleRimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: DORA_COLORS.goggleRim,
        metalness: 0.3,
        roughness: 0.4,
      }),
    [],
  );

  return (
    <group ref={groupRef} rotation={[0, 0, 0]}>
      {/* Plane body */}
      <mesh geometry={bodyGeom} material={bodyMat} />
      {/* Wing surfaces with dihedral */}
      <mesh geometry={wingGeom} material={wingMat} />

      {/* Exhaust glow */}
      <pointLight
        position={[-1.3, 0, 0]}
        color={DORA_COLORS.cyan}
        intensity={0.8}
        distance={1.5}
      />

      {/* Aviator hat */}
      <mesh position={[0.65, 0.22, 0]} scale={[0.38, 0.22, 0.22]}>
        <sphereGeometry args={[1, 16, 12]} />
        <primitive object={hatMat} attach="material" />
      </mesh>

      {/* Goggle left lens */}
      <mesh position={[0.85, 0.18, -0.12]} scale={[0.08, 0.06, 0.06]}>
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={lensMat} attach="material" />
      </mesh>
      {/* Goggle right lens */}
      <mesh position={[0.85, 0.18, 0.12]} scale={[0.08, 0.06, 0.06]}>
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={lensMat} attach="material" />
      </mesh>
      {/* Goggle rim left */}
      <mesh position={[0.85, 0.18, -0.12]} scale={[0.09, 0.07, 0.07]}>
        <torusGeometry args={[1, 0.15, 8, 16]} />
        <primitive object={goggleRimMat} attach="material" />
      </mesh>
      {/* Goggle rim right */}
      <mesh position={[0.85, 0.18, 0.12]} scale={[0.09, 0.07, 0.07]}>
        <torusGeometry args={[1, 0.15, 8, 16]} />
        <primitive object={goggleRimMat} attach="material" />
      </mesh>
    </group>
  );
}
