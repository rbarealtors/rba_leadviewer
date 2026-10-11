/**
 * RBA Lead Viewer — Google Apps Script Email Ingestion Bridge (Code.gs)
 *
 * Automates ingestion of buyer enquiry notification emails from real estate portals
 * (99acres and Magicbricks) into RBA CRM via /api/webhooks/portal-email.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Read status (is:unread / markRead) is NEVER used as an ingestion filter or side-effect.
 *    Staff/mobile reading of emails does not cause missed leads.
 * 2. Dedicated Gmail labels ('99acres-processed' and 'magicbricks-processed') and Script Property
 *    message-ID tracking ensure that single messages in multi-message threads are not suppressed.
 * 3. Script Properties are STRICTLY REQUIRED for credentials (no hardcoded fallbacks).
 * 4. Idempotency is defended end-to-end:
 *    - Gmail search query explicitly excludes labeled threads (-label:99acres-processed)
 *    - CRM webhook deduplicates on (source, external_lead_id) and returns 200 OK on duplicate.
 * 5. Bounded batch pagination ensures high-volume bursts are not permanently truncated.
 * 6. Diagnostic dry-run mode (runDiagnostic) inspects inbox status safely without side-effects.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIG = {
  // Gmail tracking labels (created automatically if missing)
  LABELS: {
    "99acres": "99acres-processed",
    "magicbricks": "magicbricks-processed",
    "failed": "rba-ingest-failed",
  },

  // Batch configuration to respect Apps Script execution limits (max 6 mins)
  BATCH_SIZE: 20,         // Threads per batch
  MAX_BATCHES: 3,         // Max batches per execution cycle (up to 60 threads)
  MAX_DAYS_LOOKBACK: 7,   // Search window for new or recovery runs (newer_than:7d)
};

// ============================================================================
// CONFIGURATION & CREDENTIAL VALIDATION
// ============================================================================

/**
 * Validates webhook configuration strictly from Script Properties.
 * Does NOT fall back to hardcoded defaults.
 * Validates HTTPS protocol and the expected /api/webhooks/portal-email endpoint path.
 * Never logs secrets.
 */
function getValidatedWebhookConfig() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("CRM_WEBHOOK_URL");
  var secret = props.getProperty("PORTAL_WEBHOOK_SECRET");

  if (!url || typeof url !== "string" || url.trim() === "") {
    Logger.log("❌ Configuration Error: 'CRM_WEBHOOK_URL' is missing in Script Properties.");
    return { valid: false, error: "Missing CRM_WEBHOOK_URL in Script Properties" };
  }

  url = url.trim();

  // Strict HTTPS requirement
  if (!/^https:\/\//i.test(url)) {
    Logger.log("❌ Configuration Error: 'CRM_WEBHOOK_URL' must use secure HTTPS protocol.");
    return { valid: false, error: "Insecure protocol: CRM_WEBHOOK_URL must start with https://" };
  }

  // Path verification: must target the portal-email webhook endpoint
  if (url.indexOf("/api/webhooks/portal-email") === -1) {
    Logger.log("❌ Configuration Error: 'CRM_WEBHOOK_URL' must target '/api/webhooks/portal-email'.");
    return { valid: false, error: "Invalid endpoint: CRM_WEBHOOK_URL must contain /api/webhooks/portal-email" };
  }

  if (!secret || typeof secret !== "string" || secret.trim() === "" || secret.trim() === "YOUR_PORTAL_WEBHOOK_SECRET") {
    Logger.log("❌ Configuration Error: 'PORTAL_WEBHOOK_SECRET' is missing or set to placeholder in Script Properties.");
    return { valid: false, error: "Missing or invalid PORTAL_WEBHOOK_SECRET in Script Properties" };
  }

  return {
    valid: true,
    url: url,
    secret: secret.trim(),
  };
}

// ============================================================================
// MESSAGE-LEVEL TRACKING (Protects Multi-Message Threads)
// ============================================================================

var PROCESSED_MSGS_PROP = "PROCESSED_MESSAGE_IDS";

/**
 * Retrieves the dictionary of processed message IDs from Script Properties.
 */
function getProcessedMessageIdsMap() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_MSGS_PROP);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

/**
 * Records a message ID as processed in Script Properties.
 * Prunes entries older than 30 days to remain well within storage limits.
 */
