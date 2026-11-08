// =============================================================================
// AgentShift · direction réaliste · vidéo pilotée par le défilement
//
// Chaque <section class="plan"> contient un <video data-defile> (et son poster).
// Tant que la section traverse l’écran, la position du défilement fixe l’instant
// de la vidéo : on avance dans le plan en faisant défiler la page.
// Moins de mouvement demandé, ou vidéo indisponible : l’image fixe reste.
//
// Chargement : une vidéo qui porte data-src ne se charge qu’à l’approche de sa
// section. Sur un petit écran, data-src-m désigne une version allégée.
// Les vidéos doivent être encodées avec une image clé fréquente (ffmpeg -g 2)
// pour que la recherche d’instant soit fluide.
// =============================================================================

const calme = matchMedia("(prefers-reduced-motion: reduce)");
const petitEcran = matchMedia("(max-width: 700px), (orientation: portrait) and (max-width: 900px)");

const plans = [...document.querySelectorAll(".plan")].map((section) => ({
  section,
  video: section.querySelector("video[data-defile]"),
  voulu: 0,
  actuel: 0,
  charge: false,
}));

function preparer(p) {
  const v = p.video;
  if (!v || p.charge) return;
  p.charge = true;
  if (calme.matches) return;                                  // l’image fixe suffit
  const source = v.querySelector("source");
  const src = (petitEcran.matches && v.dataset.srcM) || v.dataset.src || (source && source.src);
  if (!src) return;
  if (source) source.remove();
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.addEventListener("loadeddata", () => p.section.classList.add("video-prete"), { once: true });
  const demarrer = (url) => {
    v.src = url;
    // iOS ne décode la vidéo qu’après une première lecture : on la lance puis on l’arrête.
    v.play().then(() => v.pause()).catch(() => {});
  };
  // On charge la vidéo entière en mémoire : une URL blob se positionne à n’importe
  // quel instant, même quand le serveur ignore les requêtes partielles (Range),
  // ce que font le serveur local de Python et, sur ces fichiers, Cloudflare Pages.
  fetch(src)
    .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
    .then((b) => demarrer(URL.createObjectURL(b)))
    .catch(() => demarrer(src));
}

// Charger un écran et demi avant que la section n’arrive.
if ("IntersectionObserver" in window) {
  const guetteur = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      const p = plans.find((q) => q.section === e.target);
      if (p) { preparer(p); guetteur.unobserve(e.target); }
    });
  }, { rootMargin: "150% 0px" });
  plans.forEach((p) => p.video && guetteur.observe(p.section));
} else {
  plans.forEach(preparer);
}

function mesurer() {
  const h = innerHeight;
  plans.forEach((p) => {
    const r = p.section.getBoundingClientRect();
    const parcours = r.height - h;                            // la scène est collante sur ce trajet
    const t = parcours > 0 ? Math.min(1, Math.max(0, -r.top / parcours)) : 0;
    p.voulu = t;
    p.section.style.setProperty("--avance", t.toFixed(3));    // pour les panneaux en CSS
  });
}

function boucle() {
  plans.forEach((p) => {
    const v = p.video;
    if (!v || calme.matches || !v.duration) return;
    p.actuel += (p.voulu - p.actuel) * 0.12;                  // amorti : pas d’à-coups
    const instant = p.actuel * (v.duration - 0.05);
    if (Math.abs(v.currentTime - instant) > 0.03) v.currentTime = instant;
  });
  requestAnimationFrame(boucle);
}

addEventListener("scroll", mesurer, { passive: true });
addEventListener("resize", mesurer);
mesurer();
requestAnimationFrame(boucle);
