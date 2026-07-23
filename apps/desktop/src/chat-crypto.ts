import type { ChatDeviceKey, ChatGroupKey, EncryptedChatMessage } from "./api";

const DATABASE_NAME = "forgedesk-chat-crypto";
const STORE_NAME = "identities";
const DEVICE_IDS_KEY = "forgedesk-chat-device-ids-v1";

type StoredIdentity = {
  userId: string;
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type DeviceIdentity = {
  deviceId: string;
  publicKeyJwk: string;
  privateKey: CryptoKey;
};

export type EncryptedPayload = Pick<EncryptedChatMessage, "ciphertext" | "nonce" | "keyVersion" | "keyEnvelopes">;

export type GroupKeyPayload = Pick<ChatGroupKey, "keyVersion" | "keyEnvelopes"> & { rawKey: ArrayBuffer };

function toBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let output = "";
  for (const byte of bytes) {
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
  return bytes.buffer;
}

function deviceIds() {
  try {
    const value = JSON.parse(localStorage.getItem(DEVICE_IDS_KEY) ?? "{}") as Record<string, string>;
    return typeof value === "object" && value ? value : {};
  } catch {
    return {};
  }
}

function deviceIdFor(userId: string) {
  const values = deviceIds();
  if (values[userId]) {
    return values[userId];
  }
  const deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_IDS_KEY, JSON.stringify({ ...values, [userId]: deviceId }));
  return deviceId;
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地密钥库"));
  });
}

async function readIdentity(userId: string) {
  const db = await database();
  return new Promise<StoredIdentity | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地密钥"));
    transaction.oncomplete = () => db.close();
  });
}

async function saveIdentity(identity: StoredIdentity) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(identity);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("无法保存本地密钥"));
  });
}

async function privateKey(identity: StoredIdentity) {
  return crypto.subtle.importKey("jwk", identity.privateKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "decrypt",
  ]);
}

export async function ensureDeviceIdentity(userId: string): Promise<DeviceIdentity> {
  const current = await readIdentity(userId);
  if (current) {
    return {
      deviceId: current.deviceId,
      publicKeyJwk: JSON.stringify(current.publicKeyJwk),
      privateKey: await privateKey(current),
    };
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const stored: StoredIdentity = {
    userId,
    deviceId: deviceIdFor(userId),
    publicKeyJwk: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    privateKeyJwk: await crypto.subtle.exportKey("jwk", keyPair.privateKey),
  };
  await saveIdentity(stored);
  return {
    deviceId: stored.deviceId,
    publicKeyJwk: JSON.stringify(stored.publicKeyJwk),
    privateKey: await privateKey(stored),
  };
}

async function importPublicKey(publicKeyJwk: string) {
  return crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk) as JsonWebKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

export async function encryptMessage(plaintext: string, deviceKeys: ChatDeviceKey[]): Promise<EncryptedPayload> {
  if (!deviceKeys.length) {
    throw new Error("会话成员尚未登记聊天设备");
  }
  const messageKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawMessageKey = await crypto.subtle.exportKey("raw", messageKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    messageKey,
    new TextEncoder().encode(plaintext),
  );
  const keyEnvelopes = Object.fromEntries(
    await Promise.all(
      deviceKeys.map(async (device) => {
        const publicKey = await importPublicKey(device.publicKeyJwk);
        const envelope = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawMessageKey);
        return [device.deviceId, toBase64(envelope)];
      }),
    ),
  );
  return { ciphertext: toBase64(ciphertext), nonce: toBase64(nonce.buffer), keyVersion: 1, keyEnvelopes };
}

/**
 * 群会话密钥只在初始化或设备变化时为每台设备封装一次；普通群消息不再携带设备信封。
 */
export async function createGroupKeyPayload(deviceKeys: ChatDeviceKey[]): Promise<GroupKeyPayload> {
  if (!deviceKeys.length) {
    throw new Error("群成员尚未登记聊天设备");
  }
  const groupKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawKey = await crypto.subtle.exportKey("raw", groupKey);
  return {
    keyVersion: 1,
    rawKey,
    keyEnvelopes: await keyEnvelopesFor(rawKey, deviceKeys),
  };
}

export async function encryptGroupMessage(
  plaintext: string,
  rawGroupKey: ArrayBuffer,
  keyVersion: number,
): Promise<EncryptedPayload> {
  const groupKey = await crypto.subtle.importKey("raw", rawGroupKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    groupKey,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(ciphertext), nonce: toBase64(nonce.buffer), keyVersion, keyEnvelopes: {} };
}

export async function decryptGroupKey(groupKey: ChatGroupKey, identity: DeviceIdentity): Promise<ArrayBuffer | null> {
  const envelope = groupKey.keyEnvelopes[identity.deviceId];
  if (!envelope) {
    return null;
  }
  return crypto.subtle.decrypt({ name: "RSA-OAEP" }, identity.privateKey, fromBase64(envelope));
}

export async function createGroupKeyEnvelope(rawGroupKey: ArrayBuffer, target: ChatDeviceKey): Promise<string> {
  const targetPublicKey = await importPublicKey(target.publicKeyJwk);
  const envelope = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, targetPublicKey, rawGroupKey);
  return toBase64(envelope);
}

export async function decryptMessage(
  message: EncryptedChatMessage,
  identity: DeviceIdentity,
  rawGroupKey?: ArrayBuffer | null,
): Promise<string | null> {
  const envelope = message.keyEnvelopes[identity.deviceId];
  if (!envelope && !rawGroupKey) {
    return null;
  }
  const rawMessageKey = envelope
    ? await crypto.subtle.decrypt({ name: "RSA-OAEP" }, identity.privateKey, fromBase64(envelope))
    : rawGroupKey!;
  const messageKey = await crypto.subtle.importKey("raw", rawMessageKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromBase64(message.nonce)) },
    messageKey,
    fromBase64(message.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function createMessageKeyEnvelope(
  message: EncryptedChatMessage,
  identity: DeviceIdentity,
  target: ChatDeviceKey,
): Promise<string | null> {
  const currentEnvelope = message.keyEnvelopes[identity.deviceId];
  if (!currentEnvelope || target.deviceId === identity.deviceId) {
    return null;
  }
  const rawMessageKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    identity.privateKey,
    fromBase64(currentEnvelope),
  );
  const targetPublicKey = await importPublicKey(target.publicKeyJwk);
  const envelope = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, targetPublicKey, rawMessageKey);
  return toBase64(envelope);
}

async function keyEnvelopesFor(rawKey: ArrayBuffer, deviceKeys: ChatDeviceKey[]) {
  return Object.fromEntries(
    await Promise.all(
      deviceKeys.map(async (device) => [device.deviceId, await createGroupKeyEnvelope(rawKey, device)]),
    ),
  );
}
