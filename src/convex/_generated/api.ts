// Generated locally (no Convex login). Mirrors convex's api.ts shape.
import { makeFunctionReference } from "convex/server";

export const api = {
  "admin": {
    "access": makeFunctionReference("admin:access"),
    "claimOwner": makeFunctionReference("admin:claimOwner"),
    "overview": makeFunctionReference("admin:overview"),
    "users": makeFunctionReference("admin:users"),
    "updateUser": makeFunctionReference("admin:updateUser"),
    "deleteUser": makeFunctionReference("admin:deleteUser"),
    "updateConfig": makeFunctionReference("admin:updateConfig"),
    "updateLevels": makeFunctionReference("admin:updateLevels"),
    "taskAdmin": makeFunctionReference("admin:taskAdmin"),
    "createTask": makeFunctionReference("admin:createTask"),
    "setTaskStatus": makeFunctionReference("admin:setTaskStatus"),
    "reviewTask": makeFunctionReference("admin:reviewTask"),
    "withdrawalsAdmin": makeFunctionReference("admin:withdrawalsAdmin"),
    "decideWithdrawal": makeFunctionReference("admin:decideWithdrawal"),
    "broadcast": makeFunctionReference("admin:broadcast"),
    "auditLog": makeFunctionReference("admin:auditLog"),
  },
  "app": {
    "ensure": makeFunctionReference("app:ensure"),
    "snapshot": makeFunctionReference("app:snapshot"),
    "claimMiningPopup": makeFunctionReference("app:claimMiningPopup"),
    "startMining": makeFunctionReference("app:startMining"),
    "startExtraMining": makeFunctionReference("app:startExtraMining"),
    "pauseMining": makeFunctionReference("app:pauseMining"),
    "heartbeatMining": makeFunctionReference("app:heartbeatMining"),
    "stopMining": makeFunctionReference("app:stopMining"),
    "settleMiningNow": makeFunctionReference("app:settleMiningNow"),
    "updatePreferences": makeFunctionReference("app:updatePreferences"),
    "reportProblem": makeFunctionReference("app:reportProblem"),
    "history": makeFunctionReference("app:history"),
    "taskFeed": makeFunctionReference("app:taskFeed"),
  },
  "bot": {
    "runConsoleCommand": makeFunctionReference("bot:runConsoleCommand"),
    "overview": makeFunctionReference("bot:overview"),
    "updateSettings": makeFunctionReference("bot:updateSettings"),
    "registerWebhook": makeFunctionReference("bot:registerWebhook"),
  },
  "growth": {
    "overview": makeFunctionReference("growth:overview"),
  },
  "leaderboard": {
    "rankings": makeFunctionReference("leaderboard:rankings"),
  },
  "levels": {
    "progress": makeFunctionReference("levels:progress"),
    "claim": makeFunctionReference("levels:claim"),
  },
  "miningAds": {
    "requestAd": makeFunctionReference("miningAds:requestAd"),
    "confirmFromClient": makeFunctionReference("miningAds:confirmFromClient"),
  },
  "notifications": {
    "list": makeFunctionReference("notifications:list"),
    "markRead": makeFunctionReference("notifications:markRead"),
    "markAllRead": makeFunctionReference("notifications:markAllRead"),
  },
  "payments": {
    "status": makeFunctionReference("payments:status"),
    "createDeposit": makeFunctionReference("payments:createDeposit"),
    "verifyDeposit": makeFunctionReference("payments:verifyDeposit"),
  },
  "pool": {
    "overview": makeFunctionReference("pool:overview"),
    "workers": makeFunctionReference("pool:workers"),
    "payouts": makeFunctionReference("pool:payouts"),
    "seedDemo": makeFunctionReference("pool:seedDemo"),
    "addWorker": makeFunctionReference("pool:addWorker"),
    "setWorkerStatus": makeFunctionReference("pool:setWorkerStatus"),
    "markPayoutPaid": makeFunctionReference("pool:markPayoutPaid"),
    "updateEconomics": makeFunctionReference("pool:updateEconomics"),
  },
  "publishing": {
    "templates": makeFunctionReference("publishing:templates"),
    "preview": makeFunctionReference("publishing:preview"),
    "listAutomations": makeFunctionReference("publishing:listAutomations"),
    "upsertAutomation": makeFunctionReference("publishing:upsertAutomation"),
    "deleteAutomation": makeFunctionReference("publishing:deleteAutomation"),
    "approvePost": makeFunctionReference("publishing:approvePost"),
    "runNow": makeFunctionReference("publishing:runNow"),
    "segmentCounts": makeFunctionReference("publishing:segmentCounts"),
    "sendSegment": makeFunctionReference("publishing:sendSegment"),
  },
  "recovery": {
    "recoveryPreview": makeFunctionReference("recovery:recoveryPreview"),
    "mergeDuplicateAccount": makeFunctionReference("recovery:mergeDuplicateAccount"),
  },
  "recoveryRetire": {
    "retireDuplicateAccount": makeFunctionReference("recoveryRetire:retireDuplicateAccount"),
  },
  "referrals": {
    "applyCode": makeFunctionReference("referrals:applyCode"),
    "recordShareOpen": makeFunctionReference("referrals:recordShareOpen"),
    "summary": makeFunctionReference("referrals:summary"),
  },
  "reports": {
    "adminReports": makeFunctionReference("reports:adminReports"),
  },
  "tasks": {
    "submit": makeFunctionReference("tasks:submit"),
    "verifyTask": makeFunctionReference("tasks:verifyTask"),
  },
  "telegram": {
    "linkTelegram": makeFunctionReference("telegram:linkTelegram"),
  },
  "telegramControl": {
    "overview": makeFunctionReference("telegramControl:overview"),
    "botInfo": makeFunctionReference("telegramControl:botInfo"),
    "updateBotProfile": makeFunctionReference("telegramControl:updateBotProfile"),
    "getCommands": makeFunctionReference("telegramControl:getCommands"),
    "publishCommands": makeFunctionReference("telegramControl:publishCommands"),
    "defaultCommands": makeFunctionReference("telegramControl:defaultCommands"),
    "listDestinations": makeFunctionReference("telegramControl:listDestinations"),
    "addDestination": makeFunctionReference("telegramControl:addDestination"),
    "checkDestination": makeFunctionReference("telegramControl:checkDestination"),
    "removeDestination": makeFunctionReference("telegramControl:removeDestination"),
    "publishPost": makeFunctionReference("telegramControl:publishPost"),
    "listPosts": makeFunctionReference("telegramControl:listPosts"),
    "listDeliveries": makeFunctionReference("telegramControl:listDeliveries"),
  },
  "telegramLibrary": {
    "catalog": makeFunctionReference("telegramLibrary:catalog"),
    "preview": makeFunctionReference("telegramLibrary:preview"),
  },
  "terminal": {
    "data": makeFunctionReference("terminal:data"),
  },
  "users": {
    "currentUser": makeFunctionReference("users:currentUser"),
  },
  "wallet": {
    "connectWallet": makeFunctionReference("wallet:connectWallet"),
    "disconnectWallet": makeFunctionReference("wallet:disconnectWallet"),
    "eligibility": makeFunctionReference("wallet:eligibility"),
    "requestWithdrawal": makeFunctionReference("wallet:requestWithdrawal"),
  },
} as any;

