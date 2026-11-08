#!/usr/bin/env python3
"""Génère les trois propositions depuis gabarit.html. Lancer depuis direction-3d/ :
    python3 outils/generer-pages.py
Modifier le contenu dans gabarit.html, jamais dans les pages générées."""
from pathlib import Path

PROPOSITIONS = [
    {"fichier": "atelier.html",  "LETTRE": "A", "NOM": "Atelier sous verre",   "AMBIANCE": "atelier",  "THEME": "",
     "ACCROCHE": "Copilotes en service sur votre matière"},
    {"fichier": "flux.html",     "LETTRE": "B", "NOM": "Salle des flux",       "AMBIANCE": "flux",     "THEME": ' data-theme="dark"',
     "ACCROCHE": "La boucle tourne : circuler, calculer, déclarer"},
    {"fichier": "maquette.html", "LETTRE": "C", "NOM": "Maquette d’architecte","AMBIANCE": "maquette", "THEME": "",
     "ACCROCHE": "Votre organisation, vue d’en haut"},
]

ici = Path(__file__).resolve().parent.parent
gabarit = (ici / "gabarit.html").read_text(encoding="utf-8")
for p in PROPOSITIONS:
    page = gabarit
    for cle, valeur in p.items():
        page = page.replace("{{" + cle + "}}", valeur)
    assert "{{" not in page, f"jeton non remplacé dans {p['fichier']}"
    page = page.replace("<!doctype html>", "<!doctype html>\n<!-- Page générée par outils/generer-pages.py : modifier gabarit.html -->", 1)
    (ici / p["fichier"]).write_text(page, encoding="utf-8")
    print("écrit", p["fichier"])
