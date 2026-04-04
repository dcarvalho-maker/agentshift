#!/bin/bash
# ============================================================
#  AgentShift — Script de deploiement multi-agents sur Hostinger
#  Usage : ssh root@[IP_HOSTINGER] puis executer ce script
#  Prerequis : OpenClaw installe (template one-click Hostinger)
# ============================================================

set -e

GREEN='\033[0;32m'
GOLD='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GOLD}==============================${NC}"
echo -e "${GOLD}  AgentShift — Deploiement Multi-Agents${NC}"
echo -e "${GOLD}==============================${NC}"
echo ""

# ETAPE 1 : Verification
echo -e "${GREEN}[1/7] Verification de l'environnement...${NC}"

if ! command -v openclaw &> /dev/null; then
    echo -e "${RED}ERREUR: OpenClaw n'est pas installe.${NC}"
    echo "Installe-le d'abord via le template one-click Hostinger"
    exit 1
fi

echo "  OK OpenClaw detecte"

# ETAPE 2 : Cloner le repo
echo ""
echo -e "${GREEN}[2/7] Clonage du repo AgentShift...${NC}"

REPO_DIR="/opt/agentshift"

if [ -d "$REPO_DIR" ]; then
    echo "  -> Repo deja present, mise a jour..."
    cd "$REPO_DIR"
    git pull origin main 2>/dev/null || echo "  Git pull echoue — continue avec la version locale"
else
    echo "  -> Clonage depuis GitHub..."
    git clone https://github.com/dcarvalho-maker/agentshift.git "$REPO_DIR"
fi

cd "$REPO_DIR"
echo "  OK Repo pret dans $REPO_DIR"

# ETAPE 3 : Creer les 7 agents
echo ""
echo -e "${GREEN}[3/7] Creation des agents OpenClaw...${NC}"

AGENTS=("bob" "marcel" "selma" "hugo" "raya" "noa" "vigile")

for agent in "${AGENTS[@]}"; do
    if openclaw agents list 2>/dev/null | grep -q "$agent"; then
        echo "  -> $agent existe deja, skip"
    else
        openclaw agents add "$agent" 2>/dev/null && echo "  OK $agent cree" || echo "  Erreur creation $agent"
    fi
done

# ETAPE 4 : Copier les SOUL.md
echo ""
echo -e "${GREEN}[4/7] Copie des SOUL.md vers OpenClaw...${NC}"

OPENCLAW_DIR="$HOME/.openclaw/.agents"

for agent in "${AGENTS[@]}"; do
    SOURCE="$REPO_DIR/bob/agents/$agent/soul.md"
    DEST="$OPENCLAW_DIR/$agent/soul.md"

    if [ -f "$SOURCE" ]; then
        mkdir -p "$OPENCLAW_DIR/$agent"
        cp "$SOURCE" "$DEST"
        echo "  OK $agent/soul.md copie"
    else
        echo "  $SOURCE introuvable"
    fi
done

# ETAPE 5 : Copier openclaw.json
echo ""
echo -e "${GREEN}[5/7] Configuration openclaw.json...${NC}"

OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"

if [ -f "$REPO_DIR/openclaw.json" ]; then
    cp "$REPO_DIR/openclaw.json" "$OPENCLAW_CONFIG"
    echo "  OK openclaw.json installe"
else
    echo "  openclaw.json non trouve dans le repo"
fi

# ETAPE 6 : Configurer le .env
echo ""
echo -e "${GREEN}[6/7] Verification du fichier .env...${NC}"

ENV_FILE="$HOME/.openclaw/credentials/.env"
mkdir -p "$HOME/.openclaw/credentials"

if [ -f "$ENV_FILE" ]; then
    echo "  OK .env existe deja"
else
    cat > "$ENV_FILE" << 'ENVEOF'
# AgentShift — Variables d'environnement
ANTHROPIC_API_KEY=sk-ant-REMPLACE_MOI
OPENCLAW_OWNER_PHONE=+33XXXXXXXXX
OPENCLAW_OWNER_EMAIL=d.carvalho@l2concept.com
CALENDLY_LINK=https://calendly.com/REMPLACE_MOI
ENVEOF
    echo "  OK .env cree avec template"
    echo -e "  ${RED}IMPORTANT : edite $ENV_FILE avec tes vraies cles !${NC}"
fi

# ETAPE 7 : Configurer les cron jobs
echo ""
echo -e "${GREEN}[7/7] Configuration des cron jobs...${NC}"

CRON_MARKER="# AgentShift auto-sync"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
    echo "  -> Cron jobs deja configures, skip"
else
    (crontab -l 2>/dev/null; cat << 'CRONEOF'

# AgentShift auto-sync
0 * * * * cd /opt/agentshift && git pull origin main 2>/dev/null
30 5 * * * openclaw run bob "Prepare le brief matinal et envoie-le a David par email"
0 4 * * * openclaw run vigile "Fais ta veille IA du jour et transmets le resume a Bob"
0 */6 * * * cd /opt/agentshift && git add bob/sync-log.json 2>/dev/null && git commit -m "sync: auto-update" 2>/dev/null && git push 2>/dev/null
CRONEOF
    ) | crontab -
    echo "  OK Cron jobs installes"
fi

echo ""
echo -e "${GOLD}==============================${NC}"
echo -e "${GOLD}  Deploiement termine !${NC}"
echo -e "${GOLD}==============================${NC}"
echo ""
echo "  Prochaines etapes :"
echo "  1. nano $ENV_FILE"
echo "  2. openclaw channels connect whatsapp"
echo "  3. openclaw gateway --daemon"
echo "  4. Teste avec un message WhatsApp"
echo ""
echo -e "${GREEN}  Cout estime : ~0.70 EUR/jour = 21 EUR/mois${NC}"
