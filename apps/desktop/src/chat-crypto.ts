import { gcm } from "@noble/ciphers/aes";
import { x25519 } from "@noble/curves/ed25519";
import type { EncryptedChatMessage } from "./api";

const TRANSPORT_VERSION = 2;

export type ChatTransportSession = {
  clientPrivateKey: Uint8Array;
  clientPublicKey: string;
  serverPublicKey: Uint8Array;
};

export type ChatTransportPayload = Pick<EncryptedChatMessage, "ciphertext" | "nonce" | "keyVersion"> & {
  clientPublicKey: string;
};

function toBase64(value: Uint8Array) {
  let output = "";
  for (const byte of value) {
    output += String.fromCharCode(byte);
  }
  return btoa(output);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function associatedData(conversationId: string) {
  return new TextEncoder().encode(`forgedesk-chat-transport-v2:${conversationId}`);
}

function sharedKey(session: ChatTransportSession) {
  return x25519.getSharedSecret(session.clientPrivateKey, session.serverPublicKey);
}

/**
 * Creates an ephemeral browser transport key pair. The private key is kept only in memory, while
 * the public key travels with encrypted request bodies so the central server can derive the key.
 */
export function createChatTransportSession(serverPublicKey: string): ChatTransportSession {
  const decodedServerKey = fromBase64(serverPublicKey);
  if (decodedServerKey.length !== 32) {
    throw new Error("聊天服务传输公钥无效");
  }
  const clientPrivateKey = x25519.utils.randomPrivateKey();
  return {
    clientPrivateKey,
    clientPublicKey: toBase64(x25519.getPublicKey(clientPrivateKey)),
    serverPublicKey: decodedServerKey,
  };
}

export function encryptChatTransportMessage(
  plaintext: string,
  conversationId: string,
  session: ChatTransportSession,
): ChatTransportPayload {
  const nonce = new Uint8Array(12);
  globalThis.crypto.getRandomValues(nonce);
  const ciphertext = gcm(sharedKey(session), nonce, associatedData(conversationId)).encrypt(
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    keyVersion: TRANSPORT_VERSION,
    clientPublicKey: session.clientPublicKey,
  };
}

export function decryptChatTransportMessage(message: EncryptedChatMessage, session: ChatTransportSession): string {
  if (message.keyVersion !== TRANSPORT_VERSION) {
    throw new Error("该消息来自已停用的点对点加密模式");
  }
  const plaintext = gcm(sharedKey(session), fromBase64(message.nonce), associatedData(message.conversationId)).decrypt(
    fromBase64(message.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