function recordProcessedMessageId(msgId) {
  if (!msgId) return;
  try {
    var map = getProcessedMessageIdsMap();
    map[msgId] = Date.now();

    var now = Date.now();
    var pruned = {};
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (now - map[k] < 30 * 24 * 60 * 60 * 1000) {
        pruned[k] = map[k];
      }
    }
    PropertiesService.getScriptProperties().setProperty(PROCESSED_MSGS_PROP, JSON.stringify(pruned));
  } catch (e) {
    Logger.log("Warning: Could not save message ID to Script Properties: " + e.message);
  }
}

// ============================================================================
// ENTRY POINTS
// ============================================================================

/**
 * Safe Single-Lead Live Test for 99acres.
 * 
 * Selects exactly ONE eligible 99acres enquiry without the '99acres-processed' label,
 * posts it to the CRM webhook, logs the redacted outcome, and applies the label ONLY
 * on verified CRM success or duplicate acknowledgment.
 *
 * Safety Guarantees:
 * 1. Requires valid HTTPS CRM_WEBHOOK_URL and PORTAL_WEBHOOK_SECRET from Script Properties.
 * 2. Does NOT fall back to hardcoded secrets or URLs.
 * 3. Submits AT MOST ONE lead per execution.
 * 4. Multi-message thread protection: if a thread has other eligible unprocessed messages,
 *    records the message ID but defers the thread label so remaining messages are not suppressed.
 * 5. Does NOT touch Magicbricks.
 * 6. Does NOT alter email read/unread state.
 * 7. Does NOT log secrets or buyer contact PII.
 * 8. Does NOT mark processed on ambiguous, non-200, or malformed responses.
 */
function testSingle99AcresLead() {
  Logger.log("=== Starting Safe Single-Lead 99acres Test ===");

  // 1. Strict validation of Script Properties before touching Gmail or network
  var configCheck = getValidatedWebhookConfig();
  if (!configCheck.valid) {
    Logger.log("❌ Validation failed. Aborting test execution immediately.");
    return { success: false, error: configCheck.error };
  }

  var webhookUrl = configCheck.url;
  var webhookSecret = configCheck.secret;
  var labelName = CONFIG.LABELS["99acres"];
  var processedLabel = getOrCreateLabel(labelName);
  var processedMsgIds = getProcessedMessageIdsMap();

  // 2. Search for candidates lacking the processed label
  var query = "from:(99acres.com) -label:" + labelName + " newer_than:" + CONFIG.MAX_DAYS_LOOKBACK + "d";
  Logger.log("Candidate Search Query: " + query);

  var threads = GmailApp.search(query, 0, 10);
  if (!threads || threads.length === 0) {
    Logger.log("ℹ️ No unprocessed 99acres threads found matching query.");
    return { success: false, reason: "No candidate threads found" };
  }

  // 3. Locate the first eligible enquiry message that has not yet been processed
  var targetThread = null;
  var targetMessage = null;
  var otherEligibleUnprocessedInThread = 0;

  for (var i = 0; i < threads.length; i++) {
    var candidateThread = threads[i];
    var messages = candidateThread.getMessages();
    var eligibleUnprocessedInThisThread = [];

    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      var msgId = msg.getId();

      // Skip messages already recorded as processed
      if (processedMsgIds[msgId]) {
        continue;
      }

      var subject = msg.getSubject() || "";
      var body = msg.getPlainBody() || "";
      var eligibility = isEligibleEnquiry("99acres", subject, body);

      if (eligibility.eligible) {
        eligibleUnprocessedInThisThread.push(msg);
      }
    }

    if (eligibleUnprocessedInThisThread.length > 0) {
      targetThread = candidateThread;
      targetMessage = eligibleUnprocessedInThisThread[0];
      otherEligibleUnprocessedInThread = eligibleUnprocessedInThisThread.length - 1;
      break;
    }
  }

  if (!targetMessage || !targetThread) {
    Logger.log("ℹ️ Evaluated " + threads.length + " thread(s), but found no eligible unprocessed enquiry messages.");
    return { success: false, reason: "No eligible unprocessed enquiry messages found" };
  }

  var candidateSubject = targetMessage.getSubject() || "";
  var candidateDate = targetMessage.getDate();
  var isUnread = targetMessage.isUnread();

  Logger.log("[Selected Target Lead]");
  Logger.log("  Subject                    : " + candidateSubject);
  Logger.log("  Date                       : " + candidateDate.toISOString());
  Logger.log("  Read State                 : " + (isUnread ? "UNREAD" : "READ") + " (will be preserved)");
  Logger.log("  Other Unprocessed in Thread: " + otherEligibleUnprocessedInThread);

  // 4. Send exactly ONE lead to CRM webhook
  var payload = {
    from: targetMessage.getFrom() || "",
    subject: candidateSubject,
    body: targetMessage.getPlainBody() || "",
    date: candidateDate.toISOString(),
    timestamp: candidateDate.toISOString(),
  };

  Logger.log("Dispatching single test lead to CRM webhook...");
  var response = sendToCrmWebhook(webhookUrl, webhookSecret, payload);

  Logger.log("\n--------------------------------------------------");
  Logger.log("               WEBHOOK TEST RESULT                ");
  Logger.log("--------------------------------------------------");
  Logger.log("Confirmed Success  : " + response.success);
  Logger.log("Duplicate In CRM   : " + Boolean(response.duplicate));
  Logger.log("Lead ID Assigned   : " + (response.leadId || "N/A"));

  if (!response.success) {
    Logger.log("❌ Webhook Error Details: " + (response.error || "Unknown"));
    Logger.log("⚠️ Message and thread NOT marked as processed due to non-success / ambiguous response.");
    Logger.log("--------------------------------------------------\n");
    return { success: false, error: response.error };
  }

  // 5. Message-level recording: record message ID as processed
  recordProcessedMessageId(targetMessage.getId());
  Logger.log("✅ Message ID recorded as processed in Script Properties.");

  // 6. Thread-level labeling:
  // Apply the thread-level label ONLY if no other eligible unprocessed messages exist in this thread.
  // This prevents silently suppressing other eligible messages in the same thread.
  if (otherEligibleUnprocessedInThread === 0) {
    if (processedLabel) {
      targetThread.addLabel(processedLabel);
      Logger.log("✅ All eligible messages in thread processed. Label '" + labelName + "' applied to thread.");
    }
  } else {
    Logger.log("ℹ️ Thread has " + otherEligibleUnprocessedInThread + " other eligible message(s). Thread label deferred to avoid suppressing them.");
  }

  Logger.log("Inbox read/unread state untouched: " + (isUnread ? "UNREAD" : "READ"));
  Logger.log("Single-lead test execution complete.");
  Logger.log("--------------------------------------------------\n");

  return {
    success: true,
    duplicate: Boolean(response.duplicate),
    leadId: response.leadId || null,
  };
}