export const internal = {
  "admin": {
    "assertOperator": makeFunctionReference("admin:assertOperator"),
  },
  "bot": {
    "handleIncoming": makeFunctionReference("bot:handleIncoming"),
    "recordWebhookRegistration": makeFunctionReference("bot:recordWebhookRegistration"),
  },
  "levels": {
    "seedLadder": makeFunctionReference("levels:seedLadder"),
  },
  "migrations": {
    "publishStarterMissions": makeFunctionReference("migrations:publishStarterMissions"),
    "applyMonetagAdTask": makeFunctionReference("migrations:applyMonetagAdTask"),
    "applyTikTokLevelGate": makeFunctionReference("migrations:applyTikTokLevelGate"),
    "applyNanoMiningScale": makeFunctionReference("migrations:applyNanoMiningScale"),
    "applyDailyLimit": makeFunctionReference("migrations:applyDailyLimit"),
    "applyVerifiedMiningEconomy": makeFunctionReference("migrations:applyVerifiedMiningEconomy"),
    "applyProgression": makeFunctionReference("migrations:applyProgression"),
    "applyLaunchMiningRate": makeFunctionReference("migrations:applyLaunchMiningRate"),
  },
  "miningAds": {
    "recordMonetagPostback": makeFunctionReference("miningAds:recordMonetagPostback"),
    "finalizeExtensionSessions": makeFunctionReference("miningAds:finalizeExtensionSessions"),
  },
  "payments": {
    "getDeposit": makeFunctionReference("payments:getDeposit"),
    "settleDeposit": makeFunctionReference("payments:settleDeposit"),
    "pendingDeposits": makeFunctionReference("payments:pendingDeposits"),
    "expireStaleDeposits": makeFunctionReference("payments:expireStaleDeposits"),
    "reconcileDeposits": makeFunctionReference("payments:reconcileDeposits"),
  },
  "publishing": {
    "collectStats": makeFunctionReference("publishing:collectStats"),
    "getAutomation": makeFunctionReference("publishing:getAutomation"),
    "seedAutomation": makeFunctionReference("publishing:seedAutomation"),
    "dueAutomations": makeFunctionReference("publishing:dueAutomations"),
    "recordRun": makeFunctionReference("publishing:recordRun"),
    "runAutomation": makeFunctionReference("publishing:runAutomation"),
    "runDueAutomations": makeFunctionReference("publishing:runDueAutomations"),
    "resolveSegment": makeFunctionReference("publishing:resolveSegment"),
  },
  "referrals": {
    "recoverFromBotLog": makeFunctionReference("referrals:recoverFromBotLog"),
  },
  "tasks": {
    "verificationContext": makeFunctionReference("tasks:verificationContext"),
    "markCompletion": makeFunctionReference("tasks:markCompletion"),
    "grantTaskReward": makeFunctionReference("tasks:grantTaskReward"),
    "createCompletion": makeFunctionReference("tasks:createCompletion"),
  },
  "telegram": {
    "resolveTelegramSignIn": makeFunctionReference("telegram:resolveTelegramSignIn"),
    "attachIdentity": makeFunctionReference("telegram:attachIdentity"),
    "push": makeFunctionReference("telegram:push"),
  },
  "telegramControl": {
    "deliverPost": makeFunctionReference("telegramControl:deliverPost"),
    "findDestination": makeFunctionReference("telegramControl:findDestination"),
    "getDestinations": makeFunctionReference("telegramControl:getDestinations"),
    "getPost": makeFunctionReference("telegramControl:getPost"),
    "createPost": makeFunctionReference("telegramControl:createPost"),
    "beginDelivery": makeFunctionReference("telegramControl:beginDelivery"),
    "finishDelivery": makeFunctionReference("telegramControl:finishDelivery"),
    "markPostProcessing": makeFunctionReference("telegramControl:markPostProcessing"),
    "finalizePost": makeFunctionReference("telegramControl:finalizePost"),
    "upsertDestination": makeFunctionReference("telegramControl:upsertDestination"),
    "markDestinationError": makeFunctionReference("telegramControl:markDestinationError"),
    "replaceCommands": makeFunctionReference("telegramControl:replaceCommands"),
    "audit": makeFunctionReference("telegramControl:audit"),
  },
  "wallet": {
    "verifyChain": makeFunctionReference("wallet:verifyChain"),
    "withdrawalContext": makeFunctionReference("wallet:withdrawalContext"),
    "setChainVerification": makeFunctionReference("wallet:setChainVerification"),
  },
} as any;

export const components = {} as any;
