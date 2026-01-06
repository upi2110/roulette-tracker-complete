#!/usr/bin/env python3
"""
AI TRAINING SCRIPT - WITH VERSION CONTROL
Trains AI on ALL sessions in training_data/ folder
Keeps backup versions so you can rollback if needed
"""

import sys
import os
import json
import shutil
from datetime import datetime
from pathlib import Path

# Add backend to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from analysis.ai_trainer_updated import AITrainer
from utils.session_logger import SessionLogger


class AITrainerWithVersionControl:
    """AI Trainer with version control and rollback capability"""
    
    def __init__(self):
        self.trainer = AITrainer()
        self.models_dir = 'models'
        self.training_data_dir = 'training_data'
        
        # Ensure directories exist
        Path(self.models_dir).mkdir(parents=True, exist_ok=True)
        Path(self.training_data_dir).mkdir(parents=True, exist_ok=True)
    
    def list_available_versions(self):
        """List all saved model versions"""
        if not os.path.exists(self.models_dir):
            return []
        
        versions = [
            f for f in os.listdir(self.models_dir)
            if f.startswith('ai_learned_patterns_v') and f.endswith('.json')
        ]
        
        return sorted(versions, reverse=True)
    
    def backup_current_model(self):
        """Backup current model before training new one"""
        current_model = os.path.join(self.models_dir, 'ai_learned_patterns.json')
        
        if not os.path.exists(current_model):
            print("ℹ️  No current model to backup")
            return None
        
        # Create version filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Find next version number
        versions = self.list_available_versions()
        if versions:
            # Extract version numbers
            version_nums = []
            for v in versions:
                try:
                    num = int(v.split('_v')[1].split('_')[0])
                    version_nums.append(num)
                except:
                    pass
            next_version = max(version_nums) + 1 if version_nums else 1
        else:
            next_version = 1
        
        backup_filename = f'ai_learned_patterns_v{next_version}_{timestamp}.json'
        backup_path = os.path.join(self.models_dir, backup_filename)
        
        # Copy current model to backup
        shutil.copy2(current_model, backup_path)
        
        print(f"💾 Backed up current model to: {backup_filename}")
        
        return backup_path
    
    def load_all_training_sessions(self):
        """Load all training sessions from training_data/ folder"""
        logger = SessionLogger(self.training_data_dir)
        sessions = logger.load_all_sessions()
        
        if not sessions:
            print(f"❌ No training sessions found in {self.training_data_dir}/")
            print(f"   Please add session files to this folder first.")
            return None
        
        print(f"📂 Found {len(sessions)} training sessions:")
        total_spins = 0
        for session in sessions:
            spins = len(session.get('spins', []))
            total_spins += spins
            print(f"   - {session['session_id']}: {spins} spins")
        
        print(f"\n   Total training spins: {total_spins}")
        
        return sessions
    
    def train_new_model(self):
        """Train new AI model on all available data"""
        print("="*60)
        print("🎓 AI TRAINING WITH VERSION CONTROL")
        print("="*60)
        print()
        
        # Step 1: Backup current model
        print("Step 1: Backing up current model...")
        self.backup_current_model()
        print()
        
        # Step 2: Load all training data
        print("Step 2: Loading training data...")
        sessions = self.load_all_training_sessions()
        
        if not sessions:
            return None
        
        print()
        
        # Step 3: Train AI
        print("Step 3: Training AI...")
        learned_data = self.trainer.train_ai(
            sessions, 
            save_path=os.path.join(self.models_dir, 'ai_learned_patterns.json')
        )
        
        print()
        print("="*60)
        print("✅ TRAINING COMPLETE!")
        print("="*60)
        print(f"New model saved: {self.models_dir}/ai_learned_patterns.json")
        print(f"Backup versions available: {len(self.list_available_versions())}")
        print()
        
        return learned_data
    
    def rollback_to_version(self, version_file):
        """Rollback to a previous model version"""
        version_path = os.path.join(self.models_dir, version_file)
        current_path = os.path.join(self.models_dir, 'ai_learned_patterns.json')
        
        if not os.path.exists(version_path):
            print(f"❌ Version not found: {version_file}")
            return False
        
        # Backup current before rollback
        if os.path.exists(current_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_backup = os.path.join(self.models_dir, f'ai_learned_patterns_temp_{timestamp}.json')
            shutil.copy2(current_path, temp_backup)
            print(f"💾 Current model backed up to: {os.path.basename(temp_backup)}")
        
        # Copy version to current
        shutil.copy2(version_path, current_path)
        
        print(f"✅ Rolled back to: {version_file}")
        
        # Show version info
        with open(current_path, 'r') as f:
            data = json.load(f)
            print(f"   Training date: {data.get('timestamp', 'unknown')}")
            print(f"   Baseline accuracy: {data.get('baseline_accuracy', 0):.1f}%")
            print(f"   Patterns learned: {len(data.get('pattern_scores', {}))}")
        
        return True
    
    def compare_versions(self):
        """Compare current model with available versions"""
        current_path = os.path.join(self.models_dir, 'ai_learned_patterns.json')
        
        if not os.path.exists(current_path):
            print("❌ No current model found")
            return
        
        with open(current_path, 'r') as f:
            current = json.load(f)
        
        print("="*60)
        print("📊 MODEL VERSION COMPARISON")
        print("="*60)
        print()
        print(f"CURRENT MODEL:")
        print(f"  Training date: {current.get('timestamp', 'unknown')}")
        print(f"  Accuracy: {current.get('baseline_accuracy', 0):.1f}%")
        print(f"  Training spins: {current.get('total_training_spins', 0)}")
        print(f"  Patterns: {len(current.get('pattern_scores', {}))}")
        print()
        
        versions = self.list_available_versions()
        if versions:
            print(f"AVAILABLE BACKUP VERSIONS ({len(versions)}):")
            for i, version_file in enumerate(versions, 1):
                version_path = os.path.join(self.models_dir, version_file)
                try:
                    with open(version_path, 'r') as f:
                        data = json.load(f)
                    
                    print(f"\n{i}. {version_file}")
                    print(f"   Training date: {data.get('timestamp', 'unknown')}")
                    print(f"   Accuracy: {data.get('baseline_accuracy', 0):.1f}%")
                    print(f"   Training spins: {data.get('total_training_spins', 0)}")
                    print(f"   Patterns: {len(data.get('pattern_scores', {}))}")
                except Exception as e:
                    print(f"   Error reading version: {e}")
        else:
            print("No backup versions available yet")
        
        print()


def main():
    print("="*60)
    print("🎓 ROULETTE AI TRAINING SYSTEM")
    print("   WITH VERSION CONTROL & ROLLBACK")
    print("="*60)
    print()
    
    trainer = AITrainerWithVersionControl()
    
    # Show menu
    print("OPTIONS:")
    print("1. Train new model (with backup)")
    print("2. Compare model versions")
    print("3. Rollback to previous version")
    print("4. List all versions")
    print()
    
    choice = input("Enter choice (1-4, or press Enter for option 1): ").strip()
    
    if choice == '' or choice == '1':
        # Train new model
        learned_data = trainer.train_new_model()
        
        if learned_data:
            print("\n" + "="*60)
            print("📈 TRAINING SUMMARY")
            print("="*60)
            print(f"Baseline Accuracy: {learned_data['baseline_accuracy']:.1f}%")
            print(f"Random Accuracy: {(12/37)*100:.1f}%")
            print(f"AI Advantage: {learned_data['baseline_accuracy'] - (12/37)*100:+.1f}%")
            print(f"Patterns Analyzed: {len(learned_data['pattern_scores'])}")
            print(f"Training Data: {learned_data['total_training_spins']} spins")
            print()
            print("💡 TIP: If you're not happy with results, you can rollback:")
            print("   python3 train_ai.py  (then choose option 3)")
            print()
    
    elif choice == '2':
        # Compare versions
        trainer.compare_versions()
    
    elif choice == '3':
        # Rollback
        versions = trainer.list_available_versions()
        if not versions:
            print("❌ No backup versions available")
            return
        
        print("Available versions:")
        for i, v in enumerate(versions, 1):
            print(f"{i}. {v}")
        print()
        
        try:
            selection = int(input("Enter version number to rollback to: "))
            if 1 <= selection <= len(versions):
                trainer.rollback_to_version(versions[selection - 1])
            else:
                print("❌ Invalid selection")
        except ValueError:
            print("❌ Invalid input")
    
    elif choice == '4':
        # List versions
        versions = trainer.list_available_versions()
        if versions:
            print(f"Found {len(versions)} backup versions:")
            for v in versions:
                print(f"  - {v}")
        else:
            print("No backup versions available yet")
    
    else:
        print("❌ Invalid choice")


if __name__ == '__main__':
    main()