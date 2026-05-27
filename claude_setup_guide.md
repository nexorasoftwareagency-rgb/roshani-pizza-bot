# Claude Extension & Integration Setup Guide

This guide provides step-by-step instructions for setting up the official **"Claude in Chrome"** browser extension, configuring Claude models inside your **OpenCode AI Desktop** workspace, and linking them to your local terminal workflows.

---

## 🚀 Status Update: Installed in Antigravity IDE
The official **Claude Code for VS Code** extension has been successfully installed and activated in your **Antigravity IDE**!
*   **Extension Name:** Claude Code for VS Code
*   **Extension ID:** `anthropic.claude-code`
*   **Installed Version:** `v2.1.89`

### How to Access Inside Antigravity
1.  **Reload / Launch Antigravity:** If you have the editor open, reload the window or restart the app to initialize the new extension.
2.  **Access the Sidebar:** You will see a new **Claude** icon in the activity bar (left sidebar), or you can open the Command Palette (`Ctrl+Shift+P` on Windows) and type **"Claude"** to trigger its features.

---

## 1. Official "Claude in Chrome" Browser Extension

The Chrome subagent has successfully opened the official **Claude in Chrome** extension page in your active browser session:
*   **Web Store URL:** [https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn](https://chromebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)

### 🚀 Installation Steps
1.  **Click "Add to Chrome":** On the browser page that is currently open, click the blue **"Add to Chrome"** button.
2.  **Confirm Permissions:** A popup will ask to confirm the installation. Click **"Add extension"**.
3.  **Pin the Extension:** 
    *   Click the **Extensions (puzzle piece)** icon in the top right corner of Chrome.
    *   Find **Claude** in the list and click the **Pin (pushpin)** icon next to it. This keeps it readily accessible on your toolbar.

### 🔑 Authentication & Activation
1.  **Open the Side Panel:** Click the pinned **Claude** icon on your Chrome toolbar to slide out the sidebar.
2.  **Sign In:** Sign in with your paid Anthropic credentials (the extension currently requires an active **Claude Pro, Max, Team, or Enterprise** plan).
3.  **Use Cases:**
    *   **Summarize Page:** Open a website and ask Claude to read and extract highlights.
    *   **Interact & Automate:** Ask Claude to fill out web forms, click buttons, or record repeatable browser tasks.

> [!IMPORTANT]
> **Security First:** The extension is an agentic tool capable of interacting with pages on your behalf. Standard safety overrides will prompt you to confirm high-risk actions like form submissions, publishing, or checkout flows.

---

## 2. CLI Integration (`claude --chrome` Bridge)

If you are running the **Claude Code** CLI tool, you can establish an active bridge between your local console and your Chrome browser window.

1.  Open your terminal in `C:\Prasant-Pizza-ERP`.
2.  Run the following command:
    ```bash
    claude --chrome
    ```
3.  This establishes a secure WebSocket connection to your active Chrome browser, allowing the Claude CLI to:
    *   Inspect browser logs and console exceptions.
    *   Run automated visual tests on your local server.
    *   Extract dynamic UI states directly during your debugging sessions.

---

## 3. Integrating Claude with "OpenCode AI Desktop"

Our system analysis shows you are running **OpenCode AI Desktop** (`OpenCode.exe`) as your main developer platform. Since Anthropic's recent policies updated direct Pro account support, the most stable way to leverage Claude inside OpenCode is through an **Anthropic API Key**:

### 🛠️ OpenCode API Key Setup
1.  Open the **OpenCode AI Desktop** terminal panel.
2.  Type the connection command:
    ```text
    /connect anthropic
    ```
3.  You will be prompted to paste your **Anthropic API Key** (generate one from your [Anthropic Console](https://console.anthropic.com/)).
4.  Switch to the desired Claude model (e.g., Claude 3.5 Sonnet) using the command:
    ```text
    /models
    ```
5.  Select **`claude-3-5-sonnet`** to start using the model directly within OpenCode's Plan or Build agents.

---

## 4. Troubleshooting & Best Practices

*   **Extension not loading?** Ensure Google Chrome is updated to the latest desktop version.
*   **Failed API requests in OpenCode?** Check your Anthropic Console credit balance. The third-party API is charged based on usage (tokens) and is decoupled from a standard web Claude Pro subscription.
*   **Switching Modes in OpenCode:** Remember that `/build` mode gives OpenCode write permissions to edit code directly in your ERP directory, while `/plan` is read-only.
