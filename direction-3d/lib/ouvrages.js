// =============================================================================
// AgentShift · Matière sous verre · ouvrages, outils, humains et flux
// Chaque fonction rend un THREE.Group prêt à poser. Celles qui vivent exposent
// group.userData.animer(temps).
// =============================================================================

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hasard } from "./matieres.js";

const ombre = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const boite = (l, h, p, mat, r = 0.02) => new THREE.Mesh(new RoundedBoxGeometry(l, h, p, 3, Math.min(r, l / 2, h / 2, p / 2)), mat);

// --- Étiquette 3D en chasse fixe (sprite) -----------------------------------
export function etiquette3D(texte, { taille = 0.18, couleur = "#333333", fond = "rgba(255,255,255,0.72)" } = {}) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const police = "500 44px 'JetBrains Mono', ui-monospace, monospace";
  g.font = police;
  const l = Math.ceil(g.measureText(texte).width) + 48;
  c.width = l; c.height = 76;
  g.font = police;
  if (fond) { g.fillStyle = fond; g.beginPath(); g.roundRect(0, 0, l, 76, 38); g.fill(); }
  g.fillStyle = couleur; g.textBaseline = "middle"; g.fillText(texte, 24, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(taille * l / 76, taille, 1);
  s.renderOrder = 5;
  return s;
}

// --- Cote : ligne, deux traits obliques, valeur en millimètres ---------------
export function cote(a, b, texte, couleur = "#B8963E") {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mat = new THREE.LineBasicMaterial({ color: couleur });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), mat));
  const dir = B.clone().sub(A).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).add(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.06);
  [A, B].forEach((P) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P.clone().sub(perp), P.clone().add(perp)]), mat)));
  const e = etiquette3D(texte, { taille: 0.13, couleur, fond: "rgba(255,255,255,0.0)" });
  e.position.copy(A).lerp(B, 0.5).add(new THREE.Vector3(0, 0.1, 0));
  g.add(e);
  return g;
}

// --- Matériauthèque : sept échantillons posés sur le socle -------------------
export function materiotheque(m) {
  const g = new THREE.Group();
  const echantillons = [
    ["BOIS", boite(0.7, 0.16, 0.45, m.bois, 0.02)],
    ["MÉTAL", (() => { const s = new THREE.Group(); // profilé en I
      s.add(boite(0.7, 0.03, 0.34, m.metal).translateY(-0.08), boite(0.7, 0.03, 0.34, m.metal).translateY(0.08), boite(0.7, 0.16, 0.04, m.metal)); return s; })()],
    ["PIERRE", boite(0.6, 0.2, 0.45, m.pierre, 0.05)],
    ["PLASTIQUE RECYCLÉ", boite(0.55, 0.12, 0.45, m.plastique, 0.05)],
    ["COMPOSITE", boite(0.62, 0.06, 0.45, m.composite, 0.02)],
    ["TERRE CRUE", boite(0.5, 0.36, 0.42, m.terre, 0.02)],
    ["TISSU", (() => { // pli de tissu : un plan ondulé
      const geo = new THREE.PlaneGeometry(0.7, 0.5, 40, 24), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 14) * 0.035 + Math.sin(x * 5) * 0.02); }
      geo.computeVertexNormals();
      const t = new THREE.Mesh(geo, m.tissu); t.rotation.x = -Math.PI / 2; return t; })()],
  ];
  const places = [[-1.25, -0.55], [-0.4, -0.55], [0.45, -0.55], [1.3, -0.55], [-0.85, 0.55], [0.05, 0.55], [0.95, 0.55]];
  echantillons.forEach(([nom, objet], i) => {
    const [x, z] = places[i];
    const b = new THREE.Box3().setFromObject(objet);
    objet.position.set(x, -b.min.y + 0.005, z);
    objet.rotation.y = (i % 2 ? -1 : 1) * 0.12;
    g.add(ombre(objet));
    const e = etiquette3D(nom, { taille: 0.075 });
    e.position.set(x, b.max.y - b.min.y + 0.1, z + 0.28);
    g.add(e);
  });
  return g;
}

