import { DEFAULT_RULES } from './config.js';

// On extension installation, set the default rules in storage.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ copyRules: DEFAULT_RULES });
    console.log('[Book Scraper] Default copy rules have been set.');
  }
});

/**
 * Retrieves copy calculation rules from storage.
 * @returns {Promise<Array<Object>>} A promise that resolves to the array of rules.
 */
export async function getCopyRules() {
  const data = await chrome.storage.local.get('copyRules');
  return data.copyRules || DEFAULT_RULES;
}

/**
 * Saves copy calculation rules to storage.
 * @param {Array<Object>} rules The rules to save.
 * @returns {Promise<void>}
 */
export async function saveCopyRules(rules) {
  return chrome.storage.local.set({ copyRules: rules });
}
