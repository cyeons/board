import { api, unwrap } from "../../lib/api";

const MAX_BITRATE = 1_500_000;

export const iceServers = async (): Promise<RTCIceServer[]> => {
  try {
    return (await unwrap(api["turn-credentials"].$get())).iceServers;
  } catch {
    return [{ urls: "stun:stun.cloudflare.com:3478" }];
  }
};

/** 글자가 읽히는 것이 우선이다 (plan.md 13.2). */
export async function sendScreen(pc: RTCPeerConnection, stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    track.contentHint = "text";
    const sender = pc.addTrack(track, stream);
    const params = sender.getParameters();
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    params.encodings[0]!.maxBitrate = MAX_BITRATE;
    await sender.setParameters(params).catch(() => undefined);
  }
}
