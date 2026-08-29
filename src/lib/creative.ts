import type { Discovery } from '../data';

export function falPrompt(discovery: Discovery) {
  return `${discovery.visualDirection} Compose vertically for a premium mobile story card. Preserve the real place's architecture. Avoid captions, logos, watermarks, distorted faces, anachronistic objects, or sensationalised violence.`;
}

export function narrationScript(discovery: Discovery) {
  return `${discovery.hook} ${discovery.subtitle} ${discovery.story} Keep the delivery intimate, curious, and unhurried; like a perceptive local friend sharing a secret, never like an audio guide.`;
}
