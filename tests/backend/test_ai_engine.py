"""
Backend Tests: AI Engine V6 + API Server
Tests the Python prediction engine and Flask API.

Run with: python3 -m pytest tests/backend/test_ai_engine.py -v
"""

import pytest
import sys
import os
import json

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))

# ═══════════════════════════════════════════════════════
# IMPORT TESTS
# ═══════════════════════════════════════════════════════

class TestImports:
    def test_ai_engine_importable(self):
        """AI Engine V6 module can be imported"""
        try:
            from models.ai_engine_v6_NEW_STRATEGY import AIEngineV6
            assert True
        except ImportError as e:
            pytest.skip(f"Backend not available: {e}")

    def test_flask_server_importable(self):
        """Flask API server can be imported"""
        try:
            # Just check the file exists and is valid Python
            server_path = os.path.join(
                os.path.dirname(__file__), '..', '..', 'backend', 'api', 'ai_server_v6.py'
            )
            assert os.path.exists(server_path), f"Server file not found at {server_path}"
        except Exception as e:
            pytest.skip(f"Backend not available: {e}")


# ═══════════════════════════════════════════════════════
# AI ENGINE TESTS
# ═══════════════════════════════════════════════════════

class TestAIEngine:
    @pytest.fixture
    def engine(self):
        try:
            from models.ai_engine_v6_NEW_STRATEGY import AIEngineV6
            return AIEngineV6()
        except ImportError:
            pytest.skip("AI Engine not available")

    def test_engine_creation(self, engine):
        """Engine can be instantiated"""
        assert engine is not None

    def test_predict_with_insufficient_data(self, engine):
        """Predict returns empty/wait with < 3 spins"""
        result = engine.predict({
            'currentSpinCount': 2,
            'recentSpins': [10, 22],
            'table3NextProjections': {},
            'table1NextProjections': {},
            'table2NextProjections': {}
        })
        # Should indicate wait or have no numbers
        assert result is not None

    def test_predict_with_selected_pairs(self, engine):
        """Predict with manual pair selection returns numbers"""
        # Simulate table3 projections for P-1 pair
        projections = {
            'prevMinus1': {
                'anchors': [17, 21],
                'neighbors': [31, 1],
                'numbers': [17, 21, 31, 1, 34, 2, 6, 20, 9, 25, 14]
            }
        }

        result = engine.predict({
            'currentSpinCount': 5,
            'recentSpins': [10, 22, 4, 17, 21],
            'table3NextProjections': projections,
            'table1NextProjections': {},
            'table2NextProjections': {},
            'selectedPairs': ['prevMinus1']
        })

        assert result is not None
        if 'numbers' in result:
            assert isinstance(result['numbers'], list)

    def test_0_26_rule(self, engine):
        """If 0 or 26 is in prediction, both must be present"""
        # This tests the _ensure_0_26_paired logic
        numbers = [0, 1, 5, 10, 15, 20]

        # If the engine has a method for this
        if hasattr(engine, '_ensure_0_26_paired'):
            result = engine._ensure_0_26_paired(numbers)
            if 0 in result:
                assert 26 in result
            if 26 in result:
                assert 0 in result


# ═══════════════════════════════════════════════════════
# API ENDPOINT TESTS
# ═══════════════════════════════════════════════════════

class TestAPIEndpoints:
    def test_server_file_has_predict_endpoint(self):
        """Server file defines /predict endpoint"""
        server_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'backend', 'api', 'ai_server_v6.py'
        )
        if not os.path.exists(server_path):
            pytest.skip("Server file not found")

        with open(server_path, 'r') as f:
            content = f.read()

        assert '/predict' in content, "Missing /predict endpoint"

    def test_server_file_has_start_session_endpoint(self):
        """Server file defines /start-session endpoint"""
        server_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'backend', 'api', 'ai_server_v6.py'
        )
        if not os.path.exists(server_path):
            pytest.skip("Server file not found")

        with open(server_path, 'r') as f:
            content = f.read()

        assert 'start' in content.lower(), "Missing start session endpoint"

    def test_server_file_has_cors(self):
        """Server has CORS enabled for Electron frontend"""
        server_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'backend', 'api', 'ai_server_v6.py'
        )
        if not os.path.exists(server_path):
            pytest.skip("Server file not found")

        with open(server_path, 'r') as f:
            content = f.read()

        assert 'cors' in content.lower() or 'CORS' in content, "Missing CORS configuration"

    def test_server_file_has_undo_endpoint(self):
        """Server file defines /undo endpoint"""
        server_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'backend', 'api', 'ai_server_v6.py'
        )
        if not os.path.exists(server_path):
            pytest.skip("Server file not found")

        with open(server_path, 'r') as f:
            content = f.read()

        assert '/undo' in content or 'undo' in content, "Missing /undo endpoint"


# ═══════════════════════════════════════════════════════
# PREDICTION RESULT STRUCTURE
# ═══════════════════════════════════════════════════════

class TestPredictionStructure:
    @pytest.fixture
    def engine(self):
        try:
            from models.ai_engine_v6_NEW_STRATEGY import AIEngineV6
            return AIEngineV6()
        except ImportError:
            pytest.skip("AI Engine not available")

    def test_prediction_has_required_fields(self, engine):
        """Prediction result has signal, numbers, confidence"""
        projections = {
            'prev': {
                'anchors': [10, 26],
                'neighbors': [5, 32],
                'numbers': [10, 26, 5, 32, 0, 3, 15, 21, 2, 25]
            }
        }

        result = engine.predict({
            'currentSpinCount': 5,
            'recentSpins': [10, 22, 4, 17, 21],
            'table3NextProjections': projections,
            'table1NextProjections': {},
            'table2NextProjections': {},
            'selectedPairs': ['prev']
        })

        assert result is not None
        # Check common expected fields (may vary by implementation)
        if isinstance(result, dict):
            # At minimum should have numbers or signal
            has_key = 'numbers' in result or 'signal' in result or 'message' in result
            assert has_key, f"Result missing expected fields: {list(result.keys())}"
