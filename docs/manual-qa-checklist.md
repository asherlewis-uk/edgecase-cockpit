# Edgecase Cockpit — Manual QA Checklist

> **Who this is for:** Non-technical testers, product owners, or QA staff verifying that the app works correctly before a release.
>
> **How to use this doc:** Open the app in a **fresh browser profile** (or clear all site data and `localStorage` first). Work through each numbered section. Mark Pass or Fail in the last column. If a step fails, stop and file a bug with the section number and step number.
>
> **What you need:**
>
> - A modern web browser (Chrome, Edge, Firefox, or Safari)
> - A valid API key for at least one provider (e.g., OpenAI) — optional for Sections 1–2, required for Sections 3–10
> - Basic familiarity with **browser DevTools** (developer tools) for offline and storage tests. We explain each DevTools step below.

---

## 1. First Launch / Onboarding

| Step | Action                                                                                     | Expected Result              | Pass Criteria                                                                                                                    | Fail Criteria                                                                |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1.1  | Open the app in a **fresh browser profile** (or clear `localStorage` and reload the page). | An onboarding modal appears. | The modal is visible with the title **"Welcome to Edgecase Cockpit"** and two buttons: **"Get Started"** and **"Skip for Now"**. | Modal does not appear, appears broken, or is visually misaligned/off-screen. |

> **Tip:** To clear `localStorage` in Chrome/Edge, open DevTools → **Application** tab → **Local Storage** → right-click the site URL → **Clear**. Then reload the page.

---

## 2. Onboarding Skip vs Complete

| Step | Action                                                                                                                                                     | Expected Result                          | Pass Criteria                                             | Fail Criteria                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2.1  | **Skip path:** Click **"Skip for Now"** in the onboarding modal.                                                                                           | The modal closes.                        | Modal disappears smoothly; the main chat page is visible. | Modal stays open, or app shows an error.                                      |
| 2.2  | After skipping, **reload the page**.                                                                                                                       | The app opens normally.                  | The **onboarding modal does NOT reappear**.               | Modal appears again (state was not saved).                                    |
| 2.3  | Clear `localStorage` again to reset. **Complete path:** Click **"Get Started"**, choose a provider, click **"Open Settings"**, enter an API key, and save. | Settings are saved and the modal closes. | Provider is configured and the modal is gone.             | Modal does not close, or provider setup is not offered.                       |
| 2.4  | After completing onboarding, **reload the page**.                                                                                                          | The app opens normally.                  | The **onboarding modal does NOT reappear**.               | Modal appears again (completion was not saved).                               |
| 2.5  | **Reset path:** Open the browser console (DevTools → **Console** tab) and type: `store.resetOnboarding()` then press Enter.                                | The onboarding modal reappears.          | Modal opens immediately after running the command.        | Modal does not appear, or console shows an error like `store is not defined`. |

> **Tip:** To open the console, press **F12** (or **Cmd+Option+J** on Mac, **Ctrl+Shift+J** on Windows) and click the **Console** tab.

---

## 3. Provider Setup

| Step | Action                                                                                                                | Expected Result                                                | Pass Criteria                                                                     | Fail Criteria                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 3.1  | Navigate to the **Settings** page by clicking **Settings** in the sidebar or visiting `/settings` in the address bar. | The Settings page loads.                                       | Provider cards (e.g., OpenAI, Anthropic, Google) are visible.                     | Page is blank, shows an error, or provider cards are missing.           |
| 3.2  | Click a provider card (e.g., **OpenAI**).                                                                             | The card expands or opens a detail view.                       | An input field for the **API key** is visible.                                    | Card does not respond, or input field is missing.                       |
| 3.3  | Type a valid API key into the input field.                                                                            | Text appears in the field (usually masked as dots).            | Key is entered without the app freezing.                                          | Input is unresponsive, or key is visible in plain text without masking. |
| 3.4  | Click the **Save** button.                                                                                            | A toast (small popup) appears at the bottom/top of the screen. | Toast says something like **"API key saved"** or **"Provider ready"**.            | No toast appears, or an error message is shown.                         |
| 3.5  | Look at the provider status indicator.                                                                                | Status updates to a ready state.                               | Text reads **"Ready to chat"** (or similar), often with a green dot or checkmark. | Status stays blank, says **"Needs API key"**, or shows an error.        |

> **Tip:** An **API key** is a secret password the app sends to the AI provider to prove it's allowed to use the service. If you don't have one, ask the dev team for a test key.

---

## 4. API Key Validation

