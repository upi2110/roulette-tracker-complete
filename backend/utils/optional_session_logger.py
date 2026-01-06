"""
OPTIONAL SESSION LOGGING WRAPPER
Add to backend to enable auto-saving WITHOUT breaking existing code

HOW TO USE:
1. This is OPTIONAL - system works fine without it
2. Only add if you want auto-save feature
3. Can be enabled/disabled easily
"""

import sys
import os

# This import will fail gracefully if session_logger doesn't exist
try:
    from utils.session_logger import SessionLogger
    LOGGING_AVAILABLE = True
except ImportError:
    LOGGING_AVAILABLE = False
    print("ℹ️  Session logging not available (install session_logger.py to enable)")


class OptionalSessionLogger:
    """
    Optional session logger that safely wraps SessionLogger
    If SessionLogger not available, methods do nothing (no errors)
    """
    
    def __init__(self, enabled=False):
        """
        enabled: Set to True to enable logging, False to disable
        """
        self.enabled = enabled and LOGGING_AVAILABLE
        self.logger = None
        
        if self.enabled:
            self.logger = SessionLogger()
            print("📝 Session logging ENABLED")
        else:
            if not LOGGING_AVAILABLE:
                print("ℹ️  Session logging DISABLED (module not found)")
            else:
                print("ℹ️  Session logging DISABLED (set enabled=True to activate)")
    
    def start_session(self, casino_name="Unknown"):
        """Start new session - does nothing if disabled"""
        if self.enabled and self.logger:
            return self.logger.start_new_session(casino_name)
        return None
    
    def log_spin(self, number, direction="C"):
        """Log a spin - does nothing if disabled"""
        if self.enabled and self.logger:
            self.logger.log_spin(number, direction)
    
    def log_prediction(self, predicted, actual, hit, confidence, bet_amount=0):
        """Log a prediction - does nothing if disabled"""
        if self.enabled and self.logger:
            self.logger.log_prediction(predicted, actual, hit, confidence, bet_amount)
    
    def save_session(self, final_bankroll=0, session_profit=0):
        """Save session - does nothing if disabled"""
        if self.enabled and self.logger:
            self.logger.update_session_stats(final_bankroll, session_profit)
            return self.logger.save_session()
        return None


# Global instance - disabled by default
# To enable: session_logger.enabled = True
session_logger = OptionalSessionLogger(enabled=False)


def enable_session_logging():
    """Enable session logging"""
    global session_logger
    if LOGGING_AVAILABLE:
        session_logger = OptionalSessionLogger(enabled=True)
        return True
    return False


def disable_session_logging():
    """Disable session logging"""
    global session_logger
    session_logger = OptionalSessionLogger(enabled=False)


# Example usage in your existing code:
if __name__ == '__main__':
    # Your existing code works fine without any changes
    print("System works normally")
    
    # If you want to enable logging:
    # session_logger = OptionalSessionLogger(enabled=True)
    # session_logger.start_session("My Casino")
    # session_logger.log_spin(15, "C")
    # session_logger.save_session()