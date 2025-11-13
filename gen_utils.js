const S_MIRROR_Z = new THREE.Matrix4().makeScale(1, 1, -1);

// deg → radian
function deg(a)
{
  return (a * Math.PI) / 180;
}

// radian → deg
function rad(a)
{
  return (a * 180) / Math.PI;
}


function mirrorPosZ(v)
{
  // v: THREE.Vector3 vagy [x,y,z]
  if (Array.isArray(v))
  {
    return [v[0], v[1], -v[2]];
  }
  else
  {
    return new THREE.Vector3(v.x, v.y, -v.z);
  }
}

function mirrorQuatZ(q)
{
  // Rg = S * R * S, kvaternionon mátrixon keresztül
  const R = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const Rg = new THREE.Matrix4().copy(S_MIRROR_Z).multiply(R).multiply(S_MIRROR_Z);
  const qg = new THREE.Quaternion().setFromRotationMatrix(Rg);
  return qg.normalize();
}

// Three-space -> Game-space
function toGameSpace(posVec3, quat)
{
  const p = mirrorPosZ(posVec3);
  const q = mirrorQuatZ(quat);
  return { pos: p, quat: q };
}

// Game-space -> Three-space
function fromGameSpace(posVec3, quat)
{
  // ugyanaz a konjugáció visszafelé is, mert S^-1 = S
  const p = mirrorPosZ(posVec3);
  const q = mirrorQuatZ(quat);
  return { pos: p, quat: q };
}

// Euler (fok) -> kvaternion adott sorrend szerint
function quatFromEulerDeg(rDeg, yDeg, pDeg, order)
{
  const e = new THREE.Euler(deg(rDeg), deg(yDeg), deg(pDeg), order || 'XYZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  return q.normalize();
}

// kvaternion -> Euler (fok) adott sorrend szerint
function eulerDegFromQuat(q, order)
{
  const e = new THREE.Euler(0, 0, 0, order || 'XYZ').setFromQuaternion(q);
  return [rad(e.x), rad(e.y), rad(e.z)];
}
