#!/bin/bash

echo "🎰 European Roulette Tracker - Complete Setup"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${BLUE}📋 Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found!${NC}"
    echo "Please install from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version) found${NC}"

# Check Python
echo -e "${BLUE}📋 Checking Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found!${NC}"
    echo "Please install from: https://www.python.org/"
    exit 1
fi
echo -e "${GREEN}✅ Python $(python3 --version | awk '{print $2}') found${NC}"
echo ""

# Install Node.js dependencies
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Node.js dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install Node.js dependencies${NC}"
    exit 1
fi
echo ""

# Setup Python environment
echo -e "${BLUE}🐍 Setting up Python environment...${NC}"
python3 -m venv python-env
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Python environment created${NC}"
else
    echo -e "${RED}❌ Failed to create Python environment${NC}"
    exit 1
fi

# Activate Python environment
source python-env/bin/activate

# Install Python packages
echo -e "${BLUE}📦 Installing Python packages...${NC}"
pip install --upgrade pip
pip install numpy pandas scikit-learn matplotlib seaborn jupyter

echo -e "${GREEN}✅ Python packages installed${NC}"
echo ""

# Create necessary directories
echo -e "${BLUE}📁 Creating project structure...${NC}"
mkdir -p shared/data shared/exports shared/configs
mkdir -p backend/models backend/analysis backend/api
mkdir -p docs tests/app tests/backend

echo -e "${GREEN}✅ Project structure created${NC}"
echo ""

# Success message
echo "=============================================="
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo "=============================================="
echo ""
echo -e "${BLUE}🚀 Next Steps:${NC}"
echo ""
echo "1. Run Desktop App:"
echo "   npm start"
echo ""
echo "2. For Python development:"
echo "   source python-env/bin/activate"
echo "   python backend/roulette_engine.py"
echo ""
echo "3. Read documentation:"
echo "   cat README.md"
echo ""
echo -e "${GREEN}Happy tracking! 🎰${NC}"
