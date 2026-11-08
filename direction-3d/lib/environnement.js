// =============================================================================
// AgentShift · Matière sous verre · moteur de l’environnement 3D
//
// Un seul monde, trois ambiances :
//   "atelier"  A · lumière du jour, verre dépoli, perspective
//   "flux"     B · de nuit, flux lumineux, panneaux d’agents flottants
//   "maquette" C · vue isométrique d’un plateau de maquette, pastels
//
// Le monde : la pile de l’OS (MATIÈRE, COPILOTE, SAUT) posée sur une
// matériauthèque, un établi, une fraiseuse à commande numérique, un caisson,
// un pavillon en terre crue et bois, des humains augmentés par leur agent,
// et la boucle de l’organisation cognitive :
//   CIRCULER → CALCULER → DÉCLARER → ARBITRER → COMMANDER → …
//
// Usage :
//   const env = creerEnvironnement({ canvas, stations, ambiance: "atelier" });
//   env.allumerCouche(0 | 1 | 2 | -1);
// Le texte reste en HTML : la 3D ne porte jamais seule une information.
// =============================================================================

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { creerMatieres } from "./matieres.js";
import { materiotheque, etabli, fraiseuse, caisson, pavillon, humainAugmente, flux, etiquette3D } from "./ouvrages.js";

// --- Le plan du monde ---------------------------------------------------------
const LIEUX = {
  pile:      [0, 0, 0],
  etabli:    [-5.2, 0, 1.6],
  fraiseuse: [6.2, 0, -1.4],
  projets:   [11.5, 0, 1.8],
  pavillon:  [-11, 0, -2.5],
};
const ETAPES = [
  { nom: "CIRCULER",  position: [-5.2, 1.7, 1.6] },
  { nom: "CALCULER",  position: [0, 3.9, 0] },
  { nom: "DÉCLARER",  position: [3.2, 2.7, -4.2] },
  { nom: "ARBITRER",  position: [7.6, 2.2, 1.4] },
  { nom: "COMMANDER", position: [6.2, 2.4, -1.4] },
];

// Points de vue par ambiance : cam et cible (perspective), ou cible et zoom (iso).
const VUES = {
  atelier: {
    accueil:      { cam: [6.4, 4.4, 8.8],   cible: [0, 1.5, 0] },
    organisation: { cam: [4, 18, 20],       cible: [3, 0.5, -1.0] },
    approche:     { cam: [3.6, 2.9, 5.2],   cible: [0, 1.4, 0] },
    parcours:     { cam: [-3.0, 2.6, 5.6],  cible: [-5.2, 0.9, 1.4] },
    projets:      { cam: [17.5, 8.5, 13.5], cible: [10.8, -0.6, 0.6] },
    contact:      { cam: [-4.2, 3.4, 4.6],  cible: [-11, 1.4, -2.5] },
  },
  flux: {
    accueil:      { cam: [6.0, 3.8, 8.8],   cible: [0, 1.9, 0] },
    organisation: { cam: [1, 12, 15],       cible: [2.5, 1.4, -0.5] },
    approche:     { cam: [2.8, 2.4, 4.2],   cible: [0, 1.5, 0] },
    parcours:     { cam: [-3.4, 2.2, 4.4],  cible: [-5.2, 1.2, 1.4] },
    projets:      { cam: [15.5, 6.5, 11],   cible: [9.6, -0.2, 0] },
    contact:      { cam: [-5.2, 2.6, 3.4],  cible: [-11, 1.6, -2.5] },
  },
  maquette: {
    accueil:      { cible: [0, 0.8, 0],     zoom: 1.35 },
    organisation: { cible: [1, 0.5, -1.8],  zoom: 0.62 },
    approche:     { cible: [0, 1.2, 0],     zoom: 1.9 },
    parcours:     { cible: [-5.2, 0.8, 1.6],zoom: 1.7 },
    projets:      { cible: [8.8, 0.8, 0.4], zoom: 1.05 },
    contact:      { cible: [-10, 1.2, -2.5], zoom: 1.25 },
  },
};

// Teintes des trois couches de verre, par ambiance
const TEINTES_VERRE = {
  atelier:  ["#F1E6D4", "#DCEAD6", "#F6E7B8"],
  flux:     ["#C9D6E0", "#BFD8C2", "#F0D58A"],
  maquette: ["#9FD3D6", "#F2A97E", "#F4D97A"],
};

