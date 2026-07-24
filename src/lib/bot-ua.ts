/**
 * Known search / AI / scrape crawlers. Used by proxy to refuse automated
 * harvesting of guides, compatibility, and other private content.
 * Legitimate browsers and service-token API calls are not matched.
 */
const BOT_UA =
  /\b(googlebot|google-extended|bingbot|bingpreview|slurp|duckduckbot|baiduspider|yandex(bot|images)|facebot|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest\/0\.|redditbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|claudebot|anthropic-ai|ccbot|cohere-ai|dataforseo|ia_archiver|archive\.org_bot|wget|curl|python-requests|python-urllib|scrapy|httpclient|java\/|libwww-perl|go-http-client|okhttp|axios\/|node-fetch|postmanruntime)\b/i;

export function isBlockedBotUserAgent(ua: string | null): boolean {
  if (!ua || !ua.trim()) return false;
  return BOT_UA.test(ua);
}
