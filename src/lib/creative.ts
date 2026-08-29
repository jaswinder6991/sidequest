import type { Discovery } from '../data';

export function falPrompt(discovery: Discovery) {
  return `Cinematic historical reconstruction for SideQuest: ${discovery.visualDirection} It should feel like a still from a prestige historical film: period-accurate clothing and objects, dramatic natural light, tactile stone and weather, restrained colour grade, emotionally believable people in the distance, and documentary-level respect for the real place. Compose vertically for a premium mobile story card. Preserve the real architecture. Avoid captions, logos, watermarks, split screens, modern intrusions, distorted faces, anachronistic objects, or sensationalised violence.`;
}

export function narrationScript(discovery: Discovery) {
  return `${discovery.hook} ${discovery.subtitle} ${discovery.story} Keep the delivery intimate, curious, and unhurried; like a perceptive local friend sharing a secret, never like an audio guide.`;
}