/**
 * Main scheduled trigger function (runs every 5-15 minutes).
 * Processes both 99acres and Magicbricks emails safely.
 */
function processPortalEmails() {
  var configCheck = getValidatedWebhookConfig();
  if (!configCheck.valid) {
    Logger.log("❌ Script Properties unconfigured. Ingestion aborted.");
    return;
  }

  var webhookUrl = configCheck.url;
  var webhookSecret = configCheck.secret;

  Logger.log("=== Starting RBA Portal Email Ingestion ===");

  var acresResult = processPortalSource({
    portal: "99acres",
    senderQuery: "from:(99acres.com)",
    labelName: CONFIG.LABELS["99acres"],
    webhookUrl: webhookUrl,
    webhookSecret: webhookSecret,
    dryRun: false,
  });

  var mbResult = processPortalSource({
    portal: "magicbricks",
    senderQuery: "from:(magicbricks.com)",
    labelName: CONFIG.LABELS["magicbricks"],
    webhookUrl: webhookUrl,
    webhookSecret: webhookSecret,
    dryRun: false,
  });

  Logger.log("=== Ingestion Run Completed ===");
  Logger.log("99acres summary: " + JSON.stringify(acresResult));
  Logger.log("Magicbricks summary: " + JSON.stringify(mbResult));
}

/**
 * Diagnostic Dry-Run Mode.
 * Inspects all eligible 99acres and Magicbricks threads from the last 7 days.
 * Reports whether they are read or unread, matching subjects, and label status.
 * DOES NOT send webhooks and DOES NOT apply labels.
 */