// --- Établi : plan, équerre, crayon, mètre pliant, cotes ---------------------
export function etabli(m) {
  const g = new THREE.Group();
  g.add(boite(3.0, 0.12, 1.3, m.bois, 0.03).translateY(0.86));
  [[-1.35, -0.5], [1.35, -0.5], [-1.35, 0.5], [1.35, 0.5]].forEach(([x, z]) => g.add(boite(0.1, 0.8, 0.1, m.boisClair).translateX(x).translateY(0.4).translateZ(z)));
  g.add(boite(2.7, 0.06, 0.08, m.boisClair).translateY(0.25).translateZ(0.45)); // traverse
  // plan
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.92), m.papier);
  plan.rotation.x = -Math.PI / 2; plan.rotation.z = 0.06; plan.position.set(-0.55, 0.925, 0.05);
  g.add(plan);
  // équerre de menuisier
  const eq = new THREE.Group();
  eq.add(boite(0.62, 0.012, 0.06, m.metal, 0.004).translateX(0.31));
  eq.add(boite(0.08, 0.03, 0.34, m.bois, 0.008).translateZ(0.17).translateX(0.02));
  eq.position.set(0.35, 0.93, 0.18); eq.rotation.y = -0.4; g.add(eq);
  // crayon de charpentier
  const crayon = new THREE.Group();
  crayon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), m.or));
  crayon.add(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), m.boisClair).translateY(0.195));
  crayon.rotation.z = Math.PI / 2; crayon.rotation.y = 0.7; crayon.position.set(0.15, 0.94, -0.3); g.add(crayon);
  // mètre pliant : six branches en zigzag
  const metre = new THREE.Group();
  let x = 0, z = 0, ang = 0.5;
  for (let i = 0; i < 6; i++) {
    const b = boite(0.28, 0.008, 0.032, m.boisClair, 0.003);
    b.position.set(x + Math.cos(ang) * 0.14, 0, z - Math.sin(ang) * 0.14); b.rotation.y = ang;
    metre.add(b);
    x += Math.cos(ang) * 0.28; z -= Math.sin(ang) * 0.28; ang = -ang;
  }
  metre.position.set(0.55, 0.93, -0.1); g.add(metre);
  // pièce en cours : un montant avec tenon
  const piece = new THREE.Group();
  piece.add(boite(0.7, 0.08, 0.12, m.bois, 0.01), boite(0.1, 0.05, 0.06, m.bois, 0.005).translateX(0.4));
  piece.position.set(1.05, 0.96, 0.3); piece.rotation.y = 0.25; g.add(piece);
  g.add(cote([0.7, 1.06, 0.48], [1.45, 1.06, 0.66], "700"));
  g.add(cote([-1.5, 0.0, 0.8], [1.5, 0.0, 0.8], "3 000"));
  return ombre(g);
}

