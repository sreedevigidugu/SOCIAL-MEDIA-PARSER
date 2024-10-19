const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

class TwitterBot {
  constructor(username, password, sendLog, waitForVerificationInput) {
    this.username = username;
    this.password = password;
    this.sendLog = sendLog;
    this.waitForVerificationInput = waitForVerificationInput;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForSelectorWithRetry(selector, options = {}) {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.page.waitForSelector(selector, { ...options, timeout: 15000 });
        return;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.delay(2000);
      }
    }
  }

  async login() {
    try {
      this.sendLog("Navigating to login page...");
      await this.page.goto("https://x.com/i/flow/login", { waitUntil: "networkidle2", timeout: 60000 });
  
      this.sendLog("Entering username...");
      const initialInputSelector = 'input[autocomplete="username"], input[name="text"], input[type="text"]';
      await this.waitForSelectorWithRetry(initialInputSelector);
      await this.page.type(initialInputSelector, this.username, { delay: 100 });
  
      await this.page.keyboard.press('Enter');
      await this.delay(3000);
  
      const passwordSelector = 'input[type="password"]';
      const verificationSelector = 'input[autocomplete="on"]';
  
      await Promise.race([
        this.waitForSelectorWithRetry(passwordSelector),
        this.waitForSelectorWithRetry(verificationSelector)
      ]);
  
      if (await this.page.$(passwordSelector)) {
        this.sendLog("Entering password...");
        await this.page.type(passwordSelector, this.password, { delay: 100 });
        await this.page.keyboard.press('Enter');
      } else if (await this.page.$(verificationSelector)) {
        this.sendLog("Additional verification required...");
        const verificationInfo = await this.waitForVerificationInput("Please enter the required verification information (email or phone):");
        await this.page.type(verificationSelector, verificationInfo, { delay: 100 });
        await this.page.keyboard.press('Enter');
  
        await this.waitForSelectorWithRetry(passwordSelector);
        this.sendLog("Entering password...");
        await this.page.type(passwordSelector, this.password, { delay: 100 });
        await this.page.keyboard.press('Enter');
      }
  
      await this.delay(5000);
  
      const twoFactorSelector = 'input[autocomplete="one-time-code"]';
      if (await this.page.$(twoFactorSelector)) {
        const code = await this.waitForVerificationInput("Please enter the 2FA code:");
        await this.page.type(twoFactorSelector, code, { delay: 100 });
        await this.page.keyboard.press('Enter');
      }
  
      this.sendLog("Waiting for login to complete...");
      await this.waitForLoginSuccess();
  
      this.sendLog("Login successful!");
  
    } catch (error) {
      this.sendLog("Login error: " + error.message);
      await this.page.screenshot({ path: 'login-error.png' });
      throw error;
    }
  }
  
  async waitForLoginSuccess(timeout = 60000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await this.isLoggedIn()) {
        return true;
      }
      await this.delay(1000);
    }
    throw new Error("Login success not detected within the timeout period");
  }
  
  async isLoggedIn() {
    try {
      const homeButton = await this.page.$('a[aria-label="Home"]');
      const profileButton = await this.page.$('a[aria-label="Profile"]');
      const tweetButton = await this.page.$('a[aria-label="Tweet"]');
  
      if (homeButton && profileButton && tweetButton) {
        return true;
      }
  
      const currentUrl = this.page.url();
      if (currentUrl === "https://x.com/home") {
        return true;
      }
  
      return false;
    } catch (error) {
      this.sendLog("Error checking login status: " + error.message);
      return false;
    }
  }

  async takeFullPageScreenshot(fileName) {
    const screenshotPath = path.join(__dirname, "files", "twitter", this.username, fileName + ".png");
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.sendLog("Screenshot saved: " + fileName);
  }

  async takeProfileScreenshot(username) {
    this.sendLog("Taking profile screenshot...");
    const profileDir = path.join(__dirname, "files", "twitter", username);
    await fs.mkdir(profileDir, { recursive: true });
    const profileScreenshotPath = path.join(profileDir, `${username}_full_profile.png`);
    await this.takeFullPageScreenshot(profileScreenshotPath);
  }

  async captureFollowersAndFollowing() {
    try {
      // Capture followers list
      this.sendLog("Capturing followers list...");
      await this.page.goto(`https://x.com/${this.username}/followers`, { waitUntil: "networkidle2" });

      // Wait for the list to load completely
      await this.page.waitForSelector('div[data-testid="primaryColumn"]', { timeout: 60000 });
      await this.delay(5000);  // Additional delay to ensure all elements are loaded
      await this.takeFullPageScreenshot("followers");

      // Capture following list
      this.sendLog("Capturing following list...");
      await this.page.goto(`https://x.com/${this.username}/following`, { waitUntil: "networkidle2" });

      // Wait for the list to load completely
      await this.page.waitForSelector('div[data-testid="primaryColumn"]', { timeout: 60000 });
      await this.delay(5000);  // Additional delay to ensure all elements are loaded
      await this.takeFullPageScreenshot("following");

    } catch (error) {
      this.sendLog("Error capturing followers or following list: " + error.message);
      await this.page.screenshot({ path: 'capture-error.png' });
      throw error;
    }
  }

  async navigateToProfile() {
    try {
      this.sendLog("Navigating to profile page...");
      await this.page.goto(`https://x.com/${this.username}`, { waitUntil: "domcontentloaded", timeout: 60000 });

      await this.page.waitForSelector('section[role="region"]', { timeout: 15000 });
      this.sendLog("Profile page loaded successfully.");
    } catch (error) {
      this.sendLog("Error loading profile page: " + error.message);
      await this.page.screenshot({ path: 'profile-loading-error.png' });
      throw new Error("Failed to load profile page.");
    }
  }

  async run() {
    try {
      await this.init();
      await this.login();
      await this.navigateToProfile();
      await this.takeFullPageScreenshot("profile");

      // Capture followers and following lists
      await this.captureFollowersAndFollowing();

    } catch (error) {
      this.sendLog("Bot run failed: " + error.message);
    } finally {
      this.sendLog("Closing browser...");
      if (this.browser) {
        await this.browser.close();
        this.sendLog("Closed browser successfully...");
      }
    }
  }
}

module.exports = TwitterBot;
