// =============================================================================
// AgentShift · Matière sous verre · bibliothèque de matières
// Textures procédurales (canvas), aucune image externe : le poids reste léger
// et chaque matière se règle ici. Une matière = un matériau Three.js.
//   bois · metal · pierre · plastique (recyclé) · composite · terre (crue) · tissu
//   + verre (couches de l’OS), or (l’agent), argile (socles), papier (plans)
// =============================================================================

import * as THREE from "three";

// Générateur pseudo-aléatoire stable : la même scène à chaque visite.
export function hasard(graine = 1) {
  let a = graine >>> 0 || 1;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toile(l, h, dessin) {
  const c = document.createElement("canvas"); c.width = l; c.height = h;
  dessin(c.getContext("2d"), l, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// --- Bois : fil, cernes, nœud discret ---------------------------------------
export function texBois(graine = 3, teinte = [196, 150, 104]) {
  const r = hasard(graine);
  return toile(512, 512, (g, l, h) => {
    const [R, V, B] = teinte;
    g.fillStyle = `rgb(${R},${V},${B})`; g.fillRect(0, 0, l, h);
    for (let y = 0; y < h; y += 1) {
      const onde = Math.sin(y * 0.045 + Math.sin(y * 0.011) * 3) * 0.5 + 0.5;
      const k = 0.82 + onde * 0.2 + (r() - 0.5) * 0.06;
      g.fillStyle = `rgba(${R * k | 0},${V * k | 0},${B * k | 0},0.55)`;
      g.fillRect(0, y, l, 1);
    }
    g.globalAlpha = 0.18;
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = r() > 0.5 ? "#6b4a2c" : "#e8cfa8";
      g.beginPath(); const y = r() * h; g.moveTo(0, y);
      g.bezierCurveTo(l * 0.3, y + (r() - 0.5) * 18, l * 0.7, y + (r() - 0.5) * 18, l, y + (r() - 0.5) * 8);
      g.lineWidth = r() * 1.4; g.stroke();
    }
    g.globalAlpha = 1;
  });
}

// --- Pierre : travertin clair, pores et veines ------------------------------
export function texPierre(graine = 5) {
  const r = hasard(graine);
  return toile(512, 512, (g, l, h) => {
    g.fillStyle = "#E3DBCD"; g.fillRect(0, 0, l, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${200 + r() * 30 | 0},${185 + r() * 30 | 0},${160 + r() * 30 | 0},0.35)`;
      g.fillRect(0, r() * h, l, 2 + r() * 10);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120,105,85,${0.08 + r() * 0.2})`;
      g.beginPath(); g.ellipse(r() * l, r() * h, 1 + r() * 4, 0.6 + r() * 1.4, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

// --- Plastique recyclé : fond clair, éclats colorés -------------------------
export function texPlastique(graine = 7) {
  const r = hasard(graine);
  const eclats = ["#2F7F8C", "#E07B4F", "#E9C46A", "#3A3A3C", "#F2F0EA", "#8FB3A0"];
  return toile(512, 512, (g, l, h) => {
    g.fillStyle = "#EDEAE3"; g.fillRect(0, 0, l, h);
    for (let i = 0; i < 520; i++) {
      g.fillStyle = eclats[(r() * eclats.length) | 0];
      g.save(); g.translate(r() * l, r() * h); g.rotate(r() * 6.3);
      g.beginPath(); const s = 3 + r() * 11;
      g.moveTo(0, 0); g.lineTo(s, r() * s * 0.6); g.lineTo(s * 0.4, s * 0.9); g.closePath(); g.fill();
      g.restore();
    }
  });
}

// --- Composite : sergé de carbone 2/2 --------------------------------------
export function texComposite() {
  return toile(256, 256, (g, l, h) => {
    const p = 16;
    for (let y = 0; y < h; y += p) for (let x = 0; x < l; x += p) {
      const d = ((x / p + y / p) % 4) < 2;
      const grad = d ? g.createLinearGradient(x, y, x + p, y) : g.createLinearGradient(x, y, x, y + p);
      grad.addColorStop(0, "#1c1d20"); grad.addColorStop(0.5, "#3c3e44"); grad.addColorStop(1, "#1c1d20");
      g.fillStyle = grad; g.fillRect(x, y, p, p);
    }
  });
}

// --- Terre crue : strates de pisé ------------------------------------------
export function texTerre(graine = 11) {
  const r = hasard(graine);
  const ocres = ["#B98A5E", "#A67650", "#C79B6D", "#94683F", "#B07E57", "#C9A27A"];
  return toile(512, 512, (g, l, h) => {
    let y = 0;
    while (y < h) {
      const e = 14 + r() * 30;
      g.fillStyle = ocres[(r() * ocres.length) | 0]; g.fillRect(0, y, l, e);
      g.fillStyle = "rgba(60,40,20,0.18)"; g.fillRect(0, y + e - 2, l, 2);
      y += e;
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? "240,225,200" : "70,50,30"},${r() * 0.25})`;
      g.fillRect(r() * l, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

// --- Tissu : toile de lin -----------------------------------------------------
export function texTissu() {
  return toile(256, 256, (g, l, h) => {
    g.fillStyle = "#D9D2C4"; g.fillRect(0, 0, l, h);
    for (let i = 0; i < l; i += 3) {
      g.fillStyle = `rgba(150,138,118,${0.18 + ((i * 7) % 5) * 0.03})`; g.fillRect(i, 0, 1, h);
      g.fillStyle = `rgba(255,252,245,${0.2 + ((i * 3) % 4) * 0.04})`; g.fillRect(0, i, l, 1);
    }
  });
}

// --- Plan : élévation d’un caisson, cotes en millimètres ---------------------
export function texPlan() {
  return toile(1024, 724, (g, l, h) => {
    g.fillStyle = "#F7F5F0"; g.fillRect(0, 0, l, h);
    g.strokeStyle = "rgba(51,51,51,0.10)"; g.lineWidth = 1;
    for (let x = 0; x < l; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(l, y); g.stroke(); }
    g.strokeStyle = "#333"; g.lineWidth = 3;
    g.strokeRect(220, 150, 420, 400);                // caisson
    g.lineWidth = 2;
    g.strokeRect(236, 166, 190, 368); g.strokeRect(434, 166, 190, 368); // deux portes
    g.beginPath(); g.moveTo(236, 166); g.lineTo(426, 350); g.lineTo(236, 534); g.stroke(); // sens d’ouverture
    g.strokeRect(690, 150, 180, 400);                // vue de côté
    // cotes
    const cote = (x1, y1, x2, y2, txt, vertical) => {
      g.strokeStyle = "#B8963E"; g.fillStyle = "#B8963E"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      [[x1, y1], [x2, y2]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x - 6, y + 6); g.lineTo(x + 6, y - 6); g.stroke(); });
      g.font = "500 22px 'JetBrains Mono', monospace"; g.textAlign = "center";
      if (vertical) { g.save(); g.translate(x1 - 14, (y1 + y2) / 2); g.rotate(-Math.PI / 2); g.fillText(txt, 0, 0); g.restore(); }
      else g.fillText(txt, (x1 + x2) / 2, y1 - 10);
    };
    cote(220, 110, 640, 110, "1 200", false);
    cote(180, 150, 180, 550, "720", true);
    cote(690, 110, 870, 110, "580", false);
    g.fillStyle = "#333"; g.font = "500 18px 'JetBrains Mono', monospace"; g.textAlign = "left";
    g.fillText("CAISSON BAS · CHÊNE FSC · L × H × P = 1 200 × 720 × 580", 220, 620);
    g.fillText("ÉCH. 1:10", 220, 650);
  });
}

// --- Les matériaux ------------------------------------------------------------
export function creerMatieres() {
  const bois = new THREE.MeshPhysicalMaterial({ map: texBois(3), roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const boisClair = new THREE.MeshPhysicalMaterial({ map: texBois(8, [214, 184, 142]), roughness: 0.7 });
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xBFC3C8, metalness: 1, roughness: 0.32, anisotropy: 0.8 });
  const pierre = new THREE.MeshStandardMaterial({ map: texPierre(), roughness: 0.85 });
  const plastique = new THREE.MeshPhysicalMaterial({ map: texPlastique(), roughness: 0.35, clearcoat: 0.6 });
  const composite = new THREE.MeshPhysicalMaterial({ map: texComposite(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const terre = new THREE.MeshStandardMaterial({ map: texTerre(), roughness: 0.95 });
  const tissu = new THREE.MeshPhysicalMaterial({ map: texTissu(), roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide });
  const papier = new THREE.MeshStandardMaterial({ map: texPlan(), roughness: 0.95 });
  const argile = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const or = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.26, clearcoat: 0.6 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
  const verre = (teinte) => new THREE.MeshPhysicalMaterial({
    color: teinte, transmission: 1, thickness: 1.6, roughness: 0.3, ior: 1.42,
    clearcoat: 1, clearcoatRoughness: 0.08, attenuationDistance: 3.2, attenuationColor: teinte,
    iridescence: 0.22, iridescenceIOR: 1.3, specularIntensity: 1,
    emissive: 0xC9A84C, emissiveIntensity: 0,
  });
  return { bois, boisClair, metal, pierre, plastique, composite, terre, tissu, papier, argile, or, graphite, verre };
}
