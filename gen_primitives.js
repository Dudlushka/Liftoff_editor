//import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const deg = (v) => (v * Math.PI) / 180;









function mergeGeometriesManual(geos)
{
  // Feltételezzük, hogy mindegyiknek van position attribútuma, és ugyanúgy vannak attribútumai
  const merged = new THREE.BufferGeometry();

  // attribútumok listája (position, normal, uv, stb. – ami létezik az elsőben)
  const attrs = Object.keys(geos[0].attributes);
  const indexArrays = [];
  let indexOffset = 0;

  geos.forEach(g =>
  {
    // indexek
    if (g.index)
    {
      const idx = g.index.array;
      const shifted = new idx.constructor(idx.length);
      for (let i = 0; i < idx.length; i++)
      {
        shifted[i] = idx[i] + indexOffset;
      }
      indexArrays.push(shifted);
    }
    else
    {
      // ha nincs index, akkor szekvenciális indexet generálunk
      const count = g.attributes.position.count;
      const shifted = new Uint32Array(count);
      for (let i = 0; i < count; i++)
      {
        shifted[i] = indexOffset + i;
      }
      indexArrays.push(shifted);
    }

    indexOffset += g.attributes.position.count;
  });

  const mergedIndexLength = indexArrays.reduce((sum, arr) => sum + arr.length, 0);
  const mergedIndex = new Uint32Array(mergedIndexLength);
  let idxPos = 0;
  indexArrays.forEach(arr =>
  {
    mergedIndex.set(arr, idxPos);
    idxPos += arr.length;
  });
  merged.setIndex(new THREE.BufferAttribute(mergedIndex, 1));

  // attribútumok összefűzése
  attrs.forEach(name =>
  {
    const arrays = geos.map(g => g.attributes[name].array);
    const itemSize = geos[0].attributes[name].itemSize;
    const totalLen = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const mergedArr = new arrays[0].constructor(totalLen);

    let offset = 0;
    arrays.forEach(arr =>
    {
      mergedArr.set(arr, offset);
      offset += arr.length;
    });

    merged.setAttribute(name, new THREE.BufferAttribute(mergedArr, itemSize));
  });

  return merged;
}


// ===== Geometries =====
/*
function buildArcCylGeometry(inner, outer, angleDeg, height)
{
  const angDeg = Math.max(1, Math.min(359, angleDeg));
  const a = THREE.MathUtils.degToRad(angDeg);
  const s = 0,
    e = a;
  const outerR = Math.max(outer, inner + 1e-4);

  const shape = new THREE.Shape();
  shape.moveTo(outerR * Math.cos(s), outerR * Math.sin(s));
  shape.absarc(0, 0, outerR, s, e, false);
  shape.lineTo(inner * Math.cos(e), inner * Math.sin(e));

  const hole = new THREE.Path();
  hole.moveTo(inner * Math.cos(e), inner * Math.sin(e));
  hole.absarc(0, 0, inner, e, s, true);
  hole.lineTo(outerR * Math.cos(s), outerR * Math.sin(s));
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 96,
  });
  geo.translate(0, 0, -height / 2);
  geo.rotateX(Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  
  return geo;
}*/

function buildArcCylGeometry(inner, outer, angleDeg, height)
{
  // Biztonságos paraméterezés
  const angDeg = THREE.MathUtils.clamp(angleDeg, 1, 359);
  const angle  = THREE.MathUtils.degToRad(angDeg);

  const rInner = Math.max(0, inner);
  const rOuter = Math.max(rInner + 1e-4, outer);

  const start = 0;
  const end   = angle;

  // 2D gyűrű-szelet shape (XY síkban)
  const shape = new THREE.Shape();

  // Kezdés belső pontnál
  shape.moveTo(rInner * Math.cos(start), rInner * Math.sin(start));

  // Külső ív felé
  shape.lineTo(rOuter * Math.cos(start), rOuter * Math.sin(start));
  shape.absarc(0, 0, rOuter, start, end, false);

  // Vissza a belső ívre
  shape.lineTo(rInner * Math.cos(end), rInner * Math.sin(end));
  shape.absarc(0, 0, rInner, end, start, true);

  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: Math.max(8, Math.round(angDeg / 5)), // pl. 90° → 18 szegmens
    steps: 1,
  });

  // Vastagság közepe az origón legyen (Z-ben)
  geo.translate(0, 0, -height / 2);

  // Nem forgatjuk, nem center()-ezzük XY-ben, így:
  // - az ív közepe az (0,0)-ban van XY síkban
  // - a Z vastagság középen van
  geo.computeVertexNormals();

  return geo;
}


