import { getSettings } from "@/lib/settings";
import { sonarr } from "./sonarr";
import { radarr } from "./radarr";
import { jellyfin } from "./jellyfin";

export async function getSonarr() {
  return sonarr((await getSettings()).sonarr);
}
export async function getRadarr() {
  return radarr((await getSettings()).radarr);
}
export async function getJellyfin() {
  return jellyfin((await getSettings()).jellyfin);
}