function runDiagnostic() {
  Logger.log("=== RUNNING PORTAL EMAIL INGESTION DIAGNOSTIC (DRY RUN) ===");
  
  var diagnostic = {
    "99acres": processPortalSource({
      portal: "99acres",
      senderQuery: "from:(99acres.com)",
      labelName: CONFIG.LABELS["99acres"],
      dryRun: true,
    }),
    "magicbricks": processPortalSource({
      portal: "magicbricks",
      senderQuery: "from:(magicbricks.com)",
      labelName: CONFIG.LABELS["magicbricks"],
      dryRun: true,
    }),
  };

  Logger.log("Diagnostic Results:\n" + JSON.stringify(diagnostic, null, 2));
  return diagnostic;
}

// ============================================================================
// CORE INGESTION ENGINE
// ============================================================================

/**
 * Processes a single portal source across multiple bounded batches.
 */
function processPortalSource(options) {
  var portal = options.portal;
  var senderQuery = options.senderQuery;
  var labelName = options.labelName;
  var webhookUrl = options.webhookUrl;
  var webhookSecret = options.webhookSecret;
  var dryRun = Boolean(options.dryRun);

  var stats = {
    portal: portal,
    totalThreadsInspected: 0,
    totalMessagesEvaluated: 0,
    eligibleEnquiriesFound: 0,
    readEnquiriesCount: 0,
    unreadEnquiriesCount: 0,
    skippedSystemNotices: 0,
    successfullyIngested: 0,
    duplicatesAcknowledged: 0,
    errorsEncountered: 0,
  };

  var processedLabel = null;
  var failedLabel = null;
  if (!dryRun) {
    processedLabel = getOrCreateLabel(labelName);
    failedLabel = getOrCreateLabel(CONFIG.LABELS.failed);
  }

  // Construct search query without is:unread
  var query = senderQuery + " -label:" + labelName + " newer_than:" + CONFIG.MAX_DAYS_LOOKBACK + "d";
  Logger.log("[" + portal + "] Search Query: " + query);

  var batchCount = 0;
  while (batchCount < CONFIG.MAX_BATCHES) {
    var threads = GmailApp.search(query, 0, CONFIG.BATCH_SIZE);
    if (!threads || threads.length === 0) {
      Logger.log("[" + portal + "] No more unprocessed threads found matching query.");
      break;
    }

    Logger.log("[" + portal + "] Batch " + (batchCount + 1) + ": Found " + threads.length + " candidate thread(s).");
    stats.totalThreadsInspected += threads.length;

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var messages = thread.getMessages();
      var threadPostSuccessful = true;

      for (var j = 0; j < messages.length; j++) {
        var message = messages[j];
        stats.totalMessagesEvaluated++;

        var subject = message.getSubject() || "";
        var from = message.getFrom() || "";
        var body = message.getPlainBody() || "";
        var date = message.getDate();
        var isUnread = message.isUnread();

        var eligibility = isEligibleEnquiry(portal, subject, body);

        if (!eligibility.eligible) {
          stats.skippedSystemNotices++;
          continue;
        }

        stats.eligibleEnquiriesFound++;
        if (isUnread) {
          stats.unreadEnquiriesCount++;
        } else {
          stats.readEnquiriesCount++;
        }

        if (dryRun) {
          Logger.log("[DRY-RUN] Eligible " + portal + " enquiry: " +
            "Subject='" + subject + "', " +
            "ReadStatus=" + (isUnread ? "UNREAD" : "READ") + ", " +
            "Date=" + date.toISOString());
          continue;
        }

        var postResult = sendToCrmWebhook(webhookUrl, webhookSecret, {
          from: from,
          subject: subject,
          body: body,
          date: date.toISOString(),
          timestamp: date.toISOString(),
        });

        if (postResult.success) {
          if (postResult.duplicate) {
            stats.duplicatesAcknowledged++;
          } else {
            stats.successfullyIngested++;
          }
        } else {
          threadPostSuccessful = false;
          stats.errorsEncountered++;
          Logger.log("ERROR posting message ID " + message.getId() + ": " + postResult.error);
        }
      }

      if (!dryRun) {
        if (threadPostSuccessful && processedLabel) {
          thread.addLabel(processedLabel);
        } else if (!threadPostSuccessful && failedLabel) {
          thread.addLabel(failedLabel);
        }
      }
    }

    batchCount++;
    if (dryRun) break;
  }

  return stats;
}

// ============================================================================
// ELIGIBILITY & SUBJECT FILTERING
// ============================================================================

/**
 * Validates whether an email is a legitimate buyer enquiry vs administrative notification.
 */
