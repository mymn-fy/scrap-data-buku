console.log('[Book Scraper] Content script loaded.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
        chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            func: () => ({
                ok: true,
                message: 'Scraping is handled by the popup context.'
            })
        }).then((results) => {
            sendResponse(results?.[0]?.result || { error: 'No result returned.' });
        }).catch((error) => {
            console.error('[Book Scraper] Scraping message failed:', error);
            sendResponse({ error: error.message });
        });

        return true;
    }
});
