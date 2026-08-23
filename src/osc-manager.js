"use strict";

const dgram = require("dgram");

// ---------------------------------------------------------------------------
// OSC string encoding: pad string+null to next 4-byte boundary from buf[0]
// ---------------------------------------------------------------------------

function encodeOSCString(str) {
  const raw = Buffer.from(str + "\0", "ascii");
  const padded = (raw.length + 3) & ~3;
  const out = Buffer.alloc(padded);
  raw.copy(out);
  return out;
}

function encodeOSCInt(val) {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(val >>> 0, 0);   // unsigned shift to avoid sign issues
  return buf;
}

function encodeOSCFloat(val) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  return buf;
}

function buildOSCMessage(address, value, forceType) {
  const addrBuf = encodeOSCString(address);

  let typetag;
  let dataBuf;

  const type = forceType || (
    typeof value === "boolean" ? "bool"
    : typeof value === "number" ? (Number.isInteger(value) ? "int" : "float")
    : "string"
  );

  if (type === "bool") {
    typetag = value ? "T" : "F";
    dataBuf = Buffer.alloc(0);
  } else if (type === "int") {
    typetag = "i";
    dataBuf = encodeOSCInt(Math.round(value));
  } else if (type === "float") {
    typetag = "f";
    dataBuf = encodeOSCFloat(typeof value === "boolean" ? (value ? 1.0 : 0.0) : value);
  } else {
    typetag = "s";
    dataBuf = encodeOSCString(String(value));
  }

  const typetagBuf = encodeOSCString("," + typetag);
  return Buffer.concat([addrBuf, typetagBuf, dataBuf]);
}

// ---------------------------------------------------------------------------
// OSC packet decoder
// FIX: align nextOffset to 4-byte boundary from absolute buffer start,
//      not relative to the string's own start offset.
// ---------------------------------------------------------------------------

function readOSCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const str = buf.toString("ascii", offset, end);
  // Align (end + 1) — the byte after the null terminator — up to next 4-byte boundary
  const nextOffset = (end + 4) & ~3;
  return { value: str, nextOffset };
}

function decodeOSCMessage(buf) {
  try {
    const addr = readOSCString(buf, 0);
    const tags = readOSCString(buf, addr.nextOffset);
    // typetags string starts with "," — skip it
    const typetags = tags.value.startsWith(",") ? tags.value.slice(1) : tags.value;

    let offset = tags.nextOffset;
    const args = [];

    for (const tag of typetags) {
      if (tag === "i") {
        args.push({ type: "int",   value: buf.readInt32BE(offset) });
        offset += 4;
      } else if (tag === "f") {
        args.push({ type: "float", value: buf.readFloatBE(offset) });
        offset += 4;
      } else if (tag === "s") {
        const s = readOSCString(buf, offset);
        args.push({ type: "string", value: s.value });
        offset = s.nextOffset;
      } else if (tag === "T") {
        args.push({ type: "bool", value: true });
      } else if (tag === "F") {
        args.push({ type: "bool", value: false });
      }
      // skip unknown tags
    }

    return { address: addr.value, args };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OSCManager
// ---------------------------------------------------------------------------

class OSCManager {
  constructor({ vrcIp = "127.0.0.1", vrcSendPort = 9000, listenPort = 9001 } = {}) {
    this.vrcIp = vrcIp;
    this.vrcSendPort = vrcSendPort;
    this.listenPort = listenPort;
    this.socket = null;
    this.onAvatarChange = null;
    this.onParamChange  = null;
    this.running = false;
  }

  start({ onAvatarChange, onParamChange }) {
    if (this.running) return;
    this.onAvatarChange = onAvatarChange;
    this.onParamChange  = onParamChange;

    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (msg) => {
      const packet = decodeOSCMessage(msg);
      if (!packet) return;
      this._handleMessage(packet.address, packet.args);
    });

    this.socket.on("error", (err) => {
      console.error("[OSCManager] Socket error:", err.message);
    });

    this.socket.bind(this.listenPort, "127.0.0.1", () => {
      console.log(`[OSCManager] Listening on UDP port ${this.listenPort}`);
      this.running = true;
    });
  }

  _handleMessage(address, args) {
    if (!args.length) return;
    const { type, value } = args[0];

    if (address === "/avatar/change") {
      if (typeof value === "string" && this.onAvatarChange) {
        this.onAvatarChange(value);
      }
      return;
    }

    if (address.startsWith("/avatar/parameters/")) {
      const paramName = address.slice("/avatar/parameters/".length);
      if (this.onParamChange) {
        // Pass both value AND its OSC type so we can preserve it
        this.onParamChange(paramName, value, type);
      }
    }
  }

  // forceType: "bool" | "int" | "float" | null (auto-detect)
  sendParameter(paramName, value, forceType) {
    if (!this.socket || !this.running) return;
    const address = `/avatar/parameters/${paramName}`;
    try {
      const msg = buildOSCMessage(address, value, forceType || null);
      this.socket.send(msg, this.vrcSendPort, this.vrcIp, (err) => {
        if (err) console.error(`[OSCManager] Send error for '${paramName}':`, err.message);
      });
    } catch (err) {
      console.error(`[OSCManager] Encode error for '${paramName}':`, err.message);
    }
  }

  stop() {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.running = false;
    console.log("[OSCManager] Stopped.");
  }
}

module.exports = OSCManager;