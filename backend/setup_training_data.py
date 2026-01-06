#!/usr/bin/env python3
"""
SETUP SCRIPT - Organize existing training data
Converts training_data.json to separate session files
"""

import json
import os
import shutil
from pathlib import Path


def setup_training_folders():
    """Create necessary folders"""
    folders = ['training_data', 'test_results', 'models']
    
    for folder in folders:
        Path(folder).mkdir(parents=True, exist_ok=True)
        print(f"✅ Created folder: {folder}/")


def convert_existing_training_data():
    """Convert analysis/training_data.json to separate files"""
    
    # Check if old format exists
    old_file = 'analysis/training_data.json'
    if not os.path.exists(old_file):
        print(f"ℹ️  No existing {old_file} found - starting fresh")
        return
    
    print(f"📂 Found existing {old_file}")
    print("   Converting to new format...")
    
    # Load old format
    with open(old_file, 'r') as f:
        data = json.load(f)
    
    sessions = data.get('sessions', [])
    
    if not sessions:
        print("   No sessions found in file")
        return
    
    # Save each session as separate file
    for i, session in enumerate(sessions, 1):
        session_id = session.get('session_id', f'historical_session_{i}')
        filename = f"{session_id}.json"
        filepath = os.path.join('training_data', filename)
        
        with open(filepath, 'w') as f:
            json.dump(session, f, indent=2)
        
        print(f"   ✅ Saved: {filename}")
    
    # Backup original file
    backup_file = 'analysis/training_data_backup.json'
    shutil.copy2(old_file, backup_file)
    print(f"\n💾 Original file backed up to: {backup_file}")
    print(f"   You can delete analysis/training_data.json now (it's backed up)")


def show_summary():
    """Show summary of training data"""
    print("\n" + "="*60)
    print("📊 TRAINING DATA SUMMARY")
    print("="*60)
    
    # Count training sessions
    training_files = []
    if os.path.exists('training_data'):
        training_files = [
            f for f in os.listdir('training_data')
            if f.endswith('.json')
        ]
    
    if training_files:
        print(f"\nTraining Sessions: {len(training_files)}")
        total_spins = 0
        for f in training_files:
            filepath = os.path.join('training_data', f)
            try:
                with open(filepath, 'r') as file:
                    session = json.load(file)
                    spins = len(session.get('spins', []))
                    total_spins += spins
                    print(f"  - {f}: {spins} spins")
            except:
                pass
        print(f"\nTotal training spins: {total_spins}")
    else:
        print("\nNo training sessions yet")
        print("Add session files to training_data/ folder")
    
    # Count test results
    test_files = []
    if os.path.exists('test_results'):
        test_files = [
            f for f in os.listdir('test_results')
            if f.endswith('.json')
        ]
    
    if test_files:
        print(f"\nTest Results: {len(test_files)}")
        print("(You can delete these manually when needed)")
    
    # Count model versions
    model_versions = []
    if os.path.exists('models'):
        model_versions = [
            f for f in os.listdir('models')
            if f.startswith('ai_learned_patterns_v')
        ]
    
    if model_versions:
        print(f"\nModel Versions: {len(model_versions)}")
        for v in sorted(model_versions, reverse=True)[:5]:  # Show latest 5
            print(f"  - {v}")
    
    print("\n" + "="*60)


def main():
    print("="*60)
    print("🔧 SETUP & ORGANIZE TRAINING DATA")
    print("="*60)
    print()
    
    # Step 1: Create folders
    print("Step 1: Creating folders...")
    setup_training_folders()
    print()
    
    # Step 2: Convert existing data
    print("Step 2: Converting existing training data...")
    convert_existing_training_data()
    print()
    
    # Step 3: Show summary
    show_summary()
    
    print("\n✅ Setup complete!")
    print("\nNext steps:")
    print("1. Add new sessions to training_data/ folder")
    print("2. Run: python3 train_ai.py")
    print("3. Test results go to test_results/ folder")
    print()


if __name__ == '__main__':
    main()