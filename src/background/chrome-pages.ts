import type { GlyphName } from "../shared/model.ts";
import type { MessageKey } from "../i18n/index.ts";

/**
 * Every section of chrome://settings as a command (title key `pg<Id>` in src/i18n).
 * Pure data: the command-service turns each entry into an "open page" command.
 */
export interface ChromePage {
  id: string;
  title: MessageKey;
  url: string;
  /** Extra English search words (the English title always matches too). */
  keywords: string;
  glyph: GlyphName;
}

export const CHROME_PAGES: ChromePage[] = [
  { id: "people", title: "pgPeople", url: "chrome://settings/people", keywords: "account profile sign in google", glyph: "user" },
  { id: "syncsetup", title: "pgSyncSetup", url: "chrome://settings/syncSetup", keywords: "sync google services account", glyph: "reload" },
  { id: "manageprofile", title: "pgManageProfile", url: "chrome://settings/manageProfile", keywords: "profile name avatar", glyph: "user" },
  { id: "importdata", title: "pgImportData", url: "chrome://settings/importData", keywords: "bookmarks migrate", glyph: "download" },
  { id: "autofill", title: "pgAutofill", url: "chrome://settings/autofill", keywords: "forms fill", glyph: "key" },
  { id: "passwords", title: "pgPasswords", url: "chrome://password-manager/passwords", keywords: "password manager credentials logins", glyph: "key" },
  { id: "payments", title: "pgPayments", url: "chrome://settings/payments", keywords: "credit card pay", glyph: "card" },
  { id: "addresses", title: "pgAddresses", url: "chrome://settings/addresses", keywords: "autofill contact", glyph: "mapPin" },
  { id: "safetycheck", title: "pgSafetyCheck", url: "chrome://settings/safetyCheck", keywords: "security passwords updates", glyph: "shield" },
  { id: "privacy", title: "pgPrivacy", url: "chrome://settings/privacy", keywords: "security cookies", glyph: "lock" },
  { id: "adprivacy", title: "pgAdPrivacy", url: "chrome://settings/adPrivacy", keywords: "privacy sandbox ads topics", glyph: "lock" },
  { id: "security", title: "pgSecurity", url: "chrome://settings/security", keywords: "safe browsing https dns", glyph: "shield" },
  { id: "cookies", title: "pgCookies", url: "chrome://settings/cookies", keywords: "third party tracking", glyph: "cookie" },
  { id: "sitesettings", title: "pgSiteSettings", url: "chrome://settings/content", keywords: "permissions content", glyph: "sliders" },
  { id: "sitedata", title: "pgSiteData", url: "chrome://settings/content/all", keywords: "stored data storage", glyph: "sliders" },
  { id: "location", title: "pgLocation", url: "chrome://settings/content/location", keywords: "geolocation gps", glyph: "mapPin" },
  { id: "camera", title: "pgCamera", url: "chrome://settings/content/camera", keywords: "webcam video", glyph: "camera" },
  { id: "microphone", title: "pgMicrophone", url: "chrome://settings/content/microphone", keywords: "audio input", glyph: "mic" },
  { id: "notifications", title: "pgNotifications", url: "chrome://settings/content/notifications", keywords: "alerts push", glyph: "bell" },
  { id: "popups", title: "pgPopups", url: "chrome://settings/content/popups", keywords: "popup redirects block", glyph: "window" },
  { id: "javascript", title: "pgJavascript", url: "chrome://settings/content/javascript", keywords: "js scripts", glyph: "code" },
  { id: "images", title: "pgImages", url: "chrome://settings/content/images", keywords: "pictures", glyph: "image" },
  { id: "sitesound", title: "pgSiteSound", url: "chrome://settings/content/sound", keywords: "audio mute", glyph: "sound" },
  { id: "autodownloads", title: "pgAutoDownloads", url: "chrome://settings/content/automaticDownloads", keywords: "multiple files", glyph: "download" },
  { id: "clipboard", title: "pgClipboard", url: "chrome://settings/content/clipboard", keywords: "paste copy", glyph: "clipboard" },
  { id: "pdf", title: "pgPdf", url: "chrome://settings/content/pdfDocuments", keywords: "viewer download", glyph: "doc" },
  { id: "zoomlevels", title: "pgZoomLevels", url: "chrome://settings/content/zoomLevels", keywords: "magnify scale", glyph: "search" },
  { id: "performance", title: "pgPerformance", url: "chrome://settings/performance", keywords: "memory saver battery speed", glyph: "cpu" },
  { id: "appearance", title: "pgAppearance", url: "chrome://settings/appearance", keywords: "theme dark mode toolbar", glyph: "palette" },
  { id: "fonts", title: "pgFonts", url: "chrome://settings/fonts", keywords: "typeface size", glyph: "text" },
  { id: "searchengine", title: "pgSearchEngine", url: "chrome://settings/search", keywords: "default google", glyph: "search" },
  { id: "searchengines", title: "pgSearchEngines", url: "chrome://settings/searchEngines", keywords: "site search shortcuts", glyph: "search" },
  { id: "defaultbrowser", title: "pgDefaultBrowser", url: "chrome://settings/defaultBrowser", keywords: "make default", glyph: "window" },
  { id: "onstartup", title: "pgOnStartup", url: "chrome://settings/onStartup", keywords: "home page launch", glyph: "power" },
  { id: "languages", title: "pgLanguages", url: "chrome://settings/languages", keywords: "language spell check translate", glyph: "globe" },
  { id: "downloadsettings", title: "pgDownloadSettings", url: "chrome://settings/downloads", keywords: "folder location ask", glyph: "download" },
  { id: "accessibility", title: "pgAccessibility", url: "chrome://settings/accessibility", keywords: "a11y caret captions", glyph: "accessibility" },
  { id: "system", title: "pgSystem", url: "chrome://settings/system", keywords: "proxy hardware acceleration background", glyph: "cpu" },
  { id: "reset", title: "pgReset", url: "chrome://settings/reset", keywords: "restore defaults", glyph: "reload" },
  { id: "about", title: "pgAbout", url: "chrome://settings/help", keywords: "version update", glyph: "info" },
];
