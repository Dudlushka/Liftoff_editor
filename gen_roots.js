// generator_roots.js
//import * as THREE from 'three';

export const worldRoot = new THREE.Group();
export const gpRoot    = new THREE.Group();
export const grpRoot   = new THREE.Group();
export const scnRoot   = new THREE.Group();
export const clRoot    = new THREE.Group();

worldRoot.add(gpRoot, grpRoot, scnRoot, clRoot);