const jeton = (n, r) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || r;
const estSombre = () => {
  const d = document.documentElement.dataset.theme;
  return d === "dark" || (d !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
};

export function creerEnvironnement({ canvas, stations, ambiance = "atelier" }) {
  const essai = document.createElement("canvas");
  if (!(essai.getContext("webgl2") || essai.getContext("webgl"))) {
    document.documentElement.classList.add("sans-3d");
    return { allumerCouche() {}, detruire() {} };
  }
  const iso = ambiance === "maquette";
  const nuit = ambiance === "flux";
  const reduit = matchMedia("(prefers-reduced-motion: reduce)");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = iso
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200)
    : new THREE.PerspectiveCamera(34, 1, 0.1, 150);

  // --- Lumières -------------------------------------------------------------
  const soleil = new THREE.DirectionalLight(0xffffff, 1.6);
  soleil.position.set(-7, 14, 9);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.radius = 7;
  soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.03; // pas de stries sur les grandes surfaces
  Object.assign(soleil.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 60 });
  const contre = new THREE.DirectionalLight(0xFFE7B8, 1.3);
  contre.position.set(6, 6, -10);
  const ciel = new THREE.HemisphereLight(0xffffff, 0x8a8170, 0.6);
  scene.add(soleil, contre, ciel);

  const sol = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0.16 }));
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true;
  scene.add(sol);

  // --- Matières -------------------------------------------------------------
  const m = creerMatieres();
  const vivants = [];
  const poser = (objet, lieu, rotY = 0) => { objet.position.set(...lieu); objet.rotation.y = rotY; scene.add(objet); if (objet.userData.animer) vivants.push(objet); return objet; };

  // Plateau de maquette (C) : tout le monde posé sur une table d’architecte
  if (iso) {
    const plateau = new THREE.Mesh(new RoundedBoxGeometry(30, 0.5, 14, 6, 0.24), new THREE.MeshStandardMaterial({ color: 0xF4EFE6, roughness: 0.9 }));
    plateau.position.set(0.5, -0.25, -1.2); plateau.receiveShadow = true; scene.add(plateau);
  }

  // --- 1. La pile de l’OS sur la matériauthèque --------------------------------
  const pile = new THREE.Group(); poser(pile, LIEUX.pile);
  const socle = new THREE.Mesh(new RoundedBoxGeometry(3.8, 0.5, 2.8, 6, 0.22), m.argile);
  socle.position.y = 0.25; socle.castShadow = socle.receiveShadow = true; pile.add(socle);
  const echantillons = materiotheque(m); echantillons.position.y = 0.5; pile.add(echantillons);
  const couches = TEINTES_VERRE[ambiance].map((teinte, i) => {
    const c = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.24, 2.4, 8, 0.11), m.verre(teinte));
    c.position.y = 1.15 + i * 0.95; c.castShadow = true; pile.add(c); return c;
  });
  ["MATIÈRE", "COPILOTE", "SAUT"].forEach((nom, i) => {
    const e = etiquette3D(nom, { taille: 0.14 }); e.position.set(-1.95, 1.15 + i * 0.95, 1.25); pile.add(e);
  });
  const agent = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), m.or); agent.castShadow = true; pile.add(agent);
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 16, 96), m.or);
  anneau.rotation.x = Math.PI / 2; anneau.position.y = 3.4; pile.add(anneau);

  // --- 2. Le savoir-faire : l’établi ------------------------------------------------
  poser(etabli(m), LIEUX.etabli, 0.15);
  poser(humainAugmente(m, 1), [LIEUX.etabli[0] + 0.3, 0, LIEUX.etabli[2] + 1.25], Math.PI);

  // --- 3. La commande : la fraiseuse et son opérateur ------------------------------
  poser(fraiseuse(m), LIEUX.fraiseuse, -0.1);
  poser(humainAugmente(m, 2), [7.6, 0, 1.4], -0.6);

  // --- 4. Les projets : Marcel, Wood Maker, HALF -----------------------------------
  const projets = new THREE.Group(); poser(projets, LIEUX.projets, -0.2);
  const socleProjet = (x) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.2, 64), m.argile); s.position.set(x, 0.1, 0); projets.add(s); };
  [-2.2, 0, 2.2].forEach(socleProjet);
  const marcel = new THREE.Group(); marcel.position.set(-2.2, 0.2, 0);
  marcel.add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.62, 0.5, 6, 0.12), m.argile).translateY(0.32));
  const objectif = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.28, 48), m.verre("#ffffff"));
  objectif.rotation.x = Math.PI / 2; objectif.position.set(0, 0.32, 0.36); marcel.add(objectif);
  projets.add(marcel);
  const cuisine = caisson(m); cuisine.position.set(0, 0.2, 0); cuisine.scale.setScalar(0.85); projets.add(cuisine);
  const half = new THREE.Group(); half.position.set(2.2, 0.2, 0);
  half.add(new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.24, 0.8, 6, 0.1), m.argile).translateY(0.3));
  [[-0.42, 0.34], [0.42, 0.34], [-0.42, -0.34], [0.42, -0.34]].forEach(([x, z]) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 16, 40), m.graphite); r.position.set(x, 0.14, z); r.rotation.y = Math.PI / 2; half.add(r);
  });
  projets.add(half);
  projets.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  [["MARCEL", -2.2], ["WOOD MAKER", 0], ["HALF", 2.2]].forEach(([n, x]) => { const e = etiquette3D(n, { taille: 0.15 }); e.position.set(x, 1.55, 0); projets.add(e); });

  // --- 5. L’ouvrage : le pavillon -------------------------------------------------
  poser(pavillon(m, m.verre("#ffffff")), LIEUX.pavillon, 0.35);
  poser(humainAugmente(m, 3), [-8.0, 0, -0.6], -2.2);
  const grandAgent = new THREE.Mesh(new THREE.SphereGeometry(0.55, 64, 48), m.or);
  grandAgent.position.set(-11, 3.1, -2.5); grandAgent.castShadow = true; scene.add(grandAgent);

  // --- 6. La boucle de l’organisation cognitive ----------------------------------
  const boucle = flux(ETAPES, m, { particules: nuit ? 160 : 90, vitesse: 0.016 });
  scene.add(boucle); vivants.push(boucle);
  const carte = carteDeclaration(m);
  carte.position.set(3.2, 2.0, -4.2); carte.rotation.y = -0.5; scene.add(carte);

  // Ambiance B : panneaux d’agents flottants à côté des humains
  if (nuit) {
    [[-4.6, 2.6, 3.2, 2.6, "AGENT · RELEVÉ", "3 photos rangées"], [8.6, 2.8, 2.2, -0.8, "AGENT · DÉBIT", "panneau 2 500 prêt"], [-7.4, 2.9, 0.4, 0.9, "AGENT · CHANTIER", "en attente de vous"]]
      .forEach(([x, y, z, r, titre, ligne]) => { const p = panneauAgent(titre, ligne); p.position.set(x, y, z); p.rotation.y = r; scene.add(p); });
  }

  // --- Thème ----------------------------------------------------------------
  let composer = null;
  function appliquerTheme() {
    const sombre = nuit || estSombre();
    scene.background?.dispose?.();
    scene.background = fondDegrade(sombre, ambiance);
    m.argile.color.set(iso ? "#EFE3D0" : jeton("--argile", "#D8CCBA"));
    m.or.color.set(jeton("--or", "#C9A84C"));
    soleil.intensity = sombre ? 0.55 : 1.6;
    ciel.intensity = sombre ? 0.25 : 0.6;
    contre.intensity = sombre ? 2.2 : 1.3;
    renderer.toneMappingExposure = sombre ? 0.85 : 1.05;
    sol.material.opacity = sombre ? 0.35 : 0.16;
    boucle.children[0].material.opacity = sombre ? 0.7 : 0.35;
  }
  appliquerTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", appliquerTheme);
  new MutationObserver(appliquerTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  if (nuit) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 0.93));
    composer.addPass(new OutputPass());
  }

  // --- Caméra pilotée par le défilement ----------------------------------------
  const vues = VUES[ambiance];
  const ISO = new THREE.Vector3(14, 13, 14);
  const liste = [...stations].map((el) => ({ el, vue: vues[el.dataset.station] || vues.accueil }));
  const v0 = vues.accueil;
  const voulu = { cam: new THREE.Vector3(...(v0.cam || [0, 0, 0])), cible: new THREE.Vector3(...v0.cible), zoom: v0.zoom || 1 };
  const actuel = { cam: voulu.cam.clone(), cible: voulu.cible.clone(), zoom: voulu.zoom };
  const souris = new THREE.Vector2();
  const tmp = new THREE.Vector3();

  function calculerVoulu() {
    if (!liste.length) return;
    const milieu = innerHeight * 0.5;
    const centres = liste.map(({ el }) => { const r = el.getBoundingClientRect(); return r.top + r.height * 0.5; });
    let i = centres.findIndex((c) => c > milieu);
    if (i === -1) i = liste.length;
    const ia = Math.max(0, i - 1), ib = Math.min(liste.length - 1, i);
    const a = liste[ia].vue, b = liste[ib].vue;
    let t = centres[ib] === centres[ia] ? 0 : THREE.MathUtils.clamp((milieu - centres[ia]) / (centres[ib] - centres[ia]), 0, 1);
    t = t * t * (3 - 2 * t);
    if (a.cam) voulu.cam.set(...a.cam).lerp(tmp.set(...b.cam), t);
    voulu.cible.set(...a.cible).lerp(tmp.set(...b.cible), t);
    voulu.zoom = THREE.MathUtils.lerp(a.zoom || 1, b.zoom || 1, t);
  }

  let coucheVisee = -1;
  const allumerCouche = (i) => { coucheVisee = i; };
  const DEMI = 6.5;

  function redimensionner() {
    const l = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(l, h, false);
    composer?.setSize(l, h);
    const large = l > 900;
    if (iso) {
      camera.userData.ratio = l / h;
      camera.userData.decalage = large ? -DEMI * (l / h) * 0.3 : 0; // la scène se range à droite du texte
      camera.top = DEMI; camera.bottom = -DEMI;
    } else {
      camera.aspect = l / h;
      camera.fov = l < 700 ? 48 : 34;
      camera.filmOffset = large ? -7 : 0;
    }
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionner).observe(canvas);
  redimensionner();

  addEventListener("pointermove", (e) => souris.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5), { passive: true });
  addEventListener("scroll", calculerVoulu, { passive: true });
  addEventListener("resize", calculerVoulu);
  calculerVoulu();

  // --- Boucle de rendu ----------------------------------------------------------
  const horloge = new THREE.Clock();
  let enPause = false, id = 0;
  document.addEventListener("visibilitychange", () => {
    enPause = document.hidden;
    if (!enPause) { horloge.getDelta(); id = requestAnimationFrame(rendre); }
  });

  function rendre() {
    if (enPause) return;
    const dt = Math.min(horloge.getDelta(), 0.05);
    const temps = horloge.elapsedTime;
    const calme = reduit.matches;
    const k = calme ? 1 : 1 - Math.pow(0.0015, dt);

    actuel.cible.lerp(voulu.cible, k);
    actuel.zoom += (voulu.zoom - actuel.zoom) * k;
    if (iso) {
      camera.position.copy(actuel.cible).add(ISO);
      if (!calme) camera.position.add(tmp.set(souris.x * 0.6, 0, -souris.x * 0.6));
      camera.lookAt(actuel.cible);
      const r = camera.userData.ratio || 1, d = (camera.userData.decalage || 0) / actuel.zoom;
      camera.left = -DEMI * r + d; camera.right = DEMI * r + d;
      camera.zoom = actuel.zoom;
      camera.updateProjectionMatrix();
    } else {
      actuel.cam.lerp(voulu.cam, k);
      camera.position.copy(actuel.cam);
      if (!calme) camera.position.add(tmp.set(souris.x * 0.35, -souris.y * 0.2, 0));
      camera.lookAt(actuel.cible);
    }

    const tv = calme ? 0 : temps;
    vivants.forEach((o) => o.userData.animer(tv));
    agent.position.set(Math.sin(tv * 0.6) * 1.1, 1.62 + Math.sin(tv * 1.3) * 0.05, Math.cos(tv * 0.6) * 0.7);
    anneau.rotation.z = tv * 0.25;
    grandAgent.position.y = 3.1 + Math.sin(tv * 0.9) * 0.08;
    carte.position.y = 2.0 + Math.sin(tv * 0.8) * 0.06;

    couches.forEach((c, i) => {
      const but = i === coucheVisee ? (nuit ? 0.9 : 0.35) : (nuit ? 0.06 : 0);
      c.material.emissiveIntensity += (but - c.material.emissiveIntensity) * (calme ? 1 : 0.08);
      const y = 1.15 + i * 0.95 + (i === coucheVisee && !calme ? 0.12 : 0);
      c.position.y += (y - c.position.y) * (calme ? 1 : 0.08);
    });

    if (composer) composer.render(); else renderer.render(scene, camera);
    id = requestAnimationFrame(rendre);
  }
  id = requestAnimationFrame(rendre);

  return { allumerCouche, detruire() { cancelAnimationFrame(id); renderer.dispose(); pmrem.dispose(); } };
}

