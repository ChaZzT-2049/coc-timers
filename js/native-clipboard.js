import { registerPlugin } from "@capacitor/core";

const NativeClipboard = registerPlugin("NativeClipboard");

export async function readNativeClipboard() {
  const result = await NativeClipboard.read();
  return String(result?.value || "");
}
