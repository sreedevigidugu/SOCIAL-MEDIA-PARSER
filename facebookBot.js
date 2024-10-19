const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

class FacebookBot {
  constructor(username, password, sendLog, waitForTwoFactorCode) {
    this.username = username;
    this.password = password;
    this.sendLog = sendLog;
    this.waitForTwoFactorCode = waitForTwoFactorCode;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: null,
    });
    this.page = await this.browser.newPage();

    // Block browser-level notifications
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions("https://www.facebook.com", [
      "notifications",
    ]);

    // Set user agent to mimic a real browser
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async login() {
    this.sendLog("Navigating to Facebook login page...");
    await this.page.goto("https://www.facebook.com/login", {
      waitUntil: "networkidle2",
    });

    await this.page.type("#email", this.username, { delay: 100 });
    await this.page.type("#pass", this.password, { delay: 100 });
    await this.page.click('button[name="login"]');

    await this.page.waitForNavigation({ waitUntil: "networkidle2" });

    // Check for 2FA page
    if (this.page.url().includes("checkpoint")) {
      this.sendLog("2FA page detected.");

      // Wait for the 2FA input field to appear
      await this.page.waitForSelector('input[name="approvals_code"]', {
        visible: true,
      });

      const code = await this.waitForTwoFactorCode();
      await this.page.type('input[name="approvals_code"]', code, {
        delay: 100,
      });

      // Click the "Continue" button
      await this.page.click('button[type="submit"]');

      // Wait for navigation after submitting 2FA code
      await this.page.waitForNavigation({ waitUntil: "networkidle2" });

      // Check if there's a "Save Browser" option and click "Don't Save"
      try {
        await this.page.waitForSelector('button[value="dont_save"]', {
          timeout: 5000,
        });
        await this.page.click('button[value="dont_save"]');
        await this.page.waitForNavigation({ waitUntil: "networkidle2" });
      } catch (error) {
        this.sendLog("No 'Save Browser' prompt found. Continuing...");
      }

      this.sendLog("2FA code entered and submitted.");
    }

    if (this.page.url().includes("facebook.com")) {
      this.sendLog("Logged in successfully.");

      // Handle notification prompts
      await this.handleNotificationPrompts();
    } else {
      throw new Error("Login failed or unexpected page loaded.");
    }
  }

  async handleNotificationPrompts() {
    this.sendLog("Handling notification prompts...");

    // List of possible selectors for notification dismiss buttons
    const notificationDismissSelectors = [
      'button[data-testid="negative-action-button"]', // "Not Now" button
      'button[action="cancel"]',
      'button[value="decline"]',
      '[aria-label="Close"]',
      // Add more selectors as needed
    ];

    for (const selector of notificationDismissSelectors) {
      try {
        // Wait for the selector to appear
        await this.page.waitForSelector(selector, { timeout: 5000 });

        // Click the dismiss button
        await this.page.click(selector);

        this.sendLog(
          `Dismissed notification prompt using selector: ${selector}`
        );

        // Wait a bit for any animations or page changes
        await this.page.waitForTimeout(1000);
      } catch (error) {
        // If the selector is not found, it's not an error, just continue to the next one
        continue;
      }
    }

    this.sendLog("Finished handling notification prompts.");
  }

  async takeFullPageScreenshot(filePath) {
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.screenshot({ path: filePath, fullPage: true });
    this.sendLog(`Full page screenshot saved as ${filePath}.`);
  }

  async navigateToOwnProfile() {
    this.sendLog("Navigating to profile...");
    await this.page.goto(`https://www.facebook.com/me`, {
      waitUntil: "networkidle2",
    });
    this.sendLog("Profile page loaded.");
  }

  async takeProfileScreenshot(username) {
    this.sendLog("Taking profile screenshot...");

    const profileDir = path.join(__dirname, "files", "facebook", username);
    await fs.mkdir(profileDir, { recursive: true });

    const profileScreenshotPath = path.join(
      profileDir,
      `${username}_full_profile.png`
    );
    await this.takeFullPageScreenshot(profileScreenshotPath);
  }

  async getFriendsList(username) {
    this.sendLog("Getting friends list...");
    await this.page.goto(`https://www.facebook.com/me/friends`, {
      waitUntil: "networkidle2",
    });

    const friendsDir = path.join(__dirname, "files", "facebook", username);
    await fs.mkdir(friendsDir, { recursive: true });

    let previousHeight;
    let friendsData = [];

    while (true) {
      previousHeight = await this.page.evaluate(
        () => document.body.scrollHeight
      );
      await this.page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newFriends = await this.page.evaluate(() => {
        const friendElements = document.querySelectorAll(
          'div[data-pagelet="ProfileAppSection_0"] div[role="article"]'
        );
        return Array.from(friendElements)
          .map((el) => {
            const nameElement = el.querySelector("span");
            return nameElement ? nameElement.textContent : null;
          })
          .filter((name) => name !== null);
      });

      friendsData = [...friendsData, ...newFriends];

      const currentHeight = await this.page.evaluate(
        () => document.body.scrollHeight
      );
      if (currentHeight === previousHeight) break;
    }

    
    const friendsScreenshotPath = path.join(
      friendsDir,
      `${username}_friends_page.png`
    );
    await this.takeFullPageScreenshot(friendsScreenshotPath);
  }

  async navigateToMessages() {
    this.sendLog("Navigating to messages...");
    await this.page.goto("https://www.facebook.com/messages/t/", {
      waitUntil: "networkidle2",
    });
    this.sendLog("Messages page loaded.");
  }

  async takeConversationScreenshots(username) {
    this.sendLog("Taking conversation screenshots...");

    const messagesDir = path.join(__dirname, "files", "facebook", username);
    await fs.mkdir(messagesDir, { recursive: true });

    // Take a screenshot of the list of conversations
    const conversationListScreenshotPath = path.join(
      messagesDir,
      `${username}_conversation_list.png`
    );
    await this.takeFullPageScreenshot(conversationListScreenshotPath);

    // Update the selector to a more stable one
    const conversationSelector =
      'div[aria-label="Chats"] div[role="grid"] > div > div > div > div > div:nth-child(2)';

    try {
      // Wait for the conversation list to appear
      await this.page.waitForSelector(conversationSelector, { timeout: 10000 });
    } catch (error) {
      this.sendLog(
        "No conversations found. Please check the selector or page structure."
      );
      return; // Exit the function if no conversations are found
    }

    const conversations = await this.page.$$(conversationSelector);

    if (conversations.length > 0) {
      const recentConversations = conversations.slice(0, 3);

      for (let i = 0; i < recentConversations.length; i++) {
        this.sendLog(`Opening conversation ${i + 1}...`);

        try {
          // Click the conversation using page.evaluate for more reliable clicking
          await this.page.evaluate(
            (selector, index) => {
              const elements = document.querySelectorAll(selector);
              if (elements[index]) {
                elements[index].click();
              } else {
                throw new Error(`Conversation ${index + 1} not found`);
              }
            },
            conversationSelector,
            i
          );

          // Wait for the conversation to load
          await this.page.waitForNavigation({
            waitUntil: "networkidle0",
            timeout: 10000,
          });

          const conversationScreenshotPath = path.join(
            messagesDir,
            `${username}_conversation_${i + 1}.png`
          );
          await this.takeFullPageScreenshot(conversationScreenshotPath);

          // Navigate back to the messages list
          await this.navigateToMessages();
          await this.page.waitForSelector(conversationSelector, {
            timeout: 20000,
          });
        } catch (error) {
          this.sendLog(
            `Error processing conversation ${i + 1}: ${error.message}`
          );
        }
      }
    } else {
      this.sendLog(
        "No conversations found. Please check the selector or page structure."
      );
    }
  }


  async close() {
    await this.browser.close();
    this.sendLog("Browser closed.");
  }

  async run() {
    await this.init();
    this.sendLog("Facebook Bot initialized.");
    await this.login();
    await this.navigateToOwnProfile();
    await this.takeProfileScreenshot(this.username);
    await this.getFriendsList(this.username);
    await this.navigateToMessages();
    await this.takeConversationScreenshots(this.username);
    await this.close();
    this.sendLog("Facebook Bot process completed.");
  }
}

module.exports = FacebookBot;