| Step | Action                                                                                             | Expected Result                         | Pass Criteria                                                                                      | Fail Criteria                                                         |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 4.1  | With a saved key from Section 3, click the **Validate** button (shield icon) next to the provider. | Status briefly shows **"Validating…"**. | The validating state is visible for a moment.                                                      | No status change, or app freezes.                                     |
| 4.2  | Wait for validation to finish.                                                                     | Status changes to a final result.       | **Valid:** green checkmark or text like **"Valid"**. **Invalid:** red text like **"Invalid key"**. | Status stays on "Validating…" forever, or shows a confusing message.  |
| 4.3  | Clear the API key input field, then click **Save**.                                                | The provider status updates.            | Status changes to **"Needs API key"** or similar.                                                  | Status still says "Ready" or "Valid" even though the key was removed. |

> **Tip:** The **shield icon** is a small button shaped like a shield (🛡️) used to test whether the saved key actually works with the provider's servers.

---

## 5. Chat Readiness

| Step | Action                                                                                              | Expected Result      | Pass Criteria                                                                    | Fail Criteria                                                                |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 5.1  | Return to the **Chat** page by clicking **Chat** in the sidebar or visiting `/` in the address bar. | The chat page loads. | Status bar at the top/bottom shows the active provider name and model.           | Status bar is missing, blank, or shows wrong provider.                       |
| 5.2  | Read the greeting message below the status bar.                                                     | A greeting is shown. | If a provider is configured, it says something like **"Ask away, [name]!"**.     | Greeting is missing or generic with no provider info.                        |
| 5.3  | (Optional) Go to Settings and remove the API key, then return to Chat.                              | A warning is shown.  | A warning pill or button is visible, telling the user the provider is not ready. | No warning is shown, or the user is allowed to send messages that will fail. |

> **Tip:** The **status bar** is the colored strip at the top or bottom of the chat screen that shows whether you're online, offline, or if something is wrong.

---

## 6. Offline Queue

| Step | Action                                                                                                                                         | Expected Result                                       | Pass Criteria                                                                        | Fail Criteria                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 6.1  | Open **DevTools** → **Network** tab → set the network throttling dropdown to **"Offline"**. (Alternatively, disconnect your Wi-Fi / Ethernet.) | The browser is now simulating no internet connection. | The dropdown shows "Offline" or your Wi-Fi icon shows it's disconnected.             | Network is still active (test by loading another website). |
| 6.2  | Type a message in the chat input box and press **Enter**.                                                                                      | A toast or notification appears.                      | Toast says: **"You're offline. Messages will send when you reconnect."** or similar. | No toast, or the app crashes/hangs.                        |
| 6.3  | Look at the **StatusBar**.                                                                                                                     | It shows an offline state and a queue count.          | Text says something like **"You're offline — 1 message queued"**.                    | Status bar does not mention offline state or queue count.  |
| 6.4  | Try sending a second message while still offline.                                                                                              | Queue count increases.                                | Status bar updates to **"2 messages queued"**.                                       | Queue count stays at 1, or second message is lost.         |

> **Tip:** The **Network** tab is inside DevTools. After pressing F12, click **Network**, then look for a dropdown that normally says **"No throttling"** and change it to **"Offline"**.

---

## 7. Reconnect Sync

| Step | Action                                                                                                                     | Expected Result                                  | Pass Criteria                                                           | Fail Criteria                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 7.1  | Reconnect the network: set the DevTools Network dropdown back to **"No throttling"** (or reconnect your Wi-Fi / Ethernet). | Internet is restored.                            | Another website loads successfully to confirm connection is back.       | Network is still offline.                                |
| 7.2  | Wait a few seconds without touching the app.                                                                               | Queued messages auto-send.                       | A success toast appears: **"Your queued messages have been sent."**     | No toast appears, or messages are still shown as queued. |
| 7.3  | Look at the **StatusBar**.                                                                                                 | Queue count is gone.                             | Text no longer shows a queue count; it returns to normal online status. | Queue count is still showing 1 or more.                  |
| 7.4  | Scroll up in the chat history.                                                                                             | The sent messages appear with assistant replies. | All queued messages were delivered and received responses.              | Some messages are missing, or replies are absent.        |

---

## 8. Storage Failure

| Step | Action                                                                                                                                                                                                                         | Expected Result                                 | Pass Criteria                                                                                                     | Fail Criteria                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 8.1  | Open **DevTools** → **Application** tab → **Local Storage** → fill the storage with dummy data until it reaches the ~5 MB limit. (Advanced: ask a developer to temporarily override `localStorage.setItem` to throw an error.) | The browser's local storage is full or blocked. | You can see many dummy key-value pairs in the Local Storage list, or a developer confirms the override is active. | Storage is not actually full; the test is invalid.                                  |
| 8.2  | Send a message in the chat.                                                                                                                                                                                                    | An error message appears.                       | Error says: **"Message could not be saved. Free up space or try again."**                                         | App crashes, freezes, or shows a generic/technical error the user can't understand. |
| 8.3  | Clear the dummy data from Local Storage (or remove the developer override).                                                                                                                                                    | Storage is freed.                               | App returns to normal behavior.                                                                                   | App stays broken even after storage is freed.                                       |

