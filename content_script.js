console.log('[Book Scraper] Content script loaded.');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
        console.log('[Book Scraper] Received scrape request from popup.');
        
        // Inject and run the extractor script in the page's context
        // This allows the script to access page's JS variables and functions
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/extractor.js');
        script.type = 'module';

        script.onload = () => {
            // The extractor script will run itself. We can't directly get its return value.
            // A more robust way would be for the extractor to post a message.
            // For simplicity, we'll re-implement a simplified call here.
            // This is a common challenge with Manifest V3's isolated worlds.
            
            // A better approach for Manifest V3:
            chrome.scripting.executeScript({
                target: { tabId: request.tabId },
                function: getPageData,
            }, (injectionResults) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    sendResponse({ error: chrome.runtime.lastError.message });
                    return;
                }
                for (const frameResult of injectionResults) {
                    sendResponse(frameResult.result);
                }
            });
        };
        
        // This is a simplified trigger. The real work is done via scripting.executeScript
        // because it's the correct Manifest V3 way to get a return value.
        chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            files: ['scripts/utils.js', 'scripts/config.js', 'scripts/extractor_for_injection.js']
        }).then(injectionResults => {
             if (injectionResults && injectionResults.length > 0) {
                sendResponse(injectionResults[0].result);
            }
        }).catch(err => {
            console.error("Scraping failed:", err);
            sendResponse({error: err.toString()});
        });

        return true; // Indicates that the response is sent asynchronously
    }
});

// Note: The extractor.js file needs a slight modification to be injectable this way.
// Let's create a dedicated file for injection.

// Create a new file `scripts/extractor_for_injection.js`
// It's almost identical to extractor.js but wrapped in a function.
// The manifest does not need to list this file.

// This is a placeholder to show the concept. The actual logic is in extractor.js
// which we will adapt. For now, let's assume `content_script.js` can trigger it.
// The provided `manifest.json` and `popup.js` will use the `scripting` API which is the modern way.
