"""
European Roulette Calculation Engine
Core logic shared between desktop app and AI backend
"""

import json
import os
from pathlib import Path

# Paths to shared data
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'shared' / 'data'
EXPORTS_DIR = PROJECT_ROOT / 'shared' / 'exports'

class RouletteEngine:
    """Core roulette calculation engine"""
    
    WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
    
    def __init__(self):
        self.spins = []
        
    def add_spin(self, number, direction='C'):
        """Add a new spin"""
        self.spins.append({'number': number, 'direction': direction})
        
    def load_session(self, filename):
        """Load session from shared data directory"""
        filepath = DATA_DIR / filename
        with open(filepath, 'r') as f:
            data = json.load(f)
            self.spins = data.get('spins', [])
            
    def save_session(self, filename):
        """Save session to shared data directory"""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        filepath = DATA_DIR / filename
        with open(filepath, 'w') as f:
            json.dump({'spins': self.spins}, f, indent=2)
            
    def get_statistics(self):
        """Calculate statistics"""
        return {
            'total_spins': len(self.spins),
            'unique_numbers': len(set(s['number'] for s in self.spins))
        }

if __name__ == '__main__':
    print("✅ Roulette Engine loaded successfully!")
    print(f"📂 Data directory: {DATA_DIR}")
    print(f"📂 Exports directory: {EXPORTS_DIR}")
    
    # Test
    engine = RouletteEngine()
    engine.add_spin(21, 'C')
    engine.add_spin(12, 'AC')
    print(f"📊 Stats: {engine.get_statistics()}")
