// Compatibility shim — canonical file lives in ui/ai-prediction-panel/.
// Kept in app/ so app/result-testing-panel.js's
// `require('./ai-prediction-panel-core.js')` keeps resolving the same
// class instance (Node's module cache makes the re-export identity-equal).
module.exports = require('../ui/ai-prediction-panel/ai-prediction-panel-core.js');
