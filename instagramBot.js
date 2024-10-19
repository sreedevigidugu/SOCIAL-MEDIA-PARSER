// File: instagramBot.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

class InstagramBot {
  constructor(username, password, sendLog, waitForTwoFactorCode) {
    this.username = username;
    this.password = password;
    this.sendLog = sendLog;
    this.waitForTwoFactorCode = waitForTwoFactorCode;
  }

  async init() {
    this.browser = await puppeteer.launch({ headless: true });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async login() {
    this.sendLog("Navigating to login page...");
    await this.page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "networkidle2",
    });

    await this.page.type('input[name="username"]', this.username, {
      delay: 100,
    });
    await this.page.type('input[name="password"]', this.password, {
      delay: 100,
    });
    await this.page.click('button[type="submit"]');

    await this.page
      .waitForNavigation({ waitUntil: "networkidle2" })
      .catch(() => {});

    // Check for 2FA page
    if (this.page.url().includes("two_factor")) {
      this.sendLog("2FA page detected.");
      const code = await this.waitForTwoFactorCode();
      await this.page.type('input[name="verificationCode"]', code, {
        delay: 100,
      });
      await this.page.click('button[type="button"]');
      await this.page.waitForNavigation({ waitUntil: "networkidle2" });

      this.sendLog("2FA code entered and submitted.");
    }

    if (this.page.url().includes("instagram.com")) {
      this.sendLog("Logged in successfully.");
    } else {
      throw new Error("Login failed or unexpected page loaded.");
    }
  }

  async navigateToOwnProfile() {
    this.sendLog("Navigating to profile...");
    await this.page.goto(`https://www.instagram.com/${this.username}/`, {
      waitUntil: "networkidle2",
    });
    this.sendLog("Profile page loaded.");
  }

  async takeProfileScreenshot() {
    this.sendLog("Taking profile screenshot...");

    const profileDir = path.join(__dirname, "files", "instagram", this.username);
    await fs.mkdir(profileDir, { recursive: true });

    await this.page.evaluate(() => window.scrollTo(0, 0));
    const profileHeaderSelector = "header";
    const profileHeader = await this.page.$(profileHeaderSelector);

    if (profileHeader) {
      const profileScreenshotPath = path.join(
        profileDir,
        `${this.username}_profile_header.png`
      );
      try {
        await profileHeader.screenshot({ path: profileScreenshotPath });
        this.sendLog(`Profile header screenshot saved as ${profileScreenshotPath}.`);
      } catch (error) {
        this.sendLog(`Failed to save screenshot ${profileScreenshotPath}: ${error.message}`);
      }
    } else {
      this.sendLog("Failed to capture profile header.");
    }
  }

  async takePostsScreenshot() {
    this.sendLog("Taking posts screenshot...");

    const postsDir = path.join(__dirname, "files", "instagram", this.username);
    await fs.mkdir(postsDir, { recursive: true });

    await this.page.evaluate(() => {
      const header = document.querySelector("header");
      if (header) {
        header.style.display = "none";
      }
    });

    const postsSection = await this.page.$("body");

    if (postsSection) {
      let previousHeight;
      let screenshotIndex = 1;

      while (true) {
        previousHeight = await this.page.evaluate(() => document.body.scrollHeight);
        const postScreenshotPath = path.join(
          postsDir,
          `${this.username}_posts_part_${screenshotIndex}.png`
        );
        await postsSection.screenshot({ path: postScreenshotPath });
        this.sendLog(`Posts screenshot saved as ${postScreenshotPath}.`);

        await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) break;

        screenshotIndex++;
      }
    } else {
      this.sendLog("Failed to capture posts section.");
    }
  }

  async navigateToMessages() {
    this.sendLog("Navigating to messages...");
    await this.page.goto("https://www.instagram.com/direct/inbox/", {
      waitUntil: "networkidle2",
    });

    // Check if the notifications popup appears
    const notificationsPopupSelector = "._a9-v";
    const turnOnButtonSelector = "button._a9--._a9_1";

    try {
      await this.page.waitForSelector(notificationsPopupSelector, { timeout: 5000 });
      this.sendLog("Notifications popup detected.");
      await this.page.click(turnOnButtonSelector);
      this.sendLog("Clicked 'Turn On' button for notifications.");
    } catch (error) {
      this.sendLog("No notifications popup detected or failed to interact with it.");
    }

    this.sendLog("Messages page loaded.");
  }

  async takeConversationScreenshots() {
    this.sendLog("Taking conversation screenshots...");

    const messagesDir = path.join(__dirname, "files", "instagram", this.username);
    await fs.mkdir(messagesDir, { recursive: true });

    // Take a screenshot of the list of conversations
    const conversationListScreenshotPath = path.join(
      messagesDir,
      `${this.username}_conversation_list.png`
    );
    await this.page.screenshot({ path: conversationListScreenshotPath });
    this.sendLog(`Conversation list screenshot saved as ${conversationListScreenshotPath}.`);

    // Updated selector to target conversation items
    const conversationSelector = 'div[role="listitem"]';
    await this.page.waitForSelector(conversationSelector, { timeout: 5000 });

    const conversations = await this.page.$$(conversationSelector);
    
    if (conversations.length > 0) {
      const recentConversations = conversations.slice(0, 3);

      for (let i = 0; i < recentConversations.length; i++) {
        this.sendLog(`Opening conversation ${i + 1}...`);
        
        // Click the conversation item
        await recentConversations[i].click();
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Take screenshot of the conversation
        const conversationScreenshotPath = path.join(
          messagesDir,
          `${this.username}_conversation_${i + 1}.png`
        );
        await this.page.screenshot({ path: conversationScreenshotPath });
        this.sendLog(`Conversation ${i + 1} screenshot saved as ${conversationScreenshotPath}.`);

        // Go back to the conversation list
        await this.page.click('a[href="/direct/inbox/"]');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } else {
      this.sendLog("No conversations found. Please check the selector or page structure.");
    }
  }

  async close() {
    await this.browser.close();
    this.sendLog("Browser closed.");
  }

  async run() {
    await this.init();
    this.sendLog("Instagram Bot initialized.");
    await this.login();
    await this.navigateToOwnProfile();
    await this.takeProfileScreenshot();
    await this.takePostsScreenshot();
    await this.navigateToMessages();
    await this.takeConversationScreenshots();
    await this.close();
    this.sendLog("Instagram Bot process completed.");
  }
}

module.exports = InstagramBot;