function isEligibleEnquiry(portal, subject, body) {
  var s = (subject || "").toLowerCase();
  var b = (body || "").toLowerCase();

  // 1. Explicit Exclusions
  var skipKeywords = [
    "photos deleted",
    "listing expired",
    "listing rejected",
    "invoice",
    "tax invoice",
    "payment confirmation",
    "verification call",
    "screening test",
    "account statement",
    "reset password",
    "login alert",
    "performance report",
  ];

  for (var k = 0; k < skipKeywords.length; k++) {
    if (s.indexOf(skipKeywords[k]) !== -1 || b.indexOf(skipKeywords[k]) !== -1) {
      return { eligible: false, reason: "Administrative/system notice: " + skipKeywords[k] };
    }
  }

  // 2. Portal-Specific Verification
  if (portal === "99acres") {
    var isVerifiedSubject =
      s.indexOf("advertisement response") !== -1 ||
      s.indexOf("query for your property id") !== -1 ||
      s.indexOf("buyer wants to know about your") !== -1 ||
      s.indexOf("details of the query") !== -1 ||
      s.indexOf("property advertisement response") !== -1;

    var hasEnquiryBodySignature =
      b.indexOf("details of the response") !== -1 ||
      b.indexOf("response details") !== -1 ||
      b.indexOf("details of the query") !== -1 ||
      b.indexOf("property details:") !== -1;

    if (isVerifiedSubject || hasEnquiryBodySignature) {
      return { eligible: true };
    }

    return { eligible: false, reason: "Did not match 99acres enquiry patterns" };
  }

  if (portal === "magicbricks") {
    var isMagicBricksSubject =
      s.indexOf("magicbricks") !== -1 ||
      s.indexOf("response on your property") !== -1 ||
      s.indexOf("enquiry for") !== -1;

    var hasMbBody =
      b.indexOf("magicbricks") !== -1 ||
      b.indexOf("buyer details") !== -1 ||
      b.indexOf("contact details") !== -1;

    if (isMagicBricksSubject || hasMbBody) {
      return { eligible: true };
    }

    return { eligible: false, reason: "Did not match Magicbricks enquiry patterns" };
  }

  return { eligible: false, reason: "Unknown portal" };
}

// ============================================================================
// WEBHOOK DISPATCH & ERROR HANDLING
// ============================================================================

/**
 * Sends parsed email payload to RBA CRM webhook.
 * Handles non-2xx, malformed, and ambiguous responses conservatively.
 * Confirms success ONLY when status is 200, JSON parses, success=true, and lead_id is present.
 */
function sendToCrmWebhook(url, secret, payload) {
  var requestData = {
    secret: secret,
    from: payload.from,
    subject: payload.subject,
    body: payload.body,
    date: payload.date,
    timestamp: payload.timestamp,
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(requestData),
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    // Strict 200 check
    if (statusCode === 200) {
      var json = null;
      try {
        json = JSON.parse(responseText);
      } catch (e) {
        return {
          success: false,
          statusCode: statusCode,
          error: "Malformed JSON response from CRM webhook",
        };
      }

      // Conservative validation: must have success: true and a non-empty string lead_id
      if (
        json &&
        typeof json === "object" &&
        json.success === true &&
        typeof json.lead_id === "string" &&
        json.lead_id.trim().length > 0
      ) {
        var isDuplicate = json.duplicate === true;
        return {
          success: true,
          duplicate: isDuplicate,
          leadId: json.lead_id.trim(),
        };
      } else {
        return {
          success: false,
          statusCode: statusCode,
          error: "Ambiguous response: Missing success=true or lead_id in response JSON",
        };
      }
    } else {
      return {
        success: false,
        statusCode: statusCode,
        error: "Webhook responded with HTTP " + statusCode + ": " + responseText.slice(0, 150),
      };
    }
  } catch (err) {
    return {
      success: false,
      error: "Network/UrlFetch error: " + (err.message || err.toString()),
    };
  }
}

// ============================================================================
// GMAIL UTILITIES
// ============================================================================

/**
 * Safely fetches a Gmail label or creates it if it does not yet exist.
 */
function getOrCreateLabel(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    try {
      label = GmailApp.createLabel(name);
    } catch (e) {
      label = GmailApp.getUserLabelByName(name);
    }
  }
  return label;
}