// --- Fraiseuse à commande numérique (portique) ------------------------------
export function fraiseuse(m) {
  const g = new THREE.Group();
  const L = 3.2, P = 2.0;
  g.add(boite(L + 0.2, 0.5, P + 0.2, m.argile, 0.06).translateY(0.25)); // bâti
  const panneau = boite(L - 0.3, 0.05, P - 0.3, m.boisClair, 0.005); panneau.position.y = 0.53; g.add(panneau);
  [-1, 1].forEach((s) => g.add(boite(L + 0.1, 0.1, 0.12, m.metal, 0.02).translateY(0.6).translateZ(s * (P / 2 + 0.02))));
  const pont = new THREE.Group();
  [-1, 1].forEach((s) => pont.add(boite(0.16, 0.7, 0.16, m.metal, 0.03).translateY(0.95).translateZ(s * (P / 2 + 0.02))));
  pont.add(boite(0.2, 0.18, P + 0.2, m.metal, 0.04).translateY(1.32));
  const chariot = new THREE.Group();
  chariot.add(boite(0.3, 0.32, 0.26, m.argile, 0.05).translateY(1.2));
  chariot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 24), m.metal).translateY(0.92));
  const fraise = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12), m.or); fraise.position.y = 0.7;
  chariot.add(fraise);
  pont.add(chariot); g.add(pont);
  // parcours d’outil : une poche à coins arrondis, tracée en or sur le panneau
  const forme = new THREE.Shape();
  const w = 1.1, h = 0.55, r = 0.18;
  forme.moveTo(-w + r, -h); forme.lineTo(w - r, -h); forme.quadraticCurveTo(w, -h, w, -h + r);
  forme.lineTo(w, h - r); forme.quadraticCurveTo(w, h, w - r, h); forme.lineTo(-w + r, h);
  forme.quadraticCurveTo(-w, h, -w, h - r); forme.lineTo(-w, -h + r); forme.quadraticCurveTo(-w, -h, -w + r, -h);
  const pts = forme.getSpacedPoints(400).map((p) => new THREE.Vector3(p.x, 0.558, p.y));
  const trace = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xC9A84C }));
  g.add(trace);
  const fait = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5D7757, linewidth: 2 }));
  fait.position.y = 0.002; g.add(fait);
  g.add(cote([-L / 2 + 0.15, 0.6, P / 2 + 0.3], [L / 2 - 0.15, 0.6, P / 2 + 0.3], "2 500"));
  g.userData.animer = (t) => {
    const k = (t * 0.035) % 1, i = Math.floor(k * (pts.length - 1)), p = pts[i];
    pont.position.x = p.x; chariot.position.z = p.z;
    fait.geometry.setDrawRange(0, i);
  };
  return ombre(g);
}

// --- Caisson de cuisine (Wood Maker) ----------------------------------------
export function caisson(m) {
  const g = new THREE.Group();
  g.add(boite(1.2, 0.72, 0.58, m.boisClair, 0.01).translateY(0.36 + 0.1));
  g.add(boite(1.24, 0.03, 0.62, m.pierre, 0.008).translateY(0.835)); // plan de travail
  [-0.3, 0.3].forEach((x) => g.add(boite(0.585, 0.68, 0.02, m.bois, 0.006).translateX(x).translateY(0.46).translateZ(0.3)));
  [-0.05, 0.05].forEach((x) => g.add(boite(0.012, 0.16, 0.02, m.metal, 0.004).translateX(x).translateY(0.58).translateZ(0.32)));
  g.add(boite(1.1, 0.1, 0.5, m.graphite, 0.005).translateY(0.05)); // socle
  g.add(cote([-0.6, 1.0, 0.31], [0.6, 1.0, 0.31], "1 200"));
  g.add(cote([0.72, 0.1, 0.31], [0.72, 0.82, 0.31], "720"));
  return ombre(g);
}

// --- Pavillon contemporain : terre crue, ossature bois, verre -----------------
export function pavillon(m, verre) {
  const g = new THREE.Group();
  g.add(boite(5.2, 0.16, 3.6, m.boisClair, 0.02).translateY(0.08));             // plancher
  g.add(boite(0.45, 2.4, 3.2, m.terre, 0.02).translateX(-2.3).translateY(1.36)); // mur en pisé
  g.add(boite(3.2, 2.4, 0.45, m.terre, 0.02).translateX(-0.7).translateY(1.36).translateZ(-1.45));
  [[2.4, 1.6], [2.4, -1.6], [0.8, 1.6]].forEach(([x, z]) => g.add(boite(0.14, 2.4, 0.14, m.bois, 0.02).translateX(x).translateY(1.36).translateZ(z)));
  const vitre = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 3.1), verre); vitre.position.set(2.4, 1.33, 0); g.add(vitre);
  const toit = boite(5.8, 0.14, 4.2, m.bois, 0.03); toit.position.set(0.2, 2.63, 0); g.add(toit);
  g.add(boite(5.6, 0.04, 4.0, m.tissu, 0.01).translateX(0.2).translateY(2.72)); // toiture végétale : support textile
  g.add(cote([-2.6, 0.02, 2.1], [2.6, 0.02, 2.1], "5 200"));
  g.add(cote([2.75, 0.16, 1.85], [2.75, 2.56, 1.85], "2 400"));
  return ombre(g);
}