// --- Fond : dégradés doux --------------------------------------------------------
function fondDegrade(sombre, ambiance) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 640;
  const g = c.getContext("2d");
  const base = ambiance === "maquette" ? (sombre ? "#1d1f22" : "#EDE9E1") : jeton("--brume", sombre ? "#17181A" : "#E8E6E1");
  g.fillStyle = ambiance === "flux" ? "#1C2026" : base; g.fillRect(0, 0, c.width, c.height);
  const tache = (x, y, r, teinte, a) => {
    const col = new THREE.Color(teinte), rgba = (al) => `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},${al})`;
    const d = g.createRadialGradient(x * c.width, y * c.height, 0, x * c.width, y * c.height, r * c.width);
    d.addColorStop(0, rgba(a)); d.addColorStop(1, rgba(0)); g.fillStyle = d; g.fillRect(0, 0, c.width, c.height);
  };
  if (ambiance === "flux") {
    tache(0.7, 0.3, 0.65, "#4A5B70", 0.95); tache(0.85, 0.8, 0.35, "#C9A84C", 0.12); tache(0.2, 0.9, 0.4, "#3E5A44", 0.25);
  } else if (ambiance === "maquette") {
    tache(0.75, 0.2, 0.55, sombre ? "#2b2d31" : "#ffffff", 0.9); tache(0.1, 0.9, 0.5, "#9FD3D6", 0.25); tache(0.95, 0.9, 0.4, "#F2A97E", 0.22);
  } else {
    tache(0.72, 0.18, 0.55, sombre ? "#34363b" : "#ffffff", 0.95);
    tache(0.12, 0.95, 0.6, jeton("--argile", "#D8CCBA"), sombre ? 0.5 : 0.85);
    tache(0.92, 0.85, 0.35, jeton("--or", "#C9A84C"), sombre ? 0.18 : 0.22);
    tache(0.35, 0.1, 0.3, jeton("--mousse", "#5D7757"), 0.1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// --- Carte de déclaration (verre + texte) ------------------------------------------
function carteDeclaration(m) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.95, 0.05, 6, 0.024), m.verre("#ffffff")));
  const c = document.createElement("canvas"); c.width = 600; c.height = 380;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(255,255,255,0.9)"; x.beginPath(); x.roundRect(0, 0, 600, 380, 34); x.fill();
  x.fillStyle = "#8C7A3E"; x.font = "500 26px 'JetBrains Mono', monospace"; x.fillText("DÉCLARATION · EXEMPLE", 40, 66);
  x.fillStyle = "#333"; x.font = "500 40px 'Hanken Grotesk', sans-serif"; x.fillText("Écart de cote : 2 mm", 40, 150);
  x.fillStyle = "#5F5D58"; x.font = "400 28px 'Hanken Grotesk', sans-serif";
  x.fillText("Caisson bas 1 200 × 720 × 580", 40, 205); x.fillText("Source : mesuré sur le relevé", 40, 248);
  x.fillStyle = "#C9A84C"; x.beginPath(); x.roundRect(40, 292, 230, 52, 26); x.fill();
  x.fillStyle = "#1E1E20"; x.font = "600 24px 'Hanken Grotesk', sans-serif"; x.fillText("À arbitrer", 92, 326);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.9), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
  face.position.z = 0.03; g.add(face);
  return g;
}

// --- Panneau d’agent flottant (ambiance B) -----------------------------------------
function panneauAgent(titre, ligne) {
  const c = document.createElement("canvas"); c.width = 520; c.height = 200;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(30,32,36,0.72)"; x.beginPath(); x.roundRect(0, 0, 520, 200, 30); x.fill();
  x.strokeStyle = "rgba(255,255,255,0.18)"; x.lineWidth = 2; x.stroke();
  x.fillStyle = "#D4B45A"; x.beginPath(); x.arc(44, 56, 9, 0, 7); x.fill();
  x.fillStyle = "#A6A39B"; x.font = "500 24px 'JetBrains Mono', monospace"; x.fillText(titre, 70, 64);
  x.fillStyle = "#ECEAE5"; x.font = "500 36px 'Hanken Grotesk', sans-serif"; x.fillText(ligne, 36, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
}
