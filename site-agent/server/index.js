const { handleChatRequest } = require("./handleChatRequest");
const {
  chatOrchestrator,
  setKnowledgeProvider
} = require("./orchestrator/chatOrchestrator");
const {
  StaticKnowledgeProvider,
  PassthroughKnowledgeProvider
} = require("./knowledge/StaticKnowledgeProvider");
const {
  loadDeepseekApiKey,
  loadGoogleServiceAccountJson,
  resolveRepoSecretsDir
} = require("./secretsLoader");
const serverConfig = require("../config/server.config.json");

module.exports = {
  handleChatRequest,
  chatOrchestrator,
  setKnowledgeProvider,
  StaticKnowledgeProvider,
  PassthroughKnowledgeProvider,
  loadDeepseekApiKey,
  loadGoogleServiceAccountJson,
  resolveRepoSecretsDir,
  serverConfig
};