> **Tip:** **Local Storage** is a small database inside the browser (about 5 MB) where the app saves your settings and chat history. If it's full, the app should warn you, not crash.

---

## 9. Thread Persistence

| Step | Action                                                                                                            | Expected Result                | Pass Criteria                                                                                   | Fail Criteria                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 9.1  | Create a new thread: press **Cmd+N** (Mac) or **Ctrl+N** (Windows/Linux), or click **"New chat"** in the sidebar. | A new empty chat thread opens. | Thread title is blank or says **"New chat"**; message area is empty.                            | No new thread is created, or the app jumps to an existing thread. |
| 9.2  | Send a few messages (user questions and assistant replies).                                                       | Messages appear in the chat.   | Both user and assistant messages are visible and in the correct order.                          | Messages are missing, out of order, or duplicated.                |
| 9.3  | Note the **thread title** that appears in the sidebar.                                                            | A title is generated or shown. | The sidebar lists the thread with a recognizable title (e.g., first few words of your message). | Thread has no title, or title is garbled.                         |
| 9.4  | **Reload the page** (press F5 or Cmd+R / Ctrl+R).                                                                 | The app restarts.              | The sidebar still shows the created thread with its title.                                      | Thread disappears from the list.                                  |
| 9.5  | Click the thread in the sidebar.                                                                                  | The thread opens.              | All previously sent messages (user and assistant) are present and readable.                     | Messages are missing, blank, or corrupted.                        |

---

## 10. Settings Persistence

| Step | Action                                                                        | Expected Result             | Pass Criteria                                                                              | Fail Criteria                                       |
| ---- | ----------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 10.1 | Go to **Settings** (`/settings`).                                             | The Settings page loads.    | All setting fields are visible and editable.                                               | Page is blank or settings are missing.              |
| 10.2 | Change the **Display Name** to a new name (e.g., "Tester").                   | Text appears in the field.  | New name is visible in the input.                                                          | Input is unresponsive.                              |
| 10.3 | Change the **Assistant Name** to a new name (e.g., "Botty").                  | Text appears in the field.  | New name is visible in the input.                                                          | Input is unresponsive.                              |
| 10.4 | Change the **Theme / Visual Mode** (e.g., from Light to Dark, or vice versa). | The UI updates immediately. | The app switches to the selected theme (colors change).                                    | Theme does not change, or change is not visible.    |
| 10.5 | Change the **Preferred Tone** (e.g., Casual, Professional, Concise).          | Selection is updated.       | The chosen tone is highlighted or shown in the dropdown.                                   | Tone does not change, or selection is lost.         |
| 10.6 | Click **Save** if required, then **reload the page**.                         | Settings are restored.      | All four changes (display name, assistant name, theme, tone) are exactly as you left them. | Any setting reverted to its old value after reload. |

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut                                                          | Action                         |
| ----------------------------------------------------------------- | ------------------------------ |
| **Cmd + N** (Mac) / **Ctrl + N** (Windows/Linux)                  | Create a new chat thread       |
| **Cmd + R** (Mac) / **Ctrl + R** (Windows/Linux) or **F5**        | Reload the page                |
| **F12** (or **Cmd + Option + J** / **Ctrl + Shift + J**)          | Open browser DevTools          |
| **Cmd + Option + J** (Mac) / **Ctrl + Shift + J** (Windows/Linux) | Open DevTools Console directly |

### Console Commands

> Open the **Console** tab in DevTools and paste these commands to manipulate onboarding state.

| Command                      | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `store.completeOnboarding()` | Marks onboarding as completed (modal will not show on next reload) |
| `store.skipOnboarding()`     | Marks onboarding as skipped (modal will not show on next reload)   |
| `store.resetOnboarding()`    | Resets onboarding state (modal **will** show on next reload)       |

### DevTools Locations (Chrome / Edge)

| Task                       | Tab             | Sub-panel                                        |
| -------------------------- | --------------- | ------------------------------------------------ |
| Clear `localStorage`       | **Application** | **Local Storage** → right-click site → **Clear** |
| Go offline                 | **Network**     | Throttling dropdown → **Offline**                |
| View / fill `localStorage` | **Application** | **Local Storage** → click site URL               |
| Run console commands       | **Console**     | Type command, press Enter                        |

---

## Sign-Off

| Tester Name | Date | Browser & Version | Result          |
| ----------- | ---- | ----------------- | --------------- |
|             |      |                   | ☐ Pass / ☐ Fail |

> **Notes:** Record any anomalies, visual glitches, or deviations from the expected results here. Include the section number and step number for each issue.