// --- Humain augmenté : une silhouette d’argile et son agent d’or ---------------
export function humainAugmente(m, graine = 1) {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 8, 24), m.argile); corps.position.y = 0.6;
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), m.argile); tete.position.y = 1.32;
  g.add(corps, tete);
  const agent = new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 24), m.or);
  const orbite = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 8, 64), m.or);
  orbite.position.y = 1.32; orbite.rotation.x = Math.PI / 2 - 0.25;
  g.add(agent, orbite);
  const r = hasard(graine)();
  g.userData.animer = (t) => {
    const a = t * 0.9 + r * 6;
    agent.position.set(Math.cos(a) * 0.34, 1.32 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.34);
    tete.rotation.y = Math.sin(t * 0.4 + r * 4) * 0.4;
  };
  return ombre(g);
}

// --- Flux : l’information circule, est calculée, déclarée, arbitrée, commande --
// etapes : [{ nom, position:[x,y,z] }], en boucle fermée.
export function flux(etapes, m, { particules = 70, vitesse = 0.018 } = {}) {
  const g = new THREE.Group();
  const pts = [];
  etapes.forEach((e, i) => {
    const a = new THREE.Vector3(...e.position), b = new THREE.Vector3(...etapes[(i + 1) % etapes.length].position);
    const milieu = a.clone().lerp(b, 0.5); milieu.y += 1.2 + a.distanceTo(b) * 0.08;
    pts.push(a, milieu);
  });
  const courbe = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(courbe, 600, 0.012, 8, true),
    new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.35 }));
  g.add(tube);

  // Les paquets d’information : des billes d’or qui suivent la courbe
  const bille = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xE2C77A }), particules);
  g.add(bille);
  const mat4 = new THREE.Matrix4(), un = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();

  // Les nœuds : un anneau qui bat à chaque étape, et son verbe
  const noeuds = etapes.map((e) => {
    const n = new THREE.Group(); n.position.set(...e.position);
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.014, 12, 64), m.or);
    anneau.rotation.x = Math.PI / 2; n.add(anneau);
    const coeur = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), m.or); n.add(coeur);
    const e3 = etiquette3D(e.nom, { taille: 0.17 }); e3.position.y = 0.42; n.add(e3);
    g.add(n);
    return { anneau, u: 0 };
  });
  // position de chaque nœud sur la courbe (paramètre u)
  const N = 2000, echant = courbe.getSpacedPoints(N);
  noeuds.forEach((n, i) => {
    const cible = new THREE.Vector3(...etapes[i].position);
    let best = 0, d = Infinity;
    echant.forEach((p, k) => { const dd = p.distanceToSquared(cible); if (dd < d) { d = dd; best = k; } });
    n.u = best / N;
  });

  g.userData.animer = (t) => {
    for (let i = 0; i < particules; i++) {
      const u = (i / particules + t * vitesse) % 1;
      const p = courbe.getPointAt(u);
      // près d’un nœud, le paquet ralentit et grossit : il est traité
      let s = 1;
      noeuds.forEach((n) => { const d = Math.abs(u - n.u); if (d < 0.02) s = Math.max(s, 1.9 - d * 45); });
      mat4.compose(p, q, un.set(s, s, s)); bille.setMatrixAt(i, mat4);
    }
    bille.instanceMatrix.needsUpdate = true;
    noeuds.forEach((n, i) => { const k = 1 + Math.max(0, Math.sin(t * 2.2 - i * 1.3)) * 0.35; n.anneau.scale.set(k, k, k); });
  };
  return g;
}