function buildPyramid()
{
  // Saját kézzel épített 5 pontos piramis:
  // alap: 1x1 (x,z ∈ [-0.5, 0.5]), magasság: 1 (y ∈ [0,1])
  const geo = new THREE.BufferGeometry();

  const vertices = new Float32Array([
    // Alap négy sarka (y = 0)
    -0.5, 0.0, -0.5,  // 0: bal-elöl
     0.5, 0.0, -0.5,  // 1: jobb-elöl
     0.5, 0.0,  0.5,  // 2: jobb-hátul
    -0.5, 0.0,  0.5,  // 3: bal-hátul

    // Csúcs (y = 1)
     0.0, 1.0,  0.0   // 4
  ]);

  const indices = [
    // Alap (két háromszög) – ha fordítva áll a normál, cseréld fel a sorrendet
    0, 1, 2,
    0, 2, 3,

    // Oldallapok (mindegyik a csúcs felé)
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0
  ];

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}


function buildHemisphere()
{
  const radius = 0.5;
  const widthSegments  = 24;
  const heightSegments = 16;

  // Félgömb – “kupola”
  const hemi = new THREE.SphereGeometry(
    radius,
    widthSegments,
    heightSegments,
    0, Math.PI * 2,   // körben
    0, Math.PI / 2    // félgömb
  );

  // Aljlap – kör
  const cap = new THREE.CircleGeometry(radius, widthSegments);

  // CircleGeometry alapból XY-síkban van, normál +Z.
  // Tegyük a körlapot az XZ-síkba, normál -Y (mint egy “tál” alja):
  cap.rotateX(Math.PI / 2); // +Z → -Y

  // Mindkettő középpontja az origón van, félgömb vágási síkja y≈0, úgyhogy
  // nem kell translate.

  // A két geometriát egy BufferGeometry-vé fűzzük össze:
  // Ha van BufferGeometryUtils:
  const geo = THREE.BufferGeometryUtils
    ? THREE.BufferGeometryUtils.mergeGeometries([hemi, cap], true)
    : mergeGeometriesManual([hemi, cap]);

  geo.computeVertexNormals();
  
  
  return geo;
}


function buildIsoPrism()
{
    let geo;

    // 2D háromszög XY-síkban, aztán Extrude Z irányban.
    const shape = new THREE.Shape();

    const base   = 1;                    // alap hossza model space-ben
    const height = 1;                    // háromszög magasság (scale-lal skálázod majd)
    const halfB  = base / 2;

    shape.moveTo(-halfB, 0);
    shape.lineTo( halfB, 0);
    shape.lineTo(0, height);
    shape.closePath();

    const extrudeSettings = {
      depth: 1,          // prizma hossza Z-ben (ezt is scale-leled majd)
      bevelEnabled: false
    };

    geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Középre igazítjuk nagyjából, hogy az origó körül legyen:
    geo.translate(0, -height / 2, -0.5);
    // Ha azt szeretnéd, hogy "feküdjön" az XY síkon, forgathatod is:
    // geo.rotateX(-Math.PI / 2);


    return geo;
}



export function buildPrimitiveMesh(p)
{
  let geo;
  if      (p.type === "box")            {geo = new THREE.BoxGeometry(1, 1, 1);}
  else if (p.type === "cylinder")       {geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);}
  else if (p.type === "sphere")         {geo = new THREE.SphereGeometry(0.5, 24, 16);}
  else if (p.type === "cone")           {geo = new THREE.ConeGeometry(0.5, 1, 24);}
  else if (p.type === "quarterTorus")   {geo = new THREE.TorusGeometry(1, 0.25, 16, 64, Math.PI / 2);}
  else if (p.type === "pyramid")        {geo = buildPyramid(); }
  else if (p.type === "hemisphere")     {geo = buildHemisphere();}
  else if (p.type === "isoTriPrism")    {geo = buildIsoPrism();}
  else if (p.type === "arcCyl")
  {
    const inner = p.arc?.inner ?? 0.3;
    const outer = p.arc?.outer ?? 0.5;
    const ang = p.arc?.angle ?? 90;
    geo = buildArcCylGeometry(inner, outer, ang, 1);
  }
  
  else geo = new THREE.BoxGeometry(1, 1, 1);    //if not found
  
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.color),
    flatShading: false,
  });

  const m = new THREE.Mesh(geo, mat);
  m.scale.set(p.scale[0], p.scale[1], p.scale[2]);
  m.position.set(p.pos[0], p.pos[1], p.pos[2]);
  m.rotation.set(deg(p.rotRYP[0]), deg(p.rotRYP[1]), deg(p.rotRYP[2]));
  return m;
}
