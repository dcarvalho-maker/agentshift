// =============================================================================
// AgentShift · direction réaliste · vidéo pilotée par le défilement
//
// Chaque <section class="plan"> contient un <video data-defile> (et son poster).
// Tant que la section traverse l’écran, la position du défilement fixe l’instant
// de la vidéo : on avance dans le plan en faisant défiler la page.
// Moins de mouvement demandé, ou vidéo indisponible : l’image fixe reste.
// Les vidéos doivent être encodées avec une image clé fréquente (ffmpeg -g 2)
// pour que la recherche d’instant soit fluide.
// =============================================================================

const calme = matchMedia("(prefers-reduced-motion: reduce)");
const plans = [...document.querySelectorAll(".plan")].map((section) => ({
  section,
  video: section.querySelector("video[data-defile]"),
  voulu: 0,
  actuel: 0,
}));

plans.forEach((p) => {
  if (!p.video) return;
  p.video.muted = true;
  p.video.playsInline = true;
  p.video.preload = "auto";
  p.video.pause();
  // iOS ne charge la vidéo qu’après une première lecture : on la lance puis on l’arrête.
  p.video.play().then(() => p.video.pause()).catch(() => {});
  p.video.addEventListener("loadeddata", () => p.section.classList.add("video-prete"), { once: true });
});

function mesurer() {
  const h = innerHeight;
  plans.forEach((p) => {
    const r = p.section.getBoundingClientRect();
    const parcours = r.height - h;                          // la scène est collante sur ce trajet
    const t = parcours > 0 ? Math.min(1, Math.max(0, -r.top / parcours)) : 0;
    p.voulu = t;
    p.section.style.setProperty("--avance", t.toFixed(3));  // pour les panneaux en CSS
  });
}

function boucle() {
  plans.forEach((p) => {
    const v = p.video;
    if (!v || calme.matches || !v.duration) return;
    p.actuel += (p.voulu - p.actuel) * 0.12;                // amorti : pas d’à-coups
    const instant = p.actuel * (v.duration - 0.05);
    if (Math.abs(v.currentTime - instant) > 0.03) v.currentTime = instant;
  });
  requestAnimationFrame(boucle);
}

addEventListener("scroll", mesurer, { passive: true });
addEventListener("resize", mesurer);
mesurer();
requestAnimationFrame(boucle);
