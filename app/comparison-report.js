// Compatibility shim — canonical file lives in reports/comparison-report/.
// Kept in app/ so app/result-testing-panel.js's three lazy
// `require('./comparison-report')` lookups keep resolving the same
// class instance (Node's module cache makes the re-export
// identity-equal).
module.exports = require('../reports/comparison-report/comparison-report.js');
