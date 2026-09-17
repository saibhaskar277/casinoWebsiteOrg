/**
 * Thin Firebase/host shim — real implementation lives in site-agent/.
 * Keep this file so existing imports continue to work.
 */
module.exports = require("../../../site-agent/server/handleChatRequest");